from __future__ import annotations

import hmac
import os
import time
from contextlib import asynccontextmanager
from typing import List, Optional
from urllib.parse import quote

import fitz
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from . import db, qr, store, workflow
from .detector import detect_signature_fields
from .models import (
    AdminDocSummary,
    AdminDocView,
    AdminLogin,
    FieldsUpdate,
    PageInfo,
    PublishResponse,
    StatusView,
    SubmitRequest,
    SubmitResponse,
    UploadResponse,
)
from .renderer import DEFAULT_ZOOM, render_page_png
from .stamper import data_url_to_png_bytes

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    _admin_user()
    _admin_password()
    try:
        store.gc(db.all_document_ids())
    except Exception:
        pass
    try:
        db.gc_expired_sessions()
    except Exception:
        pass
    yield


app = FastAPI(title="SignBolt API", lifespan=lifespan)

# 운영 환경은 프론트엔드를 같은 오리진에서 같이 서빙하므로 CORS가 필요 없다.
# 로컬 개발(Vite :5173 → API :8000)만 기본 허용하고, 그 외 도메인이 필요하면
# SIGNBOLT_CORS_ORIGINS="https://a.example.com,https://b.example.com" 로 지정한다.
_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
_EXTRA_ORIGINS = [
    o.strip()
    for o in os.environ.get("SIGNBOLT_CORS_ORIGINS", "").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_DEV_ORIGINS + _EXTRA_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSION_COOKIE = "signbolt_session"


def _cookie_secure() -> bool:
    origin = (
        os.environ.get("SIGNBOLT_PUBLIC_ORIGIN")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or ""
    )
    return origin.startswith("https://")

db.init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ------------------------------------------------------------ admin login ---

def _admin_user() -> str:
    user = os.environ.get("SIGNBOLT_ADMIN_USER")
    if not user:
        raise RuntimeError(
            "SIGNBOLT_ADMIN_USER 환경변수가 설정되지 않았습니다. "
            "기본 관리자 계정을 쓰지 않도록 직접 값을 지정해야 합니다."
        )
    return user


def _admin_password() -> str:
    pw = os.environ.get("SIGNBOLT_ADMIN_PASSWORD")
    if not pw:
        raise RuntimeError(
            "SIGNBOLT_ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. "
            "기본 관리자 계정을 쓰지 않도록 직접 값을 지정해야 합니다."
        )
    return pw


def _check_admin(user: Optional[str], pw: Optional[str]) -> None:
    ok_user = bool(user) and hmac.compare_digest(user, _admin_user())
    ok_pw = bool(pw) and hmac.compare_digest(pw, _admin_password())
    if not (ok_user and ok_pw):
        raise HTTPException(401, "아이디 또는 비밀번호가 올바르지 않습니다.")


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.post("/api/admin/login")
def admin_login(body: AdminLogin, request: Request, response: Response) -> dict:
    ip = _client_ip(request)
    remaining = db.check_login_lock(ip)
    if remaining is not None:
        minutes = int(remaining // 60) + 1
        raise HTTPException(
            429, f"로그인 시도가 너무 많습니다. {minutes}분 후 다시 시도하세요."
        )
    try:
        _check_admin(body.username, body.password)
    except HTTPException:
        db.record_login_failure(ip)
        raise
    db.clear_login_failures(ip)
    session_id = db.create_session()
    response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        max_age=db.SESSION_TTL_SECONDS,
        path="/",
    )
    return {"ok": True}


@app.post("/api/admin/logout")
def admin_logout(request: Request, response: Response) -> dict:
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        db.delete_session(session_id)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/admin/session")
def admin_session(request: Request) -> dict:
    _require_session(request)
    return {"ok": True}


@app.delete("/api/admin/documents/{doc_id}")
def admin_delete_document(doc_id: str, request: Request) -> dict:
    _require_session(request)
    if db.get_document(doc_id) is None:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    db.delete_document(doc_id)
    store.remove_doc_dir(doc_id)
    return {"ok": True}


@app.get("/api/admin/documents", response_model=List[AdminDocSummary])
def admin_documents(request: Request) -> List[AdminDocSummary]:
    _require_session(request)
    out: List[AdminDocSummary] = []
    for row in db.list_documents():
        people = workflow.person_statuses(row["id"])
        out.append(
            AdminDocSummary(
                id=row["id"],
                filename=row["filename"],
                status=row["status"],
                created_at=row["created_at"],
                published=bool(row["sign_token"]),
                persons_total=len(people),
                persons_done=sum(1 for p in people if p.done),
                complete=workflow.is_complete(row["id"]),
            )
        )
    return out


# ---------------------------------------------------------------- helpers ---

def _page_infos(doc_id: str, pdf_path, url_prefix: str) -> List[PageInfo]:
    doc = fitz.open(pdf_path)
    try:
        return [
            PageInfo(
                index=i,
                width=p.rect.width,
                height=p.rect.height,
                image_url=f"{url_prefix}/{i}.png",
            )
            for i, p in enumerate(doc)
        ]
    finally:
        doc.close()


def _require_session(request: Request) -> None:
    session_id = request.cookies.get(SESSION_COOKIE)
    if not session_id or db.get_session(session_id) is None:
        raise HTTPException(401, "로그인이 필요합니다.")


def _require_admin(doc_id: str, request: Request):
    _require_session(request)
    row = db.get_document(doc_id)
    if row is None:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return row


def _require_signer(sign_token: str):
    row = db.get_by_sign_token(sign_token)
    if row is None:
        raise HTTPException(404, "서명 링크가 유효하지 않습니다.")
    return row


def _render_page(pdf_path, page_index: int) -> Response:
    doc = fitz.open(pdf_path)
    try:
        if page_index < 0 or page_index >= doc.page_count:
            raise HTTPException(404, "페이지를 찾을 수 없습니다.")
        png = render_page_png(doc, page_index, zoom=DEFAULT_ZOOM)
    finally:
        doc.close()
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "private, no-store"})


