"""Console compatibility — the loop's state.json shaped into the objects the copied Next.js console reads.

The console (console/app/**) was written against the DELPHi FastAPI backend (docs/04 §4). This module maps one
world onto the other with pure functions; the FastAPI layer wraps each result in {"data": ...} — the console's
api() unwraps that (console/lib/api.ts:70). Nothing here calls a model or the network. The only writes are in
`evidence_review` (a person's signature), and they go through loop.board.sign_review / loop.store.save.

Vocabulary the console dereferences, with where it says so:
  status        hypotheses/page.tsx:57-58 STATUS_ORDER — DRAFT · SCREEN_QUEUED · SCREENING · NOT_BOARD_READY ·
                BOARD_READY · IN_REVIEW · APPROVED · HOLD · REJECTED · RETIRED. ScreenBench.tsx:41-44 sorts on it,
                AgendaLedger.tsx:85-92 splits IN_REVIEW by `hasMinutes`.
  agent keys    screenShared.ts:10-17 AGENT_KO — FIELD_SIGNAL · EVIDENCE_OPENFDA · EVIDENCE_CTGOV · EVIDENCE_PUBMED ·
                EVIDENCE_CMS · SAFETY. ScreenStage.tsx:69-74 REVIEWERS draws the four EVIDENCE_* columns,
                ScreenStage.tsx:238 finds the SAFETY line, ScreenStage.tsx:251-254 reads screenRun.agents SAFETY/VERIFY.
  findingType   ScreenStage.tsx:33 — "SUPPORT" | "COUNTER" | "GAP" | "SAFETY_SIGNAL". There is no NEUTRAL: every
                non-GAP finding that is not SUPPORT renders as 반대 (ScreenStage.tsx:468-472). So a NEUTRAL stance is
                never emitted as a judgment — the neutral items of a reviewer become one GAP line (shown only when
                that reviewer has no directional finding, ScreenStage.tsx:517-527) and are kept verbatim under
                `neutralFindings`, which the console ignores.
  screenRun     ScreenStage.tsx:43-49 — {state: RUNNING|DONE|FAILED, errorKo?, agents?: {key: {state, startedAt?,
                finishedAt?}}, retries?, attempts?}. The "stalled" test is ScreenStage.tsx:116: status SCREENING with
                no RUNNING record → the page stops polling.
  excluded      ScreenStage.tsx:40 {agent, reason, statementKo}. `reason` is looked up in REVIEW_REASON_KO and
                rendered raw when unknown (ScreenStage.tsx:508), so a Korean sentence is a valid reason.
  list-only     screenSummary · hasMinutes · boardSummary · canSendToBoard (page.tsx:26-42, AgendaLedger.tsx:63-72);
                page.tsx:381 merges the list item over the detail, so both carry them here.
  board room    board/[hypId]/BoardRoom.tsx:109-128 — decisions[{decision, decidedBy, rationaleKo, decidedAt}],
                approvedActions[{actionItemId, directiveKo, target, ownerRole, status, targetSpecialty,
                collectedClaimCount, deliveredAt}].
  audit         audit/page.tsx:20-28 — CostSummary · Run{id, createdAt, purpose, model, promptVersion, latencyMs,
                cached, callMode, costUsd?, cacheReadTokens?}; page.tsx:170 derives the chip from callMode/cached.
  safety        safety/page.tsx:4 — {id, interactionId, verbatimQuote, routedAt, status}; ScreenStage.tsx:41 reads
                {id, verbatimQuote, status, routedAt} from the same list.

Runtime markers (read here, never written or persisted here):
  state["_screening"]      list or dict of hypothesis ids whose Screen is running right now. A dict value may carry
                           {"startedAt": iso, "agents": {agent: {"state", "startedAt", "finishedAt"}}} for finer lanes.
  state["_screen_errors"]  {id: errorKo} for a Screen that failed — surfaces as screenRun.state FAILED.
Whatever module runs screen.run in the background sets them; `evidence_review` strips every "_"-prefixed key
before saving so they never land in state.json.

Numbers are counted here in code, never by a model. `computedBy: "SQL"` is the console's label for exactly that.
Timestamps in state.json are naive local time — `_iso` appends the host's UTC offset so the console's Date parsing
and KST formatting (AgendaLedger.tsx:104-111, audit/page.tsx:35) land on the right minute.
"""
from __future__ import annotations

import json
import time
from collections import Counter, defaultdict

from . import store

try:
    from .sources.cms import WEB as CMS_WEB
except Exception:  # noqa: BLE001 — the console must not go down over an optional import
    CMS_WEB = ("https://data.cms.gov/summary-statistics-on-use-and-payments/"
               "medicare-medicaid-spending-by-drug/medicare-part-d-spending-by-drug")

