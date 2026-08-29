from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import List, Optional

import fitz
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from . import db, qr, store, workflow
from .detector import detect_signature_fields
from .models import (
    AdminDocView,
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
    try:
        store.gc(db.all_document_ids())
    except Exception:
        pass
    yield


app = FastAPI(title="SignBolt API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db.init_db()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


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


def _require_admin(doc_id: str, token: Optional[str]):
    if not token:
        raise HTTPException(401, "관리 토큰이 필요합니다.")
    row = db.get_by_admin_token(doc_id, token)
    if row is None:
        raise HTTPException(404, "문서를 찾을 수 없거나 권한이 없습니다.")
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
                    headers={"Cache-Control": "public, max-age=3600"})


def _clamp_bbox(bbox: List[float], pr) -> List[float]:
    x0, y0, x1, y1 = bbox
    x0, x1 = sorted((max(0.0, min(x0, pr.width)), max(0.0, min(x1, pr.width))))
    y0, y1 = sorted((max(0.0, min(y0, pr.height)), max(0.0, min(y1, pr.height))))
    return [x0, y0, x1, y1]


# ------------------------------------------------------------ admin routes ---

@app.post("/api/documents", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
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
        admin_token=row["admin_token"],
        filename=row["filename"],
        status=row["status"],
        pages=_page_infos(doc_id, store.source_pdf(doc_id),
                          f"/api/documents/{doc_id}/pages"),
        fields=workflow.fields_for_admin(doc_id),
    )


@app.get("/api/documents/{doc_id}", response_model=AdminDocView)
def get_document(doc_id: str, token: Optional[str] = Query(None)) -> AdminDocView:
    row = _require_admin(doc_id, token)
    sign_url = qr.sign_url(row["sign_token"]) if row["sign_token"] else None
    return AdminDocView(
        id=doc_id,
        filename=row["filename"],
        status=row["status"],
        pages=_page_infos(doc_id, store.source_pdf(doc_id),
                          f"/api/documents/{doc_id}/pages"),
        fields=workflow.fields_for_admin(doc_id),
        sign_url=sign_url,
        qr_svg=qr.make_qr_svg(sign_url) if sign_url else None,
        persons=workflow.person_statuses(doc_id),
        complete=workflow.is_complete(doc_id),
    )


@app.put("/api/documents/{doc_id}/fields", response_model=AdminDocView)
def update_fields(
    doc_id: str, body: FieldsUpdate, token: Optional[str] = Query(None)
) -> AdminDocView:
    row = _require_admin(doc_id, token)
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
    return get_document(doc_id, token)


@app.post("/api/documents/{doc_id}/publish", response_model=PublishResponse)
def publish_document(
    doc_id: str, token: Optional[str] = Query(None)
) -> PublishResponse:
    row = _require_admin(doc_id, token)
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
def document_status(
    doc_id: str, token: Optional[str] = Query(None)
) -> StatusView:
    row = _require_admin(doc_id, token)
    return StatusView(
        status=row["status"],
        persons=workflow.person_statuses(doc_id),
        complete=workflow.is_complete(doc_id),
    )


@app.get("/api/documents/{doc_id}/final.pdf")
def download_final(doc_id: str, token: Optional[str] = Query(None)) -> Response:
    row = _require_admin(doc_id, token)
    data = workflow.rebuild_final_pdf(doc_id)
    stem = (row["filename"].rsplit(".", 1)[0] or "document")
    from urllib.parse import quote

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
def admin_page_image(doc_id: str, page_index: int) -> Response:
    if db.get_document(doc_id) is None:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return _render_page(store.source_pdf(doc_id), page_index)


@app.get("/api/documents/{doc_id}/qr.png")
def qr_png(doc_id: str, token: Optional[str] = Query(None)) -> Response:
    row = _require_admin(doc_id, token)
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
