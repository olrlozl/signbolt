import { useRef, useState } from "react";
import { FilePlusIcon } from "./icons";

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
      className={`dropzone${drag ? " drag" : ""}${disabled ? " busy" : ""}`}
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
      <span className="dropzone-icon">
        <FilePlusIcon />
      </span>
      <strong>
        {disabled
          ? "PDF 분석 중…"
          : drag
            ? "여기에 놓으세요"
            : "서명부 PDF를 끌어다 놓으세요"}
      </strong>
      <span>
        {disabled
          ? "잠시만 기다려 주세요"
          : "또는 클릭해서 파일 선택 · PDF 최대 25MB"}
      </span>
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
