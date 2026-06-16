import { useEffect, useState, type ReactNode } from "react";
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

// Lifecycle guard. Seeds the current (stage, status) from GET /sessions/:id, redirects to
// the page that matches the session's lifecycle, opens ONE Socket.IO connection for the
// session, and hands { socket, connected } to the route via a render-prop so the page can
// listen for live UPDATE events.
export default function SessionGate({
  route,
  children,
}: {
  route: ROUTE_KEY;
  children: (props: SessionGateChildProps) => ReactNode;
}) {
  const { sessionId } = useParams();

  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    let ws: Socket | null = null;
    setLoading(true);
    setNotFound(false);

    getSession(sessionId)
      .then((s) => {
        if (!active) return;
        setSession(s);
        ws = connectToWSSocket(sessionId);
        ws.on("connect", () => active && setConnected(true));
        ws.on("disconnect", () => active && setConnected(false));
        setSocket(ws);
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
      ws?.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [sessionId]);

  if (!sessionId || notFound) return <NotFound />;
  if (loading || !session) return <SessionGateLoading />;

  // Gate on the REST-seeded lifecycle (stage + bare sub-status).
  const belongs = gateFor(session.stage, session.status);
  if (belongs !== route) {
    return <Navigate to={`/${sessionId}/${belongs}`} replace />;
  }

  return <>{children({ socket, connected })}</>;
}
