import { useEffect, useRef, useState } from "react";
import type { Bbox } from "../types";

interface Props {
  bbox_pdf: Bbox;
  who: string;
  fullscreen?: boolean;
  onCancel: () => void;
  onSave: (pngDataUrl: string) => void;
}

type Stroke = { x: number; y: number }[];

export default function SignaturePadModal({
  bbox_pdf,
  who,
  fullscreen,
  onCancel,
  onSave,
}: Props) {
  const w = bbox_pdf[2] - bbox_pdf[0];
  const h = bbox_pdf[3] - bbox_pdf[1];
  const aspect = h > 0 && w > 0 ? h / w : 0.4;
  const canvasW = fullscreen ? 900 : 620;
  const canvasH = Math.max(120, Math.round(canvasW * aspect));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [empty, setEmpty] = useState(true);

  function redraw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = Math.max(2.5, canvasW / 200);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#12203a";
    ctx.fillStyle = "#12203a";
    for (const s of strokesRef.current) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x, s[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.length > 1) {
        ctx.beginPath();
        ctx.moveTo(s[0].x, s[0].y);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
        ctx.stroke();
      }
    }
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className={fullscreen ? "modal modal-full" : "modal"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>서명 입력</h2>
        <div className="who">{who}</div>
        <canvas
          ref={canvasRef}
          className="pad"
          width={canvasW}
          height={canvasH}
          style={{ aspectRatio: `${canvasW} / ${canvasH}` }}
          onPointerDown={(e) => {
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            drawingRef.current = [pos(e)];
            strokesRef.current.push(drawingRef.current);
            setEmpty(false);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawingRef.current) return;
            drawingRef.current.push(pos(e));
            redraw();
          }}
          onPointerUp={() => (drawingRef.current = null)}
          onPointerLeave={() => (drawingRef.current = null)}
        />
        <div className="modal-actions">
          <button
            className="btn ghost"
            onClick={() => {
              strokesRef.current.pop();
              setEmpty(strokesRef.current.length === 0);
              redraw();
            }}
          >
            획 지우기
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              strokesRef.current = [];
              setEmpty(true);
              redraw();
            }}
          >
            전체 지우기
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            className="btn primary"
            disabled={empty}
            onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
