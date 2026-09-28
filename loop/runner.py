"""Background runners shared by the web console and the compat API — one board or screen at a time."""
from __future__ import annotations

import threading
import traceback

from . import board, live, screen, store

SCREENING: set[str] = set()   # hypotheses whose evidence screen is running right now
LAST = {"msg": ""}


def start_board(hyp: str) -> None:
    """Run the meeting in a thread; every turn is written to the live file the pages poll."""
    def job():
        def on_turn(turn, meeting):
            live.write(hyp, "RUNNING", meeting.turns)
        try:
            live.write(hyp, "RUNNING", [])
            m = board.deliberate(store.load(), hyp, on_turn=on_turn)
            live.write(hyp, "DONE", m["transcript"])
            LAST["msg"] = (f"④ 심의 종료 — {hyp} 참석 {len(m['attendees'])}인 · 발언 {len(m['transcript'])}턴 · 권고 {m['recommendation']} · "
                           f"경로 {m['route']} · 후속 질문 {len(m['follow_up_questions'])}개")
        except SystemExit as e:
            live.write(hyp, "ERROR", [], error=str(e))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            live.write(hyp, "ERROR", [], error=f"{type(e).__name__}: {str(e)[:300]}")
    threading.Thread(target=job, daemon=True, name=f"board-{hyp}").start()


def start_screen(hyp: str) -> None:
    """Run the evidence screen in a thread; the compat status reads SCREENING while it runs."""
    if hyp in SCREENING:
        return

    def job():
        try:
            SCREENING.add(hyp)
            screen.run(store.load(), hyp, store.contract())
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        finally:
            SCREENING.discard(hyp)
    threading.Thread(target=job, daemon=True, name=f"screen-{hyp}").start()
