import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { fetchPaper, getSourceHealth } from './src/paperFetcher.mjs';
import { fetchFromUnpaywall } from './src/fetchers/unpaywall.mjs';
import { fetchPaperWithProgress } from './src/paperFetcherStream.mjs';
import logger, { createRequestLogger } from './src/logger.mjs';
import { getMetrics, getPrometheusMetrics, recordCacheEvent, recordFetchRequest } from './src/metrics.mjs';

const app = express();
const DEFAULT_PORT = process.env.PORT || 3000;

/**
 * Check if a port is available
 */
async function isPortAvailable(port) {
  const net = await import('net');
  return new Promise((resolve) => {
    const server = net.default.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

/**
 * Find an available port starting from the default
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
}

// Rate limiter for API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: 60
  }
});

// Stricter limiter for batch endpoint (costs more resources)
const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 batch requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many batch requests. Please try again later.',
    retryAfter: 60
  }
});

// Middleware
app.use(express.json());

// CORS for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Paper PDF Fetcher API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      fetch: 'POST /api/fetch',
      fetchByDoi: 'POST /api/fetch-by-doi',
      fetchStream: 'GET /api/fetch-stream?title=...',
      batchFetch: 'POST /api/batch-fetch',
      health: 'GET /api/health'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Metrics endpoint - JSON format
 * GET /api/metrics
 * Returns detailed metrics about sources, cache, and requests
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const format = req.query.format || 'json';

    if (format === 'prometheus') {
      const prometheusMetrics = await getPrometheusMetrics();
      res.set('Content-Type', 'text/plain; charset=utf-8');
      return res.send(prometheusMetrics);
    }

    const metrics = await getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get metrics');
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * Source health endpoint - shows circuit breaker status
 * GET /api/sources/health
 */
app.get('/api/sources/health', (req, res) => {
  res.json(getSourceHealth());
});

/**
 * Deep health check - verifies each source API is reachable
 * GET /api/health/deep
 * Slower but provides detailed status per source
 */
app.get('/api/health/deep', async (req, res) => {
  logger.info('Running deep health check');

  const sources = [
    { name: 'arXiv', url: 'http://export.arxiv.org/api/query?search_query=test&max_results=1' },
    { name: 'Semantic Scholar', url: 'https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1' },
    { name: 'OpenAlex', url: 'https://api.openalex.org/works?search=test&per_page=1' },
    { name: 'CORE', url: 'https://api.core.ac.uk/v3/search/works?q=test&limit=1' },
    { name: 'Crossref', url: 'https://api.crossref.org/works?query=test&rows=1' },
    { name: 'PubMed', url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pmc&term=test&retmax=1' },
    { name: 'Unpaywall', url: 'https://api.unpaywall.org/v2/10.1038/nature12373?email=test@example.com' }
  ];

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'PaperFetcher-HealthCheck/1.0' }
        });

        clearTimeout(timeout);
        const latency = Date.now() - start;

        return {
          name: source.name,
          status: response.ok ? 'healthy' : 'degraded',
          statusCode: response.status,
          latencyMs: latency
        };
      } catch (error) {
        return {
          name: source.name,
          status: 'unhealthy',
          error: error.name === 'AbortError' ? 'timeout' : error.message,
          latencyMs: Date.now() - start
        };
      }
    })
  );

  const sourceStatuses = results.map(r => r.status === 'fulfilled' ? r.value : {
    name: 'unknown',
    status: 'error',
    error: r.reason?.message
  });

  const healthyCount = sourceStatuses.filter(s => s.status === 'healthy').length;
  const overallStatus = healthyCount === sources.length ? 'healthy' :
                        healthyCount >= sources.length / 2 ? 'degraded' : 'unhealthy';

  // Get circuit breaker states
  const circuitBreakerStatus = getSourceHealth();

  // Merge circuit breaker info into source statuses
  const enrichedStatuses = sourceStatuses.map(source => {
    const cbStatus = circuitBreakerStatus[source.name];
    return {
      ...source,
      circuitBreaker: cbStatus ? {
        state: cbStatus.state,
        failures: cbStatus.failures,
        successRate: cbStatus.successRate
      } : null
    };
  });

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    sources: enrichedStatuses,
    circuitBreakers: circuitBreakerStatus,
    summary: {
      healthy: healthyCount,
      total: sources.length,
      circuitBreakersOpen: Object.values(circuitBreakerStatus).filter(cb => cb.state === 'open').length
    }
  });
});

/**
 * Main endpoint: Fetch paper PDF
 * POST /api/fetch
 * Body: { "title": "paper title", "downloadLocal": true/false }
 * Returns: { success: bool, pdf_url?: string, pdf_path?: string, source?: string, error?: string }
 */
app.post('/api/fetch', apiLimiter, async (req, res) => {
  try {
    const { title, downloadLocal, skipCache } = req.body;

    // Validate input
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "title" field in request body'
      });
    }

    // Title length validation (prevent abuse and memory issues)
    if (title.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Title too long. Maximum 1000 characters.'
      });
    }

    const reqLog = createRequestLogger(req);
    reqLog.info({ title, downloadLocal, skipCache }, 'Fetching paper');

    // Fetch the paper
    const result = await fetchPaper(title, {
      downloadLocal: downloadLocal === true,
      skipCache: skipCache === true
    });

    // Return result
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);

    reqLog.info({
      success: result.success,
      source: result.source,
      cached: result.cached
    }, result.success ? 'Paper found' : 'Paper not found');

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Server error');
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

