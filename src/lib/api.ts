// Thin FastAPI client. There is NO token: each request is authorized by the
// session_id already in the URL path (the unguessable capability). The only thing
// in localStorage is the anonymous USER id (persistent identity, never in a URL).
// Endpoints mirror the backend FastAPI routes.

const BASE = "/api";
const USER_KEY = "anon_user_id";

// The anonymous user id — generated once on first load, kept in localStorage.
// Groups a browser's sessions; sent only when creating a session.
export function getOrCreateUserId(): string {
  let id = localStorage.getItem(USER_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_KEY, id);
  }
  return id;
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, init);
}

export interface CreateSessionResponse {
  session_id: string;
  user_id: string;
  setup_url: string;
}

export interface Session {
  id: string;
  // Single combined status string, e.g. "init", "resume.running", "jd.ready",
  // "difficulty_set", "blueprint.ready", "interview.in_call", "interview.completed",
  // "report.running", "completed". Parse it with the helpers in lib/ws.ts
  // (parseStatus / reached / failedStage). The old per-stage *_status fields and the
  // draft/ready/in_call/call_ended statuses no longer exist.
  status: string;
  job_url: string | null;
  jd_source: "scraped" | "pasted" | null;
  jd_text: string | null;
  // null = not checked yet, false = rejected as non-technical, true = accepted.
  jd_is_technical: boolean | null;
  resume_is_technical: boolean | null;
  difficulty: number | null;
  target_pay: string | null;
  role_title: string | null;
  has_resume: boolean;
  has_blueprint: boolean;
}

export type Difficulty = "junior" | "mid" | "senior" | "staff";

export interface JobInput {
  job_url?: string;
  jd_text?: string;
}

export interface ConfigInput {
  difficulty: Difficulty;
  target_pay?: string;
  role_title?: string;
}

export async function createSession(): Promise<CreateSessionResponse> {
  const r = await req("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: getOrCreateUserId() }),
  });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  return r.json();
}

export async function getSession(id: string): Promise<Session> {
  const r = await req(`/sessions/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

// ---- Parsed resume profile (shape: common/schemas/parsed_profile.schema.json) ----

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

/**
 * Fetch the structured profile the resume_parser extracted from the upload, so
 * the candidate can preview/confirm it. Returns null while parsing is still in
 * flight (404) or until the endpoint is published — the Setup preview degrades
 * gracefully to a "parsing…" state in that case.
 *
 * Adds (GET /sessions/{id}/resume -> ParsedProfile); 404
 * while parsing is in flight.
 */
export async function getResumeProfile(id: string): Promise<ParsedProfile | null> {
  let r: Response;
  try {
    r = await req(`/sessions/${id}/resume`);
  } catch {
    return null; // endpoint not reachable yet — treat as "not ready"
  }
  if (r.status === 404 || r.status === 501) return null;
  if (!r.ok) throw new Error(`getResumeProfile failed: ${r.status}`);
  return r.json();
}

/** Upload resume (multipart). Returns once parsing is enqueued (202). */
export async function uploadResume(id: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const r = await req(`/sessions/${id}/resume`, { method: "POST", body: form });
  if (!r.ok) throw new Error(`uploadResume failed: ${r.status}`);
}

/** Set the job URL (enqueues a scrape) or paste the JD text directly (202). */
export async function setJob(id: string, input: JobInput): Promise<void> {
  const r = await req(`/sessions/${id}/job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`setJob failed: ${r.status}`);
}

/** Set difficulty / pay / role. Moves the session to status=ready (200). */
export async function setConfig(id: string, input: ConfigInput): Promise<void> {
  const r = await req(`/sessions/${id}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`setConfig failed: ${r.status}`);
}

/** Kick off blueprint (question_gen) generation (202). */
export async function buildBlueprint(id: string): Promise<void> {
  const r = await req(`/sessions/${id}/blueprint`, { method: "POST" });
  if (!r.ok) throw new Error(`buildBlueprint failed: ${r.status}`);
}

export interface JoinResponse {
  livekit_url: string;
  token: string;
  room: string;
}

export async function joinCall(id: string): Promise<JoinResponse> {
  const r = await req(`/sessions/${id}/join`, { method: "POST" });
  if (!r.ok) throw new Error(`joinCall failed: ${r.status}`);
  return r.json();
}

// ---- Report (shape mirrors common/schemas/report.schema.json) ----

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

/** Fetch the completed report. Returns null when not ready yet (404). */
export async function getReport(id: string): Promise<Report | null> {
  const r = await req(`/sessions/${id}/report`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`getReport failed: ${r.status}`);
  return r.json();
}
