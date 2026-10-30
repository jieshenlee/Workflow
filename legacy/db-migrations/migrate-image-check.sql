-- db/migrate-image-check.sql
-- Image Checker: standalone pre-send QC tool. Any image + the brief/request
-- it was supposed to fulfil in -> AI content summary, grammar check of any
-- text baked into the image, and a match verdict against the request.
-- Exists to catch "wrong image sent for the wrong request" before it goes
-- out. Nothing here ties back to content_jobs.
--
-- Apply:
--   Get-Content db\migrate-image-check.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

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

DROP TRIGGER IF EXISTS trg_touch_image_checks ON image_checks;
CREATE TRIGGER trg_touch_image_checks BEFORE UPDATE ON image_checks
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
