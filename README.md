# Crackk AI — Frontend

A thin React + Vite single-page app for an AI-conducted technical interview.

A job-seeker uploads a resume and the job posting and picks difficulty / pay / role.
The backend generates a **tailored interview**, an **AI voice agent conducts a live
browser call** (LiveKit / WebRTC), and the app shows a **detailed, evidence-based
report**. There is no SSR — JS runs here only for the in-browser WebRTC call. The
static build can be served by any CDN or by the FastAPI backend.

## Stack

- **React 18** + **React Router 6** (`createBrowserRouter`)
- **Vite 5** build + dev server (`@vitejs/plugin-react`)
- **Tailwind v4** via `@tailwindcss/vite` (no config files)
- **`@livekit/components-react`** + `livekit-client` for the call screen
- **axios** REST client, **socket.io-client** for the live status stream
- **pdfjs-dist** for in-browser resume/report PDF preview

## Routes

`session_id` lives in the URL path — there is **no auth guard**. The `session_id`
*is* the capability; the API returns 404 if it isn't a real session. `SessionGate`
wraps the session routes: it subscribes to the live combined status and steers the
user to the correct stage, redirecting URL tampering (a finished interview can't be
reopened or rewound) and showing a not-found screen when the socket closes 4404.

- `/` — **Start**: mints a session and shows the private return link.
- `/:sessionId/setup` — nested **stepper** (`SetupLayout` holds shared state):
  - `resume` — upload resume (PDF preview)
  - `jd` — job URL, with a paste-JD fallback
  - `config` — difficulty / pay / role
  - `match` — eligibility / match result before building the interview
- `/:sessionId/interview` — LiveKit call screen (mic, live captions, end call).
- `/:sessionId/report` — overall + per-competency scores, strengths, improvements,
  verbatim evidence, PDF download.
- `*` — 404 page.

## Identity & auth (tokenless)

- On first load, `getOrCreateUserId()` (`src/utils.ts`) generates a random anonymous
  **`user_id`** and persists it in **localStorage** under the key `user_token`
  (`LOCAL_STORAGE.USER_TOKEN`). This identity **never appears in a URL**.
- **Start a new interview** → `POST /sessions {user_id}` → returns a `session_id`.
  The **`session_id` is the capability**: it lives in the URL path and grants access
  to that one session. **No token, no `Authorization` header** is sent — the axios
  request interceptor in `src/api/index.ts` has the token logic stubbed out.
- The session URL (`/:sessionId/…`) is how a candidate returns to — or shares — one
  interview.

## Data flow

- **`src/api/`** — typed axios REST client. Requests hit `/api/*`; Vite rewrites
  `/api` → backend root and proxies to `:8000`. The `session_id` in the path is the
  auth.
- **`src/socket_io/`** — Socket.IO client for the live status stream. It receives an
  initial snapshot then live per-stage status deltas and reconnects on drop. **This
  replaces polling** — `SessionGate` drives routing off the combined status, Setup
  reacts when `resume` / `jd` flip ready/failed, and Report fetches once `report`
  is ready.
- **`src/lib/livekit.ts`** — joins the LiveKit room with the token from the join call.

## Layout

```
frontend/
├── vite.config.ts          # dev :5173; proxies /api (REST) + /socket.io (WS) → :8000
├── index.html
└── src/
    ├── main.tsx            # router setup; generates the user_id on load
    ├── constants.ts        # localStorage keys, route keys, report placeholders
    ├── utils.ts            # getOrCreateUserId(), helpers
    ├── api/                # axios instance + session endpoints
    ├── socket_io/          # live status socket client
    ├── lib/livekit.ts      # LiveKit room join
    ├── context/            # SetupContext (shared stepper state)
    ├── routes/
    │   ├── Start.tsx
    │   ├── SessionGate.tsx
    │   ├── Interview.tsx
    │   ├── Report.tsx
    │   ├── NotFound.tsx
    │   └── setup/{SetupLayout,ResumeStep,JdStep,ConfigStep,MatchStep}.tsx
    ├── components/         # CallStage, Captions, ReportView, ScoreRing, PdfPreview, …
    └── types/             # shared TS types (api.ts, SetupPage.ts, …)
```

## Run

The frontend needs the backend running: API on `:8000` (uvicorn) + Celery worker +
(optional) LiveKit agent + infra.

```bash
npm install
npm run dev        # → http://localhost:5173
```

## Scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Vite dev server on :5173 (proxies to :8000)   |
| `npm run build`   | `tsc -b` typecheck + clean static build       |
| `npm run preview` | Serve the production build locally            |
| `npm run lint`    | `tsc --noEmit` typecheck only                 |
