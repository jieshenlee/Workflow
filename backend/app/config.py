"""Settings, read once from the environment. The repo-root .env is loaded
first (real environment variables win), so `uvicorn` needs no wrapper."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    # Supabase → Project Settings → Database → Connection string → "Session pooler".
    database_url: str = field(default_factory=lambda: _env("DATABASE_URL"))
    # Postgres schema to use instead of public. Only the tests set this.
    db_schema: str = field(default_factory=lambda: _env("DB_SCHEMA"))
    # Base URL the *browser* uses to reach this API. Approval gates store
    # f"{public_api_url}/api/approvals/<id>/resume" as their resume_url.
    public_api_url: str = field(default_factory=lambda: _env("PUBLIC_API_URL", "http://localhost:8000").rstrip("/"))
    cors_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()))

    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))

    sanity_project_id: str = field(default_factory=lambda: _env("SANITY_PROJECT_ID", "p9audgmp"))
    sanity_dataset: str = field(default_factory=lambda: _env("SANITY_DATASET", "production"))
    sanity_api_token: str = field(default_factory=lambda: _env("SANITY_API_TOKEN"))
    site_url: str = field(default_factory=lambda: _env("SITE_URL", "https://project-digital-website.vercel.app").rstrip("/"))

    # Inspiration bot. Polling starts only when a token is set.
    telegram_bot_token: str = field(default_factory=lambda: _env("TELEGRAM_BOT_TOKEN"))
    telegram_allowed_chat_ids: frozenset[str] = field(default_factory=lambda: frozenset(
        c.strip() for c in _env("TELEGRAM_ALLOWED_CHAT_IDS").split(",") if c.strip()))


settings = Settings()
