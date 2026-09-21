import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { checkAdminSession } from "../api";

/** Gate admin-only pages behind a valid login session (checked via cookie). */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    checkAdminSession().then((v) => {
      if (alive) setOk(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (ok === null) return null;
  if (!ok) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
