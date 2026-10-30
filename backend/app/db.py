"""Thin psycopg wrapper. Rows come back as dicts; pass Jsonb(...) for JSONB params."""

from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection, sql
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .config import settings

__all__ = ["Jsonb", "fetch_one", "fetch_all", "execute", "transaction", "close_pool"]

_pool: ConnectionPool | None = None


def _configure(conn: Connection) -> None:
    if settings.db_schema:
        conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(settings.db_schema)))
        conn.commit()


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL is not set — add your Supabase connection string to .env")
        if not settings.database_url.startswith(("postgresql://", "postgres://")):
            raise RuntimeError("DATABASE_URL must be the postgresql://… Session pooler string from Supabase → Connect, "
                               "not the https://….supabase.co URL (that one is VITE_SUPABASE_URL)")
        # prepare_threshold=None: Supabase's pooler can't share prepared statements across clients.
        _pool = ConnectionPool(settings.database_url, min_size=1, max_size=10, configure=_configure,
                               kwargs={"row_factory": dict_row, "prepare_threshold": None}, open=True)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def transaction() -> Iterator[Connection]:
    with _get_pool().connection() as conn:
        with conn.transaction():
            yield conn


def fetch_one(sql: str, params: Any = None) -> dict | None:
    with transaction() as conn:
        return conn.execute(sql, params).fetchone()


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    with transaction() as conn:
        return conn.execute(sql, params).fetchall()


def execute(sql: str, params: Any = None) -> int:
    with transaction() as conn:
        return conn.execute(sql, params).rowcount
