import { useEffect, useRef, useState } from "react";
import { PenIcon } from "./icons";

interface Props {
  initial?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export default function NameInputModal({
  initial = "",
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const trimmed = value.trim();

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="modal confirm-modal name-modal"
        role="dialog"
        aria-label="서명자 이름 입력"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="confirm-icon">
          <PenIcon />
        </span>
        <h2>직접 입력</h2>
        <p className="confirm-message">
          이 서명란에 서명할 사람의 이름을 입력하세요.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
        >
          <input
            ref={inputRef}
            className="name-modal-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={40}
          />
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={onCancel}>
              취소
            </button>
            <button type="submit" className="btn primary" disabled={!trimmed}>
              확인
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
