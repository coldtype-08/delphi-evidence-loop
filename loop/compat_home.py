"""Compatibility layer — shapes data/state.json the way the copied Next.js console expects.

The console (`console/`) was written against a SQL backend whose aggregates were served as `{data: ...}`.
Each function here takes the three inputs the loop already has — `state` (store.load()), `contract`
(store.contract()) and `notes` (data/field_notes.json) — and returns the *inner* `data` object of one
console endpoint. The API client unwraps `{data: ...}` itself, so callers wrap the result once.

Endpoint → function
    GET /aggregates/kpis        → kpis
    GET /analytics/collection   → collection
    GET /analytics/mentions     → mentions
    GET /contract/status        → contract_status
    GET /aggregates/signals     → signals_rows
    GET /analytics/segments     → segments_rows
    GET /aggregates/pipeline    → pipeline_aggregate
    GET /hypotheses/pipeline    → hypotheses_pipeline
    GET /analytics/unmapped     → unmapped

Rules kept here: every number is counted in code (never by a model), nothing touches the network, and the
same inputs always give the same output — `asOf` is the latest timestamp *recorded in the state*, not the
wall clock. Adverse-event candidates (`safety_queue`) enter only the safety block of `mentions`.

Console vocabulary mapped onto this dataset:
    "block"   = one field note (there is no finer interview unit here), except in `mentions`, where a
                block is one verified claim — the console's "언급 블록" is a count of mentions.
    "region"  = none. The dataset carries no region; every region list is empty and every
                `distinctRegions` is 0.
    "segment" = the contract's Korean segment label itself (the key *is* the label).
"""
from __future__ import annotations

from collections import Counter, defaultdict

import json

from . import sense, store

COMPUTED_BY = "code"

# US census regions — one per virtual HCP, assigned deterministically by scripts/assign_regions.py and kept in
# data/hcp_regions.json (outside field_notes.json so the extraction cache keys stay valid). Synthetic like the notes.
REGIONS = [("SOUTH", "남부"), ("WEST", "서부"), ("MIDWEST", "중서부"), ("NORTHEAST", "북동부")]
REGION_KO = dict(REGIONS)
REGIONS_FILE = store.DATA / "hcp_regions.json"


def hcp_regions() -> dict[str, str]:
    """hcp_ref → region. An empty dict (file missing) makes every regional view say so instead of drawing blanks."""
    if not REGIONS_FILE.exists():
        return {}
    return json.loads(REGIONS_FILE.read_text())

# Korean gloss for the contract's signal types (the console keeps its own map keyed by the same codes).
SIGNAL_KO = {
    "OFF_LABEL_DEMAND": "쓰고 싶은데 막혔다",
    "OFF_LABEL_USE": "써봤다 · 반응 보고",
    "REPURPOSING": "다른 쓰임",
    "UNMET_NEED": "충족되지 않은 필요",
    "DOSING": "용량 · 제형",
    "SAFETY_TOLERABILITY": "안전성 · 내약성",
}

# In-label population for this contract (metformin: adults and children ≥10 with T2DM). Of the listed
# segments only the 10–17 age band sits inside the approved label; every other segment is out of label.
IN_LABEL_SEGMENTS = frozenset({"청소년 10-17세"})
UNCLASSIFIED_SEGMENT = "OTHER"          # sense.run stores a claim here when the model's segment is not in the contract
UNCLASSIFIED_LABEL_KO = "환자군 미상 (계약 허용값 밖)"

# Our hypothesis status → the console's status vocabulary. SCREENED depends on the screen's flags, so
# use console_status() rather than this table directly.
STATUS_MAP = {
    "DRAFT": "DRAFT",
    "SCREENED": "BOARD_READY",          # NOT_BOARD_READY when the screen flagged NO_EXTERNAL_EVIDENCE
    "REVIEWED": "IN_REVIEW",            # 상정됨 · 회의 전         → boardStages.convening
    "DELIBERATED": "IN_REVIEW",         # 회의 종료 · 결정 대기    → boardStages.awaitingDecision
    "DECIDED:PROCEED_TO_EXPERT_REVIEW": "APPROVED",
    "DECIDED:HOLD": "HOLD",
    "DECIDED:DROP": "REJECTED",
}
SCREEN_STAGE = ("DRAFT", "SCREEN_QUEUED", "SCREENING", "BOARD_READY", "NOT_BOARD_READY")
DECIDED_STAGE = ("APPROVED", "HOLD", "REJECTED")
BOARD_STAGE = ("IN_REVIEW",) + DECIDED_STAGE


