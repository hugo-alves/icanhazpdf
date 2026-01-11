import xml.etree.ElementTree as ET

from app.sources.base import SourceContext
from app.utils import safe_title_query


def _pdf_url_from_entry(entry: ET.Element, ns: dict) -> str | None:
    entry_id = entry.findtext("atom:id", default="", namespaces=ns)
    if "/abs/" in entry_id:
        arxiv_id = entry_id.split("/abs/", 1)[1]
        return f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    return None


async def fetch_arxiv(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    if not doi and not title:
        return None

    if doi:
        query = f"doi:{doi}"
    else:
        query = f'ti:"{title}"'

    url = f"https://export.arxiv.org/api/query?search_query={safe_title_query(query)}&max_results=1"
    text = await ctx.get_text(url)
    root = ET.fromstring(text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entry = root.find("atom:entry", ns)
    if entry is None:
        return None
    pdf_url = _pdf_url_from_entry(entry, ns)
    if not pdf_url:
        return None
    title_el = entry.find("atom:title", ns)
    return {
        "pdf_url": pdf_url,
        "metadata": {"title": title_el.text.strip() if title_el is not None else None},
        "source": "arxiv",
    }
