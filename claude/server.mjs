import 'dotenv/config';
import express from 'express';
import { fetchPaper } from './src/paperFetcher.mjs';

const app = express();
const PORT = process.env.PORT || 3000;

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
      health: 'GET /api/health'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Main endpoint: Fetch paper PDF
 * POST /api/fetch
 * Body: { "title": "paper title", "downloadLocal": true/false }
 * Returns: { success: bool, pdf_url?: string, pdf_path?: string, source?: string, error?: string }
 */
app.post('/api/fetch', async (req, res) => {
  try {
    const { title, downloadLocal, skipCache } = req.body;

    // Validate input
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "title" field in request body'
      });
    }

    console.log(`\n=== Fetching paper: "${title}" ===`);
    console.log(`Options: downloadLocal=${downloadLocal}, skipCache=${skipCache}`);

    // Fetch the paper
    const result = await fetchPaper(title, {
      downloadLocal: downloadLocal === true,
      skipCache: skipCache === true
    });

    // Return result
    const statusCode = result.success ? 200 : 404;
    res.status(statusCode).json(result);

    console.log(`Result: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.source) {
      console.log(`Source: ${result.source}`);
    }
    console.log('===\n');

  } catch (error) {
    console.error('Server error:', error);
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
app.post('/api/batch-fetch', async (req, res) => {
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

    console.log(`\n=== Batch fetch: ${titles.length} papers ===`);

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
    console.log(`Batch complete: ${successCount}/${titles.length} successful\n===\n`);

    res.json({
      success: true,
      total: titles.length,
      successful: successCount,
      results
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
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
      batchFetch: 'POST /api/batch-fetch',
      health: 'GET /api/health'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Paper PDF Fetcher API running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/fetch`);
  console.log(`  POST http://localhost:${PORT}/api/batch-fetch`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log('');
});

export default app;
