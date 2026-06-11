// Route-level lifecycle guard. The session_id in the URL is the capability, but a
// session is also at a single point in its lifecycle, and the UI must follow it:
// setup → interview → report. This reads the live combined status over the WebSocket
// (snapshot + status events) and redirects (replace) to the canonical page if the
// user lands on — or hand-edits the URL to — a page that doesn't match. A finished
// interview therefore can't be reopened or rewound, and an unknown session (WS close
// 4404) shows a not-found screen.
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getSession } from "../lib/api";
import { parseStatus, useSessionStatus } from "../lib/ws";
import { Shell, Spinner } from "../components/ui";
import NotFound from "./NotFound";

export type RouteKey = "setup" | "interview" | "report";

// Map a combined status to the single page the user belongs on:
//   - init / resume.* / jd.* / difficulty_set / blueprint.*  → setup only
//   - interview.ready / interview.in_call                    → interview only
//   - interview.completed / interview.failed / report.* / completed → report only
// The candidate can't sidestep this by editing the URL.
function gateFor(status: string): RouteKey {
  const { stage, sub } = parseStatus(status);

  // Report zone: the report stage, the terminal "completed", or the interview having
  // finished/failed (report building, or no report possible).
  if (
    stage === "report" ||
    stage === "completed" ||
    (stage === "interview" && (sub === "completed" || sub === "failed"))
  ) {
    return "report";
  }

  // Interview zone: at the interview stage, ready to start or in a live call.
  if (stage === "interview" && (sub === "ready" || sub === "in_call")) {
    return "interview";
  }

  // Everything else — init, resume.*, jd.*, difficulty_set, blueprint.* — is setup.
  return "setup";
}

function Loading() {
  return (
    <Shell>
      <div className="flex flex-col items-center py-20">
        <Spinner className="size-7 text-indigo-500" />
        <p className="mt-3 font-medium text-slate-700">Loading…</p>
      </div>
    </Shell>
  );
}

export default function SessionGate({ route, children }: { route: RouteKey; children: ReactNode }) {
  const { sessionId } = useParams();

  // Live status is authoritative. Seed once from REST so a slow WS connect doesn't
  // hang the gate on a blank loading screen.
  const live = useSessionStatus(sessionId ?? null);
  const [seed, setSeed] = useState<string | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => setSeed(s.status))
      .catch(() => {});
  }, [sessionId]);

  const status = live.status ?? seed;

  // Unknown session (WS closed 4404) — same page as any other unmatched route.
  if (!sessionId || live.notFound) return <NotFound />;
  if (!status) return <Loading />;

  const belongs = gateFor(status);
  if (belongs !== route) {
    return <Navigate to={`/${sessionId}/${belongs}`} replace />;
  }

  return <>{children}</>;
}
