/**
 * Error classification system for paper fetching
 * Enables smarter retry decisions and circuit breaker integration
 */

/**
 * Base error class for all fetcher errors
 */
export class FetcherError extends Error {
  constructor(message, { source, statusCode, retryable = false, retryAfter = null } = {}) {
    super(message);
    this.name = 'FetcherError';
    this.source = source;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfter = retryAfter; // seconds to wait before retry
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      source: this.source,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      timestamp: this.timestamp
    };
  }
}

/**
 * Transient errors - should retry with backoff
 * Examples: timeouts, 5xx errors, network issues
 */
export class TransientError extends FetcherError {
  constructor(message, options = {}) {
    super(message, { ...options, retryable: true });
    this.name = 'TransientError';
  }
}

/**
 * Permanent errors - do NOT retry
 * Examples: 404 not found, 403 forbidden, invalid format
 */
export class PermanentError extends FetcherError {
  constructor(message, options = {}) {
    super(message, { ...options, retryable: false });
    this.name = 'PermanentError';
  }
}

/**
 * Rate limit errors - retry after specified delay
 * Examples: HTTP 429, API quota exceeded
 */
export class RateLimitError extends FetcherError {
  constructor(message, options = {}) {
    super(message, { ...options, retryable: true });
    this.name = 'RateLimitError';
    // Default to 60 seconds if no Retry-After header
    this.retryAfter = options.retryAfter || 60;
  }
}

/**
 * Classify an axios error into our error taxonomy
 * @param {Error} error - The original error (usually from axios)
 * @param {string} source - The source name (e.g., 'arXiv', 'Semantic Scholar')
 * @returns {FetcherError} - Classified error
 */
export function classifyError(error, source) {
  const statusCode = error.response?.status;
  const retryAfterHeader = error.response?.headers?.['retry-after'];

  // Parse Retry-After header (can be seconds or HTTP date)
  let retryAfter = null;
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) {
      retryAfter = seconds;
    } else {
      // Try parsing as HTTP date
      const date = new Date(retryAfterHeader);
      if (!isNaN(date.getTime())) {
        retryAfter = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
      }
    }
  }

  // Rate limit (429)
  if (statusCode === 429) {
    return new RateLimitError(
      `Rate limited by ${source}`,
      { source, statusCode, retryAfter }
    );
  }

  // Client errors (4xx except 429) - permanent, don't retry
  if (statusCode >= 400 && statusCode < 500) {
    return new PermanentError(
      `${source} returned ${statusCode}: ${error.message}`,
      { source, statusCode }
    );
  }

  // Server errors (5xx) - transient, retry
  if (statusCode >= 500) {
    return new TransientError(
      `${source} server error ${statusCode}: ${error.message}`,
      { source, statusCode }
    );
  }

  // Timeout errors - transient
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new TransientError(
      `${source} request timed out`,
      { source }
    );
  }

  // Network errors - transient
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return new TransientError(
      `${source} network error: ${error.code}`,
      { source }
    );
  }

  // Unknown errors - treat as transient to be safe
  return new TransientError(
    `${source} error: ${error.message}`,
    { source }
  );
}

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
export function isRetryable(error) {
  if (error instanceof FetcherError) {
    return error.retryable;
  }
  // For non-classified errors, use heuristics
  const statusCode = error.response?.status;
  if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
    return false;
  }
  return true;
}

/**
 * Get retry delay for an error
 * @param {Error} error - The error
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in ms (default 1000)
 * @returns {number} - Delay in ms before next retry
 */
export function getRetryDelay(error, attempt, baseDelay = 1000) {
  // If rate limited with explicit retry-after, use that
  if (error instanceof RateLimitError && error.retryAfter) {
    return error.retryAfter * 1000;
  }

  // Exponential backoff with jitter
  const jitter = 0.5 + Math.random();
  return Math.min(baseDelay * Math.pow(2, attempt) * jitter, 30000); // Max 30s
}
