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
  
  // Run immediately on startup to catch any active lobbies
  checkLobbies();
}

/**
 * Check for new ITT lobbies and send notifications
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

    // Check which lobbies we've already notified about
    const notifiedLobbyIds = await getNotifiedLobbyIds();
    const newLobbies = ittLobbies.filter(lobby => !notifiedLobbyIds.has(lobby.id));

    if (newLobbies.length === 0) {
      logger.info('All ITT lobbies have already been notified');
      return;
    }

    logger.info(`Found ${newLobbies.length} new ITT lobby/lobbies to notify`);

    // Send notifications for new lobbies
    for (const lobby of newLobbies) {
      try {
        const embed = createLobbyEmbed(lobby);
        await channel.send({ embeds: [embed] });
        
        // Mark as notified in Firebase
        await markLobbyAsNotified(lobby.id, lobby);
        
        logger.info(`Notified about ITT lobby: ${lobby.map} (ID: ${lobby.id}, Host: ${lobby.host})`, {
          lobbyId: lobby.id,
          map: lobby.map,
          host: lobby.host,
        });
      } catch (error) {
        logger.error(`Failed to send notification for lobby ${lobby.id}`, error, {
          lobbyId: lobby.id,
          errorMessage: error.message,
        });
      }
    }

  } catch (error) {
    logger.error('Error checking lobbies', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

/**
 * Get set of lobby IDs that have already been notified
 * @returns {Promise<Set<number>>} Set of notified lobby IDs
 */
async function getNotifiedLobbyIds() {
  if (!db || !isInitialized) {
    logger.warn('Firebase not initialized, using in-memory tracking only');
    return new Set();
  }

  try {
    // Get all notified lobbies from the last hour (to avoid storing too much data)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '>=', oneHourAgo)
      .get();

    const notifiedIds = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.lobbyId) {
        notifiedIds.add(data.lobbyId);
      }
    });

    return notifiedIds;
  } catch (error) {
    logger.error('Failed to get notified lobby IDs', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
    return new Set();
  }
}

/**
 * Mark a lobby as notified in Firebase
 * @param {number} lobbyId - Lobby ID
 * @param {Object} lobby - Full lobby object for reference
 */
async function markLobbyAsNotified(lobbyId, lobby) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot mark lobby ${lobbyId} as notified`);
    return;
  }

  try {
    const docId = String(lobbyId);
    await db.collection(COLLECTION_NAME).doc(docId).set({
      lobbyId,
      map: lobby.map,
      host: lobby.host,
      server: lobby.server,
      notifiedAt: Date.now(),
      createdAt: lobby.created ? lobby.created * 1000 : Date.now(),
    });

    logger.debug(`Marked lobby ${lobbyId} as notified in Firebase`);
  } catch (error) {
    logger.error(`Failed to mark lobby ${lobbyId} as notified`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      lobbyId,
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

