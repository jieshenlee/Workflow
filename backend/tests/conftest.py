"""Test harness: a throwaway Postgres schema built from db/schema.sql, and
fakes for every external API (Claude, Gemini, Imagen, OpenAI TTS, Sanity,
TinyURL, Telegram). Point TEST_DATABASE_URL at any Postgres you can create
schemas in. A spare free Supabase project works; don't use your real one:

    TEST_DATABASE_URL=postgresql://postgres.<ref>:<password>@<pooler-host>:5432/postgres pytest

Each run creates a pd_test_<random> schema and drops it afterwards. Tests
are skipped when TEST_DATABASE_URL isn't set or reachable.
"""

import json
import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

ROOT = Path(__file__).resolve().parents[2]
TEST_URL = os.environ.get("TEST_DATABASE_URL", "")
SCHEMA = f"pd_test_{uuid.uuid4().hex[:8]}"

# app.config reads the environment once at import (and .env never overrides
# real variables), so pin everything before any app import.
os.environ.update({"DATABASE_URL": TEST_URL, "DB_SCHEMA": SCHEMA, "TELEGRAM_BOT_TOKEN": "",
                   "ANTHROPIC_API_KEY": "test-key", "GEMINI_API_KEY": "test-key",
                   "OPENAI_API_KEY": "test-key", "SANITY_API_TOKEN": "test-key"})


def connect(schema: str = SCHEMA, **kw) -> psycopg.Connection:
    conn = psycopg.connect(TEST_URL, autocommit=True, prepare_threshold=None, **kw)
    conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
    return conn


def create_schema(schema: str) -> None:
    with psycopg.connect(TEST_URL, autocommit=True, prepare_threshold=None) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    with connect(schema) as conn:
        conn.execute((ROOT / "db" / "schema.sql").read_text())


def drop_schema(schema: str) -> None:
    with psycopg.connect(TEST_URL, autocommit=True, prepare_threshold=None) as conn:
        conn.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))


@pytest.fixture(scope="session")
def database_url():
    if not TEST_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    try:
        psycopg.connect(TEST_URL, connect_timeout=5).close()
    except psycopg.OperationalError as e:
        pytest.skip(f"No Postgres for tests at TEST_DATABASE_URL: {e}")
    create_schema(SCHEMA)
    yield TEST_URL
    from app.db import close_pool
    close_pool()
    drop_schema(SCHEMA)


@pytest.fixture(scope="session")
def client(database_url):
    from fastapi.testclient import TestClient

    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def db(database_url):
    with connect(row_factory=psycopg.rows.dict_row) as conn:
        yield conn


PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="


