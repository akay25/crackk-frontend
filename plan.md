# Frontend — AI Interviewer (React + Vite SPA)

A thin single-page app. A job-seeker uploads a resume + the job posting and picks
difficulty / pay / role; the backend generates a **tailored interview**, an **AI
voice agent conducts a live browser call** (LiveKit / WebRTC), and the app shows a
**detailed, evidence-based report**. No SSR — the only reason JS runs here is the
in-browser WebRTC call. The static build can be served by any CDN or by FastAPI.

## Stack
React 18 + **Vite** + **React Router** + **Tailwind v4** (`@tailwindcss/vite`, no config files)
+ **`@livekit/components-react`** for the call screen.

## Routes (`session_id` is in the path)
- `/` — **Start**: mints a session, shows the private return link.
- `/:sessionId/setup` — upload resume, job URL / paste-JD fallback, difficulty/pay/role, build interview.
- `/:sessionId/interview` — LiveKit call screen (mic, live captions, end call).
- `/:sessionId/report` — overall + per-competency scores, strengths, improvements, verbatim evidence.

No route guard: the `session_id` in the path is the capability; pages handle a 404 if it isn't real.

## Identity & auth (no token)
- On first load, a random **`user_id`** (UUID) is generated and stored in **localStorage** — the
  persistent **anonymous identity**, which **never appears in a URL**. See `getOrCreateUserId()` in `lib/api.ts`.
- **Start a new interview** → `POST /sessions {user_id}` → returns a `session_id`. The
  **`session_id` is the capability**: it lives in the URL path and grants access to that one
  session (the API returns 404 if it's unknown). **No token, no `Authorization` header.**
- The session URL (`/:sessionId/…`) is how a candidate returns to — or shares — one interview.

## Data flow
- **`lib/api.ts`** — typed REST client. Calls hit `/api/*` (Vite proxies → `:8000`). The
  `session_id` in the path is the auth; no auth header is sent.
- **`lib/ws.ts`** — `useSessionStatus(sessionId)` opens **`WS /ws/sessions/:id`**, receives a
  snapshot then live **per-stage status** deltas, and reconnects on drop. **This replaces polling.**
  Per-stage statuses: `resume / jd / blueprint / report ∈ pending|running|ready|failed`.
  - **Setup** fetches the parsed-resume preview when `resume_status` flips `ready`; surfaces the
    paste-JD fallback when `jd_status` is `failed`.
  - **Report** fetches the report when `report_status` flips `ready`. No 404-polling anywhere.
- **`lib/livekit.ts`** — joins the LiveKit room with the token from `POST /sessions/:id/join`.

## Layout
```
frontend/
├── vite.config.ts        # dev :5173; proxies /api (REST) + /ws (WebSocket) → :8000
└── src/
    ├── main.tsx          # Router setup; generates the user_id on load
    ├── routes/{Start,Setup,Interview,Report}.tsx
    ├── components/{ui.tsx, ResumeProfilePreview.tsx}
    └── lib/{api.ts, ws.ts, livekit.ts}
```

## Run
- Bring up the backend: API on `:8000` (uvicorn) + Celery worker + (optional) agent + infra.
- `npm install` then `npm run dev` → http://localhost:5173. `npm run build` = clean static build.

## Deps
`react`, `react-dom`, `react-router-dom`, `@livekit/components-react`, `@livekit/components-styles`,
`livekit-client`; dev: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`.
