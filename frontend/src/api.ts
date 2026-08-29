import type {
  AdminDocView,
  FieldInputList,
  PublishResponse,
  SignerDocView,
  StatusView,
  SubmitResponse,
  UploadResponse,
} from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `요청 실패 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ---- admin ----

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return j(await fetch("/api/documents", { method: "POST", body: form }));
}

export async function getAdminDoc(
  id: string,
  token: string,
): Promise<AdminDocView> {
  return j(await fetch(`/api/documents/${id}?token=${encodeURIComponent(token)}`));
}

export async function saveFields(
  id: string,
  token: string,
  fields: FieldInputList,
): Promise<AdminDocView> {
  return j(
    await fetch(`/api/documents/${id}/fields?token=${encodeURIComponent(token)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    }),
  );
}

export async function publishDoc(
  id: string,
  token: string,
): Promise<PublishResponse> {
  return j(
    await fetch(`/api/documents/${id}/publish?token=${encodeURIComponent(token)}`, {
      method: "POST",
    }),
  );
}

export async function getStatus(
  id: string,
  token: string,
): Promise<StatusView> {
  return j(await fetch(`/api/documents/${id}/status?token=${encodeURIComponent(token)}`));
}

export function finalPdfUrl(id: string, token: string): string {
  return `/api/documents/${id}/final.pdf?token=${encodeURIComponent(token)}`;
}

export function qrPngUrl(id: string, token: string): string {
  return `/api/documents/${id}/qr.png?token=${encodeURIComponent(token)}`;
}

// ---- signer ----

export async function getSignerDoc(token: string): Promise<SignerDocView> {
  return j(await fetch(`/api/sign/${encodeURIComponent(token)}`));
}

export async function submitSignatures(
  token: string,
  signer_name: string,
  signatures: { field_id: string; png_data_url: string }[],
): Promise<SubmitResponse> {
  return j(
    await fetch(`/api/sign/${encodeURIComponent(token)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signer_name, signatures }),
    }),
  );
}
