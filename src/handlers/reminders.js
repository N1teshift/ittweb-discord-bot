import { REMINDER_MINUTES_BEFORE, MAX_REMINDER_WINDOW_MS, REMINDERS_ENABLED } from '../config.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'discord_bot_reminders';
let clientInstance = null;
let lastCheckLogTime = 0;
const CHECK_LOG_INTERVAL_MS = 5 * 60 * 1000; // Log every 5 minutes

export function setClient(client) {
  clientInstance = client;
  // Initialize reminder check loop only if reminders are enabled
  if (REMINDERS_ENABLED) {
    logger.info('Reminder check loop initialized - checking every 60 seconds');
    setInterval(checkReminders, 60 * 1000); // Check every minute
    // Run immediately on startup to catch any overdue reminders
    checkReminders();
  } else {
    logger.info('Reminders are disabled');
  }
}

export async function scheduleReminderForGame(userId, game, reminderMinutesBefore = null) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot schedule reminder for user ${userId}`);
    return;
  }

  try {
    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    if (!rawDate) return;

    const gameTimeMs = new Date(rawDate).getTime();
    const nowMs = Date.now();

    // Use custom reminder time if provided, otherwise use default
    const minutesBefore = reminderMinutesBefore !== null ? reminderMinutesBefore : REMINDER_MINUTES_BEFORE;
    const reminderTimeMs = gameTimeMs - minutesBefore * 60 * 1000;
    const delayMs = reminderTimeMs - nowMs;

    if (delayMs <= 0 || delayMs > MAX_REMINDER_WINDOW_MS) {
      if (delayMs <= 0) {
        logger.warn(`Reminder time has already passed for user ${userId} game ${game.gameId || game.id} (reminder was ${new Date(reminderTimeMs).toISOString()}, now is ${new Date(nowMs).toISOString()})`);
      } else {
        logger.info(`Reminder too far in future for user ${userId} game ${game.gameId || game.id} (${Math.round(delayMs / 1000 / 60)} minutes, max is ${MAX_REMINDER_WINDOW_MS / 1000 / 60} minutes)`);
      }
      return;
    }

    const gameId = String(game.gameId || game.id);
    const reminderId = `${userId}_${gameId}`;

    await db.collection(COLLECTION_NAME).doc(reminderId).set({
      userId,
      gameId,
      gameTimeMs,
      reminderTimeMs,
      reminderMinutesBefore: minutesBefore,
      status: 'pending'
    });

    logger.info(`Scheduled reminder for user ${userId} game ${gameId} (${minutesBefore} minutes before)`);

  } catch (err) {
    logger.error('Failed to schedule reminder', err);
  }
}

async function checkReminders() {
  if (!REMINDERS_ENABLED || !clientInstance || !db || !isInitialized) {
    return;
  }

  try {
    const now = Date.now();
    const snapshot = await db.collection(COLLECTION_NAME)
      .where('status', '==', 'pending')
      .where('reminderTimeMs', '<=', now)
      .get();

    if (snapshot.empty) {
      // Log periodically to confirm the check loop is running
      if (now - lastCheckLogTime >= CHECK_LOG_INTERVAL_MS) {
        logger.info('Reminder check completed - no pending reminders due');
        lastCheckLogTime = now;
      }
      return;
    }

    logger.info(`Found ${snapshot.docs.length} reminder(s) due to be sent`);

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        const user = await clientInstance.users.fetch(data.userId);
        const minutesBefore = data.reminderMinutesBefore || REMINDER_MINUTES_BEFORE;
        await user.send(`⏰ Reminder: Game #${data.gameId} starts in ${minutesBefore} minute${minutesBefore !== 1 ? 's' : ''}.`);

        batch.update(doc.ref, { status: 'sent', sentAt: now });
        logger.info(`Reminder sent to user ${user.username} (${data.userId}) for game #${data.gameId}`, {
          userId: data.userId,
          gameId: data.gameId,
          minutesBefore,
        });
      } catch (err) {
        logger.error(`Failed to send reminder to ${data.userId}`, err);
        // Mark as failed so we don't retry forever
        batch.update(doc.ref, { status: 'failed', error: err.message });
      }
    }

    await batch.commit();

  } catch (error) {
    // Check if it's the Firebase index error
    if (error.code === 9 || error.message?.includes('index') || error.message?.includes('FAILED_PRECONDITION')) {
      logger.error('Error checking reminders - Firebase index required!', {
        errorCode: error.code,
        errorMessage: error.message,
        hint: 'You need to create a composite index on discord_bot_reminders collection with fields: status (Ascending), reminderTimeMs (Ascending)'
      });
    } else {
      logger.error('Error checking reminders', error, {
        errorCode: error.code,
        errorMessage: error.message
      });
    }
  }
}

