#!/usr/bin/env bash
# 데모 한 바퀴 — 녹화용. 각 단계 사이에서 멈추려면 STEP=1 bash scripts/demo.sh
# 결과가 이미 있는 저장소에서는 bash scripts/reset.sh 로 비운 뒤 돌린다 (approve 를 두 번 하면 액션이 두 배로 붙는다).
set -e
cd "$(dirname "$0")/.."
BY="${BY:-검토자}"
pause() { [ -n "$STEP" ] && read -rp "⏎ 다음 단계" || true; }
run() { echo; echo "\$ $*"; uv run python -m loop.cli "$@"; pause; }
run sense
run hypotheses
for h in $(uv run python -c "from loop import store; print(' '.join(x['id'] for x in store.load()['hypotheses']))"); do run screen "$h"; done
run review HYP-003 --by "$BY" --note "3상 무효 결과까지 읽음"
run board HYP-003
run approve HYP-003 --by "$BY"
run status
echo; echo "→ data/field_checklist.json"; cat data/field_checklist.json
