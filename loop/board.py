"""Human gates and the board.

Gate 1 — review.sign: a named person confirms they read the external evidence. Without it the board never runs.
Gate 2 — approve: a named person accepts the recommendation; only then do follow-up questions become field actions.
"""
from __future__ import annotations

import json

from . import store
from .llm import call_structured

RECOMMENDATIONS = ["PROCEED_TO_EXPERT_REVIEW", "HOLD", "DROP"]
BOARD_SCHEMA = {
    "type": "object",
    "required": ["label_status", "recommendation", "evidence_summary_ko", "rationale_ko", "follow_up_questions", "risks_ko"],
    "properties": {
        "label_status": {"type": "string", "enum": ["IN_LABEL", "DEVELOPMENT"]},
        "recommendation": {"type": "string", "enum": RECOMMENDATIONS},
        "evidence_summary_ko": {"type": "string"},
        "rationale_ko": {"type": "string"},
        "follow_up_questions": {"type": "array", "maxItems": 3, "items": {
            "type": "object", "required": ["question_ko", "why_ko"],
            "properties": {"question_ko": {"type": "string"}, "why_ko": {"type": "string"}}}},
        "risks_ko": {"type": "array", "items": {"type": "string"}},
    },
}


def sign_review(state: dict, hyp_id: str, by: str, note: str = "") -> dict:
    if hyp_id not in state["screens"]:
        raise SystemExit(f"{hyp_id}: 외부 근거가 아직 없습니다 — 먼저 screen 을 실행하세요.")
    screen = state["screens"][hyp_id]
    rev = {"hypothesis_id": hyp_id, "by": by, "at": store.now(), "note": note,
           "items_read": len(screen["items"]), "dropped_seen": len(screen["dropped"]),
           "screen_ran_at": screen["ran_at"]}
    state["reviews"][hyp_id] = rev
    store.hypothesis(state, hyp_id)["status"] = "REVIEWED"
    store.save(state)
    return rev


def deliberate(state: dict, hyp_id: str, force: bool = False) -> dict:
    if hyp_id not in state["reviews"]:
        raise SystemExit(f"{hyp_id}: 사람의 근거 검토 서명이 없습니다 — `review {hyp_id} --by 이름` 이 먼저입니다.")
    hyp, screen, rev = store.hypothesis(state, hyp_id), state["screens"][hyp_id], state["reviews"][hyp_id]
    packet = {
        "hypothesis": {k: hyp[k] for k in ("id", "drug", "segment", "signal_type", "statement_ko", "label_status")},
        "field_signal": hyp["field"],
        "external_tally": {"per_source": screen["tally"], "totals": screen["totals"], "flags": screen["flags"]},
        "numbers": screen["numbers"],
        "evidence": [{k: it[k] for k in ("source", "source_id", "stance", "quote", "note_ko")} for it in screen["items"]],
        "human_review": {"by": rev["by"], "at": rev["at"], "note": rev["note"]},
    }
    # Reasoning mode on: this is the one step that weighs conflicting evidence rather than selecting and quoting.
    out = call_structured("board", system=store.prompt("board"), user=json.dumps(packet, ensure_ascii=False),
                          schema_name="board_memo_v1", schema=BOARD_SCHEMA, max_tokens=8000, force=force,
                          thinking=True)
    # Rule enforced in code, not in the prompt: a DEVELOPMENT hypothesis is routed to expert review only.
    out["label_status"] = screen["label_status"]
    out["route"] = "전문조직 검토 (상업 액션 연결 금지)" if out["label_status"] == "DEVELOPMENT" else "사업 검토"
    out["deliberated_at"] = store.now()
    state["board"][hyp_id] = out
    hyp["status"] = "DELIBERATED"
    store.save(state)
    return out


def approve(state: dict, hyp_id: str, by: str, note: str = "") -> list[dict]:
    if hyp_id not in state["board"]:
        raise SystemExit(f"{hyp_id}: 심의 결과가 없습니다 — `board {hyp_id}` 가 먼저입니다.")
    memo = state["board"][hyp_id]
    memo["decision"] = {"by": by, "at": store.now(), "note": note, "accepted": memo["recommendation"]}
    created = []
    for q in memo["follow_up_questions"]:
        act = {"id": f"ACT-{len(state['actions']) + 1:03d}", "hypothesis_id": hyp_id,
               "question_ko": q["question_ko"], "why_ko": q["why_ko"], "status": "OPEN",
               "approved_by": by, "approved_at": memo["decision"]["at"]}
        state["actions"].append(act)
        created.append(act)
    store.hypothesis(state, hyp_id)["status"] = f"DECIDED:{memo['recommendation']}"
    store.save(state)
    # What the field app reads next: the checklist for the next interview. The loop closes here.
    store.FIELD_CHECKLIST.write_text(json.dumps(
        [a for a in state["actions"] if a["status"] == "OPEN"], ensure_ascii=False, indent=1))
    return created