# ── vocabulary ───────────────────────────────────────────────────────────────
AGENT_OF_SOURCE = {"pubmed": "EVIDENCE_PUBMED", "ctgov": "EVIDENCE_CTGOV", "label": "EVIDENCE_OPENFDA"}
AS_OF_OF_SOURCE = {"pubmed": "pubmed", "ctgov": "ctgov", "label": "openfda"}
AGENT_CMS, AGENT_SAFETY, AGENT_VERIFY, AGENT_FIELD = "EVIDENCE_CMS", "SAFETY", "VERIFY", "FIELD_SIGNAL"
REVIEWER_AGENTS = ["EVIDENCE_OPENFDA", "EVIDENCE_CTGOV", "EVIDENCE_PUBMED", "EVIDENCE_CMS"]
FINDING_OF_STANCE = {"SUPPORTS": "SUPPORT", "CONTRADICTS": "COUNTER"}   # NEUTRAL → GAP summary, see module doc
STATUS_OF_RECO = {"PROCEED_TO_EXPERT_REVIEW": "APPROVED", "HOLD": "HOLD", "DROP": "REJECTED"}
NO_EVIDENCE = "NO_EXTERNAL_EVIDENCE"
SCREEN_STAGE = ("DRAFT", "SCREEN_QUEUED", "SCREENING", "BOARD_READY", "NOT_BOARD_READY")
SOURCE_KO = {"pubmed": "PubMed", "ctgov": "ClinicalTrials.gov", "label": "FDA 라벨"}
CAVEAT_OF_SOURCE = {
    "pubmed": "인용은 원문 위치가 확인된 문장입니다. 연구 설계·표본은 원문에서 확인해야 합니다.",
    "ctgov": "인용은 등록 정보에서 위치가 확인된 문장입니다. 모집 상태·결과는 원문에서 확인해야 합니다.",
    "label": "인용은 허가 라벨에서 위치가 확인된 문장입니다. 최신 개정 여부는 원문 라벨에서 확인해야 합니다.",
}
CAVEAT_NEUTRAL = "지지·반대 어느 쪽도 아닌 근거입니다 — 종합 집계에 세지 않습니다."
CAVEAT_CMS = "약물 전체의 처방 규모입니다 — 이 가설의 환자군을 특정하지 않으며 지지·반대에 세지 않습니다."
CAVEAT_SAFETY = "내용은 이 화면에 싣지 않습니다 — 안전 화면에서만 확인합니다."
# screen.py drop reasons → the console's REVIEW_REASON_KO codes where one fits, plain Korean where none does
DROP_REASON = {"unknown source_id": "UNTRUSTED_SOURCE",
               "quote not in record": "원문에서 인용 위치를 찾지 못해 걸렀습니다"}
ACTION_TARGET, ACTION_OWNER = "FIELD_CHECKLIST", "MEDICAL_AFFAIRS"


class Refused(Exception):
    """A gate said no. The web layer turns it into {"error": {"code", "message_ko"}} with HTTP `status`."""

    def __init__(self, code: str, message_ko: str, status: int = 409):
        super().__init__(message_ko)
        self.code, self.message_ko, self.status = code, message_ko, status


# ── small helpers ────────────────────────────────────────────────────────────

def _iso(ts: str | None) -> str | None:
    """Naive local timestamp → the same instant with the host's UTC offset. Already-zoned strings pass through."""
    if not ts:
        return None
    if len(ts) > 19 and (ts[19] in "+-" or ts.endswith("Z")):
        return ts
    off = time.strftime("%z")   # "+0900"
    return f"{ts}{off[:3]}:{off[3:]}" if len(off) == 5 else ts


def _date(ts: str | None) -> str | None:
    return ts[:10] if ts else None


def _label_date(yyyymmdd: str | None) -> str | None:
    s = yyyymmdd or ""
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 and s.isdigit() else (s or None)


def _screen(state: dict, hid: str) -> dict | None:
    return (state.get("screens") or {}).get(hid)


def _review(state: dict, hid: str) -> dict | None:
    return (state.get("reviews") or {}).get(hid)


def _memo(state: dict, hid: str) -> dict | None:
    return (state.get("board") or {}).get(hid)


def _is_screening(state: dict, hid: str) -> bool:
    marker = state.get("_screening") or ()
    return hid in marker


def _screening_info(state: dict, hid: str) -> dict:
    marker = state.get("_screening")
    if isinstance(marker, dict) and isinstance(marker.get(hid), dict):
        return marker[hid]
    return {}


def _screen_error(state: dict, hid: str) -> str | None:
    errs = state.get("_screen_errors")
    return errs.get(hid) if isinstance(errs, dict) else None


def _pop_runtime(state: dict) -> dict:
    """Take the runtime markers out before a save; the caller puts them back."""
    return {k: state.pop(k) for k in list(state) if k.startswith("_")}


def _claims_of(state: dict, h: dict) -> list[dict]:
    idx = {c["id"]: c for c in state.get("claims", [])}
    return [idx[i] for i in (h.get("field") or {}).get("claim_ids", []) if i in idx]


def _threshold(contract: dict) -> tuple[int, int, str]:
    th = contract.get("threshold") or {}
    min_m, min_h = int(th.get("min_mentions", 3)), int(th.get("min_hcps", 3))
    return min_m, min_h, f"반복 {min_m}회 이상 · 독립 의료진 {min_h}인 이상 — 원문 위치가 확인된 인용만 셉니다"


def _actions_of(state: dict, hid: str) -> list[dict]:
    return [a for a in state.get("actions", []) if a.get("hypothesis_id") == hid]


def _collected(state: dict, action_id: str) -> int:
    """Claims collected against this action item. Field claims do not carry a checklist reference yet, so this is
    counted — and is 0 — rather than assumed."""
    return sum(1 for c in state.get("claims", []) if c.get("checklist_ref") == action_id)


# ── status ───────────────────────────────────────────────────────────────────

