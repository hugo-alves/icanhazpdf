from app.sources.base import SourceContext
from app.utils import is_title_match, safe_title_query


def _extract_pdf(data: dict) -> str | None:
    oa = data.get("open_access") or {}
    if oa.get("oa_url"):
        return oa.get("oa_url")
    primary = data.get("primary_location") or {}
    if primary.get("pdf_url"):
        return primary.get("pdf_url")
    return None


async def fetch_openalex(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    if doi:
        url = f"https://api.openalex.org/works/https://doi.org/{doi}"
        data = await ctx.get_json(url)
        pdf_url = _extract_pdf(data)
        if not pdf_url:
            doi_value = data.get("doi")
            if doi_value:
                return {
                    "pdf_url": None,
                    "doi": doi_value,
                    "metadata": data,
                    "source": "openalex",
                }
            return None
        return {"pdf_url": pdf_url, "metadata": data, "source": "openalex"}

    if not title:
        return None

    url = f"https://api.openalex.org/works?search={safe_title_query(title)}&per-page=1"
    data = await ctx.get_json(url)
    results = data.get("results") or []
    if not results:
        return None
    hit = results[0]
    if title and not is_title_match(title, hit.get("title", "")):
        return None
    pdf_url = _extract_pdf(hit)
    if not pdf_url:
        doi_value = hit.get("doi")
        if doi_value:
            return {
                "pdf_url": None,
                "doi": doi_value,
                "metadata": hit,
                "source": "openalex",
            }
        return None
    return {"pdf_url": pdf_url, "metadata": hit, "source": "openalex"}
