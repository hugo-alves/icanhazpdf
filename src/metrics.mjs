/**
 * Metrics Collection Module
 *
 * Tracks per-source performance metrics:
 * - Request count, success/failure rates
 * - Latency (avg, p50, p95, p99)
 * - Cache hit/miss ratio
 * - Rate limit hits
 * - Circuit breaker trips
 */

import { getAllCircuitBreakerStatus } from './circuitBreaker.mjs';
import { getCacheStats } from './cache.mjs';

// Metrics storage (in-memory, resets on restart)
const metrics = {
  startTime: Date.now(),
  sources: {},
  cache: {
    hits: 0,
    misses: 0,
    negativeHits: 0,
    staleHits: 0
  },
  requests: {
    total: 0,
    successful: 0,
    failed: 0
  }
};

// Latency histogram buckets for percentile calculation
const LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Initialize metrics for a source if not exists
 */
function ensureSource(sourceName) {
  if (!metrics.sources[sourceName]) {
    metrics.sources[sourceName] = {
      requests: 0,
      successes: 0,
      failures: 0,
      rateLimitHits: 0,
      circuitBreakerTrips: 0,
      latencies: [],
      lastRequestTime: null,
      lastError: null
    };
  }
  return metrics.sources[sourceName];
}

/**
 * Record a source request
 * @param {string} sourceName - Name of the source
 * @param {object} options - Request details
 */
export function recordSourceRequest(sourceName, { success, latencyMs, error, isRateLimited, isCircuitBreakerTrip } = {}) {
  const source = ensureSource(sourceName);

  source.requests++;
  source.lastRequestTime = Date.now();

  if (success) {
    source.successes++;
  } else {
    source.failures++;
    source.lastError = error || 'Unknown error';
  }

  if (isRateLimited) {
    source.rateLimitHits++;
  }

  if (isCircuitBreakerTrip) {
    source.circuitBreakerTrips++;
  }

  // Store latency for percentile calculation (keep last 1000)
  if (latencyMs !== undefined) {
    source.latencies.push(latencyMs);
    if (source.latencies.length > 1000) {
      source.latencies.shift();
    }
  }
}

/**
 * Record a cache event
 * @param {'hit' | 'miss' | 'negativeHit' | 'staleHit'} type
 */
export function recordCacheEvent(type) {
  switch (type) {
    case 'hit':
      metrics.cache.hits++;
      break;
    case 'miss':
      metrics.cache.misses++;
      break;
    case 'negativeHit':
      metrics.cache.negativeHits++;
      break;
    case 'staleHit':
      metrics.cache.staleHits++;
      break;
  }
}

/**
 * Record a fetch request
 * @param {boolean} success
 */
export function recordFetchRequest(success) {
  metrics.requests.total++;
  if (success) {
    metrics.requests.successful++;
  } else {
    metrics.requests.failed++;
  }
}

/**
 * Calculate percentile from array of values
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Calculate average from array
 */
