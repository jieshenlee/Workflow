"""Blog + social path endpoints (replaces the start-blog, upload-blog,
generate-meta, publish-cms, repurpose-social and shorten workflows)."""

import base64
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel

from .. import ai, pipeline, prompts
from ..config import settings
from ..db import Jsonb, execute, fetch_one, transaction

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


# ── Start / upload / approvals ───────────────────────────────

class StartBlog(BaseModel):
    topic: str = ""


@router.post("/start-blog")
def start_blog(body: StartBlog, bg: BackgroundTasks):
    topic = body.topic.strip() or "How AI is changing content marketing for small businesses"
    job_id = pipeline.create_blog_job(topic)
    bg.add_task(pipeline.run_step, job_id, "brainstorm", pipeline.step_brainstorm)
    return {"ok": True, "job_id": job_id}


class UploadBlog(BaseModel):
    topic: str = ""
    draft_md: str = ""


@router.post("/upload-blog")
def upload_blog(body: UploadBlog, bg: BackgroundTasks):
    if not body.draft_md.strip():
        raise HTTPException(400, "draft_md is required")
    row = fetch_one(
        "INSERT INTO content_jobs (topic, branch, status, draft_md) VALUES (%s, 'blog', 'image', %s) RETURNING id",
        (body.topic.strip() or "Untitled", body.draft_md.strip()),
    )
    job_id = str(row["id"])
    bg.add_task(pipeline.run_step, job_id, "image", pipeline.step_upload_image)
    return {"ok": True, "job_id": job_id}


@router.post("/approvals/{approval_id}/resume")
def resume_approval(approval_id: str, bg: BackgroundTasks, body: dict | None = None):
    try:
        job_id, step_name, next_step = pipeline.resume(approval_id, body or {})
    except pipeline.GateError as e:
        raise HTTPException(e.status, str(e)) from e
    if next_step is not None:
        bg.add_task(pipeline.run_step, job_id, step_name, next_step)
    return {"ok": True, "job_id": job_id, "next": step_name}


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, bg: BackgroundTasks):
    try:
        step_name, fn = pipeline.retry_job(job_id)
    except pipeline.GateError as e:
        raise HTTPException(e.status, str(e)) from e
    bg.add_task(pipeline.run_step, job_id, step_name, fn)
    return {"ok": True, "job_id": job_id, "step": step_name}


# ── Publish panel ────────────────────────────────────────────

class GenerateMeta(BaseModel):
    job_id: str
    field: str = "excerpt"


def _job_with_image(job_id: str) -> dict:
    job = fetch_one(
        "SELECT cj.id, cj.topic, cj.chosen_angle, cj.draft_md, "
        "COALESCE(img.image_b64, gi.image_b64) AS image_b64, "
        "COALESCE(img.mime_type, gi.mime_type, 'image/png') AS mime_type, "
        "COALESCE(img.prompt, gi.prompt) AS image_prompt "
        "FROM content_jobs cj LEFT JOIN images img ON img.id = cj.chosen_image_id "
        "LEFT JOIN generated_images gi ON gi.job_id = cj.id AND gi.is_chosen = TRUE "
        "WHERE cj.id = %s LIMIT 1", (job_id,))
    if job is None:
        raise HTTPException(404, "Job not found")
    return job


@router.post("/generate-meta")
def generate_meta(body: GenerateMeta):
    field = body.field if body.field in prompts.META_SYSTEM else "excerpt"
    job = _job_with_image(body.job_id)
    topic, angle, draft = job["topic"] or "", job["chosen_angle"] or "", (job["draft_md"] or "")[:2000]
    if field == "alt":
        user = f"Topic: {topic}\nImage prompt: {job['image_prompt'] or ''}"
    elif field == "meta_description":
        user = f"Topic: {topic}\nAngle: {angle}\nDraft excerpt:\n{draft[:600]}"
    else:
        user = f"Topic: {topic}\nAngle: {angle}\nDraft (start):\n{draft}"
    try:
        raw = ai.claude(model=ai.HAIKU, system=prompts.META_SYSTEM[field], content=user, max_tokens=400)
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e
    return {field: str((ai.parse_json(raw) or {}).get(field) or "")}


