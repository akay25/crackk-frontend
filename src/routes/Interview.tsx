// Interview call screen (skeleton for the M2 agent build): joins the LiveKit room
// from POST /sessions/:id/join and connects the mic. UI to be built out.
import { useParams } from "react-router-dom";

export default function Interview() {
  const { id } = useParams();
  return (
    <main style={{ maxWidth: 640, margin: "3rem auto", fontFamily: "system-ui" }}>
      <h1>Interview</h1>
      <p>Session: {id}</p>
      <p style={{ opacity: 0.6 }}>
        Skeleton — connects to LiveKit via lib/livekit.ts and joinCall(). The agent
        build wires the live call UI (captions, mic state, end-call).
      </p>
    </main>
  );
}
