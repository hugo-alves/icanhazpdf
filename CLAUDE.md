# CLAUDE.md

API service to fetch academic paper PDFs from multiple sources with smart fallback.

## Quick Start

```bash
cd claude
npm install
npm run dev    # Development with auto-reload
npm start      # Production
npm test       # Run test suite
```

## Project Structure

```
paper-fetcher/
├── claude/                    # Node.js/Express implementation (active)
│   ├── server.mjs             # Express server with API endpoints
│   ├── src/
│   │   ├── paperFetcher.mjs   # Main orchestrator with fallback logic
│   │   ├── fetchers/          # Individual source fetchers
│   │   │   ├── arxiv.mjs
│   │   │   ├── semanticScholar.mjs
│   │   │   ├── openalex.mjs
│   │   │   ├── pubmed.mjs
│   │   │   ├── core.mjs
│   │   │   ├── crossref.mjs
│   │   │   ├── unpaywall.mjs
│   │   │   └── webSearch.mjs
│   │   └── utils/
│   │       └── titleMatch.mjs  # Title validation to prevent false positives
│   ├── public/
│   │   └── index.html         # Web UI
│   ├── test.mjs               # Test suite
│   └── vercel.json            # Vercel deployment config
└── codex/                     # Python/FastAPI implementation (deprecated)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/fetch` | POST | Fetch single paper PDF |
| `/api/batch-fetch` | POST | Fetch up to 10 papers |
| `/api/health` | GET | Health check |
| `/` | GET | Web UI |

### Request Format

```bash
# Single paper
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'

# With options
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "BERT", "downloadLocal": true, "skipCache": true}'
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
7. **Web Search** - Last resort fallback
8. **Unpaywall** - Tries if DOI found but no PDF yet

## Environment Variables

```bash
# Optional API keys (most sources work without)
SEMANTIC_SCHOLAR_API_KEY=
UNPAYWALL_EMAIL=your-email@example.com

# Server config
PORT=3000
PDF_STORAGE_PATH=./pdfs
CACHE_FILE=./cache.json
```

## Caching

- Results cached in `cache.json` (JSON file)
- Cache key: normalized lowercase title
- Use `skipCache: true` to bypass

## Deployment

Deployed to Vercel. The `vercel.json` configures:
- API routes → `server.mjs`
- Static files → `public/`

## Benchmark

Achieves **19/20** on the LLM papers benchmark. The 1 failure is a paywalled paper with no open access PDF available.

## Adding a New Source

1. Create `src/fetchers/newSource.mjs`:
   ```javascript
   export async function fetchFromNewSource(title) {
     // Return: { success: true, pdf_url, source, metadata }
     // Or: { success: false, error }
   }
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

Uses beads (`bd`) for issue tracking. See `AGENTS.md` for workflow.