def console_status(h: dict, state: dict) -> str:
    """Loop status → console status. REVIEWED and DELIBERATED are both IN_REVIEW; `hasMinutes` tells them apart
    (signed = 상정, minutes = awaiting the human decision)."""
    hid = h["id"]
    if _is_screening(state, hid):
        return "SCREENING"
    s = h.get("status") or "DRAFT"
    if s == "DRAFT":
        return "DRAFT"
    if s == "SCREENED":
        screen = _screen(state, hid)
        if not screen:
            return "SCREEN_QUEUED"
        return "NOT_BOARD_READY" if NO_EVIDENCE in (screen.get("flags") or []) else "BOARD_READY"
    if s in ("REVIEWED", "DELIBERATED"):
        return "IN_REVIEW"
    if s.startswith("DECIDED:"):
        return STATUS_OF_RECO.get(s.split(":", 1)[1], "HOLD")
    return s


def _has_minutes(state: dict, hid: str) -> bool:
    memo = _memo(state, hid)
    return bool(memo and memo.get("transcript"))


def _decision(state: dict, hid: str) -> dict | None:
    memo = _memo(state, hid)
    return (memo or {}).get("decision") or None


# ── card pieces ──────────────────────────────────────────────────────────────

def _aggregate(h: dict, state: dict, contract: dict) -> dict:
    field = h.get("field") or {}
    mentions, hcps = int(field.get("mentions", 0)), int(field.get("hcps", 0))
    claims = _claims_of(state, h)
    min_m, min_h, note = _threshold(contract)
    signal_id = f"{h['segment']}::{h['signal_type']}"
    return {
        "claimCount": mentions, "distinctHcp": hcps, "distinctRegions": 0,
        "distinctDocs": len({c["doc_id"] for c in claims}),
        "signalType": h["signal_type"], "provisional": False,
        "belowThreshold": mentions < min_m or hcps < min_h,
        "thresholds": {"repeat": min_m, "distinctHcp": min_h, "noteKo": note},
        "signals": [{"signalId": signal_id, "segment": h["segment"], "signalType": h["signal_type"],
                     "claimCount": mentions, "distinctHcp": hcps, "distinctRegions": 0,
                     "distinctDocs": len({c["doc_id"] for c in claims})}],
        "writtenBy": "hypothesis_agent", "computedBy": "SQL",
    }


def _driver_summary(h: dict, state: dict) -> str:
    field = h.get("field") or {}
    line = f"{field.get('mentions', 0)}회 · 의료진 {field.get('hcps', 0)}인 — {h['segment']} × {h['signal_type']}"
    acts = _actions_of(state, h["id"])
    if acts:   # page.tsx:229-231 splits on " / " and lifts the "확인할 질문:" part into its own box
        line += f" / 확인할 질문: {acts[0]['question_ko']}"
    return line


def _screen_summary(screen: dict) -> dict:
    totals = screen.get("totals") or {}
    return {"judgments": len(screen.get("items") or []),
            "externalSupport": int(totals.get("SUPPORTS", 0)),
            "support": int(totals.get("SUPPORTS", 0)), "counter": int(totals.get("CONTRADICTS", 0)),
            "neutral": int(totals.get("NEUTRAL", 0)), "excluded": len(screen.get("dropped") or []),
            "computedBy": "SQL"}


def _finding(it: dict, as_of: dict, finding_type: str | None = None, caveat: str | None = None) -> dict:
    """One verified screen item as a console finding. `finding_type` overrides the stance mapping — used for the
    NEUTRAL items kept under `neutralFindings`, which the console never renders as judgments."""
    src = it["source"]
    return {
        "agent": AGENT_OF_SOURCE[src], "findingType": finding_type or FINDING_OF_STANCE[it["stance"]],
        "statementKo": it.get("note_ko") or it.get("quote") or "", "quote": it.get("quote"),
        "sourceUrl": it.get("url"), "sourceLocator": it.get("source_id"),
        "sourceAsOf": as_of.get(AS_OF_OF_SOURCE[src]), "caveatKo": caveat or CAVEAT_OF_SOURCE[src],
        "stance": it["stance"], "charStart": it.get("char_start"), "charEnd": it.get("char_end"),
        "verified": bool(it.get("verified")), "computedBy": "SQL",
    }


def _neutral_gap(src: str, items: list[dict], as_of: dict) -> dict:
    first = items[0]
    head = f"{SOURCE_KO[src]} 중립 {len(items)}건 — 지지·반대 어느 쪽도 아닌 근거만 확인됐습니다"
    return {
        "agent": AGENT_OF_SOURCE[src], "findingType": "GAP",
        "statementKo": f"{head}. 예: {first.get('note_ko') or first.get('quote') or ''}",
        "quote": None, "sourceUrl": first.get("url"), "sourceLocator": first.get("source_id"),
        "sourceAsOf": as_of.get(AS_OF_OF_SOURCE[src]), "caveatKo": CAVEAT_NEUTRAL, "computedBy": "SQL",
    }


def _cms_finding(numbers: dict) -> dict | None:
    per_year = numbers.get("partd_per_year") or {}
    if not per_year:
        return None
    year = max(per_year)
    y = per_year[year] or {}
    claims, benef, spend = int(y.get("claims") or 0), int(y.get("beneficiaries") or 0), float(y.get("spending_usd") or 0)
    text = (f"Medicare Part D {year} — 청구 {claims:,}건 · 수급자 {benef:,}명 · 지출 ${spend:,.0f}"
            f" ({int(numbers.get('partd_brands') or 0)}개 제품, {len(per_year)}개 연도 스냅샷)")
    return {"agent": AGENT_CMS, "findingType": "GAP", "statementKo": text, "quote": None,
            "sourceUrl": CMS_WEB, "sourceLocator": f"cms:part-d:{year}",
            "sourceAsOf": (numbers.get("as_of") or {}).get("cms"), "caveatKo": CAVEAT_CMS,
            "perYear": per_year, "computedBy": "SQL"}


