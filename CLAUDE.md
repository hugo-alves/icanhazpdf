# CLAUDE.md

ICanHazPDF - The legal way to get that PDF. API service to fetch academic paper PDFs from multiple open access sources.

## Quick Start

```bash
npm install
npm run dev    # Development with auto-reload (uses --watch)
npm start      # Production
npm test       # Run test suite
```

Requires Node.js >= 18.0.0

## Project Structure

```
icanhazpdf/
├── server.mjs                 # Express server with API endpoints
├── src/
│   ├── paperFetcher.mjs       # Main orchestrator with fallback logic
│   ├── paperFetcherStream.mjs # SSE streaming implementation
│   ├── cache.mjs              # Cache abstraction (Vercel KV / JSON file)
│   ├── circuitBreaker.mjs     # Circuit breaker for fault tolerance
│   ├── errors.mjs             # Custom error classes
│   ├── logger.mjs             # Pino-based structured logging
│   ├── metrics.mjs            # Metrics collection and reporting
│   ├── rateLimiter.mjs        # Rate limiting per source
│   ├── types.mjs              # TypeScript-like type definitions
│   ├── fetchers/              # Individual source fetchers
│   │   ├── baseFetcher.mjs    # Base class with retry logic
│   │   ├── arxiv.mjs
│   │   ├── semanticScholar.mjs
│   │   ├── openalex.mjs
│   │   ├── pubmed.mjs
│   │   ├── core.mjs
│   │   ├── crossref.mjs
│   │   ├── unpaywall.mjs
│   │   └── webSearch.mjs
│   └── utils/
│       ├── titleMatch.mjs     # Title validation to prevent false positives
│       └── pdfValidator.mjs   # PDF response validation
├── public/
│   └── index.html             # Web UI
├── test.mjs                   # Test suite
└── vercel.json                # Vercel deployment config
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fetch` | POST | Fetch single paper PDF |
| `/api/fetch-by-doi` | POST | Fetch paper by DOI directly |
| `/api/fetch-stream` | GET | SSE streaming with progress |
| `/api/batch-fetch` | POST | Fetch up to 10 papers |
| `/api/bibtex` | GET | Get BibTeX citation by DOI |
| `/api/health` | GET | Basic health check |
| `/api/health/deep` | GET | Deep health check (tests all sources) |
| `/api/sources/health` | GET | Individual source health status |
| `/api/metrics` | GET | Prometheus-style metrics |
| `/api/info` | GET | API info and available sources |
| `/` | GET | Web UI |

### Request Format

```bash
# Single paper by title
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'

# By DOI
curl -X POST http://localhost:3000/api/fetch-by-doi \
  -H "Content-Type: application/json" \
  -d '{"doi": "10.48550/arXiv.1706.03762"}'

# With options
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "BERT", "downloadLocal": true, "skipCache": true}'

# SSE streaming
curl "http://localhost:3000/api/fetch-stream?title=Attention%20Is%20All%20You%20Need"
```

### Response Format

```json
{
  "success": true,
  "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
  "source": "arXiv",
  "metadata": { "authors": "...", "year": 2017 },
  "fetchedAt": "2024-01-01T00:00:00.000Z"
}
```

## Source Priority Order

The fetcher tries sources in this order (stops on first success):

1. **arXiv** - Free preprints, most reliable for CS/ML papers
2. **Semantic Scholar** - Academic search with open access links
3. **OpenAlex** - Open catalog of scholarly works
4. **PubMed Central** - Biomedical/life sciences open access
5. **CORE** - Aggregator of open access research
6. **Crossref** - DOI metadata (used to find DOI for Unpaywall)
7. **Web Search** - Brave search fallback (requires API key)
8. **Unpaywall** - Tries if DOI found but no PDF yet

## Environment Variables

```bash
# API Keys (optional - most sources work without)
SEMANTIC_SCHOLAR_API_KEY=     # Higher rate limits
UNPAYWALL_EMAIL=your@email.com # Required for Unpaywall/OpenAlex
BRAVE_API_KEY=                 # For web search fallback

# Vercel KV (production caching)
KV_REST_API_URL=              # Vercel KV URL
KV_REST_API_TOKEN=            # Vercel KV token

# Server config
PORT=3000                      # Server port (auto-finds available if in use)
PDF_STORAGE_PATH=./pdfs        # Local PDF storage directory
CACHE_FILE=./cache.json        # Local cache file path

# Logging
LOG_LEVEL=info                 # debug, info, warn, error
NODE_ENV=development           # development or production
```

## Caching

- **Production (Vercel)**: Uses Vercel KV with 30-day TTL
- **Local**: JSON file cache at `./cache.json`
- Cache key: normalized lowercase title
- Negative caching: "not found" results cached for 1 day
- Stale-while-revalidate: 1 hour window
- Use `skipCache: true` to bypass

## Robustness Features

- **Circuit Breaker**: Prevents cascade failures when sources are down
- **Rate Limiting**: Per-source and global rate limits
- **Retry Logic**: Exponential backoff with jitter
- **PDF Validation**: Verifies responses are actual PDFs
- **Structured Logging**: Pino-based JSON logs for observability
- **Metrics**: Prometheus-compatible metrics endpoint

## Deployment

Deployed to Vercel. The `vercel.json` configures:
- API routes → `server.mjs`
- Static files → `public/`

Port auto-detection: If the default port is in use, server automatically finds an available one.

## Benchmark

Achieves **19/20** on the LLM papers benchmark. The 1 failure is a paywalled paper with no open access PDF available.

## Adding a New Source

1. Create `src/fetchers/newSource.mjs`:
   ```javascript
   import { BaseFetcher } from './baseFetcher.mjs';

   class NewSourceFetcher extends BaseFetcher {
     constructor() {
       super('NewSource', { maxRetries: 3, timeout: 10000 });
     }

     async fetch(title) {
       // Return: { success: true, pdf_url, source, metadata }
       // Or: { success: false, error }
     }
   }

   export const newSourceFetcher = new NewSourceFetcher();
   export const fetchFromNewSource = (title) => newSourceFetcher.fetch(title);
   ```

2. Add import and strategy to `src/paperFetcher.mjs`:
   ```javascript
   import { fetchFromNewSource } from './fetchers/newSource.mjs';

   const strategies = [
     // ... existing
     { name: 'NewSource', fn: () => fetchFromNewSource(title) },
   ];
   ```

## Issue Tracking

Uses beads (`bd`) for issue tracking:
```bash
bd list --status open    # See open issues
bd ready                 # Find ready-to-work issues
bd show <id>             # Issue details
```
