import { MessageFlags } from 'discord.js';
import {
  ensureUserExists,
  getGameById,
} from '../api.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { handleScheduleSelectMenu } from './schedule.js';
import { logger } from '../utils/logger.js';

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
