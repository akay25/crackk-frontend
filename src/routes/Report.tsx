// Report screen: renders the evidence-based report from GET /sessions/:id/report
// (shape: common/schemas/report.schema.json). Overall + per-competency scores,
// strengths, areas to improve (area/why/how), and the recommendations summary.
// Live status over the WebSocket tells us when the report flips ready/failed.
//
// DESIGN NOTE: the visual redesign shows a few things the report data does NOT yet
// produce — the candidate name, a percentile, a confidence %, an onsite verdict and
// a running-score "journey" chart. Those are rendered as STATIC PLACEHOLDERS (see
// PLACEHOLDER below) and tagged "sample" in the UI until the backend supplies them.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getReport, getSession, type CompetencyScore, type Report as ReportData } from "../lib/api";
import { failedStage, reached, useSessionStatus } from "../lib/socket";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";

// ---- Static placeholders: no backing report data yet. Tagged "sample" in the UI. ----
const PLACEHOLDER = {
  candidateName: "Candidate",
  roleTitle: "Senior Backend Engineer",
  percentileLabel: "Top 15% of Backend Candidates",
  onsiteVerdict: "Proceed to Onsite",
  confidencePct: 82,
  // Recommendation list — the report only has a single `recommendations` string
  // (shown in the hero summary), so the structured next-steps list is placeholder.
  recommendations: [
    { title: "Advance to onsite loop", body: "Focus on system design questions." },
    { title: "Add a dedicated algorithms round", body: "Probe optimization depth with medium-hard problems." },
  ],
  // Running score over the call — not tracked yet.
  journey: {
    labels: ["00:03", "00:11", "00:18", "00:24", "00:31", "00:37", "00:43"],
    scores: [70, 75, 79, 76, 68, 56, 59],
  },
};

function tone(score: number) {
  if (score >= 75) return { bar: "bg-emerald-500", ring: "#059669", badge: "bg-emerald-100 text-emerald-700" };
  if (score >= 50) return { bar: "bg-amber-500", ring: "#d97706", badge: "bg-amber-100 text-amber-700" };
  return { bar: "bg-red-500", ring: "#ef4444", badge: "bg-red-100 text-red-700" };
}

const band = (score: number) => (score >= 75 ? "Strong" : score >= 50 ? "Solid" : "Needs work");
const titleCase = (key: string) => key.replace(/[_-]/g, " ");

