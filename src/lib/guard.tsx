// Token guard for the authenticated routes. The magic token is the only
// credential; without it there is nothing to show, so bounce back to Start.
// Reading the token also persists a ?token=... param into localStorage, which
// is how a fresh tab opened from the magic link authenticates itself.
import { Navigate } from "react-router-dom";
import { getToken } from "./api";

export default function RequireToken({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/" replace />;
  return <>{children}</>;
}
