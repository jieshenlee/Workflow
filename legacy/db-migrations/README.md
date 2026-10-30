# Archived: Docker-era database migrations

These upgraded the old local Docker Postgres one feature at a time. They
aren't needed on Supabase: `db/schema.sql` creates every table in its
current shape, and `backend/scripts/setup_db.py` applies it.

Still useful: `migrate-images.sql` backfills the unified `images` table
from the legacy `generated_images` table. If the Image Library is empty
after `copy_data`, run it once in Supabase → SQL Editor.