/** Tiny label marking a value that isn't real report data yet. */
function SampleTag({ onDark = false }: { onDark?: boolean }) {
  return (
    <span
      className={
        "ml-2 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide align-middle " +
        (onDark ? "bg-white/20 text-white/90" : "bg-slate-100 text-slate-400")
      }
    >
      sample
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const t = tone(score);
  return (
    <div className="relative h-44 w-44">
      <svg className="h-44 w-44 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={t.ring}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold tracking-tight tabular-nums text-slate-900">{score}</span>
        <span className="text-xs font-medium text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

/** Dependency-free SVG line chart for the (placeholder) running-score journey. */
function JourneyChart() {
  const { labels, scores } = PLACEHOLDER.journey;
  const W = 640;
  const H = 220;
  const padX = 36;
  const padY = 28;
  const min = 40;
  const max = 90;
  const x = (i: number) => padX + (i * (W - padX * 2)) / (scores.length - 1);
  const y = (v: number) => H - padY - ((v - min) / (max - min)) * (H - padY * 2);
  const line = scores.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `${x(0)},${H - padY} ${line} ${x(scores.length - 1)},${H - padY}`;
  const gridYs = [40, 50, 60, 70, 80, 90];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="journeyFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(79,70,229,0.18)" />
          <stop offset="100%" stopColor="rgba(79,70,229,0)" />
        </linearGradient>
      </defs>
      {gridYs.map((v) => (
        <g key={v}>
          <line x1={padX} y1={y(v)} x2={W - padX} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={padX - 10} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
            {v}
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#journeyFill)" />
      <polyline points={line} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {scores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="4.5" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
      ))}
      {labels.map((lbl, i) => (
        <text key={lbl} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">
          {lbl}
        </text>
      ))}
    </svg>
  );
}

function ReportView({ report, role }: { report: ReportData; role: string | null }) {
  // Animate the competency bars in on mount (0% → score).
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const t = tone(report.overall_score);
  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <header className="px-1 sm:px-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          Interview Report for {PLACEHOLDER.candidateName}
          <SampleTag />
        </h1>
        <p className="mt-2 text-base sm:text-lg text-slate-400 font-medium">
          {role || PLACEHOLDER.roleTitle} · {dateStr}
        </p>
      </header>

      {/* 2. Hero — score + verdict */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-8">
        <div className="grid lg:grid-cols-[auto_1fr] gap-8 lg:gap-12 items-center">
          <div className="flex justify-center">
            <ScoreRing score={report.overall_score} />
          </div>
          <div>
            <div className={"inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold " + t.badge}>
              {band(report.overall_score)} Candidate
            </div>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              {PLACEHOLDER.percentileLabel}
              <SampleTag />
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              {report.recommendations}
            </p>
            {report.per_competency.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {report.per_competency.map((c) => (
                  <span
                    key={c.key}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium capitalize text-slate-600"
                  >
                    {titleCase(c.key)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3. Recommendation banner (verdict + confidence are placeholders) */}
      <section className="rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-6 sm:px-8 py-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">
              Recommendation
              <SampleTag onDark />
            </p>
            <h3 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">{PLACEHOLDER.onsiteVerdict}</h3>
          </div>
          <div className="sm:text-right">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">Confidence</p>
            <p className="mt-1 text-3xl font-bold text-white tabular-nums">{PLACEHOLDER.confidencePct}%</p>
            <div className="mt-2 h-1.5 w-40 rounded-full bg-indigo-400/40 overflow-hidden sm:ml-auto">
              <div className="h-full rounded-full bg-white" style={{ width: `${PLACEHOLDER.confidencePct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Competency breakdown */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-6">
        <h3 className="text-base font-semibold tracking-tight">Competency Breakdown</h3>
        <p className="text-sm text-slate-500 mt-1">Weighted scores by skill area</p>
        <div className="mt-6 space-y-6">
          {report.per_competency.map((c: CompetencyScore) => {
            const ct = tone(c.score);
            const w = Math.max(0, Math.min(100, c.score));
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize text-slate-700">{titleCase(c.key)}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{c.score}</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={"h-full rounded-full transition-[width] duration-1000 ease-out " + ct.bar}
                    style={{ width: barsIn ? `${w}%` : "0%" }}
                  />
                </div>
                {c.rationale && <p className="mt-2 text-sm text-slate-600">{c.rationale}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Interview journey (placeholder data) */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-6">
        <h3 className="text-base font-semibold tracking-tight">
          Interview Journey
          <SampleTag />
        </h3>
        <p className="text-sm text-slate-500 mt-1">Running score over the course of the call</p>
        <div className="mt-4">
          <JourneyChart />
        </div>
      </section>

      {/* 6. Strengths */}
      {report.strengths.length > 0 && (
        <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-8">
          <h3 className="text-base font-semibold tracking-tight">Strengths</h3>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {report.strengths.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 text-sm font-medium text-emerald-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 7. Areas to improve */}
      {report.improvements.length > 0 && (
        <section>
          <h3 className="text-base font-semibold tracking-tight px-1 mb-4">Areas to Improve</h3>
          <div className="grid sm:grid-cols-2 gap-6">
            {report.improvements.map((imp, i) => (
              <article
                key={i}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 py-6 hover:border-amber-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
                    <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </span>
                  <h4 className="text-sm font-semibold text-slate-900">{imp.area}</h4>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Problem</p>
                    <p className="text-sm text-slate-600 mt-0.5">{imp.why}</p>
                  </div>
                  {imp.how && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">Recommendation</p>
                      <p className="text-sm text-slate-600 mt-0.5">{imp.how}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 8. Recommendations (structured next-steps list is placeholder) */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-8">
        <h3 className="text-base font-semibold tracking-tight">
          Recommendations
          <SampleTag />
        </h3>
        <p className="text-sm text-slate-500 mt-1">Suggested next steps for the hiring loop</p>
        <ul className="mt-6 space-y-4">
          {PLACEHOLDER.recommendations.map((r) => (
            <li key={r.title} className="flex gap-4">
              <span className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-indigo-100 flex items-center justify-center">
                <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="text-sm text-slate-600 mt-0.5">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function Report() {
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

  // Live state over Socket.IO — no polling.
  const live = useSessionStatus(sessionId ?? null);
  // Report failed, OR the interview itself failed (no conversation → no report).
  const interviewFailed = live.stage === "interview" && live.status === "failed";
  const failed = failedStage(live) === "report" || interviewFailed;

  // Pull the role title for the header (the only real header field we have).
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((s) => setRole(s.role_title))
      .catch(() => { });
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