def _clamp_bbox(bbox: List[float], pr) -> List[float]:
    x0, y0, x1, y1 = bbox
    x0, x1 = sorted((max(0.0, min(x0, pr.width)), max(0.0, min(x1, pr.width))))
    y0, y1 = sorted((max(0.0, min(y0, pr.height)), max(0.0, min(y1, pr.height))))
    return [x0, y0, x1, y1]


# ------------------------------------------------------------ admin routes ---

@app.post("/api/documents", response_model=UploadResponse)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
) -> UploadResponse:
    _require_session(request)
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(400, "PDF 파일만 업로드할 수 있습니다.")
    pdf_bytes = await file.read()
    if len(pdf_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "파일이 너무 큽니다 (최대 25MB).")
    try:
        fitz.open(stream=pdf_bytes, filetype="pdf").close()
    except Exception:
        raise HTTPException(400, "PDF를 열 수 없습니다.")

    row = db.create_document(file.filename or "document.pdf")
    doc_id = row["id"]
    store.ensure_doc_dir(doc_id)
    store.source_pdf(doc_id).write_bytes(pdf_bytes)

    detected = detect_signature_fields(pdf_bytes)
    db.replace_fields(doc_id, [f.model_dump() for f in detected])

    return UploadResponse(
        id=doc_id,
        filename=row["filename"],
        status=row["status"],
        pages=_page_infos(doc_id, store.source_pdf(doc_id),
                          f"/api/documents/{doc_id}/pages"),
        fields=workflow.fields_for_admin(doc_id),
    )


@app.get("/api/documents/{doc_id}", response_model=AdminDocView)
def get_document(doc_id: str, request: Request) -> AdminDocView:
    row = _require_admin(doc_id, request)
    sign_url = qr.sign_url(row["sign_token"]) if row["sign_token"] else None
    return AdminDocView(
        id=doc_id,
        filename=row["filename"],
        status=row["status"],
        created_at=row["created_at"],
        pages=_page_infos(doc_id, store.source_pdf(doc_id),
                          f"/api/documents/{doc_id}/pages"),
        fields=workflow.fields_for_admin(doc_id),
        sign_url=sign_url,
        qr_svg=qr.make_qr_svg(sign_url) if sign_url else None,
        persons=workflow.person_statuses(doc_id),
        complete=workflow.is_complete(doc_id),
        signed_field_ids=sorted(db.signed_field_ids(doc_id)),
    )


