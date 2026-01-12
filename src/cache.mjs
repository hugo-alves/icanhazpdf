import fs from 'fs/promises';
import logger from './logger.mjs';

/**
 * Cache abstraction layer
 * Uses Vercel KV in production, JSON file locally
 */

const CACHE_FILE = process.env.CACHE_FILE || './cache.json';
const CACHE_PREFIX = 'paper:';
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days in seconds

let kvClient = null;
let useKV = false;

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
 * Get item from cache
 * Returns the cached value with metadata, or null if not found
 */
export async function cacheGet(key) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  if (useKV && kvClient) {
    try {
      const result = await kvClient.get(`${CACHE_PREFIX}${normalizedKey}`);
      if (!result) return null;
      // Return value with cached flag for backwards compatibility
      return { ...result, cached: true };
    } catch (error) {
      logger.error({ error: error.message }, 'KV get error');
      return null;
    }
  }

  // Fallback to JSON file
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    const entry = cache[normalizedKey];
    if (!entry) return null;
    // Return value with cached flag for backwards compatibility
    return { ...entry, cached: true };
  } catch {
    return null;
  }
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