def _safety_finding(state: dict, h: dict, as_of: dict) -> dict | None:
    """Existence only. Rule #6: the adverse-event content never rides on the analytics card — the finding says
    how many candidates came out of the same interviews and points at the safety screen (SAFETY role)."""
    docs = {c["doc_id"] for c in _claims_of(state, h)}
    cands = [s for s in state.get("safety_queue", []) if s.get("doc_id") in docs]
    if not cands:
        return None
    ids = [s["id"] for s in cands]
    return {
        "agent": AGENT_SAFETY, "findingType": "SAFETY_SIGNAL",
        "statementKo": f"같은 면담에서 이상사례 의심 보고 {len(cands)}건이 분리 경로로 갔습니다 — {', '.join(ids)}",
        "quote": None, "sourceUrl": None, "sourceLocator": f"/safety?focus={','.join(ids)}",
        "sourceAsOf": _date(max(s.get("extracted_at") or "" for s in cands)) or as_of.get("openfda"),
        "caveatKo": CAVEAT_SAFETY, "candidateIds": ids, "computedBy": "SQL",
    }


def _excluded(screen: dict) -> list[dict]:
    out = []
    for d in screen.get("dropped") or []:
        raw = d.get("drop_reason") or ""
        out.append({"agent": AGENT_OF_SOURCE.get(d.get("source")), "reason": DROP_REASON.get(raw, raw),
                    "reasonCode": raw, "statementKo": d.get("note_ko") or d.get("quote") or "",
                    "quote": d.get("quote"), "sourceLocator": d.get("source_id"), "sourceUrl": d.get("url")})
    return out


def _screen_block(state: dict, h: dict, screen: dict | None, screening: bool) -> dict:
    """screenFindings · screenReview · screenRun · neutralFindings for one hypothesis."""
    hid = h["id"]
    if screening:
        info = _screening_info(state, hid)
        started = _iso(info.get("startedAt")) or _iso(store.now())
        agents = info.get("agents") or {a: {"state": "RUNNING", "startedAt": started} for a in REVIEWER_AGENTS}
        return {"screenFindings": [], "neutralFindings": [], "screenReview": None,
                "screenRun": {"state": "RUNNING", "startedAt": started, "agents": agents, "retries": 0, "attempts": 1}}
    err = _screen_error(state, hid)
    if not screen:
        run = {"state": "FAILED", "errorKo": err, "agents": {}} if err else None
        return {"screenFindings": [], "neutralFindings": [], "screenReview": None, "screenRun": run}

    as_of = (screen.get("numbers") or {}).get("as_of") or {}
    findings, neutral_by_src, neutral = [], defaultdict(list), []
    for it in screen.get("items") or []:
        if it["stance"] in FINDING_OF_STANCE:
            findings.append(_finding(it, as_of))
        else:
            neutral_by_src[it["source"]].append(it)
            neutral.append(_finding(it, as_of, finding_type="NEUTRAL", caveat=CAVEAT_NEUTRAL))
    gaps = [_neutral_gap(src, items, as_of) for src, items in neutral_by_src.items()]
    cms = _cms_finding(screen.get("numbers") or {})
    if cms:
        gaps.append(cms)
    saf = _safety_finding(state, h, as_of)
    all_findings = findings + gaps + ([saf] if saf else [])

    excluded = _excluded(screen)
    ran = _iso(screen.get("ran_at"))
    agents = {a: {"state": "DONE", "startedAt": ran, "finishedAt": ran}
              for a in [AGENT_FIELD, *REVIEWER_AGENTS, AGENT_SAFETY, AGENT_VERIFY]}
    run = ({"state": "FAILED", "errorKo": err, "startedAt": ran, "agents": agents} if err
           else {"state": "DONE", "startedAt": ran, "finishedAt": ran, "agents": agents, "retries": 0, "attempts": 1})
    return {
        "screenFindings": all_findings, "neutralFindings": neutral,
        "screenReview": {"passed": len(screen.get("items") or []), "judgmentCount": len(findings),
                         "gapCount": len(gaps), "excluded": excluded, "scope": "latest-run", "computedBy": "SQL"},
        "screenRun": run,
    }


def _statistical_patterns(h: dict, state: dict, screen: dict | None) -> list[dict]:
    field = h.get("field") or {}
    out = [{"statementKo": f"의료진 {field.get('hcps', 0)}인이 {field.get('mentions', 0)}회 언급", "computedBy": "SQL"}]
    if not screen:
        return out
    n, t = screen.get("numbers") or {}, screen.get("tally") or {}

    def tri(src: str) -> str:
        x = t.get(src) or {}
        return f"지지 {x.get('SUPPORTS', 0)} · 반대 {x.get('CONTRADICTS', 0)} · 중립 {x.get('NEUTRAL', 0)}"

    label = n.get("label") or {}
    top = ", ".join(f"{r.get('term')} {int(r.get('count') or 0):,}" for r in (n.get("faers_top") or [])[:3])
    lines = [
        f"PubMed 검색 결과 {int(n.get('pubmed_hits') or 0):,}건(RCT·3상·메타분석 {int(n.get('pubmed_heavy_hits') or 0):,}건) 중 "
        f"{int(n.get('pubmed_read') or 0)}건 판독 — {tri('pubmed')}",
        f"ClinicalTrials.gov 등록 시험 {int(n.get('ctgov_total') or 0):,}건(3상 {int(n.get('ctgov_phase3_total') or 0)} · "
        f"모집 중 {int(n.get('ctgov_recruiting') or 0)}) 중 {int(n.get('ctgov_read') or 0)}건 판독 — {tri('ctgov')}",
        f"FDA 라벨({label.get('brand') or '-'}, 개정 {_label_date(label.get('effective_time')) or '-'}) 섹션 판독 — {tri('label')}",
    ]
    if n.get("faers_total") is not None:
        lines.append(f"FAERS 누적 보고 {int(n.get('faers_total') or 0):,}건 — 상위 반응 {top or '-'}")
    cms = _cms_finding(n)
    if cms:
        lines.append(cms["statementKo"])
    out += [{"statementKo": s, "computedBy": "SQL"} for s in lines]
    return out


