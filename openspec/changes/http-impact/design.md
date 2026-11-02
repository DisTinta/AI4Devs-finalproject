## Context

The `impact` use case (`packages/core/src/impact/impact.ts`, DIS-89/DIS-90/DIS-94) takes
`(store, request: unknown, { now })`, checks the request (`InvalidImpactRequest`), anchors the change,
walks the graph backwards and returns an `ImpactReport`: `answered` with `direct`, `indirect`, `tests`,
`docs`, `history` and `risk`, or `unknown`/`no-anchor`. Every returned report writes one `query_log`
row; when the row cannot be written the report carries `events: [{ type: 'query_not_logged', code }]`.
A change without search terms answers `unknown` without checking the project (DIS-89 P6).

The API (`packages/api`) has the HTTP base of DIS-76 and two business routes: `/ask` (DIS-78) and
`/index` (DIS-9). `/ask` is the template: `routes/ask.ts` (own domain error table, `getProject` before
the use case, events to the request log, a field-by-field projection `toPublicAnswer`) and
`schemas/ask.ts` (limits imported from core). `readme.md` §4 has an Entrega 1 example of `/impact`
that does not match the core report (`history` per PR, `usage`, entries without `file`).

The parent CM-HU-16b (DIS-93) AC 4 lists `usage` among the keys of §4; this change drops it (D1).

## Goals / Non-Goals

**Goals:**

- `POST /api/projects/{projectId}/impact` answering the core report in a closed public shape, with
  `200`/`400`/`404`/`429`/`500`, in `/docs`, rate limited.
- A `404` for an unknown project whatever the change (closes DIS-89 P6).
- `readme.md` §4 rewritten to the real shape (closes DIS-94 E5).
- The `## Purpose` of `openspec/specs/impact/spec.md` updated (DIS-94 task 13.7).

**Non-Goals:**

- The web screen 3 and its client (DIS-14); any change to core, the adapters or the CLI.
- One `history` entry per pull request; `usage`; a `demo:impact` helper; authentication.

## Decisions

### D1. Public shape = the core report without `events` (enrich decision 1)

`answered`: `status`, `direct`/`indirect` (`symbol`, `file`, `origin`, `resolution`, `hops`), `tests`
(`symbol`, `file`, `origin`), `docs` (`path`, `stale`, `staleSince` only when `stale`, full sha),
`history` (`file`, `coChangeRate`, `prs`, `origin`), `risk` (`level`, `rationale`).

- **No `usage`**: the impact makes no model call (DIS-90); a `usage` of zeros would read as a measured
  cost and would need a token baseline the use case does not compute. This departs from the parent
  AC 4 on purpose; `readme.md` §4 is rewritten so "the response lists only the fields of §4" holds.
- **`history` per file, not per PR**: one entry per PR would lose the co-changed file and drop the
  co-changes without a PR (`prs: []`). The web screen groups by file anyway (DIS-14).
- **`hops` also in `direct`** and **`file` everywhere**: the screen needs the file to link, and `hops`
  0/1 tells the anchor from its direct dependants.
- **`staleSince` as the full sha**: the API does not abbreviate; a client shortens it.

Alternative rejected: an object spread of the core report minus `events`. It would publish any field
the core adds later without touching the schema; the projection is field by field (`toPublicReport`),
as `toPublicAnswer` of `/ask`.

Response-schema strictness (audit run 1, 5.a/8.a): the response schemas are `z.object` (as `/ask`),
not `z.strictObject`. The serializer (`packages/api/src/plugins/zod-compiler.ts`, `zod.parse`) drops
every undeclared key, which is the guarantee that a field core adds is not published (api-foundation,
"Response serialisation by schema"); a strict response schema would turn such a field into a `500` in
production until the schema learns it. `toPublicReport` builds each entry field by field as defence in
depth, and so that `staleSince` is sent only on a stale document: an HTTP test cannot tell a spread
from the projection (the serializer strips both alike), so the tests pin the observable shape, not the
build method.

### D2. `unknown` → `200` `{ status: 'unknown', reason: 'no-anchor' }` (enrich decision 2)

