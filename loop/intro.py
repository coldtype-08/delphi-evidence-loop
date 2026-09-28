"""Product intro — the landing page. What this is, why, how the loop runs, where people stand.
Numbers on the page are live from state.json; the narrative is the product's."""
from __future__ import annotations

import json

from . import store
from .ui import CSS, FONTS, SIGNAL_KO, esc, tag

INTRO_CSS = """
.top{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;border-bottom:1px solid var(--line);background:var(--paper);position:sticky;top:0;z-index:2}
.top img{height:26px}.top .links a{margin-left:14px;font-size:var(--fs-sm)}
.wrap{max-width:1040px;margin:0 auto;padding:0 24px 80px}
.hero{padding:64px 0 28px}.hero h1{font-size:var(--fs-display);line-height:1.15;margin:8px 0 14px;letter-spacing:-.02em}
.hero p{font-size:1.0625rem;max-width:760px}
.cta{display:inline-block;background:var(--navy);color:var(--on-navy);border-radius:6px;padding:10px 16px;font-weight:600;margin:14px 10px 0 0}
.cta:hover{text-decoration:none;opacity:.92}.cta.ghost{background:transparent;color:var(--ink);border:1px solid var(--line-2)}
.sec{margin-top:56px}.sec h2{font-size:1.375rem;border:0;margin:0 0 6px}.sec .lead{color:var(--muted);max-width:760px}
.rail{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;padding:14px 0 6px}
.st{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px;position:relative;min-height:150px}
.st .no{font-family:Manrope,sans-serif;font-size:var(--fs-2xs);color:var(--faint);font-weight:700}
.st .who{position:absolute;top:10px;right:10px;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--fill-2);color:var(--ink)}
.st.human{border-color:var(--orange);box-shadow:0 0 0 2px var(--orange-soft)}.st.human .who{background:var(--orange);color:var(--ink)}
.st b.v{display:block;font-family:Manrope,sans-serif;font-size:1.5rem;color:var(--ink);margin:6px 0 2px;font-variant-numeric:tabular-nums}
.st .t{font-weight:700;color:var(--ink);font-size:var(--fs-sm)}.st .d{font-size:var(--fs-2xs);color:var(--muted);margin-top:4px;line-height:1.5}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:860px){.two{grid-template-columns:1fr}.hero h1{font-size:1.9rem}.top{padding:14px 16px}.wrap{padding:0 16px 60px}}
.rule{display:grid;grid-template-columns:32px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.rule .n{font-family:Manrope,sans-serif;font-weight:800;color:var(--orange);font-size:1.1rem}
.quote{border-left:4px solid var(--navy);padding:6px 14px;color:var(--ink);font-weight:600;margin:14px 0}
"""


