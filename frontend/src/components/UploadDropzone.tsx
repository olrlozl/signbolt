import { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function UploadDropzone({ onFile, disabled }: Props) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) onFile(f);
  }

  return (
    <div
      className={`dropzone${drag ? " drag" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled) pick(e.dataTransfer.files);
      }}
    >
      <strong>{disabled ? "분석 중…" : "서명부 PDF를 여기에 놓으세요"}</strong>
      <span>클릭해서 파일을 선택할 수도 있습니다 · 최대 25MB</span>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  );
}
