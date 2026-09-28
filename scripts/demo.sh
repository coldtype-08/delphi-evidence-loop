#!/usr/bin/env bash
# 데모 한 바퀴 — 녹화용. 각 단계 사이에서 멈추려면 STEP=1 bash scripts/demo.sh
set -e
cd "$(dirname "$0")/.."
BY="${BY:-검토자}"
pause() { [ -n "$STEP" ] && read -rp "⏎ 다음 단계" || true; }
run() { echo; echo "\$ $*"; uv run python -m loop.cli "$@"; pause; }
run sense
run hypotheses
for h in HYP-001 HYP-002 HYP-003 HYP-004 HYP-005; do run screen "$h"; done
run review HYP-003 --by "$BY" --note "3상 무효 결과까지 읽음"
run board HYP-003
run approve HYP-003 --by "$BY"
run status
echo; echo "→ data/field_checklist.json"; cat data/field_checklist.json
