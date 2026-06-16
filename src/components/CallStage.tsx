import { useState } from "react";
import {
  VoiceAssistantControlBar,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Alert, Badge, Button, Spinner, cn } from "./ui";
import Captions from "./Captions";

const STATE_LABEL: Record<string, { label: string; tone: "slate" | "amber" | "green" | "indigo" }> = {
  connecting: { label: "Connecting", tone: "slate" },
  initializing: { label: "Warming up", tone: "slate" },
  listening: { label: "Listening", tone: "green" },
  thinking: { label: "Thinking", tone: "amber" },
  speaking: { label: "Speaking", tone: "indigo" },
};

export default function CallStage({ sessionId, err }: { sessionId?: string; err: string | null }) {
  const room = useRoomContext();
  const { state, agent } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const meta = STATE_LABEL[state] ?? { label: state, tone: "slate" as const };
  // The agent participant is undefined until the AI interviewer actually joins.
  const agentJoined = !!agent;
  // Captions are opt-in; off by default. The window stays mounted (just hidden) so
  // the transcript keeps accumulating and is all there when toggled back on.
  const [showCaptions, setShowCaptions] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Interview in progress</h1>
          <p className="mt-1 font-mono text-xs text-slate-400">{sessionId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={meta.tone}>
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            Interviewer · {meta.label}
          </Badge>
          <Badge tone={isMicrophoneEnabled ? "green" : "rose"}>
            Mic {isMicrophoneEnabled ? "on" : "off"}
          </Badge>
        </div>
      </div>

      {err && (
        <div className="mt-4">
          <Alert>{err}</Alert>
        </div>
      )}

      <div className={showCaptions ? "" : "hidden"}>
        <Captions localIdentity={localParticipant.identity} />
      </div>

      {!showCaptions && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <div
            className={cn(
              "grid size-44 place-items-center rounded-2xl shadow-sm transition",
              agentJoined
                ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-indigo-500/30"
                : "bg-slate-200 text-slate-400",
            )}
          >
            <span className="text-5xl font-bold tracking-tight">AI</span>
          </div>
          {!agentJoined && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Spinner className="size-4 text-slate-400" />
              Waiting for the interviewer to join…
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="lk-controls-wrap [&_.lk-button]:!rounded-xl">
          {/* Mic mute/unmute + audio device picker from LiveKit. */}
          <VoiceAssistantControlBar controls={{ leave: false }} />
        </div>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showCaptions}
              onChange={(e) => setShowCaptions(e.target.checked)}
              className="size-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Enable captions
          </label>
          <Button variant="danger" onClick={() => room.disconnect()} className="px-5">
            <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth={2}>
              <path d="M3 5a2 2 0 0 1 2-2h2l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v2a2 2 0 0 1-2 2A16 16 0 0 1 3 5Z" />
            </svg>
            End call
          </Button>
        </div>
      </div>
    </div>
  );
}
