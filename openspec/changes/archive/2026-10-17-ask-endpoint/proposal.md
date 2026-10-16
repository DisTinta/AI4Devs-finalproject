## Why

`packages/api` has, since DIS-76, the whole HTTP base (error format, Zod validation, OpenAPI at
`/docs`, rate limit by IP, composition from the environment) but no business route: the only route is
`GET /health`. `explain` (DIS-39, verified by DIS-68/DIS-70, with confidence by DIS-72 and usage by
DIS-74) can only be reached through the CLI `ask`. `readme.md` §4 promises
`POST /api/projects/{projectId}/ask` with the body `{ question, tokenBudget, useCache }` and a `200`
of `answer`, `statements`, `evidence`, `confidence`, `usage`; the web screen (CM-HU-14) and any
script need it.

This is DIS-78 (CM-HU-12.2), the second sub-issue of CM-HU-12 (DIS-59). Its user story: "Como cliente
web o script, quiero enviar por HTTP una pregunta sobre un proyecto indexado a
`POST /api/projects/{projectId}/ask` y recibir la explicación con sus afirmaciones tipadas, la
evidencia citada, la confianza y el uso en el formato de `readme.md` §4 (o un `UNKNOWN` honesto con su
motivo), para usar CODEMIND desde la pantalla web y desde integraciones sin pasar por el CLI." The
DoD: a test covers `200` (including `UNKNOWN`/`llm-required`), `400`, `404` and `429`; the response
lists only the fields of §4 plus `reason`.

The decisions D1–D9 were taken by the agent as lead engineer in the autonomous run of Entrega 2 (ADR
`20261016-autonomous-workflow-run-entrega-2`) and recorded in the DIS-78 `[enhanced]` description on
2026-10-16; the author reviews them afterwards.

## What Changes

- New route `POST /api/projects/{projectId}/ask` (`packages/api/src/routes/ask.ts`), registered by
  `buildApp` after the rate limit, so it is limited and documented. It validates, resolves the
  project with `StorePort.getProject`, delegates to core's `explain` and serialises the public shape.
- New Zod schemas (`packages/api/src/schemas/ask.ts`), the only description of the payload:
  - path `projectId`: 8-4-4-4-12 hexadecimal, any case (the form the store accepts; D8);
  - strict body `{ question, tokenBudget?, useCache? }`: `question` 5–500 code points, not only
    whitespace, without U+0000 (D1); `tokenBudget` an integer within core's `TOKEN_BUDGET_MIN`–
    `TOKEN_BUDGET_MAX` (1000–32000), absent → `explain`'s default 8000; `useCache` a boolean,
    accepted and not forwarded until DIS-21 (D2); both published in OpenAPI with the `default` of §4
    (8000, `true`); `hops` and any other key rejected;
  - `200` response: the answered shape (`answer`, `statements[{text,type,verification,evidenceIds}]`,
    `evidence[{id,file,startLine,endLine,excerpt}]`, `confidence`, `usage`) or the `UNKNOWN` shape
    (`answer`, `reason`, `message` only for `llm-required`, `statements: []`, `evidence: []`) (D3, D7).
- Public evidence ids `ev-1`, `ev-2`… in the order of `explain`'s evidence; no database UUID,
  `fileId`, `priorClaims`, `events`, `persisted`, `kind`, `status` or `warning` in the body (D3).
- Per-route domain error mapping (D4): a route may declare its own table of domain errors, which the
  error handler consults before the global `DOMAIN_ERRORS` table (unchanged). The table of `/ask`
  (D5, D6): `PROJECT_NOT_FOUND` → `404`; `INVALID_EXPLAIN_REQUEST` → `400` (`invalid request`); `LLM_UNAVAILABLE` →
  `503`; `SOURCE_UNAVAILABLE` → `503`; `BUDGET_EXHAUSTED` → `429` with the DIS-76 details plus
  `cacheOnly: true`. Any other error stays `500` `INTERNAL`.
- The answer's `events` are written to the request log (`evidence_broken` at `error`, the rest at
  `info`), as the CLI writes them to stderr.
- One in-memory verification cache per app instance, shared by the requests of that instance (D9).
- `packages/api/src/index.ts` exports the six new schemas, their inferred types and `registerAskRoute`.
- Docs: `readme.md` §4 (the `/ask` example aligned with the public shape, without per-evidence
  `verification`; the error table with the new codes) and §2.5 (6) (the cache-only notice).

## Capabilities

### New Capabilities

- `http-ask`: the `POST /api/projects/{projectId}/ask` endpoint — its request validation, project
  resolution, delegation to `explain`, public response shape (answered and `UNKNOWN`), its domain
  error answers, the logging of the answer's events and its OpenAPI entry.

### Modified Capabilities

- `api-foundation`: "Single error format" (a `code` may also come from a route's own domain error
  table) and "Domain error mapping" (a route may declare its own table, consulted before the global
  one; the global table and its scenarios are unchanged).

## Impact

- Code: `packages/api/src/schemas/ask.ts` and `packages/api/src/routes/ask.ts` (new);
  `packages/api/src/plugins/error-handler.ts` (per-route table lookup); `packages/api/src/app.ts`
  (registers the route); `packages/api/src/index.ts` (exports). Core gains one exported constant,
  `STATEMENT_VERIFICATIONS` (`packages/core/src/explain/claim-items.ts`, the type
  `StatementVerification` derived from it), so the API declares no closed set twice; `explain`, the
  adapters and the CLI do not change.
- Tests: `tests/unit/api/ask.spec.ts` (`inject` with in-memory doubles, runs under Stryker) and
  `tests/integration/api/ask.spec.ts` (`inject` over real Postgres with the acme-shop seed and its
  built history). No existing test changes.
- Dependencies: none new (`zod`, `fastify` and `@codemind/core` are already dependencies of
  `packages/api`).
- Security and privacy: no value received (question, project id) appears in an error response or in
  the request log (existing `api-foundation` requirement); the project is resolved by id only
  (isolation, `readme.md` §2.5 (5)); the response carries no internal column. The question is sent to
  the configured model only in live mode, as with the CLI; no new personal data is stored.
- Commands and constraints: as in `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run test:mutation`, `npm run docs:coverage`).

### Non-goals

- The answer cache and the effect of `useCache` (DIS-21 / CM-HU-13): `useCache` is validated and
  accepted, and changes nothing yet.
- Exposing `hops`, `priorClaims`, `events`, `persisted`, a statement's `status`/`warning`, or a
  per-evidence `verification` (D3, D5).
- `/impact` (CM-HU-16b), `/index` (CM-HU-05b), authentication, streaming, an endpoint timeout, or any
  HTTP listing of projects.
- Any change to the CLI `ask` or to the `explain` use case.
