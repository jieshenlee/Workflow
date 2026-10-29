-- db/migrate-image-maker.sql
-- Image Maker: one action — reference image + instruction -> edited image
-- + 3 slogans. No vision analysis, no font detection, no approval gate.
-- Multiple projects persist so you can run several and revisit any of them.
--
-- Apply:
--   Get-Content db\migrate-image-maker.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

ALTER TABLE images ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Only test rows existed under the old (more complex) shape — safe to drop.
DROP TABLE IF EXISTS image_maker_projects;
DROP TYPE IF EXISTS image_maker_status;

CREATE TYPE image_maker_status AS ENUM ('generating', 'completed', 'failed');

CREATE TABLE image_maker_projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instruction          TEXT NOT NULL,             -- e.g. "I need a yellow version of this"
  reference_image_b64  TEXT NOT NULL,
  reference_mime_type  TEXT NOT NULL,
  status               image_maker_status NOT NULL DEFAULT 'generating',
  slogans              JSONB,                     -- array of 3 slogan strings
  generated_image_b64  TEXT,
  generated_mime_type  TEXT,
  error                TEXT,
  saved_to_library     BOOLEAN NOT NULL DEFAULT false,
  library_image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_maker_projects_status     ON image_maker_projects (status);
CREATE INDEX idx_image_maker_projects_created_at ON image_maker_projects (created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_image_maker_projects ON image_maker_projects;
CREATE TRIGGER trg_touch_image_maker_projects BEFORE UPDATE ON image_maker_projects
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
