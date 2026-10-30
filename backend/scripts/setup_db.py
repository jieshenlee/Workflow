"""Create every table in Supabase and lock the data API down to you.

    cd backend
    python -m scripts.setup_db --owner-email you@example.com

Reads DATABASE_URL from the repo-root .env. Safe to re-run: schema.sql
and supabase-rls.sql are idempotent, and the owner email is upserted.
"""

import argparse
import sys
from pathlib import Path

import psycopg

from app.config import settings

DB_DIR = Path(__file__).resolve().parents[2] / "db"


def setup(conn: psycopg.Connection, owner_emails: list[str]) -> None:
    has_auth = conn.execute("SELECT to_regnamespace('auth') IS NOT NULL AS ok").fetchone()[0]
    if not has_auth:
        raise SystemExit("This database has no `auth` schema — DATABASE_URL should point at Supabase.")
    conn.execute((DB_DIR / "schema.sql").read_text())
    conn.execute((DB_DIR / "supabase-rls.sql").read_text())
    for email in owner_emails:
        conn.execute("INSERT INTO private.dashboard_users (email) VALUES (%s) ON CONFLICT DO NOTHING",
                     (email.strip().lower(),))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--owner-email", action="append", required=True,
                        help="email you'll sign in to the dashboard with (repeatable)")
    args = parser.parse_args()
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set in .env")
    with psycopg.connect(settings.database_url, autocommit=True, prepare_threshold=None) as conn:
        setup(conn, args.owner_email)
        tables = conn.execute(
            "SELECT count(*) FROM pg_tables WHERE schemaname = current_schema()").fetchone()[0]
    print(f"Done: {tables} tables, row-level security on, dashboard access for {', '.join(args.owner_email)}.")
    print("Next: Supabase → Authentication → Users → Add user (same email, set a password, auto-confirm).")


if __name__ == "__main__":
    main()