class Fakes:
    """Records calls and returns canned model replies, keyed by what's being asked."""

    def __init__(self):
        self.claude_calls: list[dict] = []
        self.gemini_calls: list[dict] = []
        self.http_calls: list[tuple] = []
        self.gemini_fail_sizes: set[str] = set()
        self.gemini_video_fails = False

    def claude(self, *, model, system, content, max_tokens, timeout=600):
        self.claude_calls.append({"model": model, "system": system, "content": content, "max_tokens": max_tokens})
        text = content if isinstance(content, str) else " ".join(b.get("text", "") for b in content if b.get("type") == "text")
        s = system
        if "content strategist" in s:
            return json.dumps({"angles": [{"headline": "Angle A", "hook": "h", "angle_type": "how-to", "target_reader": "r"}],
                               "recommendation": "A"})
        if "senior content editor" in s:
            return "```json\n" + json.dumps({"title": "T", "meta_description": "M", "sections": []}) + "\n```"
        if "You are a writer" in s:
            return "# Title\n\nBody paragraph.\n\n- item one\n- item two"
        if "art director for a content studio" in s:
            return json.dumps({"prompt": "A hero image", "style": "editorial"})
        if "art director writing prompts" in s:
            return json.dumps({"prompt": "Teal beach scene", "brief_check": {"passes": True, "issues": ["Logo missing"], "notes": "ok"}})
        if s.startswith("You write") and "Project Digital" in s:
            return json.dumps({"platform": "x", "single_post": "post", "link": "https://tiny/x"})
        if s.startswith("You write"):
            field = next(k for k in ("excerpt", "alt", "meta_title", "meta_description", "slogans") if f'"{k}"' in s + text)
            return json.dumps({field: ["s1", "s2", "s3", "s4"]} if field == "slogans" else {field: f"gen {field}"})
        if "pre-send QC" in s:
            return json.dumps({"summary": "A cat", "extracted_text": "", "grammar_issues": [], "verdict": "weird", "verdict_reason": "r"})
        if "guideline" in s:
            return json.dumps({"title": "Brand Voice Guide", "category": "Brand Voice", "summary": "S", "extracted_text": "E"})
        if "catalog trending" in s:
            return json.dumps({"category": "gadgets", "summary": "S", "tags": ["a", "b", "c", "d", "e", "f"]})
        if "process diagrams" in s:
            return json.dumps({"title": "T", "summary": "S", "mermaid": "flowchart TD\nA[Start (here)] --> B{Ok?}"})
        if "actionable checklists" in s:
            return json.dumps({"title": "T", "summary": "S", "checklist": [{"step": "One", "detail": "d"}]})
        raise AssertionError(f"Unexpected Claude system prompt: {s[:80]}")

    def gemini(self, model, body, timeout=300):
        self.gemini_calls.append({"model": model, "body": body})
        parts = body["contents"][0]["parts"]
        if any("fileData" in p for p in parts):
            if self.gemini_video_fails:
                from app.ai import AIError
                raise AIError("generativelanguage.googleapis.com 403: PERMISSION_DENIED")
            return {"candidates": [{"content": {"parts": [{"text": json.dumps(
                {"title": "Vid", "summary": "S", "checklist": [{"step": "Do it"}]})}]}}]}
        if model == "gemini-2.5-flash":
            return {"candidates": [{"content": {"parts": [{"text": json.dumps({"category": "nope", "summary": "V", "tags": ["x"]})}]}}]}
        aspect = (body.get("generationConfig", {}).get("imageConfig") or {}).get("aspectRatio")
        if aspect in self.gemini_fail_sizes:
            return {"candidates": [{"finishReason": "SAFETY"}]}
        return {"candidates": [{"content": {"parts": [{"text": "here"}, {"inlineData": {"mimeType": "image/png", "data": PNG}}]}}]}

    def imagen(self, prompt, aspect_ratio="16:9"):
        self.gemini_calls.append({"model": "imagen", "prompt": prompt})
        return PNG, "image/png"

    def tts(self, text, voice="alloy"):
        return b"ID3-fake-mp3"


class FakeResponse:
    def __init__(self, status=200, json_body=None, text=""):
        self.status_code, self._json, self.text = status, json_body, text

    def json(self):
        return self._json

    def raise_for_status(self):
        pass


@pytest.fixture()
def fakes(monkeypatch, client):
    from app import ai
    from app.routers import blog, tools

    f = Fakes()
    monkeypatch.setattr(ai, "claude", f.claude)
    monkeypatch.setattr(ai, "gemini", f.gemini)
    monkeypatch.setattr(ai, "imagen", f.imagen)
    monkeypatch.setattr(ai, "openai_tts", f.tts)

    def fake_post(url, **kw):
        f.http_calls.append(("POST", url, kw))
        if "/assets/images/" in url:
            return FakeResponse(json_body={"document": {"_id": "image-abc"}})
        return FakeResponse(json_body={"results": []})

    def fake_get(url, **kw):
        f.http_calls.append(("GET", url, kw))
        if "tinyurl" in url:
            return FakeResponse(text="https://tinyurl.com/abc")
        return FakeResponse(text="<html><script>x</script><p>Guide &amp; rules</p></html>")

    monkeypatch.setattr(blog.httpx, "post", fake_post)
    monkeypatch.setattr(blog.httpx, "get", fake_get)
    monkeypatch.setattr(tools.httpx, "get", fake_get)
    monkeypatch.setattr(tools, "youtube_transcript", lambda url: "first do this then that")
    return f
