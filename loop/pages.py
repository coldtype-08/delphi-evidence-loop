"""Pages — overview, claims, hypotheses, one hypothesis, checklist. Same renderers serve the web console
(with controls) and the static report (without)."""
from __future__ import annotations

import json

from . import store
from .ui import SIGNAL_KO, button, chip, esc, highlight, label_chip, shell, signal, status_chip, tag

STANCE_ORDER = ("SUPPORTS", "CONTRADICTS", "NEUTRAL")


def load_notes() -> list[dict]:
    return json.loads(store.FIELD_NOTES.read_text())


def demo_card(state: dict, contract: dict, notes_n: int, web: bool = True) -> str:
    """What this demo is, what gets extracted, and where to click — for a reader who arrives cold."""
    segs = " · ".join(esc(s) for s in contract["segments"])
    sigs = "".join(f'<li><b>{esc(code)}</b> — {esc(ko)}</li>' for code, ko in SIGNAL_KO.items())
    notes_link = '<a href="/notes">면담 기록 보기</a>' if web else '<a href="#notes">면담 기록 보기</a>'
    steps = ("<ol class=\"steps\">"
             f"<li>{notes_link} — 무엇이 입력인지 먼저 읽는다 (합성 12건, 한국어)</li>"
             "<li><b>① 추출 실행</b> — 발언 카드 30장이 생기고, 인용마다 원문 위치가 붙는다</li>"
             "<li><b>가설 HYP-003</b>을 연다 — 유방암 환자가 보조요법으로 요청하는 신호</li>"
             "<li><b>② 근거 교차검증</b> — PubMed·CT.gov·라벨을 읽고 지지/반대/중립을 인용과 함께 표시</li>"
             "<li><b>③ 서명</b> — 근거를 읽었다고 이름으로 서명해야 심의로 간다 (사람 관문)</li>"
             "<li><b>④ 심의 → ⑤ 결정</b> — 권고와 후속 질문, 결정하면 체크리스트로 내려간다</li></ol>")
    return (f'<div class="card"><b>이 데모는 무엇을 하나</b> <span class="sub">— 제약 의학부가 의료진 면담에서 들은 말을 «셀 수 있는 신호»로 바꾸고, 공개 근거로 확인하고, 사람이 결정한 것만 다음 면담으로 넘긴다.</span>'
            f'<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">'
            f'<div><div class="eyebrow">입력</div>{esc(contract["drug_ko"])}에 관한 <b>합성 면담 기록 {notes_n}건</b> (가상 의료진 {notes_n}인 · 한국어 · 실제 인물·기관 없음). {notes_link}.'
            f'<div class="eyebrow" style="margin-top:10px">무엇을 뽑나 — 사람이 정한 고정 헤더</div><b>환자군 {len(contract["segments"])}</b>: {segs}<br><b>신호 유형 {len(SIGNAL_KO)}</b>:<ul style="margin:4px 0 0">{sigs}</ul>'
            f'<div class="faint" style="margin-top:6px">«써봤다»와 «막혔다»를 반드시 가른다 — 규제상 전혀 다른 신호다. 유해사례로 읽히는 발언은 처음부터 별도 경로.</div></div>'
            f'<div><div class="eyebrow">보는 순서 (5분)</div>{steps}'
            f'<div class="faint" style="margin-top:8px">같은 입력은 캐시에서 즉시 재생된다. 새 이름으로 서명해 심의하면 그때만 Nemotron이 실제로 돈다(약 1분).</div>'
            f'<div class="faint" style="margin-top:4px"><b>볼 것</b>: HYP-003에서 대규모 3상(MA.32, n=3,649) 무효 결과가 <span class="chip oppose">반대</span>로 올라오고, 심의가 그것부터 쓴다. 시스템은 도장이 아니다.</div></div></div></div>')


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
    notes_n = len(load_notes())
    body = [f'<div class="eyebrow">{esc(contract["drug_ko"])} · 계약 {esc(contract["version"])} · 환자군 {len(contract["segments"])} · 신호 유형 {len(contract["signal_types"])}</div>',
            '<h1>현장 신호가 근거를 지나 실행이 되기까지</h1>',
            '<p class="sub">면담 기록에서 다음 면담 체크리스트까지 닫히는 루프. 모델은 고르고 인용하고, 숫자는 코드가 세고, 두 관문은 사람이 지킨다. 모든 면담 기록은 합성이다.</p>',
            pipeline_strip(state, notes_n), demo_card(state, contract, notes_n, web)]
    if web:
        body.append('<div class="card"><div class="row"><div class="grow"><b>① 추출</b> <span class="sub">면담 기록 12건을 Nemotron이 읽고, 환자군 × 신호 유형에 해당하는 발언을 골라 원문 그대로 인용한다. 코드가 인용을 원문에서 찾아 검증하고, 세고, 문턱(3회·3인)을 넘은 묶음을 가설로 만든다.</span></div>'
                    + button("① 추출 실행", "/run/sense") + '</div>'
                    '<div class="row"><div class="grow faint">결과만 지우고 처음부터 (캐시는 유지)</div>' + button("초기화", "/run/reset", ghost=True) + '</div></div>')
    body.append("<h2>가설</h2>")
    body.append(hyp_table(state))
    sq = state["safety_queue"]
    if sq:
        body.append(f'<div class="card" style="border-left:4px solid var(--rust)">{tag("fact")}<b>유해사례 후보 {len(sq)}건</b>이 safety 큐에 있다 — 분석 집계에 섞이지 않고 별도 경로로만 간다. <a href="/claims#safety">보기</a></div>')
    return shell("개요", "\n".join(body), "/", banner)


