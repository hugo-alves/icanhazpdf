# Paper PDF Fetcher API

FastAPI service that resolves open PDF URLs for papers using multiple sources with smart fallback and caching.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload
```

## Configuration

Set environment variables as needed:

- `SEMANTIC_SCHOLAR_API_KEY`
- `UNPAYWALL_EMAIL` (required for Unpaywall)
- `CORE_API_KEY`
- `CACHE_DB_PATH` (default `./cache.sqlite`)

## Example

```bash
curl "http://localhost:8000/fetch?doi=10.1038/nature12373"
curl "http://localhost:8000/download?doi=10.1038/nature12373" --output paper.pdf
```

## Fallback Order

1. arXiv
2. Semantic Scholar
3. OpenAlex
4. PubMed Central
5. CORE
6. If DOI found: Crossref → Unpaywall
