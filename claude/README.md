# Paper PDF Fetcher API

A comprehensive API service that fetches academic paper PDFs from multiple open-access sources. Maximizes success rate by implementing smart fallback strategies across 7+ sources.

## Features

- **Multiple Sources**: arXiv, Semantic Scholar, OpenAlex, PubMed Central, CORE, Crossref, Unpaywall
- **Smart Fallback**: Automatically tries sources in order of reliability and legality
- **Caching**: Stores successful fetches to avoid redundant API calls
- **Local Storage**: Optional PDF download and storage
- **Batch Processing**: Fetch multiple papers in a single request
- **RESTful API**: Simple JSON-based API

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure (optional):

```bash
cp .env.example .env
```

Most sources work without API keys. Optional configurations:
- `SEMANTIC_SCHOLAR_API_KEY`: For higher rate limits
- `UNPAYWALL_EMAIL`: Your email (required by Unpaywall API)

### Run the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000` by default.

## API Endpoints

### 1. Fetch Single Paper

**POST** `/api/fetch`

Fetch a PDF for a single paper by title.

**Request Body:**
```json
{
  "title": "Attention Is All You Need",
  "downloadLocal": false,
  "skipCache": false
}
```

**Parameters:**
- `title` (required): Paper title to search for
- `downloadLocal` (optional): Download and store PDF locally (default: false)
- `skipCache` (optional): Skip cache and force fresh fetch (default: false)

**Response (Success):**
```json
{
  "success": true,
  "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
  "pdf_path": null,
  "source": "arXiv",
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": "Vaswani, Ashish; Shazeer, Noam; ...",
    "year": 2017
  },
  "fetchedAt": "2024-01-11T10:30:00.000Z",
  "cached": false
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Paper not found in any source",
  "triedSources": ["arXiv", "Semantic Scholar", "OpenAlex", "PubMed Central", "CORE", "Crossref", "Unpaywall"]
}
```

### 2. Batch Fetch Papers

**POST** `/api/batch-fetch`

Fetch multiple papers in a single request (max 10).

**Request Body:**
```json
{
  "titles": [
    "Attention Is All You Need",
    "BERT: Pre-training of Deep Bidirectional Transformers"
  ],
  "downloadLocal": false
}
```

**Response:**
```json
{
  "success": true,
  "total": 2,
  "successful": 2,
  "results": [
    {
      "title": "Attention Is All You Need",
      "result": {
        "success": true,
        "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
        "source": "arXiv"
      }
    },
    {
      "title": "BERT: Pre-training of Deep Bidirectional Transformers",
      "result": {
        "success": true,
        "pdf_url": "https://arxiv.org/pdf/1810.04805.pdf",
        "source": "arXiv"
      }
    }
  ]
}
```

### 3. Health Check

**GET** `/api/health`

Check if the service is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-11T10:30:00.000Z"
}
```

## Usage Examples

### cURL

```bash
# Fetch a paper
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'

# Fetch with local download
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need", "downloadLocal": true}'

# Batch fetch
curl -X POST http://localhost:3000/api/batch-fetch \
  -H "Content-Type: application/json" \
  -d '{"titles": ["Attention Is All You Need", "BERT"]}'
```

### JavaScript/Node.js

```javascript
const response = await fetch('http://localhost:3000/api/fetch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Attention Is All You Need'
  })
});

const result = await response.json();
if (result.success) {
  console.log('PDF URL:', result.pdf_url);
  console.log('Source:', result.source);
}
```

### Python

```python
import requests

response = requests.post('http://localhost:3000/api/fetch', json={
    'title': 'Attention Is All You Need'
})

result = response.json()
if result['success']:
    print(f"PDF URL: {result['pdf_url']}")
    print(f"Source: {result['source']}")
```

## How It Works

The fetcher implements a smart cascading strategy:

1. **arXiv**: Fast, free, reliable for preprints
2. **Semantic Scholar**: Aggregates papers with open access links
3. **OpenAlex**: Large open catalog of scholarly papers
4. **PubMed Central**: Biomedical and life sciences papers
5. **CORE**: UK-based open access aggregator
6. **Crossref**: DOI lookup (metadata only)
7. **Unpaywall**: Legal open access via DOI

For each paper:
1. Check cache for previous successful fetch
2. Try sources in order until PDF found
3. Extract DOI if available
4. Use DOI with Unpaywall as final attempt
5. Cache successful result

## Data Sources

### arXiv
- **Type**: Preprint repository
- **Coverage**: Physics, math, CS, biology, finance
- **API**: Free, no key required
- **Reliability**: Very high for preprints

### Semantic Scholar
- **Type**: AI-powered research aggregator
- **Coverage**: All fields
- **API**: Free, optional key for higher limits
- **Reliability**: High

### OpenAlex
- **Type**: Open catalog of scholarly papers
- **Coverage**: 250M+ works
- **API**: Free, no key required
- **Reliability**: High

### PubMed Central (PMC)
- **Type**: Biomedical repository
- **Coverage**: Biomedical and life sciences
- **API**: Free, no key required
- **Reliability**: Very high for biomedical papers

### CORE
- **Type**: Repository aggregator
- **Coverage**: UK and global repositories
- **API**: Free
- **Reliability**: Medium

### Crossref
- **Type**: DOI registration agency
- **Coverage**: Metadata for 130M+ works
- **API**: Free, no key required
- **Reliability**: High for DOI lookup (no PDFs)

### Unpaywall
- **Type**: Legal open access finder
- **Coverage**: Uses DOI to find OA versions
- **API**: Free (requires email)
- **Reliability**: High for DOI-based lookup

## Caching

Successful fetches are cached in `cache.json`:
- Key: Normalized paper title
- Value: Complete fetch result with metadata
- Benefits: Faster responses, reduced API calls

To clear cache:
```bash
rm cache.json
```

## Local PDF Storage

When `downloadLocal: true`:
- PDFs saved to `./pdfs/` directory
- Filename: `normalized_title_timestamp.pdf`
- Max size: 100MB per PDF
- Result includes `pdf_path` field

## Deployment

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.mjs"]
```

```bash
docker build -t paper-fetcher .
docker run -p 3000:3000 paper-fetcher
```

### Environment Variables

For production, set these environment variables:
- `PORT`: Server port (default: 3000)
- `PDF_STORAGE_PATH`: Path for downloaded PDFs (default: ./pdfs)
- `CACHE_FILE`: Cache file location (default: ./cache.json)
- `UNPAYWALL_EMAIL`: Your email for Unpaywall API
- `SEMANTIC_SCHOLAR_API_KEY`: Optional API key

## Limitations

- **Success rate**: Depends on paper availability in open access sources
- **Paywalled papers**: Cannot fetch papers behind paywalls
- **Rate limits**: Some sources have rate limits (mitigated by fallback strategy)
- **Fuzzy matching**: Title must be fairly accurate (typos may cause failures)

## Tips for Best Results

1. **Use exact titles**: Copy-paste titles from the source
2. **Include subtitles**: Full title increases match accuracy
3. **Try multiple sources**: API tries all sources automatically
4. **Check preprints**: Many papers have arXiv preprints
5. **Biomedical papers**: High success rate via PubMed Central

## License

MIT

## Contributing

Contributions welcome! To add new sources:
1. Create fetcher in `src/fetchers/`
2. Implement standard interface (see existing fetchers)
3. Add to strategy list in `src/paperFetcher.mjs`
4. Update documentation

## Support

For issues or questions, open an issue on GitHub.
