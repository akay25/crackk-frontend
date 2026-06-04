// Interview call screen. POST /sessions/:id/join mints a LiveKit token; we connect
// the browser to the SFU room with @livekit/components-react, publish the mic, play
// the agent's audio, and stream live captions. Route is token-guarded (magic token).
import { useCallback, useState } from "react";
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
import "@livekit/components-styles";
import { joinCall, type JoinResponse } from "../lib/api";

const wrap = { maxWidth: 720, margin: "3rem auto", fontFamily: "system-ui" } as const;

export default function Interview() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [conn, setConn] = useState<JoinResponse | null>(null);
  const [phase, setPhase] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [err, setErr] = useState<string | null>(null);

  const join = useCallback(async () => {
    if (!id) return;
    setErr(null);
    setPhase("connecting");
    try {
      setConn(await joinCall(id));
    } catch (e) {
      setErr(String(e));
      setPhase("idle");
    }
  }, [id]);

  if (!conn) {
    return (
      <main style={wrap}>
        <h1>Interview</h1>
        <p style={{ opacity: 0.7 }}>Session: {id}</p>
        <p>
          You'll speak with an AI interviewer. Make sure your microphone works — your
          browser will ask for permission when you join.
        </p>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
        <button onClick={join} disabled={phase === "connecting"}>
          {phase === "connecting" ? "Connecting…" : "Join the interview"}
        </button>
      </main>
    );
  }

  if (phase === "ended") {
    return (
      <main style={wrap}>
        <h1>Interview ended</h1>
        <p>Thanks — your report will be ready shortly.</p>
        <button onClick={() => navigate(`/report/${id}`)}>View report →</button>
      </main>
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
      style={{ ...wrap, display: "block" }}
    >
      <CallStage sessionId={id} err={err} />
      {/* Plays the interviewer's audio into the page. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function CallStage({ sessionId, err }: { sessionId?: string; err: string | null }) {
  const room = useRoomContext();
  const { state } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  return (
    <div>
      <h1>Interview</h1>
      <p style={{ opacity: 0.7 }}>
        Session: {sessionId} · interviewer is <strong>{state}</strong> · mic{" "}
        {isMicrophoneEnabled ? "on" : "off"}
      </p>
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <Captions localIdentity={localParticipant.identity} />

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
        {/* Mic mute/unmute (and audio device picker) from LiveKit. */}
        <VoiceAssistantControlBar controls={{ leave: false }} />
        <button
          onClick={() => room.disconnect()}
          style={{
            background: "crimson",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            cursor: "pointer",
          }}
        >
          End call
        </button>
      </div>
    </div>
  );
}

function Captions({ localIdentity }: { localIdentity: string }) {
  const transcriptions = useTranscriptions();

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: "1rem",
        height: 320,
        overflowY: "auto",
        background: "#fafafa",
      }}
    >
      {transcriptions.length === 0 ? (
        <p style={{ opacity: 0.5, margin: 0 }}>Live captions will appear here…</p>
      ) : (
        transcriptions.map((seg, i) => {
          const isYou = seg.participantInfo.identity === localIdentity;
          return (
            <p key={i} style={{ margin: "0 0 .6rem" }}>
              <strong style={{ color: isYou ? "#2563eb" : "#7c3aed" }}>
                {isYou ? "You" : "Interviewer"}:
              </strong>{" "}
              {seg.text}
            </p>
          );
        })
      )}
    </div>
  );
}