def _action_row(a: dict, state: dict) -> dict:
    return {
        "actionItemId": a["id"], "hypothesisId": a.get("hypothesis_id"), "directiveKo": a.get("question_ko") or "",
        "whyKo": a.get("why_ko"), "target": ACTION_TARGET, "ownerRole": ACTION_OWNER,
        "status": "ACTIVE" if (a.get("status") or "OPEN") == "OPEN" else "CLOSED", "source": "HUMAN",
        "targetSpecialty": None, "targetRegions": None,
        "collectedClaimCount": _collected(state, a["id"]), "computedBy": "SQL",
        "approvedBy": a.get("approved_by"), "createdAt": _iso(a.get("approved_at")), "deliveredAt": _iso(a.get("approved_at")),
    }


# ── the cards ────────────────────────────────────────────────────────────────

def hyp_brief(h: dict, state: dict, contract: dict) -> dict:
    """One item of GET /hypotheses — type Hyp (page.tsx:17-48) plus what AgendaLedger/ScreenBench read."""
    hid = h["id"]
    status = console_status(h, state)
    screen, rev, dec = _screen(state, hid), _review(state, hid), _decision(state, hid)
    screening = status == "SCREENING"
    kind = "IN_LABEL" if h.get("label_status") == "IN_LABEL" else "DEVELOPMENT"
    has_minutes = _has_minutes(state, hid)
    out = {
        "id": hid, "titleKo": h.get("statement_ko") or "", "titleEn": h.get("statement_en"),
        "kind": kind, "labelScope": "IN_LABEL" if kind == "IN_LABEL" else "OUT_OF_LABEL",
        "labelStatusSource": h.get("label_status_source"),
        "commercialActionBlocked": kind == "DEVELOPMENT",
        "status": status, "loopStatus": h.get("status"),
        "patientSegment": h["segment"], "patientSegmentKo": h["segment"], "signalType": h["signal_type"],
        "drug": h.get("drug") or contract.get("drug"),
        "notBoardReadyReason": NO_EVIDENCE if (screen and NO_EVIDENCE in (screen.get("flags") or [])) else None,
        "driverSummaryKo": _driver_summary(h, state),
        "aggregate": _aggregate(h, state, contract),
        "hasMinutes": has_minutes,
        "evidenceReviewedBy": rev.get("by") if rev else None,
        "evidenceReviewedAt": _iso(rev.get("at")) if rev else None,
        # the checkbox: sign after Screen, un-sign until the board has met on the signature
        "evidenceReviewable": bool(screen) and not screening
                              and status in ("BOARD_READY", "NOT_BOARD_READY", "IN_REVIEW") and not has_minutes,
        # signing is 상정 in this backend (REVIEWED → IN_REVIEW), so nothing signed is left waiting to be sent
        "canSendToBoard": rev is not None and status in ("BOARD_READY", "NOT_BOARD_READY"),
        "confirmedBy": None, "confirmedAt": None,
        "createdAt": _iso(h.get("created_at")),
    }
    if screen and not screening:
        out["screenSummary"] = _screen_summary(screen)
    if dec:
        memo = _memo(state, hid) or {}
        out["boardSummary"] = {"decision": status, "decidedAt": _iso(dec.get("at")), "decidedBy": dec.get("by"),
                               "recommendation": memo.get("recommendation"), "computedBy": "SQL"}
    return out


