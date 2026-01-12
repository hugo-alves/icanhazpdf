# ICanHazPDF

> **The legal way to get that PDF**

Find open access versions of academic papers from 7+ sources. No more asking strangers on Twitter.

## Quick Start

```bash
npm install
npm start
```

```bash
# Search for a paper
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'
```

## Features

- **7+ Open Access Sources** — arXiv, Semantic Scholar, OpenAlex, PubMed Central, CORE, Crossref, Unpaywall
- **Smart Fallback** — Tries sources in order of reliability until PDF found
- **Real-time Progress** — SSE streaming shows which sources are being checked
- **Copy BibTeX** — One-click citation copying
- **Caching** — Avoids redundant API calls
- **Self-hostable** — No account needed, run it yourself

## Demo

Visit the web UI at `http://localhost:3000` after starting the server.

## API

### POST `/api/fetch`

Fetch a single paper by title.

```json
{
  "title": "Attention Is All You Need",
  "downloadLocal": false,
  "skipCache": false
}
```

**Response:**

```json
{
  "success": true,
  "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
  "source": "arXiv",
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": "Vaswani, Ashish; Shazeer, Noam; ...",
    "year": 2017
  }
}
```

### POST `/api/batch-fetch`

Fetch multiple papers (max 10).

```json
{
  "titles": ["Attention Is All You Need", "BERT"]
}
```

### GET `/api/fetch-stream?title=...`

SSE endpoint for real-time progress updates.

### GET `/api/health`

Health check endpoint.

## Data Sources

| Source | Type | Coverage | Best For |
|--------|------|----------|----------|
| **arXiv** | Preprint repository | CS, ML, Physics, Math | ML/AI papers |
| **Semantic Scholar** | AI aggregator | All fields | General search |
| **OpenAlex** | Open catalog | 250M+ works | Broad coverage |
| **PubMed Central** | NIH repository | Biomedical | Medical/biology |
| **CORE** | UK aggregator | Open repositories | UK research |
| **Crossref** | DOI registry | 130M+ works | DOI lookup |
| **Unpaywall** | OA finder | DOI-based | Legal OA versions |

## Configuration

Most sources work without API keys. Optional configuration via `.env`:

```bash
SEMANTIC_SCHOLAR_API_KEY=     # Higher rate limits
UNPAYWALL_EMAIL=your@email.com # Required by Unpaywall API
PORT=3000                      # Server port
```

## Deployment

### Vercel

```bash
npm i -g vercel
vercel
```

### Docker

```bash
docker build -t icanhazpdf .
docker run -p 3000:3000 icanhazpdf
```

## Benchmark

Achieves **19/20** on the LLM papers benchmark. The 1 failure is a paywalled paper with no open access version available anywhere.

## Why "ICanHazPDF"?

The `#icanhazpdf` hashtag on Twitter/X is how researchers ask strangers to send them paywalled papers. It's a workaround to an absurd system where taxpayer-funded research is locked behind paywalls.

**ICanHazPDF** is the legal alternative — it searches only open access sources to find papers you can download without breaking any rules.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new data sources or improving existing ones.

## License

MIT — see [LICENSE](LICENSE)

## Links

- [Report a bug](https://github.com/hugo-alves/icanhazpdf/issues)
- [Request a feature](https://github.com/hugo-alves/icanhazpdf/issues)
