import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import Start from "./routes/Start";
import Setup from "./routes/Setup";
import Interview from "./routes/Interview";
import Report from "./routes/Report";
import { getOrCreateUserId } from "./lib/api";

// Generate + persist the anonymous user id on first load.
getOrCreateUserId();

// No auth guard — the session_id in the path is the capability; the pages handle
// a 404 if it isn't a real session.
const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  { path: "/:sessionId/setup", element: <Setup /> },
  { path: "/:sessionId/interview", element: <Interview /> },
  { path: "/:sessionId/report", element: <Report /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
