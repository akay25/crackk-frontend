import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  useParams,
} from "react-router-dom";

import "./index.css";
import Start from "./routes/Start";
import SetupLayout from "./routes/setup/SetupLayout";
import ResumeStep from "./routes/setup/ResumeStep";
import JdStep from "./routes/setup/JdStep";
import ConfigStep from "./routes/setup/ConfigStep";
import MatchStep from "./routes/setup/MatchStep";
import Interview from "./routes/Interview";
import Report from "./routes/Report";
import NotFound from "./routes/NotFound";
import SessionGate from "./routes/SessionGate";
import { getOrCreateUserId } from "./utils";

// Generate + persist the anonymous user id on first load.
getOrCreateUserId();

// Any unmatched path under a session (bare `/:sessionId` or `/:sessionId/<garbage>`)
// lands on setup rather than a 404. SessionGate then validates the id and shows its
// own not-found screen if the session is bogus.
function SessionFallback() {
  const { sessionId } = useParams();
  return <Navigate to={`/${sessionId}/setup`} replace />;
}

// No auth guard — the session_id in the path is the capability. SessionGate enforces
// the lifecycle from the live combined status: pre-interview stages -> setup,
// interview.in_call -> interview, interview.completed/report.*/completed -> report.
// It redirects URL tampering (so a finished interview can't be reopened or rewound)
// and shows a not-found screen when the WS closes 4404.
const router = createBrowserRouter([
  { path: "/", element: <Start /> },
  // Setup is a nested-route stepper: SetupLayout holds the shared state + stepper chrome
  // and renders the active step (resume / jd / config) into its <Outlet/>.
  {
    path: "/:sessionId/setup",
    element: (
      <SessionGate route="setup">
        {({ socket, connected }) => (
          <SetupLayout socket={socket} connected={connected} />
        )}
      </SessionGate>
    ),
    children: [
      { index: true, element: <Navigate to="resume" replace /> },
      { path: "resume", element: <ResumeStep /> },
      { path: "jd", element: <JdStep /> },
      { path: "config", element: <ConfigStep /> },
      { path: "match", element: <MatchStep /> },
    ],
  },
  {
    path: "/:sessionId/interview",
    element: <SessionGate route="interview">{() => <Interview />}</SessionGate>,
  },
  {
    path: "/:sessionId/report",
    element: (
      <SessionGate route="report">
        {({ socket, connected }) => (
          <Report socket={socket} connected={connected} />
        )}
      </SessionGate>
    ),
  },
  // Session-scoped fallbacks: a bare session id, or any unmatched sub-path under a
  // session, redirects to that session's setup. Static segments (setup/interview/report)
  // outrank these dynamic routes, so valid URLs are unaffected.
  { path: "/:sessionId", element: <SessionFallback /> },
  { path: "/:sessionId/*", element: <SessionFallback /> },
  // Catch-all — any remaining unmatched URL (e.g. root-level junk) renders the 404 page.
  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
