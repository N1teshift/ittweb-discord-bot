# ITT Web Discord Bot

Discord bot for the [ITT Web](https://github.com/N1teshift/ittweb) tournament system.

## Features

- Schedule and manage games via `/games` command
- Monitor Warcraft III lobbies for ITT games (real-time updates)
- Post completed game statistics automatically
- Auto-cleanup of old notification records

## Setup

1. Create a Discord bot and get token/ID from [Discord Developer Portal](https://discord.com/developers/applications)
2. Create `.env` file:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_app_id
ITT_API_BASE=https://your-vercel-app.vercel.app
BOT_API_KEY=your_api_key
FIREBASE_SERVICE_ACCOUNT_KEY=your_firebase_json
FIREBASE_PROJECT_ID=your_project_id

# Optional: Lobby Monitoring
LOBBY_NOTIFICATION_CHANNEL_ID=channel_id
LOBBY_CHECK_INTERVAL=60

# Optional: Completed Games
COMPLETED_GAMES_NOTIFICATION_CHANNEL_ID=channel_id
COMPLETED_GAMES_CHECK_INTERVAL=120
```

3. Install and run:
```bash
npm install
npm start
```

## Deployment

Deploy to Railway or similar platform. Add all environment variables from `.env` file.

## License

MIT
