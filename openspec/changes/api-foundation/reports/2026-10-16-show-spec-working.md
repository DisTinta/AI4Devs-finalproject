# Show Spec Working — api-foundation (DIS-76)

- Date: 2026-10-16
- Change: api-foundation
- Step: 17.4 `/show-spec-working`
- Mode: unattended run (autonomous-run ADR); reuses the step 13 evidence
  (`2026-10-16-13-manual-interface-testing.md`) and re-runs it against the commit under review
  (`156b108`), on port 3077 so as not to collide with any other local process.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| An unknown route answers NOT_FOUND | `curl -i GET /api/nope`, `POST /health` | `404`, exact body, `application/json` | yes | HTTP below |
| Health answers ok without touching the store | `curl -i GET /health` | `200` `{"status":"ok"}`; no `codemind-api` session while serving it | yes (store untouched shown by the counting-proxy test) | HTTP + test |
| The document lists health, the error schema and a route's body schema | `curl GET /docs/json` | `3.0.3`, `CODEMIND API` `1.0.0`, server `http://localhost:3000`, `paths` `["/health"]`, `Error` with `code`/`message`/`details` | yes (the `POST /api/test-only` part only exists in the test app) | HTTP + test |
| The viewer is served as HTML | `curl -L GET /docs` | `200 text/html`, 0 redirects | yes | HTTP |
| Health and the documentation are not limited | 40 × `/health`, 40 × `/docs/json` from one IP (limit 30) | 80 × `200` | yes | HTTP |
| A request that matches no route is not counted | 35 × `POST /api/nope` from one IP | no `429` | yes | HTTP |
| The request log holds no body (real logger) | `/health` with `authorization` and `cookie` sentinels; `POST /api/nope` with a body sentinel | no `SENTINEL` in the log; `req` = method, url, host, remoteAddress, remotePort; `responseTime` numeric | yes | log below |
| A missing DATABASE_URL stops the process with one line | `server.ts` without `DATABASE_URL`, `LLM_API_KEY=SENTINEL-key-3c9d` | one `INVALID_CONFIG` line, exit 1, no sentinel | yes | stderr below |
| An invalid variable fails with its name and without its value | `RATE_LIMIT_WINDOW_MS=1m` | `INVALID_CONFIG` / `RATE_LIMIT_WINDOW_MS`, no `1m` | yes | stderr below |
| Configuration errors are raised before the store is opened (LLM) | `LLM_API_KEY` without `LLM_BASE_URL` | `LLM_CONFIG_INVALID` / `LLM_BASE_URL`, exit 1 | yes | stderr below |
| An unreachable database fails without leaking the URL | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | `DATABASE_UNAVAILABLE`, `{}`, exit 1 | yes | stderr below |
| A listen failure closes the store | port 3078 held by a `net` server | `STARTUP_FAILED` `{"systemCode":"EADDRINUSE"}`, exit 1, 0 `codemind-%` sessions afterwards | yes | stderr below |
| The API answers on its address and closes its connections | started on `127.0.0.1:3077`, `/health`, stopped | `200`; 0 sessions after the stop | yes | HTTP + test |
| Every other scenario of both delta specs (validation, 413/415/418/400, `INTERNAL`, `BUDGET_EXHAUSTED`, `429`, serialisation, composition seams, start-up line mapping, store open/close) | `npx vitest run tests/unit/api tests/integration/api tests/integration/store/open-store.spec.ts` | 9 files, 56 tests passed, each scenario by its exact name | yes | test run below |

## Evidence

### HTTP against the real process

```text
$ DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind PORT=3077 \
    npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts
{"level":30,...,"msg":"Server listening at http://127.0.0.1:3077"}

$ curl -si http://127.0.0.1:3077/health
HTTP/1.1 200 OK
content-type: application/json; charset=utf-8
{"status":"ok"}

$ curl -sL -o /dev/null -w "%{http_code} %{content_type} redirects=%{num_redirects}" http://127.0.0.1:3077/docs
200 text/html; charset=utf-8 redirects=0

$ curl -s http://127.0.0.1:3077/docs/json | (summary)
{"openapi":"3.0.3","info":{"title":"CODEMIND API","version":"1.0.0"},"servers":["http://localhost:3000"],"paths":["/health"],"errorProps":["code","message","details"]}

$ curl -si http://127.0.0.1:3077/api/nope
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8
{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}

$ curl -si -X POST http://127.0.0.1:3077/health
HTTP/1.1 404 Not Found
{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}

$ curl -si -H 'X-Forwarded-For: 10.0.0.9' http://127.0.0.1:3077/api/nope
HTTP/1.1 404 Not Found
{"error":{"code":"NOT_FOUND","message":"route not found","details":{}}}

$ 40 x GET /health | sort | uniq -c
     40 200
$ 40 x GET /docs/json | sort | uniq -c
     40 200
$ 35 x POST /api/nope (content-type: application/json, body "{") | sort | uniq -c
     35 400
$ 3 x POST /api/nope (content-type: application/xml) | sort | uniq -c
      3 404
```

