import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import fetch from 'node-fetch';

// Configuration from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const ITT_API_BASE = process.env.ITT_API_BASE || 'https://your-vercel-app.vercel.app';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: for single server deployment
const BOT_API_KEY = process.env.BOT_API_KEY; // Required for join/leave operations

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('games')
    .setDescription('Browse and manage upcoming scheduled games'),
];

// Register commands with Discord
async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    if (DISCORD_GUILD_ID) {
      // Register for specific guild (faster for development)
      await rest.put(
        Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
        { body: commands }
      );
      console.log('Commands registered for guild:', DISCORD_GUILD_ID);
    } else {
      // Register globally (takes up to 1 hour to update)
      await rest.put(
        Routes.applicationCommands(DISCORD_CLIENT_ID),
        { body: commands }
      );
      console.log('Commands registered globally');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Parse time input and convert to UTC
function parseTimeToUTC(timeString) {
  const now = new Date();
  let targetTime;

  // Handle different time formats
  if (timeString.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timePart = timeString.replace('tomorrow', '').trim();
    const [hours, minutes] = parseTime(timePart);
    tomorrow.setHours(hours, minutes || 0, 0, 0);
    targetTime = tomorrow;
  } else {
    const [hours, minutes] = parseTime(timeString);
    const today = new Date(now);
    today.setHours(hours, minutes || 0, 0, 0);

    // If time has passed today, schedule for tomorrow
    if (today < now) {
      today.setDate(today.getDate() + 1);
    }
    targetTime = today;
  }

  return targetTime.toISOString();
}

function parseTime(timeStr) {
  // Handle various time formats: "8pm", "20:00", "3:30pm", etc.
  const pmMatch = timeStr.match(/(\d+):?(\d+)?\s*(am|pm)/i);
  if (pmMatch) {
    let [, hours, minutes, period] = pmMatch;
    hours = parseInt(hours);
    minutes = parseInt(minutes || 0);

    if (period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }

    return [hours, minutes];
  }

  // Handle 24-hour format: "20:00", "15:30"
  const hourMinuteMatch = timeStr.match(/(\d+):(\d+)/);
  if (hourMinuteMatch) {
    const [, hours, minutes] = hourMinuteMatch;
    return [parseInt(hours), parseInt(minutes)];
  }

  // Handle simple hour format: "8pm", "15"
  const hourMatch = timeStr.match(/(\d+)\s*(am|pm)?/i);
  if (hourMatch) {
    let [, hours, period] = hourMatch;
    hours = parseInt(hours);

    if (period && period.toLowerCase() === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period && period.toLowerCase() === 'am' && hours === 12) {
      hours = 0;
    }

    return [hours, 0];
  }

  throw new Error(`Could not parse time: ${timeStr}`);
}

// API helper functions
async function ensureUserExists(discordId, displayName) {
  try {
    // Try to create the user (this will succeed if user doesn't exist, or update if they do)
    const createResponse = await fetch(`${ITT_API_BASE}/api/user/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        discordId,
        name: displayName,
        preferredName: displayName,
        displayName: displayName,
      }),
    });

    if (!createResponse.ok) {
      console.error('Failed to create/update user:', await createResponse.text());
    }
  } catch (error) {
    console.error('Error ensuring user exists:', error);
  }
}

async function createScheduledGame(discordId, displayName, scheduledDateTime, teamSize = '1v1', gameType = 'normal', gameVersion = 'v3.28', gameLength = 1800, modes = []) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/schedule-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({
      discordId,
      displayName,
      scheduledDateTime,
      timezone: 'UTC',
      teamSize,
      gameType,
      gameVersion,
      gameLength,
      modes,
      addCreatorToParticipants: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'Unknown error';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorData.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Failed to schedule game: ${errorMessage}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`Failed to schedule game: ${result.error || 'Unknown error'}`);
  }

  return result.data?.id;
}

async function getScheduledGames() {
  const response = await fetch(`${ITT_API_BASE}/api/games?gameState=scheduled&limit=20`);

  if (!response.ok) {
    throw new Error('Failed to fetch games');
  }

  const result = await response.json();
  return result.data?.games || [];
}


async function getGameById(gameId) {
  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch game');
  }

  const result = await response.json();
  return result.data;
}

// Look up a scheduled game by its public numeric gameId (the one shown in embeds)
async function getScheduledGameByPublicId(publicGameId) {
  const response = await fetch(`${ITT_API_BASE}/api/games?gameState=scheduled&gameId=${publicGameId}&limit=1`);

  if (!response.ok) {
    throw new Error('Failed to fetch game by public ID');
  }

  const result = await response.json();
  const games = result.data?.games || [];
  const game = games[0];
  if (!game) {
    throw new Error('Game not found');
  }
  return game;
}

async function joinScheduledGame(discordId, displayName, gameId) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/join-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({
      discordId,
      displayName,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to join game: ${error}`);
  }

  const result = await response.json();
  return result;
}

async function leaveScheduledGame(discordId, gameId) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/leave-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({
      discordId,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to leave game: ${error}`);
  }

  const result = await response.json();
  return result;
}

// Helpers for game display
function getMaxPlayersFromTeamSize(teamSize) {
  if (!teamSize || typeof teamSize !== 'string') return null;

  const match = teamSize.match(/(\d+)\s*v\s*(\d+)/i);
  if (!match) return null;

  const left = parseInt(match[1], 10);
  const right = parseInt(match[2], 10);

  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return left + right;
}

function formatTimeUntil(dateInput) {
  const target = new Date(dateInput);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  const minutesTotal = Math.round(Math.abs(diffMs) / 60000);
  const hours = Math.floor(minutesTotal / 60);
  const minutes = minutesTotal % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  if (diffMs > 0) {
    return `in ${parts.join(' ')}`;
  }
  return `${parts.join(' ')} ago`;
}

// Basic, in-memory reminder scheduler (lost when bot restarts)
const REMINDER_MINUTES_BEFORE = 10;
const MAX_REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const reminderRegistry = new Map(); // userId -> Array<{ gameId: string, gameTimeMs: number, reminderTimeMs: number }>

function scheduleReminderForGame(userId, game) {
  try {
    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    if (!rawDate) return;

    const gameTimeMs = new Date(rawDate).getTime();
    const nowMs = Date.now();

    const reminderTimeMs = gameTimeMs - REMINDER_MINUTES_BEFORE * 60 * 1000;
    const delayMs = reminderTimeMs - nowMs;

    // Skip if too late or too far in the future
    if (delayMs <= 0 || delayMs > MAX_REMINDER_WINDOW_MS) {
      return;
    }

    const gameId = game.gameId || game.id;
    if (!gameId) return;

    // Track reminder in simple registry
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
        const user = await client.users.fetch(userId);
        const gid = game.gameId || game.id || 'unknown';
        await user.send(`⏰ Reminder: Game #${gid} starts in ${REMINDER_MINUTES_BEFORE} minutes.`);

        // Clean up registry entry after sending
        const list = reminderRegistry.get(key) || [];
        reminderRegistry.set(
          key,
          list.filter((r) => r.gameId !== String(gid)),
        );
      } catch (err) {
        console.error('Failed to send reminder DM', err);
      }
    }, delayMs);
  } catch (err) {
    console.error('Failed to schedule reminder', err);
  }
}

