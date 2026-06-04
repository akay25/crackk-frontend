# `frontend/` — React + Vite SPA

A **thin** client. Three screens, client-side routing, no SSR. The only reason JS exists here is
that the WebRTC client + LiveKit room connection must run in the browser. The static build can be
served by a CDN or by FastAPI.

See the [root plan](../plan.md) for the full architecture.

## Why React + Vite (not Next.js)
This is a logged-in app with no SEO/marketing pages, so server rendering would be unused weight.
Plain SPA + **React Router** for `/setup`, `/interview/:id`, `/report/:id`.

## Layout
```
frontend/
├── index.html
├── vite.config.ts
└── src/
    ├── main.tsx          # React Router setup; token-guarded routes
    ├── routes/
    │   ├── Setup.tsx     # /setup        upload resume + JD link + difficulty/pay
    │   ├── Interview.tsx # /interview/:id  LiveKit call screen
    │   └── Report.tsx    # /report/:id     report view
    ├── lib/api.ts        # FastAPI client (carries magic_token on every call)
    ├── lib/livekit.ts    # room connect helpers (@livekit/components-react)
    └── __tests__/
```

## Screens
- **Setup** — drag-drop resume upload; job-URL field; on scrape failure show a **paste-JD** textarea
  fallback; difficulty / target pay / role selectors; "Start interview" button. Polls session status.
- **Interview** — connects to the LiveKit room with the token from `POST /sessions/{id}/join`; mic
  permission, live captions/transcript, agent audio, end-call control.
- **Report** — renders overall + per-competency scores, strengths, areas to improve, evidence quotes,
  recommendations.

## Auth
- The **magic_token** (from the link the API shows on screen) is the only credential. `lib/api.ts`
  attaches it to every request; routes are guarded by presence/validity of the token. No login UI.

## Deps
`react`, `react-dom`, `react-router-dom`, `@livekit/components-react`, `livekit-client`, `vite`.

## Verification
- Full UI loop on a sample candidate: setup → join call → view report.
- Scrape-failure path surfaces the paste-JD textarea; missing token blocks the guarded routes.
