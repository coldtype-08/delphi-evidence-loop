"""Web console — the pages with the loop's controls. One process, one writer.

Every button runs the same code the CLI runs. The two human gates take a name; the name is what the
record keeps. Model steps replay from cache when the input is unchanged, so a demo click is instant
unless it is genuinely new work. The board runs in a background thread and streams its turns to the
meeting page; while it runs, other mutating actions are refused.
"""
from __future__ import annotations

import json
import threading
import traceback
from pathlib import Path

from fastapi import FastAPI, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import board, compat, intro, live, pages, runner, screen, sense, store

app = FastAPI(title="DELPHi — Evidence Loop")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=str(Path(__file__).resolve().parent / "static")), name="static")
app.include_router(compat.router)   # the original console's API, same paths and shapes
LAST = runner.LAST


@app.exception_handler(Exception)
async def _unhandled(request, exc):
    """JSON errors for the console (a bare 500 carries no CORS headers and the client only sees 'Failed to fetch')."""
    traceback.print_exc()
    return JSONResponse({"error": {"code": type(exc).__name__, "message_ko": f"서버 오류 — {str(exc)[:200]}"}}, status_code=500)


def _take_banner() -> str:
    msg, LAST["msg"] = LAST["msg"], ""
    return msg


def _do(label: str, fn, back: str = "/console"):
    busy = live.running()
    if busy:
        LAST["msg"] = f"{label} 보류 — {', '.join(busy)} 심의가 진행 중입니다. 끝날 때까지 다른 실행은 잠깁니다."
        return RedirectResponse(f"/hypotheses/{busy[0]}/board", status_code=303)
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


@app.get("/hypotheses/{hid}/board", response_class=HTMLResponse)
def hypothesis_board(hid: str):
    try:
        return HTMLResponse(pages.board_page(store.load(), store.contract(), hid, _take_banner(), live_rec=live.read(hid)))
    except SystemExit:
        return RedirectResponse("/hypotheses", status_code=303)


@app.get("/hypotheses/{hid}/board.json")
def hypothesis_board_json(hid: str, after: int = 0):
    """Snapshot for the streaming meeting page: turns after `after`, and the status."""
    rec = live.read(hid)
    if rec is None:
        memo = store.load()["board"].get(hid)
        if memo and "transcript" in memo:
            return JSONResponse({"status": "DONE", "turns": [t for t in memo["transcript"] if t["no"] > after], "total": len(memo["transcript"])})
        return JSONResponse({"status": "NONE", "turns": [], "total": 0})
    return JSONResponse({"status": rec["status"], "turns": [t for t in rec["turns"] if t["no"] > after],
                         "total": len(rec["turns"]), "error": rec.get("error"), "updated_at": rec["updated_at"]})


@app.get("/checklist", response_class=HTMLResponse)
def checklist():
    return HTMLResponse(pages.checklist_page(store.load(), store.contract(), _take_banner()))


@app.get("/health")
def health():
    st = store.load()
    return JSONResponse({"ok": True, "claims": len(st["claims"]), "hypotheses": len(st["hypotheses"]),
                         "screened": len(st["screens"]), "actions": len(st["actions"]), "board_running": live.running()})


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


_start_board = runner.start_board


@app.post("/run/board")
def run_board(hyp: str = Form(...)):
    busy = live.running()
    if busy:
        return RedirectResponse(f"/hypotheses/{busy[0]}/board", status_code=303)
    state = store.load()
    if hyp not in state["reviews"]:
        LAST["msg"] = f"④ 심의 거부 — {hyp}: 사람의 근거 검토 서명이 없습니다."
        return RedirectResponse(f"/hypotheses/{hyp}", status_code=303)
    live.clear(hyp)
    _start_board(hyp)
    return RedirectResponse(f"/hypotheses/{hyp}/board", status_code=303)


@app.post("/run/approve")
def run_approve(hyp: str = Form(...), by: str = Form(...)):
    def go():
        acts = board.approve(store.load(), hyp, by.strip())
        return f"{by.strip()} 결정 — {len(acts)}개 질문이 다음 면담 체크리스트에 들어갔다."
    return _do("⑤ 결정", go, f"/hypotheses/{hyp}")


@app.post("/run/reset")
def run_reset():
    def go():
        for p in (store.STATE, store.FIELD_CHECKLIST):
            p.unlink(missing_ok=True)
        for p in live.LIVE_DIR.glob("*.json") if live.LIVE_DIR.exists() else []:
            p.unlink(missing_ok=True)
        return "결과를 지웠다 (캐시는 유지)"
    return _do("초기화", go)
