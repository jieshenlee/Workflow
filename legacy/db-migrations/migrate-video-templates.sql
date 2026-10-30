-- db/migrate-video-templates.sql
-- Branch 5 — Video to Template: Jieshen pastes a YouTube URL and picks one
-- of two modes. Gemini watches the video directly (fileData with the
-- YouTube URL, no download/ffmpeg) and extracts either a Mermaid flowchart
-- of the process (Tutorial -> Flowchart) or an ordered checklist
-- (Video -> Checklist, downloadable client-side as Excel/PPT). Standalone —
-- no approval gate, nothing here ties back to content_jobs. The rendered
-- flowchart / editable checklist in the dashboard is itself the review step,
-- same precedent as the standalone Image Checker tool.
--
-- Apply:
--   Get-Content db\migrate-video-templates.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

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
  mermaid_code    TEXT,           -- flowchart mode only
  checklist_json  JSONB,          -- checklist mode only: [{step, detail}, ...]
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

DROP TRIGGER IF EXISTS trg_touch_video_templates ON video_templates;
CREATE TRIGGER trg_touch_video_templates BEFORE UPDATE ON video_templates
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
