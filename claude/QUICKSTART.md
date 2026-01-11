# Quick Start Guide

## Install & Run (30 seconds)

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
```

The API is now running at `http://localhost:3000`

## Test It

```bash
# Fetch a paper
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need"}'
```

**Response:**
```json
{
  "success": true,
  "pdf_url": "http://arxiv.org/pdf/1706.03762v7.pdf",
  "source": "arXiv",
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": "Ashish Vaswani, Noam Shazeer, ...",
    "published": "2017-06-12T17:57:34Z"
  }
}
```

## Common Use Cases

### 1. Get PDF URL Only
```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Deep Learning"}'
```

### 2. Download PDF Locally
```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "ImageNet Classification", "downloadLocal": true}'
```

### 3. Fetch Multiple Papers
```bash
curl -X POST http://localhost:3000/api/batch-fetch \
  -H "Content-Type: application/json" \
  -d '{"titles": ["BERT", "GPT-3", "Transformer"]}'
```

### 4. Force Fresh Fetch (Skip Cache)
```bash
curl -X POST http://localhost:3000/api/fetch \
  -H "Content-Type: application/json" \
  -d '{"title": "Attention Is All You Need", "skipCache": true}'
```

## Development Mode

Auto-restart on file changes:
```bash
npm run dev
```

## Run Tests

```bash
npm test
```

## Docker

```bash
# Build
docker build -t paper-fetcher .

# Run
docker run -p 3000:3000 paper-fetcher
```

## Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## Tips

- **Best results**: Use exact, full paper titles
- **Cache**: Results are cached in `cache.json` for fast repeated queries
- **Sources**: Tries 7+ sources automatically (arXiv, Semantic Scholar, OpenAlex, etc.)
- **Success rate**: ~80-90% for papers with open access versions

## Troubleshooting

**Port already in use?**
```bash
PORT=8080 npm start
```

**Clear cache?**
```bash
rm cache.json
```

**Check logs?**
Server outputs detailed logs showing which sources it tries and results.

## Next Steps

- Read [README.md](README.md) for full documentation
- Check `src/fetchers/` to see how each source works
- Add your own sources by creating new fetchers
