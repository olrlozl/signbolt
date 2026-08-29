import { Navigate, Route, Routes } from "react-router-dom";
import AdminUpload from "./pages/AdminUpload";
import AdminEditor from "./pages/AdminEditor";
import SignerFlow from "./pages/SignerFlow";
import Logo from "./components/Logo";

export default function App() {
  return (
    <>
      <header className="app-header">
        <Logo />
        <span className="credit">𝒷𝓎 ⒺⓊⓃⒿⒾ</span>
      </header>
      <Routes>
        <Route path="/" element={<AdminUpload />} />
        <Route path="/d/:id" element={<AdminEditor />} />
        <Route path="/s/:token" element={<SignerFlow />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
