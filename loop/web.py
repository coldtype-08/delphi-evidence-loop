"""Web console — the report page with the loop's controls on top. One process, one writer.

Every button runs the same code the CLI runs. The two human gates take a name; the name is what the
record keeps. Model steps replay from cache when the input is unchanged, so a demo click is instant
unless it is genuinely new work.
"""
from __future__ import annotations

import json
import traceback

from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

from . import board, screen, sense, store
from .report import esc, render

app = FastAPI(title="Evidence Loop")
LAST = {"msg": ""}


def _controls(state: dict, contract: dict) -> str:
    rows = []
    rows.append('<div class="row"><b>① 추출</b> <span class=sub>면담 기록 → 발언 카드(원문 검증) → 문턱 넘은 묶음 → 가설</span>'
                '<form method=post action=/run/sense><button>실행</button></form></div>')
    for h in state["hypotheses"]:
        hid, st = h["id"], h["status"]
        rows.append(f'<div class="row"><b><a href="#{esc(hid)}">{esc(hid)}</a></b> <span class=tag>{esc(st)}</span>'
                    f'<span class=sub>{esc(h["segment"])} × {esc(h["signal_type"])}</span>')
        if st == "DRAFT":
            rows.append(f'<form method=post action=/run/screen><input type=hidden name=hyp value="{esc(hid)}"><button>② 근거 교차검증</button></form>')
        elif st == "SCREENED":
            rows.append(f'<form method=post action=/run/review><input type=hidden name=hyp value="{esc(hid)}">'
                        f'<input type=text name=by placeholder="검토자 이름" required><input type=text name=note placeholder="메모 (선택)">'
                        f'<button>③ 근거를 직접 검토했습니다 — 서명</button></form>')
        elif st == "REVIEWED":
            rows.append(f'<form method=post action=/run/board><input type=hidden name=hyp value="{esc(hid)}"><button>④ 심의</button></form>')
        elif st == "DELIBERATED":
            rows.append(f'<form method=post action=/run/approve><input type=hidden name=hyp value="{esc(hid)}">'
                        f'<input type=text name=by placeholder="결정자 이름" required><button>⑤ 권고를 받아들임 — 체크리스트로</button></form>')
        else:
            rows.append('<span class=sub>완료 — 질문이 현장 체크리스트에 내려갔다</span>')
        rows.append('</div>')
    rows.append('<div class="row"><span class=sub>처음부터 (결과만 지움 · 캐시는 유지)</span>'
                '<form method=post action=/run/reset><button class=ghost>초기화</button></form></div>')
    return '<div class="card"><b>실행</b> <span class=sub>— 단계 순서는 코드가 지킨다. 서명 없이 심의로 갈 수 없고, 결정 없이 실행 항목이 생기지 않는다.</span>' + "".join(rows) + '</div>'


def _page() -> HTMLResponse:
    state, contract = store.load(), store.contract()
    return HTMLResponse(render(state, contract, controls=_controls(state, contract), banner=LAST["msg"]))


def _do(label: str, fn):
    try:
        LAST["msg"] = f"{label}: {fn()}"
    except SystemExit as e:        # the gates refuse with SystemExit — show the reason, don't crash
        LAST["msg"] = f"{label} 거부 — {e}"
    except Exception as e:  # noqa: BLE001
        LAST["msg"] = f"{label} 실패 — {type(e).__name__}: {str(e)[:300]}"
        traceback.print_exc()
    return RedirectResponse("/", status_code=303)


@app.get("/", response_class=HTMLResponse)
def index():
    return _page()


@app.get("/health")
def health():
    st = store.load()
    return JSONResponse({"ok": True, "claims": len(st["claims"]), "hypotheses": len(st["hypotheses"]),
                         "screened": len(st["screens"]), "actions": len(st["actions"])})


@app.get("/state.json")
def state_json():
    return JSONResponse(store.load())


@app.post("/run/sense")
def run_sense():
    def go():
        state, contract = store.load(), store.contract()
        notes = json.loads(store.FIELD_NOTES.read_text())
        st = sense.run(state, contract, notes)
        created = sense.draft_hypotheses(state, contract, contract["threshold"]["min_mentions"], contract["threshold"]["min_hcps"])
        return (f"면담 {st['docs']}건 · 인용 검증 통과 {st['kept']} · 버림 {st['dropped']} · 유해사례 후보 {st['adverse_events']}"
                f" → 새 가설 {len(created)}개")
    return _do("① 추출", go)


@app.post("/run/screen")
def run_screen(hyp: str = Form(...)):
    def go():
        s = screen.run(store.load(), hyp, store.contract())
        t = s["totals"]
        return f"{hyp} 지지 {t['SUPPORTS']} · 반대 {t['CONTRADICTS']} · 중립 {t['NEUTRAL']} · 버림 {len(s['dropped'])} · 라벨 {s['label_status']}"
    return _do("② 근거 교차검증", go)


@app.post("/run/review")
def run_review(hyp: str = Form(...), by: str = Form(...), note: str = Form("")):
    def go():
        r = board.sign_review(store.load(), hyp, by.strip(), note.strip())
        return f"{r['by']} 이(가) {r['at']} 에 근거 {r['items_read']}건을 검토했다고 서명 — 심의 상정 가능"
    return _do("③ 서명", go)


@app.post("/run/board")
def run_board(hyp: str = Form(...)):
    def go():
        m = board.deliberate(store.load(), hyp)
        return f"{hyp} 권고 {m['recommendation']} · 경로 {m['route']} · 후속 질문 {len(m['follow_up_questions'])}개"
    return _do("④ 심의", go)


@app.post("/run/approve")
def run_approve(hyp: str = Form(...), by: str = Form(...)):
    def go():
        acts = board.approve(store.load(), hyp, by.strip())
        return f"{by.strip()} 결정 — {len(acts)}개 질문이 현장 체크리스트로 내려갔다. 루프가 닫혔다."
    return _do("⑤ 결정", go)


@app.post("/run/reset")
def run_reset():
    def go():
        for p in (store.STATE, store.FIELD_CHECKLIST):
            p.unlink(missing_ok=True)
        return "결과를 지웠다 (캐시는 유지)"
    return _do("초기화", go)
