#!/usr/bin/env bash
# 코퍼스가 바뀐 뒤 처음부터 다시: 결과 초기화 → 추출(병렬) → 가설 → 모든 가설 근거 교차검증.
# 심의·서명·결정은 사람이 고르는 단계라 여기 넣지 않는다 (scripts/demo.sh 또는 콘솔에서).
set -e
cd "$(dirname "$0")/.."
bash scripts/reset.sh
echo "== sense"; uv run python -m loop.cli sense
echo "== hypotheses"; uv run python -m loop.cli hypotheses
for h in $(uv run python -c "from loop import store; print(' '.join(x['id'] for x in store.load()['hypotheses']))"); do
  echo "== screen $h"; uv run python -m loop.cli screen "$h" | grep -E "^\[사실\]|^\[패턴\]" | cut -c1-200
done
uv run python -m loop.cli status
