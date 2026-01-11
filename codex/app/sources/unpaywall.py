from app.config import settings
from app.sources.base import SourceContext


async def fetch_unpaywall(ctx: SourceContext, doi: str | None) -> dict | None:
    if not doi or not settings.unpaywall_email:
        return None

    url = f"https://api.unpaywall.org/v2/{doi}?email={settings.unpaywall_email}"
    data = await ctx.get_json(url)
    best = data.get("best_oa_location") or {}
    pdf_url = best.get("url_for_pdf") or best.get("url")
    if not pdf_url:
        return None
    return {"pdf_url": pdf_url, "metadata": data, "source": "unpaywall"}
