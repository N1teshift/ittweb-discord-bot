import { REMINDER_MINUTES_BEFORE, MAX_REMINDER_WINDOW_MS, REMINDERS_ENABLED } from '../config.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';

const COLLECTION_NAME = 'discord_bot_reminders';
let clientInstance = null;

export function setClient(client) {
  clientInstance = client;
  // Initialize reminder check loop only if reminders are enabled
  if (REMINDERS_ENABLED) {
    setInterval(checkReminders, 60 * 1000); // Check every minute
  }
}

export async function scheduleReminderForGame(userId, game) {
  if (!db || !isInitialized) {
    logger.warn(`Firebase not initialized, cannot schedule reminder for user ${userId}`);
    return;
  }

  try {
    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    if (!rawDate) return;

    const gameTimeMs = new Date(rawDate).getTime();
    const nowMs = Date.now();

    const reminderTimeMs = gameTimeMs - REMINDER_MINUTES_BEFORE * 60 * 1000;
    const delayMs = reminderTimeMs - nowMs;

    if (delayMs <= 0 || delayMs > MAX_REMINDER_WINDOW_MS) {
      return;
    }

    const gameId = String(game.gameId || game.id);
    const reminderId = `${userId}_${gameId}`;

    await db.collection(COLLECTION_NAME).doc(reminderId).set({
      userId,
      gameId,
      gameTimeMs,
      reminderTimeMs,
      status: 'pending'
    });

    logger.info(`Scheduled reminder for user ${userId} game ${gameId}`);

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

    if (snapshot.empty) return;

    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        const user = await clientInstance.users.fetch(data.userId);
        await user.send(`⏰ Reminder: Game #${data.gameId} starts in ${REMINDER_MINUTES_BEFORE} minutes.`);

        batch.update(doc.ref, { status: 'sent', sentAt: now });
      } catch (err) {
        logger.error(`Failed to send reminder to ${data.userId}`, err);
        // Mark as failed so we don't retry forever
        batch.update(doc.ref, { status: 'failed', error: err.message });
      }
    }

    await batch.commit();

  } catch (error) {
    logger.error('Error checking reminders', error, {
      errorCode: error.code,
      errorMessage: error.message
    });
  }
}

