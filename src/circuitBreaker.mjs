/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents hammering a broken source and speeds up fallback.
 *
 * States:
 * - CLOSED: Normal operation, requests allowed
 * - OPEN: Source is failing, requests blocked
 * - HALF_OPEN: Testing if source has recovered
 */

import logger from './logger.mjs';
import { RateLimitError } from './errors.mjs';

const STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

// Default configuration
const DEFAULT_CONFIG = {
  failureThreshold: 5,      // Number of failures before opening circuit
  successThreshold: 2,      // Number of successes in half-open to close circuit
  timeout: 60000,           // Time in ms before trying again (half-open)
  resetTimeout: 300000      // Time in ms before fully resetting failure count (5 min)
};

class CircuitBreaker {
  constructor(name, config = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
  }

  /**
   * Check if requests are allowed through the circuit
   * @returns {boolean}
   */
  isAllowed() {
    this.updateState();
    return this.state !== STATES.OPEN;
  }

  /**
   * Update state based on timeouts
   */
  updateState() {
    const now = Date.now();

    if (this.state === STATES.OPEN) {
      // Check if we should try half-open
      if (now - this.lastStateChange >= this.config.timeout) {
        this.transitionTo(STATES.HALF_OPEN);
      }
    } else if (this.state === STATES.CLOSED) {
      // Reset failure count if enough time has passed since last failure
      if (this.lastFailureTime && now - this.lastFailureTime >= this.config.resetTimeout) {
        this.failures = 0;
        this.lastFailureTime = null;
      }
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    this.totalRequests++;
    this.totalSuccesses++;
    this.updateState();

    if (this.state === STATES.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(STATES.CLOSED);
        this.failures = 0;
        this.successes = 0;
      }
    } else if (this.state === STATES.CLOSED) {
      // A success in closed state can help reset failure count
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Record a failed request
   * @param {Error} error - The error that occurred
   */
  recordFailure(error) {
    this.totalRequests++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.updateState();

    // Rate limit errors should open the circuit immediately with longer timeout
    if (error?.classifiedError instanceof RateLimitError) {
      const retryAfter = error.classifiedError.retryAfter || 60;
      this.transitionTo(STATES.OPEN);
      // Use the retry-after value for timeout
      this.config.timeout = Math.max(this.config.timeout, retryAfter * 1000);
      logger.warn({
        source: this.name,
        retryAfter,
        state: this.state
      }, 'Circuit opened due to rate limit');
      return;
    }

    if (this.state === STATES.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(STATES.OPEN);
      this.successes = 0;
    } else if (this.state === STATES.CLOSED) {
      this.failures++;
      if (this.failures >= this.config.failureThreshold) {
        this.transitionTo(STATES.OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   * @param {string} newState
   */
  transitionTo(newState) {
    if (this.state !== newState) {
      logger.info({
        source: this.name,
        from: this.state,
        to: newState,
        failures: this.failures
      }, 'Circuit breaker state change');
      this.state = newState;
      this.lastStateChange = Date.now();
    }
  }

  /**
   * Get current status for monitoring
   * @returns {object}
   */
  getStatus() {
    this.updateState();
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      successRate: this.totalRequests > 0
        ? ((this.totalSuccesses / this.totalRequests) * 100).toFixed(1) + '%'
        : 'N/A',
      lastStateChange: this.lastStateChange,
      timeInCurrentState: Date.now() - this.lastStateChange
    };
  }

  /**
   * Force reset the circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    logger.info({ source: this.name }, 'Circuit breaker reset');
  }
}

// Registry of circuit breakers by source name
const breakers = new Map();

/**
 * Get or create a circuit breaker for a source
 * @param {string} sourceName - Name of the source (e.g., 'arXiv', 'Semantic Scholar')
 * @param {object} config - Optional configuration override
 * @returns {CircuitBreaker}
 */
export function getCircuitBreaker(sourceName, config = {}) {
  if (!breakers.has(sourceName)) {
    breakers.set(sourceName, new CircuitBreaker(sourceName, config));
  }
  return breakers.get(sourceName);
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} sourceName - Name of the source
 * @param {function} fn - Async function to execute
 * @returns {Promise<any>}
 * @throws {Error} If circuit is open or function fails
 */
export async function withCircuitBreaker(sourceName, fn) {
  const breaker = getCircuitBreaker(sourceName);

  if (!breaker.isAllowed()) {
    const error = new Error(`Circuit breaker open for ${sourceName}`);
    error.circuitBreakerOpen = true;
    error.source = sourceName;
    throw error;
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure(error);
    throw error;
  }
}

/**
 * Get status of all circuit breakers
 * @returns {object}
 */
export function getAllCircuitBreakerStatus() {
  const status = {};
  for (const [name, breaker] of breakers) {
    status[name] = breaker.getStatus();
  }
  return status;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers() {
  for (const breaker of breakers.values()) {
    breaker.reset();
  }
}

/**
 * Check if a specific source circuit is healthy
 * @param {string} sourceName
 * @returns {boolean}
 */
export function isSourceHealthy(sourceName) {
  const breaker = breakers.get(sourceName);
  if (!breaker) return true; // No breaker means never failed
  return breaker.isAllowed();
}

export { STATES, CircuitBreaker };
