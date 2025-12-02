# Add Bot-Specific Scheduling Endpoint for Discord Bot

## Summary

The Discord bot for Island Troll Tribes can now successfully list scheduled games and join/leave them using the new bot-specific endpoints (/api/games/[id]/join-bot, /api/games/[id]/leave-bot). However, scheduling new games from Discord (/schedule) still fails because the existing POST /api/games endpoint requires a NextAuth session, which the bot cannot obtain.

This issue tracks adding a **bot-specific scheduling endpoint** so users can schedule games directly from Discord, in a way that is consistent and secure with the current architecture.

## Current Behavior

- Discord bot is running in a separate Node.js project (ittweb-discord-bot).
- /games command works:
  - Lists upcoming scheduled games via GET /api/games?gameState=scheduled&limit=20.
  - Lets users select a game and join/leave using bot endpoints.
- Join/leave flows use bot endpoints as designed:
  - POST /api/games/[id]/join-bot
  - POST /api/games/[id]/leave-bot
- When the bot tries to schedule a game via:
  - POST /api/games with { gameState: 'scheduled', scheduledDateTime, timezone, teamSize, gameType, ... }
  - The API rejects it because createGetPostHandler requires an authenticated NextAuth session (context.session), which the bot does not have.
- From the bot side this surfaces as:

`	ext
Failed to schedule game: Failed to create game: { success:false,error:Internal server error}
`

## Desired Behavior

- The Discord bot should be able to **create scheduled games** without a browser login, using a **bot API key** and the users Discord ID.
- The endpoint should:
  - Validate the bot via x-bot-api-key against process.env.BOT_API_KEY.
  - Validate the Discord user exists in the ITT user system.
  - Accept scheduling parameters similar to the current POST /api/games scheduled path.
  - Create a scheduled game document in Firestore using the existing createScheduledGame logic.
  - Optionally add the creator as an initial participant.

## Proposed API Design

### 1. New Endpoint

Create a new file, for example:

- src/pages/api/games/schedule-bot.ts

Example implementation sketch:

`	s
import type { NextApiRequest, NextApiResponse } from 'next';
import { createComponentLogger } from '@/features/infrastructure/logging';
import { getUserDataByDiscordIdServer } from '@/features/infrastructure/lib/userDataService.server';
import { createScheduledGame } from '@/features/modules/games/lib/gameService';
import type { CreateScheduledGame } from '@/features/modules/games/types';

const logger = createComponentLogger('api/games/schedule-bot');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Validate bot API key
    const botKey = req.headers['x-bot-api-key'];
    if (!botKey || botKey !== process.env.BOT_API_KEY) {
      logger.warn('Invalid or missing bot API key');
      return res.status(401).json({ success: false, error: 'Invalid bot API key' });
    }

    const {
      discordId,
      displayName,
      scheduledDateTime,
      timezone = 'UTC',
      teamSize,
      gameType,
      gameVersion,
      gameLength,
      modes = [],
      addCreatorToParticipants = true,
    } = req.body as {
      discordId: string;
      displayName: string;
      scheduledDateTime: string;
      timezone?: string;
      teamSize: string;
      gameType: string;
      gameVersion?: string;
      gameLength?: number;
      modes?: string[];
      addCreatorToParticipants?: boolean;
    };

    if (!discordId || !displayName || !scheduledDateTime || !timezone || !teamSize || !gameType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: discordId, displayName, scheduledDateTime, timezone, teamSize, gameType',
      });
    }

    // Validate user exists in our system
    const user = await getUserDataByDiscordIdServer(discordId);
    if (!user) {
      logger.warn('Discord user not found in system', { discordId });
      return res.status(404).json({
        success: false,
        error: 'User not found. Please visit the website first to create your account.',
      });
    }

    // Build CreateScheduledGame payload
    const gameData: CreateScheduledGame = {
      scheduledDateTime,
      scheduledDateTimeString: scheduledDateTime,
      timezone,
      teamSize: teamSize as any,
      gameType: gameType as any,
      gameVersion,
      gameLength,
      modes: modes as any[],
      creatorName: displayName,
      createdByDiscordId: discordId,
    };

    if (addCreatorToParticipants) {
      gameData.participants = [
        {
          discordId,
          name: displayName,
          joinedAt: new Date().toISOString(),
        },
      ] as any;
    }

    const gameId = await createScheduledGame(gameData);

    logger.info('Scheduled game created via bot', {
      gameId,
      scheduledDateTime,
      discordId,
    });

    return res.status(200).json({ success: true, data: { id: gameId } });
  } catch (error) {
    const err = error as Error;
    logger.error('Bot scheduled game creation failed', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
`

### 2. Environment Variable

Ensure BOT_API_KEY is set in the ittweb project (and kept in sync with the ittweb-discord-bot project):

`env
BOT_API_KEY=your-secure-bot-api-key
`

### 3. Discord Bot Integration (already prepared)

In the ittweb-discord-bot project, the /schedule command can be wired to call:

`http
POST https://www.islandtrolltribes.com/api/games/schedule-bot
Headers: {
  'Content-Type': 'application/json',
  'x-bot-api-key': BOT_API_KEY,
}
Body: {
  discordId: interaction.user.id,
  displayName: interaction.user.displayName || interaction.user.username,
  scheduledDateTime: <ISO string in UTC>,
  timezone: 'UTC',
  teamSize: '1v1',
  gameType: 'normal',
  gameVersion: 'v3.28',
  gameLength: 1800,
  modes: [],
  addCreatorToParticipants: true,
}
`

Once this endpoint exists, the bots /schedule command can be re-enabled to create scheduled games directly from Discord.

## Acceptance Criteria

- [ ] New endpoint (e.g. POST /api/games/schedule-bot) is implemented.
- [ ] Endpoint validates x-bot-api-key against process.env.BOT_API_KEY.
- [ ] Endpoint validates that the provided discordId exists in the ITT user system.
- [ ] Endpoint successfully creates a scheduled game using existing game service logic.
- [ ] Endpoint returns { success: true, data: { id: <internalGameId> } } on success.
- [ ] Discord bot /schedule can be wired to this endpoint and successfully create games without NextAuth session.

## Notes

- This design mirrors the already planned/implemented bot endpoints for joining/leaving games and keeps the separation between browser-based auth (NextAuth) and bot-based auth (API key + Discord ID).
- If you prefer to extend the existing POST /api/games instead of adding a new route, the core requirements remain the same: detect bot requests via API key, bypass NextAuth for them, and use the provided Discord identity.
