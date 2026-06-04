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
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Shell,
  Spinner,
  Textarea,
} from "../components/ui";

const DIFFICULTIES: Difficulty[] = ["junior", "mid", "senior", "staff"];
const POLL_MS = 2000;

const STATUS_TONE: Record<Session["status"], "slate" | "green" | "amber" | "rose" | "indigo"> = {
  draft: "slate",
  ready: "indigo",
  in_call: "amber",
  completed: "green",
  failed: "rose",
};

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="relative">
      <div className="flex items-start gap-4">
        <div
          className={
            "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold transition " +
            (done
              ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
              : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200")
          }
        >
          {done ? (
            <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth={2.5}>
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            index
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </Card>
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
      <Shell>
        <h1 className="text-2xl font-bold text-slate-900">Set up your interview</h1>
        <div className="mt-4">
          <Alert>{err ?? "No session found — start a new interview from the home page."}</Alert>
        </div>
        <Button className="mt-4" onClick={() => navigate("/")}>
          Go to home
        </Button>
      </Shell>
    );
  }

  const hasResume = session?.has_resume ?? false;
  const hasJd = !!session?.jd_source;
  const hasConfig = !!session?.difficulty; // config sets difficulty -> status=ready
  const hasBlueprint = session?.has_blueprint ?? false;
  const ready = session?.status === "ready" || session?.status === "in_call";

  const completed = [hasResume, hasJd, hasConfig, hasBlueprint].filter(Boolean).length;

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
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set up your interview</h1>
          <p className="mt-1 text-sm text-slate-600">
            Complete these steps, then build your tailored interview.
          </p>
        </div>
        {session && (
          <Badge tone={STATUS_TONE[session.status]}>
            <span className="size-1.5 rounded-full bg-current" />
            {session.status}
          </Badge>
        )}
      </div>

      {/* Progress */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Progress</span>
          <span>{completed} / 4</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${(completed / 4) * 100}%` }}
          />
        </div>
      </div>

      {err && (
        <div className="mt-5">
          <Alert>{err}</Alert>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <Step index={1} title="Upload your resume" done={hasResume}>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40">
            <svg viewBox="0 0 24 24" fill="none" className="size-7 text-slate-400" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
            </svg>
            <span className="mt-2 text-sm font-medium text-slate-700">
              {resumeBusy ? "Uploading…" : "Click to upload PDF or DOCX"}
            </span>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={onResume}
              disabled={resumeBusy}
              className="hidden"
            />
          </label>
          {hasResume && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald-700">
              <Badge tone="green">Resume received</Badge>
            </p>
          )}
        </Step>

        <Step index={2} title="Add the job description" done={hasJd}>
          {hasJd ? (
            <Badge tone="green">Job description added ({session?.jd_source})</Badge>
          ) : (
            <div className="space-y-4">
              <form onSubmit={onJobUrl}>
                <Label>Job posting URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="url"
                    placeholder="https://company.com/jobs/123"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    disabled={jobBusy}
                  />
                  <Button type="submit" disabled={jobBusy || !jobUrl.trim()} className="shrink-0">
                    {jobBusy ? <Spinner /> : "Use URL"}
                  </Button>
                </div>
              </form>

              {scrapeMaybeFailed && !showPaste && (
                <Alert tone="amber">
                  Couldn't read that posting automatically.{" "}
                  <button
                    type="button"
                    onClick={() => setShowPaste(true)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Paste the JD text instead
                  </button>
                </Alert>
              )}

              {!showPaste && !scrapeMaybeFailed && (
                <button
                  type="button"
                  onClick={() => setShowPaste(true)}
                  className="text-sm font-medium text-indigo-700 hover:underline"
                >
                  Or paste the JD text instead →
                </button>
              )}

              {showPaste && (
                <form onSubmit={onPasteJd}>
                  <Label>Paste the job description</Label>
                  <Textarea
                    value={jdText}
                    onChange={(e) => setJdText(e.target.value)}
                    rows={7}
                    placeholder="Paste the full job description here…"
                    disabled={jobBusy}
                  />
                  <Button type="submit" disabled={jobBusy || !jdText.trim()} className="mt-3">
                    {jobBusy ? <Spinner /> : "Use this JD"}
                  </Button>
                </form>
              )}
            </div>
          )}
        </Step>

        <Step index={3} title="Difficulty, pay & role" done={hasConfig}>
          <form onSubmit={onConfig} className="space-y-4">
            <div>
              <Label>Difficulty</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={
                      "rounded-xl border px-3 py-2 text-sm font-medium capitalize transition " +
                      (difficulty === d
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500"
                        : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Target pay (optional)</Label>
                <Input
                  type="text"
                  placeholder="$180k"
                  value={targetPay}
                  onChange={(e) => setTargetPay(e.target.value)}
                />
              </div>
              <div>
                <Label>Role title (optional)</Label>
                <Input
                  type="text"
                  placeholder="Senior Backend Engineer"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" disabled={configBusy}>
              {configBusy ? <Spinner /> : hasConfig ? "Update" : "Save"}
            </Button>
          </form>
        </Step>

        <Step index={4} title="Build the interview" done={hasBlueprint}>
          <p className="text-sm text-slate-600">
            Generates a tailored question blueprint from your resume and the JD.
          </p>
          <form onSubmit={onBuild} className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={blueprintBusy || !ready}>
              {blueprintBusy ? (
                <>
                  <Spinner /> Building…
                </>
              ) : hasBlueprint ? (
                "Rebuild blueprint"
              ) : (
                "Build interview"
              )}
            </Button>
            {!ready && <span className="text-sm text-slate-500">Finish steps 1–3 first</span>}
          </form>
        </Step>
      </div>

      {hasBlueprint && (
        <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 border-indigo-200 bg-indigo-50/60">
          <div>
            <p className="font-semibold text-slate-900">Your interview is ready 🎉</p>
            <p className="text-sm text-slate-600">Join when you're set up with a quiet space and a mic.</p>
          </div>
          <Button onClick={() => navigate(`/interview/${sessionId}`)} className="px-5 py-3">
            Join the interview →
          </Button>
        </Card>
      )}
    </Shell>
  );
}
