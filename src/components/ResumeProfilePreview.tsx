// Shows what the resume_parser extracted from the uploaded resume, so the
// candidate can confirm it looks right before building the interview. Renders a
// ParsedProfile (contracts/schemas/parsed_profile.schema.json). On low parse
// confidence we nudge the candidate to double-check (e.g. scanned PDF).
import type { ParsedProfile } from "../lib/api";
import { Alert, Badge } from "./ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function ResumeProfilePreview({ profile }: { profile: ParsedProfile }) {
  const low = profile.parse_confidence === "low";
  const medium = profile.parse_confidence === "medium";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <svg viewBox="0 0 24 24" fill="none" className="size-4 text-indigo-500" stroke="currentColor" strokeWidth={1.8}>
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M5 8a2 2 0 0 1 2-2h7l5 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z" />
            <path d="M9 13h6M9 17h4" strokeLinecap="round" />
          </svg>
          What we parsed
        </span>
        {profile.parse_confidence && (
          <Badge tone={low ? "rose" : medium ? "amber" : "green"}>
            {profile.parse_confidence} confidence
          </Badge>
        )}
      </div>

      {low && (
        <div className="mt-3">
          <Alert tone="amber">
            We had trouble reading this resume (it may be a scanned image). Please double-check the
            details below — if they look wrong, re-upload a text-based PDF or DOCX.
          </Alert>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {profile.summary && (
          <Section title="Summary">
            <p className="text-sm text-slate-700">{profile.summary}</p>
          </Section>
        )}

        {typeof profile.total_years_experience === "number" && (
          <Section title="Experience">
            <p className="text-sm text-slate-700">
              ~{profile.total_years_experience} year
              {profile.total_years_experience === 1 ? "" : "s"} total
            </p>
          </Section>
        )}

        {profile.skills.length > 0 && (
          <Section title="Skills">
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((s, i) => (
                <Badge key={i} tone="indigo">
                  {s}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {profile.experience.length > 0 && (
          <Section title="Roles">
            <ul className="space-y-2.5">
              {profile.experience.map((e, i) => (
                <li key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="text-sm font-medium text-slate-900">
                      {e.title}
                      <span className="font-normal text-slate-500"> · {e.company}</span>
                    </span>
                    {(e.start || e.end) && (
                      <span className="text-xs text-slate-400">
                        {[e.start, e.end].filter(Boolean).join(" – ")}
                      </span>
                    )}
                  </div>
                  {e.highlights && e.highlights.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-slate-600">
                      {e.highlights.map((h, j) => (
                        <li key={j}>{h}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {profile.education && profile.education.length > 0 && (
          <Section title="Education">
            <ul className="space-y-1 text-sm text-slate-700">
              {profile.education.map((ed, i) => (
                <li key={i}>
                  {[ed.degree, ed.institution].filter(Boolean).join(", ")}
                  {ed.year ? ` (${ed.year})` : ""}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {profile.projects && profile.projects.length > 0 && (
          <Section title="Projects">
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-slate-700">
              {profile.projects.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Section>
        )}

        {profile.gaps && profile.gaps.length > 0 && (
          <Section title="The interviewer may probe">
            <ul className="space-y-1">
              {profile.gaps.map((g, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
                >
                  <span aria-hidden>•</span>
                  {g}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
