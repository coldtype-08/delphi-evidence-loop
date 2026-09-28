#!/usr/bin/env bash
# 아직 근거 조사가 없는 가설만 순서대로 조사한다 (state.json 단일 기록자 — 심의와 동시에 돌리지 않는다).
set -e
cd "$(dirname "$0")/.."
for h in $(uv run python -c "from loop import store; s=store.load(); print(' '.join(x['id'] for x in s['hypotheses'] if x['id'] not in s['screens']))"); do
  echo "== screen $h"; uv run python -m loop.cli screen "$h" | grep -E "^\[사실\]|^\[패턴\]" | cut -c1-200
done
uv run python -m loop.cli status
