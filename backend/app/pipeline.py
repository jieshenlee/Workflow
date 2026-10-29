"""Blog path (Stages 1-4) and the approval-gate mechanism.

How a gate works (replaces n8n's Wait node):
  1. A stage finishes its AI step and calls open_gate(). That inserts a
     pending approval_stages row whose resume_url points back at this API.
  2. The dashboard shows the row and, on approve, POSTs the reviewer's
     input to resume_url (same as it did for n8n).
  3. resume() flips the row to approved (once only) and runs the next
     stage in the background.

Nothing is held in memory between stages: every step reads what it
needs from Postgres. So jobs survive restarts, and a failed step can
be retried (retry_job) without the human approving again.
"""

import json
import logging
from typing import Any, Callable

from . import ai, prompts
from .config import settings
from .db import Jsonb, execute, fetch_one, transaction

log = logging.getLogger(__name__)


class GateError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def resume_url_for(approval_id: str) -> str:
    return f"{settings.public_api_url}/api/approvals/{approval_id}/resume"


def open_gate(job_id: str, stage_number: int, stage_name: str, content: Any) -> str:
    with transaction() as conn:
        row = conn.execute(
            "INSERT INTO approval_stages (job_id, stage_number, stage_name, content, status) "
            "VALUES (%s, %s, %s, %s, 'pending') "
            "ON CONFLICT (job_id, stage_number) DO UPDATE SET stage_name = EXCLUDED.stage_name, "
            "content = EXCLUDED.content, status = 'pending', edited_content = NULL, feedback = NULL, reviewed_at = NULL "
            "RETURNING id",
            (job_id, stage_number, stage_name, Jsonb(content)),
        ).fetchone()
        conn.execute("UPDATE approval_stages SET resume_url = %s WHERE id = %s",
                     (resume_url_for(str(row["id"])), row["id"]))
    return str(row["id"])


def _close_gate(approval_id: str, feedback: str, edited_content: Any = None) -> dict:
    """Mark the gate approved exactly once. Raises GateError if it isn't pending."""
    row = fetch_one(
        "UPDATE approval_stages SET status = 'approved', feedback = %s, edited_content = COALESCE(%s, edited_content), "
        "reviewed_at = now() WHERE id = %s AND status = 'pending' RETURNING id, job_id, stage_number",
        (feedback, Jsonb(edited_content) if edited_content is not None else None, approval_id),
    )
    if row is None:
        exists = fetch_one("SELECT status FROM approval_stages WHERE id = %s", (approval_id,))
        if exists is None:
            raise GateError(404, "Approval not found")
        raise GateError(409, f"Approval already {exists['status']}")
    return row


def _job(job_id: str) -> dict:
    job = fetch_one("SELECT * FROM content_jobs WHERE id = %s", (job_id,))
    if job is None:
        raise RuntimeError(f"Job {job_id} not found")
    return job


def _set_status(job_id: str, status: str) -> None:
    execute("UPDATE content_jobs SET status = %s WHERE id = %s", (status, job_id))


def fail_job(job_id: str, step: str, err: Exception) -> None:
    log.exception("job %s failed at %s", job_id, step)
    execute(
        "UPDATE content_jobs SET status = 'failed', data = COALESCE(data, '{}'::jsonb) || %s WHERE id = %s",
        (Jsonb({"error": {"step": step, "message": str(err)[:1000]}}), job_id),
    )


def run_step(job_id: str, step: str, fn: Callable[[str], None]) -> None:
    """Background-task wrapper: any exception marks the job failed with the reason."""
    try:
        fn(job_id)
    except Exception as e:  # noqa: BLE001 — surface every failure on the job row
        fail_job(job_id, step, e)


def _parse_or_error(raw: str) -> dict:
    parsed = ai.parse_json(raw)
    return parsed if parsed is not None else {"parse_error": "Model reply was not valid JSON", "raw": raw}


def _keywords(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(s).strip() for s in value if str(s).strip()]
    if isinstance(value, str):
        return [s.strip() for s in value.split(",") if s.strip()]
    return []


def _word_count(value: Any) -> int:
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return 1500
    return n if 300 <= n <= 5000 else 1500


# ── Stage steps ──────────────────────────────────────────────

def create_blog_job(topic: str) -> str:
    row = fetch_one(
        "INSERT INTO content_jobs (topic, branch, status, data) VALUES (%s, 'blog', 'brainstorm', '{}'::jsonb) RETURNING id",
        (topic,),
    )
    return str(row["id"])


