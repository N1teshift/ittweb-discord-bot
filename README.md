# ITT Web Discord Bot

> Date: 2025-12-03

A Discord bot that extends the ITT Web tournament system functionality into Discord, allowing players to schedule, join, and leave games without visiting the website.

## Related Project

This Discord bot integrates with the **[ITT Web](https://github.com/N1teshift/ittweb)** tournament management system. Discord users are automatically linked to ITT Web accounts, and all game operations use the ITT Web API.

## Features

- Browse and schedule games via `/games` command
- Interactive buttons to join/leave games
- Auto-creates ITT accounts for new Discord users
- **NEW**: Monitors Warcraft III lobbies and notifies when Island Troll Tribes games are found

## Setup

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications) and copy the token and Application ID
2. Invite the bot using OAuth2 URL Generator with scopes: `bot`, `applications.commands` and permissions: `Send Messages`, `Use Slash Commands`, `Read Message History`
3. Create a `.env` file:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
ITT_API_BASE=https://your-vercel-app.vercel.app
DISCORD_GUILD_ID=your_server_id_here (optional)
BOT_API_KEY=your_api_key_here

# Lobby Monitoring (Optional)
LOBBY_MONITORING_ENABLED=true
LOBBY_NOTIFICATION_CHANNEL_ID=your_channel_id_here
LOBBY_CHECK_INTERVAL=60
WC3STATS_API_BASE=https://api.wc3stats.com
```

4. Install dependencies and run:
```bash
npm install
npm start
```

For development: `npm run dev`

## Deployment to Railway

1. Push the code to a GitHub repository
2. In [Railway.app](https://railway.app), create a new project and deploy from GitHub
3. Add environment variables: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `ITT_API_BASE`, `BOT_API_KEY`, and optionally `DISCORD_GUILD_ID`
4. For lobby monitoring, also add: `LOBBY_NOTIFICATION_CHANNEL_ID` (required), `LOBBY_CHECK_INTERVAL` (optional, default: 60), `LOBBY_MONITORING_ENABLED` (optional, default: true)

Railway will automatically detect this as a Node.js app.

## License

MIT
