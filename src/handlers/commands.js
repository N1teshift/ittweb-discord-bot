import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import {
  ensureUserExists,
  getScheduledGames,
  getGameById,
} from '../api.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { buildGamesSelectMenu } from '../components/menus.js';
import { logger } from '../utils/logger.js';
import { formatGameTime } from '../utils/format.js';

export async function handleSlashCommand(interaction) {
  const { commandName, user } = interaction;

  try {
    switch (commandName) {
      case 'games':
        await handleGamesCommand(interaction, user);
        break;
    }
  } catch (error) {
    logger.error(`Error handling command ${commandName}`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An unexpected error occurred.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.followUp({ content: 'An unexpected error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleGamesCommand(interaction, user) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  await ensureUserExists(user.id, user.displayName || user.username);

  try {
    const games = await getScheduledGames();

    const scheduleButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('schedule_game')
        .setLabel('📅 Schedule New Game')
        .setStyle(ButtonStyle.Primary)
    );

    if (games.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🎮 Upcoming Games')
        .setDescription('No upcoming games scheduled.')
        .setColor(0x0099ff);

      await interaction.editReply({
        embeds: [embed],
        components: [scheduleButton],
      });
      return;
    }

    const embed = new EmbedBuilder().setTitle('🎮 Upcoming Games').setColor(0x0099ff);

    let description = '';
    for (const game of games.slice(0, 10)) {
      const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
      const gameTime = formatGameTime(rawDate);

      const participants = game.participants || [];
      const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
      const playersValue = maxPlayers
        ? `${participants.length}/${maxPlayers}`
        : `${participants.length}`;
      const youTag = participants.some((p) => p.discordId === user.id)
        ? ' **(You are in this game)**'
        : '';

      description += `**Game #${game.gameId}**: ${game.teamSize} ${game.gameType} at ${gameTime} UTC (${playersValue} players)${youTag}\n`;
    }

    embed.setDescription(description);

    const selectRow = buildGamesSelectMenu(games);

    await interaction.editReply({
      embeds: [embed],
      components: selectRow ? [selectRow, scheduleButton] : [scheduleButton],
    });
  } catch (error) {
    logger.error('Failed to fetch games', error);
    await interaction.editReply({ content: `❌ Failed to fetch games: ${error.message}` });
  }
}


