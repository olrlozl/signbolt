"""Generate a synthetic sign-in sheet that mirrors the real
'교육 참석자 서명부' layout, for tests when the real PDF is not available.

Run:  python -m tests.make_sample  ->  writes tests/fixtures/sample_signbook.pdf
"""
from __future__ import annotations

from pathlib import Path

import fitz

OUT = Path(__file__).parent / "fixtures" / "sample_signbook.pdf"

# A Korean-capable font shipped with macOS; fall back to a CJK font PyMuPDF knows.
FONT_CANDIDATES = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
]


def _font(page: fitz.Page) -> str:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            page.insert_font(fontname="kr", fontfile=path)
            return "kr"
    # PyMuPDF built-in CJK
    page.insert_font(fontname="china-ss")
    return "china-ss"


def _text(page, fontname, rect, s, size=10):
    page.insert_textbox(
        rect, s, fontname=fontname, fontsize=size, align=fitz.TEXT_ALIGN_CENTER
    )


def build() -> None:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    fn = _font(page)

    page.insert_textbox(
        fitz.Rect(40, 34, 555, 58), "교육 참석자 서명부",
        fontname=fn, fontsize=16, align=fitz.TEXT_ALIGN_CENTER,
    )

    def line(x0, y0, x1, y1):
        page.draw_line((x0, y0), (x1, y1), color=(0, 0, 0), width=0.8)

    # --- metadata table: 2 columns, 3 rows ---
    mx = [40, 150, 555]
    my = [62, 88, 114, 140]
    for y in my:
        line(mx[0], y, mx[-1], y)
    for x in mx:
        line(x, my[0], x, my[-1])
    meta = [("부서명", "분석팀"), ("교육명", "8월 정기안전보건교육"),
            ("교육일자", "2026.8.25. 11:00~11:50")]
    for r, (k, v) in enumerate(meta):
        _text(page, fn, fitz.Rect(mx[0], my[r] + 4, mx[1], my[r + 1]), k)
        _text(page, fn, fitz.Rect(mx[1], my[r] + 4, mx[2], my[r + 1]), v)

    # --- participants table ---
    # col0 = merged '참석자 명단' label, then 직위|성명|서명 twice
    cx = [40, 92, 147, 217, 317, 372, 442, 555]
    ry = [140]
    for _ in range(7):  # header + 6 rows
        ry.append(ry[-1] + 27)
    top, bottom = ry[0], ry[-1]

    # vertical lines: full height for the 6 data columns; label column only at its edges
    for x in cx:
        line(x, top, x, bottom)
    # horizontal lines: full width at top & bottom, inner lines skip the label column
    line(cx[0], top, cx[-1], top)
    line(cx[0], bottom, cx[-1], bottom)
    for y in ry[1:-1]:
        line(cx[1], y, cx[-1], y)

    _text(page, fn, fitz.Rect(cx[0], (top + bottom) / 2 - 12, cx[1],
                              (top + bottom) / 2 + 14), "참석자\n명단", size=9)

    headers = ["직위", "성명", "서명", "직위", "성명", "서명"]
    for i, h in enumerate(headers):
        _text(page, fn, fitz.Rect(cx[i + 1], ry[0] + 6, cx[i + 2], ry[1]), h)

    left = [("팀장", "이성수"), ("차장", "이진아"), ("과장", "이현지"),
            ("대리", "이은지"), ("사원", "이준석"), ("", "")]
    right = [("주임", "배정우"), ("연구원", "홍길동"), ("", ""),
             ("", ""), ("", ""), ("", "")]
    for r in range(6):
        y0, y1 = ry[r + 1] + 6, ry[r + 2]
        lr, ln = left[r]
        rr, rn = right[r]
        _text(page, fn, fitz.Rect(cx[1], y0, cx[2], y1), lr)
        _text(page, fn, fitz.Rect(cx[2], y0, cx[3], y1), ln)
        _text(page, fn, fitz.Rect(cx[4], y0, cx[5], y1), rr)
        _text(page, fn, fitz.Rect(cx[5], y0, cx[6], y1), rn)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    doc.close()
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
