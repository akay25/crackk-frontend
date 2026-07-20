// Overall session status (SessionStatus on the backend). "failed" is terminal — the
// session cannot advance any further (e.g. blocked by the conflict-of-interest gate),
// and `failed_reason` carries the human-readable message.
export type SessionOverallStatus = "init" | "in_progress" | "completed" | "failed";

export interface Session {
  id: string;
  status: string;
  // Overall, session-level status; "failed" (+ failed_reason) is terminal.
  session_status: SessionOverallStatus;
  failed_reason: string | null;
  job_url: string | null;
  jd_source: "scraped" | "pasted" | null;
  jd_text: string | null;
  stage: SessionStage;
  // null = not checked yet, false = rejected as non-technical, true = accepted.
  jd_is_technical: boolean | null;
  resume_is_technical: boolean | null;
  difficulty: number | null;
  target_pay: string | null;
  role_title: string | null;
  has_resume: boolean;
  // Resume × JD match score (0–100), null until the match stage runs.
  match_score: number | null;
  has_blueprint: boolean;
}

export interface CreateSessionResponse {
  session_id: string;
  user_id: string;
  setup_url: string;
}

export type SessionStage =
  | "init"
  | "resume"
  | "jd"
  | "difficulty_set"
  | "match"
  | "blueprint"
  | "interview"
  | "report"
  | "completed";
export type Role = "junior" | "mid" | "senior" | "staff";

export interface JobInput {
  job_url?: string;
  jd_text?: string;
}

export interface ConfigInput {
  target_pay?: string;
  role_title: Role;
}

export interface ExperienceItem {
  title: string;
  company: string;
  start?: string;
  end?: string;
  highlights?: string[];
}

export interface EducationItem {
  degree?: string;
  institution?: string;
  year?: string;
}

export interface ParsedProfile {
  summary: string;
  total_years_experience?: number;
  skills: string[];
  experience: ExperienceItem[];
  education?: EducationItem[];
  projects?: string[];
  gaps?: string[];
  parse_confidence?: "high" | "medium" | "low";
}

// ---- Resume × JD match (eligibility gate before the blueprint) ----

export interface MatchDimension {
  name: string; // e.g. "core_skills" — humanized for display
  score: number; // 0–100
  weight: number; // contribution to the overall score, as a percentage
  rationale: string;
}

export interface MatchResult {
  overall_score: number; // 0–100
  dimensions: MatchDimension[];
  summary: string;
  verdict: "strong" | "moderate" | "weak" | null;
  threshold: number; // pass cutoff — use this, never hardcode
  eligible: boolean; // overall_score >= threshold
}

// 202 response from POST /sessions/:id/match.
export interface MatchTriggerResponse {
  status: string;
  task_id: string;
}

// The agent takes ONE live call at a time. "ready": ws_url is set — the browser opens
// that WebSocket directly against the self-hosted voice agent (backend agent/server.py;
// the session_id in the path is the capability) and the slot is reserved for ~2 minutes.
// "waiting": another candidate is on the call and this session is number `position` in
// the FIFO queue — re-poll /join (and watch for the UPDATE event with
// reason="call_slot_available") until ready.
export interface JoinResponse {
  status: "ready" | "waiting";
  ws_url: string | null;
  session_id: string;
  position: number | null;
}

export interface EndCallResponse {
  status: string;
  signalled: boolean;
}

export interface CompetencyScore {
  key: string;
  score: number;
  rationale?: string;
  evidence_quotes: string[];
}

export interface Improvement {
  area: string;
  why: string;
  how?: string;
}

export interface Report {
  overall_score: number;
  per_competency: CompetencyScore[];
  strengths: string[];
  improvements: Improvement[];
  recommendations: string;
}