def step_brainstorm(job_id: str) -> None:
    job = _job(job_id)
    user = (f"Topic: {job['topic']}\n\nReturn a JSON object with a field \"angles\" (an array of 4-6 items, each item "
            "having headline, hook, angle_type, and target_reader) and a field \"recommendation\" (a string).")
    brainstorm = _parse_or_error(ai.claude(model=ai.HAIKU, system=prompts.BRAINSTORM_SYSTEM, content=user, max_tokens=1500))
    execute("UPDATE content_jobs SET data = %s WHERE id = %s", (Jsonb(brainstorm), job_id))
    open_gate(job_id, 1, "Brainstorm", brainstorm)


def step_outline(job_id: str) -> None:
    job = _job(job_id)
    notes = (job["data"] or {}).get("angle_notes") or ""
    keywords = ", ".join(job["keywords"] or []) or "(none provided — infer 3-5 from the angle)"
    user = (
        f"Topic: {job['topic']}\n\nChosen angle: {job['chosen_angle'] or ''}\n\n"
        f"Target total word count: {job['target_word_count'] or 1500} words (your per-section word_counts should sum to roughly this).\n\n"
        f"Target keywords: {keywords}\n\nEditor notes (incorporate these): {notes or '(none)'}\n\n"
        'Return JSON: { "title": string, "title_alternates": [string, string], "meta_description": string (<=155 chars), '
        '"sections": [ { "heading": string, "level": "h2", "intent": string, "word_count": number, "subsections": '
        '[ { "heading": string, "level": "h3", "intent": string } ] } ], "open_questions": [string] }'
    )
    outline = _parse_or_error(ai.claude(model=ai.SONNET, system=prompts.OUTLINE_SYSTEM, content=user, max_tokens=2500))
    execute("UPDATE content_jobs SET outline = %s WHERE id = %s", (Jsonb(outline), job_id))
    open_gate(job_id, 2, "Outline", outline)


def step_draft(job_id: str) -> None:
    job = _job(job_id)
    user = (
        f"Topic: {job['topic']}\n\nAngle: {job['chosen_angle'] or ''}\n\n"
        f"Keywords: {', '.join(job['keywords'] or []) or '(none)'}\n\n"
        f"Target word count: {job['target_word_count'] or 1500} words (aim for +/- 10%).\n\n"
        f"Approved outline (JSON):\n{json.dumps(job['outline'], ensure_ascii=False)}"
    )
    draft_md = ai.strip_fences(ai.claude(model=ai.SONNET, system=prompts.DRAFT_SYSTEM, content=user, max_tokens=8000))
    execute("UPDATE content_jobs SET draft_md = %s WHERE id = %s", (draft_md, job_id))
    open_gate(job_id, 3, "Draft", {"markdown": draft_md})


def _hero_prompt(system: str, user: str) -> str:
    raw = ai.claude(model=ai.HAIKU, system=system, content=user, max_tokens=600)
    parsed = ai.parse_json(raw) or {}
    prompt = str(parsed.get("prompt") or "").strip() or ai.strip_fences(raw)
    if not prompt:
        raise ai.AIError("Claude returned an empty image prompt")
    return prompt


def step_image(job_id: str) -> None:
    job = _job(job_id)
    meta = (job["outline"] or {}).get("meta_description") or ""
    user = (f"Topic: {job['topic']}\n\nAngle: {job['chosen_angle'] or ''}\n\nMeta description: {meta}\n\n"
            'Return JSON: { "prompt": string (50-150 words, vivid and specific), "style": string '
            '(e.g. "editorial photography" or "minimalist illustration") }')
    _render_hero(job_id, _hero_prompt(prompts.HERO_PROMPT_SYSTEM, user))


def step_upload_image(job_id: str) -> None:
    """Image step for blogs uploaded as .docx (they skip Stages 1-3)."""
    job = _job(job_id)
    words = (job["draft_md"] or "").split()
    excerpt = " ".join(words[:60]) + ("…" if len(words) > 60 else "")
    user = (f"Topic: {job['topic']}\n\nBlog excerpt:\n{excerpt}\n\n"
            'Return JSON: { "prompt": string (50-150 words), "style": string }')
    _render_hero(job_id, _hero_prompt(prompts.UPLOAD_HERO_PROMPT_SYSTEM, user))


def _render_hero(job_id: str, prompt: str) -> None:
    image_b64, mime = ai.imagen(prompt, "16:9")
    # Still written to the legacy generated_images table: JobDetail + PendingImages read it.
    with transaction() as conn:
        conn.execute("UPDATE generated_images SET is_chosen = false WHERE job_id = %s", (job_id,))
        img = conn.execute(
            "INSERT INTO generated_images (job_id, prompt, image_b64, mime_type, is_chosen, generated_by) "
            "VALUES (%s, %s, %s, %s, true, %s) RETURNING id",
            (job_id, prompt, image_b64, mime, ai.IMAGEN),
        ).fetchone()
    open_gate(job_id, 4, "Image", {"image_id": str(img["id"]), "prompt": prompt})


