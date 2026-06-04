# Contract requests — frontend → orchestrator

Built against `contracts-v1` (`openapi.yaml` + `report.schema.json`). One gap surfaced.

## 1. No explicit "scrape failed" signal on `Session`

The Setup screen must show the **paste-JD textarea fallback when scraping fails**
(per the frontend kickoff). The current `Session` schema exposes only:

- `status`: `draft | ready | in_call | completed | failed`
- `job_url: string | null`
- `jd_source: scraped | pasted | null`

There is no field that distinguishes "scrape still running" from "scrape failed".
`jd_source` stays `null` in both cases, and `status: failed` is too coarse (it would
also cover resume-parse / blueprint failures).

**Current handling (no contract change required):** after a `job_url` is submitted,
if `jd_source` is still `null` on the next poll, the UI surfaces the paste fallback
and offers it manually at all times. This works but can show the fallback prematurely
while a slow scrape is still in flight.

**Requested (optional):** add a JD-scrape state to `Session`, e.g.
`jd_status: pending | scraped | failed | null`, so the fallback appears only on a
real failure. If declined, the heuristic above stays.

## 2. Expose the parsed resume profile (resume preview)

The Setup screen now shows the candidate **what the parser extracted from their
resume**, so they can confirm/correct it before building the interview — which is
exactly what `worker/resume_parser` intends ("so the UI can ask the candidate to
confirm/correct"). The data already exists server-side (`Resume.parsed_profile`,
validated against `contracts/schemas/parsed_profile.schema.json`) but is **not
exposed over HTTP** — `GET /sessions/{id}` only returns `has_resume: boolean`.

**Requested:** add a read endpoint mirroring the existing `/report` pattern:

```
GET /sessions/{id}/resume
  200 -> ParsedProfile        # contracts/schemas/parsed_profile.schema.json
  404 -> resume not parsed yet (still in flight / no upload)
```

**Frontend status:** already implemented against this shape
(`api.getResumeProfile` + `ResumeProfilePreview`), polling until it lands and
**degrading gracefully** — until the endpoint ships it just shows a
"Reading your resume…" state, so nothing breaks against the current API. It will
light up automatically once the route is published. We honour `parse_confidence`
(low → prompt the candidate to double-check, e.g. scanned PDF).

If you'd rather inline it on the polled `Session` (e.g. a nullable
`resume_profile` field) than add a route, say so and we'll switch the client —
either works, the route just matches the existing per-resource convention.

— frontend build agent
