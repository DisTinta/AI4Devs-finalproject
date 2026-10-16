# Show Spec Working — ask-endpoint (DIS-78)

- Date: 2026-10-16
- Change: ask-endpoint (DIS-78), task 14.4
- Run by the agent inside the autonomous workflow of Entrega 2 (ADR
  `20261016-autonomous-workflow-run-entrega-2`).

The evidence combines (a) a fresh run against the real API process and the local Postgres (this
report), (b) the step 10 manual evidence
([`2026-10-16-10-manual-interface-testing.md`](./2026-10-16-10-manual-interface-testing.md)), reused
for the live-mode paths (unreachable model, spent budget) and the rate limit, and (c) the named
scenario tests run once more, for the scenarios whose GIVEN needs doubles (a canned use case, a
scripted live model) that the real process cannot be put in.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Evaluation mode answers UNKNOWN llm-required over the seed | real API, `curl` #1 | `200`, exact `llm-required` body; no claim row | yes | Evidence #1; State |
| An upper-case project id resolves the same project | real API, `curl` #2 | `200` `UNKNOWN` `llm-required` | yes | Evidence #2 |
| An invalid question answers VALIDATION_ERROR without asking | real API, `curl` #3 (whitespace) + step 10 #5 (`abc`); unit test | `400` `VALIDATION_ERROR`, path `["question"]`, no value echoed | yes | Evidence #3; tests |
| An invalid token budget, cache flag or extra key answers VALIDATION_ERROR | real API, `curl` #4 (`useCache` `"yes"`) + step 10 #6, #7; unit test | `400`, `invalid_type` / `too_small` / `unrecognized_keys` | yes | Evidence #4; tests |
| A malformed project id answers VALIDATION_ERROR | real API, `curl` #5 (`123`) + step 10 #8; unit test | `400`, path `["projectId"]`, the id is not in the body | yes | Evidence #5 |
| An unknown project answers PROJECT_NOT_FOUND | real API, `curl` #6 (random UUID, question with no search term) + step 10 #9; unit test | `404`, exact body, no UUID | yes | Evidence #6 |
| The document lists ask with its parameter, body and responses | real API, `GET /docs/json` #7; unit test | parameter, body, `200` two shapes, `400/404/429/500/503` as specified | yes | Evidence #7 |
| The ask route is rate limited | step 10 #10 (ninth request); unit test | `429 RATE_LIMITED`, `Retry-After` | yes | step 10 report |
| Domain errors of the use case map to their answers (`LLM_UNAVAILABLE` `network`) | step 10 #11 (live, unreachable model); unit test for the full table | `503`, `{ "reason": "network" }` | yes | step 10 report |
| An exhausted budget on ask answers 429 with the cache-only notice | step 10 #12 (live, spent budget); unit test | `429 BUDGET_EXHAUSTED`, `cacheOnly: true` | yes | step 10 report |
| A spent daily budget stops the model over the seed | integration test over Postgres | passes | yes | tests |
| An answered question returns only the public fields over the seed | integration test over Postgres (scripted live model) | passes | yes | tests |
| A question at the length bounds is accepted; Optional fields are forwarded as the use case expects; Evidence ids are renumbered in evidence order; Internal fields of the answer are not sent; A statement citing an unknown evidence id answers INTERNAL; Another UNKNOWN reason carries no message; Another error of the use case answers INTERNAL; The answer's events are logged by level; Requests to one API share verification verdicts | `inject` unit tests with doubles | pass | yes | tests |
| A route's own mapping applies only to that route (`api-foundation`) | `inject` unit test | passes | yes | tests |

## Evidence

### Fresh run against the real API (evaluation mode)

```
set -a; . ./.env; set +a; unset LLM_BASE_URL LLM_MODEL LLM_API_KEY
RATE_LIMIT_MAX=8 PORT=3000 npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts
# log: {"level":30,...,"msg":"Server listening at http://127.0.0.1:3000"}; GET /health → {"status":"ok"}
```

Requests with `curl -s -i` (headers `Date`, `Connection`, `Keep-Alive` removed). `ID` is acme-shop's
`a794456d-6d1b-5b55-a360-13fec83dc7bc`; `Q` is `{"question":"¿Cómo se calcula el precio final de un pedido?"}`.

