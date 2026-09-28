"""Live board state — turns are written here as they are produced so the web page can stream them.

Kept out of state.json on purpose: the meeting thread writes here alone, and the record only lands in
state.json when the meeting is over.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from . import store

LIVE_DIR = store.DATA / "board_live"


def path(hyp_id: str) -> Path:
    return LIVE_DIR / f"{hyp_id}.json"


def write(hyp_id: str, status: str, turns: list[dict], error: str | None = None) -> None:
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    rec = {"hypothesis_id": hyp_id, "status": status, "turns": turns, "error": error,
           "updated_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    tmp = path(hyp_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(rec, ensure_ascii=False))
    tmp.replace(path(hyp_id))   # atomic on POSIX — a reader never sees a half-written file


def read(hyp_id: str) -> dict | None:
    p = path(hyp_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except ValueError:
        return None


def running() -> list[str]:
    if not LIVE_DIR.exists():
        return []
    out = []
    for p in LIVE_DIR.glob("*.json"):
        rec = read(p.stem)
        if rec and rec["status"] == "RUNNING":
            out.append(rec["hypothesis_id"])
    return out


def clear(hyp_id: str) -> None:
    path(hyp_id).unlink(missing_ok=True)
