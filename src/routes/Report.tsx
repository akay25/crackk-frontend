// Report screen: renders the evidence-based report from GET /sessions/:id/report
// (shape: contracts/schemas/report.schema.json). Overall + per-competency scores,
// strengths, areas to improve (area/why/how), and verbatim evidence quotes. The
// report may not be ready (404) right after a call, so we poll and degrade
// gracefully if the endpoint is still stubbed. Route is token-guarded.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getReport, type CompetencyScore, type Report as ReportData } from "../lib/api";

const wrap = { maxWidth: 760, margin: "3rem auto", fontFamily: "system-ui" } as const;
const POLL_MS = 4000;

function scoreColor(score: number): string {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#ca8a04";
  return "#dc2626";
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ background: "#eee", borderRadius: 4, height: 10, width: "100%" }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, score))}%`,
          background: scoreColor(score),
          height: "100%",
          borderRadius: 4,
        }}
      />
    </div>
  );
}

function Competency({ c }: { c: CompetencyScore }) {
  return (
    <section style={{ margin: "1rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: 0, textTransform: "capitalize" }}>{c.key.replace(/[_-]/g, " ")}</h3>
        <strong style={{ color: scoreColor(c.score) }}>{c.score}</strong>
      </div>
      <ScoreBar score={c.score} />
      {c.rationale && <p style={{ margin: ".5rem 0 0" }}>{c.rationale}</p>}
      {c.evidence_quotes.length > 0 && (
        <ul style={{ margin: ".5rem 0 0", paddingLeft: "1.1rem" }}>
          {c.evidence_quotes.map((q, i) => (
            <li key={i} style={{ color: "#555" }}>
              <em>“{q}”</em>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Report() {
  const { id } = useParams();

  const [report, setReport] = useState<ReportData | null>(null);
  const [pending, setPending] = useState(true); // report not produced yet (404)
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await getReport(id);
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
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      // Stop polling once we have the report.
      setReport((cur) => {
        if (!cur) load();
        return cur;
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (report) {
    return (
      <main style={wrap}>
        <h1>Interview Report</h1>
        <p style={{ opacity: 0.6 }}>Session: {id}</p>

        <section
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            margin: "1rem 0",
          }}
        >
          <div
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: scoreColor(report.overall_score),
            }}
          >
            {report.overall_score}
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>Overall score</div>
            <div style={{ opacity: 0.6 }}>out of 100</div>
          </div>
        </section>

        <h2>Competencies</h2>
        {report.per_competency.map((c) => (
          <Competency key={c.key} c={c} />
        ))}

        {report.strengths.length > 0 && (
          <>
            <h2>Strengths</h2>
            <ul>
              {report.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        )}

        {report.improvements.length > 0 && (
          <>
            <h2>Areas to improve</h2>
            {report.improvements.map((imp, i) => (
              <div key={i} style={{ margin: "0 0 1rem" }}>
                <strong>{imp.area}</strong>
                <p style={{ margin: ".25rem 0" }}>{imp.why}</p>
                {imp.how && (
                  <p style={{ margin: 0, color: "#555" }}>
                    <em>Next step:</em> {imp.how}
                  </p>
                )}
              </div>
            ))}
          </>
        )}

        <h2>Recommendations</h2>
        <p>{report.recommendations}</p>
      </main>
    );
  }

  return (
    <main style={wrap}>
      <h1>Interview Report</h1>
      <p style={{ opacity: 0.6 }}>Session: {id}</p>
      {err ? (
        <p style={{ color: "#b45309" }}>
          The report isn't available yet. This page will keep checking.
          <br />
          <small style={{ opacity: 0.6 }}>{err}</small>
        </p>
      ) : (
        pending && <p>Generating your report… this page updates automatically.</p>
      )}
      <button onClick={load}>Check now</button>
    </main>
  );
}
