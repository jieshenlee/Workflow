"""Supabase setup: row-level security, setup_db and copy_data.

On a real Supabase project the `auth` schema and `authenticated` role
already exist. On plain Postgres a minimal stand-in is created (auth.jwt()
reads the request.jwt.claims setting, which is how Supabase implements it).
"""

import json
import uuid

import psycopg
import pytest

from .conftest import PNG, connect, create_schema, drop_schema


def _ensure_supabase_shims(conn):
    if not conn.execute("SELECT to_regnamespace('auth') IS NOT NULL").fetchone()[0]:
        conn.execute("CREATE SCHEMA auth")
        conn.execute("CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ "
                     "SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$")
    if not conn.execute("SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')").fetchone()[0]:
        conn.execute("CREATE ROLE authenticated NOLOGIN")


@pytest.fixture()
def fresh_schema(database_url):
    schemas = []

    def make():
        name = f"pd_test_{uuid.uuid4().hex[:8]}"
        create_schema(name)
        schemas.append(name)
        return name

    yield make
    for s in schemas:
        drop_schema(s)


def _as_user(conn, email):
    conn.execute("RESET ROLE")
    conn.execute("SELECT set_config('request.jwt.claims', %s, false)",
                 (json.dumps({"email": email, "role": "authenticated"}),))
    conn.execute("SET ROLE authenticated")


def test_rls_only_lets_listed_owner_through(fresh_schema):
    from scripts.setup_db import setup

    schema = fresh_schema()
    with connect(schema) as conn:
        _ensure_supabase_shims(conn)
        setup(conn, ["Owner@Example.com"])
        setup(conn, ["owner@example.com"])  # re-runnable
        conn.execute(psycopg.sql.SQL("GRANT USAGE ON SCHEMA {} TO authenticated").format(psycopg.sql.Identifier(schema)))
        conn.execute(psycopg.sql.SQL("GRANT ALL ON ALL TABLES IN SCHEMA {} TO authenticated").format(psycopg.sql.Identifier(schema)))
        conn.execute("INSERT INTO content_jobs (topic, branch) VALUES ('secret', 'blog')")
        rls_off = conn.execute("SELECT count(*) FROM pg_tables WHERE schemaname = %s AND NOT rowsecurity", (schema,)).fetchone()[0]
        assert rls_off == 0

        _as_user(conn, "OWNER@example.com")  # case-insensitive
        assert conn.execute("SELECT count(*) FROM content_jobs").fetchone()[0] == 1
        conn.execute("INSERT INTO images (source, image_b64) VALUES ('upload', %s)", (PNG,))
        assert conn.execute("SELECT count(*) FROM dashboard_users").fetchone()[0] == 0  # allow-list not readable

        _as_user(conn, "stranger@example.com")
        assert conn.execute("SELECT count(*) FROM content_jobs").fetchone()[0] == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("INSERT INTO content_jobs (topic, branch) VALUES ('x', 'blog')")
        conn.execute("RESET ROLE")


def test_setup_db_refuses_non_supabase_database(fresh_schema, monkeypatch):
    from scripts import setup_db

    with connect(fresh_schema()) as conn:
        monkeypatch.setattr(conn, "execute", _fake_no_auth(conn.execute))
        with pytest.raises(SystemExit, match="no `auth` schema"):
            setup_db.setup(conn, ["a@b.c"])


def _fake_no_auth(real):
    def execute(query, *a, **kw):
        if "to_regnamespace('auth')" in str(query):
            return real("SELECT false")
        return real(query, *a, **kw)
    return execute


def test_copy_data_moves_everything_in_fk_order(fresh_schema):
    from scripts.copy_data import copy_all

    src, dst = fresh_schema(), fresh_schema()
    with connect(src) as s:
        img = s.execute("INSERT INTO images (source, image_b64) VALUES ('upload', %s) RETURNING id", (PNG,)).fetchone()[0]
        job = s.execute("INSERT INTO content_jobs (topic, branch, status, chosen_image_id, keywords, data) "
                        "VALUES ('t', 'blog', 'brainstorm', %s, ARRAY['a','b'], '{\"angles\": []}') RETURNING id",
                        (img,)).fetchone()[0]
        s.execute("INSERT INTO approval_stages (job_id, stage_number, stage_name, status, resume_url) "
                  "VALUES (%s, 1, 'Brainstorm', 'pending', 'http://localhost:5678/webhook-waiting/9')", (job,))
        brand = s.execute("INSERT INTO brand_projects (name) VALUES ('B') RETURNING id").fetchone()[0]
        parent = s.execute("INSERT INTO image_gen_jobs (brand_id, prompt_raw, prompt_drafted, sizes, created_at) "
                           "VALUES (%s, 'a', 'p', '[\"post\"]', now() - interval '1 day') RETURNING id", (brand,)).fetchone()[0]
        s.execute("INSERT INTO image_gen_jobs (brand_id, prompt_raw, prompt_drafted, sizes, parent_job_id) "
                  "VALUES (%s, 'a', 'p2', '[\"post\"]', %s)", (brand, parent))

    with connect(src) as s, connect(dst) as d:
        logs: list[str] = []
        copied = copy_all(s, d, log=logs.append)
        assert copied["images"] == 1 and copied["content_jobs"] == 1 and copied["image_gen_jobs"] == 2
        row = d.execute("SELECT keywords, data, chosen_image_id FROM content_jobs").fetchone()
        assert row == (["a", "b"], {"angles": []}, img)
        gate = d.execute("SELECT id, resume_url FROM approval_stages").fetchone()
        assert gate[1] == f"http://localhost:8000/api/approvals/{gate[0]}/resume"  # n8n gate re-pointed

        again = copy_all(s, d, log=logs.append)  # second run: filled tables are skipped, nothing duplicated
        assert "content_jobs" not in again and all(n == 0 for n in again.values())
        assert any("content_jobs: already has rows" in line for line in logs)
        assert d.execute("SELECT count(*) FROM content_jobs").fetchone()[0] == 1
