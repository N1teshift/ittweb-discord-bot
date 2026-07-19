# ITT Web Discord Bot

## Features

- Schedule and manage games via `/games` command in Discord
- Monitor Warcraft III lobbies for ITT games (real-time updates)
- Post completed game statistics automatically

## Add the bot to your Discord server

If you own or administer a Discord server and want this bot there:

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and select the bot application (or ask the bot owner for the **Application ID** / invite link).
2. Go to **OAuth2 → URL Generator**.
3. Under **Scopes**, enable:
   - `bot`
   - `applications.commands`
4. Under **Bot Permissions**, enable at least:
   - View Channels
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Application Commands
5. Copy the generated URL at the bottom, open it in your browser, choose your server, and authorize.
6. In Discord, create or pick the channel where lobby and completed-game posts should appear.
7. Right-click the channel → **Copy Channel ID** (enable **Developer Mode** under Discord Settings → Advanced if you don’t see that option).
8. Give that channel ID to whoever runs the bot so they can set `NOTIFICATION_CHANNEL_ID`.

You need **Manage Server** (or Administrator) permission on the target server to add a bot.

### Ready-made invite link (template)

Replace `YOUR_APPLICATION_ID` with the bot’s Application ID from the Developer Portal:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=277025770560&scope=bot%20applications.commands
```

That `permissions` value covers the permissions listed above.

## Setup (bot operators)

1. Create a Discord bot and get token/ID from [Discord Developer Portal](https://discord.com/developers/applications)
2. Create `.env` file:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_app_id
ITT_API_BASE=https://websites-ittweb.vercel.app
BOT_API_KEY=your_api_key
FIREBASE_SERVICE_ACCOUNT_KEY=your_firebase_json
FIREBASE_PROJECT_ID=your_project_id

# Optional: notifications (lobbies + completed games)
NOTIFICATION_CHANNEL_ID=channel_id
LOBBY_CHECK_INTERVAL=60
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
