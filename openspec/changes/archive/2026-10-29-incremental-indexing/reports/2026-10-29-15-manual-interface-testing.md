# Manual Interface Testing Report

- Date: 2026-10-29
- Change: incremental-indexing
- Step: 15. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

Paths below mask the OS user name as `<user>`; `<scratch>` is the session scratchpad directory.

## Preconditions (15.1, 15.2)

- Docker Postgres up (`docker compose up -d --wait`), `npm run db:migrate` (no migrations to run), `npm run db:seed` (the regenerated seed of step 11: `2 projects loaded`).
- Indicators before: `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `root_path` `fixtures/acme-shop`, `indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4d51a3321031f3a24b3f36240410ed38c, 53 `file` rows.
- A copy of `fixtures/acme-shop` (without `.git`) was made into `<scratch>/manual/acme-shop` and its history built there (a small script over `buildOne` of `fixtures/build-history.mjs`: 32 commits, 3 authors; the script only builds inside `fixtures/`). acme-shop's `root_path` was pointed at the copy with one `UPDATE` through `docker compose exec` (previous value `fixtures/acme-shop`, restored by `db:seed`).
- API started in Git Bash with, for that command only, `DATABASE_URL`, `ALLOWED_REPOS_DIR=<scratch>/manual`, `AUTHOR_HASH_SALT=test-salt-manual-dis-10`, `RATE_LIMIT_MAX=20` and `LLM_BASE_URL=`, `LLM_MODEL=`, `LLM_API_KEY=` empty (evaluation mode): `npm -w packages/api run dev`; `GET /health` answered `{"status":"ok"}`. acme-shop's id from the database: `a794456d-6d1b-5b55-a360-13fec83dc7bc`.

## Success path (15.3), `curl -i`

| # | Request | Status | Body (`202`) | Wall clock |
|---|---|---|---|---|
| 1 | `POST /api/projects/<id>/index` `{"incremental":false}` | 202 | `mode` `full`, `filesQueued` 53, `filesSkipped` 0, `indexedCommit` 4f028db4…, `cacheEntriesInvalidated` 3 | 1.37 s |
| 2 | no body | 202 | `mode` `incremental`, `filesQueued` 0, `filesSkipped` 53, `indexedCommit` 4f028db4…, `cacheEntriesInvalidated` 0 | 0.98 s (fast path) |
| 3 | `{}` after committing a change to `app/Services/PriceCalculator.php` in the copy (`git -C <copy>`, new `HEAD` 47a8b945cee2d559178a4595f1bb6fa339659f00) | 202 | `mode` `incremental`, `filesQueued` 8 (the file and 7 direct dependents), `filesSkipped` 45, `indexedCommit` 47a8b945…, `cacheEntriesInvalidated` 0 | 1.25 s |

- `indexed_at` and `indexed_commit` by `SELECT` before and after request 2: both unchanged (`2026-10-29 16:56:26.443073+00`, 4f028db4…). After request 3: `indexed_at` `2026-10-29 16:57:02.1616+00`, `indexed_commit` 47a8b945….
- `GET /docs/json`: `mode` is `{"type":"string","enum":["full","incremental"]}`.
- API log, `reindex completed`, one line per request, counters only: `mode` `full`, `filesQueued` 53, `filesSkipped` 0, `durationMs` 1354; `mode` `incremental`, `filesQueued` 0, `filesSkipped` 53, `durationMs` 970; `mode` `incremental`, `filesQueued` 8, `filesSkipped` 45, `durationMs` 1246. No path in any line.
- The fast path takes about as long as the rest because reading and redacting the files from Git still dominates a repository this small; it does no analysis and no graph write.

## Error paths (15.4)

| Request | Status | Body |
|---|---|---|
| `{"incremental":"yes"}` | 400 | `VALIDATION_ERROR`, `invalid request`, one issue with path `["incremental"]` (the zod message names the received type, not the value `yes`) |
| a random UUID `3f2b9c1e-7d4a-4e1b-8c5d-9a0b1c2d3e4f` | 404 | `PROJECT_NOT_FOUND`, `project not found`, details `{}` |
| `Content-Type: application/json` with an empty body | 400 | `VALIDATION_ERROR`, `invalid request`, details `{}` |

## Stop and restoration (15.5, 15.6)

