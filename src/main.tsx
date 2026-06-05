import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import Start from "./routes/Start";
import Setup from "./routes/Setup";
import Interview from "./routes/Interview";
import Report from "./routes/Report";
import SessionGate from "./routes/SessionGate";
import { getOrCreateUserId } from "./lib/api";

// Generate + persist the anonymous user id on first load.
getOrCreateUserId();

// No auth guard — the session_id in the path is the capability; the pages handle
// a 404 if it isn't a real session. SessionGate enforces the lifecycle: it sends
// the user to the page that matches the session's status (draft -> setup, in_call
// -> interview, completed -> report) and redirects URL tampering, so a finished
// interview can't be reopened or rewound. A `failed` session shows an error.
const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  { path: "/:sessionId/setup", element: <SessionGate route="setup"><Setup /></SessionGate> },
  { path: "/:sessionId/interview", element: <SessionGate route="interview"><Interview /></SessionGate> },
  { path: "/:sessionId/report", element: <SessionGate route="report"><Report /></SessionGate> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
