import type { Socket } from "socket.io-client";

export type SessionGateChildProps = {
  socket: Socket | null;
  connected: boolean;
};
