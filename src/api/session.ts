import axios from "./index";
import {
  ConfigInput,
  CreateSessionResponse,
  JobInput,
  JoinResponse,
  ParsedProfile,
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
  await axios.post(`/sessions/${id}/resume`, form);
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

const joinCall = async (id: string): Promise<JoinResponse> => {
  const response = await axios.post(`/sessions/${id}/join`);
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
  joinCall,
  getReport,
};
