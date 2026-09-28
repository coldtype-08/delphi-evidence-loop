"""Give every virtual HCP one US census region, deterministically (md5 of hcp_ref) → data/hcp_regions.json.

Kept outside field_notes.json on purpose: the extraction cache key hashes the whole note, so adding a field
there would invalidate every cached extraction. The region is synthetic like everything else in the corpus;
the console's tile map colours states with the region value only (no state-level numbers are invented).
`python3 scripts/assign_regions.py`"""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEIGHTS = [("SOUTH", 38), ("WEST", 25), ("MIDWEST", 20), ("NORTHEAST", 17)]   # roughly US population shares


def region_of(hcp_ref: str) -> str:
    x = int(hashlib.md5(hcp_ref.encode()).hexdigest(), 16) % 100
    acc = 0
    for region, w in WEIGHTS:
        acc += w
        if x < acc:
            return region
    return WEIGHTS[-1][0]


if __name__ == "__main__":
    refs = set()
    for name in ("field_notes.json", "field_notes.v420.json"):
        p = ROOT / "data" / name
        if p.exists():
            refs |= {n["hcp_ref"] for n in json.loads(p.read_text())}
    out = {r: region_of(r) for r in sorted(refs)}
    (ROOT / "data" / "hcp_regions.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(out)} HCPs → data/hcp_regions.json {dict(Counter(out.values()))}")
