-- db/migrate-image-gen.sql
-- Image Gen ("Contact Sheet to Post", ported from HANDOFF.md): a short ask
-- + a brand's reference images -> AI-drafted prompt checked against the
-- brand brief -> human edits the prompt -> rendered at each requested size
-- -> human review per image (approve / request changes / bg only / split).
--
-- A brand is shown in the dashboard as a "Project". References are applied
-- live on every render (no per-brand model training).
--
-- Idempotent — safe to re-run.
--
-- Apply:
--   Get-Content db\migrate-image-gen.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

BEGIN;

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

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_projects', 'image_gen_jobs', 'image_gen_generations'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;
       CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', t);
  END LOOP;
END $$;

COMMIT;
