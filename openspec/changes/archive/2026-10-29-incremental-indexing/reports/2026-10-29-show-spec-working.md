# Show Spec Working: incremental-indexing

- Date: 2026-10-29
- Change: incremental-indexing (DIS-10)
- Step: 19.3 `/show-spec-working`, run inline in the autonomous run. It reuses the live evidence of step 15 (`2026-10-29-15-manual-interface-testing.md`, Git Bash) and of its PowerShell addendum (run on 2026-10-29 after the DIS-10 r2 round), and adds a fresh run of the Postgres scenarios against the local database on 2026-10-29.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| A reindex answers 202 and invalidates the cache over the seed (http-index) | `POST /api/projects/<acme-shop id>/index` `{"incremental":false}` (curl and PowerShell) | 202, `mode` `full`, `filesQueued` 53, `filesSkipped` 0, `cacheEntriesInvalidated` 3 | yes | step 15 report, row 1; PowerShell addendum, row 1 |
| A request without a body is an incremental reindex (http-index) | curl with no body; PowerShell with `-ContentType 'application/json' -Body '{}'` | 202, `mode` `incremental`, `filesQueued` 0, `filesSkipped` 53 | yes | step 15 report, row 2; PowerShell addendum, row 3 |
| An unchanged repository takes the fast path (repository-indexing) | the same request over an unchanged copy | `indexed_at` and `indexed_commit` unchanged by `SELECT` before and after; log `durationMs` 970 / 928, no analysis | yes | step 15 report |
| A changed file is reprocessed with the whole snapshot (repository-indexing) | commit to `app/Services/PriceCalculator.php` in the copy, then `{}` | 202, `mode` `incremental`, `filesQueued` 8 (the file and 7 direct dependents), `filesSkipped` 45, `indexedCommit` the new `HEAD` | yes | step 15 report, row 3 |
| An incremental request answers the plan's counters / A reindex logs its counters without paths (http-index) | API log line `reindex completed` | `mode`, `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated`, `durationMs`; no path | yes | step 15 report; PowerShell addendum |
| The document lists index with its parameter, body and responses (http-index) | `GET /docs/json`, `GET /docs` (curl and PowerShell) | the route is listed, `/docs` 200, `mode` `{"type":"string","enum":["full","incremental"]}` | yes | step 15 report; PowerShell addendum, row 4 |
| An invalid request answers VALIDATION_ERROR (http-index) | `{"incremental":"yes"}`; `Content-Type: application/json` with an empty body | 400 `VALIDATION_ERROR`, no value echoed | yes | step 15 report, error paths |
| Unknown project (http-index) | a random UUID | 404 `PROJECT_NOT_FOUND`, details `{}` | yes | step 15 report, error paths |
| An incremental reindex over Postgres reprocesses the changed file and its direct dependents (repository-indexing) | `npx vitest run tests/integration/index/incremental-reindex.spec.ts` against the local Postgres (real git, real PHP analyzer, real store) | passed (4102 ms) | yes | run below |
| An unchanged repository keeps its indexing metadata over Postgres (repository-indexing) | same file | passed (2935 ms) | yes | run below |
| The four `http-index` Postgres scenarios over the seed | `npx vitest run tests/integration/api/reindex.spec.ts` | 4 passed | yes | run below |
| The six `graph-store` index state scenarios | `npx vitest run tests/integration/store/graph-read.spec.ts` | passed (54 tests in the three files) | yes | run below |

## Evidence

Live HTTP and PowerShell evidence, verbatim bodies and log lines: `openspec/changes/incremental-indexing/reports/2026-10-29-15-manual-interface-testing.md` (sections 15.3 and 15.4, and "Addendum: PowerShell check run by the agent").

Postgres run of 2026-10-29 (Git Bash, `DATABASE_URL` set for the command only):

```
npx vitest run tests/integration/index/incremental-reindex.spec.ts tests/integration/api/reindex.spec.ts tests/integration/store/graph-read.spec.ts
 Test Files  3 passed (3)
      Tests  54 passed (54)

 ✓ tests/integration/api/reindex.spec.ts > … > A reindex answers 202 and invalidates the cache over the seed 3507ms
 ✓ tests/integration/api/reindex.spec.ts > … > A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed 243ms
 ✓ tests/integration/index/incremental-reindex.spec.ts > … > An incremental reindex over Postgres reprocesses the changed file and its direct dependents 4102ms
 ✓ tests/integration/api/reindex.spec.ts > … > An invalid request answers VALIDATION_ERROR over the seed 227ms
 ✓ tests/integration/api/reindex.spec.ts > … > An unknown project answers PROJECT_NOT_FOUND over the seed 227ms
 ✓ tests/integration/index/incremental-reindex.spec.ts > … > An unchanged repository keeps its indexing metadata over Postgres 2935ms
```

No screenshot: the change has no browser-facing scenario (`packages/web` is untouched, task 16.1).

## State

- Before: `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `root_path` `fixtures/acme-shop`, `indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4…; task-api 2024-09-02 13:07:00+00 / 83397076….
- After: the same values (the integration specs roll back their transactions; the live runs were restored with `npm run db:seed`).
- Restored: yes. Step 15 and the PowerShell run restored with `npm run db:seed` and removed their scratchpad copies; the integration specs leave nothing.

## Not demonstrated

- None of the scenarios of the four deltas needs an interface that was not exercised. The `golden-answers` scenarios are file checks (`tests/unit/seed/golden-reviews.spec.ts`, green) and the git-history scenario "The criterion precedes the input and nothing in the record is rewritten" is recorded in Addendum 4 of the step 9 report.

## Handoff

The change is demonstrably working: the default incremental reindex, its fast path, the changed-file path with the plan's counters, the full mode, the error paths and the OpenAPI document were exercised against the running API (curl and PowerShell) and the Postgres scenarios pass against the real database. One documentation gap surfaced in PowerShell (a body-less `Invoke-RestMethod -Method Post` answers 415) and is resolved in `readme.md` §4 (design X-6). No screenshot was left at the repository root.
