// Get max players from team size string (e.g., "2v2" -> 4)
export function getMaxPlayersFromTeamSize(teamSize) {
  if (!teamSize || typeof teamSize !== 'string') return null;

  const match = teamSize.match(/(\d+)\s*v\s*(\d+)/i);
  if (!match) return null;

  const left = parseInt(match[1], 10);
  const right = parseInt(match[2], 10);

  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return left + right;
}

