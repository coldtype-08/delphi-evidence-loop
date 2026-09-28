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
             "<li><b>④ 심의 → ⑤ 결정</b> — 임원 에이전트 7인이 토론하고 간사가 회의록을 쓴다. 결정하면 후속 질문이 체크리스트에 들어간다</li></ol>")
    return (f'<div class="card"><b>데모 안내</b> <span class="sub">— 의료진 면담 기록을 환자군 × 신호 유형으로 세고, 문턱을 넘은 조합을 공개 근거로 검증한 뒤, 사람이 서명·결정한 후속 질문을 다음 면담으로 보내는 과정을 실행해 볼 수 있다.</span>'
            f'<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">'
            f'<div><div class="eyebrow">입력</div>{esc(contract["drug_ko"])}에 관한 <b>합성 면담 기록 {notes_n}건</b> (가상 의료진 {notes_n}인 · 한국어 · 실제 인물·기관 없음). {notes_link}.'
            f'<div class="eyebrow" style="margin-top:10px">무엇을 뽑나 — 사람이 정한 고정 헤더</div><b>환자군 {len(contract["segments"])}</b>: {segs}<br><b>신호 유형 {len(SIGNAL_KO)}</b>:<ul style="margin:4px 0 0">{sigs}</ul>'
            f'<div class="faint" style="margin-top:6px">「써봤다」와 「막혔다」는 규제상 다른 신호이므로 구분한다. 유해사례로 읽히는 발언은 별도 경로로 보낸다.</div></div>'
            f'<div><div class="eyebrow">보는 순서 (5분)</div>{steps}'
            f'<div class="faint" style="margin-top:8px">같은 입력은 캐시에서 즉시 재생된다. 새 이름으로 서명해 심의하면 그때만 Nemotron이 실제로 돈다(임원 7인 병렬, 약 5분).</div>'
            f'<div class="faint" style="margin-top:4px"><b>확인할 것</b>: HYP-003에서 대규모 3상(MA.32, n=3,649) 무효 결과가 <span class="chip oppose">반대</span>로 표시되고, 심의 기록에서 임원들이 이를 인용한다.</div></div></div></div>')


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


def journey(state: dict, h: dict, web: bool = True) -> str:
    """신호의 여정 — one hypothesis from field statements to the checklist, with who and when at each step."""
    hid = h["id"]
    s, rev, memo = state["screens"].get(hid), state["reviews"].get(hid), state["board"].get(hid)
    dec = (memo or {}).get("decision")
    acts = [a for a in state["actions"] if a["hypothesis_id"] == hid]
    link = (lambda href, t: f'<a href="{href}">{t}</a>') if web else (lambda href, t: t)
    steps = [
        ("현장 발언", f'{h["field"]["mentions"]}회 · {h["field"]["hcps"]}인', "코드 집계", "done", None),
        ("가설", "DRAFT", h["created_at"][:16].replace("T", " "), "done", None),
        ("외부 근거", (f'지지 {s["totals"]["SUPPORTS"]} · 반대 {s["totals"]["CONTRADICTS"]} · 중립 {s["totals"]["NEUTRAL"]}' if s else "대기"),
         (s["ran_at"][:16].replace("T", " ") if s else "에이전트 차례"), "done" if s else "next", None),
        ("서명 · 관문 ①", (rev["by"] if rev else "대기"), (rev["at"][:16].replace("T", " ") if rev else "사람 차례"), "done" if rev else ("human" if s else "later"), None),
        ("심의 · AI Board", (f'{len(memo["transcript"])}턴 → {memo["recommendation"]}' if memo and "transcript" in memo else (memo["recommendation"] if memo else "대기")),
         (memo["deliberated_at"][:16].replace("T", " ") if memo else ("에이전트 차례" if rev else "")), "done" if memo else ("next" if rev else "later"),
         f"/hypotheses/{hid}/board" if memo and web else None),
        ("결정 · 관문 ②", (dec["by"] if dec else "대기"), (dec["at"][:16].replace("T", " ") if dec else ("사람 차례" if memo else "")), "done" if dec else ("human" if memo else "later"), None),
        ("체크리스트", f"{len(acts)}건" if acts else "—", "다음 면담이 참조" if acts else "", "done" if acts else "later", "/checklist" if acts and web else None),
    ]
    cells = []
    for name, value, when, cls, href in steps:
        v = link(href, esc(value)) if href else esc(value)
        cells.append(f'<div class="{cls}"><div class="k">{esc(name)}</div><b>{v}</b><div class="s">{esc(when)}</div></div>')
    return f'<div class="eyebrow" style="margin-top:14px">신호의 여정</div><div class="strip j">{"".join(cells)}</div>'


