import hashlib
import re
from urllib.parse import quote


def normalize_doi(doi: str) -> str:
    doi = doi.strip()
    doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "")
    return doi.lower()


def build_query_key(doi: str | None, title: str | None, authors: str | None, year: int | None) -> str:
    payload = "|".join(
        [
            normalize_doi(doi) if doi else "",
            (title or "").strip().lower(),
            (authors or "").strip().lower(),
            str(year) if year else "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def safe_title_query(title: str) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    return quote(title)


def normalize_title(title: str) -> str:
    if not title:
        return ""
    title = title.lower()
    title = re.sub(r"[^\w\s]", " ", title)
    title = re.sub(r"\s+", " ", title)
    return title.strip()


def title_similarity(title1: str, title2: str) -> float:
    norm1 = normalize_title(title1)
    norm2 = normalize_title(title2)
    words1 = {w for w in norm1.split() if len(w) > 2}
    words2 = {w for w in norm2.split() if len(w) > 2}
    if not words1 or not words2:
        return 0.0
    intersection = len(words1 & words2)
    union = len(words1 | words2)
    return intersection / union


def is_title_match(search_title: str, result_title: str, threshold: float = 0.5) -> bool:
    return title_similarity(search_title, result_title) >= threshold
