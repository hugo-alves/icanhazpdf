from __future__ import annotations

from typing import Any

import httpx

from app.cache import Cache
from app.config import settings


class SourceContext:
    def __init__(self, client: httpx.AsyncClient, cache: Cache) -> None:
        self.client = client
        self.cache = cache

    async def get_json(self, url: str, headers: dict | None = None) -> Any:
        cache_key = f"json:{url}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached
        resp = await self.client.get(url, headers=headers, timeout=settings.request_timeout_seconds)
        resp.raise_for_status()
        data = resp.json()
        self.cache.set(cache_key, data, settings.cache_ttl_seconds)
        return data

    async def get_text(self, url: str, headers: dict | None = None) -> str:
        cache_key = f"text:{url}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return cached
        resp = await self.client.get(url, headers=headers, timeout=settings.request_timeout_seconds)
        resp.raise_for_status()
        text = resp.text
        self.cache.set(cache_key, text, settings.cache_ttl_seconds)
        return text
