## Why

Before touching a component, a developer needs to know what depends on it, directly and
transitively, and which tests cover it, ordered so that the most exposed dependants come first.
CodeMind already has every piece underneath (lexical anchoring, a project-scoped traversal with a
`direction`, `tested_by` edges), but nothing turns a change description into that report. This is
DIS-89 (CM-HU-16a.1), the first half of the parent CM-HU-16a (DIS-83): the deterministic `impact`
use case over the graph. The risk rule, the CLI command and `query_log` (DIS-90) and the HTTP route
(DIS-95) only project the report this change produces. Its blockers DIS-27 and DIS-24 are done.

## What Changes

- **New use case `impact(store, request)`** in `packages/core/src/impact/` (pure domain, no SQL, no
  HTTP, no LLM):
  - validates the request (`change`, 5 to 500 code points, not only whitespace, no U+0000;
    `maxHops`, integer 1..`MAX_HOPS`, 2 by default; strict object) and throws
    `InvalidImpactRequest(field)` before any read, without copying the value;
  - anchors `change` with the existing `anchor()` and drops the symbols of `test` files; an empty
    anchor answers `{ status: 'unknown', reason: 'no-anchor' }` without traversing;
  - walks the graph backwards (`direction: 'in'`, kinds `calls`, `imports`, `extends`,
    `implements`) up to `maxHops`, then collects the covering tests with one `tested_by` step
    outwards from the anchor, the reached nodes and the class of each direct component;
  - groups what it reached by component (the name up to the first `::`, or the path of a reached
    file), classifies it into `direct` (the anchor's components at 0 hops and those at 1),
    `indirect` (2..`maxHops`) and `tests`, every entry with `origin: 'graph'`;
  - orders each list by a lexicographic relevance key without weights (hops, `exact` before
    `heuristic`, lexical match with the change's terms, byte order).
- **Exports** from `packages/core/src/index.ts` through a new `impact/index.ts`.
- **Tests**: unit tests over the in-memory `StorePort` double (`tests/support/in-memory-store.ts`)
  with the acme-shop subset and small graphs; one integration file that reproduces Q2 of
  `fixtures/README.md` over `seeds/graph-dump.sql` in Postgres.

## Capabilities

### New Capabilities

- `impact`: the deterministic impact report of a described change over one project's graph:
  request validation, anchoring, reverse traversal bounded by `maxHops`, grouping by component into
  `direct`, `indirect` and `tests`, and relevance order.

### Modified Capabilities

None. `context-engine` (`anchor`, `questionTerms`) and `graph-store` (`neighbors` with
`direction: 'in'`, `findSymbols`) are reused unchanged.

## Non-goals

- `risk` and its rationale, the CLI command `impact`, `query_log` and `usage`: DIS-90.
- `POST /api/projects/{projectId}/impact`: DIS-95.
- The `[git]` co-change signal (`co_changed`) and stale docs (`describes`): DIS-94.
- Any LLM call, embedding, glossary or Spanish-to-English translation: the anchor stays lexical, so
  the literal Q2 text «cambiar el cálculo de descuentos» does not anchor `DiscountService` (design
  D7, characterised by a test).
- Proposing or performing the change: the use case only reads.

## Scope notes (sub-issue vs parent)

The parent DIS-83 frames the whole story (risk, CLI, query log); this change is bounded by DIS-89.
Two refinements recorded on DIS-89 (agent decisions, enrich step, 2026-10-30):

- The parent's note «direction parameter to add in 02.3» is void: `StorePort.neighbors` already has
  `direction` since DIS-27.
- The parent's Q2 criterion uses the literal text «cambiar el cálculo de descuentos»; with the
  lexical anchor that text does not reach `DiscountService`, so the Q2 reproduction here uses
  «cambiar los descuentos de DiscountService» and a separate test characterises the literal text.
  What the CLI and the demo show is DIS-90's call.

## Impact

- **Core**: new `packages/core/src/impact/` (`impact.ts`, `reverse-walk.ts`, `relevance.ts`,
  `impact-request.ts`, `impact-report.ts`, `index.ts`) and one export line in
  `packages/core/src/index.ts`. No port, adapter, migration or schema change.
- **Seed and golden file**: none of the new files, nor `packages/core/src/index.ts`, is a seed
  (`packages/cli/src/seed/fingerprint.ts`) or answer fingerprint input, so no `seed:build` or
  `cache:build`.
- **Tests**: new `tests/unit/impact/*.spec.ts` and `tests/integration/impact/acme-shop.spec.ts`. No
  existing test changes.
- **Docs**: `docs/project-context.md` (the impact module). Commands as in `docs/project-context.md`
  → Commands.
- **Privacy / logging**: no personal data. `change` is user text: it is never logged nor copied into
  an error, and it leaves the process only as `findSymbols` search terms against the local database.
- **Dependencies**: none new.
