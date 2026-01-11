from __future__ import annotations

from typing import Callable

from app.sources.arxiv import fetch_arxiv
from app.sources.core import fetch_core
from app.sources.crossref import fetch_crossref
from app.sources.openalex import fetch_openalex
from app.sources.pubmed import fetch_pubmed
from app.sources.semantic_scholar import fetch_semantic_scholar
from app.sources.unpaywall import fetch_unpaywall
from app.utils import normalize_doi


async def resolve_pdf(ctx, doi: str | None, title: str | None) -> dict | None:
    pipeline: list[Callable] = [
        fetch_arxiv,
        fetch_semantic_scholar,
        fetch_openalex,
        fetch_pubmed,
        fetch_core,
    ]

    input_doi = normalize_doi(doi) if doi else None
    found_doi = input_doi

    for fetcher in pipeline:
        try:
            result = await fetcher(ctx, input_doi, title)
        except Exception:
            result = None
        if result:
            pdf_url = result.get("pdf_url")
            if pdf_url:
                return result
            doi_value = result.get("doi")
            if doi_value and not found_doi:
                found_doi = normalize_doi(doi_value)

    if found_doi:
        try:
            result = await fetch_crossref(ctx, found_doi, None)
        except Exception:
            result = None
        if result and result.get("pdf_url"):
            return result

        try:
            result = await fetch_unpaywall(ctx, found_doi)
        except Exception:
            result = None
        if result and result.get("pdf_url"):
            return result
    return None