/**
 * Batch fetch endpoint (optional enhancement)
 * POST /api/batch-fetch
 * Body: { "titles": ["title1", "title2", ...], "downloadLocal": true/false }
 */
app.post('/api/batch-fetch', batchLimiter, async (req, res) => {
  try {
    const { titles, downloadLocal, skipCache } = req.body;

    if (!Array.isArray(titles) || titles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "titles" array in request body'
      });
    }

    if (titles.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 titles per batch request'
      });
    }

    const reqLog = createRequestLogger(req);
    reqLog.info({ count: titles.length }, 'Batch fetch started');

    const results = [];
    for (const title of titles) {
      if (typeof title === 'string' && title.trim().length > 0) {
        const result = await fetchPaper(title, {
          downloadLocal: downloadLocal === true,
          skipCache: skipCache === true
        });
        results.push({ title, result });
      } else {
        results.push({
          title,
          result: { success: false, error: 'Invalid title' }
        });
      }
    }

    const successCount = results.filter(r => r.result.success).length;
    reqLog.info({ successCount, total: titles.length }, 'Batch fetch complete');

    res.json({
      success: true,
      total: titles.length,
      successful: successCount,
      results
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Batch fetch error');
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

/**
 * DOI-based lookup endpoint
 * POST /api/fetch-by-doi
 * Body: { "doi": "10.1234/..." }
 * Returns: { success: bool, pdf_url?: string, source?: string, metadata?: object, error?: string }
 */
app.post('/api/fetch-by-doi', apiLimiter, async (req, res) => {
  try {
    const { doi } = req.body;

    // Validate input
    if (!doi || typeof doi !== 'string' || doi.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "doi" field in request body'
      });
    }

    // Basic DOI format validation
    const doiPattern = /^10\.\d{4,}\/[^\s]+$/;
    const cleanDoi = doi.trim();
    if (!doiPattern.test(cleanDoi)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid DOI format. Expected format: 10.xxxx/...'
      });
    }

    const reqLog = createRequestLogger(req);
    reqLog.info({ doi: cleanDoi }, 'Fetching by DOI');

    // Direct Unpaywall lookup
    const result = await fetchFromUnpaywall(cleanDoi);

    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json({
      ...result,
      fetchedAt: new Date().toISOString()
    });

    reqLog.info({ success: result.success, source: result.source }, 'DOI fetch complete');

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'DOI fetch error');
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
});

/**
 * SSE streaming endpoint for real-time progress
 * GET /api/fetch-stream?title=...
 * Returns Server-Sent Events as each source is tried
 */
app.get('/api/fetch-stream', apiLimiter, async (req, res) => {
  const { title, skipCache } = req.query;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid "title" query parameter'
    });
  }

  // Title length validation
  if (title.length > 1000) {
    return res.status(400).json({
      success: false,
      error: 'Title too long. Maximum 1000 characters.'
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const reqLog = createRequestLogger(req);
  reqLog.info({ title }, 'SSE fetch started');

  // Helper to send SSE events
  const emit = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await fetchPaperWithProgress(title, emit, {
      skipCache: skipCache === 'true'
    });
  } catch (error) {
    emit('error', { error: error.message });
  }

  // End the stream
  res.end();
  reqLog.info('SSE fetch complete');
});

/**
 * BibTeX fetch endpoint
 * GET /api/bibtex?doi=10.1234/...
 * Returns BibTeX citation string
 */
app.get('/api/bibtex', apiLimiter, async (req, res) => {
  const { doi } = req.query;

  if (!doi || typeof doi !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Missing or invalid "doi" query parameter'
    });
  }

  const reqLog = createRequestLogger(req);
  reqLog.info({ doi }, 'Fetching BibTeX');

  try {
    const response = await fetch(`https://doi.org/${doi}`, {
      headers: {
        'Accept': 'application/x-bibtex'
      }
    });

    if (!response.ok) {
      return res.status(404).json({
        success: false,
        error: 'Could not fetch BibTeX for this DOI'
      });
    }

    const bibtex = await response.text();
    res.json({
      success: true,
      bibtex,
      doi
    });

  } catch (error) {
    logger.error({ error: error.message, doi }, 'BibTeX fetch error');
    res.status(500).json({
      success: false,
      error: 'Error fetching BibTeX: ' + error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: {
      fetch: 'POST /api/fetch',
      fetchByDoi: 'POST /api/fetch-by-doi',
      fetchStream: 'GET /api/fetch-stream?title=...',
      batchFetch: 'POST /api/batch-fetch',
      health: 'GET /api/health'
    }
  });
});

// Start server
async function startServer() {
  try {
    const PORT = await findAvailablePort(DEFAULT_PORT);
    if (PORT !== DEFAULT_PORT) {
      logger.warn({ requestedPort: DEFAULT_PORT, actualPort: PORT }, 'Default port in use, using alternate port');
    }
    app.listen(PORT, () => {
      logger.info({
        port: PORT,
        url: `http://localhost:${PORT}`,
        endpoints: [
          'POST /api/fetch',
          'POST /api/fetch-by-doi',
          'GET /api/fetch-stream',
          'POST /api/batch-fetch',
          'GET /api/health'
        ]
      }, 'Paper PDF Fetcher API started');
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

export default app;
