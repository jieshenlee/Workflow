"""Project Digital API — replaces the n8n workflows.

Run locally:  uvicorn app.main:app --reload --port 8000   (from backend/)
Docs:         http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import close_pool, fetch_one
from .routers import blog, image_gen, tools
from .telegram import poller

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    poller.start()
    yield
    poller.stop()
    close_pool()


app = FastAPI(title="Project Digital API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
app.include_router(blog.router)
app.include_router(tools.router)
app.include_router(image_gen.router)


@app.get("/health")
def health():
    try:
        fetch_one("SELECT 1")
        database = "ok"
    except Exception as e:  # noqa: BLE001 — report any connection problem as text
        database = f"error: {e}"
    return {
        "ok": database == "ok",
        "database": database,
        "keys": {
            "anthropic": bool(settings.anthropic_api_key),
            "gemini": bool(settings.gemini_api_key),
            "openai": bool(settings.openai_api_key),
            "sanity": bool(settings.sanity_api_token),
        },
        "telegram": {
            "configured": bool(settings.telegram_bot_token),
            "polling": poller.running,
            "allowed_chats": len(settings.telegram_allowed_chat_ids),
            "last_error": poller.last_error,
        },
    }
