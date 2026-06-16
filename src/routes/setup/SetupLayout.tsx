import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { getSession as getSessionFromAPI, joinCall } from "../../api/session";
import type { Session } from "../../types/api";
// import { parseStatus, reached, useSessionStatus, type SessionState } from "../../lib/socket";
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  Shell,
  Spinner,
} from "../../components/ui";
import StepperHeader from "../../components/StepperHeader";
import {
  SETUP_STEPS,
  SetupContext,
  type SetupContextValue,
} from "./SetupContext";
import { statusLabel, statusTone } from "../../utils";

export default function SetupLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();

  // Local states
  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reparsing, setReparsing] = useState(false);
  const [joining, setJoining] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setSession(await getSessionFromAPI(sessionId));
    } catch (e) {
      setErr(String(e));
    }
  }, [sessionId]);

  // Live state over Socket.IO — no polling. Fall back to the session's status (from REST,
  // a combined string parsed into { stage, status }) until the first event arrives.
  const live = useSessionStatus(sessionId ?? null);
  const state: SessionState = live.stage
    ? { stage: live.stage, status: live.status, reason: live.reason }
    : { ...parseStatus(session?.status), reason: null };

  // Initial load + re-sync of the richer session fields each time a live event arrives.
  useEffect(() => {
    refresh();
  }, [refresh]);

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

  // Start the interview from the "ready" modal. joinCall flips the session to
  // interview.in_call (so SessionGate admits us to /interview) and mints the LiveKit
  // token, handed to the Interview page via router state so it connects straight away.
  async function onJoin() {
    if (!sessionId) return;
    setErr(null);
    setJoining(true);
    try {
      const conn = await joinCall(sessionId);
      navigate(`/${sessionId}/interview`, { state: { conn } });
    } catch (e) {
      setErr(String(e));
      setJoining(false);
    }
  }

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
      <Shell>
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
              {statusLabel(session.status)}
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

      {/* Once the blueprint is ready, the only thing to do is join — a focused,
          non-dismissible modal takes over regardless of which step is showing. */}
      <Modal open={hasBlueprint} onClose={() => {}}>
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-6"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                d="m5 13 4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            Your interview is ready 🎉
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            We've built your tailored interview. Find a quiet space with a
            working mic, then join when you're ready.
          </p>
          <div className="mt-6">
            <Button
              onClick={onJoin}
              disabled={joining}
              className="w-full py-3 text-base"
            >
              {joining ? (
                <>
                  <Spinner /> Joining…
                </>
              ) : (
                "Join the interview →"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </SetupContext.Provider>
  );
}
