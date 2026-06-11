// Live session status over WebSocket. The backend exposes a SINGLE combined status
// string (e.g. "init", "resume.running", "jd.ready", "blueprint.ready",
// "interview.in_call", "interview.completed", "report.running", "completed") plus an
// optional failure `reason`. We connect to /ws/sessions/:id (no token, no params —
// the session_id in the path is the capability), take the `snapshot` as the
// authoritative current state on every (re)connect, then apply each `status` event on
// top. Close code 4404 means the session doesn't exist (don't reconnect → 404 UI).
import { useEffect, useState } from "react";

export interface LiveStatus {
  /** Combined status string, or null until the first snapshot arrives. */
  status: string | null;
  /** Machine code carried on some failures (e.g. "not_technical"). Optional. */
  reason: string | null;
  /** Server closed with code 4404 — the session was not found. */
  notFound: boolean;
}

// Custom close code the server uses for an unknown session.
const WS_NOT_FOUND = 4404;

export function useSessionStatus(sessionId: string | null): LiveStatus {
  const [state, setState] = useState<LiveStatus>({ status: null, reason: null, notFound: false });

  useEffect(() => {
    if (!sessionId) return;

    let ws: WebSocket | null = null;
    let closed = false;
    let retry: number | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      // No token — the session_id is the capability.
      ws = new WebSocket(`${proto}://${location.host}/ws/sessions/${sessionId}`);
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        // Both snapshot and status carry the full combined status; snapshot is a
        // complete reset of current state, status is an incremental change.
        if (m.type === "snapshot") {
          setState({ status: m.status, reason: null, notFound: false });
        } else if (m.type === "status") {
          setState({ status: m.status, reason: m.reason ?? null, notFound: false });
        }
      };
      ws.onclose = (e) => {
        if (closed) return;
        if (e.code === WS_NOT_FOUND) {
          // Session doesn't exist — surface 404 and do NOT reconnect.
          setState({ status: null, reason: null, notFound: true });
          return;
        }
        retry = window.setTimeout(connect, 1500);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [sessionId]);

  return state;
}

// ---- Pure helpers over the combined status string ----
//
// `status` is either a bare stage ("init", "difficulty_set", "completed") or a
// "<stage>.<sub>" pair. Parse generically; never hardcode the full vocabulary.

export interface ParsedStatus {
  stage: string;
  sub: string | null;
}

export function parseStatus(status: string | null | undefined): ParsedStatus {
  if (!status) return { stage: "", sub: null };
  const dot = status.indexOf(".");
  if (dot === -1) return { stage: status, sub: null };
  return { stage: status.slice(0, dot), sub: status.slice(dot + 1) };
}

// Monotonic position along the happy path so we can ask "have we reached/passed X?".
// Each stage has a base; substatuses add a small offset where ready/completed = done.
const STAGE_BASE: Record<string, number> = {
  init: 0,
  resume: 10,
  jd: 20,
  difficulty_set: 30,
  blueprint: 40,
  interview: 50,
  report: 60,
  completed: 70,
};
const SUB_OFFSET: Record<string, number> = {
  pending: 0,
  running: 1,
  failed: 1, // a failure sits "in" its stage — not past the ready boundary
  ready: 2,
  in_call: 3, // interview: ready → in_call → completed
  completed: 4,
};

/** Linear progress value for a status; -1 for unknown/empty. */
export function statusProgress(status: string | null | undefined): number {
  const { stage, sub } = parseStatus(status);
  const base = STAGE_BASE[stage];
  if (base === undefined) return -1;
  return base + (sub ? (SUB_OFFSET[sub] ?? 0) : 0);
}

/** True when the session has reached or passed `target` on the happy path. */
export function reached(status: string | null | undefined, target: string): boolean {
  const p = statusProgress(status);
  return p >= 0 && p >= statusProgress(target);
}

/** The stage that has failed (e.g. "resume" for "resume.failed"), or null. */
export function failedStage(status: string | null | undefined): string | null {
  const { stage, sub } = parseStatus(status);
  return sub === "failed" ? stage : null;
}
