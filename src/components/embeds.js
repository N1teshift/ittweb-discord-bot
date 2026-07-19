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
 * Extract version from map name
 * Examples: "Island.Troll.Tribes.v3.29c.w3x" -> "v3.29c"
 *           "Island.Troll.Tribes.v3.30.6.w3x" -> "v3.30.6"
 * @param {string} mapName - Full map name
 * @returns {string} Version string or "Unknown"
 */
function extractVersion(mapName) {
  if (!mapName) return 'Unknown';

  // v3.28, v3.29c, v3.30.6, v3.30.6a
  const versionMatch = mapName.match(/v\d+(?:\.\d+)+[a-z]?/i);
  return versionMatch ? versionMatch[0] : 'Unknown';
}

const LOBBY_STATE = {
  OPEN: 'OPEN',
  STARTED: 'STARTED',
  ENDED: 'ENDED',
};

const LOBBY_STATE_COLORS = {
  OPEN: 0x00c853,
  STARTED: 0xff9800,
  ENDED: 0x607d8b,
};

const LOBBY_STATE_FOOTERS = {
  OPEN: 'wc3stats.com • Updates automatically',
  STARTED: 'ittweb • Upload the replay when the game finishes',
  ENDED: 'ittweb • Game ended',
};

/**
 * Remove battle tag from host name (e.g., "Scatman33#2333" -> "Scatman33")
 * @param {string} host - Host name with battle tag
 * @returns {string} Host name without battle tag
 */
function removeBattleTag(host) {
  if (!host) return 'Unknown';
  // Split by '#' and take the first part
  return host.split('#')[0];
}

/**
 * Create a Discord embed for a WC3 lobby notification
 * @param {Object} lobby - Lobby object from wc3stats API (or stored snapshot)
 * @param {'OPEN'|'STARTED'|'ENDED'} [state='OPEN'] - Lobby lifecycle state
 * @returns {EmbedBuilder} Discord embed
 */
export function createLobbyEmbed(lobby, state = LOBBY_STATE.OPEN) {
  const normalizedState = LOBBY_STATE[state] || LOBBY_STATE.OPEN;
  const version = extractVersion(lobby.map);
  const hostName = removeBattleTag(lobby.host);
  const serverName = (lobby.server || 'unknown').toUpperCase();
  const slotsTaken = lobby.slotsTaken || 0;
  const slotsTotal = lobby.slotsTotal || 0;
  const slotsText = `${slotsTaken}/${slotsTotal}`;

  const embed = new EmbedBuilder()
    .setTitle(`ITT Lobby · ${normalizedState} (${slotsText})`)
    .setDescription(`**${lobby.name || 'Unnamed Game'}**`)
    .addFields(
      { name: '📡 Status', value: normalizedState, inline: true },
      { name: '📦 Version', value: version, inline: true },
      { name: '👤 Host', value: hostName, inline: true },
      { name: '🌍 Server', value: serverName, inline: true }
    )
    .setColor(LOBBY_STATE_COLORS[normalizedState] || LOBBY_STATE_COLORS.OPEN)
    .setTimestamp(new Date((lobby.created || Date.now() / 1000) * 1000))
    .setFooter({ text: LOBBY_STATE_FOOTERS[normalizedState] || LOBBY_STATE_FOOTERS.OPEN });

  return embed;
}

/**
 * Link buttons for STARTED (upload) / ENDED (view game)
 * @param {'OPEN'|'STARTED'|'ENDED'} state
 * @param {string|null|undefined} ittGameDocumentId - Firestore game document ID
 * @returns {ActionRowBuilder[]}
 */
export function createLobbyComponents(state, ittGameDocumentId) {
  if (!ittGameDocumentId) {
    return [];
  }

  const normalizedState = LOBBY_STATE[state] || LOBBY_STATE.OPEN;
  const baseUrl = `${ITT_API_BASE}/en/games/${ittGameDocumentId}`;

  if (normalizedState === LOBBY_STATE.STARTED) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Upload replay')
          .setStyle(ButtonStyle.Link)
          .setURL(`${baseUrl}?upload=1`)
      ),
    ];
  }

  if (normalizedState === LOBBY_STATE.ENDED) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('View game')
          .setStyle(ButtonStyle.Link)
          .setURL(baseUrl)
      ),
    ];
  }

  return [];
}

