"""Design language — tokens and shell shared by the web console and the static report.

Warm off-white ground, white cards on hairlines, navy ink. Orange is reserved for one meaning:
it is a person's turn. Every line of judgement carries one of five level tags.
"""
from __future__ import annotations

import html

LEVEL = {"fact": "사실", "pattern": "패턴", "interp": "해석", "proposal": "제안", "action": "실행"}
STANCE = {"SUPPORTS": ("지지", "support"), "CONTRADICTS": ("반대", "oppose"), "NEUTRAL": ("중립", "hold")}
STATUS_KO = {"DRAFT": "초안", "SCREENED": "근거 수집됨", "REVIEWED": "서명됨", "DELIBERATED": "심의됨"}
NAV = [("/", "개요"), ("/notes", "면담 기록"), ("/claims", "발언 카드"), ("/hypotheses", "가설"), ("/checklist", "체크리스트")]
SIGNAL_KO = {
    "OFF_LABEL_DEMAND": "쓰고 싶은데 막혔다", "OFF_LABEL_USE": "써봤다 · 반응 보고", "REPURPOSING": "다른 쓰임",
    "UNMET_NEED": "충족되지 않은 필요", "DOSING": "용량 · 제형", "SAFETY_TOLERABILITY": "안전성 · 내약성",
}


def signal(code: str) -> str:
    """Code + Korean gloss, so a reader never has to decode OFF_LABEL_DEMAND."""
    ko = SIGNAL_KO.get(code)
    return f'{esc(code)} <span class="faint">({esc(ko)})</span>' if ko else esc(code)


def highlight(text: str, spans: list[tuple[int, int, str, str]]) -> str:
    """Escape `text` and wrap verified spans in <mark>. spans: (start, end, css_class, title). Overlaps are skipped."""
    out, pos = [], 0
    for start, end, cls, title in sorted(spans):
        if start is None or start < pos:
            continue
        out.append(esc(text[pos:start]))
        out.append(f'<mark class="{cls}" title="{esc(title)}">{esc(text[start:end])}</mark>')
        pos = end
    out.append(esc(text[pos:]))
    return "".join(out)

