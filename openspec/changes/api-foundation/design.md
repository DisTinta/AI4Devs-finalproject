## Context

See `proposal.md` → Why. The current state that shapes the approach:

- `packages/api/src/index.ts` is the whole API: Fastify `4.29.1`, `GET /health`, and a `listen` on
  `0.0.0.0:3000` executed on import. It is both the `dev` entry (`tsx watch src/index.ts`) and the
  TypeDoc entry point of the package (`typedoc.json` → `packageOptions.entryPoints: src/index.ts`).
- `packages/api/package.json` depends only on `fastify ^4.28.0` and `@codemind/core`;
  `packages/api/tsconfig.json` has no `references`.
- `.dependency-cruiser.cjs` → `api-no-sql` forbids `packages/api` from importing `pg`: unlike the CLI
  (`packages/cli/src/commands/ask.ts` → `defaultOpenStore`), the API cannot build its own `pg.Pool`.
- The CLI's `ask` is the composition template: `DATABASE_URL` required and trimmed, `llmConfigFromEnv`
  before any connection, `withDailyBudget` only when `config.mode === 'live' && config.dailyBudgetUsd
  !== undefined`, `REPO_ROOT` from `import.meta.url`, and `toFailure` (a fixed message per code, never
  the error's own text).
- Core already throws what the transport maps: `DomainError` with a stable `code`
  (`packages/core/src/knowledge/errors.ts`), `BudgetExhausted` with `spentUsd`, `dailyBudgetUsd`,
  `resetsAt` (`packages/core/src/llm/errors.ts`). `withDailyBudget` lets a `sumCostSince` failure
  reject as is (fail closed).
- Workspace packages resolve to `dist/` through `node_modules` except where a `paths` mapping points
  at `src/` (`vitest.config.ts`, `tests/tsconfig.json`, `packages/cli/tsconfig.run.json`; see
  `docs/project-context.md` → Testing).
- Zod `4.6.5` is installed (core, `adapters/llm`); `z.toJSONSchema(schema, { target: 'openapi-3.0' })`
  is native (checked: a strict object with `z.string().min(5)` gives `type`, `properties`,
  `minLength: 5`, `required`, `additionalProperties: false`).

## Goals / Non-Goals

**Goals:**

- A `buildApp` that tests drive with `inject` and that business routes extend by declaring Zod
  schemas only (validation, serialisation, OpenAPI and error format come for free).
- One place that maps every error to the project's error format, extensible per domain code.
- One reader of the environment for the API, failing loudly at start-up before any connection.

**Non-Goals (design level, besides the proposal's):**

- No change to `packages/core` (no port, no domain type) nor to `packages/cli` (it keeps its own
  `defaultOpenStore` and `DatabaseUnavailable`; reusing the adapter's is a non-goal of DIS-76).
- No error-response schemas declared per route (`4xx`/`5xx` in a route's `response`): the error format
  is documented once in `components.schemas.Error`; DIS-78 decides whether `/ask` references it.
- No verification cache, no `explain` wiring: the dependencies are composed and exposed to future
  routes, not used by a route here.

## Decisions

### U1 — Fastify 5 and the three plugins (D1)

`fastify ^5.12`, `@fastify/swagger ^9.9`, `@fastify/swagger-ui ^6.1`, `@fastify/rate-limit ^11.2`
(latest on 2026-10-16: `5.12.7`, `9.9.2`, `6.1.2`, `11.2.1`). Fastify 4 is out of support since
2025-06-30 and these plugin majors require Fastify 5; the 4-compatible lines (`8.15.0`, `4.2.0`,
`9.1.0`) receive no fixes. The cost is low: the only route today is `/health`; Node `>=20.11` is
already required (`engines`), as Fastify 5 needs. Alternative rejected: stay on Fastify 4 with old
plugin majors (ties the base of every endpoint to unpatched branches). Recorded in the ADR
`docs/adr/20261016-fastify-5-and-zod-json-schema.md` (U11).

### U2 — Zod through own compilers, no type provider (D2)

`plugins/zod-compiler.ts` sets, on the root instance:

- `validatorCompiler({ schema })` → `(data) => { const r = schema.safeParse(data); return r.success ?
  { value: r.data } : { error: new SchemaValidationFailed(r.error.issues) } }`. Fastify marks the
  returned error with status `400`; `SchemaValidationFailed` keeps only `{ path, code, message }` per
  issue (`path` mapped to strings and numbers), never `input`.
- `serializerCompiler({ schema })` → `(data) => JSON.stringify(schema.parse(data))`. A Zod `z.object`
  strips undeclared keys (backend-standards §3: a new column cannot leak); a result that fails its
  schema throws inside the reply, and the error handler answers `500` `INTERNAL`.
- the `transform` given to `@fastify/swagger`, which converts every Zod schema of `body`,
  `querystring`, `params`, `headers` and `response` with `z.toJSONSchema(schema, { target:
  'openapi-3.0' })`.

Request schemas are built with `z.strictObject` (an undeclared key is an `unrecognized_keys` issue);
response schemas with `z.object` and enumerated fields. Alternative rejected:
`fastify-type-provider-zod` — a fifth runtime dependency with its own peer chain for ~50 lines Zod 4
already covers; the ticket lists four dependencies. Types: routes type their handlers with
`z.infer<typeof schema>` explicitly.

A schema that is not a Zod schema (no `safeParse` function) makes `validatorCompiler` and
`serializerCompiler` throw a `TypeError` naming the route's method and URL, so the app fails at
`ready()` instead of answering wrongly; the swagger `transform` passes it through unchanged. The routes
of `@fastify/swagger-ui` declare no `body`/`querystring`/`params`/`headers`/`response` schema, so they
never reach the compilers (see Risks). Issue paths keep only strings and numbers (a symbol key is
dropped from the path).

### U3 — One error handler and its table (D3, D4)

`plugins/error-handler.ts` exports a plain function that `buildApp` calls on the root instance (not
through `register`, so no encapsulation and no `fastify-plugin` dependency; the same for
`plugins/zod-compiler.ts`); it installs `setErrorHandler` and `setNotFoundHandler`, which then apply
to every route registered later. The handler resolves, in this
order, the first match (spec "Single error format"):

1. `SchemaValidationFailed` → `400` `VALIDATION_ERROR`, `details: { issues }`.
2. `RateLimited` (U4) → `429` `RATE_LIMITED`, `details: { retryAfterSeconds }`, and it sets the
   `Retry-After` header to the same number (so header and body cannot disagree).
3. A `DomainError` whose `code` is in `DOMAIN_ERRORS` → its entry. The table is
   `Record<string, { status, message, details(error) }>`; this change has one entry,
   `BUDGET_EXHAUSTED` → `429`, `the daily LLM budget is exhausted`, `{ spentUsd, dailyBudgetUsd,
   resetsAt: resetsAt.toISOString() }` (the CLI's details). DIS-78 adds `PROJECT_NOT_FOUND`,
   `INVALID_EXPLAIN_REQUEST` and `LLM_UNAVAILABLE` here.
4. Fastify's own body errors, recognised by their error `code`, never by status alone:
   `FST_ERR_CTP_EMPTY_JSON_BODY`, `FST_ERR_CTP_INVALID_JSON_BODY` (when the installed Fastify raises
   it) or a `SyntaxError` with `statusCode` 400 raised by the JSON content-type parser → `400`
   `VALIDATION_ERROR` with `details: {}`; `FST_ERR_CTP_BODY_TOO_LARGE` → `413` `PAYLOAD_TOO_LARGE`;
   `FST_ERR_CTP_INVALID_MEDIA_TYPE` → `415` `UNSUPPORTED_MEDIA_TYPE`. The exact codes are confirmed
   against the installed Fastify in the RED step of each scenario.
5. Any other error whose `statusCode` is a 4xx (a route's own 400 or 404 included) → that status with
   `BAD_REQUEST`. `NOT_FOUND` comes only from the not-found handler.
6. Everything else (an unmapped `DomainError`, a `pg` error from `sumCostSince`, a serialisation
   failure, any `5xx`) → `500` `INTERNAL`, `unexpected error`, `{}`; logged with
   `request.log.error({ err: error }, 'unexpected error')`.

Step 3 runs before step 4 so a domain error never reaches the generic mapping. Every message comes
from this file; the error's own `message` is never reused (as `toFailure` of the CLI). The not-found
handler answers `NOT_FOUND` directly. The shared shape is `errorSchema` in `schemas/common.ts`
(`z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(),
z.unknown()) }) })`), used for the OpenAPI component and to type the handler's payload.

### U4 — Rate limit by IP (D5)

`plugins/rate-limit.ts` registers `@fastify/rate-limit` with `global: true`, the in-memory store,
`max` and `timeWindow` from `options.rateLimit`, `keyGenerator: (request) => request.ip`, and
`allowList: (request) => isUnlimited(request.routeOptions.url)` where `isUnlimited` is true for
`/health`, `/docs` and every URL starting with `/docs/`. `trustProxy` stays at Fastify's default
(`false`), so `request.ip` is the socket address and `X-Forwarded-For` cannot rotate the key. The
plugin's `errorResponseBuilder(request, context)` returns `new RateLimited(Math.max(1,
Math.ceil(context.ttl / 1000)))`, an error with `statusCode` 429 that the error handler formats (one
format, U3). The plugin's own `x-ratelimit-*` headers are kept. The plugin counts in its `onRequest`
hook, before validation, so a request rejected with `400` still counts (a script sending invalid
bodies cannot bypass the limit). The not-found handler is not rate-limited (the plugin's global hook
applies to routes only; a 404 does no work and spends nothing).
Default 30 per 60 000 ms: a real `ask` takes seconds to minutes (Ollama on CPU), so 30/min never
touches a human or the web, and cuts a script loop before it spends; the hard spend ceiling remains
`DAILY_BUDGET_USD`. Alternative rejected: a store in Redis (one local process; non-goal).

### U5 — OpenAPI at /docs (D8)

`plugins/openapi.ts` registers `@fastify/swagger` in dynamic mode (`openapi: { openapi: '3.0.3', info:
{ title: 'CODEMIND API', version: '1.0.0', description }, servers: [{ url: 'http://localhost:3000',
description: 'Local' }], components: { schemas: { Error: z.toJSONSchema(errorSchema, { target:
'openapi-3.0' }) } } }`, `transform` of U2), then `@fastify/swagger-ui` with `routePrefix: '/docs'`
(its routes are hidden from the document; the JSON is at `/docs/json`). It is registered before any
route, so every route with a schema appears on its own. `routes/health.ts` declares `response: { 200:
healthResponseSchema }` (`z.object({ status: z.literal('ok') })`) so `/health` is documented.

### U6 — Module layout: app, start, server, index (D7)

- `app.ts` — `buildApp(deps: AppDeps, options: AppOptions): Promise<FastifyInstance>`. Creates Fastify
  with `bodyLimit: 65_536` and `logger: options.logger ?? false`, registers in order the Zod
  compilers, the error handler, OpenAPI, rate limit, and the health route, awaiting every `register`
  (swagger, swagger-ui, rate limit) before returning, so routes added afterwards and before `ready()`
  get their `onRoute` hooks; decorates the instance
  with `deps` (read-only, typed by module augmentation) for the business routes of DIS-78/DIS-9.
  It neither listens nor reads `process.env`, and returns an instance that is not ready yet, so a
  test (or a later route module) can still add routes before `ready()`. `AppDeps` = `{ store:
  StorePort; llm: LlmPort; source: SourceTreePort; now: () => Date; workspaceRoot: string }`;
  `AppOptions` = `{ rateLimit: { max: number; windowMs: number }; logger?: FastifyServerOptions['logger'] }`.
- `start.ts` — `startApi(env, seams?)`: `composeFromEnv` → `buildApp(deps, { rateLimit, logger: {
  level: 'info' } })` → `app.addHook('onClose', close)` → `listen({ port, host })`; on any failure after
  the store was opened it closes the app (or the store if the app does not exist yet) and rethrows.
  Returns `{ app, address }`. Covered only by the database test of U10, so it is excluded from
  `mutate` with `server.ts`.
- `startup-failure.ts` — `startupFailure(error)` maps a start-up error to the line of spec "Start-up
  failure" (`systemCode` only when the error's `code` matches `^E[A-Z]+$`, the system-code part of
  the LLM adapter's `SYSTEM_CODE`, `packages/adapters/llm/src/openai-compatible-llm.ts:113`; the
  `UND_ERR_*` codes of `fetch` cannot come from a listen). Unit-tested and mutated.
- `server.ts` — the process shell, excluded from mutation: `startApi(process.env)`; on rejection it
  writes `JSON.stringify({ error: startupFailure(error) })` and a line feed to stderr and sets
  `process.exitCode = 1`; on success it installs `SIGINT`/`SIGTERM` handlers (`once`) that run
  `app.close()` (which ends the pool through `onClose`) and exit `0` (`1` if closing fails).
- `index.ts` — re-exports only (`buildApp`, `AppDeps`, `AppOptions`, `apiConfigFromEnv`, `ApiConfig`,
  `ApiConfigError`, `composeFromEnv`, `ComposeSeams`, `startApi`, `startupFailure`, `errorSchema`,
  `healthResponseSchema`); importing it starts nothing, and TypeDoc documents it.
- `packages/api/tsconfig.run.json` (new, as the CLI's DIS-86 D10): maps `@codemind/core`,
  `adapter-git`, `adapter-llm`, `adapter-store-postgres` to their `src/`; `dev` becomes
  `tsx watch --tsconfig tsconfig.run.json src/server.ts`, so the API never runs a stale `dist/`.

`HOST` defaults to `127.0.0.1`, not `0.0.0.0`: the API has no authentication and closed decision 1 is
"evidence is local only"; exposing it is an explicit choice.

### U7 — Configuration and composition (D6)

`composition.ts` is the API's only reader of `env`:

- `apiConfigFromEnv(env): ApiConfig` (`{ databaseUrl, port, host, rateLimit: { max, windowMs } }`)
  applies the table of spec "Configuration from the environment": trim; empty → default; integers
  match `^[0-9]+$` and fall in range; first failure in table order throws `ApiConfigError` (`code
  'INVALID_CONFIG'`, `variable`, message `<VARIABLE> is missing or invalid; see .env.example`). The
  window's upper bound (86 400 000 ms) keeps the rate-limit timer under Node's 2^31−1 ms timer limit.
- `composeFromEnv(env, seams = {})`: `apiConfigFromEnv`, then `llmConfigFromEnv` (throws
  `LlmConfigError`), and only then `openStore(databaseUrl)` (default `openPostgresStore(url, {
  applicationName: 'codemind-api' })`); `llm = createLlm(cfg)` wrapped in `withDailyBudget(llm, {
  store, dailyBudgetUsd, now })` only when `cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined`;
  `source = seams.source ?? createGitSourceTree()`; `now = seams.now ?? (() => new Date())`;
  `workspaceRoot` = the repository root from `import.meta.url` (three levels up from
  `packages/api/src/` or `dist/`). Returns `{ config, deps, close }`. Seams: `openStore`, `createLlm`,
  `source`, `now` (as `AskCommandDeps`).
- It does not read `AUTHOR_HASH_SALT` nor `ALLOWED_REPOS_DIR` (needed by `POST /index`, DIS-9).
- One code, `INVALID_CONFIG`, for a missing and a malformed variable: the fix is the same (set the
  variable `details.variable` names), and `LLM_CONFIG_INVALID` already covers both cases for the LLM
  variables. The CLI's `MISSING_CONFIG` for `DATABASE_URL` stays as it is (CLI untouched, non-goal);
  the readme's error table lists both.

### U8 — `openPostgresStore` in the adapter

`packages/adapters/store-postgres/src/open-store.ts`: `openPostgresStore(databaseUrl, {
applicationName })` → `{ store, close }`, the behaviour of the CLI's `defaultOpenStore`: `pg.Pool` with
`connectionTimeoutMillis: 10_000`, `application_name`, `pool.on('error', () => undefined)`, a probe
`connect()`/`release()`, and on failure `pool.end()` then `throw new DatabaseUnavailable()` (new class
in the adapter, message `cannot connect to the database`, no `cause`). Exported from the adapter's
`index.ts` with `OpenedStore`. The API's `startupFailure` maps it by `instanceof`. The idle-client
`error` listener keeps a dropped pooled connection from crashing the process (the next query reports
it), as in the CLI. `pg` gives the URL's own `application_name` precedence over the configured one,
which the spec pins ("The URL's application name wins").

### U9 — Limits and logs (D9)

`bodyLimit` 65 536 bytes: a 1 000-code-point question, even with every character escaped as a
`\uXXXX` sequence, stays under 13 KiB. The logger is Fastify's pino with its default serializers
(request: method, URL, host, remote address and port; response: status; plus response time); no
body is logged, so a question never reaches the log. `logger: false` by default in `buildApp` (tests);
`startApi` passes `{ level: 'info' }`. A test passes `{ level: 'info', stream }` to assert on lines.

### U10 — Tests and quality (D10)

- The `inject` specs need no database and must run under Stryker, whose Vitest config
  (`vitest.stryker.config.ts`) excludes `tests/integration/**`; so they live in `tests/unit/api/` and
  never import `tests/integration/helpers/db.ts`: `health-docs.spec.ts`, `errors.spec.ts` (error
  format, validation, serialisation, domain errors, logging), `rate-limit.spec.ts`. A helper
  `tests/unit/api/support.ts` builds the app with doubles and registers the test routes
  `POST /api/test-only`, `GET /api/test-query` and `GET /api/test-throw` (the error to throw is chosen
  per test) before `ready()`. "Health answers ok without touching the store" wraps the three ports in
  a counting `Proxy` (every method call counted), because the in-memory store's `calls` does not count
  `listProjects` nor `sumCostSince`.
- `tests/unit/api/composition.spec.ts` (config table, composition seams, `workspaceRoot`) and
  `tests/unit/api/startup-failure.spec.ts`.
- `tests/integration/api/server.spec.ts` (outside Stryker): the process scenario spawns
  `process.execPath` with the `tsx` CLI resolved from `node_modules` (`tsx/cli`), `--tsconfig
  packages/api/tsconfig.run.json packages/api/src/server.ts`, no shell (Windows-safe), without
  `DATABASE_URL` (no database); and, under `describeWithDatabase`, "The API answers on its address
  and closes its connections" (`startApi` on a free port taken from `net`, `fetch`, `app.close()`,
  then `pg_stat_activity` polled for up to 2 s as `tests/integration/cli/ask-command.spec.ts`).
- `tests/integration/store/open-store.spec.ts`: the two database scenarios under
  `describeWithDatabase`, migrating with `migrateSharedDatabase()` (a fifth file that migrates the
  shared DB: `docs/project-context.md` → Testing is updated), sessions polled for up to 2 s; the
  unreachable one needs no database.
- Each `#### Scenario:` maps to exactly one test with the same name (backend-standards §7).
- Stryker: `mutate` adds `packages/api/src/**/*.ts`, `!packages/api/src/server.ts` and
  `!packages/api/src/start.ts`;
  `disableTypeChecks` adds `packages/api`. The `mutation` job's `business` paths filter in `ci.yml`
  adds `packages/api/**`. Project threshold (break 80).

### U11 — ADR

`docs/adr/20261016-fastify-5-and-zod-json-schema.md` via `/adr-new`: Fastify 5 (U1) and Zod as the
single schema language through own compilers and `z.toJSONSchema` (U2). Both span every future route
and are costly to revert. The "why" is the agent's decision under the autonomous-run ADR, marked so.

## Risks / Trade-offs

- [A serializer error might bypass the custom handler in Fastify 5] → the scenario "A result that
  breaks its response schema answers INTERNAL" pins it; if Fastify answers it outside the handler,
  the serializer catches the Zod failure and throws a plain error from inside the reply hook the
  handler sees, and the scenario stays.
- [`@fastify/swagger-ui` `GET /docs` may redirect to `/docs/static/index.html` depending on version] →
  the scenario follows at most one redirect.
- [`127.0.0.1` vs `localhost`: on some systems `localhost` resolves to `::1` first] → browsers and
  `curl` fall back to IPv4; `HOST=::1` or `0.0.0.0` remains available; documented in the readme.
- [`npm run dev` without `DATABASE_URL` now fails at once and `concurrently --kill-others-on-fail`
  stops the web too] → intended (backend-standards §9, fail loudly); `make up` exports `.env`; the
  readme says it.
- [Client IPs in request logs] → local process, stdout only, nothing persisted; noted in the privacy
  check.
- [In-memory rate-limit counters reset on restart] → accepted: one local process; the spend ceiling is
  in the database.
- [`/docs` opened at `http://127.0.0.1:3000` while `servers[0]` is `http://localhost:3000`] → "Try it
  out" becomes cross-origin and there is no CORS (non-goal); the readme points to
  `http://localhost:3000/docs`.
- [A plugin route declaring a JSON (non-Zod) schema] → the compilers throw a `TypeError` naming the
  route at `ready()` (U2); the `/docs` scenarios catch it at once.

## Migration Plan

No data migration. Install the dependencies (`npm install` updates `package-lock.json`); `npm run dev`
and `make up` use `server.ts`. Rollback = revert the change; nothing persistent depends on it.

## Follow-ups

Every finding of the spec audit and the pre-merge checks is fixed in this change or gets an A/B/C/D
destination here (`docs/project-context.md` → Tracking deferred findings).

- **B — the cache-serving notice of `BUDGET_EXHAUSTED`** (spec audit P1). DIS-59 asks that the `429`
  "indicates the system keeps serving the cache". Whether an answer came from the cache is part of
  `POST /ask`, so DIS-78 owns it: it may add that notice to `details` (status, code, message and the
  three numbers stay). Recorded in the `[enhanced]` of DIS-78.
- **C — the CLI keeps its own `defaultOpenStore`, `OpenedStore`, `DatabaseUnavailable` and
  `CONNECTION_TIMEOUT_MS`** (`packages/cli/src/commands/ask.ts:37,134`, `compose-index.ts:20`),
  duplicated by `openPostgresStore` (spec audit 8.2). Reusing it is a DIS-76 non-goal; destination: a
  Spanish `Deuda: api-foundation` checklist comment on DIS-76 at archive time, plus this line.
