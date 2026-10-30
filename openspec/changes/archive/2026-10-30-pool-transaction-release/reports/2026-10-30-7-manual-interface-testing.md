# Manual Interface Testing Report

- Date: 2026-10-30
- Change: pool-transaction-release
- Step: 7. Backend: Manual Interface Testing (agent's text, autonomous run)

Paths below mask the OS user as `<user>` and the session folder as `<scratchpad>`.

## Preconditions
- Docker Postgres up (`codemind-postgres-1`, healthy); `npm run db:migrate` answered "No migrations to run!".
- Indicators before: `project` count 2; `codemind-tx%` sessions 0.
- Fixture: `fixtures/acme-shop` copied to `<scratchpad>/dis110/acme-shop` (the copy keeps the `.git` built earlier by `fixtures/build-history.mjs`, which only builds inside `fixtures/`).

## Commands and results
1. `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind AUTHOR_HASH_SALT=<test value> npm run cli -- index <scratchpad>/dis110/acme-shop --name dis-110-manual --language php`: first try without `ALLOWED_REPOS_DIR` answered `INDEXING_DISABLED` (exit 1, expected without it); with `ALLOWED_REPOS_DIR=<scratchpad>/dis110` it indexed: 53 files, 121 symbols, 32 commits, 170 edges, 0 diagnostics. Project id `f1425271-9526-4207-8643-b67941bc13e6`. The salt was a literal test value for that command only; `.env` was not read or changed.
2. API started from Git Bash with `DATABASE_URL`, `AUTHOR_HASH_SALT`, `ALLOWED_REPOS_DIR=<scratchpad>/dis110`, `PORT=3110` (`npm -w packages/api run dev`). `GET /health` answered `200 {"status":"ok"}`.
3. `curl -i -X POST http://localhost:3110/api/projects/<id>/index -H 'content-type: application/json' -d '{}'` twice: `202 Accepted` both times, body `{"projectId":"<id>","mode":"incremental","analyzer":"php-treesitter-laravel","indexedCommit":"4f028db4...","filesQueued":0,"filesSkipped":53,"cacheEntriesInvalidated":0}`.
4. Unknown project id `00000000-0000-4000-8000-000000000000`: `404 {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`.
5. Body `{"rootPath":"x"}`: `400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":[],"code":"unrecognized_keys","message":"Unrecognized key: \"rootPath\""}]}}}`.
6. Idle pooled backends: `pg_stat_activity` showed one `codemind-api` session; `SELECT count(pg_terminate_backend(pid)) ... WHERE application_name LIKE 'codemind-api%'` returned 1; the next `POST .../index` answered `202` with the same body and `GET /health` still answered `200` (the API process stayed alive; a regression check of the idle-client handler, not evidence of the runner change).
7. PowerShell check (design R9 and X5, executed by the agent by the author's instruction; no `$env:` change): `powershell.exe -NoProfile -Command "Invoke-RestMethod -Method Post -Uri http://localhost:3110/api/projects/<id>/index -ContentType 'application/json' -Body '{}' | ConvertTo-Json -Compress"` returned `{"projectId":"<id>","mode":"incremental","analyzer":"php-treesitter-laravel","indexedCommit":"4f028db4...","filesQueued":0,"filesSkipped":53,"cacheEntriesInvalidated":0}`.

## Restoration
- `node scripts/dev-processes.mjs stop`: stopped 1 process tree (the API).
- `DELETE FROM project WHERE name='dis-110-manual'`: `DELETE 1` (rows cascade).
- The scratchpad copy was removed.
- Indicators after: `project` count 2, `codemind-tx%` sessions 0.

## Outcome
- Status: PASS
- Blocking issues: none
