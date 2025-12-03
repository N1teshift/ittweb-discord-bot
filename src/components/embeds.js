import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ITT_API_BASE } from '../config.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { formatTimeUntil } from '../utils/time.js';

export function createGameEmbed(game, participants = []) {
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
  const playersValue = maxPlayers
    ? `${participants.length}/${maxPlayers}`
    : `${participants.length}`;
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
      value: participants.map((p) => p.name).join('\n') || 'None yet',
      inline: false,
    });
  }

  return embed;
}

export function createGameButtons(gameId, userJoined = false) {
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

