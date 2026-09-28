"""Screen — gather public evidence for one hypothesis and let three agents mark stance with verbatim quotes.

Screen does not decide. It collects what a human will read. Every quote is verified by code against the
record the model saw; unverified items are kept, flagged and shown, but never counted.
"""
from __future__ import annotations

import json

from . import store
from .llm import call_structured
from .quotes import locate
from .sources import cms, ctgov, openfda, pubmed

STANCES = ["SUPPORTS", "CONTRADICTS", "NEUTRAL"]
ITEMS_SCHEMA = {
    "type": "object", "required": ["items"],
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "required": ["source_id", "stance", "quote", "note_ko"],
        "properties": {"source_id": {"type": "string"}, "stance": {"type": "string", "enum": STANCES},
                       "quote": {"type": "string"}, "note_ko": {"type": "string"}}}}},
}
MAX_RECORDS = 12
HEAVY_FIRST = 6   # RCTs / phase-3 / meta-analyses are read first — relevance ranking alone buries them
RCT_FILTER = "(randomized controlled trial[pt] OR clinical trial, phase iii[pt] OR meta-analysis[pt])"


def _cut(text: str, limit: int) -> str:
    """Truncate at a sentence boundary so the model never sees a half word it might 'complete' from memory."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    dot = head.rfind(". ")
    return head[:dot + 1] if dot > limit // 2 else head


def _merge(first: list[dict], rest: list[dict], limit: int) -> list[dict]:
    seen, out = set(), []
    for r in first + rest:
        if r["id"] not in seen and len(out) < limit:
            seen.add(r["id"])
            out.append(r)
    return out


def gather(hyp: dict, contract: dict) -> dict:
    """Fetch (cached) records from the four public sources. Returns text records the agents will read + raw numbers."""
    q = hyp["search"]
    pm_heavy = pubmed.search_and_fetch(f"({q['pubmed_query']}) AND {RCT_FILTER}", retmax=HEAVY_FIRST)
    pm = pubmed.search_and_fetch(q["pubmed_query"], retmax=MAX_RECORDS)
    ct_heavy = ctgov.search(contract["drug"], q["ctgov_condition"], page_size=HEAVY_FIRST, phase3_only=True)
    ct = ctgov.search(contract["drug"], q["ctgov_condition"], page_size=MAX_RECORDS)
    label = openfda.label(contract["openfda_generic_exact"])
    faers = openfda.top_reactions(contract["openfda_generic_term"], 8)
    partd = cms.part_d(contract["cms_generic"])
    articles = _merge([a for a in pm_heavy["articles"] if a["abstract"]],
                      [a for a in pm["articles"] if a["abstract"]], MAX_RECORDS + HEAVY_FIRST)
    studies = _merge(ct_heavy["studies"], ct["studies"], MAX_RECORDS + HEAVY_FIRST)
    records = {
        "pubmed": [{"id": a["id"], "url": a["url"],
                    "text": f"{a['title']}\n[{a['year']} · {', '.join(a['types'][:2])}]\n{_cut(a['abstract'], 1400)}"}
                   for a in articles],
        "ctgov": [{"id": s["id"], "url": s["url"],
                   "text": (f"{s['title']}\n[status {s['status']} · phases {', '.join(s['phases']) or '-'} · "
                            f"n={s['enrollment']} · start {s['start']} · sponsor {s['sponsor']}]\n{_cut(s['summary'], 900)}")}
                  for s in studies],
        "label": [{"id": f"{label['id']}#{sec}", "url": label["url"], "text": _cut(text, 1600)}
                  for sec, text in label["sections"].items()],
    }
    numbers = {  # computed by the sources, never by a model
        "pubmed_hits": pm["count"], "pubmed_heavy_hits": pm_heavy["count"], "pubmed_read": len(records["pubmed"]),
        "ctgov_total": ct["total"], "ctgov_phase3_total": ct_heavy["total"],
        "ctgov_recruiting": ctgov.count(contract["drug"], q["ctgov_condition"], "RECRUITING"),
        "ctgov_read": len(records["ctgov"]),
        "faers_total": openfda.event_total(contract["openfda_generic_term"]),
        "faers_top": [{"term": r["term"], "count": r["count"]} for r in faers["top"]],
        "partd_per_year": partd["per_year"], "partd_brands": len(partd["brands"]),
        "label": {"brand": label["brand"], "effective_time": label["effective_time"]},
        "as_of": {"pubmed": pm["as_of"], "ctgov": ct["as_of"], "openfda": label["as_of"], "cms": partd["as_of"]},
    }
    return {"records": records, "numbers": numbers}


def run(state: dict, hyp_id: str, contract: dict, force: bool = False) -> dict:
    hyp = store.hypothesis(state, hyp_id)
    g = gather(hyp, contract)
    hyp_view = {k: hyp[k] for k in ("id", "drug", "segment", "signal_type", "statement_ko", "statement_en")}
    items, dropped = [], []
    sources = [src for src in ("pubmed", "ctgov", "label") if g["records"][src]]

    def judge(src):   # the three readers are independent — run them side by side
        return call_structured(f"screen_{src}", system=store.prompt(f"screen_{src}"),
                               user=json.dumps({"hypothesis": hyp_view, "records": g["records"][src]}, ensure_ascii=False),
                               schema_name=f"screen_{src}_items_v1", schema=ITEMS_SCHEMA, max_tokens=6000, force=force)

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=3) as pool:
        outputs = dict(zip(sources, pool.map(judge, sources)))
    for src in sources:
        recs, out = g["records"][src], outputs[src]
        by_id = {r["id"]: r for r in recs}
        for it in out["items"]:
            rec = by_id.get(it["source_id"])
            loc = locate(it["quote"], rec["text"]) if rec else None
            entry = {"source": src, **it, "url": rec["url"] if rec else None,
                     "char_start": loc[0] if loc else None, "char_end": loc[1] if loc else None,
                     "verified": loc is not None,
                     "drop_reason": None if loc else ("unknown source_id" if not rec else "quote not in record")}
            (items if loc else dropped).append(entry)

    # Tally — pure code. Distinct sources per stance, per origin.
    tally = {src: {s: 0 for s in STANCES} for src in ("pubmed", "ctgov", "label")}
    seen = set()
    for it in items:
        key = (it["source"], it["source_id"], it["stance"])
        if key in seen:
            continue
        seen.add(key)
        tally[it["source"]][it["stance"]] += 1
    totals = {s: sum(t[s] for t in tally.values()) for s in STANCES}
    flags = []
    if totals["SUPPORTS"] + totals["CONTRADICTS"] == 0:
        flags.append("NO_EXTERNAL_EVIDENCE")   # no evidence → no ranking; a human must decide what that means
    label_stance = [it["stance"] for it in items if it["source"] == "label"]
    label_status = "IN_LABEL" if "SUPPORTS" in label_stance else "DEVELOPMENT"

    screen = {"hypothesis_id": hyp_id, "ran_at": store.now(), "numbers": g["numbers"],
              "items": items, "dropped": dropped, "tally": tally, "totals": totals,
              "flags": flags, "label_status": label_status}
    state["screens"][hyp_id] = screen
    hyp["label_status"], hyp["label_status_source"] = label_status, "label_agent"
    hyp["status"] = "SCREENED"
    store.save(state)
    return screen