An honest `UNKNOWN` is an answer, as in `/ask`. The key is `status` (the core's discriminant), not
`answer` as in `/ask`: the two routes describe different reports and the web screen reads `status`.

### D3. Project resolution before the use case (enrich decision 3)

`app.deps.store.getProject(projectId)` runs first, as in `/ask`; it throws `ProjectNotFound` (→ `404`)
for an unknown id, so a change with no search term also answers `404`. The use case receives
`project.id`, the stored id, so an upper-case id resolves the same project. Cost: one statement more
than the CLI per request.

### D4. Own domain error table (enrich decision 4)

`IMPACT_DOMAIN_ERRORS`: `PROJECT_NOT_FOUND` 404 `project not found` `{}` and
`INVALID_IMPACT_REQUEST` 400 `invalid request` `{ field }`. The schema rejects every invalid body
first, so `INVALID_IMPACT_REQUEST` is reachable only if the core's rules ever become stricter than the
route's; it is mapped so that case answers `400` instead of `500`. Everything else (a store failure
included) answers `500` `INTERNAL` through the global handler. No `BUDGET_EXHAUSTED`, no
`LLM_UNAVAILABLE`, no `SOURCE_UNAVAILABLE`: the use case reads neither the model nor the source tree.
Declared responses: `200`, `400`, `404`, `429`, `500` (no `503`).

### D5. Events to the request log at `info` (enrich decision 5)

`for (const event of report.events ?? []) request.log.info({ ...event }, 'impact event')`. The only
event type is `query_not_logged`, information, not a system failure. Events hold a code only, never
the change.

### D6. Limits from core; `maxHops` forwarded only when sent (enrich decision 6)

`impactBodySchema = z.strictObject({ change, maxHops })`: `change` with `.min(MIN_CHANGE_CHARS)`,
`.max(MAX_CHANGE_CHARS)` (Zod counts code points), not only whitespace, `hasNoNul`; `maxHops`
`z.int().min(1).max(MAX_HOPS).optional().meta({ default: DEFAULT_IMPACT_HOPS })`, the `default`
documentation only. All four constants are imported from `@codemind/core`. An absent `maxHops` is not
forwarded, so the use case's default applies and stays the single source.

The response schema declares `origin` (`graph`, `git`), `resolution` (`EDGE_RESOLUTIONS` from core),
`level` (`HIGH`, `MEDIUM`, `LOW`) and `reason` (`no-anchor`) as literals. Core exports no runtime
constant for the risk levels nor the unknown reason (only types); instead of changing core, the route's
`toPublicReport(report: ImpactReport): ImpactResponse` is typed, so a level or reason the core adds
fails `npm run typecheck` until the schema learns it.

This departs from `docs/backend-standards.md` §4 (closed sets of domain values declared once): core
exports `RiskLevel` and `ImpactUnknownReason` as types only, and the ticket keeps core unchanged.
`schemas/impact.ts` therefore adds a two-way compile-time equality check between each literal set and
its core type (an `Equal<A, B>` helper asserted for `z.infer<typeof riskLevelSchema>` against
`RiskLevel` and for the unknown reason against `ImpactUnknownReason`), so drift in either direction
fails `npm run typecheck`.

### D7. App seam and registration

`AppOptions.impact?: typeof impact` (test seam, as `explain` and `reindex`), and
`registerImpactRoute(app, { impact: options.impact })` between `registerAskRoute` and
`registerReindexRoute`. The route passes
`{ now: app.deps.now }` so the `query_log` latency uses the app's clock. `composition.ts` does not
change: the route needs only `store` and `now`. `packages/api/src/index.ts` exports
`impactParamsSchema`, `impactBodySchema`, `impactAnsweredSchema`, `impactUnknownSchema`,
`impactResponseSchema`, their types and `registerImpactRoute`/`ImpactRouteOptions`.

### D8. `## Purpose` of the `impact` spec (enrich decision 7)

