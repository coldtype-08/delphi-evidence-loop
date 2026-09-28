"""External evidence sources — public APIs only, every response cached on disk.

Two rules that the rest of the loop depends on:
1. Every number a human sees is computed here in code, never asked from the model.
2. Every record carries `as_of` (fetch date) and a stable `id`/`url` so a claim can point back to it.
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"
USER_AGENT = "nim-evidence-loop/0.1 (research demo)"


def cached_get(source: str, url: str, params: dict | None = None, *,
               ttl_days: int = 30, timeout: float = 40.0) -> dict:
    """GET with a disk cache keyed by (url, params). Returns {url, params, fetched_at, as_of, body}.

    Non-JSON bodies (PubMed efetch XML) are stored as {"text": ...}.
    """
    key = hashlib.sha256(json.dumps([url, params], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:24]
    path = CACHE_DIR / source / f"{key}.json"
    if path.exists():
        rec = json.loads(path.read_text())
        if time.time() - rec["fetched_at"] < ttl_days * 86400:
            return rec
    verify = os.environ.get("SSL_CERT_FILE") or True   # corporate proxies: point at the root bundle
    with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT},
                      follow_redirects=True, verify=verify) as client:
        resp = client.get(url, params=params)
        resp.raise_for_status()
        try:
            body = resp.json()
        except ValueError:
            body = {"text": resp.text}
    rec = {"url": url, "params": params, "fetched_at": time.time(),
           "as_of": time.strftime("%Y-%m-%d"), "body": body}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rec, ensure_ascii=False))
    return rec