def render(state: dict, contract: dict) -> str:
    notes_n = len(json.loads(store.FIELD_NOTES.read_text()))
    claims, sq, hyps = state["claims"], state["safety_queue"], state["hypotheses"]
    verified = sum(c["verified"] for c in claims)
    decided = [h for h in hyps if h["status"].startswith("DECIDED")]
    segs = " · ".join(esc(s) for s in contract["segments"])
    sigs = " · ".join(f"{esc(v)}" for v in SIGNAL_KO.values())
    thr = contract["threshold"]

    stages = [
        ("01", "면담 기록", "입력", notes_n, "담당자가 의료진을 만나고 남긴 기록. 자유 텍스트, 한국어. (데모는 합성)", False),
        ("02", "고정 헤더", "사람", f'{len(contract["segments"])}×{len(SIGNAL_KO)}', "회사가 이미 아는 질문 — 환자군과 신호 유형. AI가 발견할 대상이 아니라 요구사항.", True),
        ("03", "발언 카드", "AI+코드", f"{verified}/{len(claims)}", "Nemotron이 발언을 고르고 원문 그대로 인용. 코드가 원문에서 위치를 찾아 검증, 못 찾으면 버림. 유해사례는 별도 큐.", False),
        ("04", "신호 집계", "코드", f"{thr['min_mentions']}회·{thr['min_hcps']}인", "언급 수·독립 의료진 수는 코드가 센다. 문턱을 넘은 (환자군 × 신호)만 다음 단계로.", False),
        ("05", "가설", "AI", len(hyps), "문장과 외부 검색식은 모델이 쓴다. 문턱은 코드다.", False),
        ("06", "외부 근거", "AI+API", len(state["screens"]), "PubMed · CT.gov · FDA 라벨을 읽고 지지/반대/중립 + 인용. FAERS · Part D 수치는 그대로. RCT·3상 먼저.", False),
        ("07", "서명", "사람", len(state["reviews"]), "근거를 직접 읽었다고 이름으로 서명. 없으면 심의 불가. 반대가 많아도 올릴 수 있다.", True),
        ("08", "심의", "AI", len(state["board"]), "Nemotron 사고 모드. 권고 · 위험 · 다음 면담에서 물을 질문. 허가 밖이면 전문조직 검토로만.", False),
        ("09", "결정 → 체크리스트", "사람", len(state["actions"]), "권고를 받아들이면 질문이 다음 면담 체크리스트로. 루프가 닫힌다.", True),
    ]
    rail = "".join(
        f'<div class="st{" human" if human else ""}"><span class="no">{no}</span><span class="who">{esc(who)}</span>'
        f'<b class="v">{esc(v)}</b><div class="t">{esc(t)}</div><div class="d">{esc(d)}</div></div>'
        for no, t, who, v, d, human in stages)

    hyp003 = next((h for h in hyps if h["id"] == "HYP-003"), None)
    s3 = state["screens"].get("HYP-003")
    memo3 = state["board"].get("HYP-003")
    scene = ""
    if hyp003 and s3:
        t = s3["totals"]
        scene = (f'<div class="card"><div class="eyebrow">HYP-003 · {esc(hyp003["segment"])} × {esc(hyp003["signal_type"])}</div>'
                 f'<p>{tag("pattern")}현장 {hyp003["field"]["mentions"]}회 / {hyp003["field"]["hcps"]}인 — 언론 보도를 본 유방암 환자들이 보조요법으로 처방을 요청한다는 신호.</p>'
                 f'<p>{tag("fact")}외부 근거: 지지 {t["SUPPORTS"]} · <b>반대 {t["CONTRADICTS"]}</b> · 중립 {t["NEUTRAL"]}. 반대 근거에 대규모 3상 MA.32(NCT01101438, n=3,649)의 무효 결과가 있다. '
                 f'같은 시험이 등록부(CT.gov)에서는 «진지하게 시험됐다»는 지지로, 결과 논문에서는 반대로 잡힌다 — 등록과 결과는 다르다.</p>'
                 + (f'<p>{tag("proposal")}심의 권고 <b>{esc(memo3["recommendation"])}</b> — 근거 첫 줄이 MA.32다. 그리고 사람이 결정했다: {esc(memo3.get("decision", {}).get("by", ""))}.</p>' if memo3 else "")
                 + '<p class="faint">시스템은 도장이 아니다. 현장이 원해도 근거가 반대하면 그대로 보여주고, 판단은 사람에게 남긴다.</p>'
                 '<a class="cta ghost" href="/hypotheses/HYP-003">이 장면 열기 →</a></div>')

    body = f"""
<div class="top"><a href="/"><img src="/static/logo-navy.png" alt="DELPHi"></a>
<div class="links"><a href="/notes">면담 기록</a><a href="/console">콘솔</a><a href="https://github.com/coldtype-08/delphi-evidence-loop">GitHub</a><a class="cta" style="margin:0 0 0 14px;padding:7px 12px" href="/console">콘솔 열기 →</a></div></div>
<div class="wrap">
<div class="hero"><div class="eyebrow">DELPHi · 근거 관문이 있는 약물 신호 검증 에이전트 · NVIDIA Nemotron 3 Ultra (NIM)</div>
<h1>쌓여만 있던 면담 기록이<br>숫자가 됩니다</h1>
<p>제약 의학부가 의료진 면담에서 들은 말을 <b>셀 수 있는 신호</b>로 바꾸고, <b>공개 근거</b>로 확인하고, <b>사람이 결정한 것만</b> 다음 면담으로 넘기는 폐쇄 루프입니다.
모델은 고르고 인용하고, 숫자는 코드가 세고, 관문은 사람이 지킵니다.</p>
<a class="cta" href="/console">콘솔 열기 →</a><a class="cta ghost" href="/notes">입력(면담 기록)부터 보기</a>
<div class="grid g6" style="margin-top:26px">
<div class="kpi"><b>{notes_n}</b><span>면담 기록 (합성)</span></div><div class="kpi"><b>{verified}/{len(claims)}</b><span>발언 카드 · 원문 검증</span></div>
<div class="kpi"><b>{len(sq)}</b><span>유해사례 후보 분리</span></div><div class="kpi"><b>{len(hyps)}</b><span>가설 (문턱 통과)</span></div>
<div class="kpi"><b>{len(state["screens"])}</b><span>외부 근거 교차검증</span></div><div class="kpi"><b>{len(state["actions"])}</b><span>다음 면담 체크리스트</span></div></div></div>

<div class="sec"><h2>왜 만들었나</h2><p class="lead">의료진 면담 기록에는 「허가 밖에서 쓰고 싶은데 막혔다」 「써봤더니 이랬다」 「다른 용도로 쓴다」 같은 신호가 매일 쌓입니다. 문제는 하나가 아니라 셋입니다.</p>
<div class="two">
<div class="card"><b>셀 수 없다</b><p class="sub">한 문서만 보면 일화이고 열 문서를 세면 패턴인데, 세는 장치가 없어 몇 명이 몇 번 말했는지 아무도 모릅니다. 가설은 «어느 정도 쌓인 뒤» 나오는데, 얼마나 쌓였는지 자체가 안 보입니다.</p></div>
<div class="card"><b>요약은 근거가 아니다</b><p class="sub">의료·규제 영역에서 «AI가 요약한 결론»은 그 자체로 쓸 수 없습니다. 누가 언제 무슨 말을 했는지 원문까지 되짚을 수 없으면 어떤 판단에도 못 올립니다. LLM에 요약을 맡기면 숫자를 지어내고 근거 없는 주장이 섞입니다.</p></div>
<div class="card"><b>허가 밖 신호는 새면 안 된다</b><p class="sub">미승인 적응증·환자군의 수요는 전문조직 검토 대상이지 상업 활동의 재료가 아닙니다. «써봤다»와 «막혔다»는 규제상 전혀 다른 신호라 반드시 갈라야 합니다. 유해사례로 읽히는 발언은 처음부터 다른 길로 가야 합니다.</p></div>
<div class="card navy"><b>그래서 필요한 것</b><p style="color:var(--on-navy-2)">더 많이 아는 모델이 아니라, <b style="color:var(--on-navy)">모델이 못 하는 일을 코드와 사람이 막아 주는 구조</b>입니다. 모델은 고르고 인용만 합니다. 숫자는 코드가 셉니다. 인용은 원문에서 위치가 확인된 것만 남습니다. 사람은 두 곳에서 이름으로 서명합니다.</p></div>
</div></div>

<div class="sec"><h2>Fig. 01 — 분해도 · 면담 기록이 체크리스트가 되기까지</h2><p class="lead">아홉 칸 중 <span class="chip turn">사람</span>은 세 곳뿐입니다 — 처음(무엇을 셀지)과 끝(근거를 읽었다는 서명, 결정). 나머지는 사람을 기다리지 않습니다. 숫자는 지금 상태의 실측입니다.</p>
<div class="rail">{rail}</div>
<div class="quote">발언 카드는 승인 대상이 아닙니다. 사람이 손대는 것은 가설과 실행뿐입니다 — 그래서 검토량이 데이터량이 아니라 활용량에 비례합니다.</div></div>

<div class="sec"><h2>무엇을 세나 — 사람이 정한 고정 헤더</h2><p class="lead">회사가 이미 아는 질문은 사람이 쥐고, 모델은 그 칸에 발언을 넣을 뿐입니다. 담을 칸이 없으면 추출기는 가장 비슷해 보이는 칸에 밀어 넣습니다 — 그래서 축을 먼저 정합니다.</p>
<div class="two"><div class="card"><b>환자군 {len(contract["segments"])}</b><p class="sub">{segs}</p></div><div class="card"><b>신호 유형 {len(SIGNAL_KO)}</b><p class="sub">{sigs}</p></div></div></div>

<div class="sec"><h2>지키는 규칙 — 프롬프트가 아니라 코드가 강제</h2>
<div class="rule"><span class="n">1</span><div><b>숫자는 모델이 세지 않는다.</b> 언급 수 · 의료진 수 · 지지/반대 건수 · 시험 수 · 청구 건수는 전부 코드.</div></div>
<div class="rule"><span class="n">2</span><div><b>모든 인용에는 원문 위치가 있다.</b> 모델이 준 인용문을 원문에서 못 찾으면 «버림»으로 표시하고 세지 않는다. 지어낸 인용은 화면에 «버림»으로 남는다.</div></div>
<div class="rule"><span class="n">3</span><div><b>관문은 둘, 둘 다 이름이 남는다.</b> 근거 검토 서명이 없으면 심의가 거부되고, 결정이 없으면 실행 항목이 생기지 않는다.</div></div>
<div class="rule"><span class="n">4</span><div><b>허가 범위 밖 가설은 전문조직 검토로만.</b> 상업 액션을 제안하지 않는다. 유해사례 후보는 분석에 섞이지 않는다.</div></div>
<div class="rule"><span class="n">5</span><div><b>화면의 모든 판단 문장에 등급이 붙는다.</b> {tag("fact")}관찰된 사실 {tag("pattern")}통계적 패턴 {tag("interp")}AI의 해석 {tag("proposal")}전략적 제안 {tag("action")}승인된 실행</div></div></div>

<div class="sec"><h2>데모 장면 — 현장이 원해도 근거가 반대하면</h2><p class="lead">약은 메트포르민 — 특허가 만료된 지 오래고 특정 회사 소유가 아니며 공개 근거가 가장 두껍습니다. 면담 기록 {notes_n}건은 전부 합성입니다.</p>{scene}</div>

<div class="sec"><h2>NVIDIA 위에서</h2><div class="two">
<div class="card"><b>Nemotron 3 Ultra · NIM</b><p class="sub"><code>nvidia/nemotron-3-ultra-550b-a55b</code>, OpenAI 호환 API. 한국어 공식 지원. 강제 함수 호출로 JSON 스키마 출력만 받고 jsonschema로 검증. 심의 단계만 reasoning 모드를 켜고 추론은 감사용으로 보관. 모든 호출은 래퍼 한 곳 — 캐시 · 실행 로그(모델 · 토큰 · 캐시 적중).</p></div>
<div class="card"><b>Agent Skills · OpenShell</b><p class="sub"><code>skills/evidence-loop/SKILL.md</code> — 호환 에이전트가 이 루프를 도구로 호출. <code>sandbox/EGRESS.md</code> — deny-by-default 정책에 넣을 허용 호스트 5개(NIM + 공개 근거원 4). 이 루프의 외부 통신은 그게 전부다.</p></div></div>
<p style="margin-top:18px"><a class="cta" href="/console">콘솔 열기 →</a><a class="cta ghost" href="https://github.com/coldtype-08/delphi-evidence-loop">GitHub</a></p></div>
</div>"""
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>DELPHi — 근거 관문이 있는 약물 신호 검증 에이전트</title>{FONTS}<style>{CSS}{INTRO_CSS}</style></head><body>{body}</body></html>')
