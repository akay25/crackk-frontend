// Report screen: renders the evidence-based report from GET /sessions/:id/report
// (shape: contracts/schemas/report.schema.json). Overall + per-competency scores,
// strengths, areas to improve (area/why/how), and verbatim evidence quotes. The
// report may not be ready (404) right after a call, so we poll and degrade
// gracefully if the endpoint is still stubbed. Route is token-guarded.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getReport, type CompetencyScore, type Report as ReportData } from "../lib/api";
import { useSessionStatus } from "../lib/ws";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";

function tone(score: number) {
  if (score >= 75) return { text: "text-emerald-600", bar: "bg-emerald-500", ring: "text-emerald-500" };
  if (score >= 50) return { text: "text-amber-600", bar: "bg-amber-500", ring: "text-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500", ring: "text-rose-500" };
}

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const t = tone(score);
  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          className={t.ring}
        />
      </svg>
      <div className={"absolute inset-0 grid place-items-center text-2xl font-bold " + t.text}>
        {score}
      </div>
    </div>
  );
}

function Competency({ c }: { c: CompetencyScore }) {
  const t = tone(c.score);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold capitalize text-slate-900">{c.key.replace(/[_-]/g, " ")}</h3>
        <span className={"text-sm font-bold " + t.text}>{c.score}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={"h-full rounded-full " + t.bar} style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
      </div>
      {c.rationale && <p className="mt-3 text-sm text-slate-600">{c.rationale}</p>}
      {c.evidence_quotes.length > 0 && (
        <div className="mt-3 space-y-2">
          {c.evidence_quotes.map((q, i) => (
            <blockquote
              key={i}
              className="border-l-2 border-indigo-300 bg-slate-50 px-3 py-2 text-sm italic text-slate-600"
            >
              “{q}”
            </blockquote>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Report() {
  const { sessionId } = useParams();

  const [report, setReport] = useState<ReportData | null>(null);
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

  // Live status over WebSocket — no polling.
  const statuses = useSessionStatus(sessionId ?? null);

  // Try once on arrival (the report may already be done), then fetch exactly when
  // the report stage flips ready.
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (statuses?.report === "ready") load();
  }, [statuses?.report, load]);

  if (report) {
    const t = tone(report.overall_score);
    return (
      <Shell max="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Interview Report</h1>
        <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>

        {/* Overall */}
        <Card className="mt-5 flex items-center gap-6 bg-gradient-to-br from-white to-indigo-50/40">
          <ScoreRing score={report.overall_score} />
          <div>
            <div className="text-sm font-medium text-slate-500">Overall score</div>
            <div className={"text-lg font-semibold " + t.text}>
              {report.overall_score >= 75 ? "Strong" : report.overall_score >= 50 ? "Solid" : "Needs work"}
            </div>
            <p className="mt-1 max-w-md text-sm text-slate-600">{report.recommendations}</p>
          </div>
        </Card>

        <h2 className="mt-8 text-lg font-semibold text-slate-900">Competencies</h2>
        <div className="mt-3 space-y-4">
          {report.per_competency.map((c) => (
            <Competency key={c.key} c={c} />
          ))}
        </div>

        {report.strengths.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-semibold text-slate-900">Strengths</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {report.strengths.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-sm text-slate-700"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 size-4 shrink-0 text-emerald-600" stroke="currentColor" strokeWidth={2.5}>
                    <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s}
                </div>
              ))}
            </div>
          </>
        )}

        {report.improvements.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-semibold text-slate-900">Areas to improve</h2>
            <div className="mt-3 space-y-3">
              {report.improvements.map((imp, i) => (
                <Card key={i}>
                  <h3 className="font-semibold text-slate-900">{imp.area}</h3>
                  <p className="mt-1 text-sm text-slate-600">{imp.why}</p>
                  {imp.how && (
                    <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                      <span className="font-semibold">Next step:</span> {imp.how}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        <h2 className="mt-8 text-lg font-semibold text-slate-900">Recommendations</h2>
        <Card className="mt-3">
          <p className="text-slate-700">{report.recommendations}</p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Interview Report</h1>
      <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>
      <Card className="mt-5 text-center">
        {err ? (
          <>
            <div className="mb-4 text-left">
              <Alert tone="amber">
                The report isn't available yet. This page keeps checking automatically.
                <br />
                <span className="text-xs opacity-70">{err}</span>
              </Alert>
            </div>
          </>
        ) : (
          pending && (
            <div className="flex flex-col items-center py-6">
              <Spinner className="size-7 text-indigo-500" />
              <p className="mt-3 font-medium text-slate-700">Generating your report…</p>
              <p className="text-sm text-slate-500">This page updates automatically.</p>
            </div>
          )
        )}
        <Button variant="secondary" onClick={load} className="mt-2">
          Check now
        </Button>
      </Card>
    </Shell>
  );
}
