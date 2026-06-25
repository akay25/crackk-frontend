// Setup step 4 — resume × JD eligibility. Auto-triggers POST /sessions/:id/match once the
// config is saved, then drives its UI off the live match.* status:
//   match.pending / match.running → "Evaluating…"
//   match.ready                   → GET /match → score card; blueprint auto-builds, then the
//                                   candidate clicks "Continue to interview" on blueprint.ready
//   match.failed                  → GET /match:
//                                     200 (eligible:false) → terminal rejection (no retry)
//                                     500                  → task error → offer Retry
// GET is the snapshot; the live "UPDATE" event is the source of truth for transitions.
import { useCallback, useEffect, useRef, useState } from "react";
import { getMatch, triggerMatch } from "../../api/session";
import type { MatchResult } from "../../types/api";
import { reached } from "../../utils";
import { Alert, Button, Spinner } from "../../components/ui";
import { useSetup } from "../../context/SetupContext";
import MatchResultCard from "../../components/MatchResultCard";

export default function MatchStep() {
  const { sessionId, state, configDone, refresh, setErr } = useSetup();

  const [result, setResult] = useState<MatchResult | null>(null);
  const [taskError, setTaskError] = useState(false); // GET /match → 500 (retryable)
  const [working, setWorking] = useState(false); // POST /match in flight
  const triggeredRef = useRef(false);

  // Where the session sits relative to the match stage.
  const started = reached(state, "match.pending"); // match.* or beyond
  const passed = reached(state, "match.ready"); // eligible (blueprint now building)
  const failed = state.stage === "match" && state.status === "failed";
  const buildingBlueprint = passed && !reached(state, "blueprint.ready");

  const trigger = useCallback(async () => {
    if (!sessionId) return;
    setWorking(true);
    setErr(null);
    setTaskError(false);
    try {
      await triggerMatch(sessionId);
      await refresh();
    } catch (e: any) {
      // 409 = already run / already in progress — fine, the live status drives the UI.
      const code = e?.response?.status;
      if (code !== 409) setErr(String(e?.response?.data?.detail ?? e));
    } finally {
      setWorking(false);
    }
  }, [sessionId, refresh, setErr]);

  // Auto-start the match once config is done and it hasn't been kicked off yet.
  useEffect(() => {
    if (!configDone || started || triggeredRef.current) return;
    triggeredRef.current = true;
    trigger();
  }, [configDone, started, trigger]);

  // Pull the score + breakdown once the stage settles on ready or failed.
  const loadResult = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await getMatch(sessionId); // null while still running (404)
      if (r) {
        setResult(r);
        setTaskError(false);
      }
    } catch (e: any) {
      // 500 → the task itself errored (no score produced) → retryable.
      if (e?.response?.status === 500) setTaskError(true);
      else setErr(String(e));
    }
  }, [sessionId, setErr]);

  useEffect(() => {
    if (passed || failed) loadResult();
  }, [passed, failed, loadResult]);

  // Terminal rejection — a score came back with eligible:false. No retry, no interview.
  if (failed && result && !result.eligible) {
    return (
      <MatchResultCard result={result} eligible={false} reason={state.reason} />
    );
  }

  // Task error — GET /match returned 500. Let the candidate re-run the evaluation.
  if (failed && taskError) {
    return (
      <div>
        <h2 className="text-base font-semibold text-slate-900">Eligibility</h2>
        <div className="mt-4">
          <Alert tone="amber">
            We couldn't evaluate your resume against the job. Please try again.
          </Alert>
        </div>
        <Button className="mt-4" onClick={() => trigger()} disabled={working}>
          {working ? <Spinner /> : "Retry"}
        </Button>
      </div>
    );
  }

  // Passed — show the score; the blueprint builds, then the candidate clicks
  // "Continue to interview" once it's ready (no auto-redirect, so they can review the score).
  if (passed && result) {
    return (
      <MatchResultCard
        result={result}
        eligible
        building={buildingBlueprint}
        onContinue={() => {
          window.location.href = `/${sessionId}/interview`;
        }}
      />
    );
  }

  // Pending / running / just-triggered / settling — evaluating spinner.
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">
        Checking your eligibility
      </h2>
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
        <Spinner className="size-4 text-indigo-500" />
        Evaluating your resume against the job description… this updates
        automatically.
      </div>
    </div>
  );
}
