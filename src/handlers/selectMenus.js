import {
  ensureUserExists,
  getGameById,
  joinScheduledGame,
} from '../api.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { handleScheduleSelectMenu } from './schedule.js';
import { scheduleReminderForGame } from './reminders.js';

export async function handleSelectMenu(interaction) {
  const { customId, values, user } = interaction;

  await ensureUserExists(user.id, user.displayName || user.username);

  // Handle schedule flow select menus
  if (customId.startsWith('schedule_')) {
    await handleScheduleSelectMenu(interaction);
    return;
  }

  const gameId = values[0];

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
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

    // join_select: auto-join the selected game
    if (customId === 'join_select') {
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
        await interaction.editReply({ content: '❌ This game is already full.' });
        return;
      }

      await joinScheduledGame(user.id, user.displayName || user.username, gameId);

    const updatedGame = await getGameById(gameId);
    const updatedParticipants = updatedGame.participants || [];

    // scheduleReminderForGame(user.id, updatedGame); // DISABLED

      const embed = createGameEmbed(updatedGame, updatedParticipants);
      const buttons = createGameButtons(gameId, true);

      await interaction.editReply({
        content: '✅ Successfully joined the game!',
        embeds: [embed],
        components: [buttons],
      });
      return;
    }
  } catch (error) {
    await interaction.editReply({
      content: `❌ Failed to join game: ${error.message}`,
    });
  }
}

