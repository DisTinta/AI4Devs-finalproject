## Context

DIS-76 (`api-foundation`, archived 2026-10-16) left `packages/api` with `buildApp(deps, options)`:
Zod compilers (`plugins/zod-compiler.ts`), one error handler with the global `DOMAIN_ERRORS` table
(`plugins/error-handler.ts`, only `BUDGET_EXHAUSTED` → `429`), the OpenAPI document at `/docs`
(`plugins/openapi.ts`), the rate limit by IP for every route registered after it
(`plugins/rate-limit.ts`) and `GET /health`. `app.deps` holds `store`, `llm` (already wrapped by
`withDailyBudget` in live mode with `DAILY_BUDGET_USD`), `source`, `now` and `workspaceRoot`. No
business route exists.

Core's `explain(dependencies, request)` answers a question in one pass and returns either an
`AnsweredExplain` (`kind`, `persisted`, `answer`, `statements[{text,type,status,warning?,verification,
evidenceIds}]`, `evidence[{id,fileId,path,startLine,endLine,excerpt}]`, `priorClaims`, `events`,
`usage`, `confidence`) or an `UnknownExplain` (`answer: 'UNKNOWN'`, `reason`, `message` only for
`llm-required`, `statements: []`, `evidence: []`, `events`). Its request schema is strict
(`projectId`, `question` 1–1 000 code points, `tokenBudget`, `hops`); it throws `InvalidExplainRequest`,
`ProjectNotFound`, `SourceUnavailable`, `LlmUnavailable`, `BudgetExhausted` and lets other failures
through. It needs a `VerificationCache`. The CLI `ask` (`packages/cli/src/commands/ask.ts`) is the
reference composition: one cache per run, events to stderr by level, fixed messages per error code.

`readme.md` §4 is the public contract of `/ask`. The DIS-78 `[enhanced]` description fixes the
decisions D1–D9 (agent as lead engineer, autonomous-run ADR `20261016-autonomous-workflow-run-entrega-2`,
reviewable by the author). This design turns them into units U1–U8.

## Goals / Non-Goals

**Goals:**

- `POST /api/projects/{projectId}/ask` validated by Zod, documented in `/docs`, rate limited, answering
  the public shape of §4 (answered or `UNKNOWN`), with every failure in the error format.
- A per-route domain error table, so `PROJECT_NOT_FOUND` is `404` only where a project id is
  received, and the global table and its tests stay as they are.
- Tests: `inject` unit tests with doubles (under Stryker) and an `inject` integration suite over the
  acme-shop seed in Postgres.

**Non-Goals:**

- The answer cache and any effect of `useCache` (DIS-21 / CM-HU-13).
- `hops`, prior claims, events, persistence, stale status/warning or per-evidence verification in the
  response.
- `/impact`, `/index`, authentication, streaming, an endpoint timeout, an HTTP project listing.
- Any change to `explain`, to the adapters or to the CLI.

## Decisions

### U1 — Request schemas (D1, D2, D8)

`packages/api/src/schemas/ask.ts`:

- `askParamsSchema = z.object({ projectId })`, `projectId` =
  `z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/).meta({ format: 'uuid' })`.
  The character classes spell both cases instead of the `i` flag, because `z.toJSONSchema` publishes
  the pattern without its flags and the document must accept what the route accepts (checked:
  `zod` 4.6 emits `pattern` and `format: "uuid"` together). Any id of this form reaches the store, so a
  well-formed unknown id is `404`, never `400` (D8).
- `askBodySchema = z.strictObject({ question, tokenBudget, useCache })`:
  - `question`: `z.string().min(5).max(500)` (Zod 4 counts code points: 5 emojis pass, 501 fail;
    checked) then `.refine(q => q.trim() !== '')` and `.refine(hasNoNul)`, both issue code `custom`
    with path `["question"]` (checked). `hasNoNul` is core's own check (`@codemind/core`,
    `knowledge/text-without-nul.ts`), the one `explain` uses, imported rather than rewritten.
  - `tokenBudget`: `z.int().min(TOKEN_BUDGET_MIN).max(TOKEN_BUDGET_MAX).optional()`, both imported
    from `@codemind/core` (backend-standards §4: one description, never a copied number). No
    `.default()`: absent stays absent and `explain` applies `TOKEN_BUDGET_DEFAULT` (D2).
  - `useCache`: `z.boolean().optional()`.
  - `hops` is not declared, so the strict object rejects it (`unrecognized_keys`).
