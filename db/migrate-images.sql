-- One-time backfill: move every existing generated_images row into the unified
-- `images` table, and set each job's chosen_image_id pointer.
-- Idempotent (ON CONFLICT DO NOTHING) — safe to re-run.

BEGIN;

INSERT INTO images (id, source, prompt, image_b64, mime_type, generated_by, created_at)
SELECT id, 'ai_generated', prompt, image_b64, mime_type, generated_by, created_at
FROM generated_images
ON CONFLICT (id) DO NOTHING;

UPDATE content_jobs cj
SET chosen_image_id = gi.id
FROM generated_images gi
WHERE gi.job_id = cj.id
  AND gi.is_chosen = TRUE
  AND cj.chosen_image_id IS DISTINCT FROM gi.id;

COMMIT;

-- After running this, restart PostgREST so the new endpoints/embeds are picked up:
--   docker compose restart postgrest
