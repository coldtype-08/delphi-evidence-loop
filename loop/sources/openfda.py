"""openFDA — approved label (what is in-label) and adverse-event reports (FAERS). No key needed."""
from __future__ import annotations

from . import cached_get

LABEL = "https://api.fda.gov/drug/label.json"
EVENT = "https://api.fda.gov/drug/event.json"
SECTIONS = [
    "indications_and_usage", "boxed_warning", "pediatric_use", "geriatric_use",
    "warnings_and_cautions", "dosage_and_administration", "use_in_specific_populations",
]


def label(generic_name_exact: str) -> dict:
    """One single-ingredient SPL for the generic name, e.g. 'METFORMIN HYDROCHLORIDE'."""
    rec = cached_get("openfda", LABEL, {
        "search": f'openfda.generic_name.exact:"{generic_name_exact}" AND _exists_:pediatric_use',
        "limit": 1,
    })
    r = rec["body"]["results"][0]
    fda = r.get("openfda", {})
    return {
        "id": f"SPL:{r.get('set_id', '')}",
        "brand": ", ".join(fda.get("brand_name", [])),
        "manufacturer": ", ".join(fda.get("manufacturer_name", [])),
        "effective_time": r.get("effective_time", ""),
        "sections": {k: " ".join(r[k]) for k in SECTIONS if r.get(k)},
        "url": f"https://dailymed.nlm.nih.gov/dailymed/search.cfm?query={r.get('set_id', '')}",
        "as_of": rec["as_of"],
    }


def event_total(generic_term: str) -> int:
    rec = cached_get("openfda", EVENT, {"search": f'patient.drug.openfda.generic_name:"{generic_term}"', "limit": 1})
    return int(rec["body"]["meta"]["results"]["total"])


def top_reactions(generic_term: str, limit: int = 15) -> dict:
    rec = cached_get("openfda", EVENT, {
        "search": f'patient.drug.openfda.generic_name:"{generic_term}"',
        "count": "patient.reaction.reactionmeddrapt.exact", "limit": limit,
    })
    return {"id": f"FAERS:{generic_term}", "top": rec["body"]["results"], "as_of": rec["as_of"],
            "url": "https://open.fda.gov/data/faers/"}
