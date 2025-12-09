import { MessageFlags } from 'discord.js';
import {
  ensureUserExists,
  getGameById,
  joinScheduledGame,
} from '../api.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { handleScheduleSelectMenu } from './schedule.js';
import { scheduleReminderForGame } from './reminders.js';
import { logger } from '../utils/logger.js';

export async function handleSelectMenu(interaction) {
  const { customId, values, user } = interaction;

  await ensureUserExists(user.id, user.displayName || user.username);

  // Handle schedule flow select menus
  if (customId.startsWith('schedule_')) {
    await handleScheduleSelectMenu(interaction);
    return;
  }

  // Handle reminder selection when joining a game
  if (customId.startsWith('reminder_select_')) {
    const gameId = customId.replace('reminder_select_', '');
    const reminderMinutes = parseInt(values[0], 10);
    
    await handleReminderSelection(interaction, user, gameId, reminderMinutes);
    return;
  }

  const gameId = values[0];

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // games_select: show details + join/leave buttons
    if (customId === 'games_select') {
      const game = await getGameById(gameId);
      const participants = game.participants || [];
      const userJoined = participants.some((p) => p.discordId === user.id);

      const embed = createGameEmbed(game, participants);
      const buttons = createGameButtons(gameId, userJoined);

      await interaction.editReply({
        embeds: [embed],
        components: [buttons],
      });
      return;
    }

  } catch (error) {
    logger.error('Failed to handle select menu', error);
    await interaction.editReply({
      content: `❌ Failed to join game: ${error.message}`,
    });
  }
}

async function handleReminderSelection(interaction, user, gameId, reminderMinutes) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const game = await getGameById(gameId);
    if (game.gameState !== 'scheduled') {
      await interaction.editReply({
        content: '❌ This game is no longer scheduled for joining.',
      });
      return;
    }

    const participants = game.participants || [];
    if (participants.some((p) => p.discordId === user.id)) {
      await interaction.editReply({
        content: '❌ You are already participating in this game.',
      });
      return;
    }

    const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
    if (maxPlayers && participants.length >= maxPlayers) {
      await interaction.editReply({
        content: '❌ This game is already full.',
      });
      return;
    }

    // Join the game
    await joinScheduledGame(user.id, user.displayName || user.username, gameId);

    const updatedGame = await getGameById(gameId);
    const updatedParticipants = updatedGame.participants || [];

    // Schedule reminder with custom time (if not 0)
    if (reminderMinutes > 0) {
      await scheduleReminderForGame(user.id, updatedGame, reminderMinutes);
    }

    const embed = createGameEmbed(updatedGame, updatedParticipants);
    const buttons = createGameButtons(gameId, true);

    const reminderText = reminderMinutes > 0 
      ? `\n⏰ Reminder set for ${reminderMinutes} minute${reminderMinutes !== 1 ? 's' : ''} before the game.`
      : '';

    await interaction.editReply({
      content: `✅ Successfully joined the game!${reminderText}`,
      embeds: [embed],
      components: [buttons],
    });

    logger.info(`User ${user.username} joined game ${gameId} with ${reminderMinutes > 0 ? `${reminderMinutes} minute` : 'no'} reminder`);

  } catch (error) {
    logger.error('Failed to handle reminder selection', error);
    await interaction.editReply({
      content: `❌ Failed to join game: ${error.message}`,
    });
  }
}
