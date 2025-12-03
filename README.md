# ITT Web Discord Bot

> Date: 2025-12-03

A Discord bot that extends the ITT Web tournament system functionality into Discord, allowing players to schedule, join, and leave games without visiting the website.

## Related Project

This Discord bot integrates with the **[ITT Web](https://github.com/N1teshift/ittweb)** tournament management system.

**ITT Web** is a comprehensive website for Island Troll Tribes game statistics, guides, and community features, providing:

- **Game Statistics**: Game tracking, ELO rating system, player profiles, leaderboards, and analytics
- **Community Features**: Scheduled games, archive entries, blog posts, and game guides
- **User Management**: Authentication system that Discord users are automatically linked to
- **Tournament System**: Backend API and database that powers this Discord bot

**Key Integration Points:**
- **User Accounts**: Discord users are automatically linked to ITT Web accounts
- **Game Management**: All tournament games and scheduling logic comes from ITT Web
- **ELO System**: Player ratings and rankings are managed through ITT Web
- **API Endpoints**: Bot uses ITT Web's REST API for all game operations

## Features

- **/games** - Browse and manage upcoming scheduled games, with option to schedule new games
- **Interactive scheduling** - Multi-step game scheduling with dropdown menus for team size, game type, version, date, and time
- **Interactive buttons** - Click to join/leave games directly from Discord messages and embeds
- **Select menus** - Choose specific games to join or view details
- **Auto user creation** - Automatically creates ITT accounts for new Discord users
- **Game reminders** - Currently disabled (automatic reminders for upcoming games)

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
BOT_API_KEY=your_bot_api_key_here
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
   - `BOT_API_KEY`
   - `DISCORD_GUILD_ID` (optional)

### 3. Railway Configuration

Railway will automatically detect this as a Node.js app and use the `npm start` script.

## API Integration

The bot integrates with your existing ITT Web API endpoints:

- `GET /api/games` - Fetch scheduled games
- `POST /api/games` - Create scheduled games
- `POST /api/games/{id}/join-bot` - Join games (bot-authenticated)
- `POST /api/games/{id}/leave-bot` - Leave games (bot-authenticated)
- `GET /api/games/{id}` - Get game details
- `POST /api/user/create` - Create new users (when needed)

**Bot Authentication**: The bot uses `BOT_API_KEY` for secure API access via the `x-bot-api-key` header.

## Scheduling System

Games are scheduled through an interactive flow using Discord select menus:

1. **Select Team Size** - Choose from 1v1, 2v2, 3v3, 4v4, 5v5, 6v6
2. **Select Game Type** - Normal or Elo (ranked)
3. **Select Game Version** - v3.28, v3.27, v3.26
4. **Select Date** - Choose from upcoming dates
5. **Select Time** - Choose from available time slots in UTC

All scheduled times are stored in UTC.

## License

MIT
