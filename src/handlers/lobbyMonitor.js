import { LOBBY_NOTIFICATION_CHANNEL_ID, LOBBY_CHECK_INTERVAL, LOBBY_MONITORING_ENABLED } from '../config.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { fetchActiveLobbies, filterITTGames } from '../services/wc3stats.js';
import { createLobbyEmbed } from '../components/embeds.js';

const COLLECTION_NAME = 'discord_bot_lobby_notifications';
let clientInstance = null;
let lastCheckLogTime = 0;
const CHECK_LOG_INTERVAL_MS = 5 * 60 * 1000; // Log every 5 minutes

/**
 * Initialize the lobby monitoring system
 * @param {Client} client - Discord.js client instance
 */
export function initializeLobbyMonitor(client) {
  clientInstance = client;
  
  if (!LOBBY_MONITORING_ENABLED) {
    logger.info('Lobby monitoring is disabled');
    return;
  }

  if (!LOBBY_NOTIFICATION_CHANNEL_ID) {
    logger.warn('LOBBY_NOTIFICATION_CHANNEL_ID not set - lobby monitoring disabled');
    return;
  }

  const intervalSeconds = LOBBY_CHECK_INTERVAL || 60;
  const intervalMs = intervalSeconds * 1000;

  logger.info(`Lobby monitoring initialized - checking every ${intervalSeconds} seconds`);
  setInterval(checkLobbies, intervalMs);
  
  // Schedule automatic cleanup of old notifications (daily)
  const cleanupIntervalMs = 24 * 60 * 60 * 1000; // 24 hours
  setInterval(cleanupOldNotifications, cleanupIntervalMs);
  logger.info('Lobby notification cleanup scheduled - running daily');
  
  // Run immediately on startup to catch any active lobbies
  checkLobbies();
  
  // Run cleanup once on startup (non-blocking)
  cleanupOldNotifications().catch(err => {
    logger.error('Initial cleanup failed', err);
  });
}

/**
 * Check for new ITT lobbies and send/update notifications
 */
async function checkLobbies() {
  if (!LOBBY_MONITORING_ENABLED || !clientInstance || !LOBBY_NOTIFICATION_CHANNEL_ID) {
    return;
  }

  try {
    // Fetch all active lobbies
    const allLobbies = await fetchActiveLobbies();
    
    // Filter for ITT games
    const ittLobbies = filterITTGames(allLobbies);
    
    if (ittLobbies.length === 0) {
      // Log periodically to confirm the check loop is running
      const now = Date.now();
      if (now - lastCheckLogTime >= CHECK_LOG_INTERVAL_MS) {
        logger.info('Lobby check completed - no ITT lobbies found');
        lastCheckLogTime = now;
      }
      return;
    }

    logger.info(`Found ${ittLobbies.length} ITT lobby/lobbies`);

    // Get channel
    const channel = await clientInstance.channels.fetch(LOBBY_NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      logger.error(`Channel ${LOBBY_NOTIFICATION_CHANNEL_ID} not found`);
      return;
    }

    // Get all active lobby notifications with their message IDs
    const activeNotifications = await getActiveLobbyNotifications();
    const notificationMap = new Map();
    activeNotifications.forEach(notif => {
      notificationMap.set(notif.lobbyId, notif);
    });

    // Process each ITT lobby
    for (const lobby of ittLobbies) {
      try {
        const embed = createLobbyEmbed(lobby);
        const notification = notificationMap.get(lobby.id);

        if (notification && notification.messageId) {
          // Update existing message
          try {
            const message = await channel.messages.fetch(notification.messageId);
            await message.edit({ embeds: [embed] });
            
            // Update Firebase record with latest data
            await updateLobbyNotification(lobby.id, lobby, notification.messageId);
            
            logger.debug(`Updated lobby notification: ${lobby.map} (ID: ${lobby.id}, Slots: ${lobby.slotsTaken}/${lobby.slotsTotal})`, {
              lobbyId: lobby.id,
              messageId: notification.messageId,
            });
          } catch (error) {
            // Message might have been deleted, create a new one
            if (error.code === 10008) { // Unknown Message
              logger.warn(`Message ${notification.messageId} not found, creating new notification for lobby ${lobby.id}`);
              await createNewLobbyNotification(channel, lobby);
            } else {
              throw error;
            }
          }
        } else {
          // Create new notification
          await createNewLobbyNotification(channel, lobby);
        }
      } catch (error) {
        logger.error(`Failed to process lobby ${lobby.id}`, error, {
          lobbyId: lobby.id,
          errorMessage: error.message,
        });
      }
    }

    // Clean up notifications for lobbies that no longer exist
    await cleanupInactiveLobbies(ittLobbies.map(l => l.id));

  } catch (error) {
    logger.error('Error checking lobbies', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

/**
 * Create a new lobby notification message
 * @param {Channel} channel - Discord channel
 * @param {Object} lobby - Lobby object
 */
async function createNewLobbyNotification(channel, lobby) {
  const embed = createLobbyEmbed(lobby);
  const message = await channel.send({ embeds: [embed] });
  
  // Store in Firebase with message ID
  await markLobbyAsNotified(lobby.id, lobby, message.id);
  
  logger.info(`Created new lobby notification: ${lobby.map} (ID: ${lobby.id}, Host: ${lobby.host}, Slots: ${lobby.slotsTaken}/${lobby.slotsTotal})`, {
    lobbyId: lobby.id,
    messageId: message.id,
    map: lobby.map,
    host: lobby.host,
  });
}

/**
 * Get all active lobby notifications with their message IDs
 * @returns {Promise<Array>} Array of notification objects with lobbyId and messageId
 */
async function getActiveLobbyNotifications() {
  if (!db || !isInitialized) {
    logger.warn('Firebase not initialized, using in-memory tracking only');
    return [];
  }

  try {
    // Get all notified lobbies from the last 2 hours (lobbies can last a while)
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '>=', twoHoursAgo)
      .get();

    const notifications = [];
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.lobbyId && data.messageId) {
        notifications.push({
          lobbyId: data.lobbyId,
          messageId: data.messageId,
          ...data
        });
      }
    });

    return notifications;
  } catch (error) {
    logger.error('Failed to get active lobby notifications', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
    return [];
  }
}

