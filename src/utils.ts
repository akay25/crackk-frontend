import { LOCAL_STORAGE, ROUTE_KEY } from "./constants";

export function getOrCreateUserId(): string {
  let id = localStorage.getItem(LOCAL_STORAGE.USER_TOKEN);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_STORAGE.USER_TOKEN, id);
  }
  return id;
}

export function gateFor(stage: string, status: string | null): ROUTE_KEY {
  // Map a (stage, status) pair to the single page the user belongs on:
  //   - init / resume.* / jd.* / difficulty_set / blueprint.*  → setup only
  //   - interview.ready / interview.in_call                    → interview only
  //   - interview.completed / interview.failed / report.* / completed → report only
  // The candidate can't sidestep this by editing the URL.

  // Report zone: the report stage, the terminal "completed", or the interview having
  // finished/failed (report building, or no report possible).
  if (
    stage === "report" ||
    stage === "completed" ||
    (stage === "interview" && (status === "completed" || status === "failed"))
  ) {
    return "report";
  }

  // Interview zone: at the interview stage, ready to start or in a live call.
  if (stage === "interview" && (status === "ready" || status === "in_call")) {
    return "interview";
  }

  // Everything else — init, resume.*, jd.*, difficulty_set, blueprint.* — is setup.
  return "setup";
}

// Tone + label for the small status pill, derived from the session's combined status
// string (the REST representation, kept for display).
export function statusTone(
  combined: string,
): "slate" | "green" | "amber" | "rose" {
  const { status: sub } = parseStatus(combined);
  if (sub === "failed") return "rose";
  if (combined === "completed" || sub === "ready") return "green";
  if (sub === "running" || sub === "in_call") return "amber";
  return "slate";
}

export const statusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(".", " · ");
