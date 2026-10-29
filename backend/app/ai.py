"""Raw-HTTP clients for Claude, Gemini, Imagen and OpenAI TTS.

The request bodies mirror the ones the n8n workflows sent, so model
behaviour is unchanged by the move to Python.
"""

import json
import logging
from typing import Any

import httpx

from .config import settings

log = logging.getLogger(__name__)

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

HAIKU = "claude-haiku-4-5-20251001"
SONNET = "claude-sonnet-4-6"
GEMINI_FLASH = "gemini-2.5-flash"
GEMINI_IMAGE = "gemini-2.5-flash-image"
IMAGEN = "imagen-4.0-generate-001"


class AIError(RuntimeError):
    """An upstream model call failed or returned something unusable."""


def _post(url: str, *, headers: dict, body: dict, timeout: float) -> httpx.Response:
    try:
        res = httpx.post(url, headers=headers, json=body, timeout=timeout)
    except httpx.HTTPError as e:
        raise AIError(f"{url.split('/')[2]}: {e}") from e
    if res.status_code >= 400:
        raise AIError(f"{url.split('/')[2]} {res.status_code}: {res.text[:500]}")
    return res


def _require(key: str, name: str) -> str:
    if not key:
        raise AIError(f"{name} is not set — add it to .env and restart the api container")
    return key


# ── Claude ────────────────────────────────────────────────────

def claude(*, model: str, system: str, content: str | list, max_tokens: int, timeout: float = 600) -> str:
    """Single-turn Messages call. Returns the first text block."""
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": system}],
        "messages": [{"role": "user", "content": content}],
    }
    res = _post(ANTHROPIC_URL, timeout=timeout, body=body, headers={
        "x-api-key": _require(settings.anthropic_api_key, "ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
    }).json()
    for block in res.get("content") or []:
        if block.get("type") == "text":
            return block.get("text", "")
    raise AIError(f"Claude returned no text: {json.dumps(res)[:300]}")


def image_block(b64: str, mime: str) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": mime or "image/png", "data": b64}}


def strip_fences(raw: str) -> str:
    txt = (raw or "").strip()
    if txt.startswith("```"):
        txt = txt[txt.find("\n") + 1:]
        if txt.endswith("```"):
            txt = txt[:-3]
        txt = txt.strip()
    return txt


def parse_json(raw: str) -> dict | None:
    """Parse a model's JSON reply, tolerating code fences and stray prose around the object."""
    txt = strip_fences(raw)
    try:
        val = json.loads(txt)
    except json.JSONDecodeError:
        start, end = txt.find("{"), txt.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            val = json.loads(txt[start:end + 1])
        except json.JSONDecodeError:
            return None
    return val if isinstance(val, dict) else None


# ── Gemini ────────────────────────────────────────────────────

def gemini(model: str, body: dict, timeout: float = 300) -> dict:
    """generateContent call; returns the raw response JSON."""
    return _post(f"{GEMINI_BASE}/{model}:generateContent", timeout=timeout, body=body, headers={
        "x-goog-api-key": _require(settings.gemini_api_key, "GEMINI_API_KEY"),
    }).json()


def gemini_text(res: dict) -> str:
    parts = ((res.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    return next((p["text"] for p in parts if p.get("text")), "")


def gemini_image(res: dict) -> tuple[str, str] | None:
    parts = ((res.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    for p in parts:
        data = p.get("inlineData") or p.get("inline_data")
        if data and data.get("data"):
            return data["data"], data.get("mimeType") or data.get("mime_type") or "image/png"
    return None


def gemini_no_image_reason(res: dict) -> str:
    fb = res.get("promptFeedback") or {}
    if fb.get("blockReason"):
        return f"Blocked: {fb['blockReason']}"
    cand = (res.get("candidates") or [{}])[0]
    if cand.get("finishReason"):
        return f"No image returned (finishReason {cand['finishReason']})"
    return "Gemini returned no image — check GEMINI_API_KEY, billing, and model availability"


def imagen(prompt: str, aspect_ratio: str = "16:9") -> tuple[str, str]:
    res = _post(f"{GEMINI_BASE}/{IMAGEN}:predict", timeout=300, headers={
        "x-goog-api-key": _require(settings.gemini_api_key, "GEMINI_API_KEY"),
    }, body={
        "instances": [{"prompt": prompt}],
        "parameters": {"sampleCount": 1, "aspectRatio": aspect_ratio,
                       "personGeneration": "allow_adult", "safetyFilterLevel": "block_low_and_above"},
    }).json()
    first = (res.get("predictions") or [{}])[0]
    if not first.get("bytesBase64Encoded"):
        raise AIError(f"No image in Imagen response: {json.dumps(res)[:500]}")
    return first["bytesBase64Encoded"], first.get("mimeType") or "image/png"


# ── OpenAI ────────────────────────────────────────────────────

def openai_tts(text: str, voice: str = "alloy") -> bytes:
    return _post("https://api.openai.com/v1/audio/speech", timeout=120, headers={
        "Authorization": f"Bearer {_require(settings.openai_api_key, 'OPENAI_API_KEY')}",
    }, body={"model": "tts-1", "voice": voice, "input": text}).content


def as_str(v: Any, default: str = "") -> str:
    return default if v is None else str(v)
