import fetch from 'node-fetch';
import { WC3STATS_API_BASE } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Fetch active game lobbies from wc3stats API
 * @returns {Promise<Array>} Array of game objects
 */
export async function fetchActiveLobbies() {
  const apiUrl = `${WC3STATS_API_BASE}/gamelist`;
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ITT-Discord-Bot/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`wc3stats API returned ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check if response is valid
    if (data.status !== 'OK' || !Array.isArray(data.body)) {
      throw new Error('Invalid API response structure');
    }

    return data.body;
  } catch (error) {
    logger.error('Failed to fetch active lobbies from wc3stats', error, {
      apiUrl,
      errorMessage: error.message,
    });
    throw error;
  }
}

/**
 * Filter games for Island Troll Tribes maps
 * @param {Array} games - Array of game objects from API
 * @returns {Array} Filtered array of ITT games
 */
export function filterITTGames(games) {
  if (!Array.isArray(games)) {
    return [];
  }

  return games.filter(game => {
    const map = (game.map || '').toLowerCase();
    return map.startsWith('island.troll.tribes');
  });
}

