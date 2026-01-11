from app.sources.base import SourceContext
from app.utils import safe_title_query


async def fetch_crossref(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    if doi:
        url = f"https://api.crossref.org/works/{doi}"
        data = await ctx.get_json(url)
        message = data.get("message") or {}
        for link in message.get("link", []) or []:
            if link.get("content-type") == "application/pdf" and link.get("URL"):
                return {"pdf_url": link.get("URL"), "metadata": message, "source": "crossref"}
        return None

    if not title:
        return None

    url = f"https://api.crossref.org/works?query.title={safe_title_query(title)}&rows=1"
    data = await ctx.get_json(url)
    items = (data.get("message") or {}).get("items") or []
    if not items:
        return None
    item = items[0]
    for link in item.get("link", []) or []:
        if link.get("content-type") == "application/pdf" and link.get("URL"):
            return {"pdf_url": link.get("URL"), "metadata": item, "source": "crossref"}
    return None