- Fastify validates params before the body and stops at the first failing part, so a request with a
  bad id and a bad body reports only the id. Each scenario sends one fault at a time.

### U2 — Response schemas (D3, D7)

- `askAnsweredSchema = z.object({ answer: z.string(), statements: z.array(z.object({ text, type:
  z.enum(['FACT','INFERENCE']), verification: z.enum(['entailed','cited']), evidenceIds:
  z.array(z.string()) })), evidence: z.array(z.object({ id, file, startLine: z.int(), endLine: z.int(),
  excerpt: z.string() })), confidence: z.number(), usage: askUsageSchema })`, where `askUsageSchema`
  lists exactly the fields of core's `AnswerUsage` (`baselineEstimator` `z.literal(TOKEN_ESTIMATOR)`,
  `cacheHit` `z.boolean()`, `generation` and `verification` sub-objects).
- `askUnknownSchema = z.object({ answer: z.literal('UNKNOWN'), reason: z.enum(UNKNOWN_REASONS),
  message: z.string().optional(), statements: z.tuple([]), evidence: z.tuple([]) })`.
- `askResponseSchema = z.union([askUnknownSchema, askAnsweredSchema])` (OpenAPI `anyOf`). The
  serializer (`parse`) strips undeclared keys, which is a second barrier; the first is U3, which
  builds the public object explicitly, so nothing internal is ever handed to the serializer.
- The route's `schema.response` also declares `400`, `404`, `429`, `500` and `503` as `errorSchema`,
  so the document lists them; the error handler's bodies already satisfy it.
- `index.ts` exports the five schemas and their inferred types.

### U3 — The route and the public answer (D3, D8, D9)

`packages/api/src/routes/ask.ts`, `registerAskRoute(app, options?: { explain?: typeof explain })`:

1. Creates **one** `createInMemoryVerificationCache()` when it registers the route (D9), captured by
   the handler: every request of this app shares it; another app has its own.
2. Registers `app.post('/api/projects/:projectId/ask', { schema: { params, body, response }, config:
   { domainErrors: ASK_DOMAIN_ERRORS } }, handler)`.
3. Handler: `const project = await app.deps.store.getProject(params.projectId)` (throws
   `ProjectNotFound` → `404`, whatever the question; `explain` alone answers `no-anchor` without
   looking at the project when the question has no search term, D8); then
   `explain({ ...app.deps, verificationCache }, { projectId: project.id, question: body.question,
   ...(body.tokenBudget !== undefined && { tokenBudget: body.tokenBudget }) })` — `project.id` is the
   store's canonical id, so an upper-case id behaves as its lower-case form; `useCache` is not
   forwarded (D2).
4. Writes the answer's events to `request.log` (U5), then returns `toPublicAnswer(answer)`.

`toPublicAnswer(answer: ExplainAnswer)` (exported for unit tests and Stryker):

- `UNKNOWN`: `{ answer, reason, ...(message !== undefined && { message }), statements: [], evidence: [] }`.
- answered: `publicId = new Map(answer.evidence.map((e, i) => [e.id, \`ev-${i + 1}\`]))`; evidence
  `{ id: publicId, file: e.path, startLine, endLine, excerpt }` in order; statements
  `{ text, type, verification, evidenceIds: ids.map(publicId) }`; `confidence`; `usage` copied field by
  field. A statement id absent from `evidence` breaks `explain`'s contract: `toPublicAnswer` throws an
  `Error` (→ `500` `INTERNAL`, logged), never drops or invents an id. An `excerpt` that is `null` (only
  possible for prior claims) also fails the response schema → `500`.
- One public id per evidence entry of `explain` (D3): a stored answer whose two statements cite the
  same span has two rows, so two entries `ev-1`, `ev-2` with the same span. This is the use case's
  shape, kept on purpose (see Risks).

