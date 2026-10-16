# Manual Interface Testing Report

- Date: 2026-10-16
- Change: api-foundation (DIS-76)
- Step: 13. Backend: Manual Interface Testing

## Preconditions (13.1)

- Local database (compose, `postgres://codemind:codemind@localhost:5432/codemind`), `docker compose`
  service `postgres` healthy; `npm run db:migrate` → `No migrations to run!` (`0001`–`0004` applied).
- Indicators before: `SELECT count(*) FROM project` → `1`;
  `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-%'` → `0`.

## 13.2 Start

```
DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind npm -w packages/api run dev
```

Log (one pino line): `{"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}`. While it ran,
`pg_stat_activity` showed no `codemind-api` session: the probe connection is released at start-up and
the idle pool connection closes after `pg`'s idle timeout; `/health` does not touch the store.

## 13.3 Success paths and 13.4 HTTP error paths (`curl`)

```text
$ curl -i http://127.0.0.1:3000/health
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
content-length: 15
Date: Fri, 16 Oct 2026 17:05:11 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"status":"ok"}

$ curl -i http://127.0.0.1:3000/docs
HTTP/1.1 200 OK
content-type: text/html; charset=utf-8
content-length: 901
Date: Fri, 16 Oct 2026 17:05:11 GMT
Connection: keep-alive
Keep-Alive: timeout=72

<!-- HTML for static distribution bundle build -->
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">

$ curl -sL -o /dev/null -w "%{http_code} %{content_type} redirects=%{num_redirects}" http://127.0.0.1:3000/docs
200 text/html; charset=utf-8 redirects=0

$ curl -s http://127.0.0.1:3000/docs/json | node -e (summary)
HTTP/1.1 200 OK
{"openapi":"3.0.3","info":{"title":"CODEMIND API","version":"1.0.0","description":"Answers about a codebase with verifiable evidence. Every error uses the `Error` format."},"servers":[{"url":"http://localhost:3000","description":"Local"}],"paths":["/health"],"error":{"type":"object","properties":{"error":{"type":"object","properties":{"code":{"type":"string"},"message":{"type":"string"},"details":{"type":"object","additionalProperties":{}}},"required":["code","message","details"],"additionalProperties":false}},"required":["error"],"additionalProperties":false}}

$ curl -i http://127.0.0.1:3000/api/nope
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
content-length: 71
Date: Fri, 16 Oct 2026 17:05:12 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}

$ curl -i -X POST http://127.0.0.1:3000/health
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
content-length: 71
Date: Fri, 16 Oct 2026 17:05:12 GMT
Connection: keep-alive
Keep-Alive: timeout=72

{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}

$ for i in 1..40; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health | sort | uniq -c
     40 200
```

- `GET /health` → `200` `{"status":"ok"}`, `application/json`.
- `GET /docs` → `200` `text/html` directly (no redirect with `@fastify/swagger-ui` 6.1.2).
- `GET /docs/json` → `200`, `openapi` `3.0.3`, `info` and `servers` as specified, `paths` `["/health"]`
  (no `/docs` path), `components.schemas.Error` with `error.code`, `error.message`, `error.details`.
- `GET /api/nope` and `POST /health` → `404` with exactly
  `{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}`.
- 40 `GET /health` in a row from the same IP → 40 × `200`: `/health` is exempt from the limit (30 per
  60 s by default).
- **`429` not reachable with `curl` in this change:** every real route (`/health`, `/docs*`) is exempt
  and an unknown route is not counted. Evidence: `tests/unit/api/rate-limit.spec.ts` (5 tests, all
  passing in step 12: "The request beyond the limit answers RATE_LIMITED", "Rejected requests count
  towards the limit", …).
- **Invalid input not reachable with `curl` either:** no real route declares a body or query schema
  yet (the business routes are DIS-78 / DIS-9). Evidence: `tests/unit/api/errors.spec.ts` (validation,
  malformed JSON, 413, 415 scenarios, all passing in step 12).

## 13.4 Start-up failures (`tsx` without `watch`, exit code recorded)

```text
$ (no DATABASE_URL) npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts
{"error":{"code":"INVALID_CONFIG","message":"DATABASE_URL is missing or invalid; see .env.example","details":{"variable":"DATABASE_URL"}}}
exit=1

$ DATABASE_URL=<local> PORT=70000 npx tsx ...
{"error":{"code":"INVALID_CONFIG","message":"PORT is missing or invalid; see .env.example","details":{"variable":"PORT"}}}
exit=1

$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db npx tsx ...
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
exit=1

$ DATABASE_URL=<local> npx tsx ... (port 3000 held by the dev server)
{"error":{"code":"STARTUP_FAILED","message":"the API could not start","details":{"systemCode":"EADDRINUSE"}}}
exit=1
```

The `EADDRINUSE` run was made while the dev server of 13.2 held port 3000; its stdout (pino lines)
was discarded in the command and only stderr shown. No line contains a variable's value, the
database URL, `s3cret` or a host.

## 13.5 Stop

The dev server ran under `tsx watch` launched by the agent's shell, not in an interactive console,
so a real `Ctrl+C` (`SIGINT`) could not be delivered on Windows: `taskkill` without `/F` answered
"this process can only be terminated forcefully", and Node on Windows turns a `SIGINT` sent with
`process.kill` into an unconditional termination. The process was therefore stopped with
`Stop-Process -Force` (the `tsx watch` parent and its `server.ts` child); port 3000 was free afterwards.
The closing path that `SIGINT` triggers (`app.close()` → `onClose` → `pool.end()`) is covered by
`tests/integration/api/server.spec.ts` → "The API answers on its address and closes its connections"
(no `codemind-api` session left, polled for 2 s), which passed in step 12.

After stopping: `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-%'` →
`0`; `SELECT count(*) FROM project` → `1`.

## Restoration

None: nothing was created, updated or deleted (every request was a read; the database indicators are
the same before and after).

## Outcome

- Status: PASS (with the `SIGINT` limitation above, covered by the integration test)
- Blocking issues: none
