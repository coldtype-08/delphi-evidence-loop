"""Smoke test for the four evidence sources — no model, no key. `uv run python scripts/smoke_sources.py`"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loop.sources import cms, ctgov, openfda, pubmed  # noqa: E402

DRUG, DRUG_EXACT, CMS_NAME = "metformin", "METFORMIN HYDROCHLORIDE", "Metformin HCl"
COND = "polycystic ovary syndrome"

pm = pubmed.search_and_fetch(f"{DRUG}[Title] AND {COND}[Title/Abstract]", retmax=5)
print(f"[PubMed] {pm['count']} hits · fetched {len(pm['articles'])} · as of {pm['as_of']}")
for a in pm["articles"][:3]:
    print(f"   {a['id']} {a['year']} {a['title'][:80]} · abstract {len(a['abstract'])} chars · {a['types'][:2]}")

ct = ctgov.search(DRUG, COND, page_size=5)
print(f"[CT.gov] {ct['total']} trials · recruiting {ctgov.count(DRUG, COND, 'RECRUITING')}")
for s in ct["studies"][:3]:
    print(f"   {s['id']} {s['status']} {s['phases']} n={s['enrollment']} {s['title'][:70]} · sponsor {s['sponsor'][:30]}")

lb = openfda.label(DRUG_EXACT)
print(f"[openFDA label] {lb['id']} {lb['brand']} · {lb['manufacturer'][:40]} · sections {list(lb['sections'])}")
print("   indications:", lb["sections"].get("indications_and_usage", "")[:160])
print(f"[openFDA FAERS] total {openfda.event_total(DRUG):,} · top:",
      ", ".join(f"{r['term']} {r['count']:,}" for r in openfda.top_reactions(DRUG, 5)["top"]))

pd = cms.part_d(CMS_NAME)
print(f"[CMS Part D] rows used {pd['rows_used']} · brands {len(pd['brands'])}")
for y, v in pd["per_year"].items():
    print(f"   {y}: claims {v['claims']:,} · beneficiaries {v['beneficiaries']:,} · ${v['spending_usd']:,.0f}")
