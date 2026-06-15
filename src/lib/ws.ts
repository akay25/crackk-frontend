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
// Grace period before tearing down a socket with no listeners — absorbs React
// StrictMode's mount→unmount→remount and route transitions (e.g. SessionGate → page)
// so they reuse one socket instead of churning a new connection each time.
const CLOSE_GRACE_MS = 1000;
const RETRY_BASE_MS = 1500; // first reconnect delay; doubles each immediate failure
const RETRY_MAX_MS = 30000; // backoff ceiling
const STABLE_MS = 10000; // a connection alive this long resets the backoff

const EMPTY: LiveStatus = { status: null, reason: null, notFound: false };

// One shared connection per sessionId, fanned out to every useSessionStatus caller
// (SessionGate + the page both subscribe — without sharing that's 2+ sockets each).
interface Conn {
  ws: WebSocket | null;
  state: LiveStatus;
  listeners: Set<(s: LiveStatus) => void>;
  refs: number;
  retry?: number;
  closeTimer?: number;
  attempts: number; // consecutive failed/short-lived connects (drives backoff)
  openedAt: number; // when the current socket opened (to detect a stable connection)
}

const conns = new Map<string, Conn>();

function emit(c: Conn, next: LiveStatus) {
  c.state = next;
  c.listeners.forEach((l) => l(next));
}

function openSocket(sessionId: string, c: Conn) {
  if (c.ws) return; // already connecting/open
  const proto = location.protocol === "https:" ? "wss" : "ws";
  // No token — the session_id is the capability.
  const ws = new WebSocket(`${proto}://${location.host}/ws/sessions/${sessionId}`);
  c.ws = ws;
  c.openedAt = Date.now();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    // Both snapshot and status carry the full combined status; snapshot is a complete
    // reset of current state, status is an incremental change.
    if (m.type === "snapshot") emit(c, { status: m.status, reason: null, notFound: false });
    else if (m.type === "status") emit(c, { status: m.status, reason: m.reason ?? null, notFound: false });
  };
  ws.onclose = (e) => {
    c.ws = null;
    if (e.code === WS_NOT_FOUND) {
      // Session doesn't exist — surface 404 and do NOT reconnect.
      emit(c, { ...c.state, notFound: true });
      return;
    }
    if (c.listeners.size === 0) return; // nobody listening — don't reconnect
    // Exponential backoff so a server that closes us immediately (e.g. Redis down,
    // backend not up) isn't hammered ~every 1.5s. A connection that stayed open a
    // while resets the backoff.
    if (Date.now() - c.openedAt > STABLE_MS) c.attempts = 0;
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** c.attempts);
    c.attempts += 1;
    c.retry = window.setTimeout(() => openSocket(sessionId, c), delay);
  };
}

function subscribe(sessionId: string, listener: (s: LiveStatus) => void): () => void {
  let c = conns.get(sessionId);
  if (!c) {
    c = { ws: null, state: EMPTY, listeners: new Set(), refs: 0, attempts: 0, openedAt: 0 };
    conns.set(sessionId, c);
  }
  // A new subscriber cancels a pending teardown so the socket is reused.
  if (c.closeTimer) {
    clearTimeout(c.closeTimer);
    c.closeTimer = undefined;
  }
  c.refs += 1;
  c.listeners.add(listener);
  if (!c.ws) openSocket(sessionId, c);
  listener(c.state); // hand the late subscriber the current state immediately

  return () => {
    c!.listeners.delete(listener);
    c!.refs -= 1;
    if (c!.refs > 0) return;
    // Last listener left — defer the actual close so a quick remount reuses it.
    c!.closeTimer = window.setTimeout(() => {
      if (c!.refs > 0) return; // someone re-subscribed during the grace window
      if (c!.retry) clearTimeout(c!.retry);
      c!.ws?.close();
      conns.delete(sessionId);
    }, CLOSE_GRACE_MS);
  };
}

export function useSessionStatus(sessionId: string | null): LiveStatus {
  const [state, setState] = useState<LiveStatus>(EMPTY);

  useEffect(() => {
    if (!sessionId) {
      setState(EMPTY);
      return;
    }
    return subscribe(sessionId, setState);
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
