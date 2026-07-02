// Interview call screen. POST /sessions/:id/join returns the self-hosted voice-agent
// WebSocket URL; we connect the browser to it directly, capture the mic (client-side
// VAD → one WAV per turn), play the interviewer's reply audio, and stream captions.
// Route is token-guarded (magic token).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { joinCall, endCall as endCallAPI } from "../api/session";
import type { JoinResponse } from "../types/api";
import { Alert, Button, Card, Shell, Spinner } from "../components/ui";
import CallStage from "../components/CallStage";
import {
  VoiceAgentClient,
  type CallPhase,
  type Caption,
} from "../lib/voiceAgent";

type Screen = "idle" | "live" | "ended";

export default function Interview() {
  const { sessionId } = useParams();
  const location = useLocation();
  // Setup may hand us a freshly-minted connection via router state; otherwise we
  // join from here. Either way the candidate clicks "Join" so the mic-permission /
  // audio-playback prompt happens inside a user gesture.
  const handoff =
    (location.state as { conn?: JoinResponse } | null)?.conn ?? null;

  const [screen, setScreen] = useState<Screen>("idle");
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [muted, setMuted] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [ending, setEnding] = useState(false);
  const clientRef = useRef<VoiceAgentClient | null>(null);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      clientRef.current?.setMuted(next);
      return next;
    });
  }, []);

  // Warn before reload / close / navigation while the call is live — leaving the
  // tab drops the WebSocket, which ends the interview.
  useEffect(() => {
    if (screen !== "live") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // required for Chrome to show the native prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [screen]);

  const begin = useCallback(async () => {
    if (!sessionId) return;
    setErr(null);
    setMuted(true);
    setJoining(true);
    try {
      const conn = handoff ?? (await joinCall(sessionId));
      const client = new VoiceAgentClient(conn.ws_url, {
        onPhase: (p) => {
          setPhase(p);
          if (p === "ended") setScreen("ended");
        },
        onCaptions: (c) => setCaptions(c),
        onError: (m) => setErr(m),
        onClose: () => setScreen("ended"),
        onAnalyser: (a) => setAnalyser(a),
      });
      clientRef.current = client;
      await client.start();
      client.setMuted(true);
      setScreen("live");
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      setErr(
        name === "NotAllowedError" || name === "NotFoundError"
          ? "Microphone permission is required to start the interview."
          : String((e as { message?: string })?.message ?? e),
      );
    } finally {
      setJoining(false);
    }
  }, [sessionId, handoff]);

  const end = useCallback(async () => {
    setEnding(true);
    clientRef.current?.end();
    clientRef.current = null;
    if (sessionId) {
      try {
        await endCallAPI(sessionId);
      } catch {
        /* best-effort — the agent finalizes on WS close anyway */
      }
    }
    setScreen("ended");
    setEnding(false);
  }, [sessionId]);

  // Tear down the call if the user navigates away.
  useEffect(() => {
    return () => clientRef.current?.end();
  }, []);

  if (screen === "idle") {
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
            You'll speak with Crackk AI. Find a quiet spot — your browser will
            ask for microphone permission when you join. Speak naturally; pause
            when you're done and the interviewer will respond.
          </p>
          <p className="mx-auto mt-3 flex max-w-sm items-center justify-center gap-1.5 text-sm text-amber-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-4 shrink-0"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Stay on this tab — reloading or leaving during the interview will
            end it.
          </p>
          {err && (
            <div className="mt-5 text-left">
              <Alert>{err}</Alert>
            </div>
          )}
          <Button
            onClick={begin}
            disabled={joining}
            className="mt-6 px-6 py-3 text-base"
          >
            {joining ? (
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

  if (screen === "ended") {
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
            onClick={() => {
              window.location.href = `/${sessionId}/report`;
            }}
            className="mt-6 px-6 py-3 text-base"
          >
            View my report →
          </Button>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <CallStage
        sessionId={sessionId}
        phase={phase}
        captions={captions}
        analyser={analyser}
        muted={muted}
        onToggleMute={toggleMute}
        ending={ending}
        onEnd={end}
        err={err}
      />
    </Shell>
  );
}
