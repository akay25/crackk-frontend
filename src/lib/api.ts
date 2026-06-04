// Thin FastAPI client. The anonymous magic_token (also the user id) is read from
// the URL (?token=) or localStorage and sent as a Bearer header on every call.
// Endpoints mirror backend/contracts/openapi.yaml (contracts-v1).

const BASE = "/api";
const TOKEN_KEY = "magic_token";

export function getToken(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  if (fromUrl) localStorage.setItem(TOKEN_KEY, fromUrl);
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

export interface CreateSessionResponse {
  session_id: string;
  magic_token: string;
  setup_url: string;
}

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
}

export async function createSession(): Promise<CreateSessionResponse> {
  const r = await req("/sessions", { method: "POST" });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  const data: CreateSessionResponse = await r.json();
  setToken(data.magic_token);
  return data;
}

export async function getSession(id: string): Promise<Session> {
  const r = await req(`/sessions/${id}`);
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
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
