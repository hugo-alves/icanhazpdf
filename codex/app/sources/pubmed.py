import xml.etree.ElementTree as ET

from app.sources.base import SourceContext
from app.utils import safe_title_query


def _pmc_pdf_url(pmcid: str) -> str:
    return f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/pdf/"


async def _pmcid_from_ids(ctx: SourceContext, ids: str) -> str | None:
    url = f"https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids={ids}"
    text = await ctx.get_text(url)
    root = ET.fromstring(text)
    record = root.find("record")
    if record is None:
        return None
    pmcid = record.attrib.get("pmcid")
    return pmcid


async def fetch_pubmed(ctx: SourceContext, doi: str | None, title: str | None) -> dict | None:
    if doi:
        pmcid = await _pmcid_from_ids(ctx, doi)
        if not pmcid:
            return None
        return {"pdf_url": _pmc_pdf_url(pmcid), "metadata": {"pmcid": pmcid}, "source": "pubmed"}

    if not title:
        return None

    url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?"
        f"db=pubmed&retmax=1&term={safe_title_query(title)}"
    )
    text = await ctx.get_text(url)
    root = ET.fromstring(text)
    id_list = root.find("IdList")
    if id_list is None:
        return None
    id_el = id_list.find("Id")
    if id_el is None:
        return None
    pmid = id_el.text
    pmcid = await _pmcid_from_ids(ctx, pmid)
    if not pmcid:
        return None
    return {"pdf_url": _pmc_pdf_url(pmcid), "metadata": {"pmcid": pmcid, "pmid": pmid}, "source": "pubmed"}