# ── Resume handlers: one per gate ────────────────────────────

def _approve_brainstorm(approval_id: str, body: dict) -> tuple[str, Callable[[str], None]]:
    chosen = str(body.get("chosen_angle") or body.get("angle") or "")
    notes = str(body.get("angle_notes") or body.get("notes") or "")
    keywords = _keywords(body.get("keywords"))
    row = _close_gate(approval_id, notes, {"chosen_angle": chosen, "keywords": keywords})
    job_id = str(row["job_id"])
    execute(
        "UPDATE content_jobs SET chosen_angle = %s, keywords = %s, target_word_count = %s, status = 'outline', "
        "data = COALESCE(data, '{}'::jsonb) || %s WHERE id = %s",
        (chosen, keywords, _word_count(body.get("target_word_count")), Jsonb({"angle_notes": notes}), job_id),
    )
    return job_id, step_outline


def _approve_outline(approval_id: str, body: dict) -> tuple[str, Callable[[str], None]]:
    notes = str(body.get("outline_notes") or body.get("notes") or body.get("feedback") or "")
    edited = body.get("edited_outline") or body.get("outline")
    row = _close_gate(approval_id, notes, edited if isinstance(edited, dict) else None)
    job_id = str(row["job_id"])
    if isinstance(edited, dict):
        execute("UPDATE content_jobs SET outline = %s WHERE id = %s", (Jsonb(edited), job_id))
    _set_status(job_id, "drafting")
    return job_id, step_draft


def _approve_draft(approval_id: str, body: dict) -> tuple[str, Callable[[str], None]]:
    notes = str(body.get("draft_notes") or body.get("notes") or body.get("feedback") or "")
    job_id = str(_close_gate(approval_id, notes)["job_id"])
    _set_status(job_id, "image")
    return job_id, step_image


def _approve_image(approval_id: str, body: dict) -> tuple[str, None]:
    notes = str(body.get("image_notes") or body.get("notes") or body.get("feedback") or "")
    job_id = str(_close_gate(approval_id, notes)["job_id"])
    _set_status(job_id, "cms")
    return job_id, None


def _approve_generic(approval_id: str, body: dict) -> tuple[str, None]:
    notes = str(body.get("notes") or body.get("feedback") or "")
    return str(_close_gate(approval_id, notes)["job_id"]), None


HANDLERS: dict[int, Callable[[str, dict], tuple[str, Callable[[str], None] | None]]] = {
    1: _approve_brainstorm,
    2: _approve_outline,
    3: _approve_draft,
    4: _approve_image,
    5: _approve_generic,  # captions: dashboard already saved edits + statuses
}

NEXT_STEP_AFTER: dict[int, tuple[str, Callable[[str], None]]] = {
    1: ("outline", step_outline),
    2: ("draft", step_draft),
    3: ("image", step_image),
}


def resume(approval_id: str, body: dict) -> tuple[str, str | None, Callable[[str], None] | None]:
    """Close the gate and return (job_id, step_name, next_step) for the caller to schedule."""
    gate = fetch_one("SELECT stage_number FROM approval_stages WHERE id = %s", (approval_id,))
    if gate is None:
        raise GateError(404, "Approval not found")
    handler = HANDLERS.get(gate["stage_number"], _approve_generic)
    job_id, nxt = handler(approval_id, body or {})
    name = next((n for n, f in NEXT_STEP_AFTER.values() if f is nxt), None)
    return job_id, name, nxt


def retry_job(job_id: str) -> tuple[str, Callable[[str], None]]:
    """Work out which step a failed/stuck job was in and return it for re-running."""
    job = _job(job_id)
    if fetch_one("SELECT 1 FROM approval_stages WHERE job_id = %s AND status = 'pending'", (job_id,)):
        raise GateError(409, "Job is waiting at an approval gate — approve it instead")
    last = fetch_one(
        "SELECT stage_number FROM approval_stages WHERE job_id = %s AND status = 'approved' "
        "ORDER BY stage_number DESC LIMIT 1", (job_id,))
    if last is None:
        if job["draft_md"] and not job["outline"]:
            name, fn, status = "image", step_upload_image, "image"   # .docx upload path
        else:
            name, fn, status = "brainstorm", step_brainstorm, "brainstorm"
    elif last["stage_number"] in NEXT_STEP_AFTER:
        name, fn = NEXT_STEP_AFTER[last["stage_number"]]
        status = {"outline": "outline", "draft": "drafting", "image": "image"}[name]
    else:
        raise GateError(409, "Nothing to retry — the job is past the AI steps")
    execute("UPDATE content_jobs SET status = %s, data = COALESCE(data, '{}'::jsonb) - 'error' WHERE id = %s",
            (status, job_id))
    return name, fn
