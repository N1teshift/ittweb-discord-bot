# **Add Bot Authentication Support for Discord Join/Leave Operations**

## **Description**

The Discord bot needs to allow users to join/leave scheduled games directly through Discord commands and buttons. The current API endpoints (`/api/games/[id]/join` and `/api/games/[id]/leave`) require NextAuth sessions, but the Discord bot cannot create or access these sessions since it only has access to Discord user IDs.

## **What Needs to be Implemented**

### **1. New Environment Variable**
Add this to the website's environment variables:
```
BOT_API_KEY=your-secure-api-key-here
```
**Important**: Use the **same API key** that will be added to the Discord bot's `.env` file.

### **2. Create Bot-Specific API Endpoints**

Create two new API endpoint files in `/pages/api/games/[id]/`:

#### **`/pages/api/games/[id]/join-bot.ts`**
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { joinGame } from '@/features/modules/games/lib/gameService';
import { getUserDataByDiscordIdServer } from '@/features/infrastructure/lib/userDataService.server';
import { createComponentLogger } from '@/features/infrastructure/logging';

const logger = createComponentLogger('api/games/[id]/join-bot');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate bot API key
    const botKey = req.headers['x-bot-api-key'];
    if (!botKey || botKey !== process.env.BOT_API_KEY) {
      logger.warn('Invalid or missing bot API key');
      return res.status(401).json({ error: 'Invalid bot API key' });
    }

    const gameId = req.query.id as string;
    const { discordId, displayName } = req.body;

    // Validate required fields
    if (!gameId || !discordId || !displayName) {
      return res.status(400).json({ error: 'Missing required fields: gameId, discordId, displayName' });
    }

    // Validate Discord user exists in our system
    const user = await getUserDataByDiscordIdServer(discordId);
    if (!user) {
      logger.warn('Discord user not found in system', { discordId });
      return res.status(404).json({ error: 'User not found. Please visit the website first to create your account.' });
    }

    // Join the game
    await joinGame(gameId, discordId, displayName);

    logger.info('Bot successfully joined game', { gameId, discordId });
    res.status(200).json({ success: true });

  } catch (error) {
    const err = error as Error;
    logger.error('Bot join game failed', err, { gameId: req.query.id, discordId: req.body?.discordId });

    // Handle specific error types with appropriate HTTP status codes
    if (err.message.includes('already a participant')) {
      return res.status(409).json({ error: 'User is already a participant in this game' });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (err.message.includes('Can only join scheduled games')) {
      return res.status(400).json({ error: 'Can only join scheduled games' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}
```

#### **`/pages/api/games/[id]/leave-bot.ts`**
```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { leaveGame } from '@/features/modules/games/lib/gameService';
import { getUserDataByDiscordIdServer } from '@/features/infrastructure/lib/userDataService.server';
import { createComponentLogger } from '@/features/infrastructure/logging';

const logger = createComponentLogger('api/games/[id]/leave-bot');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate bot API key
    const botKey = req.headers['x-bot-api-key'];
    if (!botKey || botKey !== process.env.BOT_API_KEY) {
      logger.warn('Invalid or missing bot API key');
      return res.status(401).json({ error: 'Invalid bot API key' });
    }

    const gameId = req.query.id as string;
    const { discordId } = req.body;

    // Validate required fields
    if (!gameId || !discordId) {
      return res.status(400).json({ error: 'Missing required fields: gameId, discordId' });
    }

    // Validate Discord user exists in our system
    const user = await getUserDataByDiscordIdServer(discordId);
    if (!user) {
      logger.warn('Discord user not found in system', { discordId });
      return res.status(404).json({ error: 'User not found in system' });
    }

    // Leave the game
    await leaveGame(gameId, discordId);

    logger.info('Bot successfully left game', { gameId, discordId });
    res.status(200).json({ success: true });

  } catch (error) {
    const err = error as Error;
    logger.error('Bot leave game failed', err, { gameId: req.query.id, discordId: req.body?.discordId });

    // Handle specific error types
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: 'Game not found' });
    }
    if (err.message.includes('Can only leave scheduled games')) {
      return res.status(400).json({ error: 'Can only leave scheduled games' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}
```

## **Security Considerations**
- **API Key Protection**: Store `BOT_API_KEY` securely and never commit it to version control
- **Rate Limiting**: Consider adding rate limiting to prevent abuse
- **User Validation**: Always validate that the Discord user exists in our system before allowing join/leave operations
- **Request Logging**: Log all bot requests for debugging and security monitoring

## **Testing Requirements**
Create comprehensive tests for the new endpoints in `__tests__/api/games/[id]/`:

**Test scenarios to cover:**
- ✅ Valid bot requests with correct API key
- ❌ Invalid/missing API key
- ❌ Missing required fields (discordId, displayName, gameId)
- ❌ Discord user not found in system
- ❌ Game not found
- ❌ Game not in scheduled state
- ❌ User already joined/left
- ❌ Game is full (2+ players)

## **Expected API Contract**

**Join Request:**
```javascript
POST /api/games/{gameId}/join-bot
Headers: {
  'x-bot-api-key': 'your-api-key',
  'Content-Type': 'application/json'
}
Body: {
  discordId: '123456789012345678',
  displayName: 'John Doe'
}
```

**Leave Request:**
```javascript
POST /api/games/{gameId}/leave-bot
Headers: {
  'x-bot-api-key': 'your-api-key',
  'Content-Type': 'application/json'
}
Body: {
  discordId: '123456789012345678'
}
```

**Success Response:**
```json
{ "success": true }
```

**Error Response:**
```json
{ "error": "Human readable error message" }
```

## **Acceptance Criteria**
- [ ] Add `BOT_API_KEY` environment variable to production
- [ ] Deploy new API endpoints
- [ ] Test endpoints manually with curl/Postman
- [ ] Run test suite
- [ ] Update API documentation if applicable
- [ ] Notify Discord bot maintainer that endpoints are ready

## **Priority**
HIGH - This blocks the Discord bot's join/leave functionality.

## **Estimated Effort**
2-3 hours including testing.

---

## **Labels**
enhancement, discord-integration, api, backend

## **Additional Context**
This change enables Discord users to join/leave scheduled games directly through Discord commands and buttons, eliminating the need to visit the website for these operations. The Discord bot code is already ready and waiting for these API endpoints to be deployed.
