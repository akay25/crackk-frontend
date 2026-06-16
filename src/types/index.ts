import type { Socket } from "socket.io-client";
import { SessionStage } from "./api";

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

export interface SessionState {
  stage: SessionStage;
  status: SessionStatus;
  reason: string | null; // human-readable note on some events
}