function average(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Get source metrics with computed statistics
 */
function getSourceMetrics(sourceName) {
  const source = metrics.sources[sourceName];
  if (!source) return null;

  const latencies = source.latencies;

  return {
    requests: source.requests,
    successes: source.successes,
    failures: source.failures,
    successRate: source.requests > 0
      ? ((source.successes / source.requests) * 100).toFixed(1) + '%'
      : 'N/A',
    rateLimitHits: source.rateLimitHits,
    circuitBreakerTrips: source.circuitBreakerTrips,
    latency: {
      avg: Math.round(average(latencies)),
      p50: Math.round(percentile(latencies, 50)),
      p95: Math.round(percentile(latencies, 95)),
      p99: Math.round(percentile(latencies, 99)),
      min: latencies.length > 0 ? Math.min(...latencies) : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0
    },
    lastRequestTime: source.lastRequestTime,
    lastError: source.lastError
  };
}

/**
 * Get all metrics as JSON
 */
export async function getMetrics() {
  const uptimeMs = Date.now() - metrics.startTime;
  const cacheStats = await getCacheStats();
  const circuitBreakerStatus = getAllCircuitBreakerStatus();

  const sourceMetrics = {};
  for (const sourceName of Object.keys(metrics.sources)) {
    sourceMetrics[sourceName] = getSourceMetrics(sourceName);
  }

  const totalCacheRequests = metrics.cache.hits + metrics.cache.misses;

  return {
    uptime: {
      ms: uptimeMs,
      formatted: formatUptime(uptimeMs)
    },
    requests: {
      ...metrics.requests,
      successRate: metrics.requests.total > 0
        ? ((metrics.requests.successful / metrics.requests.total) * 100).toFixed(1) + '%'
        : 'N/A'
    },
    cache: {
      ...metrics.cache,
      hitRate: totalCacheRequests > 0
        ? ((metrics.cache.hits / totalCacheRequests) * 100).toFixed(1) + '%'
        : 'N/A',
      storage: cacheStats
    },
    sources: sourceMetrics,
    circuitBreakers: circuitBreakerStatus
  };
}

/**
 * Get metrics in Prometheus format
 */
export async function getPrometheusMetrics() {
  const m = await getMetrics();
  const lines = [];

  // Help and type declarations
  lines.push('# HELP paperfetcher_uptime_seconds Server uptime in seconds');
  lines.push('# TYPE paperfetcher_uptime_seconds gauge');
  lines.push(`paperfetcher_uptime_seconds ${Math.floor(m.uptime.ms / 1000)}`);

  lines.push('# HELP paperfetcher_requests_total Total number of fetch requests');
  lines.push('# TYPE paperfetcher_requests_total counter');
  lines.push(`paperfetcher_requests_total{status="success"} ${m.requests.successful}`);
  lines.push(`paperfetcher_requests_total{status="failed"} ${m.requests.failed}`);

  lines.push('# HELP paperfetcher_cache_hits_total Cache hit counter');
  lines.push('# TYPE paperfetcher_cache_hits_total counter');
  lines.push(`paperfetcher_cache_hits_total{type="hit"} ${m.cache.hits}`);
  lines.push(`paperfetcher_cache_hits_total{type="miss"} ${m.cache.misses}`);
  lines.push(`paperfetcher_cache_hits_total{type="negative"} ${m.cache.negativeHits}`);
  lines.push(`paperfetcher_cache_hits_total{type="stale"} ${m.cache.staleHits}`);

  // Per-source metrics
  for (const [source, data] of Object.entries(m.sources)) {
    const safeSource = source.toLowerCase().replace(/\s+/g, '_');

    lines.push(`# HELP paperfetcher_source_requests_total Requests per source`);
    lines.push(`# TYPE paperfetcher_source_requests_total counter`);
    lines.push(`paperfetcher_source_requests_total{source="${safeSource}",status="success"} ${data.successes}`);
    lines.push(`paperfetcher_source_requests_total{source="${safeSource}",status="failed"} ${data.failures}`);

    lines.push(`# HELP paperfetcher_source_latency_milliseconds Latency per source`);
    lines.push(`# TYPE paperfetcher_source_latency_milliseconds gauge`);
    lines.push(`paperfetcher_source_latency_milliseconds{source="${safeSource}",quantile="0.5"} ${data.latency.p50}`);
    lines.push(`paperfetcher_source_latency_milliseconds{source="${safeSource}",quantile="0.95"} ${data.latency.p95}`);
    lines.push(`paperfetcher_source_latency_milliseconds{source="${safeSource}",quantile="0.99"} ${data.latency.p99}`);

    lines.push(`paperfetcher_source_ratelimit_total{source="${safeSource}"} ${data.rateLimitHits}`);
  }

  // Circuit breaker states
  for (const [source, status] of Object.entries(m.circuitBreakers)) {
    const safeSource = source.toLowerCase().replace(/\s+/g, '_');
    const stateValue = status.state === 'closed' ? 0 : status.state === 'half_open' ? 1 : 2;
    lines.push(`paperfetcher_circuit_breaker_state{source="${safeSource}"} ${stateValue}`);
  }

  return lines.join('\n');
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics() {
  metrics.startTime = Date.now();
  metrics.sources = {};
  metrics.cache = { hits: 0, misses: 0, negativeHits: 0, staleHits: 0 };
  metrics.requests = { total: 0, successful: 0, failed: 0 };
}

/**
 * Create a timer for measuring latency
 * @returns {{ end: () => number }}
 */
export function startTimer() {
  const start = Date.now();
  return {
    end: () => Date.now() - start
  };
}