@app.get("/api/documents/{doc_id}/signatures/{field_id}.png")
def admin_signature_image(doc_id: str, field_id: str, request: Request) -> Response:
    _require_admin(doc_id, request)
    try:
        path = store.signature_png(doc_id, field_id)
    except ValueError:
        raise HTTPException(400, "잘못된 서명란 id입니다.")
    if not path.exists():
        raise HTTPException(404, "아직 서명되지 않았습니다.")
    return Response(content=path.read_bytes(), media_type="image/png",
                    headers={"Cache-Control": "no-store"})


@app.put("/api/documents/{doc_id}/fields", response_model=AdminDocView)
def update_fields(doc_id: str, body: FieldsUpdate, request: Request) -> AdminDocView:
    row = _require_admin(doc_id, request)
    if row["status"] != "draft":
        raise HTTPException(409, "이미 게시된 문서는 서명란을 수정할 수 없습니다.")

    doc = fitz.open(store.source_pdf(doc_id))
    page_rects = [p.rect for p in doc]
    doc.close()

    cleaned = []
    for f in body.fields:
        if f.page < 0 or f.page >= len(page_rects):
            raise HTTPException(400, f"잘못된 페이지 번호: {f.page}")
        bbox = _clamp_bbox(f.bbox_pdf, page_rects[f.page])
        if bbox[2] - bbox[0] < 3 or bbox[3] - bbox[1] < 3:
            raise HTTPException(400, "서명란이 너무 작습니다.")
        cleaned.append(
            {
                "id": f.id,
                "page": f.page,
                "bbox_pdf": bbox,
                "rank": f.rank,
                "signer_name": f.signer_name.strip(),
            }
        )
    db.replace_fields(doc_id, cleaned)
    return get_document(doc_id, request)


@app.post("/api/documents/{doc_id}/publish", response_model=PublishResponse)
def publish_document(doc_id: str, request: Request) -> PublishResponse:
    row = _require_admin(doc_id, request)
    if row["status"] != "draft":
        return PublishResponse(
            status=row["status"],
            sign_url=qr.sign_url(row["sign_token"]),
            qr_svg=qr.make_qr_svg(qr.sign_url(row["sign_token"])),
        )
    fields = db.list_fields(doc_id)
    if not fields:
        raise HTTPException(400, "서명란이 하나도 없습니다.")
    missing = [f["id"] for f in fields if not (f["signer_name"] or "").strip()]
    if missing:
        raise HTTPException(400, "이름이 지정되지 않은 서명란이 있습니다.")

    sign_token = db.publish(doc_id)
    url = qr.sign_url(sign_token)
    return PublishResponse(status="published", sign_url=url, qr_svg=qr.make_qr_svg(url))


@app.get("/api/documents/{doc_id}/status", response_model=StatusView)
def document_status(doc_id: str, request: Request) -> StatusView:
    row = _require_admin(doc_id, request)
    return StatusView(
        status=row["status"],
        persons=workflow.person_statuses(doc_id),
        complete=workflow.is_complete(doc_id),
        signed_field_ids=sorted(db.signed_field_ids(doc_id)),
    )


@app.get("/api/documents/{doc_id}/final.pdf")
def download_final(doc_id: str, request: Request) -> Response:
    row = _require_admin(doc_id, request)
    data = workflow.rebuild_final_pdf(doc_id)
    stem = (row["filename"].rsplit(".", 1)[0] or "document")

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                "attachment; filename=\"signed.pdf\"; "
                f"filename*=UTF-8''{quote(stem)}_signed.pdf"
            )
        },
    )


@app.get("/api/documents/{doc_id}/pages/{page_index}.png")
def admin_page_image(doc_id: str, page_index: int, request: Request) -> Response:
    _require_admin(doc_id, request)
    return _render_page(store.source_pdf(doc_id), page_index)


@app.get("/api/documents/{doc_id}/qr.png")
def qr_png(doc_id: str, request: Request) -> Response:
    row = _require_admin(doc_id, request)
    if not row["sign_token"]:
        raise HTTPException(409, "아직 게시되지 않았습니다.")
    png = qr.make_qr_png(qr.sign_url(row["sign_token"]))
    return Response(
        content=png,
        media_type="image/png",
        headers={"Content-Disposition": 'inline; filename="signbolt-qr.png"'},
    )


# ----------------------------------------------------------- signer routes ---

