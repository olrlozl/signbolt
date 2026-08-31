import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useParams, useSearchParams } from "react-router-dom";
import PageView, {
  type PageViewField,
  type PageViewHandle,
} from "../components/PageView";
import DocHeader from "../components/DocHeader";
import AdminSteps from "../components/AdminSteps";
import BackToDocs from "../components/BackToDocs";
import NameInputModal from "../components/NameInputModal";
import { formatDateTime } from "../lib/format";
import { setFlash } from "../lib/flash";
import { CheckIcon } from "../components/icons";
import QrPanel from "../components/QrPanel";
import StatusDashboard from "../components/StatusDashboard";
import {
  finalPdfUrl,
  getAdminDoc,
  getStatus,
  publishDoc,
  qrPngUrl,
  saveFields,
  signaturePngUrl,
} from "../api";
import type { AdminDocView, Bbox, SignatureField, StatusView } from "../types";

type FieldPayload = {
  id: string;
  page: number;
  rank: string;
  signer_name: string;
  bbox_pdf: Bbox;
  source: "table" | "manual";
};

const payloadOf = (fs: SignatureField[]): FieldPayload[] =>
  fs.map((f) => ({
    id: f.id,
    page: f.page,
    rank: f.rank,
    signer_name: f.signer_name.trim(),
    bbox_pdf: f.bbox_pdf,
    source: f.source,
  }));

const serialize = (fs: SignatureField[]) => JSON.stringify(payloadOf(fs));

