import { LOCAL_STORAGE } from "./constants";

export function getOrCreateUserId(): string {
  let id = localStorage.getItem(LOCAL_STORAGE.USER_TOKEN);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LOCAL_STORAGE.USER_TOKEN, id);
  }
  return id;
}