`explain` is injectable only as a test seam (`options.explain`, default core's `explain`), as
`AskCommandDeps.explain` in the CLI; `buildApp` takes it through `AppOptions.explain?` and passes it
to `registerAskRoute`. It lets a unit test record the forwarded request and return canned answers or
errors without building a graph.

### U4 — Per-route domain error table (D4, D5, D6)

- `plugins/error-handler.ts`: `DomainErrorTable = ReadonlyMap<string, DomainErrorMapping>`; module
  augmentation `declare module 'fastify' { interface FastifyContextConfig { domainErrors?:
  DomainErrorTable } }`; `answerOf(error, request)` looks the code up in
  `request.routeOptions.config.domainErrors` first, then in `DOMAIN_ERRORS`. `DOMAIN_ERRORS` and its
  entry are unchanged; its TSDoc stops saying "DIS-78 adds the codes of `POST /ask` here".
- `ASK_DOMAIN_ERRORS` (in `routes/ask.ts`), messages identical to the CLI's `toFailure`:
  - `PROJECT_NOT_FOUND` → `404`, `project not found`, `{}`;
  - `INVALID_EXPLAIN_REQUEST` → `400`, `invalid request`, `{ field }` (defence in depth: U1 is stricter
    than `explain`, so it should not be reached; `field` is a field name, never a value);
  - `LLM_UNAVAILABLE` → `503`, `the language model is unavailable`, `{ reason }` plus `status`,
    `expected`, `received`, `systemCode` when present (numbers and a system code only, never text);
  - `SOURCE_UNAVAILABLE` → `503`, `the project's source cannot be read`, `{ reason }` plus `path` when
    present (a repository-relative path of the indexed repo, not a request value);
  - `BUDGET_EXHAUSTED` → the global entry's status and message, and `{ ...global.details(error),
    cacheOnly: true }` (D6), built from `DOMAIN_ERRORS.get('BUDGET_EXHAUSTED')`, so the two cannot drift.
- `503` for the model and the source: the request is valid and the dependency is temporarily
  unavailable; a `500` would hide that it is retryable, a `502` would name a proxy the API is not.
- The messages are duplicated from the CLI (no shared module: neither package depends on the other,
  and core never formats transport messages). Accepted, recorded in Follow-ups as D.

### U5 — Events to the request log

For each event of the answer, in order: `request.log[event.type === 'evidence_broken' ? 'error' :
'info']({ ...event }, 'explain event')`. Pino adds the `reqId`. Events carry codes, ids, paths and
line numbers only (DIS-39 D8, DIS-41, DIS-68), never the question or a span's text, so the request
log still holds no request value. Nothing is logged when there is no logger (tests without one).

### U6 — Registration (D9 and DIS-76 U6)

`buildApp` calls `registerAskRoute(app, { explain: options.explain })` after `registerHealthRoute`,
so the route is behind the rate limit and in the OpenAPI document. Routes the tests add before
`ready()` (`tests/unit/api/support.ts`) are unaffected.

### U7 — Tests (D3–D9) and quality

- `tests/unit/api/ask.spec.ts` (new, runs under Stryker, no database): app from `buildApp` with
  `defaultDeps()` of `tests/unit/api/support.ts` overridden by an in-memory store holding the acme-shop
  subset (`createInMemoryStore({ projects: [{ project: ACME_SHOP_PROJECT, graph: acmeShopGraph() }] })`),
  a counting `Proxy` (`counting()` of `support.ts`) over the store, model and source tree, and, where a
  scenario says "a use case that…", the `explain` seam. "Requests to one API share verification
  verdicts" uses the real `explain` with the doubles of `tests/support/explain-doubles.ts` (`doubles()`),
  a live scripted model, and counts the requests' `purpose`. `support.ts` is not modified.
- `tests/unit/api/route-errors.spec.ts` (new): the `api-foundation` scenario "A route's own mapping
  applies only to that route", with its own app from `buildApp` and two test routes registered before
  `ready()`.
- `tests/integration/api/ask.spec.ts` (new): the template of `tests/integration/cli/ask-command.spec.ts`
  — `fixtures/acme-shop` copied without `.git` to a temp directory and its history built with
  `buildOne` in `beforeAll` (120 s timeout), `describeWithDatabase` + `useTransactionPerTest`, the seed
  loaded with `loadSeed` inside the test's transaction and `root_path` pointed at the copy, the store
  `createPostgresStore({ transaction: db() })`, the source `createGitSourceTree()`, the app from
  `buildApp` with a high rate limit; then `inject`. The budget scenario uses a fixed clock on a date no
  other suite writes (`2031-01-15T12:00:00Z`), inserts one `query_log` row with that `created_at` and
  `cost_usd` 1.5, and wraps a counting live model with `withDailyBudget(model, { store, dailyBudgetUsd:
  1, now })`, so concurrent suites' rows (dated today) never enter the sum; expected `resetsAt` is
  `2031-01-16T00:00:00.000Z`.
- Each `#### Scenario:` maps 1:1 to an `it` of the same name.
- Stryker already mutates `packages/api/src/**` (minus `server.ts`, `start.ts`); the new code is
  covered by the unit specs. Mutation score ≥ 80 (CI break threshold).
