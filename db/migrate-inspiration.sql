-- db/migrate-inspiration.sql
-- Inspiration / swipe-file capture: Jieshen forwards a trending photo or
-- video to a Telegram bot; n8n tags it with an AI-assigned category +
-- summary and stores it here so the Brainstorm stage can pull fresh
-- angles by category later.
--
-- Apply:
--   Get-Content db\migrate-inspiration.sql | docker compose exec -T postgres psql -U projectdigital -d projectdigital
-- Then:
--   docker compose restart postgrest

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
  source_caption       TEXT,                          -- whatever text/link Jieshen sent along with the forward
  telegram_chat_id     TEXT,
  telegram_message_id  TEXT,
  preview_b64          TEXT,                           -- image: the photo itself; video: Telegram's auto-thumbnail
  preview_mime_type    TEXT DEFAULT 'image/jpeg',
  ai_summary           TEXT,                           -- 1-2 sentence "why this works" / content angle
  ai_tags              TEXT[],
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspiration_items_category   ON inspiration_items (category);
CREATE INDEX IF NOT EXISTS idx_inspiration_items_type       ON inspiration_items (type);
CREATE INDEX IF NOT EXISTS idx_inspiration_items_created_at ON inspiration_items (created_at DESC);

DROP TRIGGER IF EXISTS trg_touch_inspiration_items ON inspiration_items;
CREATE TRIGGER trg_touch_inspiration_items BEFORE UPDATE ON inspiration_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