def note_cards(state: dict, notes: list[dict], web: bool = True) -> str:
    """Each field note with its verified claims highlighted in place — the evidence pointer made visible."""
    by_doc: dict[str, list] = {}
    for c in state["claims"]:
        by_doc.setdefault(c["doc_id"], []).append((c, "other" if c["segment"] == "OTHER" else "claim"))
    for c in state["safety_queue"]:
        by_doc.setdefault(c["doc_id"], []).append((c, "ae"))
    out = []
    for n in notes:
        spans = [(c["char_start"], c["char_end"], cls,
                  f'{c["id"]} · {c["segment"]} × {c["signal_type"]}' + (" · 유해사례 후보 (safety 큐)" if cls == "ae" else ""))
                 for c, cls in by_doc.get(n["doc_id"], []) if c["verified"]]
        k = len([1 for c, cls in by_doc.get(n["doc_id"], []) if cls != "ae"])
        ae = len([1 for c, cls in by_doc.get(n["doc_id"], []) if cls == "ae"])
        tally = (f'<span class="chip st">발언 카드 {k}</span>' if k else "") + (f'<span class="chip oppose">유해사례 후보 {ae}</span>' if ae else "")
        out.append(f'<div class="note" id="{esc(n["doc_id"])}"><div class="meta"><span class="mono">{esc(n["doc_id"])}</span> · {esc(n["hcp_ref"])} · {esc(n["specialty"])} · {esc(n["date"])} · 합성 {tally}</div>'
                   f'{highlight(n["text"], spans)}</div>')
    return "".join(out)


