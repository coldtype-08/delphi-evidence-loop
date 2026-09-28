"""The single wrapper every model call goes through — NVIDIA NIM (OpenAI-compatible), Nemotron.

Three rules the rest of the loop relies on:
1. Structured output only (JSON schema, validated). The model selects and quotes; code counts and verifies.
2. Every call is cached on disk — same input, same output, no second API call — and logged to
   data/llm_runs.jsonl (purpose, model, token usage, cache hit). A value that was not logged cannot be audited.
3. The key never leaves the host: read from .env, never written to logs or cache.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "data" / "llm_cache"
RUNS_LOG = ROOT / "data" / "llm_runs.jsonl"
BASE_URL = os.environ.get("NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
DEFAULT_MODEL = os.environ.get("NIM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b")  # Korean is officially supported
ENV_FILES = [ROOT / ".env"]


class LlmUnavailable(RuntimeError):
    pass


def load_env() -> None:
    for path in ENV_FILES:
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def api_key() -> str:
    load_env()
    key = os.environ.get("NVIDIA_API_KEY")
    if not key:
        raise LlmUnavailable("NVIDIA_API_KEY 가 없습니다 — build.nvidia.com 에서 발급(무료)해 .env 에 넣으세요. "
                             "캐시된 응답이 있으면 키 없이도 재생됩니다.")
    return key


def _client():
    from openai import OpenAI  # lazy: replaying from cache needs no SDK
    return OpenAI(base_url=BASE_URL, api_key=api_key())


def _cache_key(*parts) -> str:
    return hashlib.sha256(json.dumps(parts, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]


def _log(**rec) -> None:
    RUNS_LOG.parent.mkdir(parents=True, exist_ok=True)
    with RUNS_LOG.open("a") as f:
        f.write(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), **rec}, ensure_ascii=False) + "\n")


def call_structured(purpose: str, *, system: str, user: str, schema_name: str, schema: dict,
                    model: str | None = None, max_tokens: int = 4096, temperature: float = 0.2,
                    force: bool = False, thinking: bool | None = None) -> dict:
    """Return a dict that validates against `schema`, from cache if the same input was seen before.

    `thinking` switches Nemotron's reasoning mode per call (None = model default). The board deliberation
    turns it on; extraction steps that only select and quote do not need it. The reasoning text is kept
    in the cache record for audit — it is never shown as a result and never counted as evidence.
    """
    model = model or DEFAULT_MODEL
    key = _cache_key(purpose, model, system, user, schema_name, schema, *([thinking] if thinking is not None else []))
    path = CACHE_DIR / f"{key}.json"
    t0 = time.time()
    if path.exists() and not force:
        rec = json.loads(path.read_text())
        _log(purpose=purpose, model=model, key=key, cached=True, usage=rec.get("usage"),
             ms=int((time.time() - t0) * 1000))
        return rec["output"]

    output = usage = mode = reasoning = None
    for attempt in range(4):   # the free endpoint rate-limits bursts; parallel board turns hit it
        try:
            output, usage, mode, reasoning = _call(model, system, user, schema_name, schema, max_tokens, temperature, thinking)
            jsonschema.validate(output, schema)  # invalid output is an error, never a cached result
            break
        except (jsonschema.ValidationError, RuntimeError, ValueError) as e:
            if attempt == 3:
                raise
            time.sleep(5)
            _log(purpose=purpose, model=model, key=key, retry=attempt + 1, reason=f"{type(e).__name__}: {str(e)[:120]}")
        except Exception as e:  # noqa: BLE001 — 429 / 5xx from the API
            if attempt == 3 or not any(code in str(e) for code in ("429", "500", "502", "503", "504", "timeout", "Timeout")):
                raise
            time.sleep(10 * (attempt + 1))
            _log(purpose=purpose, model=model, key=key, retry=attempt + 1, reason=f"{type(e).__name__}: {str(e)[:120]}")
    rec = {"purpose": purpose, "model": model, "schema_name": schema_name, "mode": mode, "thinking": thinking,
           "usage": usage, "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "output": output,
           "reasoning": reasoning}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
    _log(purpose=purpose, model=model, key=key, cached=False, mode=mode, thinking=thinking, usage=usage,
         reasoning_chars=len(reasoning or ""), ms=int((time.time() - t0) * 1000))
    return output


def _usage(resp) -> dict:
    u = getattr(resp, "usage", None)
    return {"input": getattr(u, "prompt_tokens", None), "output": getattr(u, "completion_tokens", None)}


def _reasoning(msg) -> str | None:
    return getattr(msg, "reasoning_content", None) or getattr(msg, "reasoning", None)


def _call(model, system, user, schema_name, schema, max_tokens, temperature, thinking):
    client = _client()
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    # Nemotron reasoning mode is a chat-template switch, passed through the OpenAI-compatible API.
    extra = {"extra_body": {"chat_template_kwargs": {"enable_thinking": thinking}}} if thinking is not None else {}
    # Path A — forced function call: the schema is the function's parameters.
    tool_error = None
    try:
        resp = client.chat.completions.create(
            model=model, messages=messages, max_tokens=max_tokens, temperature=temperature,
            tools=[{"type": "function", "function": {
                "name": schema_name, "description": "Return the result in this schema only.",
                "parameters": schema}}],
            tool_choice={"type": "function", "function": {"name": schema_name}}, **extra,
        )
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            raise RuntimeError(f"응답이 max_tokens({max_tokens})에 잘렸습니다")
        if choice.message.tool_calls:
            return (json.loads(choice.message.tool_calls[0].function.arguments), _usage(resp), "tool_call",
                    _reasoning(choice.message))
        tool_error = "no tool_call in response"
    except Exception as e:  # noqa: BLE001 — fall through to path B with the reason recorded
        tool_error = f"{type(e).__name__}: {str(e)[:160]}"

    # Path B — JSON mode with the schema spelled out in the prompt.
    sys_b = system + "\n\nReturn ONLY a JSON object that conforms to this JSON schema, nothing else:\n" + json.dumps(schema)
    resp = client.chat.completions.create(
        model=model, messages=[{"role": "system", "content": sys_b}, {"role": "user", "content": user}],
        max_tokens=max_tokens, temperature=temperature, response_format={"type": "json_object"}, **extra,
    )
    choice = resp.choices[0]
    if choice.finish_reason == "length":
        raise RuntimeError(f"응답이 max_tokens({max_tokens})에 잘렸습니다")
    return (_extract_json(choice.message.content or ""), _usage(resp),
            f"json_object (tool path: {tool_error})", _reasoning(choice.message))


def _extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.S)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError(f"JSON 이 없습니다: {text[:200]!r}")
    return json.loads(text[start:end + 1])