# ── shared helpers ─────────────────────────────────────────────────────────────

def console_status(h: dict, state: dict) -> str:
    """The console's status string for one hypothesis. Unknown statuses pass through unchanged."""
    status = h.get("status", "DRAFT")
    if status == "SCREENED":
        flags = state.get("screens", {}).get(h["id"], {}).get("flags", []) or []
        return "NOT_BOARD_READY" if "NO_EXTERNAL_EVIDENCE" in flags else "BOARD_READY"
    return STATUS_MAP.get(status, status)


def current_review(state: dict, hyp_id: str) -> dict | None:
    """The human evidence-review signature for `hyp_id`, but only if it covers the screen run that is stored
    now. A signature made before a re-run of screen is stale: the reviewer did not see the current evidence,
    so the hypothesis counts as waiting for review again (`evidenceReviewedAt` semantics)."""
    rev = state.get("reviews", {}).get(hyp_id)
    if not rev:
        return None
    ran_at = state.get("screens", {}).get(hyp_id, {}).get("ran_at")
    signed_for = rev.get("screen_ran_at")
    if ran_at and signed_for and signed_for != ran_at:
        return None
    return rev


def _analysis_claims(state: dict) -> list[dict]:
    """Claims that enter analytics: quote verified against the note. AE candidates never reach state['claims']."""
    return [c for c in state.get("claims", []) if c.get("verified")]


def _held_claims(state: dict) -> list[dict]:
    """Claims kept but not verified (the quote was not found verbatim) — the part a person still has to look at."""
    return [c for c in state.get("claims", []) if not c.get("verified")]


def _note_dates(notes: list[dict]) -> dict[str, str]:
    return {n["doc_id"]: n["date"] for n in notes if n.get("doc_id") and n.get("date")}


def _label_scope(segment: str) -> str:
    return "IN_LABEL" if segment in IN_LABEL_SEGMENTS else "OUT_OF_LABEL"


def _month_range(first: str, last: str) -> list[str]:
    """Every "YYYY-MM" from first to last inclusive — months with nothing collected stay in the axis as 0."""
    y, m = int(first[:4]), int(first[5:7])
    ey, em = int(last[:4]), int(last[5:7])
    out = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _one_year_before(date: str) -> str:
    """Same calendar day one year earlier (29 Feb → 28 Feb). Plain string arithmetic, no clock."""
    y, rest = int(date[:4]), date[4:]
    if rest == "-02-29":
        rest = "-02-28"
    return f"{y - 1:04d}{rest}"


def _monthly_counts(claims: list[dict], dates: dict[str, str]) -> list[dict]:
    """{month, count} per month in which the quoted interviews took place (claim.doc_id → note.date)."""
    counts: Counter = Counter(dates[c["doc_id"]][:7] for c in claims if c.get("doc_id") in dates)
    return [{"month": m, "count": n} for m, n in sorted(counts.items())]


def _distinct_hcp(claims: list[dict]) -> int:
    return len({c["hcp_ref"] for c in claims if c.get("hcp_ref")})


def _as_of(state: dict, notes: list[dict]) -> str:
    """Latest timestamp the state records — deterministic, unlike the wall clock. Falls back to the last note date."""
    stamps: list[str] = []
    for c in state.get("claims", []) + state.get("safety_queue", []):
        stamps.append(c.get("extracted_at") or "")
    for h in state.get("hypotheses", []):
        stamps.append(h.get("created_at") or "")
    for sc in state.get("screens", {}).values():
        stamps.append(sc.get("ran_at") or "")
    for rev in state.get("reviews", {}).values():
        stamps.append(rev.get("at") or "")
    for memo in state.get("board", {}).values():
        stamps.append(memo.get("deliberated_at") or "")
        stamps.append((memo.get("decision") or {}).get("at") or "")
    for a in state.get("actions", []):
        stamps.append(a.get("approved_at") or "")
    latest = max((s for s in stamps if s), default="")
    if latest:
        return latest
    if notes:
        return max(n["date"] for n in notes if n.get("date")) + "T00:00:00"
    return "1970-01-01T00:00:00"


