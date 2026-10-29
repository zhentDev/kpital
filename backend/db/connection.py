"""Core PostgreSQL / Supabase Connection Pool & Transaction Manager for Kpital."""

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv
from psycopg2.pool import ThreadedConnectionPool

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
OWNER_ID = "usr_9487dd2209d2"

_pg_pool: Optional[ThreadedConnectionPool] = None


def get_pg_connection():
    global _pg_pool
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured in environment variables.")
    if _pg_pool is None:
        clean_url = DATABASE_URL.strip()
        if clean_url.startswith("postgres://"):
            clean_url = clean_url.replace("postgres://", "postgresql://", 1)
        _pg_pool = ThreadedConnectionPool(minconn=1, maxconn=15, dsn=clean_url, connect_timeout=8)
        print("[KPITAL SUPABASE] Connected to Supabase PostgreSQL pool successfully.")
    return _pg_pool.getconn()


def release_pg_connection(conn):
    global _pg_pool
    if _pg_pool and conn:
        try:
            _pg_pool.putconn(conn)
        except Exception:
            pass


@contextmanager
def pg_session():
    conn = get_pg_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise e
    finally:
        release_pg_connection(conn)


def pg_execute(sql: str, params: Optional[list | tuple] = None) -> bool:
    """Executes a write SQL query inside an ACID transaction on Supabase PostgreSQL."""
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
        return True


def pg_fetchall(sql: str, params: Optional[list | tuple] = None) -> list[tuple]:
    """Executes a read SQL query and returns all rows."""
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchall()


def pg_fetchone(sql: str, params: Optional[list | tuple] = None) -> Optional[tuple]:
    """Executes a read SQL query and returns a single row."""
    with pg_session() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchone()


class _PgCursorWrapper:
    """Compatibility wrapper allowing legacy DuckDB-style `?` placeholders against PostgreSQL."""

    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql: str, params: Optional[list | tuple] = None):
        pg_sql = sql.replace("?", "%s")
        cur = self.conn.cursor()
        cur.execute(pg_sql, params or [])
        return cur


@contextmanager
def get_connection():
    """Thread-safe PostgreSQL session context manager compatible with legacy callers."""
    with pg_session() as conn:
        yield _PgCursorWrapper(conn)
