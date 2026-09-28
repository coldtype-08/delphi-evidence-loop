"""Pages — overview, claims, hypotheses, one hypothesis, checklist. Same renderers serve the web console
(with controls) and the static report (without)."""
from __future__ import annotations

import json

from . import store
from .ui import button, chip, esc, label_chip, shell, status_chip, tag

STANCE_ORDER = ("SUPPORTS", "CONTRADICTS", "NEUTRAL")


# ── shared pieces ──────────────────────────────────────────────────────────────

def next_step(state: dict, h: dict) -> tuple[str, str]:
    """(who, what) — whose turn it is for this hypothesis."""
    st = h["status"]
    if st == "DRAFT":
        return "agent", "근거 교차검증"
    if st == "SCREENED":
        return "human", "근거 검토 서명"
    if st == "REVIEWED":
        return "agent", "심의"
    if st == "DELIBERATED":
        return "human", "결정"
    return "done", "체크리스트 반영됨"


def controls_for(state: dict, h: dict) -> str:
    hid, st = h["id"], h["status"]
    if st == "DRAFT":
        return button("② 근거 교차검증 실행", "/run/screen", {"hyp": hid})
    if st == "SCREENED":
        return button("③ 외부 근거를 직접 검토했습니다 — 서명", "/run/review", {"hyp": hid},
                      [("by", "검토자 이름"), ("note", "메모 (선택)")], turn=True)
    if st == "REVIEWED":
        return button("④ 심의 실행 (Nemotron 사고 모드)", "/run/board", {"hyp": hid})
    if st == "DELIBERATED":
        return button("⑤ 권고를 받아들입니다 — 결정", "/run/approve", {"hyp": hid}, [("by", "결정자 이름")], turn=True)
    return '<span class="faint">완료 — 질문이 다음 면담 체크리스트에 내려갔다</span>'


def tally_chips(s: dict | None) -> str:
    if not s:
        return '<span class="faint">아직 근거 없음</span>'
    t = s["totals"]
    return (f'<span class="chip support">지지 {t["SUPPORTS"]}</span><span class="chip oppose">반대 {t["CONTRADICTS"]}</span>'
            f'<span class="chip hold">중립 {t["NEUTRAL"]}</span><span class="faint">버림 {len(s["dropped"])}</span>')


def pipeline_strip(state: dict, notes_n: int) -> str:
    claims = state["claims"]
    verified = sum(c["verified"] for c in claims)
    hyps = state["hypotheses"]
    human_turn = [h for h in hyps if next_step(state, h)[0] == "human"]
    cells = [
        ("면담 기록", notes_n, "합성 · 한국어", False),
        ("발언 카드", len(claims), f"원문 검증 {verified}/{len(claims)} · 유해사례 {len(state['safety_queue'])} 분리", False),
        ("가설", len(hyps), "문턱 3회·3인 (코드)", False),
        ("외부 근거", len(state["screens"]), "PubMed · CT.gov · 라벨 · FAERS · Part D", False),
        ("서명 · 심의", f"{len(state['reviews'])} · {len(state['board'])}", f"사람 차례 {len(human_turn)}건" if human_turn else "관문 대기 없음", bool(human_turn)),
        ("체크리스트", len(state["actions"]), "다음 면담이 참조", False),
    ]
    return '<div class="strip">' + "".join(
        f'<div class="{"turn" if turn else ""}"><div class="k">{esc(k)}</div><b>{esc(v)}</b><div class="s">{esc(s)}</div></div>'
        for k, v, s, turn in cells) + "</div>"


