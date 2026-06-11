// 404 — shown for any URL that doesn't match a route (catch-all in main.tsx).
import { useNavigate } from "react-router-dom";
import { Button, Shell } from "../components/ui";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Shell>
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-6xl font-bold tracking-tight text-indigo-600">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 max-w-sm text-slate-600">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Button className="mt-6" onClick={() => navigate("/")}>
          Go to home
        </Button>
      </div>
    </Shell>
  );
}