@app.get("/api/sign/{sign_token}")
def signer_view(sign_token: str) -> dict:
    row = _require_signer(sign_token)
    doc_id = row["id"]
    return {
        "filename": row["filename"],
        "status": row["status"],
        "pages": [
            p.model_dump()
            for p in _page_infos(
                doc_id, store.source_pdf(doc_id),
                f"/api/sign/{sign_token}/pages",
            )
        ],
        "fields": [f.model_dump() for f in workflow.fields_for_signer(doc_id)],
        "remaining_names": workflow.remaining_names(doc_id),
        "complete": workflow.is_complete(doc_id),
    }


@app.get("/api/sign/{sign_token}/pages/{page_index}.png")
def signer_page_image(sign_token: str, page_index: int) -> Response:
    row = _require_signer(sign_token)
    return _render_page(store.source_pdf(row["id"]), page_index)


@app.post("/api/sign/{sign_token}/submit", response_model=SubmitResponse)
def signer_submit(sign_token: str, body: SubmitRequest) -> SubmitResponse:
    row = _require_signer(sign_token)
    doc_id = row["id"]
    name = body.signer_name.strip()
    if not name:
        raise HTTPException(400, "이름을 선택하세요.")
    if not body.signatures:
        raise HTTPException(400, "서명이 없습니다.")
    if name not in workflow.remaining_names(doc_id):
        raise HTTPException(409, "이미 서명을 마쳤거나 명단에 없는 이름입니다.")

    fields = {f["id"]: f for f in db.list_fields(doc_id)}
    already = db.signed_field_ids(doc_id)

    to_write = []  # (field_id, rel_png_name, abs_path, png_bytes)
    for sig in body.signatures:
        f = fields.get(sig.field_id)
        if f is None:
            raise HTTPException(400, f"알 수 없는 서명란: {sig.field_id}")
        if (f["signer_name"] or "").strip() != name:
            raise HTTPException(403, "본인 서명란이 아닙니다.")
        if sig.field_id in already:
            continue
        try:
            png = data_url_to_png_bytes(sig.png_data_url)
        except Exception:
            raise HTTPException(400, "서명 이미지를 디코딩할 수 없습니다.")
        to_write.append((sig.field_id, f"sig-{sig.field_id}.png",
                         store.signature_png(doc_id, sig.field_id), png))

    written = 0
    with db.writing() as conn:
        locked_signed = {
            r["field_id"]
            for r in conn.execute(
                "SELECT field_id FROM signatures WHERE document_id = ?", (doc_id,)
            )
        }
        for field_id, rel, abs_path, png in to_write:
            if field_id in locked_signed:
                continue
            abs_path.write_bytes(png)
            conn.execute(
                "INSERT INTO signatures"
                " (field_id, document_id, png_path, signer_name, signed_at)"
                " VALUES (?, ?, ?, ?, ?)",
                (field_id, doc_id, rel, name, time.time()),
            )
            written += 1

    complete = workflow.is_complete(doc_id)
    if complete and row["status"] != "completed":
        db.set_status(doc_id, "completed")
    if written:
        workflow.rebuild_final_pdf(doc_id)

    person = next(
        (p for p in workflow.person_statuses(doc_id) if p.name == name), None
    )
    if person is None:
        raise HTTPException(500, "상태 계산 오류")
    return SubmitResponse(
        ok=True,
        person=person,
        remaining_names=workflow.remaining_names(doc_id),
        complete=complete,
    )


# --------------------------------------------------------------------------- #
# Serve the built React frontend (single-service production deploy).
# In local dev the frontend runs on Vite (5173) and this block is inactive.
# --------------------------------------------------------------------------- #
from pathlib import Path as _Path  # noqa: E402

from fastapi.responses import FileResponse, HTMLResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

_DIST = _Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _public_origin(request: Request) -> str:
    return (
        os.environ.get("SIGNBOLT_PUBLIC_ORIGIN")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or str(request.base_url)
    ).rstrip("/")


if (_DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")
    _INDEX = (_DIST / "index.html").read_text(encoding="utf-8")

    @app.get("/{path:path}", include_in_schema=False)
    def _spa(request: Request, path: str):
        if path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = _DIST / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        # fill link-preview meta tags with the real origin
        return HTMLResponse(_INDEX.replace("%OG_ORIGIN%", _public_origin(request)))