def notes_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    notes = load_notes()
    body = ['<div class="eyebrow">Input</div><h1>면담 기록</h1>',
            f'<p class="sub">{tag("fact")}이 루프의 입력. 의학부 담당자가 의료진을 만나고 남기는 기록을 본떠 <b>합성</b>한 {len(notes)}건이다(가상 의료진 {len(notes)}인, 실제 인물·기관·발언 없음). '
            f'약은 {esc(contract["drug_ko"])}. 추출을 실행하면 모델이 고른 발언이 <mark>원문 위에 표시</mark>되고, 유해사례로 읽힌 발언은 <mark class="ae">따로 표시</mark>된다 — 표시된 자리가 곧 코드가 검증한 원문 위치다.</p>',
            note_cards(state, notes, web)]
    return shell("면담 기록", "\n".join(body), "/notes", banner)


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
            pos = f'<a href="/notes#{esc(c["doc_id"])}" class="mono faint">{esc(c["doc_id"])} @{c["char_start"]}–{c["char_end"]}</a>' if c["verified"] else '<span class="chip oppose">검증 실패</span>'
            body.append(f'<tr><td class="mono">{esc(c["id"])}</td><td>{esc(c["segment"])}<br><span class="faint">{signal(c["signal_type"])}</span></td>'
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
         f'<h1>{esc(h["segment"])} × {esc(h["signal_type"])} <span class="sub" style="font-weight:400">({esc(SIGNAL_KO.get(h["signal_type"], ""))})</span></h1>',
         f'<div>{status_chip(h["status"])}{label_chip(h["label_status"])}' + (f'<span class="chip turn">사람 차례 · {esc(what)}</span>' if who == "human" else "") + "</div>",
         f'<div class="card">{tag("interp")}<b>{esc(h["statement_ko"])}</b><br><span class="sub">{esc(h["statement_en"])}</span>'
         f'<div class="faint" style="margin-top:8px">{tag("pattern")}현장 {h["field"]["mentions"]}회 / {h["field"]["hcps"]}인 · 검색식 <code>{esc(h["search"]["pubmed_query"])}</code> · CT.gov 조건 <code>{esc(h["search"]["ctgov_condition"])}</code></div></div>']
    explain = {
        "DRAFT": "누르면 에이전트가 검색식으로 PubMed · ClinicalTrials.gov · FDA 라벨을 읽고, 기록마다 지지/반대/중립을 원문 인용과 함께 표시한다. 건수는 코드가 센다.",
        "SCREENED": "아래 근거 표를 직접 읽었다는 서명이다. 이름이 기록에 남고, 서명이 있어야만 심의로 갈 수 있다. 지지보다 반대가 많아도 올릴 수 있다 — 판단은 사람 몫.",
        "REVIEWED": "누르면 Nemotron이 사고 모드로 근거 전체를 읽고 권고(전문조직 검토 / 보류 / 기각) · 위험 · 다음 면담에서 물을 질문을 쓴다. 약 1분.",
        "DELIBERATED": "권고를 받아들이면 후속 질문이 다음 면담 체크리스트로 내려간다. 결정자 이름이 남는다.",
    }.get(h["status"], "질문이 체크리스트에 있다. 다음 면담이 이 질문을 참조해 수집한다.")
    if web:
        p.append(f'<div class="card"><div class="row"><div class="grow"><b>다음</b> <span class="sub">{"사람 차례" if who == "human" else ("에이전트 차례" if who == "agent" else "완료")} — {esc(what)}</span>'
                 f'<div class="faint" style="margin-top:4px">{esc(explain)}</div></div>{controls_for(state, h)}</div></div>')
    # The field statements behind this hypothesis — with a link back to the highlighted note.
    claims = [c for c in state["claims"] if c["id"] in h["field"]["claim_ids"]]
    if claims:
        rows = "".join(f'<tr><td class="mono"><a href="{"/notes" if web else ""}#{esc(c["doc_id"])}">{esc(c["doc_id"])}</a><br><span class="faint">{esc(c["hcp_ref"])}</span></td>'
                       f'<td><span class="q">“{esc(c["quote"])}”</span> <span class="faint mono">@{c["char_start"]}–{c["char_end"]}</span></td><td class="faint">{esc(c["note_ko"])}</td></tr>' for c in claims)
        p.append(f'<h2>현장 발언 — 이 가설의 출발점</h2><div class="faint">{tag("fact")}{len(claims)}회 / {h["field"]["hcps"]}인. 인용은 원문에서 코드가 찾은 것만 (위치 표기).</div>'
                 f'<table><tr><th>기록</th><th>인용 (원문 위치)</th><th>왜 이 칸인가</th></tr>{rows}</table>')
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
    notes = load_notes()
    notes_n = len(notes)
    parts = [f'<div class="eyebrow">{esc(contract["drug_ko"])} · 계약 {esc(contract["version"])} · 정적 리포트</div>',
             '<h1>현장 신호가 근거를 지나 실행이 되기까지</h1>',
             '<p class="sub">모든 면담 기록은 합성. 숫자는 전부 코드가 계산. 인용은 원문 위치가 확인된 것만.</p>',
             pipeline_strip(state, notes_n), demo_card(state, contract, notes_n, web=False),
             '<h2 id="notes">면담 기록 (입력) — 추출된 발언을 원문 위에 표시</h2>', note_cards(state, notes, web=False),
             "<h2>가설</h2>", hyp_table(state, link=False)]
    for h in state["hypotheses"]:
        parts.append(f'<div id="{esc(h["id"])}" style="margin-top:40px;border-top:1px solid var(--line-2);padding-top:20px"></div>')
        parts.append(hypothesis_section(state, contract, h, web=False))
    if state["actions"]:
        parts.append("<h2>다음 면담 체크리스트</h2><table><tr><th>항목</th><th>질문</th><th>이유</th><th>승인</th></tr>" + "".join(
            f'<tr><td class="mono">{esc(a["id"])}</td><td><b>{esc(a["question_ko"])}</b></td><td class="faint">{esc(a["why_ko"])}</td><td class="faint">{esc(a["approved_by"])} · {esc(a["approved_at"])}</td></tr>'
            for a in state["actions"]) + "</table>")
    return shell("리포트", "\n".join(parts), "/", static=True)
