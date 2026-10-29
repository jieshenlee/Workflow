"""Blog path end to end: start -> 4 approval gates -> cms -> publish -> repurpose -> captions gate."""


def pending_gate(db, job_id, stage):
    return db.execute("SELECT * FROM approval_stages WHERE job_id = %s AND stage_number = %s", (job_id, stage)).fetchone()


def approve(client, gate, body):
    # The dashboard POSTs straight to resume_url; use its path the same way.
    path = gate["resume_url"].split("8000", 1)[1]
    return client.post(path, json=body)


def test_full_blog_path(client, db, fakes):
    res = client.post("/api/start-blog", json={"topic": "Pricing for freelancers"})
    assert res.status_code == 200
    job_id = res.json()["job_id"]

    # Stage 1 — brainstorm saved to data, gate open with an API resume_url.
    job = db.execute("SELECT * FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["status"] == "brainstorm" and job["data"]["angles"][0]["headline"] == "Angle A"
    g1 = pending_gate(db, job_id, 1)
    assert g1["status"] == "pending" and g1["resume_url"].endswith(f"/api/approvals/{g1['id']}/resume")

    res = approve(client, g1, {"chosen_angle": "Angle A", "angle_notes": "punchy", "keywords": "pricing, rates , ",
                               "target_word_count": 99999})
    assert res.json()["next"] == "outline"
    job = db.execute("SELECT * FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["chosen_angle"] == "Angle A" and job["keywords"] == ["pricing", "rates"]
    assert job["target_word_count"] == 1500  # out of range -> default, same as n8n
    assert job["outline"]["title"] == "T"  # fenced JSON parsed
    outline_prompt = fakes.claude_calls[-1]["content"]
    assert "Editor notes (incorporate these): punchy" in outline_prompt and "pricing, rates" in outline_prompt
    assert pending_gate(db, job_id, 1)["status"] == "approved"

    # Approving the same gate twice is rejected, not re-run.
    assert approve(client, g1, {}).status_code == 409

    # Stage 2 -> draft
    res = approve(client, pending_gate(db, job_id, 2), {"outline_notes": "ok"})
    assert res.json()["next"] == "draft"
    job = db.execute("SELECT status, draft_md FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["status"] == "drafting" and job["draft_md"].startswith("# Title")
    assert pending_gate(db, job_id, 3)["content"] == {"markdown": job["draft_md"]}

    # Stage 3 -> image
    approve(client, pending_gate(db, job_id, 3), {"draft_notes": ""})
    img = db.execute("SELECT * FROM generated_images WHERE job_id = %s", (job_id,)).fetchone()
    assert img["is_chosen"] and img["generated_by"] == "imagen-4.0-generate-001" and img["prompt"] == "A hero image"
    g4 = pending_gate(db, job_id, 4)
    assert g4["content"]["image_id"] == str(img["id"])

    # Stage 4 -> cms
    res = approve(client, g4, {"image_notes": "nice"})
    assert res.json()["next"] is None
    assert db.execute("SELECT status FROM content_jobs WHERE id = %s", (job_id,)).fetchone()["status"] == "cms"

    # Publish panel: meta generation + publish to Sanity
    assert client.post("/api/generate-meta", json={"job_id": job_id, "field": "alt"}).json() == {"alt": "gen alt"}
    assert client.post("/api/generate-meta", json={"job_id": job_id, "field": "bogus"}).json() == {"excerpt": "gen excerpt"}
    res = client.post("/api/publish-cms", json={"job_id": job_id, "title": "My Post!", "slug": "", "author": "Jieshen",
                                               "category": "Business", "reading_time": "7", "cover_alt": "alt"})
    assert res.status_code == 200, res.text
    assert res.json()["blog_url"].endswith("/blog/my-post")
    upload, mutate = [c for c in fakes.http_calls if c[0] == "POST"][-2:]
    assert "/assets/images/production" in upload[1] and upload[2]["headers"]["Content-Type"] == "image/png"
    muts = mutate[2]["json"]["mutations"]
    post = muts[2]["create"]
    assert muts[0]["createIfNotExists"]["_id"] == "author-jieshen"
    assert post["readingTime"] == 7 and post["coverImage"]["asset"]["_ref"] == "image-abc"
    assert [b["style"] for b in post["body"]] == ["h1", "normal", "normal", "normal"]
    assert post["body"][2]["listItem"] == "bullet"
    job = db.execute("SELECT status, blog_url FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["status"] == "published"

    # Repurpose -> captions + stage-5 gate (shortlink fetched since none stored)
    assert client.post("/api/repurpose-social", json={"job_id": job_id, "platforms": ["linkedin", "x"]}).status_code == 200
    caps = db.execute("SELECT platform, caption FROM platform_captions WHERE job_id = %s ORDER BY platform", (job_id,)).fetchall()
    assert [c["platform"] for c in caps] == ["linkedin", "x"]
    assert "Short link: https://tinyurl.com/abc" in fakes.claude_calls[-1]["content"]
    g5 = pending_gate(db, job_id, 5)
    assert g5["content"] == {"platforms": ["linkedin", "x"]}
    approve(client, g5, {"approved": True})
    assert pending_gate(db, job_id, 5)["status"] == "approved"


def test_upload_blog_starts_at_image_stage(client, db, fakes):
    res = client.post("/api/upload-blog", json={"topic": "Docx post", "draft_md": "word " * 100})
    job_id = res.json()["job_id"]
    assert db.execute("SELECT status FROM content_jobs WHERE id = %s", (job_id,)).fetchone()["status"] == "image"
    assert "…" in fakes.claude_calls[-1]["content"]  # 60-word excerpt
    assert pending_gate(db, job_id, 4)["status"] == "pending"


def test_failed_step_marks_job_and_retry_resumes(client, db, fakes, monkeypatch):
    from app import ai

    def boom(**kw):
        raise ai.AIError("api.anthropic.com 529: overloaded")

    monkeypatch.setattr(ai, "claude", boom)
    job_id = client.post("/api/start-blog", json={"topic": "x"}).json()["job_id"]
    job = db.execute("SELECT status, data FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["status"] == "failed" and "overloaded" in job["data"]["error"]["message"]

    monkeypatch.setattr(ai, "claude", fakes.claude)
    assert client.post(f"/api/jobs/{job_id}/retry").json()["step"] == "brainstorm"
    job = db.execute("SELECT status, data FROM content_jobs WHERE id = %s", (job_id,)).fetchone()
    assert job["status"] == "brainstorm" and "error" not in job["data"]
    assert pending_gate(db, job_id, 1)["status"] == "pending"
    # Waiting at a gate -> nothing to retry.
    assert client.post(f"/api/jobs/{job_id}/retry").status_code == 409


def test_unknown_approval_404(client, fakes):
    assert client.post("/api/approvals/00000000-0000-0000-0000-000000000000/resume", json={}).status_code == 404


def test_shorten(client, fakes):
    assert client.get("/api/shorten", params={"url": "https://x.com"}).json() == {"ok": True, "shortlink": "https://tinyurl.com/abc"}


def test_migration_repoints_pending_n8n_gates(client, db, fakes):
    from pathlib import Path

    job_id = client.post("/api/start-blog", json={"topic": "legacy"}).json()["job_id"]
    db.execute("UPDATE approval_stages SET resume_url = 'http://localhost:5678/webhook-waiting/123' WHERE job_id = %s", (job_id,))
    db.execute((Path(__file__).resolve().parents[2] / "db" / "migrate-python-backend.sql").read_text())
    gate = pending_gate(db, job_id, 1)
    assert gate["resume_url"] == f"http://localhost:8000/api/approvals/{gate['id']}/resume"
    assert approve(client, gate, {"chosen_angle": "Angle A"}).status_code == 200