- `npm run lint:architecture`: no `pg` in `packages/api` (the route only uses `StorePort`).

### U8 — Documentation

- `readme.md` §4: the `/ask` block gets the path parameter as published, the `UNKNOWN` example
  (`llm-required`) next to the answered one, the evidence example without per-evidence
  `verification` (D3), the error responses `400`, `404`, `429` (`RATE_LIMITED`, `BUDGET_EXHAUSTED`
  with `cacheOnly`), `503`; the comment "El contrato HTTP completo llega con CM-HU-12" is replaced.
  The error codes table gains `PROJECT_NOT_FOUND`, `INVALID_EXPLAIN_REQUEST`, `LLM_UNAVAILABLE`,
  `SOURCE_UNAVAILABLE` for `/ask`. §2.5 (6): the cache-only notice is `details.cacheOnly: true`.
- `docs/project-context.md`: the API gotcha (the `/ask` route, the per-route domain error table, the
  verification cache per app, the `explain` seam) and the Testing list (the new specs).
- No ADR: the decisions are local to `packages/api` and cheap to revert (config rules of the
  `design` artifact); the per-route table is recorded here and in the `api-foundation` delta.

## Risks / Trade-offs

- **Duplicate public ids for one span in a stored answer** (U3) → kept: it is the use case's shape,
  each entry is a distinct stored evidence row, and the web screen can group by `file`/lines. Changing
  it means deduplicating in the transport, which would diverge from `explain`'s contract; D3 decided
  against it.
- **The verification cache lives as long as the process** (U3, D9) → bounded (10 000 entries, LRU)
  and keyed by prompt, statement, path, lines and excerpt, not by model: a model change within one
  running API reuses verdicts of the previous model. Restarting the API clears it. Accepted (D).
- **`503` for `SOURCE_UNAVAILABLE` with reason `not-indexed`** is not strictly "temporary" → the
  project exists but cannot be answered until it is indexed; `503` with `reason` lets the client tell
  the cases apart. Accepted.
- **Fastify reports only the first failing request part** (U1) → documented; each scenario sends one
  fault.
- **A long model call holds the request** (no endpoint timeout, non-goal) → the LLM adapter has its
  own timeout (`LlmUnavailable` `timeout` → `503`).

## Migration Plan

Additive: a new route and an optional per-route table. No migration, no new variable, no new
dependency. Rollback is reverting the commit.

## Open Questions

None: D1–D9 are recorded in the DIS-78 `[enhanced]` description.

## Follow-ups

Every finding of the spec audit and the pre-merge checks is fixed in this change or gets an A/B/C/D
destination here (`docs/project-context.md` → Tracking deferred findings).

- **D — the error messages of `/ask` duplicate the CLI's `toFailure` strings** (U4). Neither package
  depends on the other; a shared module would have to live in core, which never formats transport
  messages. Both specs pin the strings, so a drift fails a test.
- **D — the process-wide verification cache is not keyed by model** (Risks).
