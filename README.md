# Paper Fetcher API

API to fetch academic paper PDFs using multiple sources with smart fallback.

## Implementations

Two implementations built in parallel:

### `/claude` - Node.js/Express
- Built by Claude Code
- Sources: arXiv, Semantic Scholar, OpenAlex, PubMed, CORE, Crossref, Unpaywall
- Title validation to prevent false positives
- JSON file caching

### `/codex` - Python/FastAPI  
- Built by Codex (GPT-5.2)
- Sources: arXiv, Semantic Scholar, OpenAlex, PubMed, CORE, Crossref, Unpaywall
- Title validation to prevent false positives
- SQLite caching

## Benchmark Results

Both achieve **19/20** on the LLM papers benchmark (the 1 failure is a paywalled paper with no open access PDF).

## API Usage

```bash
# Claude (Node)
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'

# Codex (Python)
curl "http://localhost:8000/fetch?title=Attention%20Is%20All%20You%20Need"
```

## Deployment

Both are deployable to Vercel. See individual READMEs for details.