def markdown_to_portable_text(md: str) -> list[dict]:
    """Headings, bullet/numbered lists and paragraphs -> Sanity Portable Text blocks."""
    import secrets

    def key() -> str:
        return "_k" + secrets.token_hex(4)

    def span(text: str) -> dict:
        return {"_type": "span", "_key": key(), "text": text, "marks": []}

    def block(style: str, text: str, list_item: str | None = None) -> dict:
        b = {"_type": "block", "_key": key(), "style": style, "markDefs": [], "children": [span(text)]}
        if list_item:
            b.update(listItem=list_item, level=1)
        return b

    is_break = re.compile(r"^(#{1,4}\s|[-*+]\s|\d+\.\s)")
    lines = (md or "").split("\n")
    blocks: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if m := re.match(r"^(#{1,4})\s+(.+)$", line):
            blocks.append(block(f"h{len(m.group(1))}", m.group(2).strip()))
        elif m := re.match(r"^[-*+]\s+(.+)$", line):
            blocks.append(block("normal", m.group(1).strip(), "bullet"))
        elif m := re.match(r"^\d+\.\s+(.+)$", line):
            blocks.append(block("normal", m.group(1).strip(), "number"))
        else:
            para = line
            while i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if not nxt or is_break.match(nxt):
                    break
                i += 1
                para += " " + nxt
            blocks.append(block("normal", para))
        i += 1
    return blocks


def slugify(s: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (s or "").lower())) or "item"


class PublishCms(BaseModel):
    job_id: str
    title: str = ""
    slug: str = ""
    author: str = ""
    category: str = ""
    reading_time: float | int | str | None = 5
    excerpt: str = ""
    cover_alt: str = ""
    meta_title: str = ""
    meta_description: str = ""


