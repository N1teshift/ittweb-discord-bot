/**
 * Simple logger utility for consistent logging format
 */

const getTimestamp = () => new Date().toISOString();

export const logger = {
    info: (message, meta = {}) => {
        console.log(JSON.stringify({ level: 'INFO', timestamp: getTimestamp(), message, ...meta }));
    },

    warn: (message, meta = {}) => {
        console.warn(JSON.stringify({ level: 'WARN', timestamp: getTimestamp(), message, ...meta }));
    },

    error: (message, error = null, meta = {}) => {
        const errorObj = error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) };

        console.error(JSON.stringify({
            level: 'ERROR',
            timestamp: getTimestamp(),
            message,
            error: error ? errorObj : undefined,
            ...meta
        }));
    },

    debug: (message, meta = {}) => {
        if (process.env.NODE_ENV === 'development') {
            console.debug(JSON.stringify({ level: 'DEBUG', timestamp: getTimestamp(), message, ...meta }));
        }
    }
};
