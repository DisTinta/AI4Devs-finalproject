## Why

`packages/api` is today one file (`src/index.ts`): Fastify 4 with `GET /health`, a `listen` on
`0.0.0.0:3000` that runs as soon as the module is imported, and a `TODO` for the three business
endpoints. There is no error format, no validation, no OpenAPI document, no rate limit and no
composition of the real adapters, so every business route (`POST /ask` in DIS-78, `POST /index` in
DIS-9, `POST /impact` in CM-HU-16b) would have to invent them. `readme.md` §4 promises that "Todos los
errores usan el formato `Error`" and that every request body is validated by schema, §1.4 promises
`api http://localhost:3000 (openapi at /docs)`, and §2.5 point 6 promises rate limiting by IP.
DIS-18 left the `BUDGET_EXHAUSTED` → `429` mapping for "the API error handler", which does not exist.

This is DIS-76 (CM-HU-12.1), the transversal base of CM-HU-12 (DIS-59). Its user story: "Como
desarrolladora que va a exponer `explain`, `impact` e `index` por HTTP, quiero una base Fastify que
valide con Zod, documente en `/docs`, limite por IP, devuelva todos los errores con el formato `Error`
y componga los adaptadores reales desde el entorno, para que cada endpoint de negocio solo tenga que
declarar su esquema y delegar en core." The DoD: `GET /health` and `/docs` answer; a test `400` and a
test `429` come out in the `Error` format; tests use `inject`.

The decisions D1–D11 were taken by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-76 `[enhanced]` description on
2026-10-16; the author reviews them afterwards.

## What Changes

- **BREAKING (dev entry):** `packages/api` moves to **Fastify 5** (`fastify ^5.12`; Fastify 4 is out
  of support since 2025-06-30 and the current `@fastify/swagger`, `@fastify/swagger-ui` and
  `@fastify/rate-limit` require 5). `npm -w packages/api run dev` now runs `src/server.ts`; importing
  `src/index.ts` no longer starts a server. `npm run dev` without `DATABASE_URL` now prints one
  `INVALID_CONFIG` line and the API does not start (`make up` exports `.env`, so it is unaffected).
- New `buildApp(deps, options)` (`packages/api/src/app.ts`): builds the instance without listening
  and without reading the environment, so tests drive it with `app.inject`.
- One error handler: every error response is `{ error: { code, message, details } }` with a fixed
  table of codes (`VALIDATION_ERROR` 400, `NOT_FOUND` 404, `PAYLOAD_TOO_LARGE` 413,
  `UNSUPPORTED_MEDIA_TYPE` 415, `BAD_REQUEST` other 4xx, `RATE_LIMITED` 429, `BUDGET_EXHAUSTED` 429,
  `INTERNAL` 500). Messages are fixed strings; the message of a domain or unknown error and any
  received value never reach a response.
- Zod as the single schema language of the API through own validator and serializer compilers (no
  `fastify-type-provider-zod`); response schemas drop undeclared fields.
- OpenAPI 3.0.3 generated from the route schemas, served at `/docs` (UI) and `/docs/json`, with
  `info` and `servers` of `readme.md` §4 and `components.schemas.Error`.
- Rate limit by IP (`@fastify/rate-limit`, in memory, `trustProxy` off): 30 requests per 60 s by
  default (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`); `/health` and `/docs*` exempt.
- Composition from the environment (`packages/api/src/composition.ts`), the only reader of `env` in
  the API: `DATABASE_URL` (required), `PORT` (3000), `HOST` (`127.0.0.1`, no longer `0.0.0.0`),
  `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, plus `llmConfigFromEnv`; every check before any
  connection; the daily budget wraps the model only in live mode with a ceiling.
- New `openPostgresStore(databaseUrl, { applicationName })` in `@codemind/adapter-store-postgres`
  (`api-no-sql` forbids `pg` in the API): pooled store, probe connection, `DatabaseUnavailable`
  without the driver's text, `close()`.
- Body limit 64 KiB; request logs without the body.

Non-goals (DIS-76 `[enhanced]` §4): the business routes (`POST /ask`, `/index`, `/impact`) and their
mappings (`PROJECT_NOT_FOUND` → 404, `INVALID_EXPLAIN_REQUEST`, `LLM_UNAVAILABLE`); authentication;
CORS and security headers (`helmet`); distributed or per-user rate limiting and trusting
`X-Forwarded-For`; a readiness probe with the database (`/ready`); refactoring the CLI to reuse
`openPostgresStore`.

## Capabilities

### New Capabilities

- `api-foundation`: the HTTP base of the API — the single error format and its code table, Zod
  validation and response serialisation, the OpenAPI document at `/docs`, rate limiting by IP, the
  liveness route `/health`, the body limit and request logging, and the composition and validation of
  the environment at start-up.

### Modified Capabilities

- `graph-store`: adds the requirement "Opening a pooled store from a URL" (`openPostgresStore`), the
  adapter entry point the API composes. No existing requirement changes.

## Impact

- **Code:** `packages/api/src/` (new `app.ts`, `start.ts`, `startup-failure.ts`, `server.ts`,
  `composition.ts`,
  `plugins/{error-handler,openapi,rate-limit,zod-compiler}.ts`, `schemas/common.ts`,
  `routes/health.ts`; `index.ts` becomes re-exports only); `packages/api/tsconfig.run.json` (new,
  for `dev`);
  `packages/adapters/store-postgres/src/open-store.ts` (new) and its `index.ts`. No change in
  `packages/core` (no port, no domain type) nor in `packages/cli`.
- **Dependencies (justified in the PR, D1/D2):** `packages/api` gains `fastify ^5.12` (from `^4.28`),
  `@fastify/swagger ^9.9`, `@fastify/swagger-ui ^6.1`, `@fastify/rate-limit ^11.2`, `zod ^4.6.5` (the
  version core uses), and the workspace packages `@codemind/adapter-llm`,
  `@codemind/adapter-store-postgres`, `@codemind/adapter-git`. `packages/api/tsconfig.json` gains
  project references like the CLI's. ADR `docs/adr/20261016-fastify-5-and-zod-json-schema.md`.
- **Config:** new optional variables `PORT`, `HOST`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`;
  `DATABASE_URL` now required by the API too (`.env.example`, `readme.md` variables table).
- **Quality gates:** Stryker `mutate` adds `packages/api/src/**/*.ts` except `server.ts` and
  `start.ts` (process shells covered by database or process tests); the `inject` specs need no
  database and live in `tests/unit/api/` so Stryker runs them (its Vitest config excludes
  `tests/integration/**`); tests import the API sources by relative path, as the CLI tests do, so no
  new Vitest alias is needed; `api-no-sql` stays green.
- **Privacy / security:** the API listens on `127.0.0.1` by default (no authentication; closed
  decision 1 "evidence is local only"); request logs (pino, stdout, not persisted) carry method, URL,
  status and the client IP of a local caller, never the body, so a question never reaches the log;
  error responses never echo an input value, a database URL or a driver message; environment values
  are never printed. The full error of a `500` goes to the server log only.
