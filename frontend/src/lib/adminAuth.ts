const KEY = "signbolt_admin_cred";

export interface AdminCred {
  user: string;
  pw: string;
}

export function getAdminCred(): AdminCred | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.user && c.pw ? c : null;
  } catch {
    return null;
  }
}

export function setAdminCred(cred: AdminCred): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cred));
  } catch {
    /* ignore */
  }
}

export function clearAdminCred(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
