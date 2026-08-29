"""Filesystem layout for a document's binary assets.

    data/
      signbolt.db                  (SQLite — see db.py)
      <doc_id>/
        source.pdf                 uploaded original
        sig-<field_id>.png         one drawn signature per signed field
        final.pdf                  regenerated on demand from source + signatures
"""
from __future__ import annotations

import re
import shutil
import time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "signbolt.db"
TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days

_SAFE = re.compile(r"^[A-Za-z0-9_-]+$")


def doc_dir(doc_id: str) -> Path:
    if not _SAFE.match(doc_id):
        raise ValueError("invalid doc id")
    return DATA_DIR / doc_id


def ensure_doc_dir(doc_id: str) -> Path:
    d = doc_dir(doc_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def source_pdf(doc_id: str) -> Path:
    return doc_dir(doc_id) / "source.pdf"


def final_pdf(doc_id: str) -> Path:
    return doc_dir(doc_id) / "final.pdf"


def signature_png(doc_id: str, field_id: str) -> Path:
    if not _SAFE.match(field_id):
        raise ValueError("invalid field id")
    return doc_dir(doc_id) / f"sig-{field_id}.png"


def init() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def gc(known_ids: set[str]) -> None:
    """Remove on-disk doc dirs older than the TTL and not referenced by the DB."""
    if not DATA_DIR.exists():
        return
    cutoff = time.time() - TTL_SECONDS
    for child in DATA_DIR.iterdir():
        if not child.is_dir():
            continue
        try:
            if child.name not in known_ids and child.stat().st_mtime < cutoff:
                shutil.rmtree(child, ignore_errors=True)
        except OSError:
            pass
