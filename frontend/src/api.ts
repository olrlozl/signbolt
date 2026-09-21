import type {
  AdminDocSummary,
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

// ---- admin: login + document list ----

export async function adminLogin(
  username: string,
  password: string,
): Promise<void> {
  await j(
    await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
}

export async function adminLogout(): Promise<void> {
  await fetch("/api/admin/logout", {
    method: "POST",
    credentials: "include",
  });
}

export async function checkAdminSession(): Promise<boolean> {
  const res = await fetch("/api/admin/session", { credentials: "include" });
  return res.ok;
}

export async function listAdminDocs(): Promise<AdminDocSummary[]> {
  return j(
    await fetch("/api/admin/documents", { credentials: "include" }),
  );
}

export async function deleteAdminDoc(id: string): Promise<void> {
  await j(
    await fetch(`/api/admin/documents/${id}`, {
      method: "DELETE",
      credentials: "include",
    }),
  );
}

// ---- admin: single document ----

export async function uploadPdf(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  return j(
    await fetch("/api/documents", {
      method: "POST",
      credentials: "include",
      body: form,
    }),
  );
}

export async function getAdminDoc(id: string): Promise<AdminDocView> {
  return j(
    await fetch(`/api/documents/${id}`, { credentials: "include" }),
  );
}

export async function saveFields(
  id: string,
  fields: FieldInputList,
): Promise<AdminDocView> {
  return j(
    await fetch(`/api/documents/${id}/fields`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    }),
  );
}

export async function publishDoc(id: string): Promise<PublishResponse> {
  return j(
    await fetch(`/api/documents/${id}/publish`, {
      method: "POST",
      credentials: "include",
    }),
  );
}

export async function getStatus(id: string): Promise<StatusView> {
  return j(
    await fetch(`/api/documents/${id}/status`, { credentials: "include" }),
  );
}

export function finalPdfUrl(id: string): string {
  return `/api/documents/${id}/final.pdf`;
}

export function qrPngUrl(id: string): string {
  return `/api/documents/${id}/qr.png`;
}

export function signaturePngUrl(id: string, fieldId: string): string {
  return `/api/documents/${id}/signatures/${encodeURIComponent(fieldId)}.png`;
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
