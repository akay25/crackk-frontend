// Route-level lifecycle guard. The session_id in the URL is the capability, but a
// session also has a single valid stage in its lifecycle, and the UI must follow
// it: draft -> setup, in_call -> interview, completed -> report. This component
// fetches the session, keeps it in sync over the WebSocket, and redirects (replace)
// to the canonical page if the user lands on (or hand-edits the URL to) a page that
// doesn't match the current status. A finished interview therefore can't be
// reopened or rewound, and a `failed` session shows an error instead of any page.
import { useCallback, useEffect, type ReactNode } from "react";
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getSession, type Session } from "../lib/api";
import { useSessionStatus } from "../lib/ws";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";

export type RouteKey = "setup" | "interview" | "report";

// For each lifecycle status: where the user belongs (canonical) and the set of
// pages they're allowed to be on. `ready` allows both setup and interview so the
// "Join the interview" hand-off keeps working before status flips to in_call.
const POLICY: Record<Session["status"], { canonical: RouteKey; allowed: RouteKey[] }> = {
  draft: { canonical: "setup", allowed: ["setup"] },
  ready: { canonical: "setup", allowed: ["setup", "interview"] },
  in_call: { canonical: "interview", allowed: ["interview"] },
  call_ended: { canonical: "report", allowed: ["report"] },
  completed: { canonical: "report", allowed: ["report"] },
  failed: { canonical: "report", allowed: [] }, // never matches — error screen below
};

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

function ErrorScreen({ title, message, detail }: { title: string; message: string; detail?: string }) {
  const navigate = useNavigate();
  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <Card className="mt-5">
        <Alert tone="rose">
          {message}
          {detail && (
            <>
              <br />
              <span className="text-xs opacity-70">{detail}</span>
            </>
          )}
        </Alert>
        <Button className="mt-4" onClick={() => navigate("/")}>
          Start a new interview
        </Button>
      </Card>
    </Shell>
  );
}

export default function SessionGate({ route, children }: { route: RouteKey; children: ReactNode }) {
  const { sessionId } = useParams();
  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setSession(await getSession(sessionId));
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [sessionId]);

  // Live status over the WebSocket — re-sync the session whenever a stage flips so
  // the gate reacts to the lifecycle advancing (e.g. report ready -> completed)
  // without polling.
  const statuses = useSessionStatus(sessionId ?? null);

  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (statuses) refresh();
  }, [statuses, refresh]);

  if (!sessionId) {
    return (
      <ErrorScreen
        title="Interview"
        message="No session found — start a new interview from the home page."
      />
    );
  }
  if (err) {
    return (
      <ErrorScreen
        title="Interview"
        message="We couldn't load this interview. The link may be invalid or expired."
        detail={err}
      />
    );
  }
  if (!session) return <Loading />;

  if (session.status === "failed") {
    return (
      <ErrorScreen
        title="Something went wrong"
        message="This interview couldn't be completed. Please start a new one from the home page."
      />
    );
  }

  const policy = POLICY[session.status];
  if (!policy.allowed.includes(route)) {
    return <Navigate to={`/${sessionId}/${policy.canonical}`} replace />;
  }

  return <>{children}</>;
}
