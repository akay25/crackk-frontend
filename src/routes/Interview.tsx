// Interview call screen. POST /sessions/:id/join returns the self-hosted voice-agent
// WebSocket URL; we connect the browser to it directly, capture the mic (client-side
// VAD → one WAV per turn), play the interviewer's reply audio, and stream captions.
// Route is token-guarded (magic token).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { joinCall, endCall as endCallAPI } from "../api/session";
import type { JoinResponse } from "../types/api";
import { connectToWSSocket } from "../socket_io";
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
  // A handed-off connection is single-use: after a busy/waiting round-trip its
  // ws_url may be stale, so every retry goes through joinCall again.
  const handoffRef = useRef<JoinResponse | null>(handoff);

  const [screen, setScreen] = useState<Screen>("idle");
  // The agent takes one call at a time. `waiting` = someone else is on the call
  // (we're in the FIFO queue at `queuePos`); `claimable` = /join handed us the
  // slot (reserved ~2 min) and we're showing "It's your turn — join now" so the
  // mic/audio setup still happens inside a click.
  const [waiting, setWaiting] = useState(false);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [claimable, setClaimable] = useState(false);
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  // End-of-turn countdown: ms left before the current utterance is sent (null until known).
  const [vad, setVad] = useState<{
    remainingMs: number;
    totalMs: number;
  } | null>(null);
  const [muted, setMuted] = useState(false);
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
  // tab drops the WebSocket, which ends the interview. Once the interviewer has
  // wrapped up ("completed") there's nothing left to lose, so no warning.
  useEffect(() => {
    if (screen !== "live" || phase === "completed") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // required for Chrome to show the native prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [screen, phase]);

  const begin = useCallback(async () => {
    if (!sessionId) return;
    setErr(null);
    setMuted(false);
    setJoining(true);
    try {
      const conn = handoffRef.current ?? (await joinCall(sessionId));
      handoffRef.current = null;
      if (!conn.ws_url) {
        // Another candidate is on the call — wait in line; the effect below
        // re-polls /join until the slot is ours.
        setQueuePos(conn.position ?? null);
        setClaimable(false);
        setWaiting(true);
        return;
      }
      setWaiting(false);
      setClaimable(false);
      const client = new VoiceAgentClient(conn.ws_url, {
        onPhase: (p) => {
          setPhase(p);
          // Interview wrapped up by the interviewer: reflect the forced-mute in the UI
          // (input is disabled; the candidate clicks End call to view their report).
          if (p === "completed") setMuted(true);
          if (p === "ended") setScreen("ended");
        },
        onCaptions: (c) => setCaptions(c),
        onError: (m) => setErr(m),
        onClose: () => setScreen("ended"),
        onBusy: (position) => {
          // Lost the slot race between /join and the WS connect: back to the line.
          clientRef.current = null;
          setScreen("idle");
          setQueuePos(position);
          setClaimable(false);
          setWaiting(true);
        },
        onAnalyser: (a) => setAnalyser(a),
        onVadProgress: (remainingMs, totalMs) =>
          setVad({ remainingMs, totalMs }),
      });
      clientRef.current = client;
      await client.start();
      client.setMuted(false);
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
  }, [sessionId]);

  // While waiting for the call slot, re-poll /join every 10s and listen for the
  // "call_slot_available" UPDATE over Socket.IO (whichever fires first). When /join
  // hands back a ws_url the slot is reserved for us (~2 min) — flip to "claimable"
  // and let the candidate click Join, so mic capture starts inside a user gesture.
  useEffect(() => {
    if (!waiting || claimable || !sessionId) return;
    let cancelled = false;
    let claiming = false;
    const tryClaim = async () => {
      if (claiming) return;
      claiming = true;
      try {
        const conn = await joinCall(sessionId);
        if (cancelled) return;
        if (conn.ws_url) {
          setClaimable(true);
        } else {
          setQueuePos(conn.position ?? null);
        }
      } catch {
        /* transient — keep polling */
      } finally {
        claiming = false;
      }
    };
    const iv = setInterval(tryClaim, 10_000);
    const socket = connectToWSSocket(sessionId);
    const onUpdate = (m: { reason?: string | null }) => {
      if (m?.reason === "call_slot_available") void tryClaim();
    };
    socket.on("UPDATE", onUpdate);
    return () => {
      cancelled = true;
      clearInterval(iv);
      socket.off("UPDATE", onUpdate);
      socket.disconnect();
    };
  }, [waiting, claimable, sessionId]);

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

  if (screen === "idle" && waiting) {
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
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {claimable ? (
            <>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                It's your turn!
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-slate-600">
                The interviewer is free and your spot is reserved for about two
                minutes. Join now to start your interview.
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
            </>
          ) : (
            <>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
                Waiting for your turn
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-slate-600">
                Another candidate is being interviewed right now — interviews
                run one at a time.
                {queuePos != null && (
                  <>
                    {" "}
                    You're <span className="font-semibold text-slate-900">
                      #{queuePos}
                    </span>{" "}
                    in line.
                  </>
                )}
              </p>
              <p className="mx-auto mt-3 flex max-w-sm items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner /> This page updates automatically — keep it open and
                we'll let you know the moment it's your turn.
              </p>
            </>
          )}
        </Card>
      </Shell>
    );
  }

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
        vad={vad}
        muted={muted}
        onToggleMute={toggleMute}
        ending={ending}
        onEnd={end}
        err={err}
      />
    </Shell>
  );
}
