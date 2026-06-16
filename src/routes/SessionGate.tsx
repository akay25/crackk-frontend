import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getSession } from "../api/session";
import { parseStatus, useSessionStatus } from "../lib/socket";
import SessionGateLoading from "../components/SessionGateLoading";
import NotFound from "./NotFound";
import { gateFor } from "../utils";
import { ROUTE_KEY } from "../constants";
import { connectToWSSocket } from "../socket_io";

export default function SessionGate({
  route,
  children,
}: {
  route: ROUTE_KEY;
  children: ReactNode;
}) {
  const { sessionId } = useParams();

  // Connect to ws here,
  // Pass the socket to child event for their respective events
  const wsConn = connectToWSSocket(sessionId ?? "");

  const live = useSessionStatus(sessionId ?? null);
  const [seed, setSeed] = useState<string | null>(null);
  const [seedNotFound, setSeedNotFound] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getSession(sessionId)
      .then((s) => active && setSeed(s.status))
      .catch((e) => {
        console.log("this is seed: %o", seed);
        if (active && String(e).includes("404")) setSeedNotFound(true);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  // Effective state: the live event when present, otherwise the REST seed parsed back
  // into { stage, status }.
  const eff = live.stage ? live : parseStatus(seed);

  // Unknown session (the REST seed 404'd) — same page as any other unmatched route.
  if (!sessionId || seedNotFound) return <NotFound />;
  if (!eff.stage) return <SessionGateLoading />;

  const belongs = gateFor(eff.stage, eff.status);
  if (belongs !== route) {
    return <Navigate to={`/${sessionId}/${belongs}`} replace />;
  }

  // return <>{children}</>;
  return <div>hello world</div>;
}
