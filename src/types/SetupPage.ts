import { Session } from "./api";
import { SessionState } from "./index";

export type StepKey = "resume" | "jd" | "config" | "match";

export interface SetupStep {
  key: StepKey;
  title: string;
}

// Order matters — it defines the stepper sequence and the route segments under /setup.
export const SETUP_STEPS: SetupStep[] = [
  { key: "resume", title: "Resume" },
  { key: "jd", title: "Job description" },
  { key: "config", title: "Configure" },
  { key: "match", title: "Eligibility" },
];

export interface SetupContextValue {
  sessionId: string;
  session: Session | null;
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
  // The resume × JD match passed (reached match.ready) — gates the final step's checkmark.
  matchEligible: boolean;
  hasBlueprint: boolean;
  doneFlags: boolean[];
  /** Index of the first not-yet-done step (last step once everything is done). */
  firstIncomplete: number;

  // Step navigation, backed by the nested routes under /setup.
  currentIndex: number;
  goToIndex: (i: number) => void;
}