def controls_for(state: dict, h: dict) -> str:
    hid, st = h["id"], h["status"]
    if st == "DRAFT":
        return button("② 근거 교차검증 실행", "/run/screen", {"hyp": hid})
    if st == "SCREENED":
        return button("③ 외부 근거를 직접 검토했습니다 — 서명", "/run/review", {"hyp": hid},
                      [("by", "검토자 이름"), ("note", "메모 (선택)")], turn=True)
    if st == "REVIEWED":
        return button("④ 심의 실행 (AI Board · 임원 7인 + 간사)", "/run/board", {"hyp": hid})
    if st == "DELIBERATED":
        return button("⑤ 권고를 받아들입니다 — 결정", "/run/approve", {"hyp": hid}, [("by", "결정자 이름")], turn=True)
    return '<span class="faint">완료 — 질문이 다음 면담 체크리스트에 내려갔다</span>'


def tally_chips(s: dict | None) -> str:
    if not s:
        return '<span class="faint">아직 근거 없음</span>'
    t = s["totals"]
    return (f'<span class="chip support">지지 {t["SUPPORTS"]}</span><span class="chip oppose">반대 {t["CONTRADICTS"]}</span>'
            f'<span class="chip hold">중립 {t["NEUTRAL"]}</span><span class="faint">버림 {len(s["dropped"])}</span>')


def band(state: dict) -> str:
    """The processing line, compact — on top of every console page."""
    return pipeline_strip(state, len(load_notes()), mini=True)


def pipeline_strip(state: dict, notes_n: int, mini: bool = False) -> str:
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
    if mini:
        return '<div class="strip mini">' + "".join(
            f'<div class="{"turn" if turn else ""}"><span class="k">{esc(k)}</span><b>{esc(v)}</b></div>'
            for k, v, s, turn in cells) + "</div>"
    return '<div class="strip">' + "".join(
        f'<div class="{"turn" if turn else ""}"><div class="k">{esc(k)}</div><b>{esc(v)}</b><div class="s">{esc(s)}</div></div>'
        for k, v, s, turn in cells) + "</div>"