def hyp_detail(h: dict, state: dict, contract: dict) -> dict:
    """GET /hypotheses/{id} — the five-tier card (docs/04 §4) the workbench (StageDetail) and the board room
    (Card) read. A superset of hyp_brief."""
    hid = h["id"]
    out = hyp_brief(h, state, contract)
    status = out["status"]
    screen, rev, memo, dec = _screen(state, hid), _review(state, hid), _memo(state, hid), _decision(state, hid)
    claims = _claims_of(state, h)

    out["observedFacts"] = [
        {"statementKo": c.get("quote") or "", "claimId": c["id"], "hcpRef": c.get("hcp_ref"), "docId": c.get("doc_id"),
         "charStart": c.get("char_start"), "charEnd": c.get("char_end"), "verified": bool(c.get("verified")),
         "noteKo": c.get("note_ko"), "segment": c.get("segment"), "signalType": c.get("signal_type"),
         "status": c.get("status"), "contractVersion": c.get("contract_version")}
        for c in claims]
    out["statisticalPatterns"] = _statistical_patterns(h, state, screen)
    out["aiInterpretations"] = [{"statementKo": h.get("statement_ko") or "", "llmRunId": None, "source": "hypothesis_agent"}]
    if memo:
        for key, src in (("summary_ko", "BOARD_MINUTES"), ("evidence_summary_ko", "BOARD_MINUTES")):
            if memo.get(key):
                out["aiInterpretations"].append({"statementKo": memo[key], "llmRunId": None, "source": src})
    out["strategicProposals"] = []
    if memo:
        out["strategicProposals"] += [{"statementKo": q.get("question_ko") or "", "whyKo": q.get("why_ko"), "source": "BOARD"}
                                      for q in memo.get("follow_up_questions") or []]
        out["strategicProposals"] += [{"statementKo": p["action_ko"], "source": "BOARD_PERSONA", "speakerKo": p.get("speaker_ko")}
                                      for p in memo.get("proposals") or [] if p.get("action_ko")]
    out["approvedActions"] = [_action_row(a, state) for a in _actions_of(state, hid)]

    out.update(_screen_block(state, h, screen, status == "SCREENING"))

    out["boardMinutes"] = [
        {"seq": t.get("no"), "role": t.get("speaker"), "roleKo": t.get("speaker_ko"), "phaseKo": t.get("phase"),
         "positionKo": t.get("utterance_ko") or "", "stance": t.get("stance"), "confidence": t.get("confidence"),
         "stanceChanged": t.get("stance_changed"), "cited": t.get("cited") or [], "at": _iso(t.get("at"))}
        for t in (memo or {}).get("transcript") or []]
    out["decisions"] = ([{"decision": status, "decidedBy": dec.get("by"), "rationaleKo": (memo or {}).get("rationale_ko"),
                          "decidedAt": _iso(dec.get("at")), "accepted": dec.get("accepted"), "noteKo": dec.get("note") or None}]
                        if dec else [])
    if memo:
        out["boardMemo"] = {
            "recommendation": memo.get("recommendation"), "route": memo.get("route"),
            "hypothesisType": memo.get("hypothesis_type"), "lead": memo.get("lead"), "leadKo": memo.get("lead_ko"),
            "attendees": memo.get("attendees") or [], "tally": memo.get("tally"),
            "stanceEvolution": memo.get("stance_evolution") or [],
            "summaryKo": memo.get("summary_ko"), "evidenceSummaryKo": memo.get("evidence_summary_ko"),
            "rationaleKo": memo.get("rationale_ko"), "killCriteriaKo": memo.get("kill_criteria_ko") or [],
            "risksKo": memo.get("risks_ko") or [], "followUpQuestions": memo.get("follow_up_questions") or [],
            "blockedActions": memo.get("blocked_actions") or [], "closingKo": memo.get("closing_ko"),
            "deliberatedAt": _iso(memo.get("deliberated_at")),
        }
    search = h.get("search") or {}
    out["externalSearch"] = {"productTerms": [contract.get("drug")] if contract.get("drug") else [],
                             "indicationTerms": [], "condition": search.get("ctgov_condition"),
                             "noteKo": search.get("pubmed_query"), "pubmedQuery": search.get("pubmed_query"),
                             "ctgovCondition": search.get("ctgov_condition")}
    out["evidenceReview"] = ({"by": rev.get("by"), "at": _iso(rev.get("at")), "noteKo": rev.get("note"),
                              "itemsRead": rev.get("items_read"), "droppedSeen": rev.get("dropped_seen"),
                              "screenRanAt": _iso(rev.get("screen_ran_at"))} if rev else None)
    return out


# ── transitions ──────────────────────────────────────────────────────────────

def _transition_verdict(state: dict, h: dict, status: str, to: str) -> tuple[bool, str | None, str | None]:
    """(ok, code, reasonKo). Pure — nothing is written; a move is `ok` only when the state already satisfies it."""
    hid = h["id"]
    signed = _review(state, hid) is not None
    if to == "SCREEN_QUEUED":
        if status in ("DRAFT", "SCREEN_QUEUED"):
            return True, None, None
        return False, "NOT_ALLOWED", f"{status} 에서 Screen 대기로 보내는 걸음은 이 백엔드에 없습니다 — Screen 은 재실행으로 다시 돕니다."
    if to == "IN_REVIEW":
        if status == "IN_REVIEW":
            return True, None, None
        if status in ("BOARD_READY", "NOT_BOARD_READY"):
            if signed:
                return True, None, None
            return False, "EVIDENCE_REVIEW_REQUIRED", "외부 근거 검토 서명이 없습니다 — 「외부 근거를 직접 검토했습니다」에 체크하면 그 서명이 곧 상정입니다."
        if status == "HOLD":
            return False, "NOT_ALLOWED", "보류 안건의 2차 심의는 이 백엔드에서 열지 않습니다 — 새 근거가 있으면 Screen 을 재실행하세요."
        return False, "NOT_ALLOWED", f"{status} 에서는 상정할 수 없습니다."
    if to == "BOARD_READY":
        if status in ("BOARD_READY", "NOT_BOARD_READY"):
            return True, None, None
        if status == "IN_REVIEW":
            if _has_minutes(state, hid):
                return False, "ALREADY_DELIBERATED", "회의록이 있는 안건은 되돌리지 않습니다 — 결정은 회의장에서 내립니다."
            return False, "UNSIGN_INSTEAD", "이 백엔드에서 상정은 서명 그 자체입니다 — 되돌리려면 서명을 해제하세요 (evidence-review reviewed:false)."
        return False, "NOT_ALLOWED", f"{status} 에서 심의 대기로 되돌릴 수 없습니다."
    if to == "DRAFT":
        return False, "NOT_ALLOWED", "Screen 결과를 Sense 로 되돌리는 걸음은 이 백엔드에 없습니다 — 신호가 더 쌓이면 Screen 을 재실행하세요."
    return False, "UNKNOWN_TRANSITION", f"알 수 없는 전이입니다: {to}"


