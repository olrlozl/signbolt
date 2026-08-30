from __future__ import annotations

import base64
import io
import threading
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

FIXTURE = Path(__file__).parent / "fixtures" / "sample_signbook.pdf"

pytestmark = pytest.mark.skipif(not FIXTURE.exists(), reason="no sample PDF")


ADMIN_USER = "test-admin"
ADMIN_PW = "test-pw"
ADMIN_HEADERS = {"X-Admin-User": ADMIN_USER, "X-Admin-Password": ADMIN_PW}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    # isolate DB + data dir per test
    monkeypatch.setenv("SIGNBOLT_PUBLIC_ORIGIN", "http://testhost:5173")
    monkeypatch.setenv("SIGNBOLT_ADMIN_USER", ADMIN_USER)
    monkeypatch.setenv("SIGNBOLT_ADMIN_PASSWORD", ADMIN_PW)
    import importlib

    from app import store

    monkeypatch.setattr(store, "DATA_DIR", tmp_path)
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "signbolt.db")

    from app import db as db_mod

    importlib.reload(db_mod)
    from app import workflow as wf_mod

    importlib.reload(wf_mod)
    from app import main as main_mod

    importlib.reload(main_mod)
    return TestClient(main_mod.app)


def _sig() -> str:
    im = Image.new("RGBA", (200, 80), (0, 0, 0, 0))
    ImageDraw.Draw(im).line([(10, 60), (100, 12), (190, 55)], fill=(10, 20, 60, 255), width=5)
    b = io.BytesIO()
    im.save(b, format="PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def _upload(client) -> dict:
    return client.post(
        "/api/documents",
        files={"file": ("s.pdf", FIXTURE.read_bytes(), "application/pdf")},
        headers=ADMIN_HEADERS,
    ).json()


def test_upload_requires_admin_credentials(client):
    files = {"file": ("s.pdf", FIXTURE.read_bytes(), "application/pdf")}
    assert client.post("/api/documents", files=files).status_code == 401
    assert client.post(
        "/api/documents", files=files, headers={"X-Admin-Password": ADMIN_PW}
    ).status_code == 401  # missing user
    assert client.post(
        "/api/admin/login", json={"username": ADMIN_USER, "password": "bad"}
    ).status_code == 401
    assert client.post(
        "/api/admin/login", json={"username": ADMIN_USER, "password": ADMIN_PW}
    ).status_code == 200
    r = client.get("/api/admin/documents", headers=ADMIN_HEADERS)
    assert r.status_code == 200 and r.json() == []


def test_upload_detects_and_names(client):
    u = _upload(client)
    assert u["status"] == "draft"
    assert len(u["fields"]) == 7
    assert {f["signer_name"] for f in u["fields"]} == {
        "이성수", "이진아", "이현지", "이은지", "이준석", "배정우", "홍길동",
    }


def test_delete_document(client):
    u = _upload(client)
    did = u["id"]
    client.post(f"/api/documents/{did}/publish?token={u['admin_token']}")
    # signer signs one field so there's a signature + final.pdf on disk
    stok = client.get(f"/api/documents/{did}/status?token={u['admin_token']}")
    assert stok.status_code == 200

    assert client.delete(f"/api/admin/documents/{did}").status_code == 401
    r = client.delete(f"/api/admin/documents/{did}", headers=ADMIN_HEADERS)
    assert r.status_code == 200
    assert client.get(
        f"/api/documents/{did}?token={u['admin_token']}"
    ).status_code == 404
    assert client.delete(
        f"/api/admin/documents/{did}", headers=ADMIN_HEADERS
    ).status_code == 404
    assert client.get("/api/admin/documents", headers=ADMIN_HEADERS).json() == []


def test_multiple_documents_do_not_collide(client):
    # detector emits identical field ids per document; uploads must not clash
    a = _upload(client)
    b = _upload(client)
    assert a["id"] != b["id"]
    for d in (a, b):
        r = client.post(
            f"/api/documents/{d['id']}/publish?token={d['admin_token']}"
        )
        assert r.status_code == 200


def test_publish_requires_names(client):
    u = _upload(client)
    did, tok = u["id"], u["admin_token"]
    blanked = [{**f, "signer_name": ""} for f in u["fields"]]
    client.put(f"/api/documents/{did}/fields?token={tok}", json={"fields": blanked})
    r = client.post(f"/api/documents/{did}/publish?token={tok}")
    assert r.status_code == 400


def test_admin_token_required(client):
    u = _upload(client)
    assert client.get(f"/api/documents/{u['id']}").status_code == 401
    assert client.get(f"/api/documents/{u['id']}?token=wrong").status_code == 404


def test_full_flow_and_double_sign_rejected(client):
    u = _upload(client)
    did, tok = u["id"], u["admin_token"]
    st = client.post(f"/api/documents/{did}/publish?token={tok}").json()
    stok = st["sign_url"].rsplit("/", 1)[1]

    view = client.get(f"/api/sign/{stok}").json()
    assert sorted(view["remaining_names"]) == sorted(
        {f["signer_name"] for f in view["fields"]}
    )

    lee = [f for f in view["fields"] if f["signer_name"] == "이성수"][0]
    r = client.post(
        f"/api/sign/{stok}/submit",
        json={"signer_name": "이성수", "signatures": [{"field_id": lee["id"], "png_data_url": _sig()}]},
    )
    assert r.status_code == 200 and r.json()["person"]["done"] is True
    assert "이성수" not in r.json()["remaining_names"]

    # cannot sign again
    again = client.post(
        f"/api/sign/{stok}/submit",
        json={"signer_name": "이성수", "signatures": [{"field_id": lee["id"], "png_data_url": _sig()}]},
    )
    assert again.status_code == 409

    # cannot sign someone else's box
    bae_field = [f for f in view["fields"] if f["signer_name"] == "배정우"][0]
    wrong = client.post(
        f"/api/sign/{stok}/submit",
        json={"signer_name": "이진아", "signatures": [{"field_id": bae_field["id"], "png_data_url": _sig()}]},
    )
    assert wrong.status_code == 403

    for name in view["remaining_names"]:
        if name == "이성수":
            continue
        fs = [f for f in view["fields"] if f["signer_name"] == name]
        rr = client.post(
            f"/api/sign/{stok}/submit",
            json={"signer_name": name, "signatures": [{"field_id": f["id"], "png_data_url": _sig()} for f in fs]},
        )
        assert rr.status_code == 200

    status = client.get(f"/api/documents/{did}/status?token={tok}").json()
    assert status["status"] == "completed" and status["complete"] is True

    final = client.get(f"/api/documents/{did}/final.pdf?token={tok}")
    doc = fitz.open(stream=final.content, filetype="pdf")
    assert len(doc[0].get_images()) == 7


def test_concurrent_submissions(client):
    u = _upload(client)
    did, tok = u["id"], u["admin_token"]
    st = client.post(f"/api/documents/{did}/publish?token={tok}").json()
    stok = st["sign_url"].rsplit("/", 1)[1]
    view = client.get(f"/api/sign/{stok}").json()

    names = view["remaining_names"]
    results: dict = {}

    def worker(name: str):
        fs = [f for f in view["fields"] if f["signer_name"] == name]
        r = client.post(
            f"/api/sign/{stok}/submit",
            json={"signer_name": name, "signatures": [{"field_id": f["id"], "png_data_url": _sig()} for f in fs]},
        )
        results[name] = r.status_code

    threads = [threading.Thread(target=worker, args=(n,)) for n in names]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert set(results.values()) == {200}
    status = client.get(f"/api/documents/{did}/status?token={tok}").json()
    assert status["complete"] is True
