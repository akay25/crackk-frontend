import { LOCAL_STORAGE, ROUTE_KEY } from "./constants";

export function getOrCreateUserId(): string {
  let id = localStorage.getItem(LOCAL_STORAGE.USER_TOKEN);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_STORAGE.USER_TOKEN, id);
  }
  return id;
}

export function gateFor(
  stage: string,
  status: string | null,
  hasBlueprint = false,
): ROUTE_KEY {
  // Map the session's lifecycle to the single page the user belongs on. The candidate
  // can't sidestep this by editing the URL.

  // Report zone: the report stage, the terminal "completed", or the interview having
  // finished/failed (report building, or no report possible).
  if (
    stage === "report" ||
    stage === "completed" ||
    (stage === "interview" && (status === "completed" || status === "failed"))
  ) {
    return "report";
  }

  // Interview zone: already in the interview stage, OR a blueprint has been built and is
  // ready to run. Keyed on the explicit `has_blueprint` flag so this stays in lock-step
  // with SetupLayout's redirect (avoids a setup ↔ interview bounce loop).
  if (
    stage === "interview" ||
    hasBlueprint ||
    (stage === "blueprint" && status === "ready")
  ) {
    return "interview";
  }

  // Everything else — init, resume.*, jd.*, difficulty_set, blueprint.{pending,running} — is setup.
  return "setup";
}

// Tone for the small status pill, from the bare sub-status (running/ready/failed/…).
export function statusTone(
  status: string | null,
): "slate" | "green" | "amber" | "rose" {
  if (status === "failed") return "rose";
  if (status === "ready" || status === "completed") return "green";
  if (status === "running" || status === "in_call") return "amber";
  return "slate";
}

// Human-readable label for a stage + sub-status pair, e.g. "resume · running".
export const statusLabel = (stage: string | null, status: string | null) => {
  let readableStage = "";
  switch (stage) {
    case "resume":
      readableStage = "Resume";
      break;
    case "jd":
      readableStage = "Job Description";
      break;
    case "difficulty_set":
      readableStage = "Role config";
      status = "";
      break;
  }
  return [readableStage, status].filter(Boolean).join(" · ");
};

// Score → color treatment for report bars / rings / badges.
export function tone(score: number) {
  if (score >= 75)
    return {
      bar: "bg-emerald-500",
      ring: "#059669",
      badge: "bg-emerald-100 text-emerald-700",
    };
  if (score >= 50)
    return {
      bar: "bg-amber-500",
      ring: "#d97706",
      badge: "bg-amber-100 text-amber-700",
    };
  return {
    bar: "bg-red-500",
    ring: "#ef4444",
    badge: "bg-red-100 text-red-700",
  };
}

// ---- Pure helpers over a (stage, status) pair ----

export interface StagePair {
  stage: string | null;
  status: string | null;
}

/** Split a combined "<stage>.<status>" string into its parts (used for target specs). */
export function parseStatus(combined: string | null | undefined): StagePair {
  if (!combined) return { stage: null, status: null };
  const dot = combined.indexOf(".");
  if (dot === -1) return { stage: combined, status: null };
  return { stage: combined.slice(0, dot), status: combined.slice(dot + 1) };
}

// Happy-path order of stages, and how far each sub-status sits within a stage.
const STAGE_ORDER = [
  "init",
  "resume",
  "jd",
  "difficulty_set",
  "blueprint",
  "interview",
  "report",
  "completed",
];

const SUB_RANK: Record<string, number> = {
  pending: 0,
  running: 1,
  failed: 1,
  ready: 2,
  in_call: 3,
  completed: 4,
};

function rank(stage: string | null, status: string | null): number {
  const i = STAGE_ORDER.indexOf(stage ?? "");
  if (i === -1) return -1;
  return i * 10 + (status ? (SUB_RANK[status] ?? 0) : 0);
}

export function reached(
  s: StagePair | null | undefined,
  target: string,
): boolean {
  if (!s?.stage) return false;
  const t = parseStatus(target);
  return rank(s.stage, s.status) >= rank(t.stage, t.status);
}

export function failedStage(s: StagePair | null | undefined): string | null {
  if (!s) return null;
  return s.status === "failed" ? s.stage : null;
}
