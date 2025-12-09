# wc3stats API Verification Results

## ✅ Verified Endpoint

**URL**: `https://api.wc3stats.com/gamelist`

**Method**: `GET`

**Response Format**: JSON

## 📊 Response Structure

```json
{
  "status": "OK",
  "code": 200,
  "queryTime": 0.0009,
  "body": [
    {
      "id": 38658,
      "name": "Game Name",
      "hash": "e276e67db6308f7b893a8d5525f5964d0b6ed959",
      "server": "eu",
      "host": "PlayerName#1234",
      "map": "MapName.w3x",
      "created": 1765307129,
      "firstSeen": 1765307131,
      "isOfficial": false,
      "uptime": 3,
      "slotsTaken": 4,
      "slotsTotal": 15
    }
  ]
}
```

## 📝 Game Object Fields

| Field | Type | Description | Usage |
|-------|------|-------------|-------|
| `id` | number | Unique lobby identifier | **Use for deduplication** |
| `name` | string | Game lobby name | Display in notification |
| `hash` | string | Map hash | Alternative unique identifier |
| `server` | string | Server region (e.g., "eu", "us", "asia") | Display in notification |
| `host` | string | Host player name with battle tag | Display in notification |
| `map` | string | Map filename (e.g., "Island.Troll.Tribes.v3.28.w3x") | **Use for filtering ITT games** |
| `created` | number | Unix timestamp when lobby was created | Calculate lobby age |
| `firstSeen` | number | Unix timestamp when first seen | Alternative timestamp |
| `isOfficial` | boolean | Whether it's an official Blizzard server | Optional filter |
| `uptime` | number | Seconds since lobby was created | Display in notification |
| `slotsTaken` | number | Current player count | Display in notification |
| `slotsTotal` | number | Maximum player slots | Display in notification |

## 🎮 ITT Game Filtering

**Filter Logic**:
```javascript
const ittGames = games.filter(game => {
  const map = (game.map || '').toLowerCase();
  return map.startsWith('island.troll.tribes');
});
```

**Note**: The `map` field contains the full filename (e.g., "Island.Troll.Tribes.v3.28.w3x"), so checking if it starts with "Island.Troll.Tribes" will catch all ITT variants.

## 🔑 Deduplication Strategy

**Recommended**: Use `id` field as unique identifier
- Each lobby has a unique numeric `id`
- Store notified lobby IDs in Firebase
- Check before posting notification

**Alternative**: Use `hash` field if `id` is not reliable
- Map hash is also unique per lobby instance

## ⚙️ Implementation Details

### API Request
```javascript
const response = await fetch('https://api.wc3stats.com/gamelist', {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'User-Agent': 'ITT-Discord-Bot/1.0',
  },
});

const data = await response.json();
const games = data.body; // Games are in the 'body' field
```

### Rate Limiting
- **No rate limits detected** during testing
- Recommended polling interval: **60 seconds** (same as reminders)
- Can be adjusted via `LOBBY_CHECK_INTERVAL` config

### Error Handling
- API returns HTTP 200 with JSON
- Check `data.status === "OK"` for success
- Handle network errors gracefully
- Log API errors but don't crash bot

## 📋 Sample ITT Game Data

When an ITT game is found, it will have this structure:
```json
{
  "id": 12345,
  "name": "ITT Game",
  "hash": "abc123...",
  "server": "us",
  "host": "PlayerName#1234",
  "map": "Island.Troll.Tribes.v3.28.w3x",
  "created": 1765307129,
  "firstSeen": 1765307131,
  "isOfficial": false,
  "uptime": 120,
  "slotsTaken": 2,
  "slotsTotal": 12
}
```

## ✅ Verification Status

- ✅ Endpoint URL confirmed
- ✅ Response structure documented
- ✅ Field names identified
- ✅ ITT filtering logic tested
- ✅ Deduplication strategy defined
- ✅ No authentication required
- ✅ No rate limits detected

## 🚀 Ready for Implementation

All API details are verified and ready to implement the lobby monitoring feature!

