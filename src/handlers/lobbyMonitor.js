import { NOTIFICATION_CHANNEL_ID, LOBBY_CHECK_INTERVAL, LOBBY_MONITORING_ENABLED } from '../config.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { fetchActiveLobbies, filterITTGames } from '../services/wc3stats.js';
import { cancelLobbyGame, createDiscordLobbyGame, getGameById } from '../api.js';
import {
  createLobbyEmbed,
  createLobbyComponents,
  createEndedLobbyShareEmbed,
  extractMapVersion,
  getGameShareUrl,
} from '../components/embeds.js';
import { suppressCompletedGameNotification } from './completedGamesMonitor.js';

const COLLECTION_NAME = 'discord_bot_lobby_notifications';
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — covers STARTED awaiting upload
const OPEN_RETENTION_MS = 24 * 60 * 60 * 1000;
const STARTED_ENDED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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

  if (!NOTIFICATION_CHANNEL_ID) {
    logger.warn('NOTIFICATION_CHANNEL_ID not set - lobby monitoring disabled');
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
  if (!LOBBY_MONITORING_ENABLED || !clientInstance || !NOTIFICATION_CHANNEL_ID) {
    return;
  }

  try {
    // Fetch all active lobbies
    const allLobbies = await fetchActiveLobbies();
    
    // Filter for ITT games
    const ittLobbies = filterITTGames(allLobbies);

    // Get channel
    const channel = await clientInstance.channels.fetch(NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      logger.error(`Channel ${NOTIFICATION_CHANNEL_ID} not found`);
      return;
    }

    // Get all active lobby notifications with their message IDs
    const activeNotifications = await getActiveLobbyNotifications();
    const notificationMap = new Map();
    activeNotifications.forEach(notif => {
      // Normalize IDs so number/string mismatches don't miss updates
      notificationMap.set(Number(notif.lobbyId), notif);
    });

    if (ittLobbies.length === 0) {
      // Still flip OPEN posts to STARTED when the gamelist is empty
      await markMissingLobbiesAsStarted(channel, activeNotifications, []);
      await checkStartedLobbiesForEnded(channel, activeNotifications);

      // Log periodically to confirm the check loop is running
      const now = Date.now();
      if (now - lastCheckLogTime >= CHECK_LOG_INTERVAL_MS) {
        logger.info('Lobby check completed - no ITT lobbies found');
        lastCheckLogTime = now;
      }
      return;
    }

    logger.info(`Found ${ittLobbies.length} ITT lobby/lobbies`);

    // Process each ITT lobby
    for (const lobby of ittLobbies) {
      try {
        const notification = notificationMap.get(Number(lobby.id));

        // Never overwrite a finished ENDED post
        if (notification?.state === 'ENDED') {
          continue;
        }

        const embed = createLobbyEmbed(lobby, 'OPEN');

        if (notification && notification.messageId) {
          // Update existing message (including re-opening a previously STARTED lobby)
          try {
            const message = await channel.messages.fetch(notification.messageId);
            await message.edit({ embeds: [embed], components: [] });
            
            // Update Firebase record with latest data
            await updateLobbyNotification(lobby.id, lobby, notification.messageId, 'OPEN');
            
            logger.debug(`Updated lobby notification: ${lobby.map} (ID: ${lobby.id}, Slots: ${lobby.slotsTaken}/${lobby.slotsTotal})`, {
              lobbyId: lobby.id,
              messageId: notification.messageId,
              state: 'OPEN',
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

    // Mark lobbies that left the gamelist as STARTED
    await markMissingLobbiesAsStarted(channel, activeNotifications, ittLobbies.map(l => l.id));
    // Poll linked ittweb games for completed uploads → ENDED
    await checkStartedLobbiesForEnded(channel, activeNotifications);

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
  const embed = createLobbyEmbed(lobby, 'OPEN');
  const message = await channel.send({ embeds: [embed], components: [] });
  
  // Store in Firebase with message ID
  await markLobbyAsNotified(lobby.id, lobby, message.id);
  
  logger.info(`Created new lobby notification: ${lobby.map} (ID: ${lobby.id}, Host: ${lobby.host}, Slots: ${lobby.slotsTaken}/${lobby.slotsTotal})`, {
    lobbyId: lobby.id,
    messageId: message.id,
    map: lobby.map,
    host: lobby.host,
    state: 'OPEN',
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
    const windowStart = Date.now() - ACTIVE_WINDOW_MS;
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '>=', windowStart)
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
      name: lobby.name || null,
      map: lobby.map,
      host: lobby.host,
      server: lobby.server,
      slotsTaken: lobby.slotsTaken,
      slotsTotal: lobby.slotsTotal,
      state: 'OPEN',
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
 * @param {'OPEN'|'STARTED'|'ENDED'} [state='OPEN'] - Lobby lifecycle state
 */
async function updateLobbyNotification(lobbyId, lobby, messageId, state = 'OPEN') {
  if (!db || !isInitialized) {
    return;
  }

  try {
    const docId = String(lobbyId);
    await db.collection(COLLECTION_NAME).doc(docId).update({
      name: lobby.name || null,
      map: lobby.map,
      slotsTaken: lobby.slotsTaken,
      slotsTotal: lobby.slotsTotal,
      host: lobby.host,
      server: lobby.server,
      messageId,
      state,
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
 * Build a lobby snapshot from a Firebase notification record
 * @param {Object} notification - Stored notification data
 * @returns {Object} Lobby-shaped object for embeds
 */
function lobbyFromNotification(notification) {
  return {
    id: notification.lobbyId,
    name: notification.name,
    map: notification.map,
    host: notification.host,
    server: notification.server,
    slotsTaken: notification.slotsTaken,
    slotsTotal: notification.slotsTotal,
    created: notification.createdAt ? notification.createdAt / 1000 : undefined,
  };
}

/**
 * Create (or retry) the linked awaiting_replay game on ittweb
 * @param {Object} notification
 * @param {Object} lobby
 * @returns {Promise<{ id: string, gameId: number }|null>}
 */
async function ensureDiscordLobbyGame(notification, lobby) {
  if (notification.ittGameDocumentId) {
    return {
      id: notification.ittGameDocumentId,
      gameId: notification.ittGameId,
    };
  }

  try {
    const created = await createDiscordLobbyGame({
      discordChannelId: NOTIFICATION_CHANNEL_ID,
      discordMessageId: notification.messageId,
      wc3statsLobbyId: Number(notification.lobbyId),
      host: lobby.host || notification.host,
      map: lobby.map || notification.map,
      server: lobby.server || notification.server,
      gameVersion: extractMapVersion(lobby.map || notification.map),
      gameName: lobby.name || notification.name,
    });
    return created;
  } catch (error) {
    logger.error(`Failed to create ittweb game for lobby ${notification.lobbyId}`, error, {
      lobbyId: notification.lobbyId,
      messageId: notification.messageId,
      errorMessage: error.message,
    });
    return null;
  }
}

/**
 * When a lobby disappears from the gamelist, mark its Discord post as STARTED
 * @param {Channel} channel - Discord notification channel
 * @param {Array} activeNotifications - Recent notification records
 * @param {Array<number>} activeLobbyIds - Currently open lobby IDs
 */
async function markMissingLobbiesAsStarted(channel, activeNotifications, activeLobbyIds) {
  const activeSet = new Set(activeLobbyIds.map(id => Number(id)));

  for (const notification of activeNotifications) {
    const lobbyId = Number(notification.lobbyId);
    if (!lobbyId || activeSet.has(lobbyId)) {
      continue;
    }

    if (notification.state === 'ENDED') {
      continue;
    }

    // Already STARTED with a linked game — leave for ENDED poll
    if (notification.state === 'STARTED' && notification.ittGameDocumentId) {
      continue;
    }

    if (!notification.messageId) {
      continue;
    }

    try {
      const lobby = lobbyFromNotification(notification);
      const linkedGame = await ensureDiscordLobbyGame(notification, lobby);
      const ittGameDocumentId = linkedGame?.id || null;
      const components = createLobbyComponents('STARTED', ittGameDocumentId);
      const embed = createLobbyEmbed(lobby, 'STARTED');
      const message = await channel.messages.fetch(notification.messageId);
      await message.edit({ embeds: [embed], components });

      if (db && isInitialized) {
        const update = {
          state: 'STARTED',
          startedAt: notification.startedAt || Date.now(),
          lastUpdatedAt: Date.now(),
        };
        if (linkedGame) {
          update.ittGameDocumentId = linkedGame.id;
          update.ittGameId = linkedGame.gameId ?? null;
        }
        await db.collection(COLLECTION_NAME).doc(String(lobbyId)).update(update);
      }

      // Keep in-memory notification in sync for the ENDED poll in the same cycle
      notification.state = 'STARTED';
      if (linkedGame) {
        notification.ittGameDocumentId = linkedGame.id;
        notification.ittGameId = linkedGame.gameId;
      }

      logger.info(`Marked lobby as STARTED: ${notification.map || 'unknown'} (ID: ${lobbyId})`, {
        lobbyId,
        messageId: notification.messageId,
        state: 'STARTED',
        ittGameDocumentId,
      });
    } catch (error) {
      // Message deleted — drop the Firebase record so we don't keep retrying
      if (error.code === 10008 && db && isInitialized) {
        try {
          await db.collection(COLLECTION_NAME).doc(String(lobbyId)).delete();
        } catch (deleteError) {
          logger.error(`Failed to delete missing lobby notification ${lobbyId}`, deleteError);
        }
        continue;
      }

      logger.error(`Failed to mark lobby ${lobbyId} as STARTED`, error, {
        lobbyId,
        messageId: notification.messageId,
        errorMessage: error.message,
      });
    }
  }
}

/**
 * Poll STARTED lobbies with linked ittweb games; flip to ENDED when completed
 * @param {Channel} channel
 * @param {Array} activeNotifications
 */
async function markLobbyStale(channel, notification, lobbyId, description) {
  try {
    const message = await channel.messages.fetch(notification.messageId);
    const embed = createLobbyEmbed(
      { map: notification.map, id: lobbyId, slotsTaken: 0, slotsTotal: 0 },
      'ENDED'
    );
    embed.data.description = description || '⚠️ Game data is no longer available (removed from ITT). Marked as finished.';
    await message.edit({ embeds: [embed], components: [] });
  } catch (editError) {
    if (editError.code !== 10008) {
      logger.error(`Failed to mark lobby ${lobbyId} stale`, editError);
    }
  }

  if (db && isInitialized) {
    await db.collection(COLLECTION_NAME).doc(String(lobbyId)).update({
      state: 'ENDED',
      endedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      stale: true,
    });
  }
  notification.state = 'ENDED';
}

async function checkStartedLobbiesForEnded(channel, activeNotifications) {
  for (const notification of activeNotifications) {
    if (notification.state !== 'STARTED' || !notification.ittGameDocumentId || !notification.messageId) {
      continue;
    }

    const lobbyId = Number(notification.lobbyId);

    try {
      let game;
      try {
        game = await getGameById(notification.ittGameDocumentId);
      } catch (fetchError) {
        // ponytail: game vanished from the ITT API (deleted/old) — stop polling, mark stale
        logger.warn(`Game ${notification.ittGameDocumentId} not fetchable for lobby ${lobbyId}, marking stale`, {
          lobbyId,
          ittGameDocumentId: notification.ittGameDocumentId,
          errorMessage: fetchError.message,
        });
        await markLobbyStale(channel, notification, lobbyId);
        continue;
      }
      if (!game || game.gameState !== 'completed') {
        // ponytail: 6-hour timeout for abandoned lobbies, upgrade to global timeout if false positives appear
        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
        const startedAt = notification.startedAt || 0;
        if (startedAt && Date.now() - startedAt > SIX_HOURS_MS) {
          try {
            await cancelLobbyGame(notification.ittGameDocumentId);
          } catch (cancelError) {
            logger.warn(`cancel-bot failed for lobby ${lobbyId}, marking stale anyway`, {
              lobbyId,
              ittGameDocumentId: notification.ittGameDocumentId,
              errorMessage: cancelError.message,
            });
          }
          try {
            const message = await channel.messages.fetch(notification.messageId);
            await message.delete();
          } catch (deleteError) {
            if (deleteError.code !== 10008) {
              logger.error(`Failed to delete abandoned lobby message ${lobbyId}`, deleteError);
            }
          }
          if (db && isInitialized) {
            await db.collection(COLLECTION_NAME).doc(String(lobbyId)).delete();
          }
          notification.state = 'ENDED';
          logger.info(`Deleted abandoned lobby post (timeout >6h): ${notification.map || 'unknown'} (ID: ${lobbyId})`, { lobbyId });
          continue;
        }
        continue;
      }

      // Replace lobby card with ittweb share-link style (OG image + share URL)
      const shareUrl = getGameShareUrl(notification.ittGameDocumentId);
      const embed = createEndedLobbyShareEmbed(game);
      const message = await channel.messages.fetch(notification.messageId);
      await message.edit({
        content: shareUrl,
        embeds: [embed],
        components: [],
      });

      if (db && isInitialized) {
        await db.collection(COLLECTION_NAME).doc(String(lobbyId)).update({
          state: 'ENDED',
          endedAt: Date.now(),
          lastUpdatedAt: Date.now(),
        });
      }

      notification.state = 'ENDED';

      // Prevent the completed-games monitor from posting the old stats embed
      const completedGameId = game.gameId || game.id;
      if (completedGameId) {
        await suppressCompletedGameNotification(completedGameId, game);
      }

      logger.info(`Marked lobby as ENDED (share card): ${notification.map || 'unknown'} (ID: ${lobbyId})`, {
        lobbyId,
        messageId: notification.messageId,
        ittGameDocumentId: notification.ittGameDocumentId,
        shareUrl,
        state: 'ENDED',
      });
    } catch (error) {
      if (error.code === 10008 && db && isInitialized) {
        try {
          await db.collection(COLLECTION_NAME).doc(String(lobbyId)).delete();
        } catch (deleteError) {
          logger.error(`Failed to delete missing lobby notification ${lobbyId}`, deleteError);
        }
        continue;
      }

      logger.error(`Failed to check ENDED for lobby ${lobbyId}`, error, {
        lobbyId,
        ittGameDocumentId: notification.ittGameDocumentId,
        errorMessage: error.message,
      });
    }
  }
}

/**
 * Clean up old notification records
 * OPEN: 24h; STARTED/ENDED: 7 days
 */
export async function cleanupOldNotifications() {
  if (!db || !isInitialized) {
    return;
  }

  try {
    const now = Date.now();
    const openCutoff = now - OPEN_RETENTION_MS;
    const startedEndedCutoff = now - STARTED_ENDED_RETENTION_MS;
    // Query a wide window; filter by state in memory
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '<', openCutoff)
      .get();

    const batch = db.batch();
    let deletedCount = 0;

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const state = data.state || 'OPEN';
      const notifiedAt = data.notifiedAt || 0;

      const shouldDelete =
        state === 'OPEN'
          ? notifiedAt < openCutoff
          : notifiedAt < startedEndedCutoff;

      if (shouldDelete) {
        batch.delete(doc.ref);
        deletedCount++;
      }
    });

    if (deletedCount > 0) {
      await batch.commit();
    }
    logger.info(`Cleaned up ${deletedCount} old lobby notification records`);
  } catch (error) {
    logger.error('Failed to cleanup old notifications', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}
