import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteAdminDoc, listAdminDocs } from "../api";
import { InboxIcon, TrashIcon } from "../components/icons";
import ConfirmModal from "../components/ConfirmModal";
import Toast from "../components/Toast";
import { clearAdminCred, getAdminCred } from "../lib/adminAuth";
import { takeFlash } from "../lib/flash";
import { STATUS_LABEL, formatDateTime } from "../lib/format";
import type { AdminDocSummary } from "../types";

export default function AdminDocList() {
  const nav = useNavigate();
  const [docs, setDocs] = useState<AdminDocSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AdminDocSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const m = takeFlash();
    if (m) setToast(m);
  }, []);

  function bail(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("아이디") ||
      msg.includes("비밀번호") ||
      msg.includes("401")
    ) {
      clearAdminCred();
      nav("/admin", { replace: true });
      return true;
    }
    setError(msg);
    return false;
  }

  useEffect(() => {
    const cred = getAdminCred();
    if (!cred) {
      nav("/admin", { replace: true });
      return;
    }
    listAdminDocs(cred).then(setDocs).catch(bail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav]);

  async function confirmDelete() {
    const cred = getAdminCred();
    if (!cred || !pending) return;
    const id = pending.id;
    setDeleting(true);
    setError(null);
    try {
      await deleteAdminDoc(id, cred);
      setDocs((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      setPending(null);
    } catch (e) {
      bail(e);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="app">
      {toast && <Toast message={toast} nonce={1} onClose={closeToast} />}
      <div className="list-head">
        <h1 className="page-title">
          등록한 문서
          {docs && <span className="doc-count">{docs.length}</span>}
        </h1>
        <div className="list-head-actions">
          <Link className="btn primary" to="/admin/new">
            + 새 문서
          </Link>
          <button
            className="btn ghost"
            onClick={() => {
              clearAdminCred();
              nav("/admin", { replace: true });
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {!docs ? (
        <p className="sub">불러오는 중…</p>
      ) : docs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">
            <InboxIcon />
          </span>
          <p>아직 등록된 문서가 없습니다.</p>
        </div>
      ) : (
        <div className="doc-list">
          <div className="doc-list-head">
            <div className="doc-list-head-main">
              <span>문서명</span>
              <span className="dh-c dh-mid">상태</span>
              <span className="dh-c dh-mid">서명 현황</span>
              <span className="dh-c">등록 일시</span>
            </div>
            <span className="doc-list-head-spacer" />
          </div>
          {docs.map((d) => (
            <div key={d.id} className="doc-row">
              <Link
                className="doc-row-main"
                to={`/d/${d.id}?token=${encodeURIComponent(d.admin_token)}`}
              >
                <span className="doc-row-name">{d.filename}</span>
                <span className={`doc-row-badge s-${d.status}`}>
                  {STATUS_LABEL[d.status]}
                </span>
                <span className="doc-row-progress">
                  {d.published ? `${d.persons_done} / ${d.persons_total}` : "—"}
                </span>
                <span className="doc-row-date">
                  {formatDateTime(d.created_at)}
                </span>
              </Link>
              <button
                className="doc-row-del"
                title="문서 삭제"
                aria-label="문서 삭제"
                onClick={() => setPending(d)}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <ConfirmModal
          icon={<TrashIcon />}
          title="문서를 삭제할까요?"
          message={
            <>
              {formatDateTime(pending.created_at)} 에 등록된
              <br />
              <span className="confirm-file">{pending.filename}</span>
              {pending.published && pending.persons_done > 0 && (
                <>
                  <br />
                  이미 완료된 서명 {pending.persons_done}건도 함께 삭제됩니다.
                </>
              )}
            </>
          }
          confirmLabel="삭제"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => !deleting && setPending(null)}
        />
      )}
    </div>
  );
}
