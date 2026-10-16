# Manual Interface Testing Report

- Date: 2026-10-16
- Change: ask-endpoint (DIS-78)
- Step: 10. Backend: Manual Interface Testing

Run inside the autonomous workflow of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
by the agent, against the real API process and the local Postgres.

## 10.1 Preconditions

- Local database (compose service `postgres`, healthy); `DATABASE_URL` exported from `.env`;
  `npm run db:migrate` → `No migrations to run!`.
- `npm run cli -- projects` → `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample`
  (the seed was already loaded: `db:seed` was not run).
- Indicators before: `count(project)` 1, `count(claim)` 0, `count(query_log)` 0,
  `max(query_log.created_at)` `NULL`; database clock at that moment `2026-10-16 21:17:41.594445+00`.

## 10.2 Start (evaluation mode)

```
export DATABASE_URL=<from .env> RATE_LIMIT_MAX=8   # no LLM_* variable set
npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts
```

The `dev` script without `watch` (`docs/project-context.md` → Commands), so the process can be stopped
and restarted between 10.3, 10.4b and 10.4c. Log: `{"level":30,…,"msg":"Server listening at http://127.0.0.1:3000"}`;
`GET /health` → `{"status":"ok"}`.

## 10.3 Success paths and 10.4a error paths (evaluation mode, `curl -i`)

`Date`, `Connection` and `Keep-Alive` headers removed. The project id is acme-shop's; the question
is `¿Cómo se calcula el precio final de un pedido?`. Requests 1–3 and 5–10 count against the limit of
8 per window; `/docs/json` is not limited.

```text
### 1 answered-path eval
HTTP/1.1 200 OK
x-ratelimit-limit: 8
x-ratelimit-remaining: 7
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 151

{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}


### 2 upper-case id
HTTP/1.1 200 OK
x-ratelimit-limit: 8
x-ratelimit-remaining: 6
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 151

{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}


### 3 tokenBudget 1000 useCache false
HTTP/1.1 200 OK
x-ratelimit-limit: 8
x-ratelimit-remaining: 5
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 151

{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}


### 4 docs/json path keys
[ '/health', '/api/projects/{projectId}/ask' ]
[ '200', '400', '404', '429', '500', '503' ]

### 5 question abc
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 4
x-ratelimit-reset: 59
content-type: application/json; charset=utf-8
content-length: 191

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"too_small","message":"Too small: expected string to have >=5 characters"}]}}}


### 6 tokenBudget 50
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 3
x-ratelimit-reset: 59
content-type: application/json; charset=utf-8
content-length: 184

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["tokenBudget"],"code":"too_small","message":"Too small: expected number to be >=1000"}]}}}


### 7 hops 2
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 2
x-ratelimit-reset: 59
content-type: application/json; charset=utf-8
content-length: 166

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":[],"code":"unrecognized_keys","message":"Unrecognized key: \"hops\""}]}}}


### 8 not-a-uuid
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 1
x-ratelimit-reset: 59
content-type: application/json; charset=utf-8
content-length: 262

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["projectId"],"code":"invalid_format","message":"Invalid string: must match pattern /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/"}]}}}


### 9 random uuid
HTTP/1.1 404 Not Found
x-ratelimit-limit: 8
x-ratelimit-remaining: 0
x-ratelimit-reset: 59
content-type: application/json; charset=utf-8
content-length: 81

{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}


### 10 ninth request
HTTP/1.1 429 Too Many Requests
x-ratelimit-limit: 8
x-ratelimit-remaining: 0
x-ratelimit-reset: 58
retry-after: 58
content-type: application/json; charset=utf-8
content-length: 98

{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":58}}}


```

Every success answer is the exact `llm-required` body. The upper-case id resolves the same project.
No error body echoes a received value (`abc`, `50`, `hops`, `not-a-uuid` or the random UUID); the
`not-a-uuid` issue message quotes the pattern, not the value. The ninth `/ask` request answers
`429 RATE_LIMITED` with `Retry-After`.

## 10.4b Live mode, unreachable model

```
export DATABASE_URL=<from .env> RATE_LIMIT_MAX=8 LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_MODEL=qwen2.5-coder
npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts
```

```text
### 11 live, unreachable model
HTTP/1.1 503 Service Unavailable
x-ratelimit-limit: 8
x-ratelimit-remaining: 7
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 113

{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"network"}}}

```

`503 LLM_UNAVAILABLE` with `reason: "network"`. The task expected a `systemCode` too; on this Windows
host Node's `fetch` to `127.0.0.1:1` fails with an error that carries no code
(`node -e "fetch('http://127.0.0.1:1/v1/x').catch(e => console.log(e.cause?.code))"` prints
`undefined`), so the adapter has none to report. The spec adds `systemCode` only "when the error has
it", and the unit scenario "Domain errors of the use case map to their answers" covers the case with
`ECONNREFUSED`. Conforms.

## 10.4c Live mode, spent daily budget

```
INSERT INTO query_log (project_id, question, capability, cost_usd)
VALUES ('a794456d-6d1b-5b55-a360-13fec83dc7bc', 'manual budget check DIS-78', 'explain', 1) RETURNING id;
-- d3e65db1-5a68-4c12-84e7-f7e5d6f9c9d8
export ... DAILY_BUDGET_USD=0.000001   # plus the variables of 10.4b
```

```text
### 12 live, spent daily budget
HTTP/1.1 429 Too Many Requests
x-ratelimit-limit: 8
x-ratelimit-remaining: 7
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 189

{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":1,"dailyBudgetUsd":0.000001,"resetsAt":"2026-10-17T00:00:00.000Z","cacheOnly":true}}}

```

`429 BUDGET_EXHAUSTED` with `details.cacheOnly: true`; the model was not called (the unreachable URL
would have answered `503`). The server was stopped and the row deleted at once:
`DELETE FROM query_log WHERE id='d3e65db1-…'` → `DELETE 1`; a count by that id → `0`.

## 10.5 Stop

`SIGINT` could not be delivered from the agent's shell on Windows: `taskkill //PID <pid>` without
`/F` is refused ("this process can only be terminated forcibly"), so each server was stopped with
`taskkill //F`. After every stop, `GET /health` failed (server down) and
`SELECT count(*) FROM pg_stat_activity WHERE application_name='codemind-api'` → `0`. The graceful
`SIGINT` path is covered by `tests/integration/api/server.spec.ts` (DIS-76), unchanged by this change.

## 10.6 Restoration

- The 10.4c row: deleted, count by id `0`.
- `query_log` rows created after the 10.1 instant: 3, the three `llm-required` answers of 10.3 (the
  `400`, `404`, `429`, `503` answers and the budget stop wrote none). Deleted with
  `DELETE FROM query_log WHERE created_at >= '2026-10-16 21:17:41.594445+00'` → `DELETE 3`.
- No project was added (`db:seed` did not run).
- Indicators after: `count(project)` 1, `count(claim)` 0, `count(query_log)` 0,
  `max(query_log.created_at)` `NULL` — equal to 10.1.

## Outcome

- Status: PASS
- Blocking issues: none
