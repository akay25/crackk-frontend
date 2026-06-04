// Entry point: mints an anonymous session and shows the on-screen magic link
// (no email). The candidate keeps this link to return anytime.
import { useState } from "react";
import { createSession, type CreateSessionResponse } from "../lib/api";

export default function Start() {
  const [res, setRes] = useState<CreateSessionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onStart() {
    setErr(null);
    try {
      setRes(await createSession());
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>AI Interviewer</h1>
      <p>Practice a tailored interview and get a detailed report.</p>
      <button onClick={onStart}>Start a new interview</button>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {res && (
        <div style={{ marginTop: "1.5rem" }}>
          <p><strong>Your private link (save it — no login):</strong></p>
          <code>{res.setup_url}</code>
          <p>
            <a href={`/setup?token=${res.magic_token}`}>Continue to setup →</a>
          </p>
        </div>
      )}
    </main>
  );
}
