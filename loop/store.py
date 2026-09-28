"""One JSON file is the system of record for the demo: data/state.json.

Single writer: run one command at a time. Two concurrent commands each load, modify and save the whole
file, and the second save silently discards the first (learned the hard way on 2026-09-28)."""
from __future__ import annotations

import json
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
STATE = DATA / "state.json"
CONTRACT = DATA / "contract.json"
FIELD_NOTES = DATA / "field_notes.json"
FIELD_CHECKLIST = DATA / "field_checklist.json"
PROMPTS = ROOT / "loop" / "prompts"

EMPTY = {"claims": [], "safety_queue": [], "hypotheses": [], "screens": {},
         "reviews": {}, "board": {}, "actions": []}


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def load() -> dict:
    return json.loads(STATE.read_text()) if STATE.exists() else json.loads(json.dumps(EMPTY))


def save(state: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=1))


def contract() -> dict:
    """Fixed headers, decided by people: the drug, the patient segments, the signal types."""
    return json.loads(CONTRACT.read_text())


def prompt(name: str) -> str:
    return (PROMPTS / f"{name}.md").read_text()


def hypothesis(state: dict, hyp_id: str) -> dict:
    for h in state["hypotheses"]:
        if h["id"] == hyp_id:
            return h
    raise SystemExit(f"가설이 없습니다: {hyp_id}")
