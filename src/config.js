// Configuration from environment variables
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
export const ITT_API_BASE = process.env.ITT_API_BASE || 'https://your-vercel-app.vercel.app';
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;
export const BOT_API_KEY = process.env.BOT_API_KEY;

// Reminder settings (disabled)
export const REMINDERS_ENABLED = false;
export const REMINDER_MINUTES_BEFORE = 10;
export const MAX_REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// Configuration options for dropdowns
export const TEAM_SIZE_OPTIONS = [
  { label: '1v1', value: '1v1', description: '2 players total' },
  { label: '2v2', value: '2v2', description: '4 players total' },
  { label: '3v3', value: '3v3', description: '6 players total' },
  { label: '4v4', value: '4v4', description: '8 players total' },
  { label: '5v5', value: '5v5', description: '10 players total' },
  { label: '6v6', value: '6v6', description: '12 players total' },
];

export const GAME_TYPE_OPTIONS = [
  { label: 'Normal', value: 'normal', description: 'Standard casual game' },
  { label: 'Elo', value: 'elo', description: 'Ranked game affecting Elo rating' },
];

export const GAME_VERSION_OPTIONS = [
  { label: 'v3.28', value: 'v3.28', description: 'Latest stable version' },
  { label: 'v3.27', value: 'v3.27', description: 'Previous version' },
  { label: 'v3.26', value: 'v3.26', description: 'Older version' },
];

