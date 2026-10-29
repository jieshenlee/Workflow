"""Standalone tools + Image Gen."""

from .conftest import PNG


def test_image_maker(client, fakes):
    res = client.post("/api/image-maker", json={"instruction": "make it yellow", "reference_image_b64": PNG})
    body = res.json()
    assert body["ok"] and body["image_b64"] == PNG and body["slogans"] == ["s1", "s2", "s3"]
    assert client.post("/api/image-maker", json={"instruction": ""}).status_code == 400


def test_image_check_defaults_unknown_verdict(client, fakes):
    body = client.post("/api/image-check", json={"request_text": "a cat", "image_b64": PNG}).json()
    assert body["verdict"] == "partial_match" and body["summary"] == "A cat"
    assert fakes.claude_calls[-1]["content"][0]["type"] == "image"


def test_inspiration_photo_and_video(client, db, fakes):
    body = client.post("/api/inspiration-upload", json={"type": "image", "file_b64": PNG, "mime_type": "image/png"}).json()
    assert body == {"success": True, "category": "gadgets", "summary": "S"}
    body = client.post("/api/inspiration-upload", json={"type": "video", "file_b64": "VID", "mime_type": "video/mp4",
                                                        "preview_b64": PNG, "preview_mime_type": "image/jpeg"}).json()
    assert body["category"] == "other"  # model returned a category outside the list
    rows = db.execute("SELECT type, ai_tags, preview_mime_type FROM inspiration_items ORDER BY created_at").fetchall()
    assert rows[-2]["ai_tags"] == ["a", "b", "c", "d", "e"] and rows[-1]["preview_mime_type"] == "image/jpeg"


def test_guidelines_upload_and_confirm(client, db, fakes):
    body = client.post("/api/guideline-upload", json={"source_type": "pdf", "title": "", "file_b64": "JVBERi0="}).json()
    assert body["success"] and body["title"] == "Brand Voice Guide" and body["category"] == "Brand Voice"
    assert fakes.claude_calls[-1]["content"][0]["type"] == "document"

    blog = client.post("/api/guideline-upload", json={"source_type": "blog", "source_url": "https://example.com/g"}).json()
    assert "Guide & rules" in fakes.claude_calls[-1]["content"][0]["text"]
    assert "<script>" not in fakes.claude_calls[-1]["content"][0]["text"]

    assert client.post("/api/guideline-confirm", json={"id": blog["id"], "category": "SEO", "summary": "S"}).json()["success"]
    row = db.execute("SELECT status, category, audio_mime_type FROM guideline_items WHERE id = %s", (blog["id"],)).fetchone()
    assert row == {"status": "published", "category": "SEO", "audio_mime_type": "audio/mpeg"}


def test_video_template_gemini_then_fallback(client, db, fakes):
    body = client.post("/api/video-template-extract", json={"youtube_url": "https://youtu.be/x", "mode": "checklist"}).json()
    assert body["success"] and body["checklist"] == [{"step": "Do it", "detail": ""}]

    fakes.gemini_video_fails = True
    body = client.post("/api/video-template-extract", json={"youtube_url": "https://youtu.be/x", "mode": "flowchart"}).json()
    assert body["success"] and body["status"] == "ready"
    assert body["mermaid"] == 'flowchart TD\nA["Start (here)"] --> B{"Ok?"}'
    assert "Transcript:\nfirst do this" in fakes.claude_calls[-1]["content"][0]["text"]
    row = db.execute("SELECT status, mermaid_code FROM video_templates WHERE id = %s", (body["id"],)).fetchone()
    assert row["status"] == "ready"


def test_video_template_both_fail(client, fakes, monkeypatch):
    from app.routers import tools

    fakes.gemini_video_fails = True

    def no_captions(url):
        raise ValueError("This video has no captions available")

    monkeypatch.setattr(tools, "youtube_transcript", no_captions)
    body = client.post("/api/video-template-extract", json={"youtube_url": "https://youtu.be/y"}).json()
    assert body["success"] is False and body["error"] == "This video has no captions available"


