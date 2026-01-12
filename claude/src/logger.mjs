import pino from 'pino';

/**
 * Structured logger for Paper Fetcher
 * Uses pino for fast, JSON-formatted logging
 */
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Use pino-pretty in development for readable output
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  // Standard fields for all log entries
  base: {
    service: 'paper-fetcher'
  },
  // Redact sensitive data
  redact: ['req.headers.authorization', 'req.headers.cookie']
});

/**
 * Create child logger with request context
 */
export function createRequestLogger(req) {
  return logger.child({
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    method: req.method,
    path: req.path,
    ip: req.ip
  });
}

/**
 * Create child logger for paper fetch operations
 */
export function createFetchLogger(title) {
  return logger.child({
    operation: 'fetchPaper',
    title
  });
}

export default logger;
