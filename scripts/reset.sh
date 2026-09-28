#!/usr/bin/env bash
# 데모 상태 초기화 — 결과(state, checklist)만 지운다. 공개 API 캐시와 모델 응답 캐시는 남으므로
# 같은 입력이면 재실행이 API 호출 없이 즉시 재생된다.
cd "$(dirname "$0")/.."
rm -f data/state.json data/field_checklist.json
echo "reset: data/state.json, data/field_checklist.json 삭제 (캐시는 유지)"
