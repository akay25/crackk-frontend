// Setup screen (skeleton for the M1/M4 frontend agent): resume upload, job URL
// with paste-JD fallback, and difficulty/pay/role. Authorized by the magic token.
import { useEffect, useState } from "react";
import { getToken } from "../lib/api";

export default function Setup() {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) setErr("No token — open your private link to continue.");
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui" }}>
      <h1>Set up your interview</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <ol>
        <li>Upload your resume (PDF/DOCX)</li>
        <li>Paste the job posting link (or paste the JD text if scraping fails)</li>
        <li>Pick difficulty, target pay, and role</li>
      </ol>
      <p style={{ opacity: 0.6 }}>
        Skeleton — the frontend build agent wires uploads + form against contracts-v1.
      </p>
    </main>
  );
}
