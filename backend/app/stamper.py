from __future__ import annotations

import base64
import io
from typing import Iterable, List, TypedDict

import fitz
from PIL import Image


class Placement(TypedDict):
    page: int
    bbox_pdf: List[float]   # [x0, y0, x1, y1] signature *cell* in PyMuPDF coords
    png_bytes: bytes        # transparent PNG of the drawn signature


CELL_FILL = 0.86  # signature occupies this fraction of the cell (centered)


def data_url_to_png_bytes(data_url: str) -> bytes:
    if "," in data_url:
        _, b64 = data_url.split(",", 1)
    else:
        b64 = data_url
    return base64.b64decode(b64)


def _fit_rect(cell: fitz.Rect, img_w: int, img_h: int) -> fitz.Rect:
    """Largest rect with the image aspect ratio that fits CELL_FILL of the cell,
    centered in the cell."""
    max_w = cell.width * CELL_FILL
    max_h = cell.height * CELL_FILL
    if img_w <= 0 or img_h <= 0:
        return fitz.Rect(cell.x0, cell.y0, cell.x0 + max_w, cell.y0 + max_h)
    aspect = img_w / img_h
    w = max_w
    h = w / aspect
    if h > max_h:
        h = max_h
        w = h * aspect
    cx, cy = (cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2
    return fitz.Rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def stamp(pdf_bytes: bytes, placements: Iterable[Placement]) -> bytes:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for p in placements:
            page = doc[p["page"]]
            png = p["png_bytes"]
            with Image.open(io.BytesIO(png)) as im:
                img_w, img_h = im.size
            cell = fitz.Rect(p["bbox_pdf"])
            target = _fit_rect(cell, img_w, img_h)
            page.insert_image(
                target,
                stream=png,
                keep_proportion=True,
                overlay=True,
            )
        out = io.BytesIO()
        doc.save(out, garbage=4, deflate=True)
        return out.getvalue()
    finally:
        doc.close()
