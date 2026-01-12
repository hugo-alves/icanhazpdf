/**
 * Source-Aware Rate Limiter
 *
 * Respects external API rate limits to avoid 429 errors.
 * Implements per-source request queues with configurable limits.
 *
 * Known API limits:
 * - PubMed: 3 requests/second without API key, 10/second with key
 * - Crossref: 50 requests/second (polite pool)
 * - Semantic Scholar: 100 requests/5 minutes = ~0.33/second
 * - arXiv: Undocumented, but be polite (~1/second recommended)
 * - CORE: Varies by plan
 * - OpenAlex: 100,000/day = ~1.16/second (but much more permissive)
 */

import logger from './logger.mjs';

// Rate limit configurations per source (requests per second)
const SOURCE_LIMITS = {
  'arXiv': { rps: 1, burst: 3 },
  'Semantic Scholar': { rps: 0.33, burst: 1 },
  'OpenAlex': { rps: 5, burst: 10 },
  'PubMed Central': { rps: 3, burst: 5 },
  'CORE': { rps: 2, burst: 5 },
  'Crossref': { rps: 10, burst: 20 },
  'Unpaywall': { rps: 5, burst: 10 },
  'Web Search': { rps: 1, burst: 2 }
};

// Token bucket implementation per source
const buckets = new Map();

class TokenBucket {
  constructor(name, rps, burst) {
    this.name = name;
    this.rps = rps;
    this.burst = burst;
    this.tokens = burst;
    this.lastRefill = Date.now();
    this.queue = [];
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.rps;
    this.tokens = Math.min(this.burst, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.queue.length === 0) return;

    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      const resolve = this.queue.shift();
      resolve();
    } else {
      // Wait until we have a token
      const waitMs = Math.ceil((1 - this.tokens) / this.rps * 1000);
      setTimeout(() => this.processQueue(), waitMs);
    }
  }

  getStatus() {
    this.refill();
    return {
      name: this.name,
      tokens: Math.floor(this.tokens * 100) / 100,
      burst: this.burst,
      rps: this.rps,
      queueLength: this.queue.length
    };
  }
}

/**
 * Get or create a rate limiter for a source
 * @param {string} sourceName
 * @returns {TokenBucket}
 */
function getBucket(sourceName) {
  if (!buckets.has(sourceName)) {
    const config = SOURCE_LIMITS[sourceName] || { rps: 5, burst: 10 };
    buckets.set(sourceName, new TokenBucket(sourceName, config.rps, config.burst));
  }
  return buckets.get(sourceName);
}

/**
 * Execute a function with rate limiting
 * @param {string} sourceName - Name of the source
 * @param {function} fn - Async function to execute
 * @returns {Promise<any>}
 */
export async function withRateLimit(sourceName, fn) {
  const bucket = getBucket(sourceName);

  // Log if we have to wait (queue not empty)
  if (bucket.queue.length > 0) {
    logger.info({ source: sourceName, queueLength: bucket.queue.length }, 'Waiting for rate limit');
  }

  await bucket.acquire();

  try {
    return await fn();
  } finally {
    // Could add post-execution logic here if needed
  }
}

/**
 * Get rate limiter status for all sources
 * @returns {object}
 */
export function getRateLimitStatus() {
  const status = {};
  for (const [name, bucket] of buckets) {
    status[name] = bucket.getStatus();
  }
  return status;
}

/**
 * Update rate limit for a source (useful for respecting Retry-After)
 * @param {string} sourceName
 * @param {number} waitSeconds - Seconds to wait before allowing requests
 */
export function throttleSource(sourceName, waitSeconds) {
  const bucket = getBucket(sourceName);
  bucket.tokens = 0;
  bucket.lastRefill = Date.now() + (waitSeconds * 1000); // Pretend last refill is in the future

  logger.warn({
    source: sourceName,
    waitSeconds
  }, 'Throttling source');
}

/**
 * Check if a source is currently throttled
 * @param {string} sourceName
 * @returns {boolean}
 */
export function isThrottled(sourceName) {
  const bucket = buckets.get(sourceName);
  if (!bucket) return false;
  bucket.refill();
  return bucket.tokens < 1;
}

export { SOURCE_LIMITS };
