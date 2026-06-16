import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";

export const socket: Socket = io({
  path: "/socket.io",
  transports: ["websocket"],
  autoConnect: false,
});

// (Re)connect with the session_id as the token (the backend reads `?token=`). Idempotent:
// a no-op when already connected for this session.
export function connectSocket(sessionId: string) {
  const query = socket.io.opts.query as { token?: string } | undefined;
  if (socket.connected && query?.token === sessionId) return;
  socket.io.opts.query = { token: sessionId };
  socket.disconnect();
  socket.connect();
}

// The live UPDATE payload, with stage and status as SEPARATE fields (its native shape).
export interface SessionState {
  stage: string | null; // init | resume | jd | difficulty_set | blueprint | interview | report | completed
  status: string | null; // pending | running | ready | failed (interview: in_call | completed)
  reason: string | null; // human-readable note on some events
}

const EMPTY: SessionState = { stage: null, status: null, reason: null };

/** Subscribe to a session's live status. Returns the latest UPDATE + connection state. */
export function useSessionStatus(sessionId: string | null) {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [state, setState] = useState<SessionState>(EMPTY);

  useEffect(() => {
    if (!sessionId) return;
    connectSocket(sessionId);

    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }
    function onUpdate(m: {
      stage: string;
      status?: string | null;
      reason?: string | null;
    }) {
      console.log("Update event occured: %o", m);
      setState({
        stage: m.stage,
        status: m.status ?? null,
        reason: m.reason ?? null,
      });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("UPDATE", onUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("UPDATE", onUpdate);
    };
  }, [sessionId]);

  return { isConnected, ...state };
}

/** Just the connect/disconnect signal — for the header indicator (no session needed). */
export function useSocketConnected() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);
  return isConnected;
}

export interface StagePair {
  stage: string | null;
  status: string | null;
}

export function parseStatus(combined: string | null | undefined): StagePair {
  if (!combined) return { stage: null, status: null };
  const dot = combined.indexOf(".");
  if (dot === -1) return { stage: combined, status: null };
  return { stage: combined.slice(0, dot), status: combined.slice(dot + 1) };
}

// Happy-path order of stages, and how far each sub-status sits within a stage.
const STAGE_ORDER = [
  "init",
  "resume",
  "jd",
  "difficulty_set",
  "blueprint",
  "interview",
  "report",
  "completed",
];
const SUB_RANK: Record<string, number> = {
  pending: 0,
  running: 1,
  failed: 1,
  ready: 2,
  in_call: 3,
  completed: 4,
};

function rank(stage: string | null, status: string | null): number {
  const i = STAGE_ORDER.indexOf(stage ?? "");
  if (i === -1) return -1;
  return i * 10 + (status ? (SUB_RANK[status] ?? 0) : 0);
}

/** True when `s` has reached or passed `target` (e.g. "resume.ready") on the happy path. */
export function reached(
  s: StagePair | null | undefined,
  target: string,
): boolean {
  if (!s?.stage) return false;
  const t = parseStatus(target);
  return rank(s.stage, s.status) >= rank(t.stage, t.status);
}

/** The stage that has failed (e.g. "resume" when status === "failed"), or null. */
export function failedStage(s: StagePair | null | undefined): string | null {
  return s?.status === "failed" ? s.stage : null;
}
