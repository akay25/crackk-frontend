import axios from "./index";
import {
  ConfigInput,
  CreateSessionResponse,
  EndCallResponse,
  JobInput,
  JoinResponse,
  MatchResult,
  MatchTriggerResponse,
  ParsedProfile,
  Report,
  Session,
} from "../types/api";
import { getOrCreateUserId } from "../utils";

const createSession = async (): Promise<CreateSessionResponse> => {
  const response = await axios.post("/sessions", {
    user_id: getOrCreateUserId(),
  });
  return response.data;
};

const getSession = async (id: string): Promise<Session> => {
  const response = await axios.get(`/sessions/${id}`);
  return response.data;
};

const getResumeProfile = async (id: string): Promise<ParsedProfile | null> => {
  try {
    const response = await axios.get(`/sessions/${id}/resume`);
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 404 || err.response?.status === 501)
      return null;
    throw err;
  }
};

const uploadResume = async (id: string, file: File): Promise<void> => {
  const form = new FormData();
  form.append("file", file);
  // Override the instance's default application/json content type. Otherwise axios
  // serializes the FormData to JSON; setting multipart here makes axios send the raw
  // FormData and lets the browser add the multipart boundary (else the API 422s).
  await axios.post(`/sessions/${id}/resume`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

const setJob = async (id: string, input: JobInput): Promise<void> => {
  await axios.post(`/sessions/${id}/job`, input);
};

const setConfig = async (id: string, input: ConfigInput): Promise<void> => {
  await axios.post(`/sessions/${id}/config`, input);
};

const buildBlueprint = async (id: string): Promise<void> => {
  await axios.post(`/sessions/${id}/blueprint`);
};

// Trigger the resume × JD match (202 Accepted). Runs once per session; the backend
// auto-builds the blueprint on a passing score. Callers handle 409 (already run / in
// progress) and 400 (wrong stage) from the thrown AxiosError.
const triggerMatch = async (id: string): Promise<MatchTriggerResponse> => {
  const response = await axios.post(`/sessions/${id}/match`);
  return response.data;
};

// Fetch the score + breakdown once the stage reaches match.ready or match.failed.
// Returns null while the match hasn't produced a row yet (404). A 500 is the task
// itself erroring (no score) — rethrown so the caller can offer a retry.
const getMatch = async (id: string): Promise<MatchResult | null> => {
  try {
    const response = await axios.get(`/sessions/${id}/match`);
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

const joinCall = async (id: string): Promise<JoinResponse> => {
  const response = await axios.post(`/sessions/${id}/join`);
  return response.data;
};

const endCall = async (id: string): Promise<EndCallResponse> => {
  const response = await axios.post(`/sessions/${id}/end-call`);
  return response.data;
};

const getReport = async (id: string): Promise<Report | null> => {
  try {
    const response = await axios.get(`/sessions/${id}/report`);
    return response.data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
};

export {
  createSession,
  getSession,
  getResumeProfile,
  uploadResume,
  setJob,
  setConfig,
  buildBlueprint,
  triggerMatch,
  getMatch,
  joinCall,
  endCall,
  getReport,
};
