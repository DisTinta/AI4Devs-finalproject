# Manual Interface Testing Report

- Date: 2026-10-29
- Change: index-endpoint
- Step: 11. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

*Agent's text: run by the agent in Git Bash, without the author. `<scratch>` stands for the agent's scratchpad directory (user name masked).*

## Preconditions (11.1)
- Docker Postgres up (healthy), `npm run db:migrate` (`No migrations to run!`), `npm run db:seed` of the regenerated seed of group 10 (`2 projects loaded`).
- Indicators (0.4, after the seed regeneration): `project` 2, `cache_entry` 6, `query_log` 0 (the seed load deletes the sample projects' `query_log` rows; the 8 of the baseline went then, E27). acme-shop: `indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4d51a3321031f3a24b3f36240410ed38c, `root_path` `fixtures/acme-shop` (the value to restore).
- `fixtures/acme-shop` copied without `.git` to `<scratch>/idx-root/acme-shop`, its history built with `buildOne` of `fixtures/build-history.mjs` (32 commits, 3 authors; `HEAD` equals the seed's commit); `UPDATE project SET root_path = '<scratch>/idx-root/acme-shop' WHERE name = 'acme-shop'` (`UPDATE 1`). acme-shop's id: `a794456d-6d1b-5b55-a360-13fec83dc7bc` (`npm run cli -- projects`).

## Server (11.2)
`npm -w packages/api run dev` started as a detached process with, for that command only: `DATABASE_URL` of the local database, `ALLOWED_REPOS_DIR=<scratch>/idx-root` (absolute), `AUTHOR_HASH_SALT=manual-test-salt`, `RATE_LIMIT_MAX=8` and `LLM_BASE_URL=`, `LLM_MODEL=`, `LLM_API_KEY=` empty (evaluation mode). `.env` was not edited. `GET /health` answered `{"status":"ok"}`.

## Success path (11.3)
| Request | Status | Body (abridged) |
|---|---|---|
| `POST /ask` `{"question":"¿Cómo se calcula el precio final de un pedido?"}` | 200 | the golden answer, `usage.cacheHit` `true` (the first try, sent through the Windows console encoding, was a miss: the accent bytes were mangled and the normalised question differed; the body was then sent from a UTF-8 file and hit) |
| `POST /index`, no body, no `Content-Type` | 202 | `{"projectId":"a794456d-…","mode":"full","analyzer":"php-treesitter-laravel","indexedCommit":"4f028db4d51a3321031f3a24b3f36240410ed38c","filesQueued":53,"filesSkipped":0,"cacheEntriesInvalidated":3}` — wall-clock `1.378 s` |
| `POST /index` `{}` | 202 | the same body with `cacheEntriesInvalidated` 0 — `1.154 s` |
| `POST /index` `{"incremental":true}` | 202 | the same body, `cacheEntriesInvalidated` 0 — `1.131 s` |
| acme-shop's `cache_entry` rows | | 0 (psql) |
| the same `/ask` again | 200 | `{"answer":"UNKNOWN","reason":"llm-required",…}`, no `cacheHit` |
| `GET /docs/json` | 200 | `paths` lists `/api/projects/{projectId}/index`; its `requestBody.required` is `false` |

The measured reindex duration of acme-shop (53 files, 32 commits) is about 1.1 to 1.4 s in this machine, request included (design Risks).

## Error paths (11.4)
| Request | Status | Body |
|---|---|---|
| `POST /index` `{"rootPath":"/tmp/x"}` | 400 | `VALIDATION_ERROR`, `invalid request`, issue `unrecognized_keys` at path `[]`, message `Unrecognized key: "rootPath"`; the value `/tmp/x` is not echoed |
| `POST /api/projects/not-a-uuid/index` `{}` | 400 | `VALIDATION_ERROR`, issue at `["projectId"]` |
| `Content-Type: application/json`, empty body | 400 | `{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{}}}` |
| `POST /api/projects/00000000-0000-4000-8000-000000000000/index` `{}` | 404 | `PROJECT_NOT_FOUND`, `project not found`, `details` `{}` |
| restart with `ALLOWED_REPOS_DIR=<scratch>/idx-root-other` | 403 | `{"error":{"code":"FORBIDDEN_PATH","message":"the project's repository is outside the allowed repositories directory","details":{}}}`, no path |
| restart with `AUTHOR_HASH_SALT=` (empty) | 403 | `{"error":{"code":"INDEXING_DISABLED","message":"indexing disabled (fixtures-only mode)","details":{}}}` |
| nine requests inside 60 s on the last server | 403 ×8, then 429 | the ninth: `{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":59}}}` with `retry-after` |

Every restart kept `RATE_LIMIT_MAX=8` and the empty `LLM_*`.

## Stop and restore (11.5, 11.6)
- `node scripts/dev-processes.mjs stop` closed the server; `pg_stat_activity` held no `codemind-api` session.
- `npm run db:seed` (`2 projects loaded`): acme-shop back to its snapshot (`indexed_at` 2024-05-06 09:31:00+00, `indexed_commit` 4f028db4…, `root_path` `fixtures/acme-shop`), the 6 golden cache entries reloaded, `query_log` 0 (the rows made by the `/ask` calls went with the seed's cascade). Counts: `project` 2, `cache_entry` 6, `query_log` 0. The scratchpad copies were removed.

## PowerShell check (11.8)
Not run by the agent. Pending for the author (design Follow-ups E13, destination C): in a new PowerShell terminal, with the API running (`npm run up`) and both indexing variables set, `Invoke-RestMethod -Method Post` to `/api/projects/<id>/index` of a project inside `ALLOWED_REPOS_DIR`, and see the route in `/docs`.

## Outcome
- Status: PASS
- Blocking issues: none
