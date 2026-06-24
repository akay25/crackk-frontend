// Entry point: mints an anonymous session and shows the on-screen magic link
// (no email). The candidate keeps this link to return anytime.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession } from "../api/session";
import type { CreateSessionResponse } from "../types/api";
import { Alert, Button, Card, Footer, Spinner } from "../components/ui";

const FEATURES = [
  { title: "Tailored to you", body: "Questions built from your resume and the exact job description." },
  { title: "Real voice interview", body: "Speak naturally with Crackk AI — live captions included." },
  { title: "Evidence-based report", body: "Per-competency scores with verbatim quotes from your answers." },
];

export default function Start() {
  const navigate = useNavigate();
  const [res, setRes] = useState<CreateSessionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onStart() {
    setErr(null);
    setBusy(true);
    try {
      setRes(await createSession());
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!res) return;
    try {
      await navigator.clipboard.writeText(res.setup_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked; the link is visible to copy manually */
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 py-16 text-center sm:py-24">
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Practice the interview,
          <br />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            ace the real one.
          </span>
        </h1>
        <p className="mt-4 max-w-md text-balance text-lg text-slate-600">
          A tailored mock interview from your resume and the job posting, with a detailed,
          evidence-based report at the end.
        </p>

        {!res && (
          <div className="mt-8">
            <Button onClick={onStart} disabled={busy} className="px-6 py-3 text-base">
              {busy ? (
                <>
                  <Spinner /> Starting…
                </>
              ) : (
                "Start a new interview"
              )}
            </Button>
          </div>
        )}

        {err && (
          <div className="mt-6 w-full max-w-md">
            <Alert>{err}</Alert>
          </div>
        )}

        {res && (
          <Card className="mt-8 w-full max-w-md text-left">
            <h2 className="text-base font-semibold text-slate-900">Your private link</h2>
            <p className="mt-1 text-sm text-slate-600">
              Save this — it's the only way back to your interview. There's no login.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 pl-3.5">
              <code className="min-w-0 flex-1 truncate text-sm text-slate-700">{res.setup_url}</code>
              <Button variant="secondary" onClick={copyLink} className="shrink-0 px-3 py-1.5">
                {copied ? "Copied ✓" : "Copy"}
              </Button>
            </div>
            <Button
              onClick={() => navigate(`/${res.session_id}/setup`)}
              className="mt-4 w-full py-3 text-base"
            >
              Continue to setup →
            </Button>
          </Card>
        )}

        <div className="mt-14 grid w-full gap-3 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-left backdrop-blur"
            >
              <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
