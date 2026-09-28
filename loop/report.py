"""Render state.json as one HTML page — the same page serves as static report (scripts/report.py)
and as the web console (loop/web.py adds controls). No scripts, every claim links to its source."""
from __future__ import annotations

import html

from . import store

STANCE = {"SUPPORTS": ("지지", "#1b7f4b"), "CONTRADICTS": ("반대", "#b3261e"), "NEUTRAL": ("중립", "#6b6b6b")}
LEVEL = {"fact": "사실", "pattern": "패턴", "interp": "해석", "proposal": "제안", "action": "실행"}
CSS = """
:root{--ink:#1a1a1a;--muted:#6b6b6b;--line:#e3e3e3;--bg:#fff;--card:#f7f7f5;--accent:#1f3a5f;--btn:#1f3a5f;--btnink:#fff}
@media(prefers-color-scheme:dark){:root{--ink:#ecebe8;--muted:#a0a0a0;--line:#333;--bg:#141414;--card:#1e1e1e;--accent:#8fb3e0;--btn:#8fb3e0;--btnink:#141414}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
main{max-width:1000px;margin:0 auto;padding:32px 16px 80px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:40px 0 12px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:17px;margin:28px 0 8px}.sub{color:var(--muted)}
.tag{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.02em;padding:1px 6px;border-radius:4px;border:1px solid var(--line);color:var(--muted);margin-right:6px;vertical-align:middle}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin:10px 0}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}
.q{font-style:italic;color:var(--ink);opacity:.9}.st{font-weight:700}.num{font-variant-numeric:tabular-nums}
a{color:var(--accent)}.drop{opacity:.65}.gate{border-left:4px solid var(--accent);padding-left:12px}
.kpi{display:flex;gap:14px;flex-wrap:wrap}.kpi div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px;min-width:120px}
.kpi b{display:block;font-size:20px}.kpi span{color:var(--muted);font-size:12px}
form{display:inline}button{background:var(--btn);color:var(--btnink);border:0;border-radius:6px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;margin:2px 4px 2px 0}
button.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
input[type=text]{font:inherit;font-size:13px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink);margin-right:4px}
.banner{background:var(--card);border-left:4px solid var(--accent);padding:10px 14px;margin:14px 0;white-space:pre-wrap;font-size:14px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid var(--line)}
"""


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def tag(level: str) -> str:
    return f'<span class="tag">{LEVEL[level]}</span>'


