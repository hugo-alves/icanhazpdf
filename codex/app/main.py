from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.cache import Cache
from app.config import settings
from app.models import FetchRequest, FetchResponse, HealthResponse
from app.sources.base import SourceContext
from app.sources import resolve_pdf
from app.utils import build_query_key, normalize_doi


cache = Cache(settings.cache_db_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient(headers={"User-Agent": settings.user_agent})
    app.state.ctx = SourceContext(app.state.client, cache)
    yield
    await app.state.client.aclose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


async def _resolve(request: FetchRequest) -> FetchResponse:
    doi = normalize_doi(request.doi) if request.doi else None
    key = build_query_key(doi, request.title, request.authors, request.year)
    cache_key = f"resolve:{key}"
    cached = cache.get(cache_key)
    if cached:
        cached_payload = dict(cached)
        cached_payload["cached"] = True
        return FetchResponse(**cached_payload)

    ctx = app.state.ctx
    result = await resolve_pdf(ctx, doi, request.title)
    response = FetchResponse(found=bool(result), pdf_url=None, source=None, metadata=None)
    if result:
        response.pdf_url = result.get("pdf_url")
        response.source = result.get("source")
        response.metadata = result.get("metadata")

    cache.set(cache_key, response.model_dump(), settings.cache_ttl_seconds)
    return response


@app.post("/fetch", response_model=FetchResponse)
async def fetch(request: FetchRequest) -> FetchResponse:
    response = await _resolve(request)
    if request.download and response.found and response.pdf_url:
        return response
    return response


@app.get("/fetch", response_model=FetchResponse)
async def fetch_get(
    doi: str | None = Query(default=None),
    title: str | None = Query(default=None),
    authors: str | None = Query(default=None),
    year: int | None = Query(default=None),
) -> FetchResponse:
    request = FetchRequest(doi=doi, title=title, authors=authors, year=year)
    return await _resolve(request)


@app.get("/download")
async def download(
    doi: str | None = Query(default=None),
    title: str | None = Query(default=None),
    authors: str | None = Query(default=None),
    year: int | None = Query(default=None),
):
    request = FetchRequest(doi=doi, title=title, authors=authors, year=year)
    response = await _resolve(request)
    if not response.found or not response.pdf_url:
        raise HTTPException(status_code=404, detail="PDF not found")

    async def stream():
        async with httpx.AsyncClient(headers={"User-Agent": settings.user_agent}) as client:
            async with client.stream(
                "GET", response.pdf_url, timeout=settings.request_timeout_seconds
            ) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream(), media_type="application/pdf")
