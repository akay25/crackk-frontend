// Report screen: renders the evidence-based report from GET /sessions/:id/report
// (shape: common/schemas/report.schema.json) via <ReportView>. Live status over the
// socket tells us when the report flips ready/failed.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { getReport, getSession } from "../api/session";
import type { Report as ReportData } from "../types/api";
import { reached } from "../utils";
import { useLiveStatus } from "../socket_io";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";
import ReportView from "../components/ReportView";

export default function Report({
  socket,
  connected,
}: {
  socket: Socket | null;
  connected: boolean;
}) {
  const { sessionId } = useParams();

  const [report, setReport] = useState<ReportData | null>(null);
  const [reportFailedFlag, setReportFailedFlag] = useState(false);
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
      let errorMessage = String(e);
      try {
        // @ts-ignore
        errorMessage = e.response.data.detail;
        setReportFailedFlag(true);
      } catch (e) {}
      setErr(errorMessage);
    }
  }, [sessionId]);

  // Live state over the socket SessionGate handed us — no polling.
  const live = useLiveStatus(socket);

  // Pull the role title for the header (the only real header field we have).
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => setRole(s.role_title))
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (live.stage === "completed" || reached(live, "report.ready")) load();
  }, [live.stage, live.status, load]);

  if (report && !reportFailedFlag) {
    return (
      <Shell max="max-w-5xl" connected={connected}>
        <ReportView report={report} role={role} />
      </Shell>
    );
  }

  return (
    <Shell connected={connected}>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Interview Report
      </h1>
      <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>
      <Card className="mt-5 text-center">
        {reportFailedFlag ? (
          <div className="mb-4 text-left">
            <Alert tone="amber">
              Generation failed
              <br />
              <span className="text-xs opacity-70">{err}</span>
            </Alert>
          </div>
        ) : (
          pending && (
            <div className="flex flex-col items-center py-6">
              <Spinner className="size-7 text-indigo-500" />
              <p className="mt-3 font-medium text-slate-700">
                Generating your report…
              </p>
              <p className="text-sm text-slate-500">
                This page updates automatically.
              </p>
            </div>
          )
        )}
        {!reportFailedFlag && (
          <Button variant="secondary" onClick={load} className="mt-2">
            Check now
          </Button>
        )}
      </Card>
    </Shell>
  );
}
