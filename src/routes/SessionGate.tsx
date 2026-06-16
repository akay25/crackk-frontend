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
import { parseStatus, useSessionStatus } from "../lib/socket";
import { Shell, Spinner } from "../components/ui";
import NotFound from "./NotFound";

export type RouteKey = "setup" | "interview" | "report";

// Map a (stage, status) pair to the single page the user belongs on:
//   - init / resume.* / jd.* / difficulty_set / blueprint.*  → setup only
//   - interview.ready / interview.in_call                    → interview only
//   - interview.completed / interview.failed / report.* / completed → report only
// The candidate can't sidestep this by editing the URL.
function gateFor(stage: string, status: string | null): RouteKey {
  // Report zone: the report stage, the terminal "completed", or the interview having
  // finished/failed (report building, or no report possible).
  if (
    stage === "report" ||
    stage === "completed" ||
    (stage === "interview" && (status === "completed" || status === "failed"))
  ) {
    return "report";
  }

  // Interview zone: at the interview stage, ready to start or in a live call.
  if (stage === "interview" && (status === "ready" || status === "in_call")) {
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
  // hang the gate on a blank loading screen — and so a non-existent session 404s
  // here (the surest not-found signal) even if the WS close code doesn't surface.
  const live = useSessionStatus(sessionId ?? null);
  const [seed, setSeed] = useState<string | null>(null);
  const [seedNotFound, setSeedNotFound] = useState(false);
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getSession(sessionId)
      .then((s) => active && setSeed(s.status))
      .catch((e) => {
        if (active && String(e).includes("404")) setSeedNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  // Effective state: the live event when present, otherwise the REST seed parsed back
  // into { stage, status }.
  const eff = live.stage ? live : parseStatus(seed);

  // Unknown session (the REST seed 404'd) — same page as any other unmatched route.
  if (!sessionId || seedNotFound) return <NotFound />;
  if (!eff.stage) return <Loading />;

  const belongs = gateFor(eff.stage, eff.status);
  if (belongs !== route) {
    return <Navigate to={`/${sessionId}/${belongs}`} replace />;
  }

  return <>{children}</>;
}
