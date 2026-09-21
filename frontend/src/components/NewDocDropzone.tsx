import { useState } from "react";
import { useNavigate } from "react-router-dom";
import UploadDropzone from "./UploadDropzone";
import { uploadPdf } from "../api";

/** Dropzone + upload flow, shared by the new-doc page and the empty list state. */
export default function NewDocDropzone() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadPdf(file);
      nav(`/d/${res.id}`, { state: { justUploaded: true } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("아이디") ||
        msg.includes("비밀번호") ||
        msg.includes("401")
      ) {
        nav("/admin", { replace: true });
        return;
      }
      setError(msg);
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <UploadDropzone onFile={handleFile} disabled={busy} />
    </>
  );
}
