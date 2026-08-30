import type { DocStatus } from "../types";

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: "초안",
  published: "진행 중",
  completed: "완료",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026.8.30(일) 15:08" — used for document 등록 일시. */
export function formatDateTime(sec: number): string {
  const d = new Date(sec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`;
}