```text
### 1 eval ask
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


### 3 whitespace question
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 5
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 175

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"custom","message":"question must not be only whitespace"}]}}}


### 4 useCache yes
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 4
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 193

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["useCache"],"code":"invalid_type","message":"Invalid input: expected boolean, received string"}]}}}


### 5 id 123
HTTP/1.1 400 Bad Request
x-ratelimit-limit: 8
x-ratelimit-remaining: 3
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 262

{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["projectId"],"code":"invalid_format","message":"Invalid string: must match pattern /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/"}]}}}


### 6 unknown project, emoji question
HTTP/1.1 404 Not Found
x-ratelimit-limit: 8
x-ratelimit-remaining: 2
x-ratelimit-reset: 60
content-type: application/json; charset=utf-8
content-length: 81

{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}


### 7 docs/json (POST /api/projects/{projectId}/ask: parameters; body; response codes; 200 shapes)
[{"schema":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$","format":"uuid"},"in":"path","name":"projectId","required":true}]
{"required":["question"],"additionalProperties":false,"q":{"type":"string","minLength":5,"maxLength":500},"tb":{"default":8000,"type":"integer","minimum":1000,"maximum":32000},"uc":{"default":true,"type":"boolean"}}
[ '200', '400', '404', '429', '500', '503' ]
[["answer","reason","message","statements","evidence"],["answer","statements","evidence","confidence","usage"]]
```

Request #6 used `{"question":"😀😀😀😀😀"}` (no search term) on the random UUID
`3f2504e0-4f89-41d3-9a0c-0305e82c3301`: the project is resolved before the use case, so it answers
`404`, never `no-anchor`. No error body contains a value sent (`       `, `yes`, `123`, the UUID).
The request log of the process (`grep -c "precio\|price calc"`) holds `0` lines with the question.

The server was stopped with `taskkill //F` (Windows cannot deliver `SIGINT` from the agent's shell,
as in step 10.5); `GET /health` then failed and `pg_stat_activity` held `0` `codemind-api` sessions.

### Named scenario tests

```
set -a; . ./.env; set +a; npx vitest run tests/unit/api tests/integration/api --reporter=verbose
```

Every scenario of both delta specs passed under its own name (`tests/unit/api/ask.spec.ts`,
`tests/unit/api/route-errors.spec.ts`, `tests/integration/api/ask.spec.ts`), plus the DIS-76 API
specs: `Test Files 11 passed (11)`, `Tests 87 passed (87)`.

## State

- Before: `count(project)` 1, `count(claim)` 0, `count(query_log)` 0, `max(query_log.created_at)`
  `NULL`; database clock `2026-10-16 21:39:29.539264+00`.
- After the run: 2 `query_log` rows created after that instant (requests #1 and #2, each an answered
  `UNKNOWN`); no claim row.
- Restored: yes — `DELETE FROM query_log WHERE created_at >= '2026-10-16 21:39:29.539264+00'` →
  `DELETE 2`; indicators again `1 | 0 | 0 | NULL`. The integration specs roll back their transaction.

## Not demonstrated

- The answered path and the semantic-check cache against a **real** model through the running
  process: the local Ollama is unreliable on this host (crashes on GPU, see the project notes) and no
  hosted key is configured for the run. Both are demonstrated by the integration test over the seed
  (scripted live model, real Postgres and git source tree) and the unit test with the real `explain`.
- The `SOURCE_UNAVAILABLE`, `INVALID_EXPLAIN_REQUEST` and `INTERNAL` answers through the running
  process: they cannot be triggered from outside without corrupting the stored data; covered by the
  `inject` tests.

## Handoff

The change is **demonstrably working**: every scenario that the running API can be put in was
exercised against the real interface and matched its `THEN` exactly; the rest pass as named tests.
No screenshot was taken (no UI); nothing was written at the repository root.

## Addendum — after the pre-merge review fixes

The fixes of task 14.7 change no answer the running API gave above: V2 only removes a `message` that
core never sends with a reason other than `llm-required`, and the other fixes are tests, spec
clarifications and the readme. The named scenario tests were re-run green with the rest of the suite
(`Tests 1443 passed`); the live evidence above stands.
