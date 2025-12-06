/**
 * Date and time formatting utilities
 */

/**
 * Format a date string or object to a standard display format
 * @param {string|Date} dateInput - Date to format
 * @param {string} timeZone - Timezone (default: UTC)
 * @returns {string} Formatted date string
 */
export function formatGameTime(dateInput, timeZone = 'UTC') {
    if (!dateInput) return 'Unknown Time';

    const date = new Date(dateInput);

    return date.toLocaleString('en-US', {
        timeZone,
        weekday: 'short', // Mon
        month: 'short',   // Jan
        day: 'numeric',   // 1
        hour: '2-digit',  // 08
        minute: '2-digit',// 00
        hour12: true,     // PM
    });
}

/**
 * Format relative time (e.g. "in 2h 30m" or "5m ago")
 * @param {string|Date} dateInput 
 * @returns {string} Relative time string
 */
export function formatTimeUntil(dateInput) {
    if (!dateInput) return '';

    const target = new Date(dateInput);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();

    const minutesTotal = Math.round(Math.abs(diffMs) / 60000);
    const hours = Math.floor(minutesTotal / 60);
    const minutes = minutesTotal % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    if (diffMs > 0) {
        return `in ${parts.join(' ')}`;
    }
    return `${parts.join(' ')} ago`;
}
