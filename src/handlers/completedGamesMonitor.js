import { COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID, COMPLETED_GAMES_CHECK_INTERVAL, COMPLETED_GAMES_MONITORING_ENABLED } from '../config.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';
import { getCompletedGames } from '../api.js';
import { createCompletedGameEmbed } from '../components/embeds.js';

const COLLECTION_NAME = 'discord_bot_completed_game_notifications';
let clientInstance = null;
let lastCheckLogTime = 0;
const CHECK_LOG_INTERVAL_MS = 5 * 60 * 1000; // Log every 5 minutes

/**
 * Initialize the completed games monitoring system
 * @param {Client} client - Discord.js client instance
 */
export function initializeCompletedGamesMonitor(client) {
  clientInstance = client;
  
  if (!COMPLETED_GAMES_MONITORING_ENABLED) {
    logger.info('Completed games monitoring is disabled');
    return;
  }

  if (!COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID) {
    logger.warn('COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID not set - completed games monitoring disabled');
    return;
  }

  const intervalSeconds = COMPLETED_GAMES_CHECK_INTERVAL || 120; // Default: 2 minutes
  const intervalMs = intervalSeconds * 1000;

  logger.info(`Completed games monitoring initialized - checking every ${intervalSeconds} seconds`);
  setInterval(checkCompletedGames, intervalMs);
  
  // Schedule automatic cleanup of old notifications (weekly)
  const cleanupIntervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  setInterval(cleanupOldCompletedGameNotifications, cleanupIntervalMs);
  logger.info('Completed game notification cleanup scheduled - running weekly');
  
  // Run immediately on startup to catch any recently completed games
  checkCompletedGames();
  
  // Run cleanup once on startup (non-blocking)
  cleanupOldCompletedGameNotifications().catch(err => {
    logger.error('Initial cleanup failed', err);
  });
}

/**
 * Check for new completed games and send notifications
 */
async function checkCompletedGames() {
  if (!COMPLETED_GAMES_MONITORING_ENABLED || !clientInstance || !COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID) {
    return;
  }

  try {
    // Fetch recently completed games (limit to last 10)
    const completedGames = await getCompletedGames(10);
    
    if (completedGames.length === 0) {
      // Log periodically to confirm the check loop is running
      const now = Date.now();
      if (now - lastCheckLogTime >= CHECK_LOG_INTERVAL_MS) {
        logger.info('Completed games check - no new games found');
        lastCheckLogTime = now;
      }
      return;
    }

    logger.info(`Found ${completedGames.length} completed game(s)`);

    // Get channel
    const channel = await clientInstance.channels.fetch(COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID);
    if (!channel) {
      logger.error(`Channel ${COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID} not found`);
      return;
    }

    // Get games we've already notified about
    const notifiedGameIds = await getNotifiedGameIds();
    
    // Filter for new games
    const newGames = completedGames.filter(game => {
      const gameId = game.gameId || game.id;
      return gameId && !notifiedGameIds.has(String(gameId));
    });

    if (newGames.length === 0) {
      logger.info('All completed games have already been notified');
      return;
    }

    logger.info(`Found ${newGames.length} new completed game(s) to notify`);

    // Send notifications for new games (oldest first to maintain chronological order)
    const sortedNewGames = newGames.sort((a, b) => {
      const parseDate = (dateValue) => {
        if (!dateValue) return 0;
        if (dateValue && typeof dateValue.toDate === 'function') {
          return dateValue.toDate().getTime();
        }
        if (dateValue && typeof dateValue.seconds === 'number') {
          return dateValue.seconds * 1000 + (dateValue.nanoseconds || 0) / 1000000;
        }
        if (typeof dateValue === 'number') {
          return dateValue < 946684800000 ? dateValue * 1000 : dateValue;
        }
        if (typeof dateValue === 'string') {
          const parsed = new Date(dateValue).getTime();
          return isNaN(parsed) ? 0 : parsed;
        }
        return 0;
      };
      
      const dateA = parseDate(a.datetime || a.createdAt);
      const dateB = parseDate(b.datetime || b.createdAt);
      return dateA - dateB;
    });

    for (const game of sortedNewGames) {
      try {
        // Log game data structure for debugging if there's an issue
        const gameId = game.gameId || game.id;
        logger.debug(`Processing game ${gameId}`, {
          gameId,
          hasDatetime: !!game.datetime,
          hasCreatedAt: !!game.createdAt,
          datetimeType: game.datetime ? typeof game.datetime : 'undefined',
          createdAtType: game.createdAt ? typeof game.createdAt : 'undefined',
        });
        
        const embed = createCompletedGameEmbed(game);
        await channel.send({ embeds: [embed] });
        
        // Mark as notified in Firebase
        await markGameAsNotified(gameId, game);
        
        logger.info(`Notified about completed game: #${gameId} (${game.gamename || 'Unnamed'})`, {
          gameId,
          gameName: game.gamename,
          category: game.category,
          playerCount: game.playerCount || (game.players || []).length,
        });
      } catch (error) {
        logger.error(`Failed to send notification for game ${game.gameId || game.id}`, error, {
          gameId: game.gameId || game.id,
          errorMessage: error.message,
          errorStack: error.stack,
          gameData: {
            hasDatetime: !!game.datetime,
            hasCreatedAt: !!game.createdAt,
            datetimeValue: game.datetime,
            createdAtValue: game.createdAt,
          },
        });
      }
    }

  } catch (error) {
    logger.error('Error checking completed games', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

/**
 * Get set of game IDs that have already been notified
 * @returns {Promise<Set<string>>} Set of notified game IDs
 */
async function getNotifiedGameIds() {
  if (!db || !isInitialized) {
    logger.warn('Firebase not initialized, using in-memory tracking only');
    return new Set();
  }

  try {
    // Get all notified games from the last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '>=', oneDayAgo)
      .get();

    const notifiedIds = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.gameId) {
        notifiedIds.add(String(data.gameId));
      }
    });

    return notifiedIds;
  } catch (error) {
    logger.error('Failed to get notified game IDs', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
    return new Set();
  }
}

/**
 * Mark a game as notified in Firebase
 * @param {string|number} gameId - Game ID
 * @param {Object} game - Full game object for reference
 */
async function markGameAsNotified(gameId, game) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot mark game ${gameId} as notified`);
    return;
  }

  try {
    const docId = String(gameId);
    await db.collection(COLLECTION_NAME).doc(docId).set({
      gameId: docId,
      gameName: game.gamename,
      category: game.category,
      map: game.map,
      playerCount: game.playerCount || (game.players || []).length,
      notifiedAt: Date.now(),
      completedAt: game.datetime ? new Date(game.datetime).getTime() : Date.now(),
    }, { merge: true });

    logger.debug(`Marked game ${gameId} as notified in Firebase`);
  } catch (error) {
    logger.error(`Failed to mark game ${gameId} as notified`, error, {
      errorCode: error.code,
      errorMessage: error.message,
      gameId,
    });
  }
}

/**
 * Clean up old notification records (optional maintenance function)
 * Can be called periodically to remove old entries
 */
export async function cleanupOldCompletedGameNotifications() {
  if (!db || !isInitialized) {
    return;
  }

  try {
    // Delete notifications older than 7 days
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('notifiedAt', '<', sevenDaysAgo)
      .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    logger.info(`Cleaned up ${snapshot.docs.length} old completed game notification records`);
  } catch (error) {
    logger.error('Failed to cleanup old completed game notifications', error, {
      errorCode: error.code,
      errorMessage: error.message,
    });
  }
}

