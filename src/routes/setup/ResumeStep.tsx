// Setup step 1 — resume upload. Selecting a file stages it for a client-side preview;
// the actual upload happens on the explicit "Upload" button. Drives its UI off the live
// resume.* status (running → ready / failed). Shared state comes from useSetup().
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { getResumeProfile, uploadResume, type ParsedProfile } from "../../lib/api";
import { failedStage, reached } from "../../lib/socket";
import { Button, Modal, Spinner, cn } from "../../components/ui";
import ResumeProfilePreview from "../../components/ResumeProfilePreview";
import { useSetup } from "./SetupContext";
import StepNav from "./StepNav";

// pdf.js is heavy — only pull it in when a file is actually staged for preview.
const PdfPreview = lazy(() => import("../../components/PdfPreview"));

export default function ResumeStep() {
  const { sessionId, session, state, setErr, refresh, reparsing, setReparsing, resumeReady, goToIndex } = useSetup();

  const [resumeBusy, setResumeBusy] = useState(false);
  const [profile, setProfile] = useState<ParsedProfile | null>(null);
  // The file picked from the file manager but NOT yet uploaded — previewed first.
  const [pendingResume, setPendingResume] = useState<File | null>(null);
  // False once the staged PDF preview rejects the file (e.g. too many pages).
  const [previewValid, setPreviewValid] = useState(true);
  // Popup shown when the worker reports resume parsing failed (over the socket).
  const [showResumeError, setShowResumeError] = useState(false);

  const hasResume = session?.has_resume ?? false;
  const resumeFailed = failedStage(state) === "resume";
  // While a resume is parsing (uploaded, not yet ready, not failed) we block picking
  // another one. `reparsing` covers the gap right after a replacement upload, before
  // the live status has caught up.
  const resumeProcessing = reparsing || (hasResume && !resumeReady && !resumeFailed);

  // Fetch the parsed-resume preview exactly once, when the resume stage is ready.
  // Skip while reparsing — the "ready" status still refers to the previous resume.
  useEffect(() => {
    if (!sessionId || reparsing || !reached(state, "resume.ready") || profile) return;
    let active = true;
    getResumeProfile(sessionId)
      .then((p) => {
        if (active && p) setProfile(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId, reparsing, state.stage, state.status, profile]);

  // Surface a parse failure as a popup so the candidate knows to re-upload.
  useEffect(() => {
    if (state.stage === "resume" && state.status === "failed") setShowResumeError(true);
  }, [state.stage, state.status]);

  // Once the worker actually starts on the replacement resume, the live status returns
  // to the resume stage at a non-ready sub and can drive the UI again, so we drop the
  // local hold. From there the normal running→ready flow refetches the new profile.
  useEffect(() => {
    if (reparsing && state.stage === "resume" && state.status !== "ready") setReparsing(false);
  }, [reparsing, state.stage, state.status, setReparsing]);

  // Selecting a file stages it for a client-side preview — it does not upload.
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

  return (
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
                {session?.resume_is_technical === false || state.reason === "not_technical"
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

      <StepNav canAdvance={resumeReady}>
        {pendingResume && (
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
      </StepNav>

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
                goToIndex(0);
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
    </div>
  );
}
