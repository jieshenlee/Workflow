"""One-time copy of your existing data from the old Docker Postgres into Supabase.

    docker start projectdigital_postgres   # the old Docker database, one last time
    cd backend
    python -m scripts.copy_data --from "postgresql://projectdigital:<POSTGRES_PASSWORD>@localhost:5432/projectdigital"

Run scripts.setup_db first. Copies every table (parents before children),
skipping tables that already have rows in Supabase, then re-points any
approval gates still waiting on n8n at the API.
"""

import argparse
import sys
from pathlib import Path

import psycopg
from psycopg import sql

from app.config import settings

# Parents before children so foreign keys are satisfied row by row.
TABLE_ORDER = [
    "images", "content_jobs", "approval_stages", "platform_captions", "generated_images",
    "image_maker_projects", "inspiration_items", "guideline_items", "image_checks", "video_templates",
    "brand_projects", "brand_references", "image_gen_jobs", "image_gen_generations",
]
REPOINT_GATES = (Path(__file__).resolve().parents[2] / "db" / "migrate-python-backend.sql").read_text()


def _columns(conn: psycopg.Connection, table: str) -> list[str]:
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() "
        "AND table_name = %s ORDER BY ordinal_position", (table,)).fetchall()
    return [r[0] for r in rows]


def copy_all(src: psycopg.Connection, dst: psycopg.Connection, log=print) -> dict[str, int]:
    copied: dict[str, int] = {}
    for table in TABLE_ORDER:
        src_cols = _columns(src, table)
        if not src_cols:
            continue
        dst_cols = set(_columns(dst, table))
        if not dst_cols:
            log(f"  {table}: not in Supabase — run scripts.setup_db first. Skipped.")
            continue
        if dst.execute(sql.SQL("SELECT EXISTS (SELECT 1 FROM {})").format(sql.Identifier(table))).fetchone()[0]:
            log(f"  {table}: already has rows in Supabase. Skipped.")
            continue
        cols = [c for c in src_cols if c in dst_cols]
        col_sql = sql.SQL(", ").join(map(sql.Identifier, cols))
        order = sql.SQL(" ORDER BY created_at") if "created_at" in cols else sql.SQL("")
        with src.cursor().copy(sql.SQL("COPY (SELECT {} FROM {}{}) TO STDOUT").format(
                col_sql, sql.Identifier(table), order)) as out, \
             dst.cursor().copy(sql.SQL("COPY {} ({}) FROM STDIN").format(sql.Identifier(table), col_sql)) as into:
            for chunk in out:
                into.write(chunk)
        n = dst.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))).fetchone()[0]
        copied[table] = n
        log(f"  {table}: {n} rows")
    dst.execute(REPOINT_GATES)
    known = set(TABLE_ORDER)
    for (t,) in src.execute("SELECT tablename FROM pg_tables WHERE schemaname = current_schema()").fetchall():
        if t not in known:
            log(f"  note: {t} exists in the old database but isn't copied by this script")
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="source", required=True, help="old Docker Postgres connection string")
    args = parser.parse_args()
    if not settings.database_url:
        sys.exit("DATABASE_URL (Supabase) is not set in .env")
    with psycopg.connect(args.source) as src, \
         psycopg.connect(settings.database_url, prepare_threshold=None) as dst:
        print("Copying into Supabase:")
        copy_all(src, dst)
        dst.commit()
    print("Done.")


if __name__ == "__main__":
    main()