This change has no delta for `impact`: its requirements do not change. The Purpose text still
describes the DIS-90 report. Task 9.5 edits that `## Purpose` (names the related documentation,
current or stale, and the co-change history from git of an answered report) while the change is
active and its audit approved, before `/opsx:archive`. If `protect-specs-and-tests` denies the edit,
the task records it here with destination D — accepted and recorded (the `## Purpose` stays as it is,
the hook's denial and its reason are recorded, and the next change that touches `impact` updates it),
and the ticket says so. No new ticket.

### D9. Tests

- `tests/unit/api/impact.spec.ts`: `buildApp` over `createInMemoryStore` with the acme-shop subset
  (`tests/support/acme-shop-graph.ts`), store, model and source tree wrapped by `counting()` of
  `tests/unit/api/support.ts`; the `impact` seam for the scenarios "a use case that…". Runs under
  Stryker.
- `tests/integration/api/impact.spec.ts`: the acme-shop seed in Postgres inside the harness
  transaction (`describeWithDatabase`, `useTransactionPerTest`), as `tests/integration/api/ask.spec.ts`;
  asserts the Q2 body and the `query_log` row.
- No existing test changes.

### D10. No ADR

A route following an existing template; no hard-to-reverse decision.

## Risks / Trade-offs

- [The public shape departs from the parent AC 4 (`usage`) and from the old §4 example] → recorded
  as E1 (destination A) and in the PR; §4 is rewritten in the same change.
- [The response schema duplicates the closed sets the core keeps as types] → D6: typed projection, so
  drift fails the typecheck.
- [`getProject` adds one statement per request] → one primary-key read per request, besides the
  reads of the report (traversal, tests, `docs`, `history`) and the `query_log` write; it buys a
  uniform `404`.
- [Mutation survivors in the projection] → each projected field is asserted by key equality in the
  unit spec; Stryker ≥ 80 (the configured break) over the two new files.

## Migration Plan

None: a new route, no schema or data change. Rollback is reverting the PR.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E8 are the DIS-95 enrich decisions 1–8
(comment of 2026-11-02 in the ticket); P1–P5 are design decisions of this proposal; R1–R5 are the agent's decisions of spec-audit
correction round 1 (2026-11-02). Destinations: A =
this change; B = another existing ticket; C = the author (none in this change, by the author's
instruction for DIS-95); D = accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | (1) Public shape = the core report without `events`; no `usage`; `history` per file; `readme.md` §4 rewritten to it; closes DIS-94 E5 (design D1). | A |
| E2 | (2) `unknown` → `200` `{ status: 'unknown', reason: 'no-anchor' }` (design D2). | A |
| E3 | (3) `getProject` before the use case: `404` also for a change without search terms; closes DIS-89 P6 (design D3). | A |
| E4 | (4) Own error table with `PROJECT_NOT_FOUND` and `INVALID_IMPACT_REQUEST`; everything else `500` (design D4). | A |
| E5 | (5) `query_not_logged` events to the request log at `info`, never in the body (design D5). | A |
| E6 | (6) Limits imported from core; an absent `maxHops` is not forwarded (design D6). | A |
| E7 | (7) `## Purpose` of `openspec/specs/impact/spec.md` edited before `/opsx:archive` (task 9.5, design D8); if the hook denies it, the fallback is destination D — accepted and recorded (audit run 1, 6.a), not A. | A |
| E8 | (8) Author's instruction: nothing is left for the author. This change adds or recaptures no `docs/DEMO.md` command (Paso 4 keeps the CLI; only its "pending" sentence changes). If the apply ends up adding or recapturing one, the agent runs it from Bash with `pwsh -NoProfile -Command '…'` and `powershell.exe -NoProfile -Command '…'`, never setting variables with `$env:`, and records versions and result in «Cómo se capturó» (task 6.6). | D — accepted |
| P1 | The parent AC 4 lists `usage`; dropped (E1). Departure recorded in the PR description. | D — accepted |
| P2 | `unknown` keyed by `status`, not `answer` as `/ask` (design D2). | A |
| P3 | `INVALID_IMPACT_REQUEST` mapped although the schema makes it unreachable today (design D4). | A |
| P4 | No runtime constant added to core for risk levels or the unknown reason; departs from `docs/backend-standards.md` §4; the typed projection plus a two-way compile-time equality check against `RiskLevel` and `ImpactUnknownReason` guard drift in both directions (design D6, audit run 1, 7.a). | A |
| P5 | No ADR (design D10). | D — accepted |
| R1 | Audit run 1, 5.a/8.a: response schemas are `z.object` as `/ask`; the serializer is the guarantee, `toPublicReport` is defence in depth; task 2.4's RED fails on `staleSince` of a current document, not on a spread (design D1). | A |
| R2 | Audit run 1, 9.a: option (a) — task 1.2 also creates a minimal route answering `501` with the seam and its registration, keeping the schema-first layer order. | A |
| R3 | Audit run 1, Q1: P1 confirmed; the DIS-95 DoD («solo los campos de §4») is checked against the §4 rewritten by this change (task 8.1). | D — accepted |
| R4 | Audit run 1, 3.b: the store-failure half of "Another error on impact answers INTERNAL" fails the use case's traversal read (`neighbors`), after the route's `getProject` resolved the project. | A |
| R5 | Audit run 1, 5.d: in step 6 the non-ASCII bodies are sent with JSON escapes so Git Bash on Windows sends ASCII bytes. | A |