export default function AdminEditor() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";

  const [doc, setDoc] = useState<AdminDocView | null>(null);
  const [fields, setFields] = useState<SignatureField[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // publishing
  const [saving, setSaving] = useState(false); // auto-save in flight
  const [status, setStatus] = useState<StatusView | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [customFor, setCustomFor] = useState<string | null>(null);
  const pageRefs = useRef<Record<number, PageViewHandle | null>>({});
  const savedRef = useRef<string | null>(null); // serialized last-saved fields
  const savingRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await getAdminDoc(id, token);
      setDoc(d);
      const fs = d.fields.map((f) => ({ ...f }));
      setFields(fs);
      savedRef.current = serialize(fs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const published = doc?.status === "published" || doc?.status === "completed";
  const dirty =
    !published &&
    savedRef.current !== null &&
    serialize(fields) !== savedRef.current;

  // debounced auto-save while editing a draft
  useEffect(() => {
    if (published || !dirty || saving) return;
    const t = setTimeout(() => void save(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, published, saving, fields]);

  // when leaving a draft: flush any pending edits, then show "초안으로 저장됨"
  // on the next screen and let the navigation through
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !published &&
      fields.length > 0 &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;
    (async () => {
      while (savingRef.current && !cancelled)
        await new Promise((r) => setTimeout(r, 40));
      if (cancelled) return;
      const needsSave =
        savedRef.current !== null && serialize(fields) !== savedRef.current;
      const ok = needsSave ? await save() : true;
      if (cancelled) return;
      if (ok) {
        setFlash("초안으로 저장됨");
        blocker.proceed();
      } else {
        blocker.reset();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  // guard tab close / refresh while there are unsaved edits
  useEffect(() => {
    if (!dirty && !saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saving]);

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
  }
  function assignName(id2: string, name: string) {
    const known = rankByName.get(name);
    patch(
      id2,
      known ? { signer_name: name, rank: known } : { signer_name: name },
    );
  }
  function removeField(id2: string) {
    setFields((prev) => prev.filter((f) => f.id !== id2));
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
    const w = median(ref.map((f) => f.bbox_pdf[2] - f.bbox_pdf[0])) || 110;
    const h = median(ref.map((f) => f.bbox_pdf[3] - f.bbox_pdf[1])) || 30;

    // find a spot on page 1 that doesn't overlap any existing box: cascade
    // down from the top-left, wrap to a new column, keeping a small gap
    const GAP = 8;
    const M = 16; // page margin
    const boxes = fields
      .filter((f) => f.page === pg.index)
      .map((f) => f.bbox_pdf);
    const overlaps = (x: number, y: number) =>
      boxes.some(
        (b) =>
          x < b[2] + GAP &&
          x + w > b[0] - GAP &&
          y < b[3] + GAP &&
          y + h > b[1] - GAP,
      );
    let x = M;
    let y = M;
    let guard = 0;
    while (overlaps(x, y) && guard++ < 500) {
      y += h + GAP;
      if (y + h > pg.height - M) {
        y = M;
        x += w + GAP;
        if (x + w > pg.width - M) {
          x = M; // page is packed — give up and stack at the corner
          y = M;
          break;
        }
      }
    }

    const newId = `manual-${Date.now()}`;
    setFields((prev) => [
      ...prev,
      {
        id: newId,
        page: pg.index,
        rank: "",
        signer_name: "",
        bbox_pdf: [x, y, x + w, y + h] as Bbox,
        source: "manual",
        already_signed: false,
      },
    ]);
    setFlashId(newId);
    setTimeout(() => {
      pageRefs.current[pg.index]?.scrollFieldIntoView(newId);
    }, 60);
    setTimeout(() => setFlashId((cur) => (cur === newId ? null : cur)), 1600);
  }

  async function save(): Promise<boolean> {
    if (savingRef.current) return false;
    savingRef.current = true;
    const payload = payloadOf(fields);
    const snap = JSON.stringify(payload);
    setSaving(true);
    setError(null);
    try {
      const d = await saveFields(id, token, payload);
      savedRef.current = snap;
      if (aliveRef.current) setDoc(d);
      return true;
    } catch (e) {
      if (aliveRef.current)
        setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      savingRef.current = false;
      if (aliveRef.current) setSaving(false);
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
    if (dirty && !(await save())) return;
    setBusy(true);
    try {
      await publishDoc(id, token);
      await load();
      window.scrollTo({ top: 0, behavior: "auto" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !doc)
    return (
      <div className="app">
        <div className="error">{error}</div>
      </div>
    );
  if (!doc)
    return (
      <div className="app">
        <p className="sub">불러오는 중…</p>
      </div>
    );

  const asPageFields = (pageIdx: number): PageViewField[] =>
    fields.filter((f) => f.page === pageIdx).map((f) => ({ ...f }));

  // any signature box the detector produced (vs. ones the admin added by hand)
  const hasDetected = doc.fields.some(
    (f) => f.source !== "manual" && !f.id.includes("manual-"),
  );

  const headerMeta = `${formatDateTime(doc.created_at)} 등록`;

  // collected signatures, keyed by field id, for the readonly preview
  const collectedSigs: Record<string, string> = {};
  if (published) {
    for (const fid of (status ?? doc).signed_field_ids ?? [])
      collectedSigs[fid] = signaturePngUrl(id, token, fid);
  }

  return (
    <div className={`app${published ? "" : " has-toolbar"}`}>
      <BackToDocs />
      {!published && <AdminSteps current={2} />}
      <DocHeader filename={doc.filename} meta={headerMeta} />

      {error && <div className="error">{error}</div>}

      {!published && (
        <>
          {hasDetected && (
            <div className="editor-hint editor-hint-ok">
              <span className="editor-hint-icon">
                <CheckIcon />
              </span>
              <p>문서에서 서명란을 자동 감지하여 추가했습니다.</p>
            </div>
          )}
          <nav className="toolbar">
            <div className="toolbar-inner">
              <span className="count">
                서명란 총 {fields.length}개
                {unnamed > 0 && (
                  <span className="count-warn">
                    {" · "}
                    <b>이름 미지정 {unnamed}개</b>
                  </span>
                )}
                <span className="save-state">
                  {saving
                    ? " · 저장 중…"
                    : dirty
                      ? " · 저장 대기"
                      : " · 자동 저장됨"}
                </span>
              </span>
              <button className="btn accent" onClick={addField}>
                + 서명란 추가
              </button>
              <button
                className="btn primary"
                onClick={handlePublish}
                disabled={busy || saving || fields.length === 0 || unnamed > 0}
                title={
                  unnamed > 0
                    ? "이름이 지정되지 않은 서명란(빨간색)이 있어 게시할 수 없습니다."
                    : undefined
                }
              >
                {busy ? "게시 중…" : "게시하고 QR 만들기"}
              </button>
            </div>
          </nav>
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

      {published && (
        <div className="preview-head">
          <strong>서명본 미리보기</strong>
          <span>현재까지 수집된 서명이 실시간으로 반영됩니다.</span>
        </div>
      )}

      {doc.pages.map((p) => (
        <PageView
          key={p.index}
          ref={(h) => (pageRefs.current[p.index] = h)}
          page={p}
          mode={published ? "readonly" : "edit"}
          fields={asPageFields(p.index)}
          signatures={published ? collectedSigs : undefined}
          nameOptions={nameOptions}
          flashId={flashId}
          onRemove={removeField}
          onChange={(fid, bbox) => patch(fid, { bbox_pdf: bbox })}
          onAssign={(fid, name) => assignName(fid, name)}
          onCustomName={(fid) => setCustomFor(fid)}
        />
      ))}

      {customFor && (
        <NameInputModal
          initial={fields.find((f) => f.id === customFor)?.signer_name ?? ""}
          onSubmit={(name) => {
            assignName(customFor, name);
            setCustomFor(null);
          }}
          onCancel={() => setCustomFor(null)}
        />
      )}
    </div>
  );
}
