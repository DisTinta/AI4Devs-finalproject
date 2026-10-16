# Verify Against Spec — api-foundation (DIS-76)

- Date: 2026-10-16
- Change: api-foundation
- Step: 17.5 `/verify-against-spec`
- Scope: `openspec/changes/api-foundation/specs/api-foundation/spec.md` and
  `specs/graph-store/spec.md` against `git diff origin/feature/entrega-2-CRN...HEAD` (commit `156b108`)
  plus the review fixes of this step. Run unattended (autonomous-run ADR) by the review step's agent,
  a fresh context distinct from the one that implemented the change.

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Single error format (table, fixed messages, `details` object, `application/json`) | `packages/api/src/plugins/error-handler.ts:18-31,70-98`; `schemas/common.ts:7-13` | `tests/unit/api/errors.spec.ts:17-137` |
| Request validation by schema (issues `{ path, code, message }`, no value, handler not run, strict body) | `packages/api/src/plugins/zod-compiler.ts:17-60` | `errors.spec.ts:139-196`; `zod-compiler.spec.ts` |
| Response serialisation by schema (drop undeclared, `500` on break) | `zod-compiler.ts:55-58`, `error-handler.ts` (`INTERNAL`) | `errors.spec.ts:197-221` |
| Domain error mapping (`BUDGET_EXHAUSTED` only, others `INTERNAL`) | `error-handler.ts:43-58,84-87` | `errors.spec.ts:223-253` |
| Liveness route (no port touched) | `packages/api/src/routes/health.ts:11-13` | `health-docs.spec.ts:15-30` |
| OpenAPI document at /docs (3.0.3, info, server, `Error`, `/docs` hidden, body schema) | `packages/api/src/plugins/openapi.ts:17-34`; `zod-compiler.ts:80-92` | `health-docs.spec.ts:33-70` |
| Rate limit by IP (socket IP, `onRequest` count, exemptions, `Retry-After` = body, unknown route not counted) | `packages/api/src/plugins/rate-limit.ts:25-61`; `error-handler.ts` (`RateLimited` branch) | `rate-limit.spec.ts:28-120`; `app.spec.ts` (building blocks) |
| Request body limit and logging (64 KiB; `req` = method, url, host, address, port; no body, no `version`; `500` logged at `error`) | `packages/api/src/app.ts:10,57-80,91`; `error-handler.ts` (`request.log.error`) | `errors.spec.ts:61-73,255-290` |
| Configuration from the environment (trim, defaults, order, digits only, ranges, `INVALID_CONFIG` + `variable`, no value) | `packages/api/src/composition.ts:42-90` | `composition.spec.ts:28-70` and boundaries |
| Composition from the environment (checks before the store; `codemind-api`; ceiling only live + budget; `workspaceRoot`; close on app close) | `composition.ts:110-135`; `start.ts:27-38` | `composition.spec.ts:109-190`; `tests/integration/api/server.spec.ts:82-102` |
| Start-up failure (one stderr line, exit 1, mapping table, `systemCode` pattern, store closed after a listen failure) | `startup-failure.ts:26-46`; `server.ts`; `start.ts:33-36` | `startup-failure.spec.ts`; `server.spec.ts:49-80,104-122` |
| graph-store → Opening a pooled store from a URL (probe, `DatabaseUnavailable` fixed message, 10 s timeout, URL's `application_name` wins, `close`) | `packages/adapters/store-postgres/src/open-store.ts:46-60` | `tests/integration/store/open-store.spec.ts:38-110` |

Dependencies: every import of `packages/api/src` (`fastify`, `@fastify/swagger`, `@fastify/swagger-ui`,
`@fastify/rate-limit`, `zod`, the four `@codemind/*` workspaces) is declared in
`packages/api/package.json:13-21`; `pg` is imported only by the adapter (`api-no-sql` holds).
Authorisation: the spec requires none (the API has no authenticated route in this change).

## 2. Requirements missing or partial (found, and fixed in this change)

| # | Severity | Requirement quoted | What was absent | Fix |
|---|---|---|---|---|
| V1 | Major | "Single error format": "No route matches the method and URL → 404 `NOT_FOUND`" | A `POST` with a malformed or oversized JSON body to a route that does not exist answered `400` `VALIDATION_ERROR` / `413` `PAYLOAD_TOO_LARGE` (Fastify parses the body before the not-found handler), while an XML body to the same URL answered `404` (seen in `/show-spec-working`). | TDD: new scenario "A body error on a route that does not exist answers NOT_FOUND" in the delta spec and its test (`errors.spec.ts`), RED (`expected 400 to be 404`) → GREEN with `request.is404 ? NOT_FOUND : answerOf(error)` in `error-handler.ts`. |
| V2 | Minor | "Configuration from the environment" / "Start-up failure": every message says `see .env.example` | `.env.example` did not list `PORT`, `HOST`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` (task 15.3 open). | Added the four variables, empty, with their rule and default (Spanish comments, as the rest of the file). |
| V3 | Minor | "Start-up failure": "A start-up failure raised after the store was opened SHALL close the store's connections" | `composeFromEnv` opened the store and then built the model (`createLlm`) and the source tree; a throw there would leave the pool open, since `startApi` only closes what `composeFromEnv` returned. | TDD: test "builds the model before opening the store, so a model that cannot be built opens no connection" (`composition.spec.ts`), RED (`expected [ Array(1) ] to deeply equal []`) → GREEN by building the model, the source tree and the clock before `openStore`. |

No other requirement is missing or partial.

## 3. Unspecified behaviour

| Behaviour | Where | Decision |
|---|---|---|
| `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` response headers on limited routes | `rate-limit.ts:52-60` (plugin default, design U4) | **Added to the spec** (sentence in "Rate limit by IP"): informational, wanted by the design, carry no request value. |
| OpenAPI `info.description` and `servers[0].description: 'Local'` | `openapi.ts:24-28` | **Kept, D** (design U5): documentation text of the viewer, no contract effect. |
| A route schema that is not a Zod schema makes `ready()` throw a `TypeError` naming the route | `zod-compiler.ts:36-39` | **Kept, D** (design U2, tested in `zod-compiler.spec.ts`): developer-facing guard, no runtime contract. |
| `pool.on('error', () => undefined)` swallows idle client errors | `open-store.ts:52` | **Kept, D** (design U8): prevents a dropped idle connection from crashing the process; the next query reports it. |
| `SIGINT`/`SIGTERM` close the app and exit `0` (`1` if closing fails) | `server.ts:12-20` | **Kept, D** (design U6, tasks 8.3 and 13.5): process lifecycle, outside the HTTP contract. |
| The OpenAPI transform also converts `params` and `headers` schemas | `zod-compiler.ts:63,84-86` | **Kept, D** (design U2): the spec says "its request schema"; params and headers are request parts. |

Weak-test check: every scenario test asserts at least what its `THEN` states (exact bodies with
`toEqual`, handler call counters, `Retry-After` equal to `retryAfterSeconds`, sentinels absent from
the whole log and from stdout + stderr, sessions polled for 2 s). None is weaker than its scenario.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An unknown route answers NOT_FOUND | `tests/unit/api/errors.spec.ts:17` | green |
| A body error on a route that does not exist answers NOT_FOUND (added) | `tests/unit/api/errors.spec.ts:121` | green |
| A malformed or empty JSON body answers VALIDATION_ERROR | `tests/unit/api/errors.spec.ts:45` | green |
| A body over the limit answers PAYLOAD_TOO_LARGE | `tests/unit/api/errors.spec.ts:61` | green |
| An unsupported content type answers UNSUPPORTED_MEDIA_TYPE | `tests/unit/api/errors.spec.ts:75` | green |
| Another 4xx error answers BAD_REQUEST with its status | `tests/unit/api/errors.spec.ts:95` | green |
| A 400 that is not a body error answers BAD_REQUEST | `tests/unit/api/errors.spec.ts:108` | green |
| An unexpected error answers INTERNAL without its text | `tests/unit/api/errors.spec.ts:30` | green |
| A field that fails its rule answers VALIDATION_ERROR with its issue | `tests/unit/api/errors.spec.ts:140` | green |
| An undeclared key answers VALIDATION_ERROR | `tests/unit/api/errors.spec.ts:164` | green |
| A query string that fails its schema answers VALIDATION_ERROR | `tests/unit/api/errors.spec.ts:178` | green |
| Undeclared response fields are dropped | `tests/unit/api/errors.spec.ts:198` | green |
| A result that breaks its response schema answers INTERNAL | `tests/unit/api/errors.spec.ts:210` | green |
| An exhausted budget answers 429 BUDGET_EXHAUSTED | `tests/unit/api/errors.spec.ts:224` | green |
| A domain error without a mapping answers INTERNAL | `tests/unit/api/errors.spec.ts:240` | green |
| Health answers ok without touching the store | `tests/unit/api/health-docs.spec.ts:15` | green |
| The document lists health, the error schema and a route's body schema | `tests/unit/api/health-docs.spec.ts:33` | green |
| The viewer is served as HTML | `tests/unit/api/health-docs.spec.ts:57` | green |
| The request beyond the limit answers RATE_LIMITED | `tests/unit/api/rate-limit.spec.ts:28` | green |
| The limit is per IP and ignores forwarding headers | `tests/unit/api/rate-limit.spec.ts:50` | green |
| Health and the documentation are not limited | `tests/unit/api/rate-limit.spec.ts:66` | green |
| A request that matches no route is not counted | `tests/unit/api/rate-limit.spec.ts:83` | green |
| Rejected requests count towards the limit | `tests/unit/api/rate-limit.spec.ts:102` | green |
| The request log holds no body and a 500 logs its cause | `tests/unit/api/errors.spec.ts:256` | green |
| Defaults apply to unset and empty variables | `tests/unit/api/composition.spec.ts:29` | green |
| An invalid variable fails with its name and without its value | `tests/unit/api/composition.spec.ts:44` | green |
| Configuration errors are raised before the store is opened | `tests/unit/api/composition.spec.ts:110` | green |
| Evaluation mode uses the model as built | `tests/unit/api/composition.spec.ts:134` | green |
| A daily budget stops the model call | `tests/unit/api/composition.spec.ts:149` | green |
| The composed repository root is the repository's top directory | `tests/unit/api/composition.spec.ts:175` | green |
| The API answers on its address and closes its connections | `tests/integration/api/server.spec.ts:82` | green |
| A missing DATABASE_URL stops the process with one line | `tests/integration/api/server.spec.ts:51` | green |
| Start-up errors map to their line | `tests/unit/api/startup-failure.spec.ts:10` | green |
| A listen failure closes the store | `tests/integration/api/server.spec.ts:104` | green |
| An opened store answers and closes its connections | `tests/integration/store/open-store.spec.ts:64` | green |
| The URL's application name wins | `tests/integration/store/open-store.spec.ts:84` | green |
| An unreachable database fails without leaking the URL | `tests/integration/store/open-store.spec.ts:39` | green |

## Outcome

- Verdict after the fixes: conforms. V1 (Major), V2 and V3 (Minor) fixed in this change; block 3
  resolved (one addition to the spec, five kept with destination D in `design.md` → Follow-ups).
- Verification re-run after the fixes: `npx vitest run tests/unit/api` → 7 files, 52 tests passed;
  full suite, lint, typecheck in the addendum of the adversarial review report.
