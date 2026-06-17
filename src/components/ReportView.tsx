import { useEffect, useState } from "react";
import type { CompetencyScore, Report as ReportData } from "../types/api";
import { tone } from "../utils";
import { REPORT_PLACEHOLDER } from "../constants";
import { Button } from "./ui";
import ScoreRing from "./ScoreRing";
import JourneyChart from "./JourneyChart";

const band = (score: number) =>
  score >= 75 ? "Strong" : score >= 50 ? "Solid" : "Needs work";
const verdict = (score: number) =>
  score >= 75
    ? "Proceed to Onsite"
    : score >= 50
      ? "Borderline — Further Review"
      : "Do Not Proceed";
const titleCase = (key: string) => key.replace(/[_-]/g, " ");

export default function ReportView({
  report,
  role,
}: {
  report: ReportData;
  role: string | null;
}) {
  // Animate the competency bars in on mount (0% → score).
  const [barsIn, setBarsIn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setBarsIn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const t = tone(report.overall_score);
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* 1. Header */}
      <header className="flex items-start justify-between gap-4 px-1 sm:px-2">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Interview Report for {REPORT_PLACEHOLDER.candidateName}
          </h1>
          <p className="mt-2 text-base sm:text-lg text-slate-400 font-medium">
            {role || REPORT_PLACEHOLDER.roleTitle} · {dateStr}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => window.print()}
          className="no-print shrink-0"
        >
          Download PDF
        </Button>
      </header>

      {/* 2. Hero — score + verdict */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-8">
        <div className="grid lg:grid-cols-[auto_1fr] gap-8 lg:gap-12 items-center">
          <div className="flex justify-center">
            <ScoreRing score={report.overall_score} />
          </div>
          <div>
            <div
              className={
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold " +
                t.badge
              }
            >
              {band(report.overall_score)} Candidate
            </div>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              {REPORT_PLACEHOLDER.percentileLabel}
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

      {/* 3. Recommendation banner (verdict from score; confidence has no backend field) */}
      <section className="rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-6 sm:px-8 py-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">
              Recommendation
            </p>
            <h3 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {verdict(report.overall_score)}
            </h3>
          </div>
          {/* Confidence — no backend field yet; re-enable once the report supplies it.
          <div className="sm:text-right">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">
              Confidence
            </p>
            <p className="mt-1 text-3xl font-bold text-white tabular-nums">
              {REPORT_PLACEHOLDER.confidencePct}%
            </p>
            <div className="mt-2 h-1.5 w-40 rounded-full bg-indigo-400/40 overflow-hidden sm:ml-auto">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${REPORT_PLACEHOLDER.confidencePct}%` }}
              />
            </div>
          </div>
          */}
        </div>
      </section>

      {/* 4. Competency breakdown */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-6">
        <h3 className="text-base font-semibold tracking-tight">
          Competency Breakdown
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Weighted scores by skill area
        </p>
        <div className="mt-6 space-y-6">
          {report.per_competency.map((c: CompetencyScore) => {
            const ct = tone(c.score);
            const w = Math.max(0, Math.min(100, c.score));
            return (
              <div key={c.key}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize text-slate-700">
                    {titleCase(c.key)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {c.score}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={
                      "h-full rounded-full transition-[width] duration-1000 ease-out " +
                      ct.bar
                    }
                    style={{ width: barsIn ? `${w}%` : "0%" }}
                  />
                </div>
                {c.rationale && (
                  <p className="mt-2 text-sm text-slate-600">{c.rationale}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Interview journey (placeholder data) */}
      <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 sm:px-8 py-6">
        <h3 className="text-base font-semibold tracking-tight">
          Interview Journey
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Running score over the course of the call
        </p>
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
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
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
          <h3 className="text-base font-semibold tracking-tight px-1 mb-4">
            Areas to Improve
          </h3>
          <div className="grid sm:grid-cols-2 gap-6">
            {report.improvements.map((imp, i) => (
              <article
                key={i}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm px-6 py-6 hover:border-amber-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
                    <svg
                      className="h-4 w-4 text-amber-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </span>
                  <h4 className="text-sm font-semibold text-slate-900">
                    {imp.area}
                  </h4>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                      Problem
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">{imp.why}</p>
                  </div>
                  {imp.how && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">
                        Recommendation
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5">{imp.how}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
