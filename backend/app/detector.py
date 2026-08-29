"""Detect empty signature cells in a tabular attendance/sign-in PDF and map
each one to the person (rank + name) sitting in the same table row.

The target documents are digitally generated (Excel/HWP export), so the table
grid lines and text are real vector content. We therefore rely on
``page.find_tables`` rather than OCR/computer vision.
"""
from __future__ import annotations

import re
from typing import List, Optional, Sequence, Tuple

import fitz  # PyMuPDF

from .models import SignatureField

BBox = Tuple[float, float, float, float]

# Header labels we look for. Kept as tuples so minor variants can be added later.
SIGN_LABELS = ("서명", "싸인", "sign", "signature")
NAME_LABELS = ("성명", "이름", "name")
RANK_LABELS = ("직위", "직급", "구분")


def _norm(text: Optional[str]) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", "", text)


def _matches(text: str, labels: Sequence[str]) -> bool:
    t = _norm(text).lower()
    return any(t == _norm(lbl).lower() for lbl in labels)


def _cell_has_ink(page: "fitz.Page", bbox: BBox) -> bool:
    """True if the signature cell already contains a drawing or image
    (i.e. somebody has signed it already)."""
    rect = fitz.Rect(bbox)
    # shrink slightly so the surrounding grid lines don't count
    inner = rect + (2, 2, -2, -2)
    if not inner.is_valid or inner.is_empty:
        return False
    for d in page.get_drawings():
        if fitz.Rect(d["rect"]).intersects(inner):
            return True
    for img in page.get_image_info():
        if fitz.Rect(img["bbox"]).intersects(inner):
            return True
    return False


def _find_header_row(grid: List[List[str]]) -> Optional[int]:
    """Row index whose cells contain both a name label and a sign label."""
    for r, row in enumerate(grid):
        has_name = any(_matches(c, NAME_LABELS) for c in row)
        has_sign = any(_matches(c, SIGN_LABELS) for c in row)
        if has_name and has_sign:
            return r
    return None


def _pair_columns(header: List[str]) -> List[Tuple[Optional[int], Optional[int], int]]:
    """Return (rank_col, name_col, sign_col) tuples.

    The forms repeat the ``직위 | 성명 | 서명`` block horizontally, so each sign
    column is paired with the nearest name/rank column to its left.
    """
    sign_cols = [i for i, c in enumerate(header) if _matches(c, SIGN_LABELS)]
    name_cols = [i for i, c in enumerate(header) if _matches(c, NAME_LABELS)]
    rank_cols = [i for i, c in enumerate(header) if _matches(c, RANK_LABELS)]

    pairs: List[Tuple[Optional[int], Optional[int], int]] = []
    for sc in sign_cols:
        nc = max((i for i in name_cols if i < sc), default=None)
        rc = max((i for i in rank_cols if i < sc), default=None)
        if rc is not None and nc is not None and rc >= nc:
            rc = None
        pairs.append((rc, nc, sc))
    return pairs


def _cell_bbox(row_cells: Sequence[Optional[BBox]], col: int) -> Optional[BBox]:
    if col < 0 or col >= len(row_cells):
        return None
    cb = row_cells[col]
    if cb_is_valid(cb):
        return tuple(round(v, 2) for v in cb)  # type: ignore[arg-type]
    return None


def cb_is_valid(cb: Optional[BBox]) -> bool:
    return (
        cb is not None
        and len(cb) == 4
        and cb[2] - cb[0] > 1
        and cb[3] - cb[1] > 1
    )


def detect_in_page(page: "fitz.Page", page_index: int) -> List[SignatureField]:
    fields: List[SignatureField] = []
    try:
        finder = page.find_tables(strategy="lines")
    except Exception:
        return fields

    for t_idx, table in enumerate(finder.tables):
        grid = table.extract()
        if not grid:
            continue
        header_row = _find_header_row(grid)
        if header_row is None:
            continue

        header = [_norm(c) for c in grid[header_row]]
        col_pairs = _pair_columns(header)
        if not col_pairs:
            continue

        rows = table.rows  # aligned with grid rows

        for r in range(header_row + 1, len(grid)):
            row_cells = rows[r].cells if r < len(rows) else []
            for (rank_col, name_col, sign_col) in col_pairs:
                if name_col is None:
                    continue
                name = _norm(grid[r][name_col]) if name_col < len(grid[r]) else ""
                if not name or _matches(name, NAME_LABELS):
                    continue

                sign_bbox = _cell_bbox(row_cells, sign_col)
                if sign_bbox is None:
                    continue

                rank = ""
                if rank_col is not None and rank_col < len(grid[r]):
                    rank = _norm(grid[r][rank_col])
                    if _matches(rank, RANK_LABELS):
                        rank = ""

                sign_text = _norm(grid[r][sign_col]) if sign_col < len(grid[r]) else ""
                already = bool(sign_text) or _cell_has_ink(page, sign_bbox)

                fields.append(
                    SignatureField(
                        id=f"p{page_index}-t{t_idx}-r{r}-c{sign_col}",
                        page=page_index,
                        rank=rank,
                        signer_name=name,
                        bbox_pdf=[float(v) for v in sign_bbox],
                        already_signed=already,
                        source="table",
                    )
                )
    return fields


def detect_signature_fields(pdf_bytes: bytes) -> List[SignatureField]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        out: List[SignatureField] = []
        for i, page in enumerate(doc):
            out.extend(detect_in_page(page, i))
        return out
    finally:
        doc.close()
