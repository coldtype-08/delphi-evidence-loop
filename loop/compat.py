"""Compatibility API for the original DELPHi console (Next.js) — same paths and shapes the console expects,
served from this backend's state. The board room is mapped here; list/detail/home/journey shapes live in
compat_hyp / compat_home. Everything is read from state.json; nothing here calls a model directly.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse

from . import board, live, runner, store

router = APIRouter(prefix="/api")

PERSONA_KO = {"ORCHESTRATOR": "보드 간사", "CMO": "CMO · 최고의학책임자", "RA_HEAD": "RA 총괄 · 규제업무", "PV_HEAD": "PV 총괄 · 약물감시",
              "RND_HEAD": "R&D 총괄 · 연구개발", "CFO": "CFO · 최고재무책임자", "CCO": "CCO · 최고사업책임자", "CEO": "CEO"}
PHASE = {"개회": ("CONVENE", 0), "모두발언": ("OPENING", 1), "진행": ("FACILITATE", 2), "토론": ("DISCUSSION", 2),
         "최종 입장": ("FINAL", 3), "폐회": ("CLOSE", 5)}
RECO_TO_VERDICT = {"PROCEED_TO_EXPERT_REVIEW": "CONDITIONAL_GO", "HOLD": "HOLD", "DROP": "NO_GO"}
VERDICT_KO = {"GO": "추진", "CONDITIONAL_GO": "조건부 추진", "HOLD": "보류", "NO_GO": "기각"}
RULE_KO = "최종 입장을 확신도로 가중해 센다 (주무 임원 ×1.5). 가중치가 가장 큰 입장이 권고가 된다. 동률은 보류."


def ok(data: Any, status: int = 200) -> JSONResponse:
    return JSONResponse({"data": data}, status_code=status)


def err(status: int, code: str, message_ko: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message_ko": message_ko, "messageKo": message_ko}}, status_code=status)


def _notes() -> list[dict]:
    return json.loads(store.FIELD_NOTES.read_text())


def _with_runtime(state: dict) -> dict:
    """Runtime-only markers the card mapping reads (never saved — compat_hyp strips them before store.save)."""
    state["_screening"] = sorted(runner.SCREENING)
    return state


def _hyp_detail(state: dict, hid: str) -> dict:
    from . import compat_hyp
    return compat_hyp.hyp_detail(store.hypothesis(state, hid), _with_runtime(state), store.contract())


def _refused(e) -> JSONResponse:
    return err(getattr(e, "status", 409), getattr(e, "code", "REFUSED"), getattr(e, "message_ko", str(e)))


# ── board room ─────────────────────────────────────────────────────────────────

def _first_sentence(text: str) -> str:
    head, sep, _ = (text or "").partition(". ")
    return head + ("." if sep else "")


def _minute(turn: dict, memo: dict | None, hyp: dict) -> dict:
    group = turn["phase"].split(" · ")[0]
    turn_type, phase_no = PHASE.get(group, ("SYSTEM", None))
    persona = turn["speaker"]
    meta: dict[str, Any] = {}
    if turn_type == "CONVENE":
        attendees = (memo or {}).get("attendees") or [k for k in board.ORDER]
        meta = {"hypothesisType": turn.get("hypothesis_type"), "secondaryTypes": [], "speakingOrder": attendees,
                "urgency": "NORMAL", "leadExpert": turn.get("lead"), "convenedPersonas": attendees, "relatedHistoryNoteKo": None}
    elif turn_type == "FACILITATE":
        meta = {"directedQuestionKo": turn.get("question_ko"), "phaseDecision": turn.get("phase_decision"),
                "identifiedTensionsKo": [], "groundingCorrections": []}
    elif turn_type in ("OPENING", "DISCUSSION", "FINAL"):
        meta = {"actionProposal": ({"actionKo": turn["action_ko"], "target": "FIELD_CHECKLIST", "ownerRole": "MEDICAL_AFFAIRS", "timelineKo": None}
                                   if turn.get("action_ko") else None),
                "inquiryToOrchestrator": None}
        if turn.get("question_ko"):
            meta["fieldQuestionKo"] = turn["question_ko"]
    elif turn_type == "CLOSE" and memo:
        meta = {"minutes": {
            "hypothesisKo": hyp["statement_ko"], "aiRecommendation": RECO_TO_VERDICT.get(memo["recommendation"], "HOLD"),
            "summaryKo": memo["summary_ko"],
            "stanceEvolution": [{"persona": e["speaker"], "from": e["opening"], "to": e["final"],
                                 "reasonKo": "토론을 거쳐 입장을 바꿨습니다." if e["changed"] else "입장을 유지했습니다."} for e in memo["stance_evolution"]],
            "actionItems": [{"actionKo": q["question_ko"], "ownerRole": "MEDICAL_AFFAIRS", "deadlineKo": None, "sourceKo": "회의록 후속 질문", "target": "FIELD_CHECKLIST"}
                            for q in memo["follow_up_questions"]],
            "groundingEventsKo": [f"{b['speaker_ko']}의 제안을 코드가 차단했습니다 — {b['reason_ko']}" for b in memo.get("blocked_actions", [])],
            "killCriteriaKo": memo.get("kill_criteria_ko", []),
            "nextReviewTriggerKo": "다음 면담 체크리스트의 수집 결과가 모이면 재심의합니다.",
        }}
    return {
        "seq": turn["no"], "persona": persona, "personaLabelKo": PERSONA_KO.get(persona, turn.get("speaker_ko", persona)),
        "turnType": turn_type, "phaseNo": phase_no, "utteranceKo": turn.get("utterance_ko") or "",
        "stance": turn.get("stance"), "stanceChanged": turn.get("stance_changed"), "confidence": turn.get("confidence"),
        "keyPointKo": _first_sentence(turn.get("utterance_ko") or "") if persona != "ORCHESTRATOR" else None,
        "llmRunId": None, "meta": meta,
        "citedIds": turn.get("cited", []),
    }


def _decision_minute(memo: dict, hyp: dict, seq: int) -> dict:
    dec = memo["decision"]
    verdict = dec.get("verdict") or RECO_TO_VERDICT.get(dec["accepted"], "HOLD")
    lead_final = next((e["final"] for e in memo["stance_evolution"] if e["speaker"] == memo["lead"]), None)
    text = (f"판정은 {VERDICT_KO.get(verdict, verdict)}입니다. {memo['rationale_ko']}\n\n"
            f"{memo['evidence_summary_ko']}\n\n결정자: {dec['by']} ({dec['at'][:16].replace('T', ' ')}).")
    return {
        "seq": seq, "persona": "CEO", "personaLabelKo": "CEO", "turnType": "DECISION", "phaseNo": 4,
        "utteranceKo": text, "stance": None, "stanceChanged": None, "confidence": None, "keyPointKo": _first_sentence(text),
        "llmRunId": None,
        "meta": {"decision": verdict, "adoptedArguments": [], "rejectedArguments": [],
                 "leadAlignment": "ALIGNED" if lead_final and RECO_TO_VERDICT.get(board.STANCE_TO_RECO[lead_final]) == verdict else "OVERRIDDEN",
                 "leadOverrideReasonKo": None, "conditionsKo": [], "killCriteriaKo": memo.get("kill_criteria_ko", []),
                 "directives": [{"persona": "CEO", "directiveKo": q["question_ko"], "deadlineKo": None, "target": "FIELD_CHECKLIST", "ownerRole": "MEDICAL_AFFAIRS"}
                                for q in memo["follow_up_questions"]]},
    }


def snapshot(state: dict, hid: str, after: int = 0) -> dict:
    hyp = store.hypothesis(state, hid)
    memo = state["board"].get(hid)
    rec = live.read(hid)
    running = bool(rec and rec["status"] == "RUNNING")
    minutes: list[dict] = []
    if running:
        minutes = [_minute(t, None, hyp) for t in rec["turns"]]
    elif memo and "transcript" in memo:
        turns = [t for t in memo["transcript"] if not t["phase"].startswith("폐회")]
        close = [t for t in memo["transcript"] if t["phase"].startswith("폐회")]
        minutes = [_minute(t, memo, hyp) for t in turns]
        if memo.get("decision"):
            minutes.append(_decision_minute(memo, hyp, len(minutes) + 1))
            for t in close:
                m = _minute(t, memo, hyp)
                m["seq"] = len(minutes) + 1
                minutes.append(m)
    events = [{"seq": m["seq"], "ts": None, "kind": "TURN", "phaseNo": m["phaseNo"], "messageKo": None, "minute": m} for m in minutes]
    if rec and rec["status"] == "ERROR":
        events.append({"seq": len(minutes) + 1, "ts": rec["updated_at"], "kind": "RUN", "phaseNo": None, "messageKo": f"심의 중단 — {rec.get('error')}", "minute": None})
    last_seq = max([e["seq"] for e in events], default=0)
    decided = bool(memo and memo.get("decision"))
    tally = None
    if memo and "tally" in memo:
        lead = memo["lead"]
        lead_stance = next((e["final"] for e in memo["stance_evolution"] if e["speaker"] == lead), None)
        tally = {"counts": memo["tally"]["counts"], "weights": memo["tally"]["weights"], "leadExpert": lead, "leadStance": lead_stance,
                 "computedBy": "SQL", "ruleKo": RULE_KO}
    convene = next((t for t in (rec["turns"] if running else (memo or {}).get("transcript", [])) if t["phase"] == "개회"), None)
    attendees = (memo or {}).get("attendees") or list(board.ORDER)
    return {
        "running": running, "hypothesisId": hid,
        "runId": (rec or {}).get("updated_at") if running else ((memo or {}).get("deliberated_at")),
        "startedAt": convene.get("at") if convene else None, "finishedAt": None if running else (memo or {}).get("deliberated_at"),
        "phaseNo": (minutes[-1]["phaseNo"] if minutes else 0) if running else (5 if decided else (3 if memo else None)),
        "urgency": "NORMAL" if (memo or running) else None,
        "hypothesisType": (memo or {}).get("hypothesis_type") or (convene or {}).get("hypothesis_type"),
        "leadExpert": (memo or {}).get("lead") or (convene or {}).get("lead"),
        "convenedPersonas": attendees, "speakingOrder": attendees,
        "awaitingVerdict": bool(memo and not decided and not running),
        "recommendedDecision": RECO_TO_VERDICT.get((memo or {}).get("recommendation", ""), None) if memo else None,
        "stanceTally": tally,
        "answerCount": 0, "totals": {"llmCalls": len(minutes), "cacheHits": 0},
        "events": [e for e in events if e["seq"] > after], "lastSeq": last_seq,
        "meetingNo": f"{hid}-01" if (memo or running) else None,
        "convenedAtKst": (convene.get("at") or "").replace("T", " ") or None if convene else None,
        "closedAtKst": memo["decision"]["at"].replace("T", " ") if decided else None,
        "roundNo": 1 if (memo or running) else None, "quorumOk": True if (memo or running) else None,
        "notConvened": [], "leadRationaleKo": None,
    }


@router.get("/hypotheses/{hid}/board")
def board_snapshot(hid: str, after: int = Query(0)):
    state = store.load()
    try:
        return ok(snapshot(state, hid, after))
    except SystemExit:
        return err(404, "NOT_FOUND", "가설이 없습니다.")


@router.post("/hypotheses/{hid}/board")
def board_start(hid: str, refresh: bool = Query(False)):
    state = store.load()
    try:
        h = store.hypothesis(state, hid)
    except SystemExit:
        return err(404, "NOT_FOUND", "가설이 없습니다.")
    if hid not in state["reviews"]:
        return err(409, "NOT_IN_REVIEW", "외부 근거 검토 서명이 없습니다. 근거를 읽고 서명한 뒤 심의를 시작할 수 있습니다.")
    busy = live.running()
    if busy:
        return err(409, "BOARD_RUNNING", f"{busy[0]} 심의가 진행 중입니다.")
    if h["status"].startswith("DECIDED"):
        return err(409, "ALREADY_DECIDED", "이미 결정된 가설입니다. 재심의는 결정 취소 후 가능합니다.")
    live.clear(hid)
    runner.start_board(hid)
    return ok({"started": True, "runId": store.now(), "hypothesisId": hid})


@router.post("/hypotheses/{hid}/board/verdict")
def board_verdict(hid: str, body: dict = Body(...)):
    state = store.load()
    decision, by = body.get("decision"), (body.get("decidedBy") or "CEO").strip()
    if decision not in VERDICT_KO:
        return err(422, "INVALID_DECISION", "판정은 GO · CONDITIONAL_GO · HOLD · NO_GO 중 하나입니다.")
    try:
        board.approve(state, hid, by, note=f"의장 판정 {decision}", verdict=decision)
    except SystemExit as e:
        return err(409, "NOT_DELIBERATED", str(e))
    return ok(snapshot(store.load(), hid, 0))


@router.post("/hypotheses/{hid}/decision")
def hypothesis_decision(hid: str, body: dict = Body(...)):
    state = store.load()
    decision, by = body.get("decision"), (body.get("decidedBy") or "결정자").strip()
    items = [a.get("directiveKo") for a in body.get("actionItems") or [] if a.get("directiveKo")]
    memo = state["board"].get(hid)
    if not memo:
        return err(409, "NOT_DELIBERATED", "심의 결과가 없습니다.")
    try:
        if not memo.get("decision"):
            board.approve(state, hid, by, note=body.get("rationaleKo") or "", verdict=decision, directives=items or None)
        elif items:
            existing = {a["question_ko"] for a in state["actions"] if a["hypothesis_id"] == hid}
            for d in items:
                if d not in existing:
                    state["actions"].append({"id": f"ACT-{len(state['actions']) + 1:03d}", "hypothesis_id": hid, "question_ko": d,
                                             "why_ko": "사람이 채택한 후속 질문", "status": "OPEN", "approved_by": by, "approved_at": store.now()})
            store.save(state)
    except SystemExit as e:
        return err(409, "NOT_DELIBERATED", str(e))
    return ok(_hyp_detail(store.load(), hid))


@router.get("/actions")
def actions(hypothesisId: str | None = None, status: str | None = None):
    rows = []
    for a in store.load()["actions"]:
        if hypothesisId and a["hypothesis_id"] != hypothesisId:
            continue
        rows.append({"actionItemId": a["id"], "hypothesisId": a["hypothesis_id"], "decisionId": 1, "directiveKo": a["question_ko"],
                     "target": "FIELD_CHECKLIST", "ownerRole": "MEDICAL_AFFAIRS", "status": "ACTIVE", "source": "HUMAN",
                     "targetSpecialty": None, "targetRegions": None, "createdAt": a["approved_at"], "deliveredAt": a["approved_at"],
                     "collectedClaimCount": 0, "computedBy": "SQL"})
    return ok(rows)


# ── hypotheses list / detail / actions (shapes in compat_hyp) ─────────────────

@router.get("/hypotheses/pipeline")
def hypotheses_pipeline():
    from . import compat_home
    return ok(compat_home.hypotheses_pipeline(store.load(), store.contract(), _notes()))


@router.post("/hypotheses/generate")
def hypotheses_generate():
    from . import compat_hyp
    return ok(compat_hyp.generate(store.load(), store.contract()))


@router.post("/hypotheses/transition")
def hypotheses_transition(body: dict = Body(...)):
    from . import compat_hyp
    try:
        return ok(compat_hyp.transition(_with_runtime(store.load()), body.get("ids") or [], body.get("to")))
    except compat_hyp.Refused as e:
        return _refused(e)


@router.get("/hypotheses")
def hypotheses_list(stage: str | None = None):
    from . import compat_hyp
    state, contract = _with_runtime(store.load()), store.contract()
    return ok([compat_hyp.hyp_brief(h, state, contract) for h in state["hypotheses"]])


@router.get("/hypotheses/{hid}")
def hypothesis_detail(hid: str):
    try:
        return ok(_hyp_detail(store.load(), hid))
    except SystemExit:
        return err(404, "NOT_FOUND", "가설이 없습니다.")


@router.post("/hypotheses/{hid}/screen")
def hypothesis_screen(hid: str):
    state = store.load()
    try:
        store.hypothesis(state, hid)
    except SystemExit:
        return err(404, "NOT_FOUND", "가설이 없습니다.")
    if hid in runner.SCREENING:
        return err(409, "RUN_IN_PROGRESS", "이 가설의 근거 조사가 진행 중입니다.")
    runner.start_screen(hid)
    return ok({"started": True, "hypothesisId": hid})


@router.post("/hypotheses/{hid}/evidence-review")
def hypothesis_evidence_review(hid: str, body: dict = Body(...)):
    from . import compat_hyp
    try:
        return ok(compat_hyp.evidence_review(_with_runtime(store.load()), hid, bool(body.get("reviewed", True)), body.get("reviewedBy")))
    except compat_hyp.Refused as e:
        return _refused(e)
    except SystemExit as e:
        return err(409, "SCREEN_NOT_DONE", str(e))


# ── home / journey / analytics (shapes in compat_home) ───────────────────────

def _home(fn_name: str):
    from . import compat_home
    return ok(getattr(compat_home, fn_name)(store.load(), store.contract(), _notes()))


@router.get("/aggregates/kpis")
def aggregates_kpis():
    return _home("kpis")


@router.get("/aggregates/signals")
def aggregates_signals():
    return _home("signals_rows")


@router.get("/aggregates/pipeline")
def aggregates_pipeline():
    return _home("pipeline_aggregate")


@router.get("/analytics/collection")
def analytics_collection():
    return _home("collection")


@router.get("/analytics/mentions")
def analytics_mentions():
    return _home("mentions")


@router.get("/analytics/segments")
def analytics_segments():
    return _home("segments_rows")


@router.get("/analytics/unmapped")
def analytics_unmapped(limit: int = 1):
    return _home("unmapped")


@router.get("/contract/status")
def contract_status():
    return _home("contract_status")


@router.get("/contract/active")
def contract_active():
    c = store.contract()
    return ok({"version": c["version"], "status": "ACTIVE", "segments": c["segments"], "signalTypes": c["signal_types"], "threshold": c["threshold"]})


@router.get("/contract/versions")
def contract_versions():
    c, st = store.contract(), store.load()
    claims = [x for x in st["claims"] if x["verified"]]
    return ok([{"version": c["version"], "status": "ACTIVE", "approvedBy": "Data Steward", "approvedAt": None,
                "fieldCount": len(c["segments"]) + len(c["signal_types"]), "enumCount": len(c["segments"]) + len(c["signal_types"]),
                "claimCount": len(claims), "approvedClaimCount": len(claims)}])


@router.get("/system/product")
def system_product():
    c = store.contract()
    return ok({"productName": c["drug_ko"], "productTerms": [c["drug"]], "indicationTerms": [], "labelKo": c.get("in_label_summary_ko", "")})


@router.get("/safety/candidates")
def safety_candidates(request: Request):
    from . import compat_hyp
    if request.headers.get("x-delphi-role", "").upper() != "SAFETY":   # rule #6 — the safety path is its own role
        return err(403, "PURPOSE_SCOPE_VIOLATION", "안전성 후보는 SAFETY 롤만 볼 수 있습니다.")
    return ok(compat_hyp.safety_candidates(store.load(), _notes()))


@router.get("/llm-runs")
def llm_runs(limit: int = 60):
    from . import compat_hyp
    return ok(compat_hyp.llm_runs(limit))


@router.get("/system/cost-summary")
def cost_summary():
    from . import compat_hyp
    return ok(compat_hyp.cost_summary())


@router.get("/health")
def health():
    st = store.load()
    return ok({"ok": True, "hypotheses": len(st["hypotheses"]), "boardRunning": live.running(), "screening": sorted(runner.SCREENING)})
