-- ─────────────────────────────────────────────────────────
-- Project Digital — Database Schema
-- PostgreSQL 15+
--
-- Three tables back the whole human-in-the-loop pipeline:
--   content_jobs       one row per topic moving through the workflow
--   approval_stages    one row per approval gate hit by a job (audit trail)
--   platform_captions  per-platform social copy for a job
--
-- Apply locally:
--   docker compose exec -T postgres \
--     psql -U projectdigital -d projectdigital < db/schema.sql
--
-- Or let it auto-run on first DB boot via the docker-compose init mount
-- (see docker-compose.yml -> postgres volumes).
-- ─────────────────────────────────────────────────────────

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ── Enums ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE branch_type      AS ENUM ('blog', 'social');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE job_status       AS ENUM (
    'brainstorm', 'research', 'outline', 'drafting',
    'image', 'cms', 'published', 'scheduled', 'archived', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_status  AS ENUM ('pending', 'approved', 'rejected', 'edited');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE content_type     AS ENUM ('meme', 'static', 'carousel', 'reel', 'blog', 'linkedin_article');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE platform_type    AS ENUM (
    'linkedin', 'pinterest', 'instagram', 'facebook',
    'tiktok', 'youtube', 'x', 'threads'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── content_jobs ───────────────────────────────────────────
-- The master record. One topic = one job. Evolving artifacts
-- (brainstorm/outline/draft/image) live in `data` jsonb so we
-- don't reshape the table every time the workflow grows.
CREATE TABLE IF NOT EXISTS content_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic         TEXT        NOT NULL,
  branch        branch_type NOT NULL,
  status        job_status  NOT NULL DEFAULT 'brainstorm',
  chosen_angle  TEXT,                       -- selected at stage 1
  keywords      TEXT[],                     -- from keyword research
  blog_url      TEXT,                       -- live URL after publish
  shortlink     TEXT,                       -- Bitly shortlink
  image_url     TEXT,                       -- approved hero/social image
  outline           JSONB,                      -- approved outline (stage 2 output)
  draft_md          TEXT,                       -- approved draft (stage 3 output, future)
  target_word_count INTEGER,                    -- editor-chosen draft length (stage 1 input)
  data              JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- brainstorm, misc
  n8n_execution_id TEXT,                    -- ties row back to the n8n run
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent column adds for upgrading existing databases.
ALTER TABLE content_jobs ADD COLUMN IF NOT EXISTS outline           JSONB;
ALTER TABLE content_jobs ADD COLUMN IF NOT EXISTS draft_md          TEXT;
ALTER TABLE content_jobs ADD COLUMN IF NOT EXISTS target_word_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON content_jobs (status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_branch ON content_jobs (branch);

-- ── approval_stages ────────────────────────────────────────
-- Audit trail of every gate. n8n inserts a 'pending' row and
-- pauses; the Appsmith dashboard flips it to approved/edited;
-- a webhook resumes the workflow. Never auto-advance.
CREATE TABLE IF NOT EXISTS approval_stages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  stage_number   SMALLINT NOT NULL CHECK (stage_number BETWEEN 1 AND 6),
  stage_name     TEXT NOT NULL,
  content        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- what's under review
  edited_content JSONB,                                -- human edits, if any
  status         approval_status NOT NULL DEFAULT 'pending',
  feedback       TEXT,
  resume_url     TEXT,                                 -- n8n webhook to resume this gate
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_approval_stages_job    ON approval_stages (job_id);
CREATE INDEX IF NOT EXISTS idx_approval_stages_status ON approval_stages (status);

-- ── images ─────────────────────────────────────────────────
-- Unified image library. Both AI-generated images (Stage 4) and
-- user-uploaded images live here. Jobs reference a chosen image
-- via content_jobs.chosen_image_id.
CREATE TABLE IF NOT EXISTS images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,                        -- 'ai_generated' | 'upload'
  prompt        TEXT,                                  -- nullable; only AI-generated has one
  image_b64     TEXT NOT NULL,                        -- raw base64 (no data: prefix)
  mime_type     TEXT NOT NULL DEFAULT 'image/png',
  title         TEXT,                                  -- user-provided label (for uploads)
  generated_by  TEXT,                                  -- 'imagen-3.0-generate-002' / 'manual' / etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_images_source     ON images (source);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images (created_at DESC);

-- content_jobs.chosen_image_id — the library image the editor picked at Stage 4
ALTER TABLE content_jobs
  ADD COLUMN IF NOT EXISTS chosen_image_id UUID REFERENCES images(id) ON DELETE SET NULL;

ALTER TABLE images ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ── image_maker_projects ───────────────────────────────────
-- Standalone branded-image tool (separate from the blog/social job
-- pipeline): reference image + instruction in -> edited image + 3 slogans
-- out, in one step. Multiple projects persist side by side; nothing here
-- ties back to content_jobs.
DO $$ BEGIN
  CREATE TYPE image_maker_status AS ENUM ('generating', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS image_maker_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction          TEXT NOT NULL,
  reference_image_b64  TEXT NOT NULL,
  reference_mime_type  TEXT NOT NULL,
  status               image_maker_status NOT NULL DEFAULT 'generating',
  slogans              JSONB,
  generated_image_b64  TEXT,
  generated_mime_type  TEXT,
  error                TEXT,
  saved_to_library     BOOLEAN NOT NULL DEFAULT false,
  library_image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_maker_projects_status     ON image_maker_projects (status);
CREATE INDEX IF NOT EXISTS idx_image_maker_projects_created_at ON image_maker_projects (created_at DESC);

-- ── inspiration_items ──────────────────────────────────────
-- Swipe-file capture: Jieshen forwards a trending photo/video to a
-- Telegram bot; n8n tags it with an AI-assigned category + summary.
-- Feeds the Brainstorm stage with fresh angles by category. Standalone —
-- nothing here ties back to content_jobs.
DO $$ BEGIN
  CREATE TYPE inspiration_type AS ENUM ('image', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inspiration_category AS ENUM (
    'tv_shows', 'streaming', 'gadgets', 'tools', 'games',
    'movies', 'ai', 'anime', 'esports', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inspiration_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                 inspiration_type NOT NULL,
  category             inspiration_category NOT NULL DEFAULT 'other',
  source_caption       TEXT,
  telegram_chat_id     TEXT,
  telegram_message_id  TEXT,
  preview_b64          TEXT,
  preview_mime_type    TEXT DEFAULT 'image/jpeg',
  ai_summary           TEXT,
  ai_tags              TEXT[],
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspiration_items_category   ON inspiration_items (category);
CREATE INDEX IF NOT EXISTS idx_inspiration_items_type       ON inspiration_items (type);
CREATE INDEX IF NOT EXISTS idx_inspiration_items_created_at ON inspiration_items (created_at DESC);

-- ── guideline_items ────────────────────────────────────────
-- Branch 4 — Guidelines Capture: dashboard upload of a PDF, blog URL, or
-- screenshot of reference/guideline material. n8n asks Claude to extract
-- the text and suggest a category + summary; Jieshen confirms/edits the
-- category; on confirm, n8n narrates the summary (OpenAI TTS) and the item
-- becomes a published guideline page. Standalone — nothing here ties back
-- to content_jobs.
DO $$ BEGIN
  CREATE TYPE guideline_source_type AS ENUM ('pdf', 'blog', 'screenshot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE guideline_status AS ENUM ('pending_review', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS guideline_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type        guideline_source_type NOT NULL,
  title              TEXT NOT NULL DEFAULT 'Untitled guideline',
  source_url         TEXT,
  file_b64           TEXT,
  file_mime_type     TEXT,
  extracted_text     TEXT,
  ai_category        TEXT,
  category           TEXT,
  ai_summary         TEXT,
  audio_b64          TEXT,
  audio_mime_type    TEXT DEFAULT 'audio/mpeg',
  status             guideline_status NOT NULL DEFAULT 'pending_review',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guideline_items_status      ON guideline_items (status);
CREATE INDEX IF NOT EXISTS idx_guideline_items_source_type ON guideline_items (source_type);
CREATE INDEX IF NOT EXISTS idx_guideline_items_created_at  ON guideline_items (created_at DESC);

-- ── image_checks ───────────────────────────────────────────
-- Standalone pre-send QC tool: any image + the brief/request it was
-- supposed to fulfil in -> AI content summary, grammar check of any text
-- baked into the image, and a match verdict against the request. Exists
-- to catch "wrong image sent for the wrong request" before it goes out.
-- Standalone — nothing here ties back to content_jobs.
DO $$ BEGIN
  CREATE TYPE image_check_status AS ENUM ('checking', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_check_verdict AS ENUM ('match', 'partial_match', 'mismatch');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS image_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_text     TEXT NOT NULL,           -- what was requested/asked for
  image_b64        TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  status           image_check_status NOT NULL DEFAULT 'checking',
  summary          TEXT,                    -- AI description of what's in the image
  extracted_text   TEXT,                    -- any text/caption found baked into the image
  grammar_issues   JSONB,                   -- array of {issue, suggestion} objects
  verdict          image_check_verdict,     -- does the image match request_text?
  verdict_reason   TEXT,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_checks_status     ON image_checks (status);
CREATE INDEX IF NOT EXISTS idx_image_checks_created_at ON image_checks (created_at DESC);

-- ── video_templates ────────────────────────────────────────
-- Branch 5 — Video to Template: Jieshen pastes a YouTube URL and picks a
-- mode. Gemini watches the video directly (fileData with the URL, no
-- download/ffmpeg) and extracts either a Mermaid flowchart of the process
-- or an ordered checklist (downloadable client-side as Excel/PPT).
-- Standalone — no approval gate; the rendered result in the dashboard is
-- itself the review step. Nothing here ties back to content_jobs.
DO $$ BEGIN
  CREATE TYPE video_template_mode AS ENUM ('flowchart', 'checklist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE video_template_status AS ENUM ('processing', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS video_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_url     TEXT NOT NULL,
  mode            video_template_mode NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  ai_summary      TEXT,
  mermaid_code    TEXT,
  checklist_json  JSONB,
  status          video_template_status NOT NULL DEFAULT 'processing',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT video_templates_mode_payload CHECK (
    (mode = 'flowchart' AND (status != 'ready' OR mermaid_code IS NOT NULL)) OR
    (mode = 'checklist' AND (status != 'ready' OR checklist_json IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS idx_video_templates_mode       ON video_templates (mode);
CREATE INDEX IF NOT EXISTS idx_video_templates_status     ON video_templates (status);
CREATE INDEX IF NOT EXISTS idx_video_templates_created_at ON video_templates (created_at DESC);

-- ── platform_captions ──────────────────────────────────────
-- Per-platform social copy. One row per (job, platform).
-- CLAUDE.md rule: captions are written separately per platform.
CREATE TABLE IF NOT EXISTS platform_captions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID NOT NULL REFERENCES content_jobs(id) ON DELETE CASCADE,
  platform       platform_type NOT NULL,
  content_type   content_type  NOT NULL,
  aspect_ratio   TEXT NOT NULL,                        -- '4:5' or '9:16'
  caption        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- platform-shaped output from prompt
  status         approval_status NOT NULL DEFAULT 'pending',
  image_url      TEXT,                                 -- platform-resized asset
  metricool_post_id TEXT,                              -- Metricool post id once scheduled (API path only)
  scheduled_at   TIMESTAMPTZ,
  posted_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_captions_job      ON platform_captions (job_id);
CREATE INDEX IF NOT EXISTS idx_platform_captions_platform ON platform_captions (platform);

-- ── image gen (brand_projects / brand_references / image_gen_jobs / image_gen_generations)
-- Standalone "Contact Sheet to Post" tool (HANDOFF.md): ask + a brand's
-- reference images -> drafted prompt checked against the brand brief ->
-- rendered per size -> human review per image. See db/migrate-image-gen.sql.
DO $$ BEGIN
  CREATE TYPE image_gen_job_status AS ENUM ('queued', 'running', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_gen_render_status AS ENUM ('rendering', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE image_gen_review_status AS ENUM ('pending', 'approved', 'changes', 'bg_only', 'split');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per brand ("Project" in the UI).
CREATE TABLE IF NOT EXISTS brand_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  brief       TEXT NOT NULL DEFAULT '',   -- brand rules the drafted prompt is checked against
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reference images per brand. Separate table (not a JSON array on the
-- brand) so the project list doesn't drag every base64 blob along.
CREATE TABLE IF NOT EXISTS brand_references (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brand_projects(id) ON DELETE CASCADE,
  label       TEXT,
  image_b64   TEXT NOT NULL,              -- raw base64 (no data: prefix)
  mime_type   TEXT NOT NULL DEFAULT 'image/png',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_references_brand ON brand_references (brand_id);

-- One row per queued render. status IS the queue — no separate table.
CREATE TABLE IF NOT EXISTS image_gen_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brand_projects(id) ON DELETE CASCADE,
  prompt_raw      TEXT NOT NULL,          -- the ask, as typed
  prompt_drafted  TEXT NOT NULL,          -- the (human-edited) prompt actually rendered
  brief_check     JSONB,                  -- {passes, issues[], notes}
  sizes           JSONB NOT NULL,         -- e.g. ["post","story"]
  reference_ids   UUID[] NOT NULL DEFAULT '{}',  -- exact brand_references used
  parent_job_id   UUID REFERENCES image_gen_jobs(id) ON DELETE SET NULL,  -- set by "request changes"
  change_note     TEXT,                   -- the edit note that produced this job
  status          image_gen_job_status NOT NULL DEFAULT 'queued',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_gen_jobs_brand      ON image_gen_jobs (brand_id);
CREATE INDEX IF NOT EXISTS idx_image_gen_jobs_status     ON image_gen_jobs (status);
CREATE INDEX IF NOT EXISTS idx_image_gen_jobs_created_at ON image_gen_jobs (created_at DESC);

-- One row per (job, size). The render workflow fills image_b64; the
-- dashboard records the human review decision.
CREATE TABLE IF NOT EXISTS image_gen_generations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES image_gen_jobs(id) ON DELETE CASCADE,
  size              TEXT NOT NULL,        -- 'post' | 'portrait' | 'story' | 'banner'
  render_status     image_gen_render_status NOT NULL DEFAULT 'rendering',
  image_b64         TEXT,
  mime_type         TEXT,
  generated_by      TEXT,
  error             TEXT,
  review_status     image_gen_review_status NOT NULL DEFAULT 'pending',
  review_notes      TEXT,
  reviewed_at       TIMESTAMPTZ,
  library_image_id  UUID REFERENCES images(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, size)
);

CREATE INDEX IF NOT EXISTS idx_image_gen_generations_job    ON image_gen_generations (job_id);
CREATE INDEX IF NOT EXISTS idx_image_gen_generations_review ON image_gen_generations (review_status);

-- ── updated_at auto-touch ──────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['content_jobs', 'approval_stages', 'platform_captions', 'image_maker_projects', 'inspiration_items', 'guideline_items', 'image_checks', 'video_templates', 'brand_projects', 'image_gen_jobs', 'image_gen_generations'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', t);
  END LOOP;
END $$;

COMMIT;