def transition(state: dict, ids: list[str], to: str) -> dict:
    """POST /hypotheses/transition — per-id verdicts, nothing persisted (HandoffBar.tsx:16-19 reads moved/refused)."""
    moved, refused = [], []
    idx = {h["id"]: h for h in state.get("hypotheses", [])}
    for hid in ids or []:
        h = idx.get(hid)
        if not h:
            refused.append({"id": hid, "fromStatus": None, "code": "NOT_FOUND", "reasonKo": "가설이 없습니다."})
            continue
        status = console_status(h, state)
        ok, code, reason = _transition_verdict(state, h, status, to)
        if ok:
            moved.append(hid)
        else:
            refused.append({"id": hid, "fromStatus": status, "code": code, "reasonKo": reason})
    return {"to": to, "moved": moved, "refused": refused, "movedCount": len(moved), "refusedCount": len(refused),
            "evidenceReviewCleared": [],
            "noteKo": "이 백엔드의 단계는 서명·심의·결정이 직접 움직입니다 — 전이 요청은 그 상태를 확인만 하고 기록하지 않습니다."}


# ── the human signature ──────────────────────────────────────────────────────

def evidence_review(state: dict, hid: str, reviewed: bool, reviewed_by: str | None = None,
                    note: str = "", contract: dict | None = None) -> dict:
    """POST /hypotheses/{id}/evidence-review — sign (persists through loop.board.sign_review) or withdraw the
    signature (status back to SCREENED, saved through loop.store.save). Returns the detail card."""
    from . import board   # local: keeps this module importable without the board's LLM wrapper

    idx = {h["id"]: h for h in state.get("hypotheses", [])}
    h = idx.get(hid)
    if not h:
        raise Refused("NOT_FOUND", f"가설이 없습니다: {hid}", 404)
    if _is_screening(state, hid):
        raise Refused("RUN_IN_PROGRESS", f"{hid}: Screen 이 실행 중입니다 — 끝난 뒤 서명할 수 있습니다.")
    if not _screen(state, hid):
        raise Refused("SCREEN_NOT_DONE", f"{hid}: 외부 근거가 아직 없습니다 — Screen 을 먼저 실행하세요.")
    if _has_minutes(state, hid) or _decision(state, hid):
        raise Refused("ALREADY_DELIBERATED", f"{hid}: 회의록이 이 서명 위에 서 있습니다 — 서명을 바꾸지 않습니다.")
    runtime = _pop_runtime(state)
    try:
        if reviewed:
            board.sign_review(state, hid, (reviewed_by or "").strip() or "검토자", (note or "").strip())
        else:
            (state.get("reviews") or {}).pop(hid, None)
            h["status"] = "SCREENED"
            store.save(state)
    finally:
        state.update(runtime)
    card = hyp_detail(h, state, contract or store.contract())
    card["hypothesisId"] = hid
    card["noteKo"] = ("서명이 기록됐습니다 — 이 서명이 곧 상정입니다." if reviewed
                      else "서명을 거뒀습니다 — 다시 서명해야 상정됩니다.")
    return card


# ── safety route ─────────────────────────────────────────────────────────────

def safety_candidates(state: dict, notes: list[dict] | None = None) -> list[dict]:
    """GET /safety/candidates — the separated adverse-event route. The FastAPI layer must gate this on the SAFETY
    role header (safety/page.tsx:21, rule #6); this function only shapes the rows."""
    by_doc = {n.get("doc_id"): n for n in (notes or [])}
    out = []
    for s in state.get("safety_queue", []):
        note = by_doc.get(s.get("doc_id")) or {}
        out.append({
            "id": s["id"], "interactionId": s.get("doc_id"), "verbatimQuote": s.get("quote") or "",
            "status": "ROUTED", "routedAt": _iso(s.get("extracted_at")), "hcpRef": s.get("hcp_ref"),
            "noteKo": s.get("note_ko"), "segment": s.get("segment"), "signalType": s.get("signal_type"),
            "charStart": s.get("char_start"), "charEnd": s.get("char_end"), "verified": bool(s.get("verified")),
            "specialty": note.get("specialty"), "occurredOn": note.get("date"), "contractVersion": s.get("contract_version"),
        })
    return out


# ── audit: model calls ───────────────────────────────────────────────────────

RUNS_LOG = store.DATA / "llm_runs.jsonl"


def _run_lines() -> list[str]:
    if not RUNS_LOG.exists():
        return []
    return [line for line in RUNS_LOG.read_text().splitlines() if line.strip()]


def _run_row(no: int, r: dict) -> dict:
    usage = r.get("usage") or {}
    cached = bool(r.get("cached"))
    key = r.get("key") or ""
    return {
        "id": no, "createdAt": _iso(r.get("ts")), "purpose": r.get("purpose") or "-", "model": r.get("model") or "-",
        "promptVersion": key[:8] or "-",           # the cache key prefix: data/llm_cache/<key>.json holds the exchange
        "latencyMs": int(r.get("ms") or 0), "cached": cached, "callMode": "CACHE" if cached else "REALTIME",
        "costUsd": None, "cacheReadTokens": None,
        "inputTokens": int(usage.get("input") or 0), "outputTokens": int(usage.get("output") or 0),
        "cacheKey": key or None, "mode": r.get("mode"), "thinking": r.get("thinking"),
        "reasoningChars": r.get("reasoning_chars"),
    }


