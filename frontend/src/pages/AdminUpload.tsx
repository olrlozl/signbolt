import { useState } from "react";
import { useNavigate } from "react-router-dom";
import UploadDropzone from "../components/UploadDropzone";
import { uploadPdf } from "../api";

export default function AdminUpload() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(file);
      nav(`/d/${res.id}?token=${encodeURIComponent(res.admin_token)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <p className="sub">
        서명받을 PDF를 업로드하세요. 서명란을 자동 인식하고, 게시하면 QR·링크로
        서명을 받을 수 있습니다.
      </p>
      {error && <div className="error">{error}</div>}
      <UploadDropzone onFile={handleFile} disabled={busy} />
    </div>
  );
}
