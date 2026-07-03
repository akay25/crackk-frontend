import { useState } from "react";
import { Alert, Badge, Button, Spinner, cn } from "./ui";
import Captions from "./Captions";
import MicMeter from "./MicMeter";
import type { CallPhase, Caption } from "../lib/voiceAgent";

const STATE_LABEL: Record<
  CallPhase,
  { label: string; tone: "slate" | "amber" | "green" | "indigo" | "rose" }
> = {
  connecting: { label: "Connecting", tone: "slate" },
  listening: { label: "Listening", tone: "green" },
  thinking: { label: "Thinking", tone: "amber" },
  speaking: { label: "Speaking", tone: "indigo" },
  ended: { label: "Ended", tone: "slate" },
  error: { label: "Error", tone: "rose" },
};

export default function CallStage({
  sessionId,
  phase,
  captions,
  analyser,
  vad,
  muted,
  onToggleMute,
  ending,
  onEnd,
  err,
}: {
  sessionId?: string;
  phase: CallPhase;
  captions: Caption[];
  analyser: AnalyserNode | null;
  vad: { remainingMs: number; totalMs: number } | null;
  muted: boolean;
  onToggleMute: () => void;
  ending: boolean;
  onEnd: () => void;
  err: string | null;
}) {
  const meta = STATE_LABEL[phase] ?? { label: phase, tone: "slate" as const };
  const live = phase !== "connecting" && phase !== "ended" && phase !== "error";

  const [showCaptions, setShowCaptions] = useState(true);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Interview in progress
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            Interviewer · {meta.label}
          </Badge>
          <Badge tone={live ? "green" : "slate"}>
            Mic {live ? "on" : "off"}
          </Badge>
        </div>
      </div>

      {err && (
        <div className="mt-4">
          <Alert>{err}</Alert>
        </div>
      )}

      <div className={showCaptions ? "" : "hidden"}>
        <Captions captions={captions} />
      </div>

      {!showCaptions && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <div
            className={cn(
              "grid size-44 place-items-center rounded-2xl shadow-sm transition",
              live
                ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-indigo-500/30"
                : "bg-slate-200 text-slate-400",
              phase === "speaking" && "animate-pulse",
            )}
          >
            <span className="text-5xl font-bold tracking-tight">AI</span>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            {phase === "connecting" && (
              <>
                <Spinner className="size-4 text-slate-400" />
                Connecting to the interviewer…
              </>
            )}
            {phase === "listening" && "Listening — go ahead and speak."}
            {phase === "thinking" && "Thinking…"}
            {phase === "speaking" && "Interviewer is speaking…"}
          </p>
        </div>
      )}

      {/* Live mic level — shows whether the candidate is speaking. */}
      <div className="mt-6 flex justify-center">
        <MicMeter analyser={analyser} phase={phase} vad={vad} muted={muted} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={showCaptions}
            onChange={(e) => setShowCaptions(e.target.checked)}
            className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Enable captions
        </label>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={onToggleMute}
            disabled={phase === "ended"}
            aria-pressed={muted}
            className={cn("px-4", muted && "!ring-rose-300 !text-rose-600")}
          >
            {muted ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-4"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  d="M12 3a3 3 0 0 0-3 3v5m0 0a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-3-3"
                  strokeLinecap="round"
                />
                <path
                  d="M5 11a7 7 0 0 0 10.5 6.06M12 18v3M9 21h6"
                  strokeLinecap="round"
                />
                <path d="m4 4 16 16" strokeLinecap="round" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-4"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                <path
                  d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            variant="danger"
            disabled={ending || phase === "ended"}
            onClick={onEnd}
            className="px-5"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-4"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M3 5a2 2 0 0 1 2-2h2l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v2a2 2 0 0 1-2 2A16 16 0 0 1 3 5Z" />
            </svg>
            End call
          </Button>
        </div>
      </div>

      {/* Reload/leave warning — the call lives in this tab; leaving ends it. */}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-amber-600">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-3.5"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Don't reload or leave this page — it will end the interview.
      </p>
    </div>
  );
}
