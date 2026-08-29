"""SQLite persistence for documents, signature fields, and collected signatures.

One short-lived connection per call. Writes use BEGIN IMMEDIATE so concurrent
signers serialize cleanly; WAL keeps reads non-blocking.
"""
from __future__ import annotations

import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from typing import Iterator, List, Optional

from . import store

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    admin_token  TEXT UNIQUE NOT NULL,
    sign_token   TEXT UNIQUE,
    filename     TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'draft',
    created_at   REAL NOT NULL,
    published_at REAL
);
CREATE TABLE IF NOT EXISTS fields (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page        INTEGER NOT NULL,
    x0 REAL NOT NULL, y0 REAL NOT NULL, x1 REAL NOT NULL, y1 REAL NOT NULL,
    rank        TEXT NOT NULL DEFAULT '',
    signer_name TEXT NOT NULL DEFAULT '',
    ord         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fields_doc ON fields(document_id);
CREATE TABLE IF NOT EXISTS signatures (
    field_id    TEXT PRIMARY KEY REFERENCES fields(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    png_path    TEXT NOT NULL,
    signer_name TEXT NOT NULL,
    signed_at   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sig_doc ON signatures(document_id);
"""


def _connect() -> sqlite3.Connection:
    store.init()
    conn = sqlite3.connect(store.DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def writing() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def _token() -> str:
    return secrets.token_urlsafe(18)


# ---------------------------------------------------------------- documents ---

def create_document(filename: str) -> sqlite3.Row:
    doc_id = uuid.uuid4().hex
    with writing() as conn:
        conn.execute(
            "INSERT INTO documents (id, admin_token, filename, status, created_at)"
            " VALUES (?, ?, ?, 'draft', ?)",
            (doc_id, _token(), filename, time.time()),
        )
    row = get_document(doc_id)
    assert row is not None
    return row


def get_document(doc_id: str) -> Optional[sqlite3.Row]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()


def get_by_admin_token(doc_id: str, token: str) -> Optional[sqlite3.Row]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM documents WHERE id = ? AND admin_token = ?",
            (doc_id, token),
        ).fetchone()


def get_by_sign_token(sign_token: str) -> Optional[sqlite3.Row]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM documents WHERE sign_token = ?", (sign_token,)
        ).fetchone()


def publish(doc_id: str) -> str:
    sign_token = _token()
    with writing() as conn:
        conn.execute(
            "UPDATE documents SET status='published', sign_token=?, published_at=?"
            " WHERE id=?",
            (sign_token, time.time(), doc_id),
        )
    return sign_token


def set_status(doc_id: str, status: str) -> None:
    with writing() as conn:
        conn.execute(
            "UPDATE documents SET status=? WHERE id=?", (status, doc_id)
        )


def all_document_ids() -> set:
    with connection() as conn:
        return {r["id"] for r in conn.execute("SELECT id FROM documents")}


# ------------------------------------------------------------------- fields ---

def namespaced_id(doc_id: str, raw_id: str) -> str:
    """Field ids are globally unique in the table, but the detector emits the
    same ids (p0-t0-r4-c3, ...) for every document. Prefix with the doc id so
    two uploads never collide. Idempotent for ids already prefixed."""
    prefix = f"{doc_id}--"
    return raw_id if raw_id.startswith(prefix) else prefix + raw_id


def replace_fields(doc_id: str, fields: List[dict]) -> None:
    with writing() as conn:
        conn.execute("DELETE FROM fields WHERE document_id = ?", (doc_id,))
        conn.executemany(
            "INSERT INTO fields"
            " (id, document_id, page, x0, y0, x1, y1, rank, signer_name, ord)"
            " VALUES (:id, :document_id, :page, :x0, :y0, :x1, :y1, :rank,"
            " :signer_name, :ord)",
            [
                {
                    "id": namespaced_id(doc_id, f["id"]),
                    "document_id": doc_id,
                    "page": int(f["page"]),
                    "x0": float(f["bbox_pdf"][0]),
                    "y0": float(f["bbox_pdf"][1]),
                    "x1": float(f["bbox_pdf"][2]),
                    "y1": float(f["bbox_pdf"][3]),
                    "rank": f.get("rank", "") or "",
                    "signer_name": f.get("signer_name", "") or "",
                    "ord": i,
                }
                for i, f in enumerate(fields)
            ],
        )


def list_fields(doc_id: str) -> List[sqlite3.Row]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM fields WHERE document_id = ? ORDER BY ord", (doc_id,)
        ).fetchall()


# --------------------------------------------------------------- signatures ---

def list_signatures(doc_id: str) -> List[sqlite3.Row]:
    with connection() as conn:
        return conn.execute(
            "SELECT * FROM signatures WHERE document_id = ?", (doc_id,)
        ).fetchall()


def signed_field_ids(doc_id: str) -> set:
    return {r["field_id"] for r in list_signatures(doc_id)}
