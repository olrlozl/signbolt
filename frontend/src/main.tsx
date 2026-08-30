import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import App from "./App";
import AdminUpload from "./pages/AdminUpload";
import AdminEditor from "./pages/AdminEditor";
import AdminLogin from "./pages/AdminLogin";
import AdminDocList from "./pages/AdminDocList";
import SignerFlow from "./pages/SignerFlow";
import RequireAdmin from "./components/RequireAdmin";
import "./styles.css";

const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <Navigate to="/admin/docs" replace /> },
      { path: "/admin", element: <AdminLogin /> },
      {
        path: "/admin/docs",
        element: (
          <RequireAdmin>
            <AdminDocList />
          </RequireAdmin>
        ),
      },
      {
        path: "/admin/new",
        element: (
          <RequireAdmin>
            <AdminUpload />
          </RequireAdmin>
        ),
      },
      { path: "/d/:id", element: <AdminEditor /> },
      { path: "/s/:token", element: <SignerFlow /> },
      { path: "*", element: <Navigate to="/admin/docs" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
