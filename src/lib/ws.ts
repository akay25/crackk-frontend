// Live session status over WebSocket — replaces polling. Subscribes to
// `/ws/sessions/:id?token=…`; receives a snapshot on connect then per-stage
// deltas. Reconnects on drop. The UI reacts to a stage flipping `ready`/`failed`
// instead of polling + eating 404s.
import { useEffect, useState } from "react";
import { getToken, type StageStatus } from "./api";

export interface SessionStatuses {
  status: string;
  resume: StageStatus;
  jd: StageStatus;
  blueprint: StageStatus;
  report: StageStatus;
}

export function useSessionStatus(sessionId: string | null): SessionStatuses | null {
  const [statuses, setStatuses] = useState<SessionStatuses | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!sessionId || !token) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(
        `${proto}://${location.host}/ws/sessions/${sessionId}?token=${encodeURIComponent(token)}`,
      );
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "snapshot") {
          setStatuses({ status: m.status, resume: m.resume, jd: m.jd, blueprint: m.blueprint, report: m.report });
        } else if (m.type === "stage") {
          setStatuses((prev) => (prev ? { ...prev, [m.stage]: m.status } : prev));
        }
      };
      ws.onclose = () => {
        if (!closed) retry = window.setTimeout(connect, 1500);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [sessionId]);

  return statuses;
}
