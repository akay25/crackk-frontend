// Report screen: renders the evidence-based report from GET /sessions/:id/report
// (shape: common/schemas/report.schema.json) via <ReportView>. Live status over the
// socket tells us when the report flips ready/failed.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { getReport, getSession } from "../api/session";
import type { Report as ReportData } from "../types/api";
import { failedStage, reached } from "../utils";
import { useLiveStatus } from "../socket_io";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";
import ReportView from "../components/ReportView";

export default function Report({ socket }: { socket: Socket | null }) {
  const { sessionId } = useParams();

  const [report, setReport] = useState<ReportData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [pending, setPending] = useState(true); // report not produced yet (404)
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    try {
      const r = await getReport(sessionId);
      if (r) {
        setReport(r);
        setPending(false);
      } else {
        setPending(true);
      }
      setErr(null);
    } catch (e) {
      // e.g. the endpoint is still stubbed (501) before report_gen merges.
      setErr(String(e));
    }
  }, [sessionId]);

  // Live state over the socket SessionGate handed us — no polling.
  const live = useLiveStatus(socket);
  // Report failed, OR the interview itself failed (no conversation → no report).
  const interviewFailed = live.stage === "interview" && live.status === "failed";
  const failed = failedStage(live) === "report" || interviewFailed;

  // Pull the role title for the header (the only real header field we have).
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => setRole(s.role_title))
      .catch(() => {});
  }, [sessionId]);

  // Try once on arrival (the report may already be done), then fetch when the report
  // becomes available — report_gen emits "report.ready" over the socket; the terminal
  // bare "completed" transition is API-driven and isn't pushed today, so we react to
  // either.
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (live.stage === "completed" || reached(live, "report.ready")) load();
  }, [live.stage, live.status, load]);

  if (report && !failed) {
    return (
      <Shell max="max-w-5xl">
        <ReportView report={report} role={role} />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Interview Report</h1>
      <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>
      <Card className="mt-5 text-center">
        {failed ? (
          <div className="text-left">
            <Alert tone="rose">
              {interviewFailed
                ? "We couldn't run this interview — no conversation was captured, so there's no report to show."
                : "Report generation failed. We couldn't produce a report for this interview."}
            </Alert>
          </div>
        ) : err ? (
          <div className="mb-4 text-left">
            <Alert tone="amber">
              The report isn't available yet. This page keeps checking automatically.
              <br />
              <span className="text-xs opacity-70">{err}</span>
            </Alert>
          </div>
        ) : (
          pending && (
            <div className="flex flex-col items-center py-6">
              <Spinner className="size-7 text-indigo-500" />
              <p className="mt-3 font-medium text-slate-700">Generating your report…</p>
              <p className="text-sm text-slate-500">This page updates automatically.</p>
            </div>
          )
        )}
        {!failed && (
          <Button variant="secondary" onClick={load} className="mt-2">
            Check now
          </Button>
        )}
      </Card>
    </Shell>
  );
}