def render(state: dict, contract: dict, controls: str = "", banner: str = "") -> str:
    p = []
    p.append(f"<h1>{esc(contract['drug_ko'])} — 근거 관문 루프</h1>")
    p.append(f'<div class="sub">계약 {esc(contract["version"])} · 환자군 {len(contract["segments"])}개 · 신호 유형 {len(contract["signal_types"])}개 · '
             f'모든 면담 기록은 합성 · 숫자는 전부 코드가 계산</div>')
    claims, sq = state["claims"], state["safety_queue"]
    verified = sum(c["verified"] for c in claims)
    p.append('<div class="kpi" style="margin-top:18px">'
             f'<div><b class="num">{len(claims)}</b><span>발언 카드</span></div>'
             f'<div><b class="num">{verified}/{len(claims)}</b><span>원문 검증 통과</span></div>'
             f'<div><b class="num">{len(sq)}</b><span>유해사례 후보 (safety 큐)</span></div>'
             f'<div><b class="num">{len(state["hypotheses"])}</b><span>가설</span></div>'
             f'<div><b class="num">{len(state["reviews"])}</b><span>근거 검토 서명</span></div>'
             f'<div><b class="num">{len(state["actions"])}</b><span>현장 체크리스트 항목</span></div></div>')
    if banner:
        p.append(f'<div class="banner">{esc(banner)}</div>')
    if controls:
        p.append(controls)

    # Sense
    p.append("<h2>1 · 현장 신호 → 발언 카드</h2>")
    p.append(f"{tag('fact')}면담 기록에서 모델이 고른 발언. 인용문은 코드가 원문에서 위치를 찾은 것만 검증 통과.")
    if claims:
        p.append("<table><tr><th>카드</th><th>환자군 × 신호</th><th>인용 (원문 위치)</th><th>의료진</th></tr>")
        for c in claims:
            pos = f"@{c['char_start']}–{c['char_end']}" if c["verified"] else "검증 실패"
            p.append(f"<tr><td class=num>{esc(c['id'])}</td><td>{esc(c['segment'])} × {esc(c['signal_type'])}</td>"
                     f"<td><span class=q>“{esc(c['quote'])}”</span> <span class=sub>{esc(c['doc_id'])} {pos}</span></td><td>{esc(c['hcp_ref'])}</td></tr>")
        p.append("</table>")
    else:
        p.append('<p class="sub">아직 없음 — 추출을 실행하세요.</p>')
    if sq:
        p.append("<h3>safety 큐 — 분석에 섞이지 않는다</h3><table><tr><th>카드</th><th>인용</th><th>의료진</th></tr>")
        for c in sq:
            p.append(f"<tr><td class=num>{esc(c['id'])}</td><td class=q>“{esc(c['quote'])}”</td><td>{esc(c['hcp_ref'])}</td></tr>")
        p.append("</table>")

    # Hypotheses
    p.append("<h2>2 · 가설 (문턱: 3회 · 3인 — 코드)</h2>")
    for h in state["hypotheses"]:
        f = h["field"]
        p.append(f'<div class="card" id="{esc(h["id"])}"><b>{esc(h["id"])}</b> <span class=tag>{esc(h["status"])}</span><span class=tag>{esc(h["label_status"])}</span> '
                 f'{esc(h["segment"])} × {esc(h["signal_type"])} · {tag("pattern")}현장 {f["mentions"]}회 / {f["hcps"]}인<br>'
                 f'{tag("interp")}{esc(h["statement_ko"])}<br><span class=sub>검색식: {esc(h["search"]["pubmed_query"])} · CT.gov: {esc(h["search"]["ctgov_condition"])}</span></div>')
    if not state["hypotheses"]:
        p.append('<p class="sub">아직 없음.</p>')

    # Screens
    p.append("<h2>3 · 공개 근거 교차검증</h2>")
    for hid, s in state["screens"].items():
        h = store.hypothesis(state, hid)
        n, t = s["numbers"], s["totals"]
        p.append(f"<h3>{esc(hid)} · {esc(h['segment'])} × {esc(h['signal_type'])}</h3>")
        p.append(f"{tag('fact')}PubMed {n['pubmed_hits']:,}건(RCT·3상·메타분석 {n.get('pubmed_heavy_hits', '-')}) 중 {n['pubmed_read']}건 읽음 · "
                 f"CT.gov {n['ctgov_total']:,}건(3상 {n.get('ctgov_phase3_total', '-')} · 모집 중 {n['ctgov_recruiting']}) 중 {n['ctgov_read']}건 읽음 · "
                 f"FAERS 보고 {n['faers_total']:,}건 · Part D 2024 청구 {n['partd_per_year']['2024']['claims']:,}건 · "
                 f"라벨 {esc(n['label']['brand'])} ({esc(n['label']['effective_time'])}) · 조회일 {esc(n['as_of']['pubmed'])}")
        flags = f" · <b>{' '.join(s['flags'])}</b>" if s["flags"] else ""
        p.append(f"<div>{tag('pattern')}지지 <b>{t['SUPPORTS']}</b> · 반대 <b>{t['CONTRADICTS']}</b> · 중립 <b>{t['NEUTRAL']}</b> · "
                 f"인용 검증 실패로 버림 {len(s['dropped'])} · 라벨 판정 <b>{esc(s['label_status'])}</b>{flags}</div>")
        p.append("<table><tr><th>판정</th><th>출처</th><th>인용 (원문 위치)</th><th>해석</th></tr>")
        for it in sorted(s["items"], key=lambda x: ("SUPPORTS", "CONTRADICTS", "NEUTRAL").index(x["stance"])):
            ko, color = STANCE[it["stance"]]
            sec = esc(it["source_id"].split("#")[1]) if "#" in it["source_id"] else ""
            p.append(f'<tr><td class=st style="color:{color}">{ko}</td><td><a href="{esc(it["url"])}">{esc(it["source_id"].split("#")[0])}</a>'
                     f'<br><span class=sub>{sec}</span></td>'
                     f'<td><span class=q>“{esc(it["quote"])}”</span> <span class=sub>@{it["char_start"]}–{it["char_end"]}</span></td><td>{esc(it["note_ko"])}</td></tr>')
        for it in s["dropped"]:
            p.append(f'<tr class=drop><td>버림</td><td>{esc(it["source_id"].split("#")[0])}</td><td class=q>“{esc(it["quote"][:160])}”</td><td>{esc(it["drop_reason"])} — 세지 않음</td></tr>')
        p.append("</table>")
        rev = state["reviews"].get(hid)
        if rev:
            p.append(f'<div class="card gate">{tag("fact")}관문 ① <b>{esc(rev["by"])}</b> 이(가) {esc(rev["at"])} 에 외부 근거 {rev["items_read"]}건(버림 {rev["dropped_seen"]}건 포함)을 직접 검토했다. {esc(rev["note"])}</div>')
        memo = state["board"].get(hid)
        if memo:
            qs = "".join(f"<li>{esc(q['question_ko'])} <span class=sub>— {esc(q['why_ko'])}</span></li>" for q in memo["follow_up_questions"])
            risks = "".join(f"<li>{esc(r)}</li>" for r in memo["risks_ko"])
            dec = memo.get("decision")
            p.append(f'<div class="card">{tag("fact")}라벨 판정 {esc(memo["label_status"])} → 경로: {esc(memo["route"])}<br>'
                     f'{tag("interp")}{esc(memo["evidence_summary_ko"])}<br>'
                     f'{tag("proposal")}권고 <b>{esc(memo["recommendation"])}</b> — {esc(memo["rationale_ko"])}'
                     f'<br>{tag("proposal")}위험<ul>{risks}</ul>{tag("proposal")}후속 질문<ul>{qs}</ul>'
                     + (f'<div class="gate">{tag("action")}관문 ② <b>{esc(dec["by"])}</b> 이(가) {esc(dec["at"])} 에 권고 {esc(dec["accepted"])} 을 받아들였다.</div>' if dec else "")
                     + "</div>")
    if not state["screens"]:
        p.append('<p class="sub">아직 없음.</p>')

    # Actions
    if state["actions"]:
        p.append("<h2>4 · 다음 면담 체크리스트 — 루프가 닫히는 곳</h2><table><tr><th>항목</th><th>질문</th><th>이유</th><th>승인</th></tr>")
        for a in state["actions"]:
            p.append(f"<tr><td class=num>{esc(a['id'])}</td><td>{tag('action')}{esc(a['question_ko'])}</td><td class=sub>{esc(a['why_ko'])}</td><td class=sub>{esc(a['approved_by'])} · {esc(a['approved_at'])}</td></tr>")
        p.append("</table>")
    p.append('<p class=sub style="margin-top:48px">모델: NVIDIA Nemotron 3 Ultra (NIM) · 근거원: PubMed E-utilities, ClinicalTrials.gov v2, openFDA, CMS Medicare Part D · '
             '표기 5단계: [사실] 관찰된 사실 · [패턴] 통계적 패턴 · [해석] AI의 해석 · [제안] 전략적 제안 · [실행] 승인된 실행</p>')
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>근거 관문 루프</title><style>{CSS}</style></head><body><main>' + "\n".join(p) + "</main></body></html>")
