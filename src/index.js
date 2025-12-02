import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';

// Configuration from environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const ITT_API_BASE = process.env.ITT_API_BASE || 'https://your-vercel-app.vercel.app';
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID; // Optional: for single server deployment

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Store active game messages for updates
const activeGames = new Map(); // gameId -> message info

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Schedule a new game')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Game time (e.g., "8pm", "20:00", "tomorrow 3pm")')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('games')
    .setDescription('List upcoming scheduled games'),

  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join a scheduled game')
    .addStringOption(option =>
      option.setName('game_id')
        .setDescription('Game ID to join')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave a scheduled game')
    .addStringOption(option =>
      option.setName('game_id')
        .setDescription('Game ID to leave')
        .setRequired(true)),
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

async function createScheduledGame(discordId, displayName, scheduledDateTime) {
  const response = await fetch(`${ITT_API_BASE}/api/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-id': discordId,
    },
    body: JSON.stringify({
      gameState: 'scheduled',
      scheduledDateTime,
      timezone: 'UTC', // We'll use UTC internally
      teamSize: '1v1',
      gameType: 'elo',
      gameVersion: 'v1.36.1',
      modes: ['blizzardj'],
      creatorName: displayName,
      createdByDiscordId: discordId,
      addCreatorToParticipants: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create game: ${error}`);
  }

  const result = await response.json();
  return result.id;
}

async function getScheduledGames() {
  const response = await fetch(`${ITT_API_BASE}/api/games?gameState=scheduled&limit=20`);

  if (!response.ok) {
    throw new Error('Failed to fetch games');
  }

  const result = await response.json();
  return result.data || [];
}

async function joinGame(gameId, discordId, displayName) {
  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-id': discordId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to join game: ${error}`);
  }
}

async function leaveGame(gameId, discordId) {
  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/leave`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-discord-id': discordId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to leave game: ${error}`);
  }
}

async function getGameById(gameId) {
  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch game');
  }

  const result = await response.json();
  return result.data;
}

// Create game embed and buttons
function createGameEmbed(game, participants = []) {
  const gameTime = new Date(game.scheduledDateTime).toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Game #${game.scheduledGameId}`)
    .setDescription(`${game.teamSize} ${game.gameType.toUpperCase()}`)
    .addFields(
      { name: '⏰ Time', value: gameTime + ' UTC', inline: true },
      { name: '👥 Players', value: `${participants.length}/2`, inline: true },
      { name: '🎯 Status', value: game.status, inline: true }
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
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`join_${gameId}`)
        .setLabel(userJoined ? 'Leave Game' : 'Join Game')
        .setStyle(userJoined ? ButtonStyle.Danger : ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`details_${gameId}`)
        .setLabel('View Details')
        .setStyle(ButtonStyle.Secondary)
    );

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
    }
  } catch (error) {
    console.error('Interaction error:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true
      });
    }
  }
});

async function handleSlashCommand(interaction) {
  const { commandName, user } = interaction;

  // Ensure user exists in our system
  await ensureUserExists(user.id, user.displayName || user.username);

  switch (commandName) {
    case 'schedule': {
      const timeString = interaction.options.getString('time');

      try {
        const scheduledDateTime = parseTimeToUTC(timeString);
        const gameId = await createScheduledGame(user.id, user.displayName || user.username, scheduledDateTime);

        // Get the created game to show details
        const game = await getGameById(gameId);
        const participants = game.participants || [];

        const embed = createGameEmbed(game, participants);
        const buttons = createGameButtons(gameId, participants.some(p => p.discordId === user.id));

        await interaction.reply({
          embeds: [embed],
          components: [buttons]
        });

        // Store message info for updates
        const message = await interaction.fetchReply();
        activeGames.set(gameId, {
          channelId: interaction.channelId,
          messageId: message.id,
          gameId,
        });

      } catch (error) {
        await interaction.reply({
          content: `❌ Failed to schedule game: ${error.message}`,
          ephemeral: true
        });
      }
      break;
    }

    case 'games': {
      try {
        const games = await getScheduledGames();

        if (games.length === 0) {
          await interaction.reply({
            content: 'No upcoming games scheduled.',
            ephemeral: true
          });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('🎮 Upcoming Games')
          .setColor(0x0099ff);

        let description = '';
        for (const game of games.slice(0, 10)) {
          const gameTime = new Date(game.scheduledDateTime).toLocaleString('en-US', {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });

          const participants = game.participants || [];
          description += `**Game #${game.scheduledGameId}**: ${game.teamSize} ${game.gameType} at ${gameTime} UTC (${participants.length}/2 players)\n`;
        }

        embed.setDescription(description);

        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });

      } catch (error) {
        await interaction.reply({
          content: `❌ Failed to fetch games: ${error.message}`,
          ephemeral: true
        });
      }
      break;
    }

    case 'join': {
      const gameId = interaction.options.getString('game_id');

      try {
        await joinGame(gameId, user.id, user.displayName || user.username);

        // Update the game message if it exists
        await updateGameMessage(gameId);

        await interaction.reply({
          content: `✅ Successfully joined Game #${gameId}!`,
          ephemeral: true
        });

      } catch (error) {
        await interaction.reply({
          content: `❌ Failed to join game: ${error.message}`,
          ephemeral: true
        });
      }
      break;
    }

    case 'leave': {
      const gameId = interaction.options.getString('game_id');

      try {
        await leaveGame(gameId, user.id);

        // Update the game message if it exists
        await updateGameMessage(gameId);

        await interaction.reply({
          content: `✅ Successfully left Game #${gameId}!`,
          ephemeral: true
        });

      } catch (error) {
        await interaction.reply({
          content: `❌ Failed to leave game: ${error.message}`,
          ephemeral: true
        });
      }
      break;
    }
  }
}

async function handleButton(interaction) {
  const { customId, user } = interaction;
  const [action, gameId] = customId.split('_');

  // Ensure user exists in our system
  await ensureUserExists(user.id, user.displayName || user.username);

  try {
    if (action === 'join') {
      const game = await getGameById(gameId);
      const participants = game.participants || [];
      const isJoined = participants.some(p => p.discordId === user.id);

      if (isJoined) {
        // Leave the game
        await leaveGame(gameId, user.id);
        await interaction.reply({
          content: `✅ Left Game #${gameId}`,
          ephemeral: true
        });
      } else {
        // Join the game
        await joinGame(gameId, user.id, user.displayName || user.username);
        await interaction.reply({
          content: `✅ Joined Game #${gameId}!`,
          ephemeral: true
        });
      }

      // Update the message
      await updateGameMessage(gameId);

    } else if (action === 'details') {
      const game = await getGameById(gameId);
      const participants = game.participants || [];

      const embed = createGameEmbed(game, participants);
      const buttons = createGameButtons(gameId, participants.some(p => p.discordId === user.id));

      await interaction.reply({
        embeds: [embed],
        components: [buttons],
        ephemeral: true
      });
    }

  } catch (error) {
    await interaction.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

async function updateGameMessage(gameId) {
  const messageInfo = activeGames.get(gameId);
  if (!messageInfo) return;

  try {
    const channel = await client.channels.fetch(messageInfo.channelId);
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(messageInfo.messageId);
    const game = await getGameById(gameId);
    const participants = game.participants || [];

    const embed = createGameEmbed(game, participants);
    const buttons = createGameButtons(gameId);

    await message.edit({
      embeds: [embed],
      components: [buttons]
    });

  } catch (error) {
    console.error('Failed to update game message:', error);
  }
}

// Login to Discord
client.login(DISCORD_TOKEN);
