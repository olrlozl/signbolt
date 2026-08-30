from __future__ import annotations

import io
import os

import segno

PUBLIC_ORIGIN = (
    os.environ.get("SIGNBOLT_PUBLIC_ORIGIN")
    or os.environ.get("RENDER_EXTERNAL_URL")  # set automatically on Render
    or "http://localhost:5173"
).rstrip("/")


def sign_url(sign_token: str) -> str:
    return f"{PUBLIC_ORIGIN}/s/{sign_token}"


def make_qr_svg(data: str) -> str:
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="svg", scale=6, border=2, dark="#12203a")
    return buf.getvalue().decode("utf-8")


def make_qr_png(data: str) -> bytes:
    buf = io.BytesIO()
    segno.make(data, error="m").save(buf, kind="png", scale=12, border=3, dark="#12203a")
    return buf.getvalue()
