import { useEffect, useRef, useState } from "react";
import type { Bbox } from "../types";

interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoxMode = "edit" | "highlight" | "readonly";

export interface BoxField {
  id: string;
  rank: string;
  signer_name: string;
  bbox_pdf: Bbox;
  source?: string;
  already_signed?: boolean;
}

interface Props {
  field: BoxField;
  mode: BoxMode;
  scale: number;
  pageWidthPx: number;
  pageHeightPx: number;
  signed?: string;
  nameOptions?: string[];
  emphasise?: boolean; // highlight mode: this is the current signer's box
  onOpen?: () => void;
  onRemove?: () => void;
  onChange?: (bbox_pdf: Bbox) => void;
  onAssign?: (name: string) => void;
}

// bottom-right corner is reserved for the × delete button
const HANDLES = ["nw", "ne", "sw"] as const;
type DragMode = "move" | (typeof HANDLES)[number];
const MIN_PX = 14;
const THRESHOLD = 3;
const CUSTOM = "__custom__";

export default function SignatureBox({
  field,
  mode,
  scale,
  pageWidthPx,
  pageHeightPx,
  signed,
  nameOptions = [],
  emphasise,
  onOpen,
  onRemove,
  onChange,
  onAssign,
}: Props) {
  const toPx = (b: Bbox): PxRect => ({
    x: b[0] * scale,
    y: b[1] * scale,
    w: (b[2] - b[0]) * scale,
    h: (b[3] - b[1]) * scale,
  });
  const toPdf = (r: PxRect): Bbox => [
    r.x / scale,
    r.y / scale,
    (r.x + r.w) / scale,
    (r.y + r.h) / scale,
  ];

  const [rect, setRect] = useState<PxRect>(toPx(field.bbox_pdf));
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    m: DragMode;
    x: number;
    y: number;
    orig: PxRect;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setRect(toPx(field.bbox_pdf));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.bbox_pdf, scale]);

  const editable = mode === "edit";
  const tappable = mode === "highlight" && !!emphasise && !field.already_signed;

  function begin(e: React.PointerEvent, m: DragMode) {
    if (!editable) return;
    e.stopPropagation();
    boxRef.current?.setPointerCapture(e.pointerId);
    drag.current = { m, x: e.clientX, y: e.clientY, orig: rect, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD) d.moved = true;
    let r = { ...d.orig };
    if (d.m === "move") {
      r.x += dx;
      r.y += dy;
    } else {
      if (d.m.includes("w")) {
        r.x += dx;
        r.w -= dx;
      }
      if (d.m.includes("e")) r.w += dx;
      if (d.m.includes("n")) {
        r.y += dy;
        r.h -= dy;
      }
      if (d.m.includes("s")) r.h += dy;
    }
    if (r.w < MIN_PX) {
      if (d.m.includes("w")) r.x -= MIN_PX - r.w;
      r.w = MIN_PX;
    }
    if (r.h < MIN_PX) {
      if (d.m.includes("n")) r.y -= MIN_PX - r.h;
      r.h = MIN_PX;
    }
    r.x = Math.max(0, Math.min(r.x, pageWidthPx - r.w));
    r.y = Math.max(0, Math.min(r.y, pageHeightPx - r.h));
    r.w = Math.min(r.w, pageWidthPx - r.x);
    r.h = Math.min(r.h, pageHeightPx - r.y);
    setRect(r);
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) onChange?.(toPdf(rect));
  }

  const who = [field.rank, field.signer_name].filter(Boolean).join(" ");
  const cls = [
    "sig-box",
    field.already_signed ? "already" : "",
    signed ? "done" : "",
    field.source === "manual" ? "manual" : "",
    mode === "highlight" ? "highlight" : "",
    emphasise ? "emph" : "",
    mode === "readonly" ? "readonly" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={boxRef}
      className={cls}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      onPointerDown={(e) => begin(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => (drag.current = null)}
      onClick={() => {
        if (tappable) onOpen?.();
      }}
      title={
        field.already_signed
          ? "이미 서명됨"
          : editable
            ? `${who || "서명란"} — 끌어 이동 / 모서리로 크기조절`
            : `${who || "서명란"} 서명하기`
      }
    >
      {mode === "highlight" ? null : editable ? (
        <select
          className="name-select"
          value={field.signer_name}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              const typed = window.prompt("서명자 이름", field.signer_name);
              if (typed != null) onAssign?.(typed.trim());
            } else {
              onAssign?.(v);
            }
          }}
        >
          <option value="">(이름 선택)</option>
          <option value={CUSTOM}>+ 직접 입력…</option>
          {field.signer_name && !nameOptions.includes(field.signer_name) && (
            <option value={field.signer_name}>{field.signer_name}</option>
          )}
          {nameOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <span className="label">{who || "서명란"}</span>
      )}

      {editable && (
        <>
          <button
            className="del"
            title="삭제"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
          >
            ×
          </button>
          {HANDLES.map((h) => (
            <span
              key={h}
              className={`handle ${h}`}
              onPointerDown={(e) => begin(e, h)}
            />
          ))}
        </>
      )}

      {signed && <img className="sig-img" src={signed} alt="" />}
    </div>
  );
}