# ── 1 · GET /aggregates/kpis ───────────────────────────────────────────────────

def kpis(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Home pipeline gauge. Claims are approved when they are stored (rule 3 — no per-claim gate), so
    approvedClaims == totalClaims. pendingReviews counts claims whose quote failed verification — the only
    ones a person still has to read (0 when every stored quote was found in its note)."""
    claims = _analysis_claims(state)
    return {
        "computedBy": COMPUTED_BY,
        "asOf": _as_of(state, notes),
        "approvedClaims": len(claims),
        "totalClaims": len(claims),
        "distinctHcp": _distinct_hcp(claims),
        "openHypotheses": len(state.get("hypotheses", [])),
        "pendingReviews": len(_held_claims(state)),
    }


# ── 2 · GET /analytics/collection ─────────────────────────────────────────────

def collection(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Corpus reality — counted from the notes alone, so it is right before any extraction runs.
    One note = one document = one block. No regions in this dataset."""
    dated = sorted((n for n in notes if n.get("date")), key=lambda n: n["date"])
    if not dated:
        return {
            "computedBy": COMPUTED_BY,
            "corpus": {"documents": len(notes), "blocks": len(notes), "distinctHcp": _distinct_hcp(notes),
                       "firstMonth": "", "lastMonth": "", "recentHcp": 0},
            "recentSince": "", "monthly": [], "yearly": [], "regions": [],
        }
    first, last = dated[0]["date"][:7], dated[-1]["date"][:7]
    months = _month_range(first, last)
    by_month: dict[str, dict] = {m: {"blocks": 0, "hcps": set()} for m in months}
    by_year: dict[str, dict] = defaultdict(lambda: {"blocks": 0, "hcps": set()})
    for n in dated:
        month, year = n["date"][:7], n["date"][:4]
        by_month[month]["blocks"] += 1
        by_month[month]["hcps"].add(n.get("hcp_ref"))
        by_year[year]["blocks"] += 1
        by_year[year]["hcps"].add(n.get("hcp_ref"))
    recent_since = _one_year_before(dated[-1]["date"])
    recent_hcp = {n.get("hcp_ref") for n in dated if n["date"] >= recent_since}
    gap_before = _one_year_before(_one_year_before(dated[-1]["date"]))
    regions = hcp_regions()
    region_rows: list[dict] = []
    if regions:
        last_contact: dict[str, str] = {}
        specialty_of: dict[str, str] = {}
        for n in dated:
            last_contact[n["hcp_ref"]] = max(last_contact.get(n["hcp_ref"], ""), n["date"])
            specialty_of.setdefault(n["hcp_ref"], n.get("specialty", ""))
        for code, _ko in REGIONS:
            rn = [n for n in dated if regions.get(n["hcp_ref"]) == code]
            hc = {n["hcp_ref"] for n in rn}
            spec = Counter(specialty_of[h] for h in hc)
            region_rows.append({
                "region": code, "blocks": len(rn), "distinctHcp": len(hc),
                "recentBlocks": sum(n["date"] >= recent_since for n in rn),
                "recentHcp": len({n["hcp_ref"] for n in rn if n["date"] >= recent_since}),
                "gapHcp": sum(last_contact[h] < gap_before for h in hc),
                "specialties": [{"specialty": s, "hcpCount": k} for s, k in spec.most_common(6)],
            })
        region_rows.sort(key=lambda r: -r["blocks"])
    return {
        "computedBy": COMPUTED_BY,
        "corpus": {
            "documents": len(notes), "blocks": len(notes), "distinctHcp": _distinct_hcp(notes),
            "firstMonth": first, "lastMonth": last, "recentHcp": len(recent_hcp),
        },
        "recentSince": recent_since,
        "monthly": [{"month": m, "blocks": by_month[m]["blocks"], "distinctHcp": len(by_month[m]["hcps"] - {None})}
                    for m in months],
        "yearly": [{"year": y, "blocks": v["blocks"], "distinctHcp": len(v["hcps"] - {None})}
                   for y, v in sorted(by_year.items())],
        "gapBefore": gap_before,
        "regions": region_rows,
    }


# ── 3 · GET /analytics/mentions ───────────────────────────────────────────────

def mentions(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Mention tiles. A "block" here is one verified, non-AE claim; diseases are the contract's patient
    segments; the cross map is keyed "SEGMENT|SIGNAL". AE candidates appear only in `safety.aeBlocks`."""
    claims = _analysis_claims(state)
    dates = _note_dates(notes)
    segments: list[str] = list(contract.get("segments", []))
    signal_types: list[str] = list(contract.get("signal_types", []))

    by_seg: dict[str, list[dict]] = {s: [] for s in segments}
    for c in claims:
        if c.get("segment") in by_seg:
            by_seg[c["segment"]].append(c)

    diseases = [{
        "key": s, "ko": s, "en": "", "labelScope": _label_scope(s),
        "blocks": len(by_seg[s]), "distinctHcp": _distinct_hcp(by_seg[s]),
        "monthly": _monthly_counts(by_seg[s], dates),
    } for s in segments]
    order = {s: i for i, s in enumerate(segments)}
    diseases.sort(key=lambda d: (-d["blocks"], -d["distinctHcp"], order[d["key"]]))

    in_claims = [c for c in claims if c.get("segment") in IN_LABEL_SEGMENTS]
    out_claims = [c for c in claims if c.get("segment") in by_seg and c["segment"] not in IN_LABEL_SEGMENTS]
    out_diseases = [d for d in diseases if d["labelScope"] == "OUT_OF_LABEL" and d["blocks"] > 0]

    by_sig: dict[str, list[dict]] = {t: [] for t in signal_types}
    for c in claims:
        if c.get("signal_type") in by_sig:
            by_sig[c["signal_type"]].append(c)
    signals = [{"key": t, "ko": SIGNAL_KO.get(t, t), "blocks": len(by_sig[t]), "distinctHcp": _distinct_hcp(by_sig[t])}
               for t in signal_types]

    cross_groups: dict[str, list[dict]] = defaultdict(list)
    for c in claims:
        if c.get("segment") in by_seg and c.get("signal_type") in by_sig:
            cross_groups[f"{c['segment']}|{c['signal_type']}"].append(c)
    cross = {k: {"blocks": len(v), "distinctHcp": _distinct_hcp(v)} for k, v in sorted(cross_groups.items())}

    regions = hcp_regions()
    by_region: dict[str, dict] = {}
    if regions:
        for code, _ko in REGIONS:
            rc = [c for c in claims if regions.get(c.get("hcp_ref")) == code]
            if not rc:
                continue
            dseg: dict[str, list[dict]] = defaultdict(list)
            dsig: dict[str, list[dict]] = defaultdict(list)
            for c in rc:
                if c.get("segment") in by_seg:
                    dseg[c["segment"]].append(c)
                if c.get("signal_type") in by_sig:
                    dsig[c["signal_type"]].append(c)
            by_region[code] = {
                "diseases": sorted([{"key": s, "ko": s, "labelScope": _label_scope(s), "blocks": len(v), "distinctHcp": _distinct_hcp(v)}
                                    for s, v in dseg.items()], key=lambda d: (-d["blocks"], d["key"]))[:5],
                "signals": sorted([{"key": t, "ko": SIGNAL_KO.get(t, t), "blocks": len(v), "distinctHcp": _distinct_hcp(v)}
                                   for t, v in dsig.items()], key=lambda d: (-d["blocks"], d["key"]))[:3],
            }

    tol = [c for c in claims if c.get("signal_type") == "SAFETY_TOLERABILITY"]
    ae = list(state.get("safety_queue", []))
    seg_ko = lambda s: UNCLASSIFIED_LABEL_KO if s == UNCLASSIFIED_SEGMENT else s  # noqa: E731

    def by_segment_chips(rows: list[dict]) -> list[dict]:
        counts = Counter(r.get("segment") or UNCLASSIFIED_SEGMENT for r in rows)
        return [{"key": s, "ko": seg_ko(s), "blocks": n}
                for s, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]

    return {
        "computedBy": COMPUTED_BY,
        "totalBlocks": len(claims),
        "scope": {
            "outLabel": {"blocks": len(out_claims), "distinctHcp": _distinct_hcp(out_claims),
                         "diseaseCount": len(out_diseases)},
            "inLabel": {"blocks": len(in_claims), "distinctHcp": _distinct_hcp(in_claims)},
        },
        "diseases": diseases,
        "signals": signals,
        "cross": cross,
        "safety": {
            "tolerabilityBlocks": len(tol), "aeBlocks": len(ae), "unclassifiedBlocks": 0,
            "tol": by_segment_chips(tol), "ae": by_segment_chips(ae),
        },
        "byRegion": by_region,
        "noteKo": (
            "언급 블록은 원문 위치가 검증된 발언 카드(claim)의 수이고, 면담 기록 1건이 블록 1개입니다. "
            "환자군과 신호 유형은 활성 Data Contract의 허용값 그대로이며, 허가 범위 안은 허가 연령대인 "
            "청소년 10-17세 환자군만입니다. 환자군이 허용값 밖(OTHER)인 발언은 허가 범위 어느 쪽에도 넣지 않았습니다. "
            "부작용 의심 발언은 별도 큐에만 있고 다른 어떤 집계에도 들어가지 않습니다. 권역은 가상 의료진마다 하나씩 부여한 합성 값입니다."
        ),
    }


# ── 4 · GET /contract/status ──────────────────────────────────────────────────

def contract_status(state: dict, contract: dict, notes: list[dict]) -> dict:
    """The console prints `v${version}`, so the stored "v1.0" is returned as "1.0". The contract file has
    no approval record; those fields are null."""
    raw = str(contract.get("version") or "").strip()
    version = raw[1:] if raw[:1] in ("v", "V") else raw
    return {
        "version": version or None,
        "status": "ACTIVE" if version else "NONE",
        "approvedBy": None,
        "approvedAt": None,
        "locked": False,
    }


# ── 5 · GET /aggregates/signals ───────────────────────────────────────────────

def signals_rows(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Segment × signal rows from sense.tally (verified, non-AE, segment in contract). Official and
    provisional carry the same numbers — there is no per-claim approval queue in this loop."""
    dates = _note_dates(notes)
    by_id = {c["id"]: c for c in _analysis_claims(state)}
    rows = []
    for r in sense.tally(state):
        group = [by_id[cid] for cid in r["claim_ids"] if cid in by_id]
        monthly = _monthly_counts(group, dates)
        counts = {"claimCount": r["mentions"], "distinctHcp": r["hcps"], "distinctRegions": 0}
        rows.append({
            "patientSegment": r["segment"], "signalType": r["signal_type"],
            **counts, "monthly": monthly,
            "provisional": {**counts, "monthly": monthly},
        })
    return {"rows": rows, "computedBy": COMPUTED_BY}


# ── 6 · GET /analytics/segments ───────────────────────────────────────────────

def segments_rows(state: dict, contract: dict, notes: list[dict]) -> dict:
    """One row per contract segment (key == Korean label) plus, when present, one unclassified row for claims
    stored as OTHER — the console shows that row as the material of the structure loop."""
    claims = _analysis_claims(state)
    dates = _note_dates(notes)
    segments: list[str] = list(contract.get("segments", []))
    hyps_by_seg: dict[str, list[str]] = defaultdict(list)
    for h in sorted(state.get("hypotheses", []), key=lambda h: h["id"]):
        hyps_by_seg[h.get("segment")].append(h["id"])

    def row(segment: str, label_ko: str, scope: str, unclassified: bool, group: list[dict]) -> dict:
        pair = {"claimCount": len(group), "distinctHcp": _distinct_hcp(group), "distinctRegions": 0}
        last = max((dates[c["doc_id"]] for c in group if c.get("doc_id") in dates), default=None)
        return {
            "segment": segment, "labelKo": label_ko, "labelScope": scope, "unclassified": unclassified,
            "hypothesisIds": hyps_by_seg.get(segment, []),
            "provisional": pair, "official": dict(pair), "lastMentionAt": last,
        }

    rows = [row(s, s, _label_scope(s), False, [c for c in claims if c.get("segment") == s]) for s in segments]
    other = [c for c in claims if c.get("segment") not in segments]
    if other:
        rows.append(row(UNCLASSIFIED_SEGMENT, UNCLASSIFIED_LABEL_KO, "UNSPECIFIED", True, other))
    return {"rows": rows, "computedBy": COMPUTED_BY}


# ── 7 · GET /aggregates/pipeline ──────────────────────────────────────────────

def pipeline_aggregate(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Journey board and pipeline strip. nearThreshold = tally rows that fail the threshold but are within one
    of it on both axes (mentions ≥ min−1 and hcps ≥ min−1)."""
    claims, held = _analysis_claims(state), _held_claims(state)
    thr = contract.get("threshold", {})
    min_m, min_h = int(thr.get("min_mentions", 3)), int(thr.get("min_hcps", 3))
    near = [r for r in sense.tally(state)
            if not (r["mentions"] >= min_m and r["hcps"] >= min_h)
            and r["mentions"] >= min_m - 1 and r["hcps"] >= min_h - 1]
    hyps = state.get("hypotheses", [])
    return {
        "computedBy": COMPUTED_BY,
        "asOf": _as_of(state, notes),
        "rawDocuments": len(notes),
        "analyzedRecords": len(notes),
        "signals": {
            "total": len(claims), "approved": len(claims), "heldForReview": len(held),
            "provenance": {"seed": 0, "extracted": len(claims)},
            "labelKo": "적재 시 승인 — 원문 위치가 검증된 발언 카드",
        },
        "hypotheses": {
            "total": len(hyps),
            "draft": sum(1 for h in hyps if h.get("status") == "DRAFT"),
            "nearThreshold": len(near),
        },
        "field": {
            "interviews": len(notes),
            "activeDirectives": sum(1 for a in state.get("actions", []) if a.get("status") == "OPEN"),
        },
    }


# ── 8 · GET /hypotheses/pipeline ──────────────────────────────────────────────

def hypotheses_pipeline(state: dict, contract: dict, notes: list[dict]) -> dict:
    """Stage counts for the sidebar badges, the home gauge and the ledger. `evidenceReview` is counted by
    signature, not status: SCREENED hypotheses with no current human review."""
    hyps = state.get("hypotheses", [])
    by_status: Counter = Counter(console_status(h, state) for h in hyps)
    stages = {
        "all": len(hyps),
        "sense": by_status["DRAFT"],
        "screen": sum(by_status[k] for k in SCREEN_STAGE),
        "evidenceReview": sum(1 for h in hyps
                              if h.get("status") == "SCREENED" and current_review(state, h["id"]) is None),
        "board": sum(by_status[k] for k in BOARD_STAGE),
        "decided": sum(by_status[k] for k in DECIDED_STAGE),
        "blocked": by_status["NOT_BOARD_READY"],
    }
    board_stages = {
        "convening": sum(1 for h in hyps if h.get("status") == "REVIEWED"),
        "awaitingDecision": sum(1 for h in hyps if h.get("status") == "DELIBERATED"),
    }
    return {
        "stages": stages,
        "byStatus": dict(by_status),
        "boardStages": board_stages,
        "computedBy": COMPUTED_BY,
        "noteKo": (
            "상태별 건수입니다. 근거 검토 대기는 상태가 아니라 서명 유무로 셉니다 — 외부 근거 교차검증이 끝났는데 "
            "그 결과를 읽은 사람의 서명이 없는 가설입니다. 심의 중(IN_REVIEW)은 상정됐지만 회의 전인 것과 회의가 끝나 "
            "결정을 기다리는 것을 합한 수이고, 둘은 boardStages 가 가릅니다."
        ),
    }


# ── 9 · GET /analytics/unmapped ───────────────────────────────────────────────

def unmapped(state: dict, contract: dict, notes: list[dict]) -> dict:
    """The structure-loop inbox. This loop keeps no surface-form dictionary: a segment outside the contract
    is stored as OTHER without the original wording, so there are no terms to list here."""
    return {
        "rows": [],
        "totalTerms": 0,
        "computedBy": COMPUTED_BY,
        "noteKo": (
            "이 파이프라인은 계약 허용값 밖 표현을 낱말 단위로 모으지 않습니다. 환자군이 허용값에 없는 발언은 OTHER 로 "
            "저장되고, 그 수는 환자군 확장 표의 미분류 행이 셉니다."
        ),
    }
