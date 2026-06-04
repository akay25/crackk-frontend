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

— frontend build agent
