import { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { TEAM_SIZE_OPTIONS, GAME_TYPE_OPTIONS, GAME_VERSION_OPTIONS } from '../config.js';
import { getDateOptions, getHourOptions, getMinuteOptions, getReminderTimeOptions } from '../utils/time.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import {
  ensureUserExists,
  getGameById,
  joinScheduledGame,
  leaveScheduledGame,
} from '../api.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { clearScheduleState, getScheduleState, finalizeScheduleGame } from './schedule.js';
import { scheduleReminderForGame } from './reminders.js';
import { db, isInitialized } from '../firebase.js';
import { logger } from '../utils/logger.js';

// Helper to get state from Firestore (duplicated from schedule.js to avoid circular deps if not careful, 
// but better to export from schedule.js if possible. For now, we'll just use the clear function imported)

export async function handleButton(interaction) {
  const { customId, user } = interaction;

  await ensureUserExists(user.id, user.displayName || user.username);

  // Handle schedule_game button - show step 1 with select menus
  if (customId === 'schedule_game') {
    // Initialize with default values
    const defaultState = {
      teamSize: '1v1',
      gameType: 'elo',
      gameVersion: 'v3.28',
    };
    
    // Save default state
    if (db && isInitialized) {
      try {
        await db.collection('discord_bot_states').doc(user.id).set(defaultState, { merge: true });
      } catch (error) {
        logger.error(`Failed to save default state for user ${user.id}`, error);
      }
    }

    const teamSizeSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_team_size')
      .setPlaceholder('Team Size: 1v1')
      .addOptions(
        TEAM_SIZE_OPTIONS.map((opt) => ({
          ...opt,
          default: opt.value === '1v1',
        }))
      );

    const gameTypeSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_game_type')
      .setPlaceholder('Game Type: elo')
      .addOptions(
        GAME_TYPE_OPTIONS.map((opt) => ({
          ...opt,
          default: opt.value === 'elo',
        }))
      );

    const gameVersionSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_game_version')
      .setPlaceholder('Version: v3.28')
      .addOptions(
        GAME_VERSION_OPTIONS.map((opt) => ({
          ...opt,
          default: opt.value === 'v3.28',
        }))
      );

    const row1 = new ActionRowBuilder().addComponents(teamSizeSelect);
    const row2 = new ActionRowBuilder().addComponents(gameTypeSelect);
    const row3 = new ActionRowBuilder().addComponents(gameVersionSelect);

    const continueButton = new ButtonBuilder()
      .setCustomId('schedule_continue')
      .setLabel('Continue to Date/Time →')
      .setStyle(ButtonStyle.Primary);

    const row4 = new ActionRowBuilder().addComponents(continueButton);

    await interaction.reply({
      content: '📅 **Schedule a New Game - Step 1/2**\nSelect your game settings below:\n\n✅ Selected: Team: 1v1 • Type: elo • Version: v3.28',
      components: [row1, row2, row3, row4],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Handle schedule_continue button - show step 2 with date/time selection
  // Note: Logic moved to schedule.js mostly, but if we need to handle it here:
  if (customId === 'schedule_continue') {
    // Initialize with default date (today) and minute (00)
    const today = new Date();
    const todayDate = today.toISOString().split('T')[0];
    
    const defaultState = {
      date: todayDate,
      minute: '00',
    };
    
    // Save default state
    if (db && isInitialized) {
      try {
        await db.collection('discord_bot_states').doc(user.id).set(defaultState, { merge: true });
      } catch (error) {
        logger.error(`Failed to save default state for user ${user.id}`, error);
      }
    }

    const dateSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_date')
      .setPlaceholder(`Date: ${todayDate}`)
      .addOptions(
        getDateOptions().map((opt) => ({
          ...opt,
          default: opt.value === todayDate,
        }))
      );

    const hourSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_hour')
      .setPlaceholder('Select hour (UTC)')
      .addOptions(getHourOptions());

    const minuteSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_minute')
      .setPlaceholder('Minute: 00')
      .addOptions(
        getMinuteOptions().map((opt) => ({
          ...opt,
          default: opt.value === '00',
        }))
      );

    const row1 = new ActionRowBuilder().addComponents(dateSelect);
    const row2 = new ActionRowBuilder().addComponents(hourSelect);
    const row3 = new ActionRowBuilder().addComponents(minuteSelect);

    await interaction.update({
      content: `📅 **Schedule a New Game - Step 2/2**\n**Settings:** 1v1 elo (v3.28)\n\nSelect date and time:\n\n✅ Selected: Date: ${todayDate} • Minute: 00`,
      components: [row1, row2, row3],
    });
    return;
  }

  // Handle schedule_submit button - finalize the game
  if (customId === 'schedule_submit') {
    try {
      await interaction.deferUpdate();
      const state = await getScheduleState(user.id);
      await finalizeScheduleGame(interaction, state, user);
    } catch (error) {
      logger.error('Error handling schedule submit', error);
      try {
        await interaction.followUp({
          content: `❌ Error: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (innerError) {
        logger.error('Failed to send submit error response', innerError);
      }
    }
    return;
  }

  const [action, gameId] = customId.split('_');

  try {
    await interaction.deferUpdate();

    if (action === 'join') {
      await handleJoinButton(interaction, user, gameId);
    } else if (action === 'leave') {
      await handleLeaveButton(interaction, user, gameId);
    }
  } catch (error) {
    logger.error('Error handling button interaction', error);
    try {
      await interaction.followUp({
        content: `❌ Error: ${error.message}`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (innerError) {
      logger.error('Failed to send button error response', innerError);
    }
  }
}

async function handleJoinButton(interaction, user, gameId) {
  const game = await getGameById(gameId);
  if (game.gameState !== 'scheduled') {
    await interaction.followUp({
      content: '❌ This game is no longer scheduled for joining.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const participants = game.participants || [];
  if (participants.some((p) => p.discordId === user.id)) {
    await interaction.followUp({
      content: '❌ You are already participating in this game.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
  if (maxPlayers && participants.length >= maxPlayers) {
    await interaction.followUp({
      content: '❌ This game is already full.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show reminder time selection menu
  const reminderOptions = getReminderTimeOptions();
  reminderOptions.unshift({
    label: 'No reminder',
    value: '0',
    description: 'Do not set a reminder',
  });

  const reminderSelect = new StringSelectMenuBuilder()
    .setCustomId(`reminder_select_${gameId}`)
    .setPlaceholder('Select when to be reminded (optional)')
    .addOptions(reminderOptions.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(reminderSelect);

  await interaction.followUp({
    content: '⏰ **When would you like to be reminded about this game?**\n(You can select "No reminder" to skip)',
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleLeaveButton(interaction, user, gameId) {
  const game = await getGameById(gameId);
  if (game.gameState !== 'scheduled') {
    await interaction.followUp({
      content: '❌ This game is no longer scheduled.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const participants = game.participants || [];
  if (!participants.some((p) => p.discordId === user.id)) {
    await interaction.followUp({
      content: '❌ You are not participating in this game.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await leaveScheduledGame(user.id, gameId);

  const updatedGame = await getGameById(gameId);
  const updatedParticipants = updatedGame.participants || [];

  const embed = createGameEmbed(updatedGame, updatedParticipants);
  const buttons = createGameButtons(gameId, false);

  await interaction.editReply({
    embeds: [embed],
    components: [buttons],
  });

  logger.info(`User ${user.username} left game ${gameId} via button`);
}

