// Setup screen: resume upload, job URL (with paste-JD fallback), and the
// difficulty / pay / role form. Drives its UI by polling GET /sessions/:id and
// reading status, has_resume, jd_source, has_blueprint. Authorized by the magic
// token (route is token-guarded). Builds against contracts-v1.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildBlueprint,
  getSession,
  getSessionId,
  setConfig,
  setJob,
  uploadResume,
  type ConfigInput,
  type Difficulty,
  type Session,
} from "../lib/api";

const DIFFICULTIES: Difficulty[] = ["junior", "mid", "senior", "staff"];
const POLL_MS = 2000;

const wrap = { maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui" } as const;
const card = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  margin: "1rem 0",
} as const;

function Step({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <h2 style={{ fontSize: "1.05rem", margin: "0 0 .5rem" }}>
        <span aria-hidden style={{ marginRight: 8 }}>{done ? "✅" : "⬜️"}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Setup() {
  const navigate = useNavigate();
  const sessionId = getSessionId();

  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Resume
  const [resumeBusy, setResumeBusy] = useState(false);

  // Job / JD
  const [jobUrl, setJobUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);
  const jobSubmittedAt = useRef<number | null>(null);

  // Config
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [targetPay, setTargetPay] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [configBusy, setConfigBusy] = useState(false);

  // Blueprint
  const [blueprintBusy, setBlueprintBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setSession(await getSession(sessionId));
    } catch (e) {
      setErr(String(e));
    }
  }, [sessionId]);

  // Poll session state so each step lights up as the backend completes work.
  useEffect(() => {
    if (!sessionId) {
      setErr("No session found — start a new interview from the home page.");
      return;
    }
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [sessionId, refresh]);

  if (!sessionId) {
    return (
      <main style={wrap}>
        <h1>Set up your interview</h1>
        <p style={{ color: "crimson" }}>{err}</p>
      </main>
    );
  }

  const hasResume = session?.has_resume ?? false;
  const hasJd = !!session?.jd_source;
  const hasConfig = !!session?.difficulty; // config sets difficulty -> status=ready
  const hasBlueprint = session?.has_blueprint ?? false;
  const ready = session?.status === "ready" || session?.status === "in_call";

  // A scrape can silently fail; the contract has no explicit failure status, so
  // we surface the paste fallback if a submitted URL hasn't produced a JD yet.
  const scrapeMaybeFailed = jobSubmittedAt.current !== null && !hasJd && !jobBusy;

  async function onResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !sessionId) return;
    setErr(null);
    setResumeBusy(true);
    try {
      await uploadResume(sessionId, file);
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setResumeBusy(false);
    }
  }

  async function onJobUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!jobUrl.trim() || !sessionId) return;
    setErr(null);
    setJobBusy(true);
    try {
      await setJob(sessionId, { job_url: jobUrl.trim() });
      jobSubmittedAt.current = Date.now();
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setJobBusy(false);
    }
  }

  async function onPasteJd(e: React.FormEvent) {
    e.preventDefault();
    if (!jdText.trim() || !sessionId) return;
    setErr(null);
    setJobBusy(true);
    try {
      await setJob(sessionId, { jd_text: jdText.trim() });
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setJobBusy(false);
    }
  }

  async function onConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setConfigBusy(true);
    const input: ConfigInput = { difficulty };
    if (targetPay.trim()) input.target_pay = targetPay.trim();
    if (roleTitle.trim()) input.role_title = roleTitle.trim();
    try {
      await setConfig(sessionId, input);
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setConfigBusy(false);
    }
  }

  async function onBuild(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setBlueprintBusy(true);
    try {
      await buildBlueprint(sessionId);
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBlueprintBusy(false);
    }
  }

  return (
    <main style={wrap}>
      <h1>Set up your interview</h1>
      <p style={{ opacity: 0.7 }}>
        Status: <strong>{session?.status ?? "…"}</strong>
      </p>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <Step done={hasResume} title="1. Upload your resume">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={onResume}
          disabled={resumeBusy}
        />
        {resumeBusy && <span style={{ marginLeft: 8 }}>uploading…</span>}
        {hasResume && <p style={{ opacity: 0.7, margin: ".5rem 0 0" }}>Resume received.</p>}
      </Step>

      <Step done={hasJd} title="2. Add the job description">
        {hasJd ? (
          <p style={{ opacity: 0.7, margin: 0 }}>
            Job description added ({session?.jd_source}).
          </p>
        ) : (
          <>
            <form onSubmit={onJobUrl}>
              <label>
                Job posting URL
                <br />
                <input
                  type="url"
                  placeholder="https://company.com/jobs/123"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  style={{ width: "100%", padding: 6, marginTop: 4 }}
                  disabled={jobBusy}
                />
              </label>
              <button type="submit" disabled={jobBusy || !jobUrl.trim()} style={{ marginTop: 8 }}>
                {jobBusy ? "Submitting…" : "Use this URL"}
              </button>
            </form>

            {scrapeMaybeFailed && !showPaste && (
              <p style={{ color: "#b45309", marginTop: 12 }}>
                Couldn't read that posting automatically.{" "}
                <button type="button" onClick={() => setShowPaste(true)}>
                  Paste the JD text instead
                </button>
              </p>
            )}

            {!showPaste && !scrapeMaybeFailed && (
              <p style={{ marginTop: 12 }}>
                <button type="button" onClick={() => setShowPaste(true)}>
                  Paste the JD text instead
                </button>
              </p>
            )}

            {showPaste && (
              <form onSubmit={onPasteJd} style={{ marginTop: 12 }}>
                <label>
                  Paste the job description
                  <br />
                  <textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={8}
                    style={{ width: "100%", padding: 6, marginTop: 4 }}
                    disabled={jobBusy}
                  />
                </label>
                <button type="submit" disabled={jobBusy || !jdText.trim()} style={{ marginTop: 8 }}>
                  {jobBusy ? "Saving…" : "Use this JD"}
                </button>
              </form>
            )}
          </>
        )}
      </Step>

      <Step done={hasConfig} title="3. Difficulty, pay & role">
        <form onSubmit={onConfig}>
          <label>
            Difficulty
            <br />
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              style={{ marginTop: 4 }}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <br />
          <label style={{ display: "block", marginTop: 10 }}>
            Target pay (optional)
            <br />
            <input
              type="text"
              placeholder="$180k"
              value={targetPay}
              onChange={(e) => setTargetPay(e.target.value)}
              style={{ marginTop: 4, padding: 6 }}
            />
          </label>
          <label style={{ display: "block", marginTop: 10 }}>
            Role title (optional)
            <br />
            <input
              type="text"
              placeholder="Senior Backend Engineer"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              style={{ marginTop: 4, padding: 6 }}
            />
          </label>
          <button type="submit" disabled={configBusy} style={{ marginTop: 12 }}>
            {configBusy ? "Saving…" : hasConfig ? "Update" : "Save"}
          </button>
        </form>
      </Step>

      <Step done={hasBlueprint} title="4. Build the interview">
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          Generates a tailored question blueprint from your resume and the JD.
        </p>
        <form onSubmit={onBuild}>
          <button type="submit" disabled={blueprintBusy || !ready}>
            {blueprintBusy
              ? "Building…"
              : hasBlueprint
                ? "Rebuild blueprint"
                : "Build interview"}
          </button>
          {!ready && (
            <span style={{ marginLeft: 8, opacity: 0.6 }}>
              finish steps 1–3 first
            </span>
          )}
        </form>
      </Step>

      {hasBlueprint && (
        <p style={{ marginTop: "1.5rem" }}>
          <button onClick={() => navigate(`/interview/${sessionId}`)}>
            Join the interview →
          </button>
        </p>
      )}
    </main>
  );
}