def hyp_table(state: dict, link: bool = True) -> str:
    rows = []
    for h in state["hypotheses"]:
        s = state["screens"].get(h["id"])
        who, what = next_step(state, h)
        turn = f'<span class="chip turn">사람 차례 · {what}</span>' if who == "human" else (f'<span class="faint">{what}</span>' if who == "agent" else f'<span class="faint">{what}</span>')
        name = f'<a href="/hypotheses/{h["id"]}"><b>{esc(h["id"])}</b></a>' if link else f'<a href="#{h["id"]}"><b>{esc(h["id"])}</b></a>'
        rows.append(f'<tr><td class="n">{name}<br>{status_chip(h["status"])}</td>'
                    f'<td>{esc(h["segment"])} × {esc(h["signal_type"])}<br><span class="faint">{esc(h["statement_ko"][:80])}{"…" if len(h["statement_ko"]) > 80 else ""}</span></td>'
                    f'<td class="n">{h["field"]["mentions"]}회 / {h["field"]["hcps"]}인</td><td>{tally_chips(s)}</td><td>{label_chip(h["label_status"])}</td><td>{turn}</td></tr>')
    if not rows:
        return '<p class="sub">아직 가설이 없다 — 추출을 실행하면 문턱을 넘은 묶음이 가설이 된다.</p>'
    return ('<table><tr><th>가설</th><th>환자군 × 신호 유형</th><th>현장</th><th>외부 근거 (코드 집계)</th><th>라벨</th><th>다음</th></tr>'
            + "".join(rows) + "</table>")


# ── pages ─────────────────────────────────────────────────────────────────────

