// Report screen (skeleton for the M3 build): renders the evidence-based report
// from GET /sessions/:id/report (see contracts/schemas/report.schema.json).
import { useParams } from "react-router-dom";

export default function Report() {
  const { id } = useParams();
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui" }}>
      <h1>Interview Report</h1>
      <p>Session: {id}</p>
      <p style={{ opacity: 0.6 }}>
        Skeleton — renders overall + per-competency scores, strengths, areas to
        improve, and evidence quotes once report_gen completes.
      </p>
    </main>
  );
}