function buildJoinSelectMenu(games, currentUserId) {
  const options = [];

  for (const game of games) {
    if (!game || !game.gameId) continue;

    const participants = game.participants || [];
    const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);

    // Skip games that are full or not scheduled
    if (game.gameState && game.gameState !== 'scheduled') continue;
    if (maxPlayers && participants.length >= maxPlayers) continue;

    // Skip games the user is already in
    if (participants.some(p => p.discordId === currentUserId)) continue;

    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    const gameTime = new Date(rawDate).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const playersValue = maxPlayers ? `${participants.length}/${maxPlayers}` : `${participants.length}`;

    options.push({
      label: `Game #${game.gameId} • ${game.teamSize} ${game.gameType}`,
      description: `${gameTime} UTC • ${playersValue} players`,
      // Use internal document ID as the value so we can call /api/games/[id]
      value: String(game.id),
    });

    if (options.length >= 25) break; // Discord select menus max 25 options
  }

  if (options.length === 0) {
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('join_select')
    .setPlaceholder('Choose a game to join')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return row;
}

function buildGamesSelectMenu(games) {
  const options = [];

  for (const game of games) {
    if (!game || !game.gameId || !game.id) continue;

    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    const gameTime = new Date(rawDate).toLocaleString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const participants = game.participants || [];
    const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
    const playersValue = maxPlayers ? `${participants.length}/${maxPlayers}` : `${participants.length}`;

    options.push({
      label: `Game #${game.gameId} • ${game.teamSize} ${game.gameType}`,
      description: `${gameTime} UTC • ${playersValue} players`,
      value: String(game.id), // internal document ID
    });

    if (options.length >= 25) break;
  }

  if (options.length === 0) {
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('games_select')
    .setPlaceholder('Choose a game to view details and join/leave')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return row;
}

// Create game embed and buttons
function createGameEmbed(game, participants = []) {
  const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
  const gameDate = new Date(rawDate);

  const gameTime = gameDate.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
  const playersValue = maxPlayers ? `${participants.length}/${maxPlayers}` : `${participants.length}`;
  const relativeTime = formatTimeUntil(rawDate);

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Game #${game.gameId}`)
    .setDescription(`${game.teamSize} ${String(game.gameType || '').toUpperCase()}`)
    .addFields(
      { name: '⏰ Time', value: gameTime + ' UTC', inline: true },
      { name: '⌛ Starts', value: relativeTime, inline: true },
      { name: '👥 Players', value: playersValue, inline: true },
      { name: '🎯 Status', value: game.gameState || 'scheduled', inline: true }
    )
    .setColor(0x0099ff)
    .setFooter({ text: `Created by ${game.creatorName}` });

  if (participants.length > 0) {
    embed.addFields({
      name: 'Players',
      value: participants.map(p => p.name).join('\n') || 'None yet',
      inline: false
    });
  }

  return embed;
}

function createGameButtons(gameId, userJoined = false) {
  const row = new ActionRowBuilder();

  if (userJoined) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`leave_${gameId}`)
        .setLabel('Leave Game')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setURL(`${ITT_API_BASE}/games/${gameId}`)
        .setLabel('View Details')
        .setStyle(ButtonStyle.Link)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${gameId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setURL(`${ITT_API_BASE}/games/${gameId}`)
        .setLabel('View Details')
        .setStyle(ButtonStyle.Link)
    );
  }

  return row;
}

