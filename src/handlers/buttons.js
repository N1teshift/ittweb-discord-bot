import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { TEAM_SIZE_OPTIONS, GAME_TYPE_OPTIONS, GAME_VERSION_OPTIONS } from '../config.js';
import { getDateOptions, getTimeOptions } from '../utils/time.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import {
  ensureUserExists,
  getGameById,
  joinScheduledGame,
  leaveScheduledGame,
} from '../api.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { clearScheduleState } from './schedule.js';
import { scheduleReminderForGame } from './reminders.js';
import { logger } from '../utils/logger.js';

// Helper to get state from Firestore (duplicated from schedule.js to avoid circular deps if not careful, 
// but better to export from schedule.js if possible. For now, we'll just use the clear function imported)

export async function handleButton(interaction) {
  const { customId, user } = interaction;

  await ensureUserExists(user.id, user.displayName || user.username);

  // Handle schedule_game button - show step 1 with select menus
  if (customId === 'schedule_game') {
    await clearScheduleState(user.id);

    const teamSizeSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_team_size')
      .setPlaceholder('Select team size')
      .addOptions(TEAM_SIZE_OPTIONS);

    const gameTypeSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_game_type')
      .setPlaceholder('Select game type')
      .addOptions(GAME_TYPE_OPTIONS);

    const gameVersionSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_game_version')
      .setPlaceholder('Select game version')
      .addOptions(GAME_VERSION_OPTIONS);

    const row1 = new ActionRowBuilder().addComponents(teamSizeSelect);
    const row2 = new ActionRowBuilder().addComponents(gameTypeSelect);
    const row3 = new ActionRowBuilder().addComponents(gameVersionSelect);

    await interaction.reply({
      content: '📅 **Schedule a New Game - Step 1/2**\nSelect your game settings below:',
      components: [row1, row2, row3],
      ephemeral: true,
    });
    return;
  }

  // Handle schedule_continue button - show step 2 with date/time selection
  // Note: Logic moved to schedule.js mostly, but if we need to handle it here:
  if (customId === 'schedule_continue') {
    // This button is now handled by the updateScheduleStep1 flow in schedule.js usually,
    // but if it triggers a fresh interaction, we might need to fetch state.
    // For simplicity, we assume the user is following the flow and the state is in Firestore.

    const dateSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_date')
      .setPlaceholder('Select date')
      .addOptions(getDateOptions());

    const timeSelect = new StringSelectMenuBuilder()
      .setCustomId('schedule_time')
      .setPlaceholder('Select time (UTC)')
      .addOptions(getTimeOptions().slice(0, 25));

    const row1 = new ActionRowBuilder().addComponents(dateSelect);
    const row2 = new ActionRowBuilder().addComponents(timeSelect);

    await interaction.update({
      content: `📅 **Schedule a New Game - Step 2/2**\nSelect date and time:`,
      components: [row1, row2],
    });
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
        ephemeral: true,
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
      ephemeral: true,
    });
    return;
  }

  const participants = game.participants || [];
  if (participants.some((p) => p.discordId === user.id)) {
    await interaction.followUp({
      content: '❌ You are already participating in this game.',
      ephemeral: true,
    });
    return;
  }

  const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
  if (maxPlayers && participants.length >= maxPlayers) {
    await interaction.followUp({
      content: '❌ This game is already full.',
      ephemeral: true,
    });
    return;
  }

  await joinScheduledGame(user.id, user.displayName || user.username, gameId);

  const updatedGame = await getGameById(gameId);
  const updatedParticipants = updatedGame.participants || [];

  await scheduleReminderForGame(user.id, updatedGame);

  const embed = createGameEmbed(updatedGame, updatedParticipants);
  const buttons = createGameButtons(gameId, true);

  await interaction.editReply({
    embeds: [embed],
    components: [buttons],
  });

  logger.info(`User ${user.username} joined game ${gameId} via button`);
}

async function handleLeaveButton(interaction, user, gameId) {
  const game = await getGameById(gameId);
  if (game.gameState !== 'scheduled') {
    await interaction.followUp({
      content: '❌ This game is no longer scheduled.',
      ephemeral: true,
    });
    return;
  }

  const participants = game.participants || [];
  if (!participants.some((p) => p.discordId === user.id)) {
    await interaction.followUp({
      content: '❌ You are not participating in this game.',
      ephemeral: true,
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

