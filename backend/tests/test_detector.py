from __future__ import annotations

from pathlib import Path

import fitz
import pytest

from app.detector import detect_signature_fields
from app.stamper import Placement, stamp

FIXTURE = Path(__file__).parent / "fixtures" / "sample_signbook.pdf"

EXPECTED_NAMES = {"이성수", "이진아", "이현지", "이은지", "이준석", "배정우", "홍길동"}

pytestmark = pytest.mark.skipif(
    not FIXTURE.exists(),
    reason="sample_signbook.pdf fixture not present — drop the sample PDF in tests/fixtures/",
)


@pytest.fixture(scope="module")
def pdf_bytes() -> bytes:
    return FIXTURE.read_bytes()


def test_detects_every_named_person(pdf_bytes: bytes):
    fields = detect_signature_fields(pdf_bytes)
    names = sorted(f.signer_name for f in fields)
    assert sorted(EXPECTED_NAMES) == names, names


def test_boxes_are_within_page_and_non_degenerate(pdf_bytes: bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields = detect_signature_fields(pdf_bytes)
    for f in fields:
        rect = doc[f.page].rect
        x0, y0, x1, y1 = f.bbox_pdf
        assert x1 - x0 > 2 and y1 - y0 > 2, f
        assert -1 <= x0 and x1 <= rect.width + 1, f
        assert -1 <= y0 and y1 <= rect.height + 1, f
    doc.close()


def test_signature_box_sits_under_the_sign_column_header(pdf_bytes: bytes):
    """Each detected box's horizontal centre must fall inside a '서명' header cell."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    sign_header_spans = []
    for tab in page.find_tables(strategy="lines").tables:
        for row in tab.rows:
            for cell in row.cells:
                if cell is None:
                    continue
                txt = page.get_textbox(fitz.Rect(cell)).strip()
                if txt.replace(" ", "") == "서명":
                    sign_header_spans.append((cell[0], cell[2]))
    assert sign_header_spans
    for f in detect_signature_fields(pdf_bytes):
        cx = (f.bbox_pdf[0] + f.bbox_pdf[2]) / 2
        assert any(x0 - 1 <= cx <= x1 + 1 for x0, x1 in sign_header_spans), f
    doc.close()


def test_empty_rows_are_excluded(pdf_bytes: bytes):
    fields = detect_signature_fields(pdf_bytes)
    # 7 named people, no blank trailing rows, no empty right-hand rows
    assert len(fields) == len(EXPECTED_NAMES)


def test_stamp_roundtrip_produces_valid_pdf(pdf_bytes: bytes):
    import io

    from PIL import Image, ImageDraw

    fields = detect_signature_fields(pdf_bytes)
    assert fields
    im = Image.new("RGBA", (200, 80), (0, 0, 0, 0))
    ImageDraw.Draw(im).line([(10, 60), (90, 10), (150, 60), (190, 20)], fill=(20, 30, 60, 255), width=4)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    sig_png = buf.getvalue()
    placements = [
        Placement(page=f.page, bbox_pdf=f.bbox_pdf, png_bytes=sig_png)
        for f in fields
    ]
    out = stamp(pdf_bytes, placements)
    doc = fitz.open(stream=out, filetype="pdf")
    assert doc.page_count >= 1
    assert doc[0].get_images(), "signature images should be embedded"
    doc.close()
