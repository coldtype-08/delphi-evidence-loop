"""CMS Medicare Part D Spending by Drug — real-world use at scale (US). No key needed."""
from __future__ import annotations

from . import cached_get

DATASET = "https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data"
YEARS = ["2020", "2021", "2022", "2023", "2024"]
WEB = "https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug"


def part_d(gnrc_name: str) -> dict:
    """Claims / beneficiaries / spending per year, summed in code across brands of the generic."""
    rec = cached_get("cms", DATASET, {"filter[Gnrc_Name]": gnrc_name, "size": 500})
    rows = rec["body"]
    # The dataset lists one row per manufacturer plus an 'Overall' row per brand — use the
    # Overall rows only, otherwise every brand is counted twice.
    overall = [r for r in rows if str(r.get("Mftr_Name", "")).strip().lower() == "overall"]
    use = overall or rows
    per_year = {y: {"claims": 0, "beneficiaries": 0, "spending_usd": 0.0} for y in YEARS}
    for r in use:
        for y in YEARS:
            per_year[y]["claims"] += int(float(r.get(f"Tot_Clms_{y}") or 0))
            per_year[y]["beneficiaries"] += int(float(r.get(f"Tot_Benes_{y}") or 0))
            per_year[y]["spending_usd"] += float(r.get(f"Tot_Spndng_{y}") or 0)
    return {
        "id": f"CMS-PartD:{gnrc_name}",
        "generic": gnrc_name,
        "brands": sorted({r.get("Brnd_Name", "") for r in rows}),
        "rows_used": len(use),
        "per_year": per_year,
        "url": WEB,
        "as_of": rec["as_of"],
    }
