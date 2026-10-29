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

Pending for the author, not run by the agent (design → Follow-ups P8, destination C): run the `readme.md` §4 `POST /index` example in a new PowerShell terminal against a local API and confirm `mode: "incremental"`. The same example was run in Git Bash above.

## Outcome

- Status: PASS
- Blocking issues: none
