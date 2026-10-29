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

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    close_pool()


app = FastAPI(title="Project Digital API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"], allow_headers=["*"])
app.include_router(blog.router)
app.include_router(tools.router)
app.include_router(image_gen.router)


@app.get("/health")
def health():
    fetch_one("SELECT 1")
    return {
        "ok": True,
        "keys": {
            "anthropic": bool(settings.anthropic_api_key),
            "gemini": bool(settings.gemini_api_key),
            "openai": bool(settings.openai_api_key),
            "sanity": bool(settings.sanity_api_token),
        },
    }
