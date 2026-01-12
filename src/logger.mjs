import pino from 'pino';
import crypto from 'crypto';

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
 * Generate a short unique correlation ID (8 chars)
 * @returns {string}
 */
export function generateCorrelationId() {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Create child logger with request context
 */
export function createRequestLogger(req) {
  const correlationId = req.headers['x-correlation-id'] ||
                        req.headers['x-request-id'] ||
                        generateCorrelationId();

  return logger.child({
    correlationId,
    method: req.method,
    path: req.path,
    ip: req.ip
  });
}

/**
 * Create child logger for paper fetch operations with correlation ID
 * @param {string} title - Paper title
 * @param {string} [correlationId] - Optional correlation ID (auto-generated if not provided)
 */
export function createFetchLogger(title, correlationId = null) {
  return logger.child({
    correlationId: correlationId || generateCorrelationId(),
    operation: 'fetchPaper',
    title
  });
}

/**
 * Create child logger for a specific source fetch
 * @param {string} sourceName - Name of the source (e.g., 'arXiv')
 * @param {string} correlationId - Correlation ID from parent operation
 */
export function createSourceLogger(sourceName, correlationId) {
  return logger.child({
    correlationId,
    source: sourceName
  });
}

/**
 * Log source fetch timing
 * @param {object} log - Logger instance
 * @param {string} source - Source name
 * @param {number} durationMs - Duration in milliseconds
 * @param {'found' | 'not_found' | 'error'} status - Result status
 * @param {object} [extra] - Additional fields
 */
export function logSourceTiming(log, source, durationMs, status, extra = {}) {
  log.info({
    source,
    durationMs,
    status,
    ...extra
  }, `${source} fetch ${status}`);
}

export default logger;
