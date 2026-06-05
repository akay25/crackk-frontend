// Interview call screen. POST /sessions/:id/join mints a LiveKit token; we connect
// the browser to the SFU room with @livekit/components-react, publish the mic, play
// the agent's audio, and stream live captions. Route is token-guarded (magic token).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useLocalParticipant,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { joinCall, type JoinResponse } from "../lib/api";
import { Alert, Badge, Button, Card, Shell, Spinner } from "../components/ui";

export default function Interview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [conn, setConn] = useState<JoinResponse | null>(null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [err, setErr] = useState<string | null>(null);

  const join = useCallback(async () => {
    if (!sessionId) return;
    setErr(null);
    setPhase("connecting");
    try {
      setConn(await joinCall(sessionId));
    } catch (e) {
      setErr(String(e));
      setPhase("idle");
    }
  }, [sessionId]);

  if (!conn) {
    return (
      <Shell>
        <Card className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/30">
            <svg viewBox="0 0 24 24" fill="none" className="size-7" stroke="currentColor" strokeWidth={1.8}>
              <path d="M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Ready to begin?</h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-600">
            You'll speak with an AI interviewer. Find a quiet spot — your browser will ask for
            microphone permission when you join.
          </p>
          {err && (
            <div className="mt-5 text-left">
              <Alert>{err}</Alert>
            </div>
          )}
          <Button
            onClick={join}
            disabled={phase === "connecting"}
            className="mt-6 px-6 py-3 text-base"
          >
            {phase === "connecting" ? (
              <>
                <Spinner /> Connecting…
              </>
            ) : (
              "Join the interview"
            )}
          </Button>
        </Card>
      </Shell>
    );
  }

  if (phase === "ended") {
    return (
      <Shell>
        <Card className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500 text-white">
            <svg viewBox="0 0 24 24" fill="none" className="size-7" stroke="currentColor" strokeWidth={2}>
              <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Interview complete</h1>
          <p className="mt-2 text-slate-600">Nice work. Your report is being generated.</p>
          <Button onClick={() => navigate(`/${sessionId}/report`)} className="mt-6 px-6 py-3 text-base">
            View my report →
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={conn.livekit_url}
      token={conn.token}
      connect
      audio
      video={false}
      data-lk-theme="default"
      onConnected={() => setPhase("live")}
      onDisconnected={() => setPhase("ended")}
      onError={(e) => setErr(String(e))}
    >
      <Shell>
        <CallStage sessionId={sessionId} err={err} />
      </Shell>
      {/* Plays the interviewer's audio into the page. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

const STATE_LABEL: Record<string, { label: string; tone: "slate" | "amber" | "green" | "indigo" }> = {
  connecting: { label: "Connecting", tone: "slate" },
  initializing: { label: "Warming up", tone: "slate" },
  listening: { label: "Listening", tone: "green" },
  thinking: { label: "Thinking", tone: "amber" },
  speaking: { label: "Speaking", tone: "indigo" },
};

function CallStage({ sessionId, err }: { sessionId?: string; err: string | null }) {
  const room = useRoomContext();
  const { state } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const meta = STATE_LABEL[state] ?? { label: state, tone: "slate" as const };

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

      <Captions localIdentity={localParticipant.identity} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="lk-controls-wrap [&_.lk-button]:!rounded-xl">
          {/* Mic mute/unmute + audio device picker from LiveKit. */}
          <VoiceAssistantControlBar controls={{ leave: false }} />
        </div>
        <Button variant="danger" onClick={() => room.disconnect()} className="px-5">
          <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth={2}>
            <path d="M3 5a2 2 0 0 1 2-2h2l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v2a2 2 0 0 1-2 2A16 16 0 0 1 3 5Z" />
          </svg>
          End call
        </Button>
      </div>
    </div>
  );
}

function Captions({ localIdentity }: { localIdentity: string }) {
  const transcriptions = useTranscriptions();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest caption in view as the transcript grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcriptions]);

  return (
    <Card className="mt-5 p-0">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-4 text-slate-400" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 15h4m2 0h4M7 11h2m2 0h6" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-semibold text-slate-700">Live captions</span>
      </div>
      <div ref={scrollRef} className="h-[22rem] space-y-3 overflow-y-auto px-5 py-4">
        {transcriptions.length === 0 ? (
          <p className="text-sm text-slate-400">Captions will appear here as you talk…</p>
        ) : (
          transcriptions.map((seg, i) => {
            const isYou = seg.participantInfo.identity === localIdentity;
            return (
              <div key={i} className={"flex " + (isYou ? "justify-end" : "justify-start")}>
                <div
                  className={
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm " +
                    (isYou
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : "rounded-bl-sm bg-slate-100 text-slate-800")
                  }
                >
                  <span
                    className={
                      "mb-0.5 block text-[11px] font-semibold " +
                      (isYou ? "text-indigo-200" : "text-slate-500")
                    }
                  >
                    {isYou ? "You" : "Interviewer"}
                  </span>
                  {seg.text}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
