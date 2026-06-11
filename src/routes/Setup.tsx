// Setup screen: resume upload, job URL (with paste-JD fallback), and the
// difficulty / pay / role form. Drives its UI from live per-stage status over the
// WebSocket (see lib/ws.ts). sessionId comes from the URL path (the capability).
import { Fragment, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  buildBlueprint,
  getResumeProfile,
  getSession,
  joinCall,
  setConfig,
  setJob,
  uploadResume,
  type ConfigInput,
  type Difficulty,
  type ParsedProfile,
  type Session,
} from "../lib/api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  Shell,
  Spinner,
  Textarea,
  cn,
} from "../components/ui";
import ResumeProfilePreview from "../components/ResumeProfilePreview";
import { failedStage, parseStatus, reached, useSessionStatus } from "../lib/ws";

// pdf.js is heavy — only pull it in when a file is actually staged for preview.
const PdfPreview = lazy(() => import("../components/PdfPreview"));

const DIFFICULTIES: Difficulty[] = ["junior", "mid", "senior", "staff"];

// Tone + label for the small status pill, derived from the combined status string.
function statusTone(status: string): "slate" | "green" | "amber" | "rose" {
  const { sub } = parseStatus(status);
  if (sub === "failed") return "rose";
  if (status === "completed" || sub === "ready") return "green";
  if (sub === "running" || sub === "in_call") return "amber";
  return "slate";
}
const statusLabel = (status: string) => status.replace(/_/g, " ").replace(".", " · ");

