import type { Socket } from "socket.io-client";

export type SessionGateChildProps = {
  socket: Socket | null;
  connected: boolean;
};

export type SessionStatus =
  | "pending"
  | "running"
  | "ready"
  | "failed"
  | "in_call"
  | "completed";

// Live state as held in the UI: nullable so it can represent "no UPDATE / not loaded yet".
// `stage`/`status` are kept as loose strings since they arrive over the socket.
export interface SessionState {
  stage: string | null;
  status: string | null;
  reason: string | null; // human-readable note on some events
  // Overall session status carried on every UPDATE; "failed" is terminal.
  session_status: string | null;
}