### Logging

```text
$ curl -H 'authorization: Bearer SENTINEL-hdr-demo' -H 'cookie: sid=SENTINEL-cookie-demo' /health  -> 200
$ curl -X POST -H 'content-type: application/json' --data '{"q":"SENTINEL-body-demo"' /api/nope
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{}}} 400
$ 70 000 x 'a' as JSON to POST /api/nope
{"error":{"code":"PAYLOAD_TOO_LARGE","message":"request body too large","details":{}}} 413
$ grep -c SENTINEL api.log
0
"req":{"method":"POST","url":"/api/nope","host":"127.0.0.1:3077","remoteAddress":"127.0.0.1","remotePort":51404}
"res":{"statusCode":413},"responseTime":0.8811999999998079
```

### Start-up failures (stderr only, exit code)

```text
$ (no DATABASE_URL) LLM_API_KEY=SENTINEL-key-3c9d server.ts
{"error":{"code":"INVALID_CONFIG","message":"DATABASE_URL is missing or invalid; see .env.example","details":{"variable":"DATABASE_URL"}}}
exit=1
$ RATE_LIMIT_WINDOW_MS=1m server.ts
{"error":{"code":"INVALID_CONFIG","message":"RATE_LIMIT_WINDOW_MS is missing or invalid; see .env.example","details":{"variable":"RATE_LIMIT_WINDOW_MS"}}}
exit=1
$ LLM_API_KEY=SENTINEL-key-3c9d (no LLM_BASE_URL) server.ts
{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}
exit=1
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db server.ts
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
exit=1
$ PORT=3078 (held by a net server) server.ts
{"error":{"code":"STARTUP_FAILED","message":"the API could not start","details":{"systemCode":"EADDRINUSE"}}}
exit=1
```

### Targeted test run (scenarios that need the test routes or seams)

```text
$ npx vitest run tests/unit/api tests/integration/api tests/integration/store/open-store.spec.ts --reporter=verbose
 Test Files  9 passed (9)
      Tests  56 passed (56)
```

Every `#### Scenario:` of `specs/api-foundation/spec.md` and `specs/graph-store/spec.md` appears in
that run under its exact name.

## State

- Before: `SELECT count(*) FROM project` → `1`;
  `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-%'` → `0`.
- After: `project` → `1`; `codemind-%` sessions → `0`.
- Restored: yes, nothing to restore (every request was a read). The process on port 3077 was
  stopped with `Stop-Process -Force` (the same Windows `SIGINT` limitation recorded in step 13.5;
  the `app.close()` path is covered by "The API answers on its address and closes its connections").

## Not demonstrated over real HTTP

- `400` validation issues, `415` on a real route, `418`/`400` `BAD_REQUEST`, `500` `INTERNAL`,
  `429` `BUDGET_EXHAUSTED` and `429` `RATE_LIMITED`: no real route of this change declares a body or
  query schema, throws, or is counted by the limiter (`/health` and `/docs*` are exempt). They are
  shown by the inject tests above, on the test routes the spec scenarios name.

## Observations handed to `/verify-against-spec` and `/adversarial-review`

1. A `POST` with a JSON body to a route that does not exist answers `400` `VALIDATION_ERROR` (malformed
   body) or `413` `PAYLOAD_TOO_LARGE` (oversized body) instead of `404` `NOT_FOUND`, while an XML body
   to the same unknown route answers `404`. The table of "Single error format" maps "no route matches
   the method and URL" to `404`.
2. Every start-up line says `see .env.example`, but `.env.example` does not yet list `PORT`, `HOST`,
   `RATE_LIMIT_MAX` or `RATE_LIMIT_WINDOW_MS` (task 15.3 is still open).

## Handoff

The change is **demonstrably working** on the real process for every scenario reachable over HTTP and
at start-up, and on the inject app for the rest; two observations above go to the next checks. No
screenshot or other file was written outside `openspec/changes/api-foundation/reports/`.

## Addendum — after the review fixes

- Observation 1 fixed (AR1 / V1): re-run on the real process, `POST /api/nope` with `{`, with a
  70 000-byte JSON body and with `<q/>` as `application/xml` → `404` `NOT_FOUND` all three; new scenario
  "A body error on a route that does not exist answers NOT_FOUND" green.
- Observation 2 fixed (AR3 / V2): `.env.example` lists `PORT`, `HOST`, `RATE_LIMIT_MAX` and
  `RATE_LIMIT_WINDOW_MS`.
- State after: `project` → `1`; `codemind-%` sessions → `0`; port 3077 free.
