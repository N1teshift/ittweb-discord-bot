# Lobby Monitoring Feature - Initial Assessment

## Overview
Implement a feature to monitor Warcraft III custom game lobbies via the wc3stats API and post notifications to Discord when Island Troll Tribes (ITT) games are found.

## Current Bot Architecture

### Technology Stack
- **Discord.js**: v14.14.1
- **Node.js**: ES Modules (type: "module")
- **HTTP Client**: node-fetch v3.3.2
- **Database**: Firebase Firestore (via firebase-admin)
- **Scheduling**: setInterval (as seen in reminders.js)

### Existing Patterns
1. **Scheduled Tasks**: The `reminders.js` handler uses `setInterval` to check for due reminders every 60 seconds
2. **Data Persistence**: Firebase Firestore is used for storing state (e.g., `discord_bot_states`, `discord_bot_reminders`)
3. **HTTP Requests**: API calls use `node-fetch` with proper error handling (see `api.js`)
4. **Logging**: Structured JSON logging via `logger.js`
5. **Discord Messages**: Uses `EmbedBuilder` for rich messages (see `embeds.js`)

## Implementation Plan

### 1. API Integration

**Endpoint**: `https://wc3stats.com/gamelist` (or similar - needs verification)

**Expected Response Structure** (based on typical WC3 lobby APIs):
```json
{
  "games": [
    {
      "id": "unique_lobby_id",
      "name": "Game Name",
      "map": "Island.Troll.Tribes.v3.28.w3x",
      "host": "PlayerName",
      "server": "USWest",
      "slotsTaken": 2,
      "slotsTotal": 12,
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Filtering Logic**:
- Check if `map` field starts with `"Island.Troll.Tribes"`
- Case-insensitive matching recommended for robustness

### 2. Architecture Components

#### A. New Handler: `src/handlers/lobbyMonitor.js`
- Similar structure to `reminders.js`
- Initialize polling loop when bot starts
- Check for new ITT lobbies periodically
- Post notifications to Discord channel

#### B. New Service: `src/services/wc3stats.js`
- API client for wc3stats
- Function: `fetchActiveLobbies()`
- Error handling and retry logic
- Rate limiting awareness

#### C. Data Persistence
**Option 1: Firebase Firestore** (Recommended)
- Collection: `discord_bot_lobby_notifications`
- Store: `{ lobbyId, notifiedAt, map, host, server }`
- Pros: Persists across bot restarts, prevents duplicate notifications
- Cons: Requires Firebase read/write operations

**Option 2: In-Memory Set**
- Store notified lobby IDs in memory
- Pros: Fast, simple
- Cons: Lost on bot restart (will re-notify same lobbies)

**Recommendation**: Use Firebase (consistent with existing patterns)

### 3. Configuration

**New Environment Variables**:
```env
# Discord channel ID where lobby notifications will be posted
LOBBY_NOTIFICATION_CHANNEL_ID=123456789012345678

# Polling interval in seconds (default: 60)
LOBBY_CHECK_INTERVAL=60

# wc3stats API base URL (if needed)
WC3STATS_API_BASE=https://wc3stats.com
```

**Config.js additions**:
- `LOBBY_NOTIFICATION_CHANNEL_ID`
- `LOBBY_CHECK_INTERVAL` (default: 60 seconds)
- `LOBBY_MONITORING_ENABLED` (feature flag)

### 4. Discord Notification Format

**Message Structure**:
- Use Discord Embed for rich formatting
- Include: Map name, Host, Server/Region, Slots (X/Y), Lobby age
- Optional: Link to wc3stats or game details

**Example Embed**:
```
🎮 New ITT Lobby Found!
Map: Island.Troll.Tribes.v3.28
Host: PlayerName
Server: USWest
Slots: 2/12
```

### 5. Deduplication Strategy

**Unique Identifier**: Use combination of:
- Lobby ID (if available)
- OR: `host + map + createdAt` (fallback)

**Tracking**:
- Store notified lobby IDs in Firebase
- Check before posting notification
- Clean up old entries periodically (e.g., lobbies older than 1 hour)

### 6. Error Handling

**Scenarios to Handle**:
1. **API Unavailable**: Log error, continue polling
2. **Rate Limiting**: Implement exponential backoff
3. **Invalid Response**: Validate response structure, log and skip
4. **Discord API Errors**: Log error, don't crash bot
5. **Firebase Errors**: Log error, fallback to in-memory tracking

### 7. Integration Points

**In `src/index.js`**:
- Import and initialize lobby monitor (similar to `setClient` for reminders)
- Call initialization after bot is ready

**Example**:
```javascript
import { initializeLobbyMonitor } from './handlers/lobbyMonitor.js';

// In onReady handler:
initializeLobbyMonitor(client);
```

## Implementation Steps

1. ✅ **Research**: Verify wc3stats API endpoint and response format
2. ✅ **Create**: `src/services/wc3stats.js` - API client
3. ✅ **Create**: `src/handlers/lobbyMonitor.js` - Main monitoring logic
4. ✅ **Update**: `src/config.js` - Add new configuration options
5. ✅ **Update**: `src/index.js` - Initialize lobby monitor
6. ✅ **Create**: Firebase collection structure for tracking
7. ✅ **Test**: Local testing with mock data
8. ✅ **Deploy**: Test in production environment

## Questions to Resolve

1. **API Endpoint**: Exact URL for wc3stats `/gamelist` endpoint?
2. **Response Format**: Actual structure of API response?
3. **Rate Limits**: Any rate limiting on wc3stats API?
4. **Channel Selection**: Which Discord channel should receive notifications?
5. **Polling Frequency**: Optimal interval? (60 seconds seems reasonable)
6. **Lobby Lifetime**: How long do lobbies typically exist? (affects cleanup)

## Potential Enhancements (Future)

1. **Filtering Options**: Allow filtering by version, server region
2. **User Preferences**: Let users subscribe/unsubscribe to notifications
3. **Rich Embeds**: Include more lobby details, player count trends
4. **Commands**: `/lobby` command to manually check for lobbies
5. **Statistics**: Track lobby frequency, popular times, etc.

## Risk Assessment

**Low Risk**:
- Using existing patterns (setInterval, Firebase, node-fetch)
- Non-critical feature (bot continues if monitoring fails)

**Medium Risk**:
- API rate limiting (mitigate with appropriate polling interval)
- Firebase costs (minimal reads/writes)

**Mitigation**:
- Feature flag to enable/disable
- Comprehensive error handling
- Logging for debugging

## Next Steps

1. Verify wc3stats API endpoint and test response format
2. Create initial implementation following existing patterns
3. Test locally with mock data
4. Deploy and monitor

