import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { getMaxPlayersFromTeamSize } from '../utils/game.js';
import { formatGameTime } from '../utils/format.js';

export function buildGamesSelectMenu(games) {
  const options = [];

  for (const game of games) {
    if (!game || !game.gameId || !game.id) continue;

    const rawDate = game.scheduledDateTimeString || game.scheduledDateTime;
    const gameTime = formatGameTime(rawDate);

    const participants = game.participants || [];
    const maxPlayers = getMaxPlayersFromTeamSize(game.teamSize);
    const playersValue = maxPlayers
      ? `${participants.length}/${maxPlayers}`
      : `${participants.length}`;

    options.push({
      label: `Game #${game.gameId} • ${game.teamSize} ${game.gameType}`,
      description: `${gameTime} UTC • ${playersValue} players`,
      value: String(game.id),
    });

    if (options.length >= 25) break;
  }

  if (options.length === 0) {
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('games_select')
    .setPlaceholder('Choose a game to view details and join/leave')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(select);
}

