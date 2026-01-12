import fs from 'fs/promises';

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
      console.log('Using Vercel KV cache');
    } catch (error) {
      console.warn('Vercel KV not available, falling back to JSON file:', error.message);
      useKV = false;
    }
  } else {
    console.log('Using local JSON file cache');
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
 */
export async function cacheGet(key) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  if (useKV && kvClient) {
    try {
      const result = await kvClient.get(`${CACHE_PREFIX}${normalizedKey}`);
      return result || null;
    } catch (error) {
      console.error('KV get error:', error.message);
      return null;
    }
  }

  // Fallback to JSON file
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    return cache[normalizedKey] || null;
  } catch {
    return null;
  }
}

/**
 * Set item in cache
 */
export async function cacheSet(key, value) {
  await initCache();
  const normalizedKey = normalizeTitle(key);

  if (useKV && kvClient) {
    try {
      await kvClient.set(`${CACHE_PREFIX}${normalizedKey}`, value, { ex: CACHE_TTL });
      return true;
    } catch (error) {
      console.error('KV set error:', error.message);
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
    cache[normalizedKey] = value;
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save cache:', error.message);
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
      console.error('KV delete error:', error.message);
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
