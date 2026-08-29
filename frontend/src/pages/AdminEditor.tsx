import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import PageView, { type PageViewField } from "../components/PageView";
import DocHeader from "../components/DocHeader";
import QrPanel from "../components/QrPanel";
import StatusDashboard from "../components/StatusDashboard";
import {
  finalPdfUrl,
  getAdminDoc,
  getStatus,
  publishDoc,
  qrPngUrl,
  saveFields,
} from "../api";
import type { AdminDocView, Bbox, SignatureField, StatusView } from "../types";

export default function AdminEditor() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";

  const [doc, setDoc] = useState<AdminDocView | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<StatusView | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getAdminDoc(id, token);
      setDoc(d);
      setFields(d.fields.map((f) => ({ ...f })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const published = doc?.status === "published" || doc?.status === "completed";

  // poll status while published
  useEffect(() => {
    if (!published) return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await getStatus(id, token);
        if (alive) setStatus(s);
      } catch {
        /* ignore */
      }
    };
    tick();
    const h = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [published, id, token]);

  const nameOptions = useMemo(() => {
    const set = new Set<string>();
    (doc?.fields ?? []).forEach((f) => f.signer_name && set.add(f.signer_name));
    fields.forEach((f) => f.signer_name && set.add(f.signer_name));
    return [...set].sort();
  }, [doc, fields]);

  const unnamed = fields.filter((f) => !f.signer_name.trim()).length;

  // known 직위 for a given name, taken from any field that already has both
  const rankByName = useMemo(() => {
    const m = new Map<string, string>();
    [...(doc?.fields ?? []), ...fields].forEach((f) => {
      if (f.signer_name && f.rank && !m.has(f.signer_name)) {
        m.set(f.signer_name, f.rank);
      }
    });
    return m;
  }, [doc, fields]);

  function patch(id2: string, p: Partial<SignatureField>) {
    setFields((prev) => prev.map((f) => (f.id === id2 ? { ...f, ...p } : f)));
    setDirty(true);
  }
  function assignName(id2: string, name: string) {
    const known = rankByName.get(name);
    patch(id2, known ? { signer_name: name, rank: known } : { signer_name: name });
  }
  function removeField(id2: string) {
    setFields((prev) => prev.filter((f) => f.id !== id2));
    setDirty(true);
  }
  function addField() {
    if (!doc) return;
    const pg = doc.pages[0];
    // match the size of existing signature boxes (median), fall back to a default
    const median = (ns: number[]) => {
      const s = [...ns].sort((a, b) => a - b);
      return s.length ? s[Math.floor(s.length / 2)] : NaN;
    };
    const ref = fields.length ? fields : doc.fields;
    const w =
      median(ref.map((f) => f.bbox_pdf[2] - f.bbox_pdf[0])) || 110;
    const h =
      median(ref.map((f) => f.bbox_pdf[3] - f.bbox_pdf[1])) || 30;
    const x = pg.width / 2 - w / 2;
    const y = pg.height / 2 - h / 2;
    setFields((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        page: pg.index,
        rank: "",
        signer_name: "",
        bbox_pdf: [x, y, x + w, y + h] as Bbox,
        source: "manual",
        already_signed: false,
      },
    ]);
    setDirty(true);
  }

  async function persist(): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const d = await saveFields(
        id,
        token,
        fields.map((f) => ({
          id: f.id,
          page: f.page,
          rank: f.rank,
          signer_name: f.signer_name.trim(),
          bbox_pdf: f.bbox_pdf,
          source: f.source,
        })),
      );
      setDoc(d);
      setDirty(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (unnamed > 0) {
      setError("이름이 지정되지 않은 서명란이 있습니다.");
      return;
    }
    if (fields.length === 0) {
      setError("서명란이 하나도 없습니다.");
      return;
    }
    if (dirty && !(await persist())) return;
    setBusy(true);
    try {
      await publishDoc(id, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc) return <div className="app"><div className="error">{error}</div></div>;
  if (!doc) return <div className="app"><p className="sub">불러오는 중…</p></div>;

  const asPageFields = (pageIdx: number): PageViewField[] =>
    fields.filter((f) => f.page === pageIdx).map((f) => ({ ...f }));

  const persons = (status ?? doc).persons;
  const doneCount = persons.filter((p) => p.done).length;
  const headerMeta = published
    ? `게시됨 · ${doneCount}/${persons.length} 서명 완료`
    : `초안 · 서명란 ${fields.length}개`;

  return (
    <div className="app">
      <DocHeader filename={doc.filename} meta={headerMeta} />

      {error && <div className="error">{error}</div>}

      {!published && (
        <>
          <p className="sub">
            자동 인식된 서명란입니다. 각 서명란에 서명자 이름을 지정하세요.
            서명란의 위치와 크기를 조정하거나 추가·삭제할 수 있습니다.
          </p>
          <div className="toolbar">
            <span className="count">
              서명란 {fields.length}개
              {unnamed > 0 && ` · 이름 없는 칸 ${unnamed}개`}
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={addField}>+ 서명란 추가</button>
            <button className="btn" onClick={persist} disabled={busy || !dirty}>
              {busy ? "저장 중…" : dirty ? "저장" : "저장됨"}
            </button>
            <button
              className="btn primary"
              onClick={handlePublish}
              disabled={busy || fields.length === 0 || unnamed > 0}
            >
              게시하고 QR 만들기
            </button>
          </div>
        </>
      )}

      {published && doc.sign_url && (
        <div className="publish-grid">
          <QrPanel
            signUrl={doc.sign_url}
            qrPngUrl={qrPngUrl(id, token)}
            docName={doc.filename}
          />
          <StatusDashboard
            persons={(status ?? doc).persons}
            complete={(status ?? doc).complete}
            finalUrl={finalPdfUrl(id, token)}
          />
        </div>
      )}

      {doc.pages.map((p) => (
        <PageView
          key={p.index}
          page={p}
          mode={published ? "readonly" : "edit"}
          fields={asPageFields(p.index)}
          nameOptions={nameOptions}
          onRemove={removeField}
          onChange={(fid, bbox) => patch(fid, { bbox_pdf: bbox })}
          onAssign={(fid, name) => assignName(fid, name)}
        />
      ))}
    </div>
  );
}
