import { useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon } from "./icons";

interface Props {
  signUrl: string;
  qrPngUrl: string;
  docName: string;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default function QrPanel({ signUrl, qrPngUrl, docName }: Props) {
  const title = docName.replace(/\.pdf$/i, "");
  const titleLine = `[${title}] 서명 요청`;
  const body =
    "아래 링크를 열거나 QR을 스캔해 본인 이름을 선택하고 서명해 주세요.";
  const plain = `${titleLine}\n\n${body}\n${signUrl}`;

  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedQr, setSavedQr] = useState(false);

  function markCopied() {
    setErr(null);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  async function copyNotice() {
    try {
      const qrBlob = await (await fetch(qrPngUrl)).blob();
      const dataUrl = await blobToDataUrl(qrBlob);
      const html =
        `<p><b>${esc(titleLine)}</b></p>` +
        `<p>${esc(body)}</p>` +
        `<p><a href="${esc(signUrl)}">${esc(signUrl)}</a></p>` +
        `<p><img src="${dataUrl}" width="200" height="200" alt="서명 QR"/></p>`;
      if ("ClipboardItem" in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([plain], { type: "text/plain" }),
          }),
        ]);
        markCopied();
        return;
      }
      throw new Error("no rich clipboard");
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        markCopied();
      } catch {
        setErr("복사 실패 — 위 내용을 직접 선택해 복사하세요");
      }
    }
  }

  return (
    <div className="qr-panel">
      <strong>서명 요청 보내기</strong>
      <p className="qr-sub">
        아래 메시지를 메신저나 이메일로 공유해 서명을 요청하세요.
      </p>
      <div className="qr-preview">
        <p className="qr-title-line">{titleLine}</p>
        <p className="qr-body-line">{body}</p>
        <p className="qr-link-line">
          <a href={signUrl} target="_blank" rel="noreferrer">
            {signUrl}
          </a>
        </p>
        <img className="qr-preview-img" src={qrPngUrl} alt="서명 QR 코드" />
      </div>
      <div className="qr-actions">
        <button
          className={`btn primary copy-btn${copied ? " copied" : ""}`}
          onClick={copyNotice}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "복사 완료" : "내용 복사"}
        </button>
        <a
          className={`btn copy-btn${savedQr ? " copied" : ""}`}
          href={qrPngUrl}
          download="signbolt-qr.png"
          onClick={() => {
            setSavedQr(true);
            setTimeout(() => setSavedQr(false), 3000);
          }}
        >
          {savedQr ? <CheckIcon /> : <DownloadIcon />}
          {savedQr ? "QR 이미지 저장됨" : "QR 이미지 저장"}
        </a>
      </div>
      {err && <p className="qr-msg warn">{err}</p>}
    </div>
  );
}