// Event handlers
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  registerCommands();
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    console.error('Interaction error:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: 'An error occurred while processing your request.',
          ephemeral: true
        });
      }
    } catch (innerError) {
      console.error('Failed to send error response:', innerError);
    }
  }
});

async function handleSlashCommand(interaction) {
  const { commandName, user } = interaction;

  switch (commandName) {
    case 'games': {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      // Ensure user exists in our system
      await ensureUserExists(user.id, user.displayName || user.username);
      try {
        const games = await getScheduledGames();

        if (games.length === 0) {
          await interaction.editReply({
            content: 'No upcoming games scheduled.',
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎮 Upcoming Games')
          .setColor(0x0099ff);

        let description = '';
        for (const game of games.slice(0, 10)) {
          const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
          const gameTime = new Date(rawDate).toLocaleString('en-US', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

          const participants = game.participants || [];
          const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
          const playersValue = maxPlayers ? `${participants.length}/${maxPlayers}` : `${participants.length}`;
          const youTag = participants.some(p => p.discordId === user.id) ? ' **(You are in this game)**' : '';

          description += `**Game #${game.gameId}**: ${game.teamSize} ${game.gameType} at ${gameTime} UTC (${playersValue} players)${youTag}\n`;
        }

        embed.setDescription(description);

        const selectRow = buildGamesSelectMenu(games);
        const scheduleButton = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('schedule_game')
              .setLabel('📅 Schedule New Game')
              .setStyle(ButtonStyle.Primary)
          );

        await interaction.editReply({
          embeds: [embed],
          components: selectRow ? [selectRow, scheduleButton] : [scheduleButton]
        });

      } catch (error) {
        await interaction.editReply({
          content: `❌ Failed to fetch games: ${error.message}`
        });
      }
      break;
    }

    case 'join': {
      const gameId = interaction.options.getString('game_id');

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      // Ensure user exists in our system
      await ensureUserExists(user.id, user.displayName || user.username);

      try {
        // If no game ID provided, show a selection menu of joinable games
        if (!gameId) {
          const games = await getScheduledGames();
          const selectRow = buildJoinSelectMenu(games, user.id);

          if (!selectRow) {
            await interaction.editReply({
              content: 'There are no joinable scheduled games right now.',
            });
            return;
          }

          await interaction.editReply({
            content: 'Select a game to join:',
            components: [selectRow]
          });
          return;
        }

        // Validate game exists and is scheduled when ID is provided
        let game;
        let internalGameId = gameId;

        // If the user passed a numeric ID, treat it as the public gameId and look it up
        if (/^\d+$/.test(gameId)) {
          game = await getScheduledGameByPublicId(parseInt(gameId, 10));
          internalGameId = game.id; // Firestore document ID
        } else {
          game = await getGameById(gameId);
          internalGameId = game.id || gameId;
        }

        if (game.gameState !== 'scheduled') {
          await interaction.editReply({
            content: '❌ This game is not currently scheduled for joining.',
          });
          return;
        }

        // Check if user is already a participant
        const participants = game.participants || [];
        if (participants.some(p => p.discordId === user.id)) {
          await interaction.editReply({
            content: '❌ You are already participating in this game.',
          });
          return;
        }

        // Check if game is full
        if (participants.length >= 2) {
          await interaction.editReply({
            content: '❌ This game is already full (2 players maximum).',
          });
          return;
        }

        await joinScheduledGame(user.id, user.displayName || user.username, internalGameId);

        // Get updated game data
        const updatedGame = await getGameById(internalGameId);
        const updatedParticipants = updatedGame.participants || [];

        // Schedule reminder DM
        scheduleReminderForGame(user.id, updatedGame);

        const embed = createGameEmbed(updatedGame, updatedParticipants);
        // Use internalGameId so button handlers get the correct document ID
        const buttons = createGameButtons(internalGameId, true); // User just joined

        await interaction.editReply({
          content: '✅ Successfully joined the game!',
          embeds: [embed],
          components: [buttons]
        });

      } catch (error) {
        await interaction.editReply({
          content: `❌ Failed to join game: ${error.message}`
        });
      }
      break;
    }

    case 'leave': {
      const gameId = interaction.options.getString('game_id');

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      // Ensure user exists in our system
      await ensureUserExists(user.id, user.displayName || user.username);

      try {
        // Validate game exists and is scheduled
        let game;
        let internalGameId = gameId;

        // If the user passed a numeric ID, treat it as the public gameId and look it up
        if (/^\d+$/.test(gameId)) {
          game = await getScheduledGameByPublicId(parseInt(gameId, 10));
          internalGameId = game.id; // Firestore document ID
        } else {
          game = await getGameById(gameId);
          internalGameId = game.id || gameId;
        }
        if (game.gameState !== 'scheduled') {
          await interaction.editReply({
            content: '❌ This game is not currently scheduled.',
          });
          return;
        }

        // Check if user is a participant
        const participants = game.participants || [];
        if (!participants.some(p => p.discordId === user.id)) {
          await interaction.editReply({
            content: '❌ You are not participating in this game.',
          });
          return;
        }

        await leaveScheduledGame(user.id, internalGameId);

        // Get updated game data
        const updatedGame = await getGameById(internalGameId);
        const updatedParticipants = updatedGame.participants || [];

        const embed = createGameEmbed(updatedGame, updatedParticipants);
        // Use internalGameId so button handlers get the correct document ID
        const buttons = createGameButtons(internalGameId, false); // User just left

        await interaction.editReply({
          content: '✅ Successfully left the game.',
          embeds: [embed],
          components: [buttons]
        });

      } catch (error) {
        await interaction.editReply({
          content: `❌ Failed to leave game: ${error.message}`
        });
      }
      break;
    }

  }
}

async function handleButton(interaction) {
  const { customId, user } = interaction;

  // Ensure user exists in our system
  await ensureUserExists(user.id, user.displayName || user.username);

  // Handle schedule_game button (doesn't follow action_gameId pattern)
  if (customId === 'schedule_game') {
    const modal = new ModalBuilder()
      .setCustomId('schedule_modal')
      .setTitle('Schedule New Game');

    const timeInput = new TextInputBuilder()
      .setCustomId('game_time')
      .setLabel('Game Time (e.g., "8pm", "20:00", "tomorrow 3pm")')
      .setPlaceholder('When should the game start?')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(50);

    const teamSizeInput = new TextInputBuilder()
      .setCustomId('team_size')
      .setLabel('Team Size (1v1, 2v2, 3v3, 4v4, 5v5, 6v6)')
      .setPlaceholder('e.g., 1v1, 2v2, etc.')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(3)
      .setMaxLength(10);

    const gameTypeInput = new TextInputBuilder()
      .setCustomId('game_type')
      .setLabel('Game Type (normal or elo)')
      .setPlaceholder('normal')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(4)
      .setMaxLength(10);

    const gameVersionInput = new TextInputBuilder()
      .setCustomId('game_version')
      .setLabel('Game Version (optional)')
      .setPlaceholder('v3.28')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMinLength(3)
      .setMaxLength(20);

    const gameLengthInput = new TextInputBuilder()
      .setCustomId('game_length')
      .setLabel('Game Length in seconds (optional)')
      .setPlaceholder('1800')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMinLength(2)
      .setMaxLength(10);

    const firstRow = new ActionRowBuilder().addComponents(timeInput);
    const secondRow = new ActionRowBuilder().addComponents(teamSizeInput);
    const thirdRow = new ActionRowBuilder().addComponents(gameTypeInput);
    const fourthRow = new ActionRowBuilder().addComponents(gameVersionInput);
    const fifthRow = new ActionRowBuilder().addComponents(gameLengthInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    await interaction.showModal(modal);
    return;
  }

  const [action, gameId] = customId.split('_');

  try {
    // Acknowledge the interaction immediately to avoid "Unknown interaction" on slow operations
    await interaction.deferUpdate();

    if (action === 'join') {
      // Validate game exists and is scheduled
      const game = await getGameById(gameId);
      if (game.gameState !== 'scheduled') {
        await interaction.followUp({
          content: '❌ This game is no longer scheduled for joining.',
          ephemeral: true
        });
        return;
      }

      // Check if user is already a participant
      const participants = game.participants || [];
      if (participants.some(p => p.discordId === user.id)) {
        await interaction.followUp({
          content: '❌ You are already participating in this game.',
          ephemeral: true
        });
        return;
      }

      // Check if game is full
      if (participants.length >= 2) {
        await interaction.followUp({
          content: '❌ This game is already full (2 players maximum).',
          ephemeral: true
        });
        return;
      }

      await joinScheduledGame(user.id, user.displayName || user.username, gameId);

      // Get updated game data and show result
      const updatedGame = await getGameById(gameId);
      const updatedParticipants = updatedGame.participants || [];

      // Schedule reminder DM
      scheduleReminderForGame(user.id, updatedGame);

      const embed = createGameEmbed(updatedGame, updatedParticipants);
      const buttons = createGameButtons(gameId, true); // User just joined

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });

    } else if (action === 'leave') {
      // Validate game exists and is scheduled
      const game = await getGameById(gameId);
      if (game.gameState !== 'scheduled') {
        await interaction.followUp({
          content: '❌ This game is no longer scheduled.',
          ephemeral: true
        });
        return;
      }

      // Check if user is a participant
      const participants = game.participants || [];
      if (!participants.some(p => p.discordId === user.id)) {
        await interaction.followUp({
          content: '❌ You are not participating in this game.',
          ephemeral: true
        });
        return;
      }

      await leaveScheduledGame(user.id, gameId);

      // Get updated game data and show result
      const updatedGame = await getGameById(gameId);
      const updatedParticipants = updatedGame.participants || [];

      const embed = createGameEmbed(updatedGame, updatedParticipants);
      const buttons = createGameButtons(gameId, false); // User just left

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });

    }
  } catch (error) {
    try {
      await interaction.followUp({
        content: `❌ Error: ${error.message}`,
        ephemeral: true
      });
    } catch (innerError) {
      console.error('Failed to send button error response:', innerError);
    }
  }
}

