# Manual Interface Testing Report

- Date: 2026-11-02
- Change: http-impact
- Step: 6. Backend: Manual Interface Testing

*Agent's text (autonomous run, apply step). Every command ran from Git Bash on Windows 11 against the
real API and the local PostgreSQL (`docker compose`), through one script of the session scratchpad
that wraps the curls; nothing was set with `$env:`.*

## Preconditions (6.1)
- Database up and migrated; `npm run cli -- projects` lists `acme-shop a794456d-6d1b-5b55-a360-13fec83dc7bc` and `task-api fba8e26b-1fb4-5b74-8352-d5d71ded7fe8` (so `db:seed` did not run).
- Indicators: `project` 2; `query_log` `impact` 4 rows, max `created_at` 2026-11-02 12:24:52.940859+00.

## Start and stop (6.2)
One Bash call: `RATE_LIMIT_MAX=12 npm -w packages/api run dev` started with `&`, `GET /health` polled until it answered (`200 {"status":"ok"}`), the requests below, and `node scripts/dev-processes.mjs stop` at the end of the same call (`stopped 1 process trees`).

## Success paths (6.3)

| # | Request (`POST /api/projects/<id>/impact`) | Status | Result |
|---|---|---|---|
| 1 | acme-shop id, `{"change":"cambiar los descuentos de DiscountService","maxHops":2}` | 200 | keys exactly `status, direct, indirect, tests, docs, history, risk`; see below |
| 2 | the id in upper case, same body | 200 | body byte-identical to 1 (`content-length: 1947` both) |
| 3 | same change, `"maxHops":3` | 200 | `indirect` also holds `GET /orders/{order}`, `OrderObserver` (`hops` 3) and `POST /checkout`; risk rationale `13 ficheros afectados, …` |
| 4 | `{"change":"cómo se gestionan los reembolsos"}` (JSON escape, ASCII bytes) | 200 | exactly `{"status":"unknown","reason":"no-anchor"}` |
| - | `GET /docs/json` | 200 | lists `"/api/projects/{projectId}/impact"` |

Body of request 1 (formatted): `direct` holds `DiscountApplied`, `DiscountService` and `RecordDiscountAudit`
(`hops` 0), `PriceCalculator` and the two service providers (`hops` 1, `resolution` `exact`);
`indirect` holds `CheckoutController`, `OrderController`, `RecalculateTotals` and `SendOrderConfirmation`
(`hops` 2, `heuristic`); `tests` holds `DiscountServiceTest`, `OrderPricingTest` and `PriceCalculatorTest`
(`origin` `graph`); `docs` is `[{"path":"README.md","stale":false}]`; `history` is
`[{"file":"app/Services/ShippingService.php","coChangeRate":1,"prs":[24,33,55],"origin":"git"}]`; `risk` is
`{"level":"HIGH","rationale":"10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística."}`.
Every entry of `direct` and `indirect` has exactly `symbol, file, origin, resolution, hops`; no `events`,
`usage`, `projectId`, UUID nor change text in the body.

## Error paths (6.4)

| # | Request | Status | Body |
|---|---|---|---|
| 5 | `maxHops` 4 | 400 | `VALIDATION_ERROR`, `invalid request`, issue `path ["maxHops"]` `too_big` |
| 6 | `change` `"abc"` | 400 | `VALIDATION_ERROR`, issue `path ["change"]` `too_small` |
| 7 | extra key `hops` | 400 | `VALIDATION_ERROR`, issue `unrecognized_keys` naming `hops`, no value |
| 8 | `/api/projects/not-a-uuid/impact` | 400 | `VALIDATION_ERROR`, issue `path ["projectId"]` `invalid_format`, the id not echoed |
| 9 | random UUID with a change with terms | 404 | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` |
| 10 | random UUID, change of five U+1F600 (JSON escapes) | 404 | the same exact body |
| 11, 12 | `{"change":"abc"}` | 400 | as 6 (`x-ratelimit-remaining` 1, then 0) |
| 13 | `{"change":"abc"}` | 429 | `{"error":{"code":"RATE_LIMITED","message":"too many requests","details":{"retryAfterSeconds":59}}}` with `retry-after: 59` |
| 14 | `{"change":"abc"}` | 429 | the same |

The 429 is the 13th request to `/api/projects/*/impact` in the window (`x-ratelimit-limit: 12`; `/health`
and `/docs/json` did not count), with `Retry-After` the integer 59.

## Restoration (6.5)
`SELECT count(*) FROM query_log WHERE capability = 'impact' AND created_at > '2026-11-02 12:24:52.940859+00'`
gave 4, as expected (requests 1 to 4; the 400, 404 and 429 answers wrote none); those rows were deleted
(`DELETE 4`). Post-state: `project` 2, `query_log` `impact` 4 rows, max `created_at` 2026-11-02
12:24:52.940859+00, equal to 6.1. `node scripts/dev-processes.mjs stop`: no process left.

## PowerShell (6.6)
No PowerShell check applies: this change adds and recaptures no command of `docs/DEMO.md` (only the
Paso 4 "pending" sentence changes), so there is no `pwsh` / `powershell.exe` capture to make and
nothing is left for the author (design Follow-ups E8).

## Outcome
- Status: PASS
- Blocking issues: none
