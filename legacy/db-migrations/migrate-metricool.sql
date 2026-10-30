-- One-time column rename for platform_captions:
--   buffer_post_id (original)  →  metricool_post_id (current)
--   postiz_post_id (interim)   →  metricool_post_id (current)
-- Apply once after switching to Metricool (2026-06-01). Idempotent and
-- handles whichever name the column currently has.

BEGIN;

DO $$
BEGIN
  -- Already on metricool_post_id: nothing to do.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_captions' AND column_name = 'metricool_post_id'
  ) THEN
    RETURN;
  END IF;

  -- Came from the Postiz rename: rename forward.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_captions' AND column_name = 'postiz_post_id'
  ) THEN
    ALTER TABLE platform_captions RENAME COLUMN postiz_post_id TO metricool_post_id;
    RETURN;
  END IF;

  -- Original Buffer name: rename forward.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'platform_captions' AND column_name = 'buffer_post_id'
  ) THEN
    ALTER TABLE platform_captions RENAME COLUMN buffer_post_id TO metricool_post_id;
    RETURN;
  END IF;
END $$;

COMMIT;

-- After running this, restart PostgREST so it picks up the renamed column:
--   docker compose restart postgrest