async function handleModalSubmit(interaction) {
  if (interaction.customId === 'schedule_modal') {
    // Defer reply since API calls may take time
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    try {
      // Extract form data
      const time = interaction.fields.getTextInputValue('game_time');
      const teamSize = interaction.fields.getTextInputValue('team_size');
      const gameType = interaction.fields.getTextInputValue('game_type');
      const gameVersion = interaction.fields.getTextInputValue('game_version') || 'v3.28';
      const gameLengthStr = interaction.fields.getTextInputValue('game_length') || '1800';

      // Validate team size
      const validTeamSizes = ['1v1', '2v2', '3v3', '4v4', '5v5', '6v6'];
      if (!validTeamSizes.includes(teamSize)) {
        await interaction.editReply({
          content: `❌ Invalid team size "${teamSize}". Valid options: ${validTeamSizes.join(', ')}`
        });
        return;
      }

      // Validate game type
      const validGameTypes = ['normal', 'elo'];
      if (!validGameTypes.includes(gameType.toLowerCase())) {
        await interaction.editReply({
          content: `❌ Invalid game type "${gameType}". Valid options: ${validGameTypes.join(', ')}`
        });
        return;
      }

      // Validate game length
      const gameLength = parseInt(gameLengthStr);
      if (isNaN(gameLength) || gameLength < 60 || gameLength > 36000) {
        await interaction.editReply({
          content: '❌ Invalid game length. Must be between 60 and 36000 seconds.'
        });
        return;
      }

      // Parse time and validate
      const scheduledDateTime = parseTimeToUTC(time);

      // Create the game
      const gameId = await createScheduledGame(
        interaction.user.id,
        interaction.user.displayName || interaction.user.username,
        scheduledDateTime,
        teamSize,
        gameType.toLowerCase(),
        gameVersion,
        gameLength,
        [] // modes array, empty for now
      );

      await interaction.editReply({
        content: `✅ Game scheduled successfully! Game #${gameId}`,
      });

    } catch (error) {
      console.error('Modal submission error:', error);
      await interaction.editReply({
        content: `❌ Failed to schedule game: ${error.message}`
      });
    }
  }
}

