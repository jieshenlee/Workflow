"""Standalone tools: Image Maker, Image Checker, Inspiration, Guidelines,
Video Templates. Request/response shapes match the n8n webhooks they replace."""

import base64
import glob
import html
import logging
import os
import re
import tempfile

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import ai, prompts
from ..db import Jsonb, execute, fetch_one

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def _upstream(e: Exception) -> HTTPException:
    return HTTPException(502, str(e))


# ── Image Maker ──────────────────────────────────────────────

class ImageMaker(BaseModel):
    instruction: str = ""
    reference_image_b64: str = ""
    reference_mime_type: str = "image/jpeg"


@router.post("/image-maker")
def image_maker(body: ImageMaker):
    instruction = body.instruction.strip()
    if not instruction or not body.reference_image_b64:
        raise HTTPException(400, "instruction and reference_image_b64 are required")
    try:
        res = ai.gemini(ai.GEMINI_IMAGE, {
            "contents": [{"parts": [
                {"text": instruction},
                {"inlineData": {"mimeType": body.reference_mime_type, "data": body.reference_image_b64}},
            ]}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        })
        image = ai.gemini_image(res)
        if image is None:
            raise ai.AIError(ai.gemini_no_image_reason(res))
        raw = ai.claude(model=ai.HAIKU, system=prompts.SLOGAN_SYSTEM, max_tokens=400, content=(
            f'Write exactly 3 short punchy slogans (under 10 words each, tonally distinct) for this post: "{instruction}". '
            'Return ONLY valid JSON, no markdown fences, in this shape: {"slogans":["...","...","..."]}'))
    except ai.AIError as e:
        raise _upstream(e) from e
    slogans = (ai.parse_json(raw) or {}).get("slogans")
    return {"ok": True, "image_b64": image[0], "mime_type": image[1],
            "slogans": [str(s) for s in slogans[:3]] if isinstance(slogans, list) else []}


# ── Image Checker ────────────────────────────────────────────

class ImageCheck(BaseModel):
    request_text: str = ""
    image_b64: str = ""
    mime_type: str = "image/jpeg"


@router.post("/image-check")
def image_check(body: ImageCheck):
    request_text = body.request_text.strip()
    if not request_text or not body.image_b64:
        raise HTTPException(400, "request_text and image_b64 are required")
    check_prompt = (
        "You are a pre-send quality check for a solo content creator who sends finished images out against different "
        f'requests/briefs. What was requested: "{request_text}". Look at the attached image and do all of the following: '
        "(1) write a 1-2 sentence summary of what is actually shown in the image; (2) transcribe any text/words visibly "
        "baked into the image into extracted_text (use an empty string if there is none); (3) if extracted_text is "
        "non-empty, list every spelling or grammar mistake in it as an array of objects with \"issue\" and \"suggestion\" "
        "keys (use an empty array if there is no text or no mistakes); (4) decide a verdict of exactly one of \"match\", "
        "\"partial_match\", or \"mismatch\" for whether this image actually fulfills what was requested, and write a 1-2 "
        "sentence verdict_reason explaining why - this last step exists specifically to catch the wrong image being sent "
        "for the wrong request. Return ONLY valid JSON, no markdown fences, no commentary, with exactly these keys: "
        "summary, extracted_text, grammar_issues, verdict, verdict_reason."
    )
    try:
        raw = ai.claude(model=ai.SONNET, system=prompts.IMAGE_CHECK_SYSTEM, max_tokens=900,
                        content=[ai.image_block(body.image_b64, body.mime_type), {"type": "text", "text": check_prompt}])
    except ai.AIError as e:
        raise _upstream(e) from e
    p = ai.parse_json(raw) or {}
    verdict = p.get("verdict") if p.get("verdict") in ("match", "partial_match", "mismatch") else "partial_match"
    issues = p.get("grammar_issues")
    return {"ok": True, "summary": ai.as_str(p.get("summary")), "extracted_text": ai.as_str(p.get("extracted_text")),
            "grammar_issues": issues if isinstance(issues, list) else [], "verdict": verdict,
            "verdict_reason": ai.as_str(p.get("verdict_reason"))}


# ── Inspiration ──────────────────────────────────────────────

INSPIRATION_CATEGORIES = ["tv_shows", "streaming", "gadgets", "tools", "games", "movies", "ai", "anime", "esports", "other"]


class InspirationUpload(BaseModel):
    type: str = "image"
    file_b64: str = ""
    mime_type: str = "image/jpeg"
    caption: str = ""
    preview_b64: str | None = None
    preview_mime_type: str | None = None


@router.post("/inspiration-upload")
def inspiration_upload(body: InspirationUpload):
    if not body.file_b64:
        raise HTTPException(400, "file_b64 is required")
    is_video = body.type == "video"
    context = f"Caption or context (may be empty): {body.caption or '(none)'}. "
    cats = ", ".join(INSPIRATION_CATEGORIES)
    try:
        if is_video:
            text = (context + f"This is a short trending video clip. Classify it into exactly one category from: {cats}. "
                    "Write a 1-2 sentence summary of the hook or idea that makes it engaging and what content angle it "
                    "suggests. List 3-5 short lowercase tags. Return ONLY valid JSON with exactly these keys: category, summary, tags.")
            raw = ai.gemini_text(ai.gemini(ai.GEMINI_FLASH, {"contents": [{"parts": [
                {"text": text}, {"inlineData": {"mimeType": body.mime_type, "data": body.file_b64}}]}]}))
        else:
            text = (context + f"Classify this image into exactly one category from: {cats}. Write a 1-2 sentence summary "
                    "of what makes it trending or engaging and what content idea it suggests. List 3-5 short lowercase "
                    "tags. Return ONLY valid JSON with exactly these keys: category, summary, tags.")
            raw = ai.claude(model=ai.HAIKU, system=prompts.INSPIRATION_SYSTEM, max_tokens=500,
                            content=[ai.image_block(body.file_b64, body.mime_type), {"type": "text", "text": text}])
    except ai.AIError as e:
        raise _upstream(e) from e
    p = ai.parse_json(raw) or {}
    category = p.get("category") if p.get("category") in INSPIRATION_CATEGORIES else "other"
    summary = ai.as_str(p.get("summary"))
    tags = [str(t) for t in p.get("tags", [])[:5]] if isinstance(p.get("tags"), list) else []
    preview_b64 = body.preview_b64 if is_video else body.file_b64
    preview_mime = body.preview_mime_type if is_video else body.mime_type
    execute(
        "INSERT INTO inspiration_items (type, category, source_caption, preview_b64, preview_mime_type, ai_summary, ai_tags) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        ("video" if is_video else "image", category, body.caption, preview_b64, preview_mime, summary, tags),
    )
    return {"success": True, "category": category, "summary": summary}


# ── Guidelines ───────────────────────────────────────────────

class GuidelineUpload(BaseModel):
    source_type: str = "pdf"
    title: str = ""
    file_b64: str = ""
    mime_type: str = "application/pdf"
    source_url: str = ""


_GUIDELINE_ASK = ("(1) suggest a short 2-4 word title if the working title is generic, (2) classify its subject into a "
                  "short free-text category (e.g. 'Brand Voice', 'SEO Rules', 'Legal', 'Design System' - pick whatever fits")


def strip_html(page: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", page, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()[:60000]


@router.post("/guideline-upload")
def guideline_upload(body: GuidelineUpload):
    title = body.title[:200] or "Untitled guideline"
    working = f"Working title (may be empty): {body.title or '(none)'}. "
    keys = "Return ONLY valid JSON with exactly these keys: title, category, summary, extracted_text."
    source_type = body.source_type if body.source_type in ("pdf", "screenshot", "blog") else "pdf"
    try:
        if source_type == "pdf":
            if not body.file_b64:
                raise HTTPException(400, "file_b64 is required")
            text = (working + "Read this PDF and: " + _GUIDELINE_ASK + ", do not force it into a fixed list), (3) write a "
                    "2-3 sentence summary of what this guideline covers and when to apply it, (4) transcribe the full "
                    "readable text content. " + keys)
            raw = ai.claude(model=ai.SONNET, system=prompts.GUIDELINE_SYSTEM, max_tokens=4000, content=[
                {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": body.file_b64}},
                {"type": "text", "text": text}])
        elif source_type == "screenshot":
            if not body.file_b64:
                raise HTTPException(400, "file_b64 is required")
            text = (working + "This is a screenshot of reference/guideline material. Transcribe every piece of readable "
                    "text in it, " + _GUIDELINE_ASK + "), (3) write a 2-3 sentence summary of what it covers and when to "
                    "apply it. " + keys)
            raw = ai.claude(model=ai.HAIKU, system=prompts.GUIDELINE_SYSTEM, max_tokens=1500,
                            content=[ai.image_block(body.file_b64, body.mime_type), {"type": "text", "text": text}])
        else:
            if not body.source_url.strip():
                raise HTTPException(400, "source_url is required")
            try:
                page = httpx.get(body.source_url.strip(), timeout=15, follow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0 (ProjectDigital guideline capture)"})
                page.raise_for_status()
            except httpx.HTTPError as e:
                raise HTTPException(502, f"Could not fetch {body.source_url}: {e}") from e
            text = (working + f"Source URL: {body.source_url or '(none)'}. Below is the raw text scraped from a blog page "
                    "(nav/ad boilerplate may be mixed in - ignore it). " + _GUIDELINE_ASK + "), (3) write a 2-3 sentence "
                    "summary of what it covers and when to apply it, (4) extract just the main article text, dropping "
                    "nav/ads/boilerplate. " + keys + "\n\nPage text:\n" + strip_html(page.text))
            raw = ai.claude(model=ai.SONNET, system=prompts.GUIDELINE_SYSTEM, max_tokens=4000,
                            content=[{"type": "text", "text": text}])
    except ai.AIError as e:
        raise _upstream(e) from e
    p = ai.parse_json(raw) or {}
    is_file = source_type != "blog"
    row = fetch_one(
        "INSERT INTO guideline_items (source_type, title, source_url, file_b64, file_mime_type, extracted_text, "
        "ai_category, category, ai_summary) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) "
        "RETURNING id, title, category, ai_summary",
        (source_type, ai.as_str(p.get("title")) or title, None if is_file else body.source_url.strip(),
         body.file_b64 if is_file else None, body.mime_type if is_file else None,
         ai.as_str(p.get("extracted_text")), ai.as_str(p.get("category")) or "Uncategorized",
         ai.as_str(p.get("category")) or "Uncategorized", ai.as_str(p.get("summary"))),
    )
    return {"success": True, "id": str(row["id"]), "title": row["title"], "category": row["category"], "summary": row["ai_summary"]}


class GuidelineConfirm(BaseModel):
    id: str
    category: str = ""
    summary: str = ""


@router.post("/guideline-confirm")
def guideline_confirm(body: GuidelineConfirm):
    try:
        audio = ai.openai_tts(body.summary[:3800] or "No summary.")
    except ai.AIError as e:
        raise _upstream(e) from e
    n = execute(
        "UPDATE guideline_items SET category = %s, audio_b64 = %s, audio_mime_type = 'audio/mpeg', status = 'published' "
        "WHERE id = %s", (body.category or "Uncategorized", base64.b64encode(audio).decode(), body.id))
    if n == 0:
        raise HTTPException(404, "Guideline not found")
    return {"success": True, "id": body.id}


# ── Video Templates ──────────────────────────────────────────

class VideoTemplate(BaseModel):
    youtube_url: str = ""
    mode: str = "flowchart"


def _quote_mermaid_labels(mermaid: str) -> str:
    def esc(label: str) -> str:
        return label.replace('"', '\\"')
    mermaid = re.sub(r'([A-Za-z0-9_]+)\[(?!")([^\]]*)\]', lambda m: f'{m.group(1)}["{esc(m.group(2))}"]', mermaid)
    return re.sub(r'([A-Za-z0-9_]+)\{(?!")([^}]*)\}', lambda m: f'{m.group(1)}{{"{esc(m.group(2))}"}}', mermaid)


def _template_from(parsed: dict, mode: str) -> tuple[str | None, list | None]:
    """Return (mermaid, checklist); the one for `mode` is None when invalid."""
    if mode == "flowchart":
        mermaid = _quote_mermaid_labels(ai.as_str(parsed.get("mermaid")).strip())
        return (mermaid if re.match(r"^(flowchart|graph)\s", mermaid, re.I) else None), None
    items = parsed.get("checklist") if isinstance(parsed.get("checklist"), list) else []
    checklist = [{"step": str(i["step"]), "detail": str(i.get("detail") or "")}
                 for i in items if isinstance(i, dict) and i.get("step")]
    return None, (checklist or None)


def vtt_to_text(vtt: str) -> str:
    out, seen = [], set()
    for line in vtt.splitlines():
        line = line.strip()
        if not line or line.startswith(("WEBVTT", "Kind:", "Language:")) or "-->" in line or re.match(r"^\d+$", line):
            continue
        clean = html.unescape(re.sub(r"<[^>]+>", "", line)).strip()
        # Auto-captions scroll, so consecutive cues repeat — keep each line once.
        if clean and clean not in seen:
            out.append(clean)
            seen.add(clean)
    return " ".join(out)


def youtube_transcript(url: str) -> str:
    """Caption track as plain text via yt-dlp (formerly the transcript-service sidecar)."""
    import yt_dlp

    with tempfile.TemporaryDirectory() as tmp:
        outtmpl = os.path.join(tmp, "sub")
        opts = {"skip_download": True, "writesubtitles": True, "writeautomaticsub": True,
                "subtitleslangs": ["en", "en-US", "en-orig"], "subtitlesformat": "vtt",
                "outtmpl": outtmpl, "quiet": True, "no_warnings": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.extract_info(url, download=True)
        files = glob.glob(outtmpl + "*")
        if not files:
            raise ValueError("This video has no captions available")
        with open(files[0], encoding="utf-8", errors="replace") as f:
            text = vtt_to_text(f.read())
    if not text:
        raise ValueError("This video has no captions available")
    return text[:50000]


@router.post("/video-template-extract")
def video_template_extract(body: VideoTemplate):
    url = body.youtube_url.strip()
    if not url:
        raise HTTPException(400, "youtube_url is required")
    mode = "checklist" if body.mode == "checklist" else "flowchart"
    title, summary, mermaid, checklist, error = "Untitled", "", None, None, None

    # 1. Gemini watches the video directly by URL.
    try:
        prompt = prompts.VIDEO_GEMINI_FLOWCHART if mode == "flowchart" else prompts.VIDEO_GEMINI_CHECKLIST
        res = ai.gemini(ai.GEMINI_FLASH, {"contents": [{"parts": [
            {"text": prompt}, {"fileData": {"fileUri": url, "mimeType": "video/*"}}]}]})
        parsed = ai.parse_json(ai.gemini_text(res)) or {}
        mermaid, checklist = _template_from(parsed, mode)
        title, summary = ai.as_str(parsed.get("title"), "Untitled"), ai.as_str(parsed.get("summary"))
    except ai.AIError as e:
        log.warning("Gemini video analysis failed, falling back to transcript: %s", e)

    # 2. Fallback: yt-dlp transcript -> Claude.
    if mermaid is None and checklist is None:
        try:
            transcript = youtube_transcript(url)
            prompt = prompts.VIDEO_CLAUDE_FLOWCHART if mode == "flowchart" else prompts.VIDEO_CLAUDE_CHECKLIST
            system = prompts.VIDEO_FLOWCHART_SYSTEM if mode == "flowchart" else prompts.VIDEO_CHECKLIST_SYSTEM
            raw = ai.claude(model=ai.SONNET, system=system, max_tokens=3000,
                            content=[{"type": "text", "text": f"{prompt}\n\nTranscript:\n{transcript}"}])
            parsed = ai.parse_json(raw) or {}
            mermaid, checklist = _template_from(parsed, mode)
            title, summary = ai.as_str(parsed.get("title"), "Untitled"), ai.as_str(parsed.get("summary"))
            if mermaid is None and checklist is None:
                error = f"Claude did not return a valid {'Mermaid flowchart' if mode == 'flowchart' else 'checklist'}"
        except Exception as e:  # noqa: BLE001 — yt-dlp raises many types; all mean "no transcript"
            error = str(e) or "Could not extract a template from this video"

    status = "failed" if error else "ready"
    row = fetch_one(
        "INSERT INTO video_templates (youtube_url, mode, title, ai_summary, mermaid_code, checklist_json, status, error_message) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
        (url, mode, title, summary, mermaid, Jsonb(checklist) if checklist else None, status, error),
    )
    return {"success": status == "ready", "id": str(row["id"]), "mode": mode, "title": title, "summary": summary,
            "mermaid": mermaid, "checklist": checklist, "status": status, "error": error}
