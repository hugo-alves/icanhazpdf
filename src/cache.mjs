import fs from 'fs/promises';
import logger from './logger.mjs';

/**
 * Cache abstraction layer
 * Uses Vercel KV in production, JSON file locally
 */

const CACHE_FILE = process.env.CACHE_FILE || './cache.json';
const CACHE_PREFIX = 'paper:';
const NEGATIVE_CACHE_PREFIX = 'negative:';
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

// Cache configuration
const CACHE_CONFIG = {
  maxAgeSuccess: 7 * 24 * 60 * 60 * 1000,    // 7 days for successful results
  maxAgeNotFound: 1 * 24 * 60 * 60 * 1000,   // 1 day for "not found" results
  staleWhileRevalidate: 1 * 60 * 60 * 1000,  // 1 hour stale-while-revalidate window
  maxEntries: 10000,                          // Max entries for LRU eviction
};

let kvClient = null;
let useKV = false;

// Background revalidation queue
const revalidationQueue = new Set();

/**
 * Initialize cache - detect environment and set up appropriate backend
 */
async function initCache() {
  if (kvClient !== null || useKV) return;

  // Check if Vercel KV is available
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import('@vercel/kv');
      kvClient = kv;
      useKV = true;
      logger.info('Using Vercel KV cache');
    } catch (error) {
      logger.warn({ error: error.message }, 'Vercel KV not available, falling back to JSON file');
      useKV = false;
    }
  } else {
    logger.info('Using local JSON file cache');
    useKV = false;
  }
}

/**
 * Normalize title for cache key
 */
export function normalizeTitle(title) {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if a cache entry is stale
 * @param {object} entry - Cache entry with cachedAt timestamp
 * @param {boolean} isNegative - Whether this is a negative cache entry
 * @returns {{ expired: boolean, stale: boolean }}
 */
function checkStaleness(entry, isNegative = false) {
  if (!entry?.cachedAt) {
    // No timestamp, treat as expired
    return { expired: true, stale: true };
  }

  const cachedTime = new Date(entry.cachedAt).getTime();
  const age = Date.now() - cachedTime;
  const maxAge = isNegative ? CACHE_CONFIG.maxAgeNotFound : CACHE_CONFIG.maxAgeSuccess;

  const expired = age > maxAge;
  const stale = age > (maxAge - CACHE_CONFIG.staleWhileRevalidate);

  return { expired, stale };
}

/**
 * Get item from cache
 * Returns the cached value with metadata, or null if not found/expired
 * Supports stale-while-revalidate pattern
 */
export async function cacheGet(key, options = {}) {
  await initCache();
  const normalizedKey = normalizeTitle(key);
  const { allowStale = true } = options;

  let entry = null;

  if (useKV && kvClient) {
    try {
      entry = await kvClient.get(`${CACHE_PREFIX}${normalizedKey}`);
    } catch (error) {
      logger.error({ error: error.message }, 'KV get error');
      return null;
    }
  } else {
    // Fallback to JSON file
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf-8');
      const cache = JSON.parse(data);
      entry = cache[normalizedKey];
    } catch {
      return null;
    }
  }

  if (!entry) return null;

  // Check staleness
  const isNegative = entry.success === false;
  const { expired, stale } = checkStaleness(entry, isNegative);

  if (expired && !allowStale) {
    logger.info({ key: normalizedKey, age: Date.now() - new Date(entry.cachedAt).getTime() }, 'Cache entry expired');
    return null;
  }

  // Return with staleness info
  return {
    ...entry,
    cached: true,
    stale,
    expired,
    needsRevalidation: stale && !revalidationQueue.has(normalizedKey)
  };
}

/**
 * Set item in cache with timestamp
 */
export async function cacheSet(key, value) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  // Add timestamp to the cached value
  const valueWithTimestamp = {
    ...value,
    cachedAt: new Date().toISOString()
  };

  if (useKV && kvClient) {
    try {
      await kvClient.set(`${CACHE_PREFIX}${normalizedKey}`, valueWithTimestamp, { ex: CACHE_TTL });
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'KV set error');
      return false;
    }
  }

  // Fallback to JSON file
  try {
    let cache = {};
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf-8');
      cache = JSON.parse(data);
    } catch {
      // File doesn't exist, start fresh
    }

    // LRU eviction if needed
    const entries = Object.entries(cache);
    if (entries.length >= CACHE_CONFIG.maxEntries) {
      await evictLRU(cache, Math.floor(CACHE_CONFIG.maxEntries * 0.1)); // Evict 10%
    }

    cache[normalizedKey] = valueWithTimestamp;
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to save cache');
    return false;
  }
}

