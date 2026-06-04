// Thin FastAPI client. The anonymous magic_token (also the user id) is read from
// the URL (?token=) or localStorage and sent as a Bearer header on every call.
// Endpoints mirror backend/contracts/openapi.yaml (contracts-v2).

const BASE = "/api";
const TOKEN_KEY = "magic_token";
const SESSION_KEY = "session_id";

export function getToken(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

// The current session id is remembered so later screens (and a fresh tab opened
// from the magic link) know which session is in flight.
export function getSessionId(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSessionId(id: string) {
  localStorage.setItem(SESSION_KEY, id);
}

/** Raised when a token-guarded call is rejected for missing/invalid auth. */
export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  if (r.status === 401 || r.status === 403) throw new UnauthorizedError();
  return r;
}

export interface CreateSessionResponse {
  session_id: string;
  magic_token: string;
  setup_url: string;
}

export type StageStatus = "pending" | "running" | "ready" | "failed";

export interface Session {
  id: string;
  status: "draft" | "ready" | "in_call" | "completed" | "failed";
  job_url: string | null;
  jd_source: "scraped" | "pasted" | null;
  difficulty: "junior" | "mid" | "senior" | "staff" | null;
  target_pay: string | null;
  role_title: string | null;
  has_resume: boolean;
  has_blueprint: boolean;
  // per-stage status — streamed live over the WebSocket (see lib/ws.ts)
  resume_status: StageStatus;
  jd_status: StageStatus;
  blueprint_status: StageStatus;
  report_status: StageStatus;
}

export type Difficulty = NonNullable<Session["difficulty"]>;

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
  const r = await req("/sessions", { method: "POST" });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  const data: CreateSessionResponse = await r.json();
  setToken(data.magic_token);
  setSessionId(data.session_id);
  return data;
}

export async function getSession(id: string): Promise<Session> {
  const r = await req(`/sessions/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

// ---- Parsed resume profile (shape: contracts/schemas/parsed_profile.schema.json) ----

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
 * Published in contracts-v2 (GET /sessions/{id}/resume -> ParsedProfile); 404
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

// ---- Report (shape mirrors contracts/schemas/report.schema.json) ----

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