/**
 * Extract map version for API payloads (public helper)
 * @param {string} mapName
 * @returns {string|undefined}
 */
export function extractMapVersion(mapName) {
  const version = extractVersion(mapName);
  return version === 'Unknown' ? undefined : version;
}

/**
 * Format duration in seconds to readable format (e.g., "15m 30s")
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Safely parse a date from various formats (Firestore Timestamp, ISO string, Unix timestamp, etc.)
 * @param {any} dateValue - Date value in various formats
 * @returns {Date} Valid Date object or current date as fallback
 */
function parseDate(dateValue) {
  if (!dateValue) {
    return new Date();
  }
  
  // If it's already a Date object
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? new Date() : dateValue;
  }
  
  // If it's a Firestore Timestamp object (has toDate method)
  if (dateValue && typeof dateValue.toDate === 'function') {
    try {
      return dateValue.toDate();
    } catch (error) {
      return new Date();
    }
  }
  
  // If it's a Firestore Timestamp object (has seconds and nanoseconds)
  if (dateValue && typeof dateValue.seconds === 'number') {
    try {
      return new Date(dateValue.seconds * 1000 + (dateValue.nanoseconds || 0) / 1000000);
    } catch (error) {
      return new Date();
    }
  }
  
  // If it's a number (Unix timestamp in seconds or milliseconds)
  if (typeof dateValue === 'number') {
    // If it's in seconds (less than year 2000 in milliseconds), convert to milliseconds
    const timestamp = dateValue < 946684800000 ? dateValue * 1000 : dateValue;
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  
  // If it's a string, try to parse it
  if (typeof dateValue === 'string') {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  
  // Fallback to current date
  return new Date();
}

/**
 * Create a comprehensive Discord embed for completed game statistics
 * @param {Object} game - Completed game object with players
 * @returns {EmbedBuilder} Discord embed
 */
export function createCompletedGameEmbed(game) {
  const version = extractVersion(game.map || '');
  const duration = formatDuration(game.duration);
  const players = game.players || [];
  
  // Sort players by pid
  const sortedPlayers = [...players].sort((a, b) => (a.pid || 0) - (b.pid || 0));
  
  // Separate winners and losers (remove battle tags from names)
  const winners = sortedPlayers.filter(p => p.flag === 'winner');
  const losers = sortedPlayers.filter(p => p.flag === 'loser');
  const drawers = sortedPlayers.filter(p => p.flag === 'drawer');
  
  // Build embed
  const gameDate = parseDate(game.datetime || game.createdAt);
  const embed = new EmbedBuilder()
    .setTitle(`Game #${game.gameId} - ${game.gamename || 'Unnamed Game'}`)
    .setColor(0xffd700) // Gold color for completed games
    .setTimestamp(gameDate)
    .setFooter({ text: `Created by ${game.creatorName || 'Unknown'}` });
  
  // Game info fields
  embed.addFields(
    { name: '📦 Version', value: version, inline: true },
    { name: '⏱️ Duration', value: duration, inline: true }
  );
  
  // Results section (with battle tags removed)
  if (winners.length > 0) {
    const winnerNames = winners.map(p => removeBattleTag(p.name)).join(', ');
    embed.addFields({ name: '🏆 Winners', value: winnerNames, inline: false });
  }
  
  if (losers.length > 0) {
    const loserNames = losers.map(p => removeBattleTag(p.name)).join(', ');
    embed.addFields({ name: '💀 Losers', value: loserNames, inline: false });
  }
  
  if (drawers.length > 0) {
    const drawerNames = drawers.map(p => removeBattleTag(p.name)).join(', ');
    embed.addFields({ name: '🤝 Draw', value: drawerNames, inline: false });
  }
  
  // Add link to view full details
  if (game.id) {
    embed.setURL(`${ITT_API_BASE}/games/${game.id}`);
  }
  
  return embed;
}