const STEP_TITLES = ["Resume", "Job description", "Configure & build"];

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth={2.5}>
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal stepper: numbered/checked dots with connectors; click to jump back. */
function StepperHeader({
  current,
  done,
  canGo,
  onJump,
}: {
  current: number;
  done: boolean[];
  canGo: (i: number) => boolean;
  onJump: (i: number) => void;
}) {
  return (
    <nav className="flex items-center">
      {STEP_TITLES.map((title, i) => {
        const isDone = done[i];
        const active = i === current;
        const reachable = canGo(i);
        return (
          <Fragment key={title}>
            <button
              type="button"
              onClick={() => reachable && onJump(i)}
              disabled={!reachable}
              className={cn(
                "flex items-center gap-2",
                reachable ? "cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition",
                  isDone
                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : active
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                      : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200",
                )}
              >
                {isDone ? <Check /> : i + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  active ? "text-slate-900" : "text-slate-500",
                )}
              >
                {title}
              </span>
            </button>
            {i < STEP_TITLES.length - 1 && (
              <span
                className={cn(
                  "mx-2 h-px flex-1 transition-colors",
                  done[i] ? "bg-emerald-300" : "bg-slate-200",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export default function Setup() {
  const navigate = useNavigate();
  const { sessionId } = useParams();

  const [session, setSession] = useState<Session | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Resume
  const [resumeBusy, setResumeBusy] = useState(false);
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  // The file picked from the file manager but NOT yet uploaded — previewed first.
  const [pendingResume, setPendingResume] = useState<File | null>(null);
  // False once the staged PDF preview rejects the file (e.g. too many pages).
  const [previewValid, setPreviewValid] = useState(true);

  // Job / JD
  // URL scraping is disabled for now — JD is pasted directly.
  // const [jobUrl, setJobUrl] = useState("");
  const [jdText, setJdText] = useState("");
  // const [showPaste, setShowPaste] = useState(false);
  const [jobBusy, setJobBusy] = useState(false);

  // Config
  const [difficulty, setDifficulty] = useState<Difficulty>("mid");
  const [targetPay, setTargetPay] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  // Save is enabled only when the form differs from what's saved. Goes false after a
  // successful save, true on any field edit. Seeded once from the loaded session.
  const [configDirty, setConfigDirty] = useState(false);
  const configInited = useRef(false);

  // Blueprint
  const [blueprintBusy, setBlueprintBusy] = useState(false);
  // True while joining — joinCall advances the session to interview.in_call (so the
  // route guard lets us onto /interview) before we navigate there.
  const [joining, setJoining] = useState(false);

  // Stepper: which step is currently shown (0-based).
  const [step, setStep] = useState(0);
  // True after the user kicks off a build this session, until the blueprint is
  // ready — drives the "Join interview" popup and the button's loading state.
  const [awaitingBuild, setAwaitingBuild] = useState(false);
  // Popup shown when the worker reports resume parsing failed (over the WS).
  const [showResumeError, setShowResumeError] = useState(false);
  // True from the moment a replacement resume is uploaded until the worker actually
  // picks it up (status leaves "ready"). Without this, the previous parse's "ready"
  // status lingers — re-enabling Next and re-showing the old parsed profile — until
  // the WS catches up.
  const [reparsing, setReparsing] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setSession(await getSession(sessionId));
    } catch (e) {
      setErr(String(e));
    }
  }, [sessionId]);

  // Live combined status over WebSocket — no polling. Fall back to the session's
  // status (from REST) until the first snapshot arrives.
  const live = useSessionStatus(sessionId ?? null);
  const status = live.status ?? session?.status ?? null;

  // Initial load of the structured session fields.
  useEffect(() => {
    if (!sessionId) {
      setErr("No session found — start a new interview from the home page.");
      return;
    }
    refresh();
  }, [sessionId, refresh]);

  // Each time the live status changes (pushed over the WS), re-sync the richer
  // session fields so the steps light up. No interval — fires only on actual change.
  useEffect(() => {
    if (live.status) refresh();
  }, [live.status, refresh]);

  // Fetch the parsed-resume preview exactly once, when the resume stage is ready
  // (no more 404-polling — the status tells us when it's available).
  useEffect(() => {
    // Skip while reparsing — the "ready" status still refers to the previous resume,
    // so fetching now would re-show the stale profile.
    if (!sessionId || reparsing || !reached(status, "resume.ready") || profile) return;
    let active = true;
    getResumeProfile(sessionId)
      .then((p) => {
        if (active && p) setProfile(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId, reparsing, status, profile]);

  // The worker reports "resume.failed" if parsing blew up — surface it as a popup so
  // the candidate knows to re-upload (effect fires on the status change).
  useEffect(() => {
    if (failedStage(status) === "resume") setShowResumeError(true);
  }, [status]);

  // Once the worker actually starts on the replacement resume, the live status
  // returns to the resume stage at a non-ready sub (running/pending/failed) and can
  // drive the UI again, so we drop the local hold. From there the normal
  // running→ready flow refetches the new profile and re-enables Next.
  useEffect(() => {
    const ps = parseStatus(status);
    if (reparsing && ps.stage === "resume" && ps.sub !== "ready") setReparsing(false);
  }, [reparsing, status]);

  // Once the blueprint is ready, resolve the build button's loading state. The
  // "Join interview" modal itself is driven directly by hasBlueprint (below).
  useEffect(() => {
    const blueprintReady = (session?.has_blueprint ?? false) || reached(status, "blueprint.ready");
    if (blueprintReady && awaitingBuild) setAwaitingBuild(false);
  }, [session?.has_blueprint, status, awaitingBuild]);

  // One-time: seed the config form from the loaded session (so editing one field
  // doesn't wipe the others) and decide whether Save starts enabled. A session that
  // has already saved its config (reached difficulty_set) starts disabled until an
  // edit; a session that hasn't starts enabled so the user can save it.
  useEffect(() => {
    if (!session || configInited.current) return;
    configInited.current = true;
    setTargetPay(session.target_pay ?? "");
    setRoleTitle(session.role_title ?? "");
    setConfigDirty(!reached(session.status, "difficulty_set"));
  }, [session]);

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
  const ps = parseStatus(status);
  // Step 1 isn't "done" until the resume is actually parsed (resume.ready), not just
  // uploaded — so Next (and the stepper jump) stay disabled while parsing runs.
  const resumeReady = !reparsing && reached(status, "resume.ready");
  const resumeFailed = failedStage(status) === "resume";
  // While a resume is parsing (uploaded, not yet ready, not failed) we block picking
  // another one — a failed parse still allows re-upload (handled by the modal below).
  // `reparsing` covers the gap right after a replacement upload, before the live
  // status has caught up.
  const resumeProcessing = reparsing || (hasResume && !resumeReady && !resumeFailed);
  // A JD only counts as done once it's accepted as technical AND structured
  // (jd.ready). A non-technical JD fails the jd stage (reason "not_technical") with
  // jd_is_technical=false, so it must NOT unlock the next step.
  const jdReady = reached(status, "jd.ready");
  const jdProcessing = ps.stage === "jd" && (ps.sub === "running" || ps.sub === "pending");
  const jdInvalid = session?.jd_is_technical === false; // rejected: not a technical role
  // Any other JD failure (e.g. scrape/extract error) that isn't the not-technical gate.
  const jdFailed = !jdInvalid && failedStage(status) === "jd";
  const hasJd = jdReady;
  const configDone = reached(status, "difficulty_set"); // config saved (target_pay/role)
  const hasBlueprint = (session?.has_blueprint ?? false) || reached(status, "blueprint.ready");
  // The backend rejects blueprint generation (409) unless a resume AND a JD are ready;
  // gate the button on all three steps being done.
  const canBuild = configDone && resumeReady && jdReady;

  const doneFlags = [resumeReady, hasJd, configDone];
  const completed = doneFlags.filter(Boolean).length;

  // You can revisit any completed step and reach the first unfinished one, but
  // not skip ahead past a step you haven't done yet.
  const firstIncomplete =
    doneFlags.indexOf(false) === -1 ? STEP_TITLES.length - 1 : doneFlags.indexOf(false);
  const canGo = (i: number) => i <= firstIncomplete;
  const goTo = (i: number) => setStep(Math.min(Math.max(i, 0), STEP_TITLES.length - 1));

  // URL scraping is disabled for now — JD is pasted directly (see step 2).
  // const scrapeMaybeFailed = statuses?.jd === "failed";

  // Selecting a file no longer uploads — it stages the file for a client-side
  // preview. The actual upload happens when the user presses "Upload" below.
  function onPickResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file || resumeProcessing) return; // don't swap the resume mid-parse
    setErr(null);
    setProfile(null); // a new pick invalidates the previous parse preview
    setPreviewValid(true); // re-validated by the preview below
    setShowResumeError(false); // re-uploading clears the previous parse failure
    setPendingResume(file);
  }

  // Stable identity so it doesn't re-trigger PdfPreview's render effect each render.
  const onPreviewValidity = useCallback((valid: boolean) => setPreviewValid(valid), []);

  async function onUploadResume() {
    if (!pendingResume || !sessionId || !previewValid) return;
    setErr(null);
    setResumeBusy(true);
    try {
      await uploadResume(sessionId, pendingResume);
      setPendingResume(null);
      setProfile(null); // drop the previous parse — a new one is on the way
      setReparsing(true); // hold "processing" until the worker re-runs (status != ready)
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setResumeBusy(false);
    }
  }

  // URL scraping is disabled for now — JD is pasted directly (onPasteJd below).
  // async function onJobUrl(e: React.FormEvent) {
  //   e.preventDefault();
  //   if (!jobUrl.trim() || !sessionId) return;
  //   setErr(null);
  //   setJobBusy(true);
  //   try {
  //     await setJob(sessionId, { job_url: jobUrl.trim() });
  //     await refresh();
  //   } catch (e) {
  //     setErr(String(e));
  //   } finally {
  //     setJobBusy(false);
  //   }
  // }

  async function onPasteJd(e?: React.FormEvent) {
    e?.preventDefault();
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

  async function onConfig(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setConfigBusy(true);
    const input: ConfigInput = { difficulty };
    if (targetPay.trim()) input.target_pay = targetPay.trim();
    if (roleTitle.trim()) input.role_title = roleTitle.trim();
    try {
      await setConfig(sessionId, input);
      setConfigDirty(false); // saved — disable until the next edit
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setConfigBusy(false);
    }
  }

  async function onBuild(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sessionId) return;
    setErr(null);
    setBlueprintBusy(true);
    try {
      await buildBlueprint(sessionId);
      setAwaitingBuild(true); // wait for blueprint→ready over the WS, then pop the join dialog
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBlueprintBusy(false);
    }
  }

  // Start the interview from the "ready" modal. joinCall flips the session to
  // interview.in_call (so SessionGate admits us to /interview) and mints the LiveKit
  // token, which we hand to the Interview page via router state so it connects
  // straight away (no second "join" step).
  async function onJoin() {
    if (!sessionId) return;
    setErr(null);
    setJoining(true);
    try {
      const conn = await joinCall(sessionId);
      navigate(`/${sessionId}/interview`, { state: { conn } });
    } catch (e) {
      setErr(String(e));
      setJoining(false);
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
          <Badge tone={statusTone(session.status)}>
            <span className="size-1.5 rounded-full bg-current" />
            {statusLabel(session.status)}
          </Badge>
        )}
      </div>

      {/* Stepper header */}
      <div className="mt-6">
        <StepperHeader current={step} done={doneFlags} canGo={canGo} onJump={goTo} />
        <p className="mt-2 text-right text-xs font-medium text-slate-400">
          Step {step + 1} of {STEP_TITLES.length} · {completed} done
        </p>
      </div>

      {err && (
        <div className="mt-5">
          <Alert>{err}</Alert>
        </div>
      )}

      <Card className="mt-4">
        {/* Step 1 — Resume */}
        {step === 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900">Upload your resume</h2>
            <div className="mt-4">
              <label
                className={cn(
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
                  resumeProcessing
                    ? "cursor-not-allowed border-slate-200 bg-slate-100/60 opacity-70"
                    : "cursor-pointer border-slate-300 bg-slate-50/50 hover:border-indigo-400 hover:bg-indigo-50/40",
                )}
              >
                {resumeProcessing ? (
                  <Spinner className="size-7 text-indigo-500" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" className="size-7 text-slate-400" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M12 16V4m0 0 4 4m-4-4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
                  </svg>
                )}
                <span className="mt-2 text-sm font-medium text-slate-700">
                  {resumeProcessing
                    ? "Processing your resume… please wait"
                    : pendingResume
                      ? "Click to choose a different file"
                      : hasResume
                        ? "Click to replace your resume"
                        : "Click to choose a PDF or DOCX"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={onPickResume}
                  disabled={resumeBusy || resumeProcessing}
                  className="hidden"
                />
              </label>

              {/* Staged file: preview its pages, then the explicit Upload button. */}
              {pendingResume && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium text-slate-700">{pendingResume.name}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-slate-400">{(pendingResume.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        onClick={() => setPendingResume(null)}
                        disabled={resumeBusy}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {pendingResume.type === "application/pdf" ? (
                    <Suspense
                      fallback={
                        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
                          <Spinner className="size-4 text-indigo-500" />
                          Loading preview…
                        </div>
                      }
                    >
                      <PdfPreview file={pendingResume} maxPages={3} onValidityChange={onPreviewValidity} />
                    </Suspense>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Preview is available for PDFs only — this file will be uploaded as-is.
                    </p>
                  )}
                </div>
              )}

              {hasResume && !pendingResume && (
                <div className="mt-3">
                  {resumeFailed ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                      {session?.resume_is_technical === false || live.reason === "not_technical"
                        ? "That doesn't look like a technical resume. Please upload a technical resume to continue."
                        : "We couldn't read that resume. Please upload another file."}
                    </div>
                  ) : profile ? (
                    <ResumeProfilePreview profile={profile} />
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
                      <Spinner className="size-4 text-indigo-500" />
                      Reading your resume… we'll show you what we found here in a moment.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — Job description */}
        {step === 1 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900">Add the job description</h2>
            <div className="mt-4">
              {jdReady ? (
                <div className="space-y-3">
                  <Badge tone="green">Job description added ({session?.jd_source})</Badge>
                  {(session?.jd_text ?? jdText) && (
                    <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-700">
                      {session?.jd_text ?? jdText}
                    </div>
                  )}
                </div>
              ) : jdProcessing ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
                  <Spinner className="size-4 text-indigo-500" />
                  Checking your job description…
                </div>
              ) : (
                <div className="space-y-4">
                  {jdInvalid && (
                    <Alert tone="rose">
                      This doesn't look like a technical job description. We only support
                      technical roles (software, data, IT, devops, hardware, etc.). Please paste
                      a technical job description to continue.
                    </Alert>
                  )}
                  {jdFailed && (
                    <Alert tone="amber">
                      We couldn't process that job description. Please try pasting it again.
                    </Alert>
                  )}
                  {/* URL scraping is disabled for now — paste the JD text directly.
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
                  */}

                  <div>
                    <Label>Paste the job description</Label>
                    <Textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      rows={7}
                      placeholder="Paste the full job description here…"
                      disabled={jobBusy}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3 — Difficulty, pay & role */}
        {step === 2 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900">Difficulty, pay & role</h2>
            <div className="mt-4 space-y-4">
              <div>
                <Label>Difficulty</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDifficulty(d);
                        setConfigDirty(true);
                      }}
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
                    onChange={(e) => {
                      setTargetPay(e.target.value);
                      setConfigDirty(true);
                    }}
                  />
                </div>
                <div>
                  <Label>Role title (optional)</Label>
                  <Input
                    type="text"
                    placeholder="Senior Backend Engineer"
                    value={roleTitle}
                    onChange={(e) => {
                      setRoleTitle(e.target.value);
                      setConfigDirty(true);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Build the interview — enabled once resume + JD + config are set. */}
            <div className="mt-6 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-900">Build the interview</h3>
              <p className="mt-1 text-sm text-slate-600">
                Generates a tailored question blueprint from your resume and the JD.
              </p>
              {!canBuild && (
                <p className="mt-2 text-sm text-slate-500">
                  {!configDone ? "Save your settings first." : "Finish steps 1–2 first."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step navigation + the step's primary action, combined into one row. The
            action commits the step (upload / save JD / save config / build); Next
            stays disabled until that accepted event lands (doneFlags[step]). */}
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => goTo(step - 1)} disabled={step === 0}>
            ← Back
          </Button>
          <div className="flex items-center gap-3">
            {/* Step 1 — upload the staged resume */}
            {step === 0 && pendingResume && (
              <Button onClick={onUploadResume} disabled={resumeBusy || !previewValid}>
                {resumeBusy ? (
                  <>
                    <Spinner /> Uploading…
                  </>
                ) : (
                  "Upload"
                )}
              </Button>
            )}
            {/* Step 2 — submit the pasted JD (hidden once accepted) */}
            {step === 1 && !jdReady && (
              <Button onClick={() => onPasteJd()} disabled={jobBusy || jdProcessing || !jdText.trim()}>
                {jobBusy ? <Spinner /> : "Use this JD"}
              </Button>
            )}
            {/* Step 3 — save config + build the interview */}
            {step === 2 && (
              <>
                <Button variant="secondary" onClick={() => onConfig()} disabled={configBusy || !configDirty}>
                  {configBusy ? <Spinner /> : configDone ? "Update" : "Save"}
                </Button>
                <Button onClick={() => onBuild()} disabled={blueprintBusy || awaitingBuild || !canBuild}>
                  {blueprintBusy || awaitingBuild ? (
                    <>
                      <Spinner /> Building…
                    </>
                  ) : hasBlueprint ? (
                    "Rebuild blueprint"
                  ) : (
                    "Build interview"
                  )}
                </Button>
              </>
            )}
            {/* Next — blocked until the current step's accepted event is done */}
            {step < STEP_TITLES.length - 1 && (
              <Button onClick={() => goTo(step + 1)} disabled={!doneFlags[step]}>
                Next →
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Once the blueprint is ready, the only thing to do is join — a focused,
          non-dismissible modal takes over. */}
      <Modal open={hasBlueprint} onClose={() => {}}>
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" className="size-6" stroke="currentColor" strokeWidth={2.5}>
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Your interview is ready 🎉</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            We've built your tailored interview. Find a quiet space with a working mic, then join
            when you're ready.
          </p>
          <div className="mt-6">
            <Button onClick={onJoin} disabled={joining} className="w-full py-3 text-base">
              {joining ? (
                <>
                  <Spinner /> Joining…
                </>
              ) : (
                "Join the interview →"
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Popup shown when the worker reports resume parsing failed. */}
      <Modal open={showResumeError} onClose={() => setShowResumeError(false)}>
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-rose-100 text-rose-600">
            <svg viewBox="0 0 24 24" fill="none" className="size-6" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">We couldn't read that resume</h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Something went wrong while parsing your resume. Please try uploading it again — a PDF or
            DOCX export usually works best.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button
              onClick={() => {
                setShowResumeError(false);
                goTo(0);
              }}
              className="w-full py-3 text-base"
            >
              Try another resume
            </Button>
            <button
              type="button"
              onClick={() => setShowResumeError(false)}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
