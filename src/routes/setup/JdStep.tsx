// Setup step 2 — job description. URL scraping is disabled for now; the JD is pasted
// directly. Drives its UI off the live jd.* status (running → ready / failed), and
// distinguishes a "not technical" rejection from a generic processing failure.
import { useState } from "react";
import { setJob } from "../../api/session";
import { failedStage } from "../../utils";
import {
  Alert,
  Badge,
  Button,
  Label,
  Spinner,
  Textarea,
} from "../../components/ui";
import { useSetup } from "../../context/SetupContext";
import StepNav from "../../components/StepNav";

export default function JdStep() {
  const { sessionId, session, state, setErr, refresh, jdReady } = useSetup();

  const [jdText, setJdText] = useState("");
  const [jobBusy, setJobBusy] = useState(false);

  const jdProcessing =
    state.stage === "jd" &&
    (state.status === "running" || state.status === "pending");
  const jdInvalid = session?.jd_is_technical === false; // rejected: not a technical role
  // Any other JD failure (e.g. scrape/extract error) that isn't the not-technical gate.
  const jdFailed = !jdInvalid && failedStage(state) === "jd";

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

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">
        Add the job description
      </h2>
      <div className="mt-4">
        {jdReady ? (
          <div className="space-y-3">
            <Badge tone="green">
              Job description added ({session?.jd_source})
            </Badge>
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
                This doesn't look like a technical job description. We only
                support technical roles (software, data, IT, devops, hardware,
                etc.). Please paste a technical job description to continue.
              </Alert>
            )}
            {jdFailed && (
              <Alert tone="amber">
                We couldn't process that job description. Please try pasting it
                again.
              </Alert>
            )}
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

      <StepNav canAdvance={jdReady}>
        {!jdReady && (
          <Button
            onClick={() => onPasteJd()}
            disabled={jobBusy || jdProcessing || !jdText.trim()}
          >
            {jobBusy ? <Spinner /> : "Use this JD"}
          </Button>
        )}
      </StepNav>
    </div>
  );
}
