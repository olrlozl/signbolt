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

# "홍길동 (인)" style seal markers found outside of tables. Handles half/full-width
# parentheses and optional inner spacing: (인) （인） ( 인 ) (印)
SEAL_RE = re.compile(r"[（(]\s*[인印]\s*[）)]")
# a plausible Korean personal name token
_NAME_RE = re.compile(r"^[가-힣]{2,4}$")


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


def _area_has_image(page: "fitz.Page", bbox: BBox) -> bool:
    """True only if an embedded image (a scanned signature / stamp) sits in the
    area. Used for '(인)' markers, where grid lines and the printed marker text
    would make the drawing-based check fire constantly."""
    rect = fitz.Rect(bbox) + (2, 2, -2, -2)
    if not rect.is_valid or rect.is_empty:
        return False
    for img in page.get_image_info():
        if fitz.Rect(img["bbox"]).intersects(rect):
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


def _rects_overlap(a: BBox, b: BBox) -> bool:
    return not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])


def _words_by_line(page: "fitz.Page") -> List[list]:
    """Group ``page.get_text('words')`` tuples into visual lines, each sorted
    left-to-right. Word tuple: (x0, y0, x1, y1, text, block, line, word)."""
    lines: dict = {}
    for w in page.get_text("words"):
        lines.setdefault((w[5], w[6]), []).append(w)
    return [sorted(ws, key=lambda t: t[0]) for ws in lines.values()]


def detect_seals_in_page(
    page: "fitz.Page", page_index: int, avoid: List[BBox]
) -> List[SignatureField]:
    """Find '홍길동 (인)' markers and drop a signature box just above each '(인)',
    matched to the nearest preceding name on the same line. ``avoid`` holds
    regions already claimed by table detection so we don't add duplicates."""
    fields: List[SignatureField] = []
    n = 0
    pr = page.rect
    for ws in _words_by_line(page):
        joined = ""
        spans: List[Tuple[int, int, int]] = []  # (start, end, word position)
        for i, w in enumerate(ws):
            joined += " "
            start = len(joined)
            joined += w[4]
            spans.append((start, len(joined), i))

        for m in SEAL_RE.finditer(joined):
            hit = [p for (s, e, p) in spans if s < m.end() and e > m.start()]
            if not hit:
                continue
            first = min(hit)
            mx0 = min(ws[i][0] for i in hit)
            mx1 = max(ws[i][2] for i in hit)
            my0 = min(ws[i][1] for i in hit)
            my1 = max(ws[i][3] for i in hit)

            marker = (mx0, my0, mx1, my1)
            if any(_rects_overlap(marker, r) for r in avoid):
                continue

            # name: a hangul prefix inside the marker's own word ("홍길동(인)"),
            # else the nearest hangul 2-4 char word to the left on this line
            name = ""
            lead = ws[first][4]
            cut = min((lead.find(c) for c in "（(" if c in lead), default=-1)
            if cut > 0 and _NAME_RE.match(lead[:cut]):
                name = lead[:cut]
            else:
                for i in range(first - 1, -1, -1):
                    tok = ws[i][4].strip(" .,:;·-")
                    if _NAME_RE.match(tok):
                        name = tok
                        break
                    if len(tok) > 4:
                        break

            # a signing area over the "(인)" marker itself, centred on it and
            # reaching a little above the line
            th = max(my1 - my0, 8.0)
            cx = (mx0 + mx1) / 2
            w = max(mx1 - mx0, 55.0)
            box = [
                max(1.0, round(cx - w / 2, 2)),
                max(1.0, round(my0 - th * 0.35, 2)),
                min(pr.width - 1, round(cx + w / 2, 2)),
                min(pr.height - 1, round(my1 + th * 0.15, 2)),
            ]
            if box[2] - box[0] < 3 or box[3] - box[1] < 3:
                continue

            fields.append(
                SignatureField(
                    id=f"p{page_index}-seal{n}",
                    page=page_index,
                    rank="",
                    signer_name=name,
                    bbox_pdf=[float(v) for v in box],
                    already_signed=_area_has_image(page, tuple(box)),
                    source="seal",
                )
            )
            n += 1
            avoid.append(marker)
    return fields


def detect_signature_fields(pdf_bytes: bytes) -> List[SignatureField]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        out: List[SignatureField] = []
        for i, page in enumerate(doc):
            table_fields = detect_in_page(page, i)
            out.extend(table_fields)
            # only avoid the signature cells we already claimed — a "(인)" often
            # sits inside an unrelated table cell (e.g. a "교육강사" row), which we
            # still want to catch.
            avoid: List[BBox] = [tuple(f.bbox_pdf) for f in table_fields]
            out.extend(detect_seals_in_page(page, i, avoid))
        return out
    finally:
        doc.close()