/**
 * Mark a lobby as notified in Firebase with message ID
 * @param {number} lobbyId - Lobby ID
 * @param {Object} lobby - Full lobby object for reference
 * @param {string} messageId - Discord message ID
 */
async function markLobbyAsNotified(lobbyId, lobby, messageId) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot mark lobby ${lobbyId} as notified`);
    return;
  }

  try {
    const docId = String(lobbyId);
    await db.collection(COLLECTION_NAME).doc(docId).set({
      lobbyId,
      messageId,
      map: lobby.map,
      host: lobby.host,
      server: lobby.server,
      slotsTaken: lobby.slotsTaken,
      slotsTotal: lobby.slotsTotal,
      notifiedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      createdAt: lobby.created ? lobby.created * 1000 : Date.now(),
    }, { merge: true });

    logger.debug(`Marked lobby ${lobbyId} as notified in Firebase`, { messageId });
  } catch (error) {
    logger.error(`Failed to mark lobby ${lobbyId} as notified`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      lobbyId,
    });
  }
}

/**
 * Update an existing lobby notification in Firebase
 * @param {number} lobbyId - Lobby ID
 * @param {Object} lobby - Full lobby object with updated data
 * @param {string} messageId - Discord message ID
 */
async function updateLobbyNotification(lobbyId, lobby, messageId) {
  if (!db || !isInitialized) {
    return;
  }

  try {
    const docId = String(lobbyId);
    await db.collection(COLLECTION_NAME).doc(docId).update({
      slotsTaken: lobby.slotsTaken,
      slotsTotal: lobby.slotsTotal,
      host: lobby.host,
      lastUpdatedAt: Date.now(),
    });
  } catch (error) {
    logger.error(`Failed to update lobby notification ${lobbyId}`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      lobbyId,
    });
  }
}

/**
 * Clean up notifications for lobbies that no longer exist
 * @param {Array<number>} activeLobbyIds - Array of currently active lobby IDs
 */
async function cleanupInactiveLobbies(activeLobbyIds) {
  if (!db || !isInitialized) {
    return;
  }

  try {
    const activeSet = new Set(activeLobbyIds);
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '>=', twoHoursAgo)
      .get();

    const batch = db.batch();
    let deletedCount = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      // If lobby is no longer active and hasn't been updated recently, mark for deletion
      if (data.lobbyId && !activeSet.has(data.lobbyId)) {
        const lastUpdate = data.lastUpdatedAt || data.notifiedAt;
        // Only delete if last update was more than 5 minutes ago (lobby likely closed)
        if (Date.now() - lastUpdate > 5 * 60 * 1000) {
          batch.delete(doc.ref);
          deletedCount++;
        }
      }
    });

    if (deletedCount > 0) {
      await batch.commit();
      logger.info(`Cleaned up ${deletedCount} inactive lobby notification(s)`);
    }
  } catch (error) {
    logger.error('Failed to cleanup inactive lobbies', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

/**
 * Clean up old notification records (optional maintenance function)
 * Can be called periodically to remove old entries
 */
export async function cleanupOldNotifications() {
  if (!db || !isInitialized) {
    return;
  }

  try {
    // Delete notifications older than 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '<', oneDayAgo)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    logger.info(`Cleaned up ${snapshot.docs.length} old lobby notification records`);
  } catch (error) {
    logger.error('Failed to cleanup old notifications', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

