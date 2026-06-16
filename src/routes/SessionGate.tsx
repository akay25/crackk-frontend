import { useEffect, useState, useRef, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import type { Socket } from "socket.io-client";

// Local imports
import { getSession } from "../api/session";
import SessionGateLoading from "../components/SessionGateLoading";
import NotFound from "./NotFound";
import { gateFor } from "../utils";
import { ROUTE_KEY } from "../constants";
import { connectToWSSocket } from "../socket_io";
import { Session } from "../types/api";
import { SessionGateChildProps } from "../types";

export default function SessionGate({
  route,
  children,
}: {
  route: ROUTE_KEY;
  children: (props: SessionGateChildProps) => ReactNode;
}) {
  const { sessionId } = useParams();

  // Socket ref
  const wsRef = useRef<Socket | null>(null);
  const [connectedToSocket, setConnectedToSocket] = useState(false);
  const [isAPILoading, setIsAPILoading] = useState(false);
  const [interviewSession, setInterviewSession] = useState<Session | null>(
    null,
  );

  useEffect(() => {
    if (!sessionId) return;
    setIsAPILoading(true);
    let active = true;
    getSession(sessionId)
      .then((s) => {
        active && setInterviewSession(s);
        // Now connect to ws here
        console.log("Connecting to websocket");
        wsRef.current = connectToWSSocket(sessionId);
        setConnectedToSocket(true);
      })
      .catch((_) => {
        // TODO: Show toast that sessionId not found
      })
      .finally(() => {
        setIsAPILoading(false);
      });

    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
      active = false;
    };
  }, [sessionId]);

  // Load eff
  const eff = interviewSession
    ? { stage: interviewSession.stage, status: interviewSession.status }
    : { stage: null, status: null };

  if (isAPILoading) return <SessionGateLoading />;
  if (!sessionId || interviewSession === null) return <NotFound />;
  if (!eff.stage) return <SessionGateLoading />;

  const belongs = gateFor(eff.stage, eff.status);
  if (belongs !== route) {
    return <Navigate to={`/${sessionId}/${belongs}`} replace />;
  }

  return (
    <>{children({ socket: wsRef.current, connected: connectedToSocket })}</>
  );
}