/**
 * Delete item from cache
 */
export async function cacheDelete(key) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  if (useKV && kvClient) {
    try {
      await kvClient.del(`${CACHE_PREFIX}${normalizedKey}`);
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'KV delete error');
      return false;
    }
  }

  // Fallback to JSON file
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    delete cache[normalizedKey];
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if using Vercel KV
 */
export async function isUsingKV() {
  await initCache();
  return useKV;
}

/**
 * LRU eviction for JSON file cache
 * Removes oldest entries based on cachedAt timestamp
 * @param {object} cache - Cache object to modify in place
 * @param {number} count - Number of entries to evict
 */
function evictLRU(cache, count) {
  const entries = Object.entries(cache);

  // Sort by cachedAt timestamp (oldest first)
  entries.sort((a, b) => {
    const timeA = a[1]?.cachedAt ? new Date(a[1].cachedAt).getTime() : 0;
    const timeB = b[1]?.cachedAt ? new Date(b[1].cachedAt).getTime() : 0;
    return timeA - timeB;
  });

  // Delete oldest entries
  const toDelete = entries.slice(0, count);
  for (const [key] of toDelete) {
    delete cache[key];
  }

  logger.info({ evicted: toDelete.length, remaining: entries.length - toDelete.length }, 'LRU cache eviction');
}

/**
 * Set negative cache (for failed lookups)
 * @param {string} key - Paper title
 * @param {object} result - The failed result to cache
 */
export async function cacheSetNegative(key, result) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  const valueWithTimestamp = {
    ...result,
    success: false,
    cachedAt: new Date().toISOString(),
    isNegativeCache: true
  };

  if (useKV && kvClient) {
    try {
      // Shorter TTL for negative cache (1 day)
      const negativeTTL = 60 * 60 * 24;
      await kvClient.set(`${NEGATIVE_CACHE_PREFIX}${normalizedKey}`, valueWithTimestamp, { ex: negativeTTL });
      return true;
    } catch (error) {
      logger.error({ error: error.message }, 'KV negative cache set error');
      return false;
    }
  }

  // JSON file negative caching is handled by normal cacheSet with success: false
  return cacheSet(key, valueWithTimestamp);
}

/**
 * Get negative cache entry
 * @param {string} key - Paper title
 */
export async function cacheGetNegative(key) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  if (useKV && kvClient) {
    try {
      const result = await kvClient.get(`${NEGATIVE_CACHE_PREFIX}${normalizedKey}`);
      if (!result) return null;
      return { ...result, cached: true };
    } catch (error) {
      logger.error({ error: error.message }, 'KV negative cache get error');
      return null;
    }
  }

  // For JSON file, negative cache is stored with isNegativeCache flag
  const entry = await cacheGet(key);
  if (entry?.isNegativeCache) {
    return entry;
  }
  return null;
}

/**
 * Mark a key as being revalidated (to prevent duplicate revalidation)
 * @param {string} key - Paper title
 */
export function markRevalidating(key) {
  const normalizedKey = normalizeTitle(key);
  revalidationQueue.add(normalizedKey);
}

/**
 * Mark revalidation complete
 * @param {string} key - Paper title
 */
export function markRevalidationComplete(key) {
  const normalizedKey = normalizeTitle(key);
  revalidationQueue.delete(normalizedKey);
}

/**
 * Check if a key is currently being revalidated
 * @param {string} key - Paper title
 * @returns {boolean}
 */
export function isRevalidating(key) {
  const normalizedKey = normalizeTitle(key);
  return revalidationQueue.has(normalizedKey);
}

/**
 * Get cache statistics (for JSON file cache)
 */
export async function getCacheStats() {
  await initCache();

  if (useKV) {
    return { type: 'vercel-kv', stats: 'Not available for KV' };
  }

  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    const entries = Object.entries(cache);

    let successCount = 0;
    let negativeCount = 0;
    let staleCount = 0;
    let expiredCount = 0;

    for (const [, entry] of entries) {
      if (entry.success === false || entry.isNegativeCache) {
        negativeCount++;
      } else {
        successCount++;
      }

      const { stale, expired } = checkStaleness(entry, entry.success === false);
      if (stale) staleCount++;
      if (expired) expiredCount++;
    }

    return {
      type: 'json-file',
      totalEntries: entries.length,
      successCount,
      negativeCount,
      staleCount,
      expiredCount,
      maxEntries: CACHE_CONFIG.maxEntries
    };
  } catch {
    return { type: 'json-file', error: 'Could not read cache file' };
  }
}

// Export config for testing
export { CACHE_CONFIG };
