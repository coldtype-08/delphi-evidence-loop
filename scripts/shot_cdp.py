"""Full-page screenshot of a client-rendered page after it settles — drives headless Chrome over CDP.
`uv run --with websocket-client python scripts/shot_cdp.py URL OUT.png [wait_seconds] [width] [height]`"""
import base64
import json
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
url, out = sys.argv[1], sys.argv[2]
wait = float(sys.argv[3]) if len(sys.argv) > 3 else 30
width = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
height = int(sys.argv[5]) if len(sys.argv) > 5 else 1400
port = 9333
proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--remote-debugging-port={port}",
                         f"--window-size={width},{height}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try:
            targets = json.load(urllib.request.urlopen(f"http://localhost:{port}/json"))
            break
        except Exception:
            time.sleep(0.2)
    page = next(t for t in targets if t["type"] == "page")
    ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True)
    n = 0

    def send(method, params=None):
        global n
        n += 1
        ws.send(json.dumps({"id": n, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get("id") == n:
                return msg.get("result", {})

    send("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False})
    send("Page.enable")
    send("Page.navigate", {"url": url})
    time.sleep(wait)
    shot = send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})
    with open(out, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print(f"→ {out}")
finally:
    proc.terminate()
