from __future__ import annotations

import fitz

DEFAULT_ZOOM = 2.0  # 1.0 == 72 dpi; 2.0 == 144 dpi


def render_page_png(doc: "fitz.Document", page_index: int, zoom: float = DEFAULT_ZOOM) -> bytes:
    page = doc[page_index]
    matrix = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    return pix.tobytes("png")
