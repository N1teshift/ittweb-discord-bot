/**
 * Simple logger utility for consistent logging format
 */

const getTimeString = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

const formatMeta = (meta) => {
    if (!meta || Object.keys(meta).length === 0) {
        return '';
    }
    
    // Filter out undefined values and format the rest
    const filtered = Object.entries(meta)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
                return `${key}=${JSON.stringify(value)}`;
            }
            return `${key}=${value}`;
        });
    
    return filtered.length > 0 ? ` | ${filtered.join(' ')}` : '';
};

const formatError = (error) => {
    if (!error) return '';
    
    if (error instanceof Error) {
        return ` | error: ${error.name}: ${error.message}`;
    }
    
    return ` | error: ${String(error)}`;
};

export const logger = {
    info: (message, meta = {}) => {
        const timeStr = getTimeString();
        const metaStr = formatMeta(meta);
        console.log(`INFO|${timeStr}|${message}${metaStr}`);
    },

    warn: (message, meta = {}) => {
        const timeStr = getTimeString();
        const metaStr = formatMeta(meta);
        console.warn(`WARN|${timeStr}|${message}${metaStr}`);
    },

    error: (message, error = null, meta = {}) => {
        const timeStr = getTimeString();
        const errorStr = formatError(error);
        const metaStr = formatMeta(meta);
        console.error(`ERROR|${timeStr}|${message}${errorStr}${metaStr}`);
    },

    debug: (message, meta = {}) => {
        if (process.env.NODE_ENV === 'development') {
            const timeStr = getTimeString();
            const metaStr = formatMeta(meta);
            console.debug(`DEBUG|${timeStr}|${message}${metaStr}`);
        }
    }
};
