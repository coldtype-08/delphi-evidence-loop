"""Render data/state.json as one static HTML page — for readers who will not run the CLI.
`uv run python scripts/report.py` → docs/report.html."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from loop import store  # noqa: E402
from loop.report import render  # noqa: E402

OUT = ROOT / "docs" / "report.html"

if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(render(store.load(), store.contract()))
    print(f"→ {OUT} ({OUT.stat().st_size // 1024} KB)")
