# Verify against spec — http-impact (DIS-95)

- Date: 2026-11-02
- Change: http-impact · PR #95 · spec `openspec/changes/http-impact/specs/http-impact/spec.md`
- Mode: inline (autonomous run, `ai-specs/skills/verify-against-spec/SKILL.md` → Inline mode)

*Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6). Code read at head `618dd67`; the line
numbers of `packages/api/src/schemas/impact.ts` are those after the fix of finding V1 (it adds lines
above line 51).*

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Impact request validation (path id, `change` 5–500 code points, not blank, no U+0000, `maxHops` 1–3 optional, strict body, no received value echoed) | `packages/api/src/schemas/impact.ts:11` (`impactParamsSchema = projectIdParamsSchema`), `:22-30` (strict body; limits and `hasNoNul` imported from `@codemind/core`, `:2`); `packages/api/src/routes/impact.ts:61-66` (declared `params`/`body`) | `tests/unit/api/impact.spec.ts:107`, `:136`, `:153`, `:184` |
| `maxHops` forwarded only when sent; the app's clock as `now` | `routes/impact.ts:70-79` | `tests/unit/api/impact.spec.ts:204` (also asserts the keys of the first request are exactly `change`, `projectId`) |
| Impact project resolution (`getProject` before the use case, whatever the change; `404` exact; stored id forwarded) | `routes/impact.ts:69`, `:73`; `IMPACT_DOMAIN_ERRORS` `:15-21` | `tests/unit/api/impact.spec.ts:239`, `:258`; `tests/integration/api/impact.spec.ts:103` |
| Impact answered response (exact keys at every level, `staleSince` only on a stale document, no `events`/`usage`/`projectId`/change text/database id, no model call) | `routes/impact.ts:37-49` (`toPublicReport`, field by field); response schemas `schemas/impact.ts:56-104` (`z.object`, the serializer drops undeclared keys, design D1) | `tests/unit/api/impact.spec.ts:275`, `:301`, `:484`; `tests/integration/api/impact.spec.ts:64` |
| Impact unknown response (`200` exactly `{ status, reason }`) | `routes/impact.ts:38`; `schemas/impact.ts:110-113` | `tests/unit/api/impact.spec.ts:347`, `:359` |
| Impact error answers (`INVALID_IMPACT_REQUEST` 400 `{ field }`, `PROJECT_NOT_FOUND` 404 `{}`, anything else `500` `INTERNAL`, rate limit by IP) | `routes/impact.ts:15-21`, `:66` (`config.domainErrors`); the rate limit is the app-wide hook registered before the route (`packages/api/src/app.ts:123-126`) | `tests/unit/api/impact.spec.ts:381`, `:402`, `:431` |
| Impact events (one `info` line per event with the request id; no line with the change text) | `routes/impact.ts:81` | `tests/unit/api/impact.spec.ts:448`, `:359`, `:512` |
| Impact in the OpenAPI document | `routes/impact.ts:61-66` (`response` `200`, `400`, `404`, `429`, `500`); `schemas/impact.ts:29` (`meta({ default })`) | `tests/unit/api/impact.spec.ts:541` |

Also checked: `packages/api/src/app.ts` adds only the seam `impact?: typeof impact` and the registration
between `/ask` and `/index` (design D7); `packages/api/src/index.ts` exports the five schemas, their
types, `registerImpactRoute` and `ImpactRouteOptions` (design D7), nothing else.

## 2. Requirements missing or partial

- **V1 (partial, design D6 / Follow-up P4).** The design promises "a two-way compile-time equality check
  … so drift in either direction fails `npm run typecheck`". At head `618dd67` the check was
  `Equal<…> extends true ? true : never` inside an exported tuple type (`schemas/impact.ts`, then
  lines 129-132). A type that resolves to `never` is not a compile error, so the check never failed:
  verified in the scratchpad with `tsc --strict` over the same construct and a `RiskLevel` missing
  `LOW` (exit 0). Drift where core *adds* a level is still caught by the typed `toPublicReport`, but
  drift where the schema has a literal core lacks (or core *drops* one) was not. **Fixed in this
  review** (see the addendum).
