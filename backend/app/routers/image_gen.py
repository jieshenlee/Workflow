"""Image Gen: brand refs + ask -> drafted prompt + brief check -> per-size render.

The dashboard creates the image_gen_jobs / image_gen_generations rows
itself, then calls /render with the job id. Rendering runs in the
background and writes straight to Postgres; the page polls Supabase.
"""

import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from .. import ai, prompts
from ..db import execute, fetch_all, fetch_one

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/image-gen")

# Keep in sync with SIZES in dashboard/src/lib/imageGen.ts.
SIZES = {
    "post":     {"label": "Square post",   "aspect": "1:1",  "w": 1080, "h": 1080},
    "portrait": {"label": "Portrait post", "aspect": "4:5",  "w": 1080, "h": 1350},
    "story":    {"label": "Story / Reel",  "aspect": "9:16", "w": 1080, "h": 1920},
    "banner":   {"label": "Banner",        "aspect": "16:9", "w": 1200, "h": 628},
}
MAX_REFERENCES = 6


class Reference(BaseModel):
    b64: str = ""
    mime: str = "image/png"


class DraftRequest(BaseModel):
    ask: str = ""
    brand_name: str = "Untitled brand"
    brief: str = ""
    sizes: list[str] = []
    references: list[Reference] = []
    previous_prompt: str | None = None
    change_note: str | None = None


@router.post("/draft")
def draft(body: DraftRequest):
    ask = body.ask.strip()
    if not ask:
        raise HTTPException(400, "ask is required")
    refs = [r for r in body.references if r.b64][:MAX_REFERENCES]
    text = (f"Brand: {body.brand_name}\n\nBrand brief:\n{body.brief.strip() or '(no brief written yet)'}"
            f"\n\nAsk: {ask}\n\nOutput sizes: {', '.join(body.sizes) or 'post'}")
    if (body.previous_prompt or "").strip() and (body.change_note or "").strip():
        text += (f"\n\nPrevious prompt:\n{body.previous_prompt.strip()}\n\nReviewer's requested changes:\n"
                 f"{body.change_note.strip()}\nRewrite the previous prompt to apply these changes. "
                 "Keep everything the reviewer did not ask to change.")
    if not refs:
        text += "\n\n(No reference images were selected — infer the style from the brief alone.)"
    content = [ai.image_block(r.b64, r.mime) for r in refs] + [{"type": "text", "text": text}]
    try:
        raw = ai.claude(model=ai.HAIKU, system=prompts.load_section("image-gen-draft"), content=content, max_tokens=1200)
    except ai.AIError as e:
        raise HTTPException(502, str(e)) from e

    parsed = ai.parse_json(raw)
    if parsed is None:
        parsed = {"prompt": raw.strip(), "brief_check": {"passes": False, "issues": [
            "Claude reply was not valid JSON — brief check skipped, review the prompt by eye."], "notes": ""}}
    bc = parsed.get("brief_check") if isinstance(parsed.get("brief_check"), dict) else {}
    issues = [str(i) for i in bc.get("issues", [])] if isinstance(bc.get("issues"), list) else []
    return {
        "ok": True,
        "prompt": ai.as_str(parsed.get("prompt")).strip(),
        "brief_check": {"passes": bc.get("passes") is True and not issues, "issues": issues, "notes": ai.as_str(bc.get("notes"))},
    }


def _render_one(prompt: str, size: str, refs: list[dict]) -> dict:
    s = SIZES.get(size, SIZES["post"])
    text = (f"{prompt}\n\nFormat: {s['label']}, {s['aspect']} aspect ratio (final crop {s['w']}x{s['h']}px). "
            "Fill the whole frame; keep key subjects and any text away from the edges.")
    if refs:
        text += ("\n\nThe attached images are this brand's reference images. Match their visual style — palette, "
                 "lighting, rendering style, typography treatment and mood — but create a new image; do not copy them.")
    parts = [{"text": text}] + [{"inlineData": {"mimeType": r["mime_type"] or "image/png", "data": r["image_b64"]}} for r in refs]
    try:
        res = ai.gemini(ai.GEMINI_IMAGE, {
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"], "imageConfig": {"aspectRatio": s["aspect"]}},
        })
    except ai.AIError as e:
        return {"render_status": "failed", "error": str(e)[:1000]}
    image = ai.gemini_image(res)
    if image is None:
        return {"render_status": "failed", "error": ai.gemini_no_image_reason(res)}
    return {"render_status": "done", "image_b64": image[0], "mime_type": image[1], "error": None}


def render_job(job_id: str) -> None:
    job = fetch_one("SELECT id, prompt_drafted, reference_ids FROM image_gen_jobs WHERE id = %s", (job_id,))
    if job is None:
        return
    try:
        execute("UPDATE image_gen_jobs SET status = 'running', error = NULL WHERE id = %s", (job_id,))
        gens = fetch_all("SELECT id, size FROM image_gen_generations WHERE job_id = %s AND render_status = 'rendering'", (job_id,))
        if not gens:
            raise RuntimeError("No generations waiting to render")
        refs = fetch_all("SELECT image_b64, mime_type FROM brand_references WHERE id = ANY(%s) ORDER BY created_at",
                         (job["reference_ids"] or [],))[:MAX_REFERENCES]
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda g: _render_one(job["prompt_drafted"], g["size"], refs), gens))
        for g, r in zip(gens, results):
            execute(
                "UPDATE image_gen_generations SET render_status = %s, image_b64 = COALESCE(%s, image_b64), "
                "mime_type = COALESCE(%s, mime_type), generated_by = %s, error = %s WHERE id = %s",
                (r["render_status"], r.get("image_b64"), r.get("mime_type"), ai.GEMINI_IMAGE, r.get("error"), g["id"]),
            )
        done = sum(r["render_status"] == "done" for r in results)
        failed = len(results) - done
        if done:
            execute("UPDATE image_gen_jobs SET status = 'done', error = %s WHERE id = %s",
                    (f"{failed} of {len(results)} sizes failed" if failed else None, job_id))
        else:
            execute("UPDATE image_gen_jobs SET status = 'failed', error = %s WHERE id = %s",
                    (f"All sizes failed: {results[0].get('error')}", job_id))
    except Exception as e:  # noqa: BLE001 — record any failure on the job so Retry shows up
        log.exception("image-gen render failed for %s", job_id)
        execute("UPDATE image_gen_jobs SET status = 'failed', error = %s WHERE id = %s", (str(e)[:1000], job_id))


class RenderRequest(BaseModel):
    job_id: str


@router.post("/render")
def render(body: RenderRequest, bg: BackgroundTasks):
    if not fetch_one("SELECT 1 FROM image_gen_jobs WHERE id = %s", (body.job_id,)):
        raise HTTPException(404, "Job not found")
    bg.add_task(render_job, body.job_id)
    return {"ok": True, "job_id": body.job_id}
