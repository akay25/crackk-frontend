import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import Start from "./routes/Start";
import Setup from "./routes/Setup";
import Interview from "./routes/Interview";
import Report from "./routes/Report";
import NotFound from "./routes/NotFound";
import SessionGate from "./routes/SessionGate";
import { getOrCreateUserId } from "./lib/api";

// Generate + persist the anonymous user id on first load.
getOrCreateUserId();

// No auth guard — the session_id in the path is the capability. SessionGate enforces
// the lifecycle from the live combined status: pre-interview stages -> setup,
// interview.in_call -> interview, interview.completed/report.*/completed -> report.
// It redirects URL tampering (so a finished interview can't be reopened or rewound)
// and shows a not-found screen when the WS closes 4404.
const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  { path: "/:sessionId/setup", element: <SessionGate route="setup"><Setup /></SessionGate> },
  { path: "/:sessionId/interview", element: <SessionGate route="interview"><Interview /></SessionGate> },
  { path: "/:sessionId/report", element: <SessionGate route="report"><Report /></SessionGate> },
  // Catch-all — any unmatched URL renders the 404 page.
  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
