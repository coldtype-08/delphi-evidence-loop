#!/usr/bin/env bash
# 심의·결정 단계 — 사람이 고르는 가설만 돌린다.
#   BY=박건태 bash scripts/board_demo.sh HYP-003 HYP-001 HYP-004        # 서명 → 심의 (순차, 한 건 약 6분)
#   DECIDE="HYP-003:NO_GO HYP-001:CONDITIONAL_GO" bash scripts/board_demo.sh   # 결정만
set -e
cd "$(dirname "$0")/.."
BY="${BY:-검토자}"
for h in "$@"; do
  echo "== review $h"; uv run python -m loop.cli review "$h" --by "$BY" --note "외부 근거 검토 완료" | cut -c1-160
  echo "== board $h";  uv run python -m loop.cli board "$h" | grep -E "^\[사실\] 라벨|^\[패턴\] 최종|^\[사실\] 코드 차단|^\[제안\] 회의록" | cut -c1-220
done
for pair in $DECIDE; do
  h="${pair%%:*}"; v="${pair##*:}"
  echo "== decide $h $v"
  uv run python - "$h" "$v" "$BY" <<'EOF'
import sys
from loop import board, store
hid, verdict, by = sys.argv[1:4]
acts = board.approve(store.load(), hid, by, note=f"의장 판정 {verdict}", verdict=verdict)
print(f"{hid} → {verdict} · 액션 {len(acts)}건: " + " / ".join(a["question_ko"][:50] for a in acts))
EOF
done
uv run python -m loop.cli status