CSS = """
:root{--paper:#FCFCFA;--card:#FFFFFF;--fill-1:rgba(22,38,97,.028);--fill-2:rgba(22,38,97,.052);
--ink:#162661;--navy:#162661;--body:#3F444E;--muted:#5F646E;--faint:#666B75;--line:#E7E4DE;--line-2:#D9D4C7;
--orange:#EF8B1C;--orange-soft:rgba(239,139,28,.22);--orange-bright:#F5A542;
--rust:#B2453C;--rust-soft:rgba(178,69,60,.12);--green:#2A7F5F;--green-soft:rgba(42,127,95,.13);--hold:#B3762A;--hold-soft:rgba(179,118,42,.14);
--on-navy:#FCFCFA;--on-navy-2:rgba(252,252,250,.86);--on-navy-3:rgba(252,252,250,.55);
--shadow:0 1px 2px rgba(28,24,14,.04);--radius:8px;
--fs-display:2.6rem;--fs-h1:1.5rem;--fs-h2:1.0625rem;--fs-body:.9375rem;--fs-sm:.875rem;--fs-xs:.8125rem;--fs-2xs:.75rem}
*{box-sizing:border-box}
html{background:var(--paper)}
body{margin:0;color:var(--body);font-family:"IBM Plex Sans KR","Noto Sans KR",-apple-system,sans-serif;font-size:var(--fs-body);line-height:1.6;word-break:keep-all;overflow-wrap:break-word}
a{color:var(--ink);text-decoration:none}a:hover{text-decoration:underline}
.num,.n{font-family:Manrope,"IBM Plex Sans KR",sans-serif;font-variant-numeric:tabular-nums}
code,.mono{font-family:"Noto Sans Mono",ui-monospace,monospace;font-size:var(--fs-xs)}
.app{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
.side{border-right:1px solid var(--line);padding:22px 18px;position:sticky;top:0;height:100vh}
.brand{font-family:Manrope,sans-serif;font-weight:800;font-size:1.25rem;color:var(--ink);letter-spacing:-.01em}
.brand small{display:block;font-family:"IBM Plex Sans KR",sans-serif;font-weight:400;font-size:var(--fs-2xs);color:var(--faint);letter-spacing:0;margin-top:2px}
.nav{margin-top:26px;display:flex;flex-direction:column;gap:2px}
.nav a{padding:7px 10px;border-radius:6px;color:var(--body);font-size:var(--fs-sm)}
.nav a.on{background:var(--fill-2);color:var(--ink);font-weight:600}
.nav a:hover{background:var(--fill-1);text-decoration:none}
.side .foot{position:absolute;bottom:20px;left:18px;right:18px;font-size:var(--fs-2xs);color:var(--faint);line-height:1.5}
main{padding:28px 32px 80px;max-width:1120px}
.eyebrow{font-size:var(--fs-2xs);color:var(--faint);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
h1{font-size:var(--fs-h1);color:var(--ink);margin:2px 0 4px;font-weight:700;letter-spacing:-.01em}
h2{font-size:var(--fs-h2);color:var(--ink);margin:30px 0 10px;font-weight:700}
h3{font-size:var(--fs-body);color:var(--ink);margin:18px 0 8px;font-weight:700}
.sub{color:var(--muted);font-size:var(--fs-sm)}.faint{color:var(--faint);font-size:var(--fs-xs)}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px;margin:10px 0}
.card.navy{background:var(--navy);color:var(--on-navy-2);border-color:var(--navy)}.card.navy b,.card.navy h3{color:var(--on-navy)}
.grid{display:grid;gap:12px}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}.g6{grid-template-columns:repeat(6,1fr)}
@media(max-width:860px){.app{grid-template-columns:1fr}.side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}.side .foot{position:static;margin-top:16px}.nav{flex-direction:row;flex-wrap:wrap}main{padding:20px 16px 60px}.g3,.g4,.g6{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:12px 14px}
.kpi b{display:block;font-family:Manrope,sans-serif;font-size:1.75rem;font-weight:800;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums}
.kpi span{font-size:var(--fs-2xs);color:var(--faint)}
.tag{display:inline-block;font-size:11px;line-height:1;font-weight:600;padding:3px 6px;border-radius:4px;border:1px solid var(--line-2);color:var(--muted);margin-right:6px;vertical-align:middle;background:var(--card)}
.chip{display:inline-block;font-size:var(--fs-2xs);font-weight:600;padding:2px 8px;border-radius:999px;margin-right:4px;line-height:1.6}
.chip.support{background:var(--green-soft);color:var(--green)}.chip.oppose{background:var(--rust-soft);color:var(--rust)}.chip.hold{background:var(--hold-soft);color:var(--hold)}
.chip.st{background:var(--fill-2);color:var(--ink)}.chip.dev{background:var(--orange-soft);color:var(--ink)}.chip.turn{background:var(--orange);color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:var(--fs-sm)}th{font-size:var(--fs-2xs);color:var(--faint);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line-2);background:var(--fill-1)}
td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
.q{font-style:italic;color:var(--body)}.drop td{opacity:.6}
.strip{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow);overflow:hidden}
.strip div{padding:12px 14px;border-right:1px solid var(--line)}.strip div:last-child{border-right:0}
.strip .k{font-size:var(--fs-2xs);color:var(--faint);font-weight:600}.strip b{display:block;font-family:Manrope,sans-serif;font-size:1.4rem;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.2;margin:2px 0}
.strip .s{font-size:var(--fs-2xs);color:var(--muted)}.strip .turn .k::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--orange);margin-right:6px}
form{display:inline-block;margin:0}
.btn{display:inline-block;background:var(--navy);color:var(--on-navy);border:0;border-radius:6px;padding:7px 12px;font:inherit;font-size:var(--fs-xs);font-weight:600;cursor:pointer;margin:2px 6px 2px 0;transition:opacity .15s}
.btn:hover{opacity:.9}.btn.turn{background:var(--orange);color:var(--ink)}.btn.ghost{background:transparent;color:var(--muted);border:1px solid var(--line-2)}
input[type=text]{font:inherit;font-size:var(--fs-xs);padding:6px 9px;border:1px solid var(--line-2);border-radius:6px;background:var(--card);color:var(--body);margin:2px 6px 2px 0;min-width:150px}
input[type=text]:focus{outline:2px solid rgba(239,139,28,.55);outline-offset:1px}
.banner{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--orange);border-radius:var(--radius);padding:10px 14px;margin:12px 0;font-size:var(--fs-sm);white-space:pre-wrap}
.gate{border-left:4px solid var(--orange)}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}
.row .grow{flex:1;min-width:200px}
ul{margin:6px 0;padding-left:20px}li{margin:3px 0}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:var(--fs-2xs);color:var(--faint);margin-top:28px;padding-top:12px;border-top:1px solid var(--line)}
mark{background:var(--orange-soft);color:inherit;padding:0 2px;border-radius:3px}mark.ae{background:var(--rust-soft);text-decoration:underline dotted var(--rust)}mark.other{background:var(--fill-2)}
.note{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px 18px;margin:10px 0;line-height:1.85}
.note .meta{font-size:var(--fs-2xs);color:var(--faint);margin-bottom:6px}
.steps{counter-reset:s;list-style:none;padding:0;margin:8px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.steps li{counter-increment:s;background:var(--fill-1);border-radius:6px;padding:8px 10px;font-size:var(--fs-xs)}
.steps li::before{content:counter(s);display:inline-block;width:18px;height:18px;border-radius:50%;background:var(--navy);color:var(--on-navy);font-size:11px;text-align:center;line-height:18px;margin-right:6px;font-weight:700}
@media(max-width:860px){.steps{grid-template-columns:1fr}}
"""

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Noto+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">'


