// Interview call screen. POST /sessions/:id/join mints a LiveKit token; we connect
// the browser to the SFU room with @livekit/components-react, publish the mic, play
// the agent's audio, and stream live captions. Route is token-guarded (magic token).
import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import { joinCall } from "../api/session";
import type { JoinResponse } from "../types/api";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";
import CallStage from "../components/CallStage";

export default function Interview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Setup hands us a freshly-minted connection via router state after it joins —
  // connect straight away. On a direct visit / refresh there's none, so we show the
  // "Ready to begin?" screen and join from here instead.
  const handoff =
    (location.state as { conn?: JoinResponse } | null)?.conn ?? null;
  const [conn, setConn] = useState<JoinResponse | null>(handoff);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended">(
    "idle",
  );
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-7"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path d="M12 3a4 4 0 0 0-4 4v3a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Ready to begin?
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-600">
            You'll speak with an AI interviewer. Find a quiet spot — your
            browser will ask for microphone permission when you join.
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-7"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="m5 13 4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Interview complete
          </h1>
          <p className="mt-2 text-slate-600">
            Nice work. Your report is being generated.
          </p>
          <Button
            onClick={() => navigate(`/${sessionId}/report`)}
            className="mt-6 px-6 py-3 text-base"
          >
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
