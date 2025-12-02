# ITT Web Discord Bot

A Discord bot that extends the ITT Web tournament system functionality into Discord, allowing players to schedule, join, and leave games without visiting the website.

## Features

- **/schedule <time>** - Schedule a new 1v1 ELO game (e.g., `/schedule 8pm`, `/schedule tomorrow 3pm`)
- **/games** - List upcoming scheduled games
- **/join <game_id>** - Join a scheduled game
- **/leave <game_id>** - Leave a scheduled game
- **Interactive buttons** - Click to join/leave games directly from Discord messages
- **Auto user creation** - Automatically creates ITT accounts for new Discord users

## Setup

### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Go to "General Information" and copy the Application ID

### 2. Invite Bot to Server

1. In Discord Developer Portal, go to "OAuth2" → "URL Generator"
2. Select scopes: `bot` and `applications.commands`
3. Select permissions: `Send Messages`, `Use Slash Commands`, `Read Message History`
4. Use the generated URL to invite the bot to your server

### 3. Environment Variables

Create a `.env` file in the project root:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
ITT_API_BASE=https://your-vercel-app.vercel.app
DISCORD_GUILD_ID=your_server_id_here (optional, for faster command registration)
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Bot

```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Deployment to Railway

### 1. Create GitHub Repository

1. Create a new repository on GitHub
2. Upload this bot code to the repository

### 2. Deploy to Railway

1. Go to [Railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select the bot repository
4. Add environment variables in Railway dashboard:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `ITT_API_BASE`
   - `DISCORD_GUILD_ID` (optional)

### 3. Railway Configuration

Railway will automatically detect this as a Node.js app and use the `npm start` script.

## API Integration

The bot integrates with your existing ITT Web API endpoints:

- `GET /api/games` - Fetch scheduled games
- `POST /api/games` - Create scheduled games
- `POST /api/games/{id}/join` - Join games
- `POST /api/games/{id}/leave` - Leave games
- `GET /api/games/{id}` - Get game details
- `POST /api/user/create` - Create new users (when needed)

## Time Parsing

The bot supports various time formats:
- `8pm` - 8:00 PM today (or tomorrow if already passed)
- `20:00` - 8:00 PM (24-hour format)
- `tomorrow 3pm` - 3:00 PM tomorrow
- `15:30` - 3:30 PM

All times are converted to UTC for storage.

## Development

### Project Structure

```
src/
  index.js          # Main bot file
package.json        # Dependencies and scripts
README.md          # This file
.env               # Environment variables (create this)
```

### Adding New Commands

1. Add command definition to the `commands` array in `index.js`
2. Register the command in `registerCommands()` function
3. Add command handler in `handleSlashCommand()` function

### Button Interactions

Buttons use custom IDs in format `action_gameId` (e.g., `join_123`, `details_123`).
Add button handling logic in `handleButton()` function.

## Troubleshooting

### Bot Not Responding
- Check if bot is online in Railway dashboard
- Verify DISCORD_TOKEN is correct
- Check Railway logs for errors

### Commands Not Appearing
- Commands take time to register (up to 1 hour globally)
- For faster registration, set DISCORD_GUILD_ID and restart bot

### API Errors
- Check ITT_API_BASE URL is correct
- Verify your Vercel API is accessible
- Check Railway logs for API call errors

## License

MIT
