import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getAdminCred } from "../lib/adminAuth";

/** Gate admin-only pages behind the admin login (stored in localStorage). */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  if (!getAdminCred()) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
