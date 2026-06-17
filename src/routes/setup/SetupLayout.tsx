import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import type { Socket } from "socket.io-client";

import { getSession as getSessionFromAPI } from "../../api/session";
import type { Session } from "../../types/api";
import type { SessionState } from "../../types";
import { useLiveStatus } from "../../socket_io";
import { Alert, Badge, Button, Card, Shell } from "../../components/ui";
import StepperHeader from "../../components/StepperHeader";
import { SetupContext } from "../../context/SetupContext";
import { SETUP_STEPS, SetupContextValue } from "../../types/SetupPage";
import { reached, statusLabel, statusTone } from "../../utils";

export default function SetupLayout({
  socket,
  connected,
}: {
  socket: Socket | null;
  connected: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();

  // Local states
  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setSession(await getSessionFromAPI(sessionId));
    } catch (e) {
      setErr(String(e));
    }
  }, [sessionId]);

  // Live state over the socket SessionGate handed us, merged with the REST session.
  // Use whichever is FURTHER ALONG the pipeline: otherwise a stale earlier event (e.g.
  // resume.ready) shadows a more-advanced REST status (e.g. jd.ready), which left "Next"
  // disabled after a JD success on the first try.
  const live = useLiveStatus(socket);
  const seedStage = session?.stage ?? null;
  const seedStatus = session?.status ?? null;
  const seedTarget = seedStage
    ? seedStatus
      ? `${seedStage}.${seedStatus}`
      : seedStage
    : "";
  const liveAhead = !!live.stage && reached(live, seedTarget);
  const state: SessionState = liveAhead
    ? live
    : { stage: seedStage, status: seedStatus, reason: live.reason };

  // Initial load + re-sync the richer session fields each time a live event arrives.
  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (live.stage) {
      if (live.stage === "blueprint" && live.status == "ready") {
        window.location.href = `/${sessionId}/interview`;
      } else refresh();
    }
  }, [live.stage, live.status]);

  // Derived happy-path flags.
  const resumeReady = !reparsing && reached(state, "resume.ready");
  const jdReady = reached(state, "jd.ready");
  const configDone = reached(state, "difficulty_set");
  const hasBlueprint =
    (session?.has_blueprint ?? false) || reached(state, "blueprint.ready");

  const doneFlags = [resumeReady, jdReady, configDone];

  // You can revisit any completed step and reach the first unfinished one, but not skip
  // ahead past a step you haven't done yet.
  const firstIncomplete =
    doneFlags.indexOf(false) === -1
      ? SETUP_STEPS.length - 1
      : doneFlags.indexOf(false);

  // Current step from the URL segment under /setup (bare /setup → resume via index route).
  const seg = location.pathname.split("/").filter(Boolean).pop();
  const segIndex = SETUP_STEPS.findIndex((s) => s.key === seg);
  const currentIndex = segIndex === -1 ? 0 : segIndex;

  const goToIndex = useCallback(
    (i: number) => {
      const clamped = Math.min(Math.max(i, 0), SETUP_STEPS.length - 1);
      navigate(`/${sessionId}/setup/${SETUP_STEPS[clamped].key}`);
    },
    [navigate, sessionId],
  );

  const ctx = useMemo<SetupContextValue>(
    () => ({
      sessionId: sessionId ?? "",
      session,
      state,
      err,
      setErr,
      refresh,
      reparsing,
      setReparsing,
      resumeReady,
      jdReady,
      configDone,
      hasBlueprint,
      doneFlags,
      firstIncomplete,
      currentIndex,
      goToIndex,
    }),
    // doneFlags is derived from the primitives below, so it needn't be listed.
    [
      sessionId,
      session,
      state.stage,
      state.status,
      state.reason,
      err,
      refresh,
      reparsing,
      resumeReady,
      jdReady,
      configDone,
      hasBlueprint,
      firstIncomplete,
      currentIndex,
      goToIndex,
    ],
  );

  if (!sessionId) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-slate-900">
          Set up your interview
        </h1>
        <div className="mt-4">
          <Alert>
            No session found — start a new interview from the home page.
          </Alert>
        </div>
        <Button className="mt-4" onClick={() => navigate("/")}>
          Go to home
        </Button>
      </Shell>
    );
  }

  // Block ahead-jumps (hand-edited URL / stale link) once the status is known — send the
  // user to the first step they still need to complete.
  if (state.stage && currentIndex > firstIncomplete) {
    return (
      <Navigate
        to={`/${sessionId}/setup/${SETUP_STEPS[firstIncomplete].key}`}
        replace
      />
    );
  }

  const completed = doneFlags.filter(Boolean).length;

  return (
    <SetupContext.Provider value={ctx}>
      <Shell connected={connected}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Set up your interview
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Complete these steps, then build your tailored interview.
            </p>
          </div>
          {session && (
            <Badge tone={statusTone(session.status)}>
              <span className="size-1.5 rounded-full bg-current" />
              {statusLabel(session.stage, session.status)}
            </Badge>
          )}
        </div>

        <div className="mt-6">
          <StepperHeader
            current={currentIndex}
            done={doneFlags}
            canGo={(i) => i <= firstIncomplete}
            onJump={goToIndex}
          />
          <p className="mt-2 text-right text-xs font-medium text-slate-400">
            Step {currentIndex + 1} of {SETUP_STEPS.length} · {completed} done
          </p>
        </div>

        {err && (
          <div className="mt-5">
            <Alert>{err}</Alert>
          </div>
        )}

        <Card className="mt-4">
          <Outlet />
        </Card>
      </Shell>
    </SetupContext.Provider>
  );
}