- Server stopped with `node scripts/dev-processes.mjs stop` (1 process tree); `pg_stat_activity` has no `codemind-api` session.
- `npm run db:seed` restored acme-shop (snapshot, golden cache entries, `root_path` `fixtures/acme-shop`); the scratchpad copy was removed.
- Indicators after: `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop `indexed_at` 2024-05-06 09:31:00+00 and `indexed_commit` 4f028db4… as before; task-api `indexed_at` 2024-09-02 13:07:00+00, `indexed_commit` 83397076…. No `query_log` row was created.

## PowerShell check (15.8)

First recorded as pending for the author (design → Follow-ups P8, destination C): run the `readme.md` §4 `POST /index` example in a new PowerShell terminal against a local API and confirm `mode: "incremental"`. The same example was run in Git Bash above. The author later delegated it to the agent, which ran it: see the addendum at the end.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum: PowerShell check run by the agent (P8, and E13 of DIS-9)

The author delegated the PowerShell check to the agent (design → Follow-ups P8, now destination A). Run by the agent on 2026-10-29, after the DIS-10 r2 round, from the Git Bash shell through `powershell.exe -NoProfile -Command …` (Windows PowerShell 5.1.26100.9818), with one extra call through PowerShell 7.6.9 (`pwsh.exe`).

Setup, as 15.1–15.2: Docker Postgres up, `npm run db:seed` state (indicators `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0); a copy of `fixtures/acme-shop` with its history built under `<scratch>/manual-ps` (32 commits, 3 authors); acme-shop's `root_path` pointed at the copy with one `UPDATE` (previous value `fixtures/acme-shop`); the API started with `DATABASE_URL`, `ALLOWED_REPOS_DIR=<scratch>/manual-ps`, a test `AUTHOR_HASH_SALT`, `RATE_LIMIT_MAX=20` and empty `LLM_*` for that command only (`.env` not edited); `GET /health` `{"status":"ok"}`.

| # | PowerShell command (Uri `http://127.0.0.1:3000/api/projects/<acme-shop id>/index`) | Result |
|---|---|---|
| 1 | `Invoke-RestMethod -Method Post -Uri … -ContentType 'application/json' -Body '{"incremental":false}'` | `mode` `full`, `filesQueued` 53, `filesSkipped` 0, `indexedCommit` 4f028db4…, `cacheEntriesInvalidated` 3 (the stored state now matches the copy) |
| 2 | `Invoke-RestMethod -Method Post -Uri …` (no body: E13 and the `readme.md` §4 example as written) | `415 UNSUPPORTED_MEDIA_TYPE`, `unsupported media type`, details `{}`, in both 5.1 and 7.6.9 |
| 3 | `Invoke-RestMethod -Method Post -Uri … -ContentType 'application/json' -Body '{}'` | `mode` **`incremental`**, `filesQueued` 0, `filesSkipped` 53, `indexedCommit` 4f028db4…, `cacheEntriesInvalidated` 0 (fast path) |
| 4 | `(Invoke-RestMethod -Uri http://127.0.0.1:3000/docs/json).paths` and `Invoke-WebRequest -UseBasicParsing -Uri http://127.0.0.1:3000/docs` | paths `/health`, `/api/projects/{projectId}/ask`, `/api/projects/{projectId}/index`; `/docs` answers 200; the `202` `mode` schema is `{"type":"string","enum":["full","incremental"]}` |

- Finding: PowerShell's `Invoke-RestMethod -Method Post` without `-Body` declares `Content-Type: application/x-www-form-urlencoded` (reproduced with `curl -H "Content-Type: application/x-www-form-urlencoded"`: 415). The API answers 415 as its error table documents; the `http-index` contract makes only a body without `Content-Type` equal to `{}` (curl without a body, 15.3, answers `incremental`). Resolution (design X-6, destination A): `readme.md` §4 now tells PowerShell users to send `-ContentType 'application/json' -Body '{}'`; no code or spec change. E13 of the archived DIS-9 change is therefore confirmed with `-ContentType 'application/json' -Body '{}'` (a `202`) and the route visible in `/docs`; its bare form answers 415.
- API log, `reindex completed`: `mode` `full`, `filesQueued` 53, `filesSkipped` 0, `durationMs` 1371; `mode` `incremental`, `filesQueued` 0, `filesSkipped` 53, `durationMs` 928. No path in any line.
- Restoration, as 15.5–15.6: `node scripts/dev-processes.mjs stop` (1 process tree); no `codemind-api` session in `pg_stat_activity`; `npm run db:seed` (`2 projects loaded`) restored acme-shop's snapshot, golden cache entries and `root_path` `fixtures/acme-shop`; the scratchpad copy removed. Indicators after: `project` 2, `claim` 0, `cache_entry` 6, `query_log` 0; acme-shop 2024-05-06 09:31:00+00 / 4f028db4…, task-api 2024-09-02 13:07:00+00 / 83397076…, as before.
