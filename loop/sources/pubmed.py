"""PubMed E-utilities — literature evidence. No key needed (3 req/s limit)."""
from __future__ import annotations

import xml.etree.ElementTree as ET

from . import cached_get

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"


def search(term: str, retmax: int = 25) -> dict:
    rec = cached_get("pubmed", f"{EUTILS}/esearch.fcgi",
                     {"db": "pubmed", "term": term, "retmode": "json", "retmax": retmax, "sort": "relevance"})
    res = rec["body"]["esearchresult"]
    return {"term": term, "count": int(res["count"]), "ids": res["idlist"], "as_of": rec["as_of"]}


def fetch(pmids: list[str]) -> list[dict]:
    """Title + abstract + year + publication types for each PMID (efetch XML)."""
    if not pmids:
        return []
    rec = cached_get("pubmed", f"{EUTILS}/efetch.fcgi",
                     {"db": "pubmed", "id": ",".join(pmids), "retmode": "xml", "rettype": "abstract"})
    root = ET.fromstring(rec["body"]["text"])
    out = []
    for art in root.iter("PubmedArticle"):
        pmid = art.findtext(".//PMID") or ""
        title_el = art.find(".//ArticleTitle")
        title = "".join(title_el.itertext()) if title_el is not None else ""
        abstract = " ".join("".join(a.itertext()) for a in art.findall(".//Abstract/AbstractText")).strip()
        year = (art.findtext(".//PubDate/Year") or art.findtext(".//PubDate/MedlineDate") or "")[:4]
        out.append({
            "id": f"PMID:{pmid}",
            "title": title,
            "abstract": abstract,
            "year": year,
            "journal": art.findtext(".//Journal/Title") or "",
            "types": [p.text for p in art.findall(".//PublicationType") if p.text],
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            "as_of": rec["as_of"],
        })
    return out


def search_and_fetch(term: str, retmax: int = 25) -> dict:
    s = search(term, retmax)
    return {**s, "articles": fetch(s["ids"])}
