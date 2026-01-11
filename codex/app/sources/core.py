from app.config import settings
from app.sources.base import SourceContext
from app.utils import safe_title_query


async def fetch_core(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    if not settings.core_api_key:
        return None

    headers = {"Authorization": f"Bearer {settings.core_api_key}"}
    if doi:
        query = doi
    elif title:
        query = title
    else:
        return None

    url = f"https://api.core.ac.uk/v3/search/works?q={safe_title_query(query)}&limit=1"
    data = await ctx.get_json(url, headers=headers)
    results = data.get("results") or []
    if not results:
        return None
    hit = results[0]
    pdf_url = hit.get("downloadUrl") or hit.get("fullTextLink")
    if not pdf_url:
        doi_value = hit.get("doi")
        if doi_value:
            return {"pdf_url": None, "doi": doi_value, "metadata": hit, "source": "core"}
        return None
    return {"pdf_url": pdf_url, "metadata": hit, "source": "core"}
