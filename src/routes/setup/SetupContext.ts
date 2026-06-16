// Shared state for the Setup stepper, provided by SetupLayout and consumed by each
// step route (resume / jd / config). The layout owns the session, the live status, and
// the cross-cutting "done" flags that drive the stepper header and step gating; the
// individual steps own their own local UI state (staged file, pasted text, form fields).
import { createContext, useContext } from "react";
import type { Session } from "../../lib/api";
import type { SessionState } from "../../lib/socket";

export type StepKey = "resume" | "jd" | "config";

export interface SetupStep {
  key: StepKey;
  title: string;
}

// Order matters — it defines the stepper sequence and the route segments under /setup.
export const SETUP_STEPS: SetupStep[] = [
  { key: "resume", title: "Resume" },
  { key: "jd", title: "Job description" },
  { key: "config", title: "Configure & build" },
];

export interface SetupContextValue {
  sessionId: string;
  session: Session | null;
  /** Effective live state — { stage, status, reason } — from the socket event, or the
   *  REST seed parsed when no event has arrived yet. */
  state: SessionState;
  err: string | null;
  setErr: (e: string | null) => void;
  /** Re-pull the richer session fields (called after each accepted action). */
  refresh: () => Promise<void>;

  // Cross-cutting hold owned by the layout but driven by ResumeStep: true from a
  // replacement upload until the worker re-runs, so a stale "resume.ready" doesn't
  // briefly mark the step done. Folded into `resumeReady` below.
  reparsing: boolean;
  setReparsing: (v: boolean) => void;

  // Derived happy-path "done" flags (drive the stepper checkmarks + step gating).
  resumeReady: boolean;
  jdReady: boolean;
  configDone: boolean;
  hasBlueprint: boolean;
  doneFlags: boolean[];
  /** Index of the first not-yet-done step (last step once everything is done). */
  firstIncomplete: number;

  // Step navigation, backed by the nested routes under /setup.
  currentIndex: number;
  goToIndex: (i: number) => void;
}

export const SetupContext = createContext<SetupContextValue | null>(null);

export function useSetup(): SetupContextValue {
  const ctx = useContext(SetupContext);
  if (!ctx) throw new Error("useSetup must be used within <SetupLayout>");
  return ctx;
}
