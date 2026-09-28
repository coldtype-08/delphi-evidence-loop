"""Sense — field notes → structured claims with evidence pointers → hypothesis drafts.

The model picks and quotes. Code verifies every quote, computes offsets, separates adverse events,
counts mentions and distinct HCPs, and applies the threshold. Numbers never come from the model.
"""
from __future__ import annotations

import json
from collections import defaultdict

from . import store
from .llm import call_structured
from .quotes import locate

SIGNAL_TYPES = ["OFF_LABEL_DEMAND", "OFF_LABEL_USE", "REPURPOSING", "UNMET_NEED", "DOSING", "SAFETY_TOLERABILITY"]

SENSE_SCHEMA = {
    "type": "object", "required": ["claims"],
    "properties": {"claims": {"type": "array", "items": {
        "type": "object", "required": ["segment", "signal_type", "quote", "is_adverse_event", "note_ko"],
        "properties": {
            "segment": {"type": "string"},
            "signal_type": {"type": "string", "enum": SIGNAL_TYPES},
            "quote": {"type": "string"},
            "is_adverse_event": {"type": "boolean"},
            "note_ko": {"type": "string"},
        }}}},
}

HYP_SCHEMA = {
    "type": "object",
    "required": ["statement_ko", "statement_en", "label_status_guess", "pubmed_query", "ctgov_condition"],
    "properties": {
        "statement_ko": {"type": "string"}, "statement_en": {"type": "string"},
        "label_status_guess": {"type": "string", "enum": ["IN_LABEL", "DEVELOPMENT"]},
        "pubmed_query": {"type": "string"}, "ctgov_condition": {"type": "string"},
    },
}


def run(state: dict, contract: dict, notes: list[dict], force: bool = False, workers: int = 4) -> dict:
    """Extract claims from every note. Returns counts of kept / dropped / adverse-event claims.

    Model calls run in parallel (they are independent per note); results are applied in note order so
    claim ids and the state are deterministic regardless of which call returns first."""
    from concurrent.futures import ThreadPoolExecutor

    segments = contract["segments"] + ["OTHER"]
    system = (store.prompt("sense").replace("{{drug}}", contract["drug"])
              .replace("{{segments}}", ", ".join(segments)))
    done = {c["doc_id"] for c in state["claims"]} | {c["doc_id"] for c in state["safety_queue"]}
    stats = {"docs": 0, "kept": 0, "dropped": 0, "adverse_events": 0}
    todo = [n for n in notes if force or n["doc_id"] not in done]

    def extract(note):
        return call_structured("sense", system=system, user=json.dumps(note, ensure_ascii=False),
                               schema_name="sense_claims_v1", schema=SENSE_SCHEMA, force=force)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        outputs = list(pool.map(extract, todo))
    for note, out in zip(todo, outputs):
        stats["docs"] += 1
        for i, c in enumerate(out["claims"], 1):
            loc = locate(c["quote"], note["text"])
            claim = {
                "id": f"CLM-{note['doc_id']}-{i:02d}", "doc_id": note["doc_id"], "hcp_ref": note["hcp_ref"],
                "segment": c["segment"] if c["segment"] in segments else "OTHER",
                "signal_type": c["signal_type"], "quote": c["quote"],
                "char_start": loc[0] if loc else None, "char_end": loc[1] if loc else None,
                "verified": loc is not None, "note_ko": c["note_ko"],
                "contract_version": contract["version"], "status": "CANDIDATE", "extracted_at": store.now(),
            }
            if not loc:
                stats["dropped"] += 1
            if c["is_adverse_event"]:
                stats["adverse_events"] += 1
                state["safety_queue"].append(claim)   # rule: AE candidates never enter the analytics path
                continue
            stats["kept"] += int(loc is not None)
            state["claims"].append(claim)
    store.save(state)
    return stats


def tally(state: dict) -> list[dict]:
    """(segment × signal_type) → mentions and distinct HCPs, verified non-AE claims only. Pure code."""
    groups: dict[tuple, dict] = defaultdict(lambda: {"mentions": 0, "hcps": set(), "claim_ids": []})
    for c in state["claims"]:
        if not c["verified"] or c["segment"] == "OTHER":
            continue
        g = groups[(c["segment"], c["signal_type"])]
        g["mentions"] += 1
        g["hcps"].add(c["hcp_ref"])
        g["claim_ids"].append(c["id"])
    rows = [{"segment": k[0], "signal_type": k[1], "mentions": v["mentions"],
             "hcps": len(v["hcps"]), "claim_ids": v["claim_ids"]} for k, v in groups.items()]
    return sorted(rows, key=lambda r: (-r["mentions"], -r["hcps"]))


def draft_hypotheses(state: dict, contract: dict, min_mentions: int = 3, min_hcps: int = 3) -> list[dict]:
    """Groups over the threshold that have no hypothesis yet get a DRAFT. The threshold is code; the wording is the model."""
    existing = {(h["segment"], h["signal_type"]) for h in state["hypotheses"]}
    system = store.prompt("hypothesis").replace("{{drug}}", contract["drug"])
    created = []
    for row in tally(state):
        if row["mentions"] < min_mentions or row["hcps"] < min_hcps:
            continue
        if (row["segment"], row["signal_type"]) in existing:
            continue
        quotes = [c["quote"] for c in state["claims"] if c["id"] in row["claim_ids"]]
        out = call_structured("hypothesis", system=system,
                              user=json.dumps({**row, "quotes": quotes}, ensure_ascii=False),
                              schema_name="hypothesis_v1", schema=HYP_SCHEMA)
        hyp = {
            "id": f"HYP-{len(state['hypotheses']) + 1:03d}", "drug": contract["drug"],
            "segment": row["segment"], "signal_type": row["signal_type"],
            "statement_ko": out["statement_ko"], "statement_en": out["statement_en"],
            "label_status": out["label_status_guess"], "label_status_source": "model_guess",
            "field": {"mentions": row["mentions"], "hcps": row["hcps"], "claim_ids": row["claim_ids"]},
            "search": {"pubmed_query": out["pubmed_query"], "ctgov_condition": out["ctgov_condition"]},
            "status": "DRAFT", "created_at": store.now(),
        }
        state["hypotheses"].append(hyp)
        created.append(hyp)
    store.save(state)
    return created
