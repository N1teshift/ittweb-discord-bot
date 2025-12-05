import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  ensureUserExists,
  getScheduledGames,
  getGameById,
  getScheduledGameByPublicId,
  joinScheduledGame,
  leaveScheduledGame,
} from '../api.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { createGameEmbed, createGameButtons } from '../components/embeds.js';
import { buildJoinSelectMenu, buildGamesSelectMenu } from '../components/menus.js';
import { scheduleReminderForGame } from './reminders.js';
import { logger } from '../utils/logger.js';
import { formatGameTime } from '../utils/format.js';

export async function handleSlashCommand(interaction) {
  const { commandName, user } = interaction;

  try {
    switch (commandName) {
      case 'games':
        await handleGamesCommand(interaction, user);
        break;
      case 'join':
        await handleJoinCommand(interaction, user);
        break;
      case 'leave':
        await handleLeaveCommand(interaction, user);
        break;
    }
  } catch (error) {
    logger.error(`Error handling command ${commandName}`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An unexpected error occurred.', ephemeral: true });
    } else {
      await interaction.followUp({ content: 'An unexpected error occurred.', ephemeral: true });
    }
  }
}

async function handleGamesCommand(interaction, user) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
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

async function handleJoinCommand(interaction, user) {
  const gameId = interaction.options.getString('game_id');

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  await ensureUserExists(user.id, user.displayName || user.username);

  try {
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
        components: [selectRow],
      });
      return;
    }

    let game;
    let internalGameId = gameId;

    if (/^\d+$/.test(gameId)) {
      game = await getScheduledGameByPublicId(parseInt(gameId, 10));
      internalGameId = game.id;
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

    const participants = game.participants || [];
    if (participants.some((p) => p.discordId === user.id)) {
      await interaction.editReply({
        content: '❌ You are already participating in this game.',
      });
      return;
    }

    if (participants.length >= 2) {
      await interaction.editReply({
        content: '❌ This game is already full (2 players maximum).',
      });
      return;
    }

    await joinScheduledGame(user.id, user.displayName || user.username, internalGameId);

    const updatedGame = await getGameById(internalGameId);
    const updatedParticipants = updatedGame.participants || [];

    // Schedule reminder
    await scheduleReminderForGame(user.id, updatedGame);

    const embed = createGameEmbed(updatedGame, updatedParticipants);
    const buttons = createGameButtons(internalGameId, true);

    await interaction.editReply({
      content: '✅ Successfully joined the game!',
      embeds: [embed],
      components: [buttons],
    });

    logger.info(`User ${user.username} joined game ${internalGameId}`);

  } catch (error) {
    logger.error('Failed to join game', error);
    await interaction.editReply({ content: `❌ Failed to join game: ${error.message}` });
  }
}

async function handleLeaveCommand(interaction, user) {
  const gameId = interaction.options.getString('game_id');

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  await ensureUserExists(user.id, user.displayName || user.username);

  try {
    let game;
    let internalGameId = gameId;

    if (/^\d+$/.test(gameId)) {
      game = await getScheduledGameByPublicId(parseInt(gameId, 10));
      internalGameId = game.id;
    } else {
      game = await getGameById(gameId);
      internalGameId = game.id || gameId;
    }

    if (game.gameState !== 'scheduled') {
      await interaction.editReply({ content: '❌ This game is not currently scheduled.' });
      return;
    }

    const participants = game.participants || [];
    if (!participants.some((p) => p.discordId === user.id)) {
      await interaction.editReply({
        content: '❌ You are not participating in this game.',
      });
      return;
    }

    await leaveScheduledGame(user.id, internalGameId);

    const updatedGame = await getGameById(internalGameId);
    const updatedParticipants = updatedGame.participants || [];

    const embed = createGameEmbed(updatedGame, updatedParticipants);
    const buttons = createGameButtons(internalGameId, false);

    await interaction.editReply({
      content: '✅ Successfully left the game.',
      embeds: [embed],
      components: [buttons],
    });

    logger.info(`User ${user.username} left game ${internalGameId}`);

  } catch (error) {
    logger.error('Failed to leave game', error);
    await interaction.editReply({ content: `❌ Failed to leave game: ${error.message}` });
  }
}