@router.post("/publish-cms")
def publish_cms(body: PublishCms):
    if not settings.sanity_api_token:
        raise HTTPException(500, "SANITY_API_TOKEN is not set — add it to .env and restart the api container")
    job = _job_with_image(body.job_id)
    base = f"https://{settings.sanity_project_id}.api.sanity.io/v2024-01-01"
    auth = {"Authorization": f"Bearer {settings.sanity_api_token}"}

    asset_id = ""
    if job["image_b64"]:
        res = httpx.post(f"{base}/assets/images/{settings.sanity_dataset}", headers={**auth, "Content-Type": job["mime_type"]},
                         content=base64.b64decode(job["image_b64"]), timeout=120)
        if res.status_code >= 400:
            raise HTTPException(502, f"Sanity cover upload {res.status_code}: {res.text[:300]}")
        asset_id = (res.json().get("document") or {}).get("_id", "")

    try:
        reading_time = int(float(body.reading_time or 5)) or 5
    except (TypeError, ValueError):
        reading_time = 5
    slug = body.slug or slugify(body.title)
    author_slug, category_slug = slugify(body.author), slugify(body.category)
    post = {
        "_type": "post",
        "title": body.title,
        "slug": {"_type": "slug", "current": slug},
        "author": {"_type": "reference", "_ref": f"author-{author_slug}"},
        "category": {"_type": "reference", "_ref": f"category-{category_slug}"},
        "readingTime": reading_time,
        "excerpt": body.excerpt,
        "body": markdown_to_portable_text(job["draft_md"] or ""),
        "metaTitle": body.meta_title,
        "metaDescription": body.meta_description,
        "publishedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    if asset_id:
        post["coverImage"] = {"_type": "image", "asset": {"_type": "reference", "_ref": asset_id}, "alt": body.cover_alt}
    mutations = [
        {"createIfNotExists": {"_id": f"author-{author_slug}", "_type": "author", "name": body.author or "Unknown"}},
        {"createIfNotExists": {"_id": f"category-{category_slug}", "_type": "category", "title": body.category or "Uncategorized"}},
        {"create": post},
    ]
    res = httpx.post(f"{base}/data/mutate/{settings.sanity_dataset}", headers=auth, json={"mutations": mutations}, timeout=60)
    if res.status_code >= 400:
        raise HTTPException(502, f"Sanity mutate {res.status_code}: {res.text[:300]}")

    blog_url = f"{settings.site_url}/blog/{slug}"
    execute("UPDATE content_jobs SET status = 'published', blog_url = %s WHERE id = %s", (blog_url, body.job_id))
    return {"ok": True, "blog_url": blog_url}


# ── Shortlinks + repurpose to social ─────────────────────────

def tinyurl(url: str) -> str:
    res = httpx.get("https://tinyurl.com/api-create.php", params={"url": url}, timeout=20)
    text = res.text.strip()
    if not text.startswith("http"):
        raise ValueError(f"TinyURL returned: {text[:200]}")
    return text


@router.get("/shorten")
def shorten(url: str = Query("")):
    try:
        return {"ok": True, "shortlink": tinyurl(url)}
    except (ValueError, httpx.HTTPError) as e:
        return {"ok": False, "error": str(e)}


class Repurpose(BaseModel):
    job_id: str
    platforms: list[str] = []
    content_type: str = "static"


def _caption(platform: str, user: str) -> dict:
    system = prompts.CAPTION_SYSTEM.get(platform, prompts.CAPTION_SYSTEM["instagram"])
    raw = ai.claude(model=ai.SONNET, system=system, content=user, max_tokens=1500)
    parsed = ai.parse_json(raw)
    return parsed if parsed is not None else {"parse_error": "Model reply was not valid JSON", "raw": raw}


def run_repurpose(job_id: str, platforms: list[str], content_type: str) -> None:
    job = fetch_one("SELECT id, topic, chosen_angle, draft_md, blog_url, shortlink FROM content_jobs WHERE id = %s", (job_id,))
    if job is None:
        raise RuntimeError("Job not found")
    short = (job["shortlink"] or "").strip()
    if not short and job["blog_url"]:
        try:
            short = tinyurl(job["blog_url"])
        except (ValueError, httpx.HTTPError):
            log.warning("TinyURL failed for %s", job["blog_url"])
    user = (f"Topic: {job['topic'] or ''}\nAngle: {job['chosen_angle'] or ''}\nContent type: {content_type}\n"
            f"Short link: {short}\n\nBlog draft:\n{job['draft_md'] or ''}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        captions = list(pool.map(lambda p: _caption(p, user), platforms))
    with transaction() as conn:
        for platform, caption in zip(platforms, captions):
            conn.execute(
                "INSERT INTO platform_captions (job_id, platform, content_type, aspect_ratio, caption, status) "
                "VALUES (%s, %s, 'static', '4:5', %s, 'pending') "
                "ON CONFLICT (job_id, platform) DO UPDATE SET caption = EXCLUDED.caption, status = 'pending'",
                (job_id, platform, Jsonb(caption)),
            )
    pipeline.open_gate(job_id, 5, "captions", {"platforms": platforms})


def _run_repurpose_safe(job_id: str, platforms: list[str], content_type: str) -> None:
    try:
        run_repurpose(job_id, platforms, content_type)
    except Exception:  # noqa: BLE001 — leave the job's own status alone; captions are optional
        log.exception("repurpose failed for job %s", job_id)
        execute("UPDATE content_jobs SET data = COALESCE(data, '{}'::jsonb) || %s WHERE id = %s",
                (Jsonb({"repurpose_error": "Caption generation failed — check the api logs"}), job_id))


@router.post("/repurpose-social")
def repurpose_social(body: Repurpose, bg: BackgroundTasks):
    platforms = body.platforms or ["linkedin", "x", "instagram"]
    if not fetch_one("SELECT 1 FROM content_jobs WHERE id = %s", (body.job_id,)):
        raise HTTPException(404, "Job not found")
    bg.add_task(_run_repurpose_safe, body.job_id, platforms, body.content_type or "static")
    return {"ok": True}
