import { REMINDER_MINUTES_BEFORE, MAX_REMINDER_WINDOW_MS } from '../config.js';

// In-memory reminder registry (lost when bot restarts)
const reminderRegistry = new Map();

let clientInstance = null;

export function setClient(client) {
  clientInstance = client;
}

export function scheduleReminderForGame(userId, game) {
  if (!clientInstance) {
    console.error('Client not set for reminders');
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

    const gameId = game.gameId || game.id;
    if (!gameId) return;

    const key = String(userId);
    const existing = reminderRegistry.get(key) || [];
    existing.push({
      gameId: String(gameId),
      gameTimeMs,
      reminderTimeMs,
    });
    reminderRegistry.set(key, existing);

    setTimeout(async () => {
      try {
        const user = await clientInstance.users.fetch(userId);
        const gid = game.gameId || game.id || 'unknown';
        await user.send(`⏰ Reminder: Game #${gid} starts in ${REMINDER_MINUTES_BEFORE} minutes.`);

        const list = reminderRegistry.get(key) || [];
        reminderRegistry.set(
          key,
          list.filter((r) => r.gameId !== String(gid))
        );
      } catch (err) {
        console.error('Failed to send reminder DM', err);
      }
    }, delayMs);
  } catch (err) {
    console.error('Failed to schedule reminder', err);
  }
}

