# Show spec working — http-impact (DIS-95)

- Date: 2026-11-02
- Change: http-impact · PR #95 · branch `feature/dis-95-http-impact` (head `618dd67` when run)
- Step: 9.3, pre-merge review (autonomous run, review step)

*Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). The real API ran against the local
PostgreSQL (`docker compose`, `codemind-postgres-1` healthy) from Git Bash on Windows 11, through one
script of the session scratchpad: `RATE_LIMIT_MAX=12 npm -w packages/api run dev` started with `&`,
`GET /health` polled, the curls below, `node scripts/dev-processes.mjs stop` and the restoration, all
in the same Bash call. Nothing was set with `$env:`. This run is fresh evidence, independent from the
step 6 report (`2026-11-02-6-manual-interface-testing.md`), which it confirms.*

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Q2 answers only the public fields over the seed | `POST /api/projects/<acme-shop>/impact` `{"change":"cambiar los descuentos de DiscountService","maxHops":2}` | 200, keys `status, direct, indirect, tests, docs, history, risk`; `DiscountService` hops 0, `PriceCalculator` hops 1 `exact`; the four `heuristic` hops-2 entries; the three tests; `docs`, `history`, `risk` exactly as the spec | yes | request 1 |
| An upper-case project id resolves the same project on impact | same body, id in upper case | 200, body byte-identical to request 1 | yes | request 2 |
| A change without search terms answers unknown | five U+1F600 sent as JSON escapes | 200 exactly `{"status":"unknown","reason":"no-anchor"}` | yes | request 3 |
| An invalid hop limit or an extra key answers VALIDATION_ERROR | `maxHops` 0, `maxHops` 1.5, extra key `projectId` | 400 `VALIDATION_ERROR`, one issue each: `too_small`, `invalid_type`, `unrecognized_keys`; the change text not echoed | yes | requests 4–6 |
| An invalid change answers VALIDATION_ERROR without a store call | `{"change":"price\u0000calc"}` | 400, issue `path ["change"]`, `custom`; neither `price` nor `calc` in the body | yes (the store-call count is asserted by the unit spec) | request 7 |
| A malformed project id answers VALIDATION_ERROR on impact | the acme-shop id without its dashes | 400, issue `path ["projectId"]`, the id not echoed (the message carries the pattern, not the value) | yes | request 8 |
| An unknown project answers PROJECT_NOT_FOUND on impact | a random UUID, with a change with terms and with five U+1F600 | 404 exactly `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` both times, no UUID | yes | requests 9–10 |
| The impact route is rate limited | `{"change":"abc"}` until the limit (12) | requests 11–12 answer 400 with `x-ratelimit-remaining` 1 and 0; request 13 answers 429 `RATE_LIMITED`, `retry-after: 59` | yes | requests 11–13 |
| The document lists impact with its parameter, body and responses | `GET /docs/json` | `projectId` in `path`, required, `uuid`; body `required ["change"]`, `additionalProperties false`, `change` 5–500, `maxHops` integer 1–3 default 2; two `200` shapes; responses `200, 400, 404, 429, 500` | yes | docs |
| Impact events (no log line contains the change text) | `grep -c descuentos` over the server log of the run | 0 | yes | log |

## Evidence

Request 1 (and 2, identical):