async function handleSelectMenu(interaction) {
  const { customId, values, user } = interaction;

  // Ensure user exists in our system
  await ensureUserExists(user.id, user.displayName || user.username);

  const gameId = values[0];

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }

    // games_select: show details + join/leave buttons
    if (customId === 'games_select') {
      const game = await getGameById(gameId);
      const participants = game.participants || [];
      const userJoined = participants.some(p => p.discordId === user.id);

      const embed = createGameEmbed(game, participants);
      const buttons = createGameButtons(gameId, userJoined);

      await interaction.editReply({
        embeds: [embed],
        components: [buttons]
      });
      return;
    }

    // join_select: auto-join the selected game (used by /join)
    if (customId === 'join_select') {
      // Validate game exists and is scheduled
      const game = await getGameById(gameId);
      if (game.gameState !== 'scheduled') {
        await interaction.editReply({
          content: '❌ This game is no longer scheduled for joining.',
        });
        return;
      }

      // Check if user is already a participant
      const participants = game.participants || [];
      if (participants.some(p => p.discordId === user.id)) {
        await interaction.editReply({
          content: '❌ You are already participating in this game.',
        });
        return;
      }

      // Check if game is full
      const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
      if (maxPlayers && participants.length >= maxPlayers) {
        await interaction.editReply({
          content: '❌ This game is already full.',
        });
        return;
      }

      await joinScheduledGame(user.id, user.displayName || user.username, gameId);

      // Get updated game data and show result
      const updatedGame = await getGameById(gameId);
      const updatedParticipants = updatedGame.participants || [];

      // Schedule reminder DM
      scheduleReminderForGame(user.id, updatedGame);

      const embed = createGameEmbed(updatedGame, updatedParticipants);
      const buttons = createGameButtons(gameId, true); // User just joined

      await interaction.editReply({
        content: '✅ Successfully joined the game!',
        embeds: [embed],
        components: [buttons]
      });
      return;
    }

  } catch (error) {
    await interaction.editReply({
      content: `❌ Failed to join game: ${error.message}`
    });
  }
}


// Login to Discord
client.login(DISCORD_TOKEN);
