"""Higher-level operations built on db + stamper: person status, final PDF."""
from __future__ import annotations

from typing import List

from . import db, store
from .models import PersonStatus, SignatureField, SignerField
from .stamper import Placement, stamp


def fields_for_admin(doc_id: str) -> List[SignatureField]:
    out = []
    for f in db.list_fields(doc_id):
        out.append(
            SignatureField(
                id=f["id"],
                page=f["page"],
                rank=f["rank"],
                signer_name=f["signer_name"],
                bbox_pdf=[f["x0"], f["y0"], f["x1"], f["y1"]],
                source="table",
            )
        )
    return out


def fields_for_signer(doc_id: str) -> List[SignerField]:
    signed = db.signed_field_ids(doc_id)
    out = []
    for f in db.list_fields(doc_id):
        out.append(
            SignerField(
                id=f["id"],
                page=f["page"],
                rank=f["rank"],
                signer_name=f["signer_name"],
                bbox_pdf=[f["x0"], f["y0"], f["x1"], f["y1"]],
                signed=f["id"] in signed,
            )
        )
    return out


def person_statuses(doc_id: str) -> List[PersonStatus]:
    fields = db.list_fields(doc_id)
    signed = db.signed_field_ids(doc_id)
    by_name: dict = {}
    for f in fields:
        name = (f["signer_name"] or "").strip()
        if not name:
            continue
        agg = by_name.setdefault(name, [0, 0])
        agg[0] += 1
        if f["id"] in signed:
            agg[1] += 1
    return [
        PersonStatus(name=n, total=t, signed=s, done=(t > 0 and s >= t))
        for n, (t, s) in by_name.items()
    ]


def remaining_names(doc_id: str) -> List[str]:
    return [p.name for p in person_statuses(doc_id) if not p.done]


def is_complete(doc_id: str) -> bool:
    people = person_statuses(doc_id)
    return bool(people) and all(p.done for p in people)


def rebuild_final_pdf(doc_id: str) -> bytes:
    src = store.source_pdf(doc_id).read_bytes()
    fields = {f["id"]: f for f in db.list_fields(doc_id)}
    placements: List[Placement] = []
    for sig in db.list_signatures(doc_id):
        f = fields.get(sig["field_id"])
        if f is None:
            continue
        png_path = store.doc_dir(doc_id) / sig["png_path"]
        if not png_path.exists():
            continue
        placements.append(
            Placement(
                page=f["page"],
                bbox_pdf=[f["x0"], f["y0"], f["x1"], f["y1"]],
                png_bytes=png_path.read_bytes(),
            )
        )
    out = stamp(src, placements) if placements else src
    store.final_pdf(doc_id).write_bytes(out)
    return out
