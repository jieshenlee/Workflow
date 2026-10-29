-- db/migrate-guidelines.sql
-- Branch 4 — Guidelines Capture: Jieshen uploads a PDF, blog URL, or
-- screenshot of reference/guideline material from the dashboard. n8n asks
-- Claude to extract the text and suggest a category + summary; Jieshen
-- confirms/edits the category from the "Pending review" list; on confirm,
-- n8n generates an audio narration of the summary (OpenAI TTS) and the item
-- becomes a published guideline page in the dashboard.
--
-- Apply:
--   Get-Content db\migrate-guidelines.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

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
  source_url         TEXT,                           -- blog only
  file_b64           TEXT,                           -- pdf/screenshot only, kept for re-reference
  file_mime_type     TEXT,
  extracted_text     TEXT,                           -- full text Claude pulled from the source
  ai_category        TEXT,                           -- Claude's suggestion, never overwritten
  category           TEXT,                           -- human-confirmed/edited value shown everywhere
  ai_summary         TEXT,                           -- 2-3 sentence summary; also the audio script
  audio_b64          TEXT,
  audio_mime_type    TEXT DEFAULT 'audio/mpeg',
  status             guideline_status NOT NULL DEFAULT 'pending_review',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guideline_items_status      ON guideline_items (status);
CREATE INDEX IF NOT EXISTS idx_guideline_items_source_type ON guideline_items (source_type);
CREATE INDEX IF NOT EXISTS idx_guideline_items_created_at  ON guideline_items (created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_guideline_items ON guideline_items;
CREATE TRIGGER trg_touch_guideline_items BEFORE UPDATE ON guideline_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