```
HTTP/1.1 200 OK
x-ratelimit-limit: 12
x-ratelimit-remaining: 11
{"status":"answered","direct":[{"symbol":"DiscountApplied","file":"app/Events/DiscountApplied.php","origin":"graph","resolution":"exact","hops":0},{"symbol":"DiscountService","file":"app/Services/DiscountService.php","origin":"graph","resolution":"exact","hops":0},{"symbol":"RecordDiscountAudit","file":"app/Listeners/RecordDiscountAudit.php","origin":"graph","resolution":"exact","hops":0},{"symbol":"PriceCalculator","file":"app/Services/PriceCalculator.php","origin":"graph","resolution":"exact","hops":1},{"symbol":"app/Providers/AppServiceProvider.php","file":"app/Providers/AppServiceProvider.php","origin":"graph","resolution":"exact","hops":1},{"symbol":"app/Providers/EventServiceProvider.php","file":"app/Providers/EventServiceProvider.php","origin":"graph","resolution":"exact","hops":1}],"indirect":[{"symbol":"CheckoutController","file":"app/Http/Controllers/CheckoutController.php","origin":"graph","resolution":"heuristic","hops":2},{"symbol":"OrderController","file":"app/Http/Controllers/OrderController.php","origin":"graph","resolution":"heuristic","hops":2},{"symbol":"RecalculateTotals","file":"app/Jobs/RecalculateTotals.php","origin":"graph","resolution":"heuristic","hops":2},{"symbol":"SendOrderConfirmation","file":"app/Listeners/SendOrderConfirmation.php","origin":"graph","resolution":"heuristic","hops":2}],"tests":[{"symbol":"DiscountServiceTest","file":"tests/Unit/DiscountServiceTest.php","origin":"graph"},{"symbol":"OrderPricingTest","file":"tests/Feature/OrderPricingTest.php","origin":"graph"},{"symbol":"PriceCalculatorTest","file":"tests/Unit/PriceCalculatorTest.php","origin":"graph"}],"docs":[{"path":"README.md","stale":false}],"history":[{"file":"app/Services/ShippingService.php","coChangeRate":1,"prs":[24,33,55],"origin":"git"}],"risk":{"level":"HIGH","rationale":"10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística."}}
```

Requests 3–13 (status line and body):

```
3  200 {"status":"unknown","reason":"no-anchor"}
4  400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["maxHops"],"code":"too_small","message":"Too small: expected number to be >=1"}]}}}
5  400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["maxHops"],"code":"invalid_type","message":"Invalid input: expected int, received number"}]}}}
6  400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":[],"code":"unrecognized_keys","message":"Unrecognized key: \"projectId\""}]}}}
7  400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["change"],"code":"custom","message":"change must not contain U+0000"}]}}}
8  400 {"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["projectId"],"code":"invalid_format","message":"Invalid string: must match pattern /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/"}]}}}
9  404 {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
10 404 {"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
11 400 VALIDATION_ERROR too_small (x-ratelimit-remaining: 1)
12 400 VALIDATION_ERROR too_small (x-ratelimit-remaining: 0)
13 429 {"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":59}}} (retry-after: 59)
```

`GET /docs/json`, the impact operation summarised:

```
{"params":[["projectId","path",true,"uuid"]],"required":["change"],"additionalProperties":false,"change":{"type":"string","minLength":5,"maxLength":500},"maxHops":{"default":2,"type":"integer","minimum":1,"maximum":3},"shapes":[["status","reason"],["status","direct","indirect","tests","docs","history","risk"]],"responses":["200","400","404","429","500"]}
```

No screenshot: the change has no browser interface.

## State

- Before: `project` 2; `query_log` `impact` 4 rows, max `created_at` 2026-11-02 12:24:52.940859+00.
- After the run: 3 new `impact` rows (requests 1, 2 and 3; the 400, 404 and 429 answers wrote none),
  deleted with `DELETE FROM query_log WHERE capability='impact' AND created_at > '2026-11-02 12:24:52.940859+00'` (`DELETE 3`).
- Restored: yes. `project` 2; `query_log` `impact` 4 rows, same max `created_at`.
  `node scripts/dev-processes.mjs stop`: `stopped 1 process trees`.

## Not demonstrated

Scenarios that need a double and cannot be produced against the real system, covered only by
`tests/unit/api/impact.spec.ts`: "Fields the use case adds are not sent", "An unknown report with
events sends no events", "A report's query_not_logged event is logged" (a `query_log` write must fail),
"Domain errors of the impact use case map to their answers" (`INVALID_IMPACT_REQUEST` is unreachable
through the schema, design D4), "Another error on impact answers INTERNAL" (a store failure), "The hop
limit is forwarded only when sent" and "An answered report over the in-memory subset makes no model
call" (both observe calls on doubles). Request 3 of step 6 (`maxHops` 3) is not repeated here.

## Handoff

The change is demonstrably working: every scenario that the real interface can reach answered exactly
as its `THEN` states, and the data was restored. No screenshot or other file was left at the
repository root.
