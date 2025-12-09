import fetch from 'node-fetch';
import { ITT_API_BASE, BOT_API_KEY } from './config.js';

export async function ensureUserExists(discordId, displayName) {
  try {
    const createResponse = await fetch(`${ITT_API_BASE}/api/user/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordId,
        name: displayName,
        preferredName: displayName,
        displayName: displayName,
      }),
    });

    if (!createResponse.ok) {
      console.error('Failed to create/update user:', await createResponse.text());
    }
  } catch (error) {
    console.error('Error ensuring user exists:', error);
  }
}

export async function createScheduledGame(
  discordId,
  displayName,
  scheduledDateTime,
  teamSize = '1v1',
  gameType = 'normal',
  gameVersion = 'v3.28',
  gameLength = 1800,
  modes = []
) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/schedule-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({
      discordId,
      displayName,
      scheduledDateTime,
      timezone: 'UTC',
      teamSize,
      gameType,
      gameVersion,
      gameLength,
      modes,
      addCreatorToParticipants: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = 'Unknown error';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error || errorData.message || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Failed to schedule game: ${errorMessage}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`Failed to schedule game: ${result.error || 'Unknown error'}`);
  }

  return result.data?.id;
}

export async function getScheduledGames() {
  const response = await fetch(`${ITT_API_BASE}/api/games?gameState=scheduled&limit=20`);

  if (!response.ok) {
    throw new Error('Failed to fetch games');
  }

  const result = await response.json();
  return result.data?.games || [];
}

export async function getGameById(gameId) {
  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch game');
  }

  const result = await response.json();
  return result.data;
}

export async function getScheduledGameByPublicId(publicGameId) {
  const response = await fetch(
    `${ITT_API_BASE}/api/games?gameState=scheduled&gameId=${publicGameId}&limit=1`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch game by public ID');
  }

  const result = await response.json();
  const games = result.data?.games || [];
  const game = games[0];
  if (!game) {
    throw new Error('Game not found');
  }
  return game;
}

export async function joinScheduledGame(discordId, displayName, gameId) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/join-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({ discordId, displayName }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to join game: ${error}`);
  }

  return await response.json();
}

export async function leaveScheduledGame(discordId, gameId) {
  if (!BOT_API_KEY) {
    throw new Error('Bot API key not configured');
  }

  const response = await fetch(`${ITT_API_BASE}/api/games/${gameId}/leave-bot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bot-api-key': BOT_API_KEY,
    },
    body: JSON.stringify({ discordId }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to leave game: ${error}`);
  }

  return await response.json();
}

/**
 * Get completed games with players from ITT API
 * @param {number} limit - Maximum number of games to fetch
 * @returns {Promise<Array>} Array of completed games with players
 */
export async function getCompletedGames(limit = 10) {
  const response = await fetch(
    `${ITT_API_BASE}/api/games?gameState=completed&limit=${limit}&includePlayers=true`
  );

  if (!response.ok) {
    throw new Error('Failed to fetch completed games');
  }

  const result = await response.json();
  return result.data?.games || [];
}