def signal_map(state: dict, contract: dict, web: bool = True) -> str:
    """Segment × signal tiles — width is mentions, tint is distinct HCPs, dashed is below threshold.
    Big-but-pale tiles are one or two people repeating themselves: the map exists to show that difference."""
    from .sense import tally
    rows = tally(state)
    if not rows:
        return '<p class="sub">아직 신호가 없다 — 추출을 실행하면 채워진다.</p>'
    thr = contract["threshold"]
    max_h = max(r["hcps"] for r in rows)
    hyp_by = {(h["segment"], h["signal_type"]): h["id"] for h in state["hypotheses"]}
    by_seg: dict[str, list] = {}
    for r in rows:
        by_seg.setdefault(r["segment"], []).append(r)
    out = ['<div class="smap">']
    for seg in contract["segments"]:
        cells = by_seg.get(seg)
        if not cells:
            continue
        tiles = []
        for c in sorted(cells, key=lambda x: -x["mentions"]):
            passed = c["mentions"] >= thr["min_mentions"] and c["hcps"] >= thr["min_hcps"]
            op = 0.45 + 0.55 * (c["hcps"] / max_h)
            label = f'<b>{c["mentions"]}</b>회 · {c["hcps"]}인 · {esc(SIGNAL_KO.get(c["signal_type"], c["signal_type"]))}'
            title = f'{seg} × {c["signal_type"]} — {c["mentions"]}회 · 독립 의료진 {c["hcps"]}인 · ' + ("문턱 충족" if passed else f'문턱 미달 (기준 {thr["min_mentions"]}회·{thr["min_hcps"]}인)')
            hid = hyp_by.get((seg, c["signal_type"]))
            style = f'flex:{c["mentions"]} 1 0;' + (f"opacity:{op:.2f}" if passed else "")
            if hid and web:
                tiles.append(f'<a class="tile" href="/hypotheses/{hid}" style="{style}" title="{esc(title)}">{label}</a>')
            else:
                tiles.append(f'<span class="tile{"" if passed else " below"}" style="{style}" title="{esc(title)}">{label}</span>')
        out.append(f'<div class="srow"><div class="seg">{esc(seg)}</div>{"".join(tiles)}</div>')
    out.append("</div>")
    near = [r for r in rows if not (r["mentions"] >= thr["min_mentions"] and r["hcps"] >= thr["min_hcps"])
            and (r["mentions"] >= thr["min_mentions"] - 1 or r["hcps"] >= thr["min_hcps"] - 1)]
    if near:
        out.append('<div class="faint" style="margin-top:8px">' + tag("pattern") + '<b>임계 근접</b> — ' +
                   " · ".join(f'{esc(r["segment"])} × {esc(SIGNAL_KO.get(r["signal_type"], r["signal_type"]))} {r["mentions"]}회/{r["hcps"]}인' for r in near) +
                   f'. 한 사람만 더 말하면 가설이 된다 — 다음 면담이 물어볼 자리.</div>')
    return "".join(out)


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
            '<h1>처리 현황</h1>',
            '<p class="sub">면담 기록에서 다음 면담 체크리스트까지의 처리 단계와 건수. 모든 면담 기록은 합성이다.</p>',
            pipeline_strip(state, notes_n), demo_card(state, contract, notes_n, web)]
    if web:
        body.append('<div class="card"><div class="row"><div class="grow"><b>① 추출</b> <span class="sub">면담 기록 12건을 Nemotron이 읽고 환자군 × 신호 유형에 해당하는 발언을 원문 그대로 인용한다. 코드가 인용을 원문에서 찾아 검증하고 세어, 문턱(3회·3인)을 넘은 조합을 가설로 만든다.</span></div>'
                    + button("① 추출 실행", "/run/sense") + '</div>'
                    '<div class="row"><div class="grow faint">결과만 지우고 처음부터 (캐시는 유지)</div>' + button("초기화", "/run/reset", ghost=True) + '</div></div>')
    body.append('<h2>신호 지도</h2><p class="sub">' + tag("pattern") + '칸 크기는 <b>반복 횟수</b>, 진하기는 <b>독립 의료진 수</b>다. 가설이 되려면 둘 다 문턱을 넘어야 한다. '
                '크지만 옅은 칸은 한두 사람이 반복한 것이다. 점선은 문턱 미달. 칸을 누르면 가설로 이동한다.</p>')
    body.append(signal_map(state, contract, web))
    body.append("<h2>가설</h2>")
    body.append(hyp_table(state))
    sq = state["safety_queue"]
    if sq:
        body.append(f'<div class="card" style="border-left:4px solid var(--rust)">{tag("fact")}<b>유해사례 후보 {len(sq)}건</b>이 safety 큐에 있다 — 분석 집계에 섞이지 않고 별도 경로로만 간다. <a href="/claims#safety">보기</a></div>')
    return shell("개요", "\n".join(body), "/console", banner)


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
    return shell("면담 기록", "\n".join(body), "/notes", banner, band=band(state))


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
    return shell("발언 카드", "\n".join(body), "/claims", banner, band=band(state))


def hypotheses_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    body = ['<div class="eyebrow">Hypotheses</div><h1>가설</h1>',
            f'<p class="sub">{tag("pattern")}언급 {contract["threshold"]["min_mentions"]}회 · 의료진 {contract["threshold"]["min_hcps"]}인을 넘은 (환자군 × 신호 유형) 묶음만 가설이 된다. 문턱은 코드다. 문장과 검색식은 모델이 쓴다.</p>',
            hyp_table(state)]
    return shell("가설", "\n".join(body), "/hypotheses", banner, band=band(state))


