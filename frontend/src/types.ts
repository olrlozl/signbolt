export interface PageInfo {
  index: number;
  width: number;
  height: number;
  image_url: string;
}

export type Bbox = [number, number, number, number];

export interface SignatureField {
  id: string;
  page: number;
  rank: string;
  signer_name: string;
  bbox_pdf: Bbox;
  source: "table" | "manual";
  already_signed: boolean;
}

export interface UploadResponse {
  id: string;
  admin_token: string;
  filename: string;
  status: DocStatus;
  pages: PageInfo[];
  fields: SignatureField[];
}

export type DocStatus = "draft" | "published" | "completed";

export interface PersonStatus {
  name: string;
  total: number;
  signed: number;
  done: boolean;
}

export interface AdminDocView {
  id: string;
  filename: string;
  status: DocStatus;
  pages: PageInfo[];
  fields: SignatureField[];
  sign_url: string | null;
  qr_svg: string | null;
  persons: PersonStatus[];
  complete: boolean;
}

export interface StatusView {
  status: DocStatus;
  persons: PersonStatus[];
  complete: boolean;
}

export interface PublishResponse {
  status: DocStatus;
  sign_url: string;
  qr_svg: string;
}

export interface SignerField {
  id: string;
  page: number;
  rank: string;
  signer_name: string;
  bbox_pdf: Bbox;
  signed: boolean;
}

export interface SignerDocView {
  filename: string;
  status: DocStatus;
  pages: PageInfo[];
  fields: SignerField[];
  remaining_names: string[];
  complete: boolean;
}

export interface SubmitResponse {
  ok: boolean;
  person: PersonStatus;
  remaining_names: string[];
  complete: boolean;
}

export interface FieldInput {
  id: string;
  page: number;
  rank: string;
  signer_name: string;
  bbox_pdf: Bbox;
  source: "table" | "manual";
}
export type FieldInputList = FieldInput[];

/** field id -> signature PNG data URL (client-side, before submit) */
export type SignatureMap = Record<string, string>;