def test_vtt_to_text_dedupes():
    from app.routers.tools import vtt_to_text
    vtt = "WEBVTT\nKind: captions\n\n00:00.000 --> 00:01.000\n<c>hello</c> &amp; hi\n\n2\n00:01 --> 00:02\nhello &amp; hi\nnext"
    assert vtt_to_text(vtt) == "hello & hi next"


def test_image_gen_draft_and_render(client, db, fakes):
    brand = db.execute("INSERT INTO brand_projects (name, brief) VALUES ('PayGo', 'teal') RETURNING id").fetchone()["id"]
    ref = db.execute("INSERT INTO brand_references (brand_id, image_b64, mime_type) VALUES (%s, %s, 'image/png') RETURNING id",
                     (brand, PNG)).fetchone()["id"]

    d = client.post("/api/image-gen/draft", json={"ask": "summer sale", "brief": "teal", "sizes": ["post"],
                                                  "references": [{"b64": PNG, "mime": "image/png"}],
                                                  "previous_prompt": "old", "change_note": "brighter"}).json()
    assert d["prompt"] == "Teal beach scene"
    assert d["brief_check"] == {"passes": False, "issues": ["Logo missing"], "notes": "ok"}  # issues force passes=false
    call = fakes.claude_calls[-1]
    assert "art director writing prompts" in call["system"]  # loaded from prompts/image-gen-draft.md
    assert call["content"][0]["type"] == "image" and "Reviewer's requested changes:\nbrighter" in call["content"][-1]["text"]

    job = db.execute("INSERT INTO image_gen_jobs (brand_id, prompt_raw, prompt_drafted, sizes, reference_ids) "
                     "VALUES (%s, 'ask', 'Teal beach', '[\"post\",\"story\"]', ARRAY[%s]::uuid[]) RETURNING id",
                     (brand, ref)).fetchone()["id"]
    for size in ("post", "story"):
        db.execute("INSERT INTO image_gen_generations (job_id, size) VALUES (%s, %s)", (job, size))
    fakes.gemini_fail_sizes = {"9:16"}
    assert client.post("/api/image-gen/render", json={"job_id": str(job)}).status_code == 200

    gens = {g["size"]: g for g in db.execute("SELECT * FROM image_gen_generations WHERE job_id = %s", (job,)).fetchall()}
    assert gens["post"]["render_status"] == "done" and gens["post"]["image_b64"] == PNG
    assert gens["story"]["render_status"] == "failed" and "SAFETY" in gens["story"]["error"]
    j = db.execute("SELECT status, error FROM image_gen_jobs WHERE id = %s", (job,)).fetchone()
    assert j == {"status": "done", "error": "1 of 2 sizes failed"}
    renders = [c for c in fakes.gemini_calls if c["model"] == "gemini-2.5-flash-image"][-2:]
    assert {c["body"]["generationConfig"]["imageConfig"]["aspectRatio"] for c in renders} == {"1:1", "9:16"}
    assert all(len(c["body"]["contents"][0]["parts"]) == 2 for c in renders)  # prompt + 1 reference

    # Retry only the failed size (the dashboard resets it to 'rendering').
    fakes.gemini_fail_sizes = set()
    db.execute("UPDATE image_gen_generations SET render_status = 'rendering' WHERE job_id = %s AND size = 'story'", (job,))
    client.post("/api/image-gen/render", json={"job_id": str(job)})
    assert db.execute("SELECT status, error FROM image_gen_jobs WHERE id = %s", (job,)).fetchone() == {"status": "done", "error": None}


def test_health_reports_keys(client):
    body = client.get("/health").json()
    assert body["ok"] and body["keys"]["anthropic"] is True


def test_cors_preflight_from_dashboard(client):
    res = client.options("/api/start-blog", headers={
        "Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"})
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
