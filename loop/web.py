"""Web console — the pages with the loop's controls. One process, one writer.

Every button runs the same code the CLI runs. The two human gates take a name; the name is what the
record keeps. Model steps replay from cache when the input is unchanged, so a demo click is instant
unless it is genuinely new work.
"""
from __future__ import annotations

import json
import traceback

from pathlib import Path

from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import board, intro, pages, screen, sense, store

app = FastAPI(title="DELPHi — Evidence Loop")
app.mount("/static", StaticFiles(directory=str(Path(__file__).resolve().parent / "static")), name="static")
LAST = {"msg": ""}


def _take_banner() -> str:
    msg, LAST["msg"] = LAST["msg"], ""
    return msg


def _do(label: str, fn, back: str = "/console"):
    try:
        LAST["msg"] = f"{label}: {fn()}"
    except SystemExit as e:        # the gates refuse with SystemExit — show the reason, don't crash
        LAST["msg"] = f"{label} 거부 — {e}"
    except Exception as e:  # noqa: BLE001
        LAST["msg"] = f"{label} 실패 — {type(e).__name__}: {str(e)[:300]}"
        traceback.print_exc()
    return RedirectResponse(back, status_code=303)


@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse(intro.render(store.load(), store.contract()))


@app.get("/console", response_class=HTMLResponse)
def console():
    return HTMLResponse(pages.overview(store.load(), store.contract(), _take_banner()))


@app.get("/notes", response_class=HTMLResponse)
def notes():
    return HTMLResponse(pages.notes_page(store.load(), store.contract(), _take_banner()))


@app.get("/claims", response_class=HTMLResponse)
def claims():
    return HTMLResponse(pages.claims_page(store.load(), store.contract(), _take_banner()))


@app.get("/hypotheses", response_class=HTMLResponse)
def hypotheses():
    return HTMLResponse(pages.hypotheses_page(store.load(), store.contract(), _take_banner()))


@app.get("/hypotheses/{hid}", response_class=HTMLResponse)
def hypothesis(hid: str):
    try:
        return HTMLResponse(pages.hypothesis_page(store.load(), store.contract(), hid, _take_banner()))
    except SystemExit:
        return RedirectResponse("/hypotheses", status_code=303)


@app.get("/checklist", response_class=HTMLResponse)
def checklist():
    return HTMLResponse(pages.checklist_page(store.load(), store.contract(), _take_banner()))


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
    return _do("② 근거 교차검증", go, f"/hypotheses/{hyp}")


@app.post("/run/review")
def run_review(hyp: str = Form(...), by: str = Form(...), note: str = Form("")):
    def go():
        r = board.sign_review(store.load(), hyp, by.strip(), note.strip())
        return f"{r['by']} 이(가) {r['at']} 에 근거 {r['items_read']}건을 검토했다고 서명 — 심의 상정 가능"
    return _do("③ 서명", go, f"/hypotheses/{hyp}")


@app.post("/run/board")
def run_board(hyp: str = Form(...)):
    def go():
        m = board.deliberate(store.load(), hyp)
        return f"{hyp} 권고 {m['recommendation']} · 경로 {m['route']} · 후속 질문 {len(m['follow_up_questions'])}개"
    return _do("④ 심의", go, f"/hypotheses/{hyp}")


@app.post("/run/approve")
def run_approve(hyp: str = Form(...), by: str = Form(...)):
    def go():
        acts = board.approve(store.load(), hyp, by.strip())
        return f"{by.strip()} 결정 — {len(acts)}개 질문이 현장 체크리스트로 내려갔다. 루프가 닫혔다."
    return _do("⑤ 결정", go, f"/hypotheses/{hyp}")


@app.post("/run/reset")
def run_reset():
    def go():
        for p in (store.STATE, store.FIELD_CHECKLIST):
            p.unlink(missing_ok=True)
        return "결과를 지웠다 (캐시는 유지)"
    return _do("초기화", go)