def hypothesis_section(state: dict, contract: dict, h: dict, web: bool = True) -> str:
    hid = h["id"]
    s = state["screens"].get(hid)
    who, what = next_step(state, h)
    p = [f'<div class="eyebrow">{esc(hid)}</div>',
         f'<h1>{esc(h["segment"])} × {esc(h["signal_type"])} <span class="sub" style="font-weight:400">({esc(SIGNAL_KO.get(h["signal_type"], ""))})</span></h1>',
         f'<div>{status_chip(h["status"])}{label_chip(h["label_status"])}' + (f'<span class="chip turn">사람 차례 · {esc(what)}</span>' if who == "human" else "") + "</div>",
         f'<div class="card">{tag("interp")}<b>{esc(h["statement_ko"])}</b><br><span class="sub">{esc(h["statement_en"])}</span>'
         f'<div class="faint" style="margin-top:8px">{tag("pattern")}현장 {h["field"]["mentions"]}회 / {h["field"]["hcps"]}인 · 검색식 <code>{esc(h["search"]["pubmed_query"])}</code> · CT.gov 조건 <code>{esc(h["search"]["ctgov_condition"])}</code></div></div>',
         journey(state, h, web)]
    explain = {
        "DRAFT": "누르면 에이전트가 검색식으로 PubMed · ClinicalTrials.gov · FDA 라벨을 읽고, 기록마다 지지/반대/중립을 원문 인용과 함께 표시한다. 건수는 코드가 센다.",
        "SCREENED": "아래 근거 표를 직접 읽었다는 서명이다. 이름이 기록에 남고, 서명이 있어야 심의로 갈 수 있다. 반대 근거가 많아도 상정할 수 있으며 판단은 검토자가 한다.",
        "REVIEWED": "누르면 AI Board가 열린다. 간사가 개회하고 임원 7인(CMO · RA · PV · R&D · CFO · CCO · CEO)이 모두발언 → 토론 → 최종 입장을 내며, 코드가 입장을 집계해 권고를 정하고 간사가 회의록을 쓴다. 약 5분.",
        "DELIBERATED": "권고를 받아들이면 회의록의 후속 질문이 다음 면담 체크리스트에 들어간다. 결정자 이름이 남는다.",
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
        p.append(board_section(memo, web))
    return "\n".join(p)


STANCE_KO = {"SUPPORT": ("지지", "support"), "HOLD": ("보류", "hold"), "OPPOSE": ("반대", "oppose")}


def _stance_chip(s: str) -> str:
    ko, cls = STANCE_KO.get(s, (s, "hold"))
    return f'<span class="chip {cls}">{ko}</span>'


def board_section(memo: dict, web: bool = True) -> str:
    """The meeting as a record: header, transcript, stance evolution, code tally, minutes, decision."""
    p = ["<h2>심의 — AI Board</h2>"]
    if "transcript" not in memo:   # memo from the single-call board (older state)
        p.append(f'<div class="card">{tag("proposal")}권고 <b>{esc(memo["recommendation"])}</b> — {esc(memo["rationale_ko"])}</div>')
        return "\n".join(p)
    t = memo["tally"]
    p.append(f'<div class="card">{tag("fact")}가설 유형 <b>{esc(memo["hypothesis_type"])}</b> · 주무 임원 <b>{esc(memo["lead_ko"])}</b> · 참석 {len(memo["attendees"])}인 · 발언 {len(memo["transcript"])}턴 · '
             f'라벨 판정 {esc(memo["label_status"])} → 경로 {esc(memo["route"])}</div>')
    # stance evolution
    rows = "".join(f'<tr><td>{esc(e["speaker_ko"])}{" <span class=faint>(주무)</span>" if e["speaker"] == memo["lead"] else ""}</td><td>{_stance_chip(e["opening"])}</td>'
                   f'<td>{_stance_chip(e["final"])}{" <span class=chip st>변경</span>" if e["changed"] else ""}</td><td class="n">{e["confidence"]}</td></tr>'
                   for e in memo["stance_evolution"])
    p.append('<div class="grid" style="grid-template-columns:1fr 1fr">'
             f'<div class="card"><b>{tag("pattern")}입장 변화 (모두발언 → 최종)</b><table><tr><th>참석자</th><th>모두발언</th><th>최종</th><th>확신 1–5</th></tr>{rows}</table></div>'
             f'<div class="card"><b>{tag("pattern")}집계 (코드 · 확신 가중, 주무 ×1.5)</b><table><tr><th>입장</th><th>인원</th><th>가중치</th></tr>'
             + "".join(f'<tr><td>{_stance_chip(s)}</td><td class="n">{t["counts"][s]}</td><td class="n">{t["weights"][s]:.1f}</td></tr>' for s in ("SUPPORT", "HOLD", "OPPOSE"))
             + f'</table><div style="margin-top:8px">{tag("proposal")}권고 <b>{esc(memo["recommendation"])}</b> <span class="faint">— 가중치가 가장 큰 입장을 코드가 권고로 옮긴다. 간사는 바꾸지 못한다.</span></div></div></div>')
    # transcript — same layout the streaming page draws, rendered server-side
    turns, last_phase = [], None
    for tr in memo["transcript"]:
        group = tr["phase"].split(" · ")[0]
        if group != last_phase:
            turns.append(f'<div class="divider">{esc(group)}</div>')
            last_phase = group
        m = PERSONA_SHORT.get(tr["speaker"], "간사")
        st = _stance_chip(tr["stance"]) if tr.get("stance") else ""
        chg = ' <span class="chip st">입장 변경</span>' if tr.get("stance_changed") else ""
        conf = f' <span class="faint">확신 {tr["confidence"]}</span>' if tr.get("confidence") else ""
        cited = "".join(f'<span class="cite">{esc(c.split("#")[0])}</span>' for c in tr.get("cited", []))
        dropped = f' <span class="faint">근거 목록에 없는 인용 {len(tr["cited_dropped"])}건 버림</span>' if tr.get("cited_dropped") else ""
        sentences = tr["utterance_ko"].strip()
        head, _, rest = sentences.partition(". ")
        body = f'<span class="lead">{esc(head)}.</span> {esc(rest)}' if rest else f'<span class="lead">{esc(sentences)}</span>'
        turns.append(f'<div class="turn"><div class="av {esc(tr["speaker"].lower())}">{esc(m)}</div><div><span class="who">{esc(tr["speaker_ko"])}</span><span class="ph">{esc(tr["phase"])}</span> {st}{chg}{conf}'
                     f'<div class="ut">{body}</div><div class="cites">{cited}{dropped}</div></div></div>')
    p.append(f'<h3>{tag("interp")}회의 기록 <span class="faint">— 첫 문장이 결론. 인용은 근거 표에 있는 ID만 인정.</span></h3><div class="room">{"".join(turns)}</div>')
    if memo.get("blocked_actions"):
        b = "".join(f'<li><b>{esc(x["speaker_ko"])}</b>: “{esc(x["action_ko"])}” — {esc(x["reason_ko"])}</li>' for x in memo["blocked_actions"])
        p.append(f'<div class="card" style="border-left:4px solid var(--rust)">{tag("fact")}<b>코드가 차단한 제안 {len(memo["blocked_actions"])}건</b><ul>{b}</ul></div>')
    # minutes
    qs = "".join(f'<li>{esc(q["question_ko"])} <span class="faint">— {esc(q["why_ko"])}</span></li>' for q in memo["follow_up_questions"])
    risks = "".join(f"<li>{esc(r)}</li>" for r in memo["risks_ko"])
    kills = "".join(f"<li>{esc(r)}</li>" for r in memo.get("kill_criteria_ko", []))
    p.append(f'<div class="card navy"><b>{tag("proposal")}회의록</b><div style="margin-top:6px">{esc(memo["summary_ko"])}</div>'
             f'<div style="margin-top:8px;color:var(--on-navy-2)">{tag("interp")}{esc(memo["evidence_summary_ko"])}</div>'
             f'<div style="margin-top:8px;color:var(--on-navy-2)">{tag("proposal")}권고 사유 — {esc(memo["rationale_ko"])}</div></div>')
    p.append('<div class="grid" style="grid-template-columns:1fr 1fr 1fr">'
             f'<div class="card"><b>{tag("proposal")}중단 기준</b><ul>{kills}</ul></div>'
             f'<div class="card"><b>{tag("proposal")}위험</b><ul>{risks}</ul></div>'
             f'<div class="card"><b>{tag("proposal")}다음 면담에서 물을 것</b><ul>{qs}</ul></div></div>')
    dec = memo.get("decision")
    if dec:
        p.append(f'<div class="card gate">{tag("action")}<b>관문 ② 결정</b> — <b>{esc(dec["by"])}</b> 이(가) {esc(dec["at"])} 에 권고 {esc(dec["accepted"])} 을 받아들였다. 후속 질문이 체크리스트로 내려갔다.</div>')
    return "\n".join(p)


def hypothesis_page(state: dict, contract: dict, hid: str, banner: str = "", web: bool = True) -> str:
    h = store.hypothesis(state, hid)
    return shell(hid, hypothesis_section(state, contract, h, web), "/hypotheses", banner, band=band(state))


PERSONA_SHORT = {"ORCHESTRATOR": "간사", "CMO": "CMO", "RA_HEAD": "RA", "PV_HEAD": "PV", "RND_HEAD": "R&D", "CFO": "CFO", "CCO": "CCO", "CEO": "CEO"}

ROOM_JS = """<script>
(function(){
const META=%(meta)s, EVID=%(evid)s, MODE=%(mode)s, TURNS=%(turns)s, HID=%(hid)s;
const room=document.getElementById('room'), liveEl=document.getElementById('live'), bar=document.getElementById('bar');
let speed=1, seen=0, lastPhase=null, playing=false, cancel=false;
const ST={SUPPORT:['지지','support'],HOLD:['보류','hold'],OPPOSE:['반대','oppose']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function cite(id){const base=id.split('#')[0];const q=EVID[id];const tip=q?'<div class=th>'+esc(base)+'</div>'+esc(q.stance)+' · “'+esc(q.quote.slice(0,220))+'”':'';return '<span class=cite'+(tip?' data-tip="'+tip.replace(/"/g,'&quot;')+'"':'')+'>'+esc(base)+'</span>';}
function el(t){const m=META[t.speaker]||{cls:'orchestrator',short:'간사'};const d=document.createElement('div');d.className='turn';
const st=t.stance?'<span class="chip '+ST[t.stance][1]+'">'+ST[t.stance][0]+'</span>':'';const chg=t.stance_changed?'<span class="chip st">입장 변경</span>':'';const conf=t.confidence?'<span class=faint> 확신 '+t.confidence+'</span>':'';
const cites=(t.cited||[]).map(cite).join('')+(t.cited_dropped&&t.cited_dropped.length?'<span class=faint> 근거 목록에 없는 인용 '+t.cited_dropped.length+'건 버림</span>':'');
d.innerHTML='<div class="av '+m.cls+'">'+esc(m.short)+'</div><div><span class=who>'+esc(t.speaker_ko)+'</span><span class=ph>'+esc(t.phase)+'</span> '+st+chg+conf+'<div class=ut><span class=txt></span></div><div class=cites>'+cites+'</div></div>';
return d;}
function divider(phase){const d=document.createElement('div');d.className='divider';d.textContent=phase.replace(/ · .*/,'');return d;}
function typeInto(span,text){return new Promise(res=>{const lead=text.indexOf('. ');let i=0;const step=Math.max(2,Math.round(3*speed));
span.classList.add('caret');const tick=()=>{if(cancel){span.innerHTML=fmt(text,lead);span.classList.remove('caret');return res();}
i=Math.min(text.length,i+step);span.innerHTML=fmt(text.slice(0,i),lead);if(i<text.length){setTimeout(tick,20/speed);}else{span.classList.remove('caret');res();}};tick();});}
function fmt(s,lead){if(lead>0&&s.length>lead)return '<span class=lead>'+esc(s.slice(0,lead+1))+'</span>'+esc(s.slice(lead+1));return '<span class=lead>'+esc(s)+'</span>';}
async function add(t,typed){const group=t.phase.replace(/ · .*/,'');if(group!==lastPhase){room.appendChild(divider(t.phase));lastPhase=group;}
const d=el(t);room.appendChild(d);d.scrollIntoView({block:'nearest',behavior:'smooth'});
if(typed){await typeInto(d.querySelector('.txt'),t.utterance_ko);await new Promise(r=>setTimeout(r,(700+Math.random()*400)/speed));}else{d.querySelector('.txt').innerHTML=fmt(t.utterance_ko,t.utterance_ko.indexOf('. '));}}
function setLive(msg){if(liveEl){liveEl.innerHTML=msg?'<span class=dot></span>'+esc(msg):'';}}
async function poll(){try{const r=await fetch('/hypotheses/'+HID+'/board.json?after='+seen);const j=await r.json();
for(const t of j.turns){setLive(t.speaker_ko+' 발언 중');await add(t,true);seen=t.no;}
if(j.status==='DONE'){setLive('회의록을 정리하는 중');setTimeout(()=>location.reload(),1200);return;}
if(j.status==='ERROR'){setLive('심의 중단 — '+(j.error||''));return;}
setLive(seen?'다음 발언을 기다리는 중':'간사가 개회를 준비하는 중');}catch(e){setLive('연결 재시도 중');}
setTimeout(poll,1200);}
async function replay(){if(playing)return;playing=true;cancel=false;room.innerHTML='';lastPhase=null;const rec=document.getElementById('record');if(rec)rec.style.display='none';
for(const t of TURNS){if(cancel)break;setLive(t.speaker_ko+' 발언 중');await add(t,true);}setLive('');playing=false;if(rec)rec.style.display='';}
if(bar){bar.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.speed){speed=+b.dataset.speed;bar.querySelectorAll('[data-speed]').forEach(x=>x.classList.toggle('on',x===b));}
if(b.dataset.act==='replay'){cancel=true;setTimeout(replay,50);}if(b.dataset.act==='skip'){cancel=true;}});}
if(MODE==='live'){poll();}
})();
</script>"""


def _room_js(memo: dict | None, hid: str, mode: str, screen: dict | None) -> str:
    meta = {k: {"cls": k.lower(), "short": v} for k, v in PERSONA_SHORT.items()}
    evid = {it["source_id"]: {"stance": {"SUPPORTS": "지지", "CONTRADICTS": "반대", "NEUTRAL": "중립"}[it["stance"]], "quote": it["quote"]}
            for it in (screen or {}).get("items", [])}
    turns = memo["transcript"] if memo and "transcript" in memo else []
    return ROOM_JS % {"meta": json.dumps(meta, ensure_ascii=False), "evid": json.dumps(evid, ensure_ascii=False),
                      "mode": json.dumps(mode), "turns": json.dumps(turns, ensure_ascii=False), "hid": json.dumps(hid)}


def board_page(state: dict, contract: dict, hid: str, banner: str = "", web: bool = True, live_rec: dict | None = None) -> str:
    """The meeting on its own page — live while it runs, replayable when it is done."""
    h = store.hypothesis(state, hid)
    memo = state["board"].get(hid)
    screen = state["screens"].get(hid)
    head = (f'<div class="eyebrow">{esc(hid)} · <a href="/hypotheses/{esc(hid)}">가설 상세로</a></div>'
            f'<h1>AI Board 회의 — {esc(h["segment"])} × {esc(h["signal_type"])}</h1>'
            f'<p class="sub">{tag("interp")}{esc(h["statement_ko"])}</p>')
    running = bool(live_rec and live_rec["status"] == "RUNNING")
    if running:
        n = len(live_rec["turns"])
        body = (head + journey(state, h, web) +
                f'<div class="card"><b>심의 진행 중</b> <span class="sub">— 간사 1 + 임원 7인. 발언이 생기는 대로 올라온다. 지금까지 {n}턴.</span>'
                '<div class="bar" id="bar"><span class="faint">속도</span><button class="btn sm on" data-speed="1">×1</button><button class="btn sm" data-speed="2">×2</button><button class="btn sm" data-speed="4">×4</button></div>'
                '<div class="room" id="room"></div><div class="live" id="live"><span class="dot"></span>간사가 개회를 준비하는 중</div></div>')
        return shell(f"{hid} 회의", body, "/hypotheses", banner, band=band(state), script=_room_js(None, hid, "live", screen))
    if memo and "transcript" in memo:
        ctrl = ('<div class="bar" id="bar"><button class="btn sm" data-act="replay">▶ 처음부터 재생</button><button class="btn sm ghost" data-act="skip">건너뛰기</button>'
                '<span class="faint">속도</span><button class="btn sm on" data-speed="1">×1</button><button class="btn sm" data-speed="2">×2</button><button class="btn sm" data-speed="4">×4</button>'
                f'<span class="sp">{len(memo["transcript"])}턴 · {esc(memo["deliberated_at"][:16].replace("T", " "))} · 실제 회의 기록을 재생한다 (모델 재호출 없음)</span></div>')
        body = (head + journey(state, h, web) + ctrl + '<div class="room" id="room"></div><div class="live" id="live"></div>'
                + f'<div id="record">{board_section(memo, web)}</div>')
        return shell(f"{hid} 회의 기록", body, "/hypotheses", banner, band=band(state), script=_room_js(memo, hid, "record", screen))
    err = f'<div class="banner">이전 심의가 중단됐다 — {esc(live_rec["error"])}</div>' if live_rec and live_rec.get("status") == "ERROR" else ""
    body = head + journey(state, h, web) + err + '<p class="sub">아직 심의 전이다. 가설 상세에서 서명 후 심의를 실행한다.</p>'
    return shell(f"{hid} 회의", body, "/hypotheses", banner, band=band(state))


def checklist_page(state: dict, contract: dict, banner: str = "", web: bool = True) -> str:
    acts = state["actions"]
    body = ['<div class="eyebrow">Field checklist</div><h1>다음 면담 체크리스트</h1>',
            f'<p class="sub">{tag("action")}사람이 받아들인 권고의 후속 질문. 다음 면담이 이 항목을 참조해 수집한다.</p>']
    if acts:
        body.append("<table><tr><th>항목</th><th>질문</th><th>이유</th><th>가설</th><th>승인</th></tr>")
        for a in acts:
            body.append(f'<tr><td class="mono">{esc(a["id"])}</td><td><b>{esc(a["question_ko"])}</b></td><td class="faint">{esc(a["why_ko"])}</td>'
                        f'<td><a href="/hypotheses/{esc(a["hypothesis_id"])}" class="mono">{esc(a["hypothesis_id"])}</a></td><td class="faint">{esc(a["approved_by"])}<br>{esc(a["approved_at"])}</td></tr>')
        body.append("</table>")
    else:
        body.append('<p class="sub">아직 없음 — 심의를 거쳐 사람이 결정하면 여기에 생긴다.</p>')
    return shell("체크리스트", "\n".join(body), "/checklist", banner, band=band(state))


def static_report(state: dict, contract: dict) -> str:
    """One page for readers who will not run anything: overview + every hypothesis + checklist."""
    notes = load_notes()
    notes_n = len(notes)
    parts = [f'<div class="eyebrow">{esc(contract["drug_ko"])} · 계약 {esc(contract["version"])} · 정적 리포트</div>',
             '<h1>현장 신호가 근거를 지나 실행이 되기까지</h1>',
             '<p class="sub">모든 면담 기록은 합성. 숫자는 전부 코드가 계산. 인용은 원문 위치가 확인된 것만.</p>',
             pipeline_strip(state, notes_n), demo_card(state, contract, notes_n, web=False),
             '<h2 id="notes">면담 기록 (입력) — 추출된 발언을 원문 위에 표시</h2>', note_cards(state, notes, web=False),
             "<h2>신호 지도</h2>", signal_map(state, contract, web=False),
             "<h2>가설</h2>", hyp_table(state, link=False)]
    for h in state["hypotheses"]:
        parts.append(f'<div id="{esc(h["id"])}" style="margin-top:40px;border-top:1px solid var(--line-2);padding-top:20px"></div>')
        parts.append(hypothesis_section(state, contract, h, web=False))
    if state["actions"]:
        parts.append("<h2>다음 면담 체크리스트</h2><table><tr><th>항목</th><th>질문</th><th>이유</th><th>승인</th></tr>" + "".join(
            f'<tr><td class="mono">{esc(a["id"])}</td><td><b>{esc(a["question_ko"])}</b></td><td class="faint">{esc(a["why_ko"])}</td><td class="faint">{esc(a["approved_by"])} · {esc(a["approved_at"])}</td></tr>'
            for a in state["actions"]) + "</table>")
    return shell("리포트", "\n".join(parts), "/", static=True)