def esc(s) -> str:
    return html.escape(str(s if s is not None else ""))


def tag(level: str) -> str:
    return f'<span class="tag">{LEVEL[level]}</span>'


def chip(stance: str) -> str:
    ko, cls = STANCE[stance]
    return f'<span class="chip {cls}">{ko}</span>'


def status_chip(status: str) -> str:
    ko = STATUS_KO.get(status) or ("결정 · " + status.split(":", 1)[1] if status.startswith("DECIDED:") else status)
    return f'<span class="chip st">{esc(ko)}</span>'


def label_chip(label_status: str) -> str:
    return '<span class="chip dev">허가 범위 밖 · 전문조직 검토</span>' if label_status == "DEVELOPMENT" else '<span class="chip st">허가 범위 안</span>'


def button(label: str, action: str, hidden: dict | None = None, inputs: list[tuple[str, str]] | None = None,
           turn: bool = False, ghost: bool = False) -> str:
    h = "".join(f'<input type="hidden" name="{esc(k)}" value="{esc(v)}">' for k, v in (hidden or {}).items())
    i = "".join(f'<input type="text" name="{esc(n)}" placeholder="{esc(p)}"{" required" if not p.endswith("(선택)") else ""}>' for n, p in (inputs or []))
    cls = "btn" + (" turn" if turn else "") + (" ghost" if ghost else "")
    return f'<form method="post" action="{esc(action)}">{h}{i}<button class="{cls}">{esc(label)}</button></form>'


def shell(title: str, body: str, active: str = "/", banner: str = "", static: bool = False) -> str:
    nav = "" if static else '<nav class="nav">' + "".join(
        f'<a href="{href}" class="{"on" if href == active else ""}">{name}</a>' for href, name in NAV) + "</nav>"
    side = (f'<aside class="side"><div class="brand">DELPHi<small>근거 관문 루프 · Nemotron</small></div>{nav}'
            '<div class="foot">모델은 고르고 인용한다.<br>숫자는 코드가 센다.<br>관문은 사람이 지킨다.</div></aside>')
    ban = f'<div class="banner">{esc(banner)}</div>' if banner else ""
    legend = ('<div class="legend"><span>표기 5단계</span>' + "".join(f"<span>{tag(k)}{v}</span>" for k, v in
              [("fact", "관찰된 사실"), ("pattern", "통계적 패턴"), ("interp", "AI의 해석"), ("proposal", "전략적 제안"), ("action", "승인된 실행")])
              + '<span style="margin-left:auto">NVIDIA Nemotron 3 Ultra · NIM · PubMed · ClinicalTrials.gov · openFDA · CMS Part D</span></div>')
    return ('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(title)} — DELPHi</title>{FONTS}<style>{CSS}</style></head><body><div class="app">{side}'
            f'<main>{ban}{body}{legend}</main></div></body></html>')
