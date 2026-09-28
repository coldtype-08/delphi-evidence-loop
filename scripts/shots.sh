#!/usr/bin/env bash
# 제출 문서용 캡처 — 로컬 콘솔(기본 3010)과 API(기본 8030)가 떠 있어야 한다.
#   HYP=HYP-003 BOARD=HYP-003 bash scripts/shots.sh
# 결과: docs/shots/{console_home,journey,hyp_detail,boardroom,boardroom_top,boardroom_verdict,checklist}.png
set -e
cd "$(dirname "$0")/.."
CONSOLE="${CONSOLE:-http://localhost:3010}"
API="${API:-http://localhost:8030}"
HYP="${HYP:?가설 ID (예: HYP-003)}"
BOARD="${BOARD:-$HYP}"
WAIT="${WAIT:-25}"
shot() { uv run --with websocket-client python scripts/shot_cdp.py "$1" "docs/shots/$2" "${3:-$WAIT}" 1280 "${4:-1400}"; }
mkdir -p docs/shots
shot "$CONSOLE/"                    console_home.png "$WAIT" 1100
shot "$CONSOLE/journey"             journey.png      "$WAIT" 1000
shot "$CONSOLE/hypotheses/$HYP"     hyp_detail.png   "$WAIT" 1300
shot "$CONSOLE/board/$BOARD"        boardroom.png    "$WAIT" 1400   # captureBeyondViewport → 전체 페이지
shot "$API/checklist"               checklist.png    5       700
H=$(sips -g pixelHeight docs/shots/boardroom.png | awk '/pixelHeight/{print $2}')
sips -c 2200 1280 --cropOffset 0 0 docs/shots/boardroom.png --out docs/shots/boardroom_top.png >/dev/null
sips -c 1500 1280 --cropOffset $((H - 1500)) 0 docs/shots/boardroom.png --out docs/shots/boardroom_verdict.png >/dev/null
echo "boardroom full height $H → top 2200 / verdict 1500"
ls -la docs/shots/*.png
