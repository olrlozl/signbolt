import { Link, Outlet, useLocation } from "react-router-dom";
import Logo from "./components/Logo";

export default function App() {
  const { pathname } = useLocation();
  const bare = pathname === "/admin"; // login screen has its own layout
  const isSigner = pathname.startsWith("/s/");

  return (
    <>
      {!bare && (
        <header className="app-header">
          {isSigner ? (
            <Logo />
          ) : (
            <Link to="/admin/docs" className="logo-link" aria-label="문서 목록">
              <Logo />
            </Link>
          )}
          <span className="credit">𝒷𝓎 ⒺⓊⓃⒿⒾ</span>
        </header>
      )}
      <Outlet />
    </>
  );
}
