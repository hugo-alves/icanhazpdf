from app.config import settings
from app.sources.base import SourceContext
from app.utils import is_title_match, safe_title_query


async def fetch_semantic_scholar(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    headers = {"User-Agent": settings.user_agent}
    if settings.semantic_scholar_api_key:
        headers["x-api-key"] = settings.semantic_scholar_api_key

    if doi:
        url = (
            "https://api.semanticscholar.org/graph/v1/paper/"
            f"DOI:{doi}?fields=title,openAccessPdf,externalIds,url"
        )
        data = await ctx.get_json(url, headers=headers)
        oa = data.get("openAccessPdf")
        if oa and oa.get("url"):
            return {"pdf_url": oa.get("url"), "metadata": data, "source": "semantic_scholar"}
        doi_value = (data.get("externalIds") or {}).get("DOI")
        if doi_value:
            return {
                "pdf_url": None,
                "doi": doi_value,
                "metadata": data,
                "source": "semantic_scholar",
            }
        return None

    if not title:
        return None

    url = (
        "https://api.semanticscholar.org/graph/v1/paper/search?query="
        f"{safe_title_query(title)}&limit=5&fields=title,openAccessPdf,externalIds,url"
    )
    data = await ctx.get_json(url, headers=headers)
    hits = data.get("data") or []
    if not hits:
        return None
    for hit in hits:
        if title and not is_title_match(title, hit.get("title", "")):
            continue
        oa = hit.get("openAccessPdf")
        if oa and oa.get("url"):
            return {"pdf_url": oa.get("url"), "metadata": hit, "source": "semantic_scholar"}
    for hit in hits:
        if title and not is_title_match(title, hit.get("title", "")):
            continue
        doi_value = (hit.get("externalIds") or {}).get("DOI")
        if doi_value:
            return {
                "pdf_url": None,
                "doi": doi_value,
                "metadata": hit,
                "source": "semantic_scholar",
            }
    return None
