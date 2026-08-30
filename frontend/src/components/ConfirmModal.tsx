import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  icon,
  confirmLabel = "확인",
  cancelLabel = "취소",
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, onConfirm]);

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm-modal"
        role="alertdialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {icon && (
          <span className={`confirm-icon${danger ? " danger" : ""}`}>
            {icon}
          </span>
        )}
        <h2>{title}</h2>
        {message && <div className="confirm-message">{message}</div>}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
