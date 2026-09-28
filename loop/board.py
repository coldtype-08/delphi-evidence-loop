"""Human gates and the AI Board.

Gate 1 — sign_review: a named person confirms they read the external evidence. Without it the board never runs.
Board — 간사 convenes, seven executives give opening positions, the 간사 facilitates a discussion round,
        everyone states a final position, code tallies the stances (confidence-weighted, lead ×1.5) and fixes
        the recommendation, the 간사 writes the minutes. Citations are validated against the evidence list;
        commercial actions on an off-label hypothesis are blocked in code.
Gate 2 — approve: a named person accepts the recommendation; only then do follow-up questions become field actions.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor

from . import store
from .llm import call_structured

# key → (label_ko, honorific, lens)
PERSONAS: dict[str, tuple[str, str, str]] = {
    "CMO": ("최고의학책임자", "CMO", "임상적 타당성과 근거 수준. 대규모 무작위 대조시험과 메타분석은 관찰 연구·리뷰보다 무겁다. 환자 이익과 위해의 균형."),
    "RA_HEAD": ("규제업무 총괄", "RA 총괄", "허가 범위와 라벨 경계. 허가 밖 사용에 관한 정보 전달의 규제 제약. 이 가설을 실현하려면 필요한 규제 경로와 선례."),
    "PV_HEAD": ("약물감시 총괄", "PV 총괄", "안전성 신호. 박스 경고, FAERS 상위 반응, 이 환자군에 특이한 위험(신기능·병용 치료). 유해사례 후보의 처리 경로."),
    "RND_HEAD": ("임상개발 총괄", "R&D 총괄", "임상 지형. 등록된 시험과 그 결과, 추가로 필요한 연구와 설계의 실현 가능성, 이미 답이 난 질문인지."),
    "CFO": ("최고재무책임자", "CFO", "자원과 우선순위. 근거를 더 확보하는 데 드는 비용 대비 얻는 것, 다른 가설과 비교한 순위. 매출·시장 규모 추정은 하지 않는다."),
    "CCO": ("최고상업책임자", "CCO", "현장 수요의 실체. 의료진과 환자가 실제로 무엇을 요청하는지, 현장이 알아야 할 것. 허가 범위 밖 가설에는 상업 액션을 제안하지 않는다."),
    "CEO": ("최고경영자", "CEO", "종합 판단. 위험을 먼저 보고, 조직이 감당할 수 있는 결정인지, 무엇이 확인돼야 마음이 바뀔지."),
}
ORDER = list(PERSONAS)
STANCES = ["SUPPORT", "HOLD", "OPPOSE"]
RECOMMENDATIONS = ["PROCEED_TO_EXPERT_REVIEW", "HOLD", "DROP"]
STANCE_TO_RECO = {"SUPPORT": "PROCEED_TO_EXPERT_REVIEW", "HOLD": "HOLD", "OPPOSE": "DROP"}
COMMERCIAL = re.compile(r"프로모션|판촉|영업|마케팅|메시지|타겟팅|처방 확대|매출|디테일링|캠페인|홍보", re.I)
WORKERS = 4

TURN_SCHEMA = {
    "type": "object", "required": ["stance", "confidence", "stance_changed", "utterance_ko", "cited", "question_ko", "action_ko"],
    "properties": {
        "stance": {"type": "string", "enum": STANCES}, "confidence": {"type": "integer", "minimum": 1, "maximum": 5},
        "stance_changed": {"type": "boolean"}, "utterance_ko": {"type": "string"},
        "cited": {"type": "array", "items": {"type": "string"}}, "question_ko": {"type": "string"}, "action_ko": {"type": "string"},
    },
}
CONVENE_SCHEMA = {
    "type": "object", "required": ["hypothesis_type", "lead", "speaking_order", "opening_ko"],
    "properties": {
        "hypothesis_type": {"type": "string", "enum": ["INDICATION_EXPANSION", "AGE_EXPANSION", "COMBINATION_THERAPY", "SAFETY_SIGNAL", "REPURPOSING", "OTHER"]},
        "lead": {"type": "string", "enum": ORDER}, "speaking_order": {"type": "array", "items": {"type": "string", "enum": ORDER}},
        "opening_ko": {"type": "string"},
    },
}
FACILITATE_SCHEMA = {
    "type": "object", "required": ["utterance_ko", "speakers", "question_ko", "phase_decision"],
    "properties": {
        "utterance_ko": {"type": "string"}, "speakers": {"type": "array", "items": {"type": "string", "enum": ORDER}, "minItems": 1, "maxItems": 3},
        "question_ko": {"type": "string"}, "phase_decision": {"type": "string", "enum": ["CONTINUE_DISCUSSION", "MOVE_TO_FINAL"]},
    },
}
CLOSE_SCHEMA = {
    "type": "object",
    "required": ["summary_ko", "evidence_summary_ko", "rationale_ko", "kill_criteria_ko", "risks_ko", "follow_up_questions", "closing_ko"],
    "properties": {
        "summary_ko": {"type": "string"}, "evidence_summary_ko": {"type": "string"}, "rationale_ko": {"type": "string"},
        "kill_criteria_ko": {"type": "array", "items": {"type": "string"}}, "risks_ko": {"type": "array", "items": {"type": "string"}},
        "follow_up_questions": {"type": "array", "maxItems": 3, "items": {
            "type": "object", "required": ["question_ko", "why_ko"],
            "properties": {"question_ko": {"type": "string"}, "why_ko": {"type": "string"}}}},
        "closing_ko": {"type": "string"},
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


# ── the meeting ────────────────────────────────────────────────────────────────

class _Meeting:
    def __init__(self, state: dict, hyp_id: str, force: bool):
        self.state, self.hyp_id, self.force = state, hyp_id, force
        self.hyp, self.screen, self.rev = store.hypothesis(state, hyp_id), state["screens"][hyp_id], state["reviews"][hyp_id]
        self.evidence_ids = {it["source_id"] for it in self.screen["items"]}
        self.turns: list[dict] = []
        self.blocked: list[dict] = []
        self.package = json.dumps({
            "hypothesis": {k: self.hyp[k] for k in ("id", "drug", "segment", "signal_type", "statement_ko", "label_status")},
            "field_signal": self.hyp["field"],
            "external_tally": {"per_source": self.screen["tally"], "totals": self.screen["totals"], "flags": self.screen["flags"]},
            "numbers": self.screen["numbers"],
            "evidence": [{k: it[k] for k in ("source", "source_id", "stance", "quote", "note_ko")} for it in self.screen["items"]],
            "human_review": {"by": self.rev["by"], "note": self.rev["note"]},
        }, ensure_ascii=False)

    # -- helpers
    def _transcript(self) -> str:
        return "\n".join(f"[{t['phase']}] {t['speaker_ko']}: {t['utterance_ko']}" for t in self.turns) or "(아직 발언 없음)"

    def _record(self, phase: str, speaker: str, out: dict, **extra) -> dict:
        turn = {"no": len(self.turns) + 1, "phase": phase, "speaker": speaker,
                "speaker_ko": PERSONAS[speaker][1] if speaker in PERSONAS else "간사",
                "utterance_ko": out.get("utterance_ko") or out.get("opening_ko") or out.get("closing_ko") or "", **extra}
        if "cited" in out:   # citations are only worth something if they point at evidence the reviewer saw
            valid = [c for c in out["cited"] if c in self.evidence_ids]
            turn["cited"] = valid
            turn["cited_dropped"] = [c for c in out["cited"] if c not in self.evidence_ids]
        self.turns.append(turn)
        return turn

    def _orchestrator(self, mode: str, extra: str, schema_name: str, schema: dict, thinking: bool | None = None) -> dict:
        user = f"[MODE] {mode}\n[가설 패키지]\n{self.package}\n[회의 기록]\n{self._transcript()}\n{extra}"
        return call_structured(f"board_{mode.lower()}", system=store.prompt("board_orchestrator"), user=user,
                               schema_name=schema_name, schema=schema, max_tokens=6000, force=self.force, thinking=thinking)

    def _persona(self, key: str, directive: str, phase: str) -> dict:
        label, honorific, lens = PERSONAS[key]
        system = store.prompt("board_persona").replace("{{role}}", f"{label}({honorific})").replace("{{lens}}", lens)
        user = f"[가설 패키지]\n{self.package}\n[회의 기록]\n{self._transcript()}\n[지시] {directive}"
        out = call_structured(f"board_{phase}_{key.lower()}", system=system, user=user,
                              schema_name="board_turn_v1", schema=TURN_SCHEMA, max_tokens=3000, force=self.force)
        # Rule enforced in code: no commercial action rides on an off-label hypothesis.
        if self.hyp["label_status"] == "DEVELOPMENT" and out.get("action_ko") and COMMERCIAL.search(out["action_ko"]):
            self.blocked.append({"speaker": key, "speaker_ko": honorific, "phase": phase, "action_ko": out["action_ko"],
                                 "reason_ko": "허가 범위 밖 가설 — 상업 액션은 연결하지 않는다"})
            out["action_ko"] = ""
        return out

    def _parallel(self, keys: list[str], directive_of, phase: str) -> list[tuple[str, dict]]:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futs = {k: pool.submit(self._persona, k, directive_of(k), phase) for k in keys}
            return [(k, futs[k].result()) for k in keys]

    # -- phases
    def run(self) -> dict:
        # 1 · CONVENE
        conv = self._orchestrator("CONVENE", "[지시] 가설 유형을 고르고 주무 임원과 발언 순서를 정한 뒤 개회 발언을 하십시오.",
                                  "board_convene_v1", CONVENE_SCHEMA)
        lead = conv["lead"] if conv["lead"] in PERSONAS else "CMO"
        order = [k for k in conv["speaking_order"] if k in PERSONAS] or ORDER
        order += [k for k in ORDER if k not in order]
        self._record("개회", "ORCHESTRATOR", conv, hypothesis_type=conv["hypothesis_type"], lead=lead)

        # 2 · OPENING — everyone, in parallel; stance_changed is False by code
        opening = self._parallel(order, lambda k: "당신의 모두발언 차례입니다. 당신의 렌즈로 본 초기 입장과 그 근거, 다른 참석자와 다르게 볼 수 있는 지점을 말하십시오. stance_changed는 false입니다.", "opening")
        first: dict[str, dict] = {}
        for k, out in opening:
            out["stance_changed"] = False
            first[k] = out
            self._record("모두발언", k, out, stance=out["stance"], confidence=out["confidence"], stance_changed=False,
                         question_ko=out["question_ko"], action_ko=out["action_ko"])

        # 3 · DISCUSSION — at most two rounds; the 간사 names who answers what
        for rnd in (1, 2):
            fac = self._orchestrator("FACILITATE", f"[지시] {rnd}라운드입니다. 서로 다르게 보는 참석자 2~3인을 지명해 한 가지 질문을 던지십시오.",
                                     "board_facilitate_v1", FACILITATE_SCHEMA)
            self._record(f"진행 · {rnd}라운드", "ORCHESTRATOR", fac, speakers=fac["speakers"], question_ko=fac["question_ko"],
                         phase_decision=fac["phase_decision"])
            answers = self._parallel(fac["speakers"], lambda k: f"간사가 당신을 지명해 물었습니다: “{fac['question_ko']}”. 답하고, 다른 참석자의 발언에 직함을 들어 동의하거나 반박하십시오. 입장이 바뀌었으면 stance_changed를 true로 두고 이유를 말하십시오.", f"discussion{rnd}")
            for k, out in answers:
                self._record(f"토론 · {rnd}라운드", k, out, stance=out["stance"], confidence=out["confidence"],
                             stance_changed=out["stance_changed"], question_ko=out["question_ko"], action_ko=out["action_ko"])
            if fac["phase_decision"] == "MOVE_TO_FINAL":
                break

        # 4 · FINAL — everyone
        finals = self._parallel(order, lambda k: "최종 입장을 말하십시오. 토론을 거쳐 입장이 바뀌었으면 stance_changed를 true로 두고 무엇 때문에 바뀌었는지 첫 문장에 말하십시오. 다음 면담에서 의료진에게 물을 질문 한 줄과 조직이 할 일 한 줄을 붙이십시오.", "final")
        final: dict[str, dict] = {}
        for k, out in finals:
            out["stance_changed"] = out["stance"] != first[k]["stance"]   # computed, not trusted
            final[k] = out
            self._record("최종 입장", k, out, stance=out["stance"], confidence=out["confidence"], stance_changed=out["stance_changed"],
                         question_ko=out["question_ko"], action_ko=out["action_ko"])

        # 5 · TALLY — code. Confidence-weighted, lead counts 1.5×.
        counts = {s: 0 for s in STANCES}
        weights = {s: 0.0 for s in STANCES}
        for k, out in final.items():
            counts[out["stance"]] += 1
            weights[out["stance"]] += out["confidence"] * (1.5 if k == lead else 1.0)
        top = max(weights.values())
        winners = [s for s in STANCES if weights[s] == top]
        stance = winners[0] if len(winners) == 1 else "HOLD"
        recommendation = STANCE_TO_RECO[stance]
        evolution = [{"speaker": k, "speaker_ko": PERSONAS[k][1], "opening": first[k]["stance"], "final": final[k]["stance"],
                      "changed": final[k]["stance_changed"], "confidence": final[k]["confidence"]} for k in order]

        # 6 · CLOSE — minutes. The recommendation is handed in; the 간사 does not decide.
        proposals = [{"speaker_ko": PERSONAS[k][1], "question_ko": final[k]["question_ko"], "action_ko": final[k]["action_ko"]}
                     for k in order if final[k]["question_ko"] or final[k]["action_ko"]]
        close = self._orchestrator("CLOSE", "[집계 · 코드] " + json.dumps({"counts": counts, "weights": weights, "lead": lead,
                                   "recommendation": recommendation, "label_status": self.hyp["label_status"],
                                   "proposals": proposals, "blocked_commercial_actions": self.blocked}, ensure_ascii=False)
                                   + "\n[지시] 회의록을 쓰십시오. 권고는 위 집계대로이며 바꾸지 않습니다.",
                                   "board_close_v1", CLOSE_SCHEMA, thinking=True)
        self._record("폐회", "ORCHESTRATOR", close)

        label_status = self.screen["label_status"]
        return {
            "label_status": label_status,
            "route": "전문조직 검토 (상업 액션 연결 금지)" if label_status == "DEVELOPMENT" else "사업 검토",
            "hypothesis_type": conv["hypothesis_type"], "lead": lead, "lead_ko": PERSONAS[lead][1], "attendees": order,
            "transcript": self.turns, "stance_evolution": evolution,
            "tally": {"counts": counts, "weights": weights, "winning_stance": stance},
            "recommendation": recommendation,
            "summary_ko": close["summary_ko"], "evidence_summary_ko": close["evidence_summary_ko"], "rationale_ko": close["rationale_ko"],
            "kill_criteria_ko": close["kill_criteria_ko"], "risks_ko": close["risks_ko"],
            "follow_up_questions": close["follow_up_questions"], "closing_ko": close["closing_ko"],
            "blocked_actions": self.blocked, "proposals": proposals,
            "deliberated_at": store.now(),
        }


def deliberate(state: dict, hyp_id: str, force: bool = False) -> dict:
    if hyp_id not in state["reviews"]:
        raise SystemExit(f"{hyp_id}: 사람의 근거 검토 서명이 없습니다 — `review {hyp_id} --by 이름` 이 먼저입니다.")
    memo = _Meeting(state, hyp_id, force).run()
    state["board"][hyp_id] = memo
    store.hypothesis(state, hyp_id)["status"] = "DELIBERATED"
    store.save(state)
    return memo


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
    # What the field app reads next: the checklist for the next interview.
    store.FIELD_CHECKLIST.write_text(json.dumps(
        [a for a in state["actions"] if a["status"] == "OPEN"], ensure_ascii=False, indent=1))
    return created