def overview(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    notes_n = len(json.loads(store.FIELD_NOTES.read_text()))
    body = [f'<div class="eyebrow">{esc(contract["drug_ko"])} · 계약 {esc(contract["version"])} · 환자군 {len(contract["segments"])} · 신호 유형 {len(contract["signal_types"])}</div>',
            '<h1>현장 신호가 근거를 지나 실행이 되기까지</h1>',
            '<p class="sub">면담 기록에서 다음 면담 체크리스트까지 닫히는 루프. 모델은 고르고 인용하고, 숫자는 코드가 세고, 두 관문은 사람이 지킨다. 모든 면담 기록은 합성이다.</p>',
            pipeline_strip(state, notes_n)]
    if web:
        body.append('<div class="card"><div class="row"><div class="grow"><b>① 추출</b> <span class="sub">면담 기록 → 발언 카드(원문 검증) → 문턱 넘은 묶음 → 가설. 같은 입력은 캐시에서 즉시 재생된다.</span></div>'
                    + button("① 추출 실행", "/run/sense") + '</div>'
                    '<div class="row"><div class="grow faint">결과만 지우고 처음부터 (캐시는 유지)</div>' + button("초기화", "/run/reset", ghost=True) + '</div></div>')
    body.append("<h2>가설</h2>")
    body.append(hyp_table(state))
    sq = state["safety_queue"]
    if sq:
        body.append(f'<div class="card" style="border-left:4px solid var(--rust)">{tag("fact")}<b>유해사례 후보 {len(sq)}건</b>이 safety 큐에 있다 — 분석 집계에 섞이지 않고 별도 경로로만 간다. <a href="/claims#safety">보기</a></div>')
    return shell("개요", "\n".join(body), "/", banner)


def claims_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    claims, sq = state["claims"], state["safety_queue"]
    body = ['<div class="eyebrow">Sense</div><h1>발언 카드</h1>',
            f'<p class="sub">{tag("fact")}모델이 면담 기록에서 고른 발언. 인용문은 코드가 원문에서 위치를 찾은 것만 검증 통과 — 못 찾으면 «검증 실패»로 남고 세지 않는다.</p>']
    body.append('<div class="grid g4">' + "".join(f'<div class="kpi"><b>{v}</b><span>{k}</span></div>' for k, v in [
        ("발언 카드", len(claims)), ("원문 검증 통과", f"{sum(c['verified'] for c in claims)}/{len(claims)}"),
        ("환자군 × 신호 묶음", len({(c['segment'], c['signal_type']) for c in claims if c['verified']})), ("유해사례 후보", len(sq))]) + "</div>")
    if claims:
        body.append("<h2>카드</h2><table><tr><th>카드</th><th>환자군 × 신호 유형</th><th>인용 (원문 위치)</th><th>의료진</th></tr>")
        for c in claims:
            pos = f'<span class="mono faint">{esc(c["doc_id"])} @{c["char_start"]}–{c["char_end"]}</span>' if c["verified"] else '<span class="chip oppose">검증 실패</span>'
            body.append(f'<tr><td class="mono">{esc(c["id"])}</td><td>{esc(c["segment"])}<br><span class="faint">{esc(c["signal_type"])}</span></td>'
                        f'<td><span class="q">“{esc(c["quote"])}”</span><br>{pos} <span class="faint">{esc(c["note_ko"])}</span></td><td class="mono">{esc(c["hcp_ref"])}</td></tr>')
        body.append("</table>")
    else:
        body.append('<p class="sub">아직 없음 — 개요에서 추출을 실행한다.</p>')
    if sq:
        body.append('<h2 id="safety">safety 큐 — 분석에 섞이지 않는다</h2><table><tr><th>카드</th><th>인용</th><th>의료진</th></tr>')
        for c in sq:
            body.append(f'<tr><td class="mono">{esc(c["id"])}</td><td class="q">“{esc(c["quote"])}”<br><span class="faint">{esc(c["note_ko"])}</span></td><td class="mono">{esc(c["hcp_ref"])}</td></tr>')
        body.append("</table>")
    return shell("발언 카드", "\n".join(body), "/claims", banner)


def hypotheses_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    body = ['<div class="eyebrow">Hypotheses</div><h1>가설</h1>',
            f'<p class="sub">{tag("pattern")}언급 {contract["threshold"]["min_mentions"]}회 · 의료진 {contract["threshold"]["min_hcps"]}인을 넘은 (환자군 × 신호 유형) 묶음만 가설이 된다. 문턱은 코드다. 문장과 검색식은 모델이 쓴다.</p>',
            hyp_table(state)]
    return shell("가설", "\n".join(body), "/hypotheses", banner)


def hypothesis_section(state: dict, contract: dict, h: dict, web: bool = True) -> str:
    hid = h["id"]
    s = state["screens"].get(hid)
    who, what = next_step(state, h)
    p = [f'<div class="eyebrow">{esc(hid)}</div>',
         f'<h1>{esc(h["segment"])} × {esc(h["signal_type"])}</h1>',
         f'<div>{status_chip(h["status"])}{label_chip(h["label_status"])}' + (f'<span class="chip turn">사람 차례 · {esc(what)}</span>' if who == "human" else "") + "</div>",
         f'<div class="card">{tag("interp")}<b>{esc(h["statement_ko"])}</b><br><span class="sub">{esc(h["statement_en"])}</span>'
         f'<div class="faint" style="margin-top:8px">{tag("pattern")}현장 {h["field"]["mentions"]}회 / {h["field"]["hcps"]}인 · 검색식 <code>{esc(h["search"]["pubmed_query"])}</code> · CT.gov 조건 <code>{esc(h["search"]["ctgov_condition"])}</code></div></div>']
    if web:
        p.append(f'<div class="card"><div class="row"><div class="grow"><b>다음</b> <span class="sub">{"사람 차례" if who == "human" else ("에이전트 차례" if who == "agent" else "완료")} — {esc(what)}</span></div>{controls_for(state, h)}</div></div>')
    if s:
        n, t = s["numbers"], s["totals"]
        p.append("<h2>외부 근거</h2>")
        p.append('<div class="grid g6">' + "".join(f'<div class="kpi"><b>{v}</b><span>{k}</span></div>' for k, v in [
            ("PubMed 검색", f'{n["pubmed_hits"]:,}'), ("RCT·3상·메타", n.get("pubmed_heavy_hits", "-")), ("CT.gov 시험", f'{n["ctgov_total"]:,}'),
            ("그중 3상 · 모집 중", f'{n.get("ctgov_phase3_total", "-")} · {n["ctgov_recruiting"]}'), ("FAERS 보고", f'{n["faers_total"]:,}'),
            ("Part D 2024 청구", f'{n["partd_per_year"]["2024"]["claims"]:,}')]) + "</div>")
        flags = "".join(f' <span class="chip oppose">{esc(f)}</span>' for f in s["flags"])
        p.append(f'<div class="card">{tag("pattern")}읽은 기록 PubMed {n["pubmed_read"]} · CT.gov {n["ctgov_read"]} · 라벨 섹션 {len([i for i in s["items"] + s["dropped"] if i["source"] == "label"])} → '
                 f'<span class="chip support">지지 {t["SUPPORTS"]}</span><span class="chip oppose">반대 {t["CONTRADICTS"]}</span><span class="chip hold">중립 {t["NEUTRAL"]}</span>'
                 f'<span class="faint">인용 검증 실패로 버림 {len(s["dropped"])}</span>{flags} · 라벨 판정 <b>{esc(s["label_status"])}</b>'
                 f'<div class="faint" style="margin-top:6px">{tag("fact")}라벨 {esc(n["label"]["brand"])} ({esc(n["label"]["effective_time"])}) · 조회일 {esc(n["as_of"]["pubmed"])} · 집계는 출처·판정별 고유 건수</div></div>')
        p.append("<table><tr><th>판정</th><th>출처</th><th>인용 (원문 위치)</th><th>해석</th></tr>")
        for it in sorted(s["items"], key=lambda x: STANCE_ORDER.index(x["stance"])):
            sid = it["source_id"]
            base, sec = (sid.split("#", 1) + [""])[:2]
            p.append(f'<tr><td>{chip(it["stance"])}</td><td><a href="{esc(it["url"])}" target="_blank" rel="noopener" class="mono">{esc(base)}</a>'
                     + (f'<br><span class="faint mono">{esc(sec)}</span>' if sec else "") +
                     f'</td><td><span class="q">“{esc(it["quote"])}”</span> <span class="faint mono">@{it["char_start"]}–{it["char_end"]}</span></td><td>{tag("interp")}{esc(it["note_ko"])}</td></tr>')
        for it in s["dropped"]:
            p.append(f'<tr class="drop"><td><span class="chip st">버림</span></td><td class="mono">{esc(it["source_id"].split("#")[0])}</td><td class="q">“{esc(it["quote"][:160])}”</td><td>{esc(it["drop_reason"])} — 세지 않음</td></tr>')
        p.append("</table>")
        faers = " · ".join(f'{esc(r["term"].title())} {r["count"]:,}' for r in n["faers_top"][:6])
        pd = n["partd_per_year"]
        p.append(f'<div class="faint" style="margin-top:8px">{tag("fact")}FAERS 상위 반응: {faers}. Part D 청구 2020→2024: ' +
                 " · ".join(f'{y} {v["claims"]:,}' for y, v in pd.items()) + " (숫자는 API 값 그대로)</div>")
    rev = state["reviews"].get(hid)
    if rev:
        p.append(f'<div class="card gate">{tag("fact")}<b>관문 ① 근거 검토 서명</b> — <b>{esc(rev["by"])}</b> 이(가) {esc(rev["at"])} 에 외부 근거 {rev["items_read"]}건(버림 {rev["dropped_seen"]}건 포함)을 직접 검토했다.'
                 + (f' <span class="sub">{esc(rev["note"])}</span>' if rev["note"] else "") + "</div>")
    memo = state["board"].get(hid)
    if memo:
        qs = "".join(f'<li>{esc(q["question_ko"])} <span class="faint">— {esc(q["why_ko"])}</span></li>' for q in memo["follow_up_questions"])
        risks = "".join(f"<li>{esc(r)}</li>" for r in memo["risks_ko"])
        dec = memo.get("decision")
        p.append("<h2>심의</h2>")
        p.append(f'<div class="card navy">{tag("fact")}<span style="color:var(--on-navy-3)">라벨 판정 {esc(memo["label_status"])} → 경로 {esc(memo["route"])}</span>'
                 f'<h3 style="margin-top:8px">{tag("proposal")}권고 {esc(memo["recommendation"])}</h3><div>{esc(memo["rationale_ko"])}</div></div>')
        p.append(f'<div class="card">{tag("interp")}{esc(memo["evidence_summary_ko"])}</div>')
        p.append(f'<div class="grid" style="grid-template-columns:1fr 1fr"><div class="card"><b>{tag("proposal")}위험</b><ul>{risks}</ul></div>'
                 f'<div class="card"><b>{tag("proposal")}다음 면담에서 물을 것</b><ul>{qs}</ul></div></div>')
        if dec:
            p.append(f'<div class="card gate">{tag("action")}<b>관문 ② 결정</b> — <b>{esc(dec["by"])}</b> 이(가) {esc(dec["at"])} 에 권고 {esc(dec["accepted"])} 을 받아들였다. 후속 질문이 체크리스트로 내려갔다.</div>')
    return "\n".join(p)


def hypothesis_page(state: dict, contract: dict, hid: str, banner: str = "", web: bool = True) -> str:
    h = store.hypothesis(state, hid)
    return shell(hid, hypothesis_section(state, contract, h, web), "/hypotheses", banner)


def checklist_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    acts = state["actions"]
    body = ['<div class="eyebrow">Field checklist</div><h1>다음 면담 체크리스트</h1>',
            f'<p class="sub">{tag("action")}사람이 받아들인 권고의 후속 질문. 다음 면담이 이 질문을 참조해 수집한다 — 루프가 닫히는 곳.</p>']
    if acts:
        body.append("<table><tr><th>항목</th><th>질문</th><th>이유</th><th>가설</th><th>승인</th></tr>")
        for a in acts:
            body.append(f'<tr><td class="mono">{esc(a["id"])}</td><td><b>{esc(a["question_ko"])}</b></td><td class="faint">{esc(a["why_ko"])}</td>'
                        f'<td><a href="/hypotheses/{esc(a["hypothesis_id"])}" class="mono">{esc(a["hypothesis_id"])}</a></td><td class="faint">{esc(a["approved_by"])}<br>{esc(a["approved_at"])}</td></tr>')
        body.append("</table>")
    else:
        body.append('<p class="sub">아직 없음 — 심의를 거쳐 사람이 결정하면 여기에 생긴다.</p>')
    return shell("체크리스트", "\n".join(body), "/checklist", banner)


def static_report(state: dict, contract: dict) -> str:
    """One page for readers who will not run anything: overview + every hypothesis + checklist."""
    notes_n = len(json.loads(store.FIELD_NOTES.read_text()))
    parts = [f'<div class="eyebrow">{esc(contract["drug_ko"])} · 계약 {esc(contract["version"])} · 정적 리포트</div>',
             '<h1>현장 신호가 근거를 지나 실행이 되기까지</h1>',
             '<p class="sub">모든 면담 기록은 합성. 숫자는 전부 코드가 계산. 인용은 원문 위치가 확인된 것만.</p>',
             pipeline_strip(state, notes_n), "<h2>가설</h2>", hyp_table(state, link=False)]
    for h in state["hypotheses"]:
        parts.append(f'<div id="{esc(h["id"])}" style="margin-top:40px;border-top:1px solid var(--line-2);padding-top:20px"></div>')
        parts.append(hypothesis_section(state, contract, h, web=False))
    if state["actions"]:
        parts.append("<h2>다음 면담 체크리스트</h2><table><tr><th>항목</th><th>질문</th><th>이유</th><th>승인</th></tr>" + "".join(
            f'<tr><td class="mono">{esc(a["id"])}</td><td><b>{esc(a["question_ko"])}</b></td><td class="faint">{esc(a["why_ko"])}</td><td class="faint">{esc(a["approved_by"])} · {esc(a["approved_at"])}</td></tr>'
            for a in state["actions"]) + "</table>")
    return shell("리포트", "\n".join(parts), "/", static=True)
