import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { SessionState } from "../types";

// Open a Socket.IO connection for a session. The session_id is the credential, sent as
// the `token` query param (the backend reads `?token=`). Same origin → Vite proxies
// /socket.io to the backend in dev; FastAPI serves it same-origin in prod.
export const connectToWSSocket = (sessionId: string): Socket => {
  return io({
    path: "/socket.io",
    transports: ["websocket"],
    autoConnect: true,
    query: { token: sessionId },
  });
};

const EMPTY: SessionState = {
  stage: null,
  status: null,
  reason: null,
  session_status: null,
};

// Server → client `UPDATE` payload: { session_id, stage, status, reason, session_status }
// — stage and status are SEPARATE fields (the event's native shape), not a combined
// string. `session_status` is the overall session status ("failed" is terminal).
interface UpdateEvent {
  session_id?: string;
  stage: string;
  status?: string | null;
  reason?: string | null;
  session_status?: string | null;
}

/** Subscribe to a socket's live session status. Returns the latest UPDATE payload. */
export function useLiveStatus(socket: Socket | null): SessionState {
  const [state, setState] = useState<SessionState>(EMPTY);

  useEffect(() => {
    if (!socket) return;
    function onUpdate(m: UpdateEvent) {
      setState({
        stage: m.stage,
        status: m.status ?? null,
        reason: m.reason ?? null,
        session_status: m.session_status ?? null,
      });
    }
    socket.on("UPDATE", onUpdate);
    return () => {
      socket.off("UPDATE", onUpdate);
    };
  }, [socket]);

  return state;
}
