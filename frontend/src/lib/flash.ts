/** One-shot message handed from one screen to the next across a navigation
 *  (e.g. "초안으로 저장됨" shown on the document list after leaving the editor). */
let pending: string | null = null;

export function setFlash(message: string): void {
  pending = message;
}

export function takeFlash(): string | null {
  const m = pending;
  pending = null;
  return m;
}
