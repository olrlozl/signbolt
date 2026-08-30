import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { adminLogin } from "../api";
import { getAdminCred, setAdminCred } from "../lib/adminAuth";

export default function AdminLogin() {
  const nav = useNavigate();
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (getAdminCred()) return <Navigate to="/admin/docs" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(user, pw);
      setAdminCred({ user, pw });
      nav("/admin/docs", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Logo />
          <p className="login-tagline">빠르고 간편하게 전자서명을 받아보세요</p>
        </div>
        <form onSubmit={submit} className="login-form">
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="아이디"
            autoComplete="username"
            autoFocus
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
          />
          {error && <div className="error">{error}</div>}
          <button className="btn primary" disabled={busy || !user || !pw}>
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>
        <span className="credit">𝒷𝓎 ⒺⓊⓃⒿⒾ</span>
      </div>
    </div>
  );
}
