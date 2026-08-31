"""Detection of '홍길동 (인)' seal markers outside of tables. Builds its own
tiny PDF so it does not depend on the sample fixture."""
from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from app.detector import detect_signature_fields

_FONTS = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
]


def _font(page: "fitz.Page") -> str:
    for p in _FONTS:
        if Path(p).exists():
            page.insert_font(fontname="kr", fontfile=p)
            return "kr"
    page.insert_font(fontname="china-ss")
    return "china-ss"


def _pdf(lines: list[tuple[float, str]]) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    fn = _font(page)
    for y, s in lines:
        page.insert_text((70, y), s, fontname=fn, fontsize=12)
    out = doc.tobytes()
    doc.close()
    return out


def test_marker_becomes_field_matched_to_preceding_name():
    fields = detect_signature_fields(
        _pdf([(200, "성명 : 홍길동            (인)"),
              (260, "확인자   김철수 (인)")])
    )
    assert sorted(f.signer_name for f in fields) == ["김철수", "홍길동"]
    assert all(f.source == "seal" for f in fields)


def test_box_starts_at_marker_and_extends_right():
    pdf = _pdf([(300, "홍길동 (인)")])
    fields = detect_signature_fields(pdf)
    assert len(fields) == 1
    box = fields[0].bbox_pdf

    page = fitz.open(stream=pdf, filetype="pdf")[0]
    name = page.search_for("홍길동")[0]
    marker = page.search_for("(인)")[0]
    assert box[1] < marker.y0                     # box reaches above the marker
    assert box[3] < marker.y1 + marker.height     # stays on the marker line
    assert box[0] >= name.x1 - 4                  # does not cover the name
    assert box[0] <= marker.x0 + 4                # starts at "(인)"
    assert box[2] > marker.x1                     # extends to the right
    assert box[2] - box[0] > 3 and box[3] - box[1] > 3


def test_full_width_parens_and_inner_spaces():
    fields = detect_signature_fields(_pdf([(200, "이영희 （ 인 ）")]))
    assert [f.signer_name for f in fields] == ["이영희"]


def test_glued_name_and_marker():
    fields = detect_signature_fields(_pdf([(200, "서명: 박민수(인)")]))
    assert [f.signer_name for f in fields] == ["박민수"]


def test_no_marker_no_field():
    fields = detect_signature_fields(_pdf([(200, "홍길동 참석 확인")]))
    assert fields == []
