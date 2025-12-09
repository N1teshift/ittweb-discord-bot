import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ITT_API_BASE } from '../config.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { formatGameTime, formatTimeUntil } from '../utils/format.js';

export function createGameEmbed(game, participants = []) {
  const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
  const gameTime = formatGameTime(rawDate);

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

/**
 * Create a Discord embed for a WC3 lobby notification
 * @param {Object} lobby - Lobby object from wc3stats API
 * @returns {EmbedBuilder} Discord embed
 */
export function createLobbyEmbed(lobby) {
  const mapName = lobby.map || 'Unknown Map';
  const serverName = (lobby.server || 'unknown').toUpperCase();
  const uptimeMinutes = Math.floor((lobby.uptime || 0) / 60);
  const uptimeSeconds = (lobby.uptime || 0) % 60;
  const uptimeText = uptimeMinutes > 0 
    ? `${uptimeMinutes}m ${uptimeSeconds}s`
    : `${uptimeSeconds}s`;

  const embed = new EmbedBuilder()
    .setTitle('🎮 New ITT Lobby Found!')
    .setDescription(`**${lobby.name || 'Unnamed Game'}**`)
    .addFields(
      { name: '🗺️ Map', value: mapName, inline: true },
      { name: '👤 Host', value: lobby.host || 'Unknown', inline: true },
      { name: '🌍 Server', value: serverName, inline: true },
      { name: '👥 Slots', value: `${lobby.slotsTaken || 0}/${lobby.slotsTotal || 0}`, inline: true },
      { name: '⏱️ Uptime', value: uptimeText, inline: true },
      { name: '🆔 Lobby ID', value: String(lobby.id || 'N/A'), inline: true }
    )
    .setColor(0x00ff00) // Green color for new lobbies
    .setTimestamp(new Date((lobby.created || Date.now() / 1000) * 1000))
    .setFooter({ text: 'wc3stats.com' });

  return embed;
}

