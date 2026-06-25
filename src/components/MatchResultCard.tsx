// Renders the resume × JD match outcome: overall score ring, per-dimension breakdown
// (score bar + weight + rationale), summary and verdict. The same card backs both the
// eligible ("you passed, building your interview") and the terminal-rejection states —
// the caller picks the framing via `eligible`, an optional rejection `reason`, the
// `building` flag (shown while the blueprint builds) and `onContinue` (the
// "Continue to interview" action, available once the blueprint is ready).
import { tone } from "../utils";
import ScoreRing from "./ScoreRing";
import { Alert, Badge, Button, Spinner, cn } from "./ui";
import type { MatchResult } from "../types/api";

const VERDICT_TONE = {
  strong: "green",
  moderate: "amber",
  weak: "rose",
} as const;

// "core_skills" → "Core skills"
function humanize(name: string): string {
  const s = name.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MatchResultCard({
  result,
  eligible,
  reason,
  building = false,
  onContinue,
}: {
  result: MatchResult;
  eligible: boolean;
  reason?: string | null;
  building?: boolean;
  onContinue?: () => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Resume match</h2>
        <Badge tone={eligible ? "green" : "rose"}>
          {eligible ? "Eligible ✓" : "Not eligible"}
        </Badge>
      </div>

      {/* Terminal rejection — show the reason (from the live event) above the breakdown. */}
      {!eligible && (
        <div className="mt-4">
          <Alert tone="rose">
            <p className="font-medium">Not eligible for an interview</p>
            {(reason ?? result.summary) && (
              <p className="mt-1 text-xs opacity-80">
                {reason ?? result.summary}
              </p>
            )}
          </Alert>
        </div>
      )}

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
        <ScoreRing score={result.overall_score} />
        <div className="flex-1">
          <p className="text-sm text-slate-600">{result.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={result.eligible ? "green" : "rose"}>
              {result.overall_score} / 100 · threshold {result.threshold}
            </Badge>
            {result.verdict && (
              <Badge tone={VERDICT_TONE[result.verdict]}>
                {humanize(result.verdict)} match
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">How you scored</h3>
        {result.dimensions.map((d) => (
          <div key={d.name}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-slate-700">
                {humanize(d.name)}
              </span>
              <span className="tabular-nums text-slate-500">
                {d.score}
                <span className="text-slate-400"> · weight {d.weight}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", tone(d.score).bar)}
                style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }}
              />
            </div>
            {d.rationale && (
              <p className="mt-1.5 text-xs text-slate-500">{d.rationale}</p>
            )}
          </div>
        ))}
      </div>

      {eligible && building && (
        <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
          <Spinner className="size-4 text-indigo-500" />
          Building your tailored interview… this only takes a moment.
        </div>
      )}

      {eligible && !building && onContinue && (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            Your interview is ready. Review your score above, then continue when
            you're ready.
          </p>
          <Button onClick={onContinue} className="shrink-0">
            Continue to interview
          </Button>
        </div>
      )}
    </div>
  );
}
