from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


# ------------------------------------------------------------------ shared ---

class PageInfo(BaseModel):
    index: int
    width: float
    height: float
    image_url: str


class SignatureField(BaseModel):
    """A signature slot on the document, assigned to one person."""

    id: str
    page: int
    rank: str = ""
    signer_name: str = ""          # person who must sign here
    bbox_pdf: List[float]          # [x0, y0, x1, y1], PyMuPDF coords (top-left origin)
    source: str = "table"          # "table" | "manual"
    already_signed: bool = False   # ink already present in the source PDF


# --------------------------------------------------------------- admin side ---

class UploadResponse(BaseModel):
    id: str
    admin_token: str
    filename: str
    status: str
    pages: List[PageInfo]
    fields: List[SignatureField]


class FieldIn(BaseModel):
    id: str
    page: int
    rank: str = ""
    signer_name: str = ""
    bbox_pdf: List[float]
    source: str = "table"


class FieldsUpdate(BaseModel):
    fields: List[FieldIn]


class PersonStatus(BaseModel):
    name: str
    total: int
    signed: int
    done: bool


class AdminDocView(BaseModel):
    id: str
    filename: str
    status: str
    pages: List[PageInfo]
    fields: List[SignatureField]
    sign_url: Optional[str] = None
    qr_svg: Optional[str] = None
    persons: List[PersonStatus] = []
    complete: bool = False


class PublishResponse(BaseModel):
    status: str
    sign_url: str
    qr_svg: str


class StatusView(BaseModel):
    status: str
    persons: List[PersonStatus]
    complete: bool


# -------------------------------------------------------------- signer side ---

class SignerField(BaseModel):
    id: str
    page: int
    rank: str
    signer_name: str
    bbox_pdf: List[float]
    signed: bool


class SignerDocView(BaseModel):
    filename: str
    status: str
    pages: List[PageInfo]
    fields: List[SignerField]
    remaining_names: List[str]
    complete: bool


class SignatureInput(BaseModel):
    field_id: str
    png_data_url: str


class SubmitRequest(BaseModel):
    signer_name: str
    signatures: List[SignatureInput]


class SubmitResponse(BaseModel):
    ok: bool
    person: PersonStatus
    remaining_names: List[str]
    complete: bool
