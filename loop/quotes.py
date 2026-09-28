"""Evidence pointers — a quote the model returns is only kept if code finds it verbatim in the source text."""
from __future__ import annotations

import re


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _squash(text: str) -> tuple[str, list[int]]:
    """Text with every whitespace removed (casefolded) + map from squashed index to original index."""
    chars, index = [], []
    for i, ch in enumerate(text):
        if not ch.isspace() and ch != "\\":   # sources escape "<" as "\<"; models don't
            folded = ch.casefold()             # may expand to several chars (ligatures, ß) — keep the map aligned
            chars.append(folded)
            index.extend([i] * len(folded))
    return "".join(chars), index


def locate(quote: str, text: str) -> tuple[int, int] | None:
    """(start, end) of `quote` inside `text`; None if absent.

    Whitespace is ignored on both sides (labels print "( 5.1 )" and "Vitamin B 12"; models tidy that up),
    case is ignored, and a quote with "..." is accepted only if every fragment is found in order —
    the span then covers first fragment start to last fragment end. Anything else is not a pointer.
    """
    fragments = [f for f in re.split(r"\.{3}|…", normalize(quote)) if len(f.strip()) >= 8]
    if not fragments:
        return None
    squashed, index = _squash(text)
    if not squashed:
        return None
    pos, start, end = 0, None, None
    for frag in fragments:
        needle = "".join(ch.casefold() for ch in frag if not ch.isspace() and ch != "\\")
        if len(needle) < 8:
            return None   # a fragment made of punctuation or too short to be a pointer
        j = squashed.find(needle, pos)
        if j < 0 and needle.endswith("."):
            # the model closed a clause with a period where the source goes on with "," or ";" —
            # the run is still verbatim, the period is the model's punctuation, not content
            needle = needle.rstrip(".")
            j = squashed.find(needle, pos)
        if j < 0:
            return None
        start = index[j] if start is None else start
        end = index[j + len(needle) - 1] + 1
        pos = j + len(needle)
    return (start, end)
