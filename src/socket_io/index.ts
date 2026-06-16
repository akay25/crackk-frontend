import { io, Socket } from "socket.io-client";

export const connectToWSSocket = (wsToken: string): Socket => {
  return io({
    path: "/socket.io",
    transports: ["websocket"],
    autoConnect: true,
    extraHeaders: {
      auth: wsToken,
    },
  });
};