- **V2 (weak assertion, scenario "An unknown report with events sends no events" and "A report's
  query_not_logged event is logged").** The `THEN` says "one log line carrying the request's
  `reqId`". The first test collected every `reqId` of the log, the event line's own included, and
  asserted the event's `reqId` was among them, which holds for any string; the second asserted only
  `typeof reqId === 'string'`. Neither tied the event to the request. **Fixed in this review**: both
  now assert the event line's `reqId` equals the `reqId` of the request's `incoming request` line.

No requirement is absent.

## 3. Unspecified behaviour

- `schemas/impact.ts:51` exports the type `ImpactLiteralsMatchCore` from the module (not from the package
  index). It has no runtime effect and exists only to hold the compile-time check of design D6; exporting
  it keeps it from being an unused local. Kept: wanted by D6.
- `routes/impact.ts:37` exports `toPublicReport` from the module (not from the package index), as
  `toPublicAnswer` of `/ask`. No behaviour beyond the spec. Kept.
- The log message `impact event` (`routes/impact.ts:81`) is not named by the spec, which fixes only the
  level, the fields and the request id; `ask` uses the same pattern. Kept.
- The issue messages of the two custom rules (`change must not be only whitespace`,
  `change must not contain U+0000`, `schemas/impact.ts:27-28`) are not named by the spec; they are part of
  the `VALIDATION_ERROR` issue format of `api-foundation` and are pinned by the boundary test
  `tests/unit/api/impact.spec.ts:526` (added for mutation survivors). Kept.

Specific checks: no dependency imported that is not in `packages/api/package.json` (`zod`, `fastify`,
`@codemind/core` are declared); no authorisation required by the spec; no response field beyond the
spec (the serializer plus `toPublicReport`, asserted by key equality at every level in `:301` and the
integration `:64`); scenario assertions weaker than the scenario: V2 only.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An invalid change answers VALIDATION_ERROR without a store call | `tests/unit/api/impact.spec.ts:107` | green |
| A change at the length bounds is accepted | `tests/unit/api/impact.spec.ts:136` | green |
| An invalid hop limit or an extra key answers VALIDATION_ERROR | `tests/unit/api/impact.spec.ts:153` | green |
| A malformed project id answers VALIDATION_ERROR on impact | `tests/unit/api/impact.spec.ts:184` | green |
| The hop limit is forwarded only when sent | `tests/unit/api/impact.spec.ts:204` | green |
| An unknown project answers PROJECT_NOT_FOUND on impact | `tests/unit/api/impact.spec.ts:239` | green |
| An upper-case project id resolves the same project on impact | `tests/integration/api/impact.spec.ts:103` | green (CI `verify`) |
| Q2 answers only the public fields over the seed | `tests/integration/api/impact.spec.ts:64` | green (CI `verify`) |
| An answered report over the in-memory subset makes no model call | `tests/unit/api/impact.spec.ts:275` | green |
| Fields the use case adds are not sent | `tests/unit/api/impact.spec.ts:301` | green |
| A change without search terms answers unknown | `tests/unit/api/impact.spec.ts:347` | green |
| An unknown report with events sends no events | `tests/unit/api/impact.spec.ts:359` | green (strengthened, V2) |
| Domain errors of the impact use case map to their answers | `tests/unit/api/impact.spec.ts:381` | green |
| Another error on impact answers INTERNAL | `tests/unit/api/impact.spec.ts:402` | green |
| The impact route is rate limited | `tests/unit/api/impact.spec.ts:431` | green |
| A report's query_not_logged event is logged | `tests/unit/api/impact.spec.ts:448` | green (strengthened, V2) |
| The document lists impact with its parameter, body and responses | `tests/unit/api/impact.spec.ts:541` | green |

## Addendum — fixes (2026-11-02, review step)

- V1: `schemas/impact.ts:43-54` now wraps each `Equal` in `Expect<T extends true>`, so a `false` is
  `TS2344`. Red evidence: with `riskLevelSchema` temporarily widened to `'CRITICAL'`, `npm run typecheck`
  failed with `packages/api/src/schemas/impact.ts(52,10): error TS2344: Type 'false' does not satisfy
  the constraint 'true'.`; reverted, it passes. No runtime change.
- V2: both event tests compare the event's `reqId` with the `incoming request` line's.
- Re-run: `npx vitest run tests/unit/api` 11 files, 115 tests passed; `npm run typecheck`, `npm run lint`
  and `npm run docs:coverage` clean. Recorded in `design.md` → Follow-ups V1, V2 (destination A).