def llm_runs(limit: int = 60) -> list[dict]:
    """GET /llm-runs?limit= — the last `limit` records, newest first. `id` is the line number in the log."""
    lines = _run_lines()
    total = len(lines)
    limit = max(0, int(limit or 0))
    rows = []
    for i in range(total - 1, max(-1, total - 1 - limit), -1):
        try:
            rows.append(_run_row(i + 1, json.loads(lines[i])))
        except ValueError:
            continue
    return rows


def cost_summary() -> dict:
    """GET /system/cost-summary — counts and tokens by call mode. Money is 0: the calls go to NVIDIA NIM's free
    tier, and no price list is invented to fill the card."""
    by = {m: {"calls": 0, "costUsd": 0.0, "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0}
          for m in ("REALTIME", "CACHE")}
    models: Counter = Counter()
    total = 0
    for line in _run_lines():
        try:
            r = json.loads(line)
        except ValueError:
            continue
        total += 1
        m = "CACHE" if r.get("cached") else "REALTIME"
        usage = r.get("usage") or {}
        by[m]["calls"] += 1
        by[m]["inputTokens"] += int(usage.get("input") or 0)
        by[m]["outputTokens"] += int(usage.get("output") or 0)
        models[r.get("model") or "-"] += 1
    return {
        "computedBy": "SQL", "totalCalls": total, "spentUsd": 0.0, "fullPriceUsd": 0.0, "savedUsd": 0.0,
        "promptCacheHitTokens": 0,
        "noteKo": (f"NVIDIA NIM 무료 티어로 호출해 청구 금액이 없습니다 — 금액은 0으로 두고 호출 수·토큰만 셉니다. "
                   f"실호출 {by['REALTIME']['calls']}건 · 캐시 재생 {by['CACHE']['calls']}건(API 미호출). "
                   f"기록: data/llm_runs.jsonl"),
        "byMode": by, "models": dict(models),
    }


# ── generate ─────────────────────────────────────────────────────────────────

def generate(state: dict, contract: dict) -> dict:
    """POST /hypotheses/generate — no-op here (hypotheses are drafted in Sense). Re-counts the threshold combos
    in code so the bar's numbers are real; creates nothing (GenerateBar.tsx:26-39)."""
    from . import sense   # local: sense imports the LLM wrapper, which this module otherwise never needs

    min_m, min_h, note = _threshold(contract)
    rows = sense.tally(state)
    passed = [r for r in rows if r["mentions"] >= min_m and r["hcps"] >= min_h]
    existing = {(h["segment"], h["signal_type"]): h["id"] for h in state.get("hypotheses", [])}
    near = [r for r in rows if r not in passed][:8]
    return {
        "evaluatedCombos": len(rows), "passedCombos": len(passed),
        "created": [], "updated": [], "retired": [], "weakened": [],
        "existing": [existing[(r["segment"], r["signal_type"])] for r in passed if (r["segment"], r["signal_type"]) in existing],
        "thresholds": {"repeat": min_m, "distinctHcp": min_h, "noteKo": note},
        "provisional": True, "computedBy": "SQL", "asOf": _iso(store.now()),
        "nearMiss": [{"signalId": f"{r['segment']}::{r['signal_type']}", "segment": r["segment"],
                      "signalType": r["signal_type"], "claimCount": r["mentions"], "distinctHcp": r["hcps"]} for r in near],
        "noteKo": (f"가설 {len(state.get('hypotheses', []))}건은 Sense 단계에서 이미 세워져 있습니다 — "
                   "이 호출은 임계 집계만 다시 셉니다."),
    }


# ── counts the shell reads ───────────────────────────────────────────────────

def pipeline_counts(state: dict) -> dict:
    """GET /hypotheses/pipeline — byStatus · boardStages (page.tsx:51-54, AgendaLedger.tsx:123-131)."""
    hyps = state.get("hypotheses", [])
    by = Counter(console_status(h, state) for h in hyps)
    in_review = [h for h in hyps if console_status(h, state) == "IN_REVIEW"]
    awaiting = sum(1 for h in in_review if _has_minutes(state, h["id"]))
    stages = {   # nav.tsx:18 Stage — `screen`/`board` are what those tabs list (page.tsx:107, :112)
        "all": len(hyps),
        "sense": by.get("DRAFT", 0),
        "screen": sum(by.get(s, 0) for s in SCREEN_STAGE),
        "board": sum(by.get(s, 0) for s in ("IN_REVIEW", "APPROVED", "HOLD", "REJECTED")),
        "blocked": by.get("NOT_BOARD_READY", 0),
        "decided": sum(by.get(s, 0) for s in ("APPROVED", "HOLD", "REJECTED")),
    }
    return {"stages": stages, "byStatus": dict(by),
            "boardStages": {"convening": len(in_review) - awaiting, "awaitingDecision": awaiting},
            "computedBy": "SQL"}


def aggregates_pipeline(state: dict, contract: dict) -> dict:
    """GET /aggregates/pipeline — the strip on the Sense tab (page.tsx:50): DRAFT count and combos one mention short."""
    from . import sense

    min_m, _, _ = _threshold(contract)
    rows = sense.tally(state)
    near = sum(1 for r in rows if r["mentions"] == min_m - 1)   # "반복이 1건만 모자란 조합" (page.tsx:525)
    draft = sum(1 for h in state.get("hypotheses", []) if console_status(h, state) == "DRAFT")
    return {"hypotheses": {"draft": draft, "nearThreshold": near}, "computedBy": "SQL"}
