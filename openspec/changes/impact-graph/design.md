## Context

See `proposal.md` → Why. What exists and is reused unchanged:

- `packages/core/src/context/anchor.ts`: `anchor(store, projectId, text)` (at most
  `MAX_QUESTION_TERMS` = 16 `findSymbols` calls, at most `MAX_ANCHORS` = 32 symbols),
  `questionTerms`, `normaliseText`. Anchoring is lexical: a term and the 5-character prefix of each
  long token, matched as a substring of symbol names.
- `StorePort.neighbors(projectId, seeds, hops, kinds?, direction?)` (DIS-24, DIS-27): one statement,
  each node once with its minimum distance and its `resolution` (`exact` when some minimum-distance
  path follows only `exact` edges); seeds never come back; `hops` in 1..`MAX_HOPS` (3).
- `StorePort.findSymbols(projectId, name)`: case-insensitive substring search by name.
- `knowledge/graph-edge.ts`: there is no "contains" edge between a method and its class, and
  `tested_by` edges go class to class (`DiscountService → DiscountServiceTest`,
  `PriceCalculator → PriceCalculatorTest`).
- `context/rank.ts` (DIS-28 D7): the lexicographic, weightless ranking this design copies.
- `explain/explain-request.ts`: the strict Zod request and the `InvalidExplainRequest(field)` error
  that names the field without its value.
- Test support: `tests/support/in-memory-store.ts` (the `StorePort` double, with call counters, that
  follows `direction`), `tests/support/acme-shop-graph.ts` (a real subset of the seed, checked by
  `tests/unit/context/acme-shop-graph-coherence.spec.ts`), `tests/support/sample-graph.ts` (graph
  builders).

The oracle was checked against `seeds/graph-dump.sql` before writing the spec (a throwaway script in
the session scratchpad that replayed the anchor and a reverse breadth-first walk over the seed's
rows). For `cambiar los descuentos de DiscountService` the seed anchors, besides `DiscountService*`,
`DiscountApplied*` and `RecordDiscountAudit*` (prefix `disco`), and the walk reaches, at 1 hop,
`PriceCalculator::compute`, `PriceCalculator::taxableBase` (`exact`), the files
`app/Providers/EventServiceProvider.php` and `app/Providers/AppServiceProvider.php` and two test
files; at 2 hops the four callers of `compute` (`heuristic`) and `OrderPricingTest`; at 3 hops the
two routes and `OrderObserver::created`/`updated`. The seed scenarios therefore say "holds", not
"equals".

## Goals / Non-Goals

**Goals:**

- A pure core use case whose report keys (`direct`, `indirect`, `tests`, and `symbol`, `origin`,
  `resolution`, `hops` per entry) match `readme.md` §4 `/impact`, so DIS-90 and DIS-95 only project
  it (the core report adds `file` per entry and `hops` on `direct`; a projection may drop them).
- Bounded work: at most 16 searches for the anchor, at most one search per direct component reached
  through a method, and two traversals.

**Non-Goals:**

- Any change to `anchor`, `StorePort`, the Postgres adapter or the double.
- `risk`, `usage`, `query_log`, cache, CLI, HTTP (proposal → Non-goals).

## Decisions

### D1. Anchor (enrich D1)

`anchor()` unchanged; the symbols whose `fileKind` is `test` are dropped; an empty result answers
`{ status: 'unknown', reason: 'no-anchor' }` with no traversal, as `explain.ts` does. A `change`
without any search term (only stopwords and short words) anchors nothing without searching, so it
answers `no-anchor` without checking the project, exactly as `anchor()` and `explain` behave
(decision P6). Alternative rejected: a `getProject` call first, which would add a read to every call
for a case the HTTP layer (DIS-95) can check itself.

### D2. Traversal (enrich D2) — `impact/reverse-walk.ts`

1. `neighbors(projectId, anchorSymbolSeeds, maxHops, ['calls','imports','extends','implements'], 'in')`.
   Seeds are the anchor symbols only, not their files: seeding the file would make every importer
   of any symbol of that file a dependant. These are the dependency kinds `readIndexState` uses for
   the incremental reindex. `co_changed` and `describes` belong to DIS-94.
2. For each direct component (distance ≤ 1, not a `test` file) reached through a symbol whose name
   differs from the component's (a method), when no node of the report already is that class:
   `findSymbols(projectId, component)` and keep the symbol whose name equals the component exactly
   and whose `fileId` equals the method's. Only direct components: their coverage is what the risk
   rule of DIS-90 reads; the coverage of indirect components comes from the walk only.
3. `neighbors(projectId, seeds, 1, ['tested_by'], 'out')`, seeds = the anchor symbols, every reached
   node outside `test` files (symbols and files) and the classes of step 2, deduplicated. Skipped
   when the seed list is empty (it never is once the anchor is not empty).

The test distance used for ordering (D5) is computed here: a `tested_by` target's distance is one
more than the smallest distance of the seeds it is reached from. Because `neighbors` returns only
the target and its distance (1) from the whole seed set, the walk keeps the per-seed distance by
grouping the seeds by distance and sending one `tested_by` traversal per distinct seed distance
(at most `maxHops + 1` traversals, in practice 2 or 3), smallest distance first; a test already
found keeps its first distance. Alternative rejected: one traversal and a fixed test order by name
only, which loses "the test of what changes first" (decision P2).

### D3. Unit of the report: the component (enrich D3) — `impact/relevance.ts`

- Component of a symbol: its name up to the first `::` (whole name if none), keyed by `(fileId,
  component)`. Component of a file node: its path, kept only when no symbol component of the same
  file is in the report (any list).
- Every node of an anchor symbol's file is dropped; the anchor's components are `direct`, `hops` 0,
  `resolution` `exact`.
- Other components: minimum distance of their nodes; `exact` when one node at that distance is
  `exact`.
- File-node entries carry `symbol` = `file` = the path (decision P3): the report keeps one entry
  shape, and DIS-95 can tell them apart by `symbol === file` if it needs to.

### D4. Classification (enrich D4)

`test` file components → `tests` only; distance 0..1 → `direct`; 2..`maxHops` → `indirect`; every
entry `origin: 'graph'`. Test entries are `{ symbol, file, origin }` (decision P2), as `readme.md` §4.

### D5. Relevance (enrich D5)

A lexicographic key, no weights, as `rank.ts`: `hops`, `exact` before `heuristic`, lexical match
(`normaliseText` of `symbol` or `file` contains a term of `questionTerms(change)`), `symbol` then
`file` by `Buffer.compare` (byte order, the same order the store uses). For `tests` the first
position is the test distance of D2. The sort is stable, but byte order makes every key unique per
list, so input order never decides.

### D6. Validation (enrich D6) — `impact/impact-request.ts`

`impactRequestSchema = z.strictObject({ projectId: z.string(), change, maxHops? })`, `change` as in
the spec (code points counted with `[...s].length`, as `MAX_QUESTION_CHARS` does), `maxHops`
`z.int().min(1).max(MAX_HOPS).optional()`, `DEFAULT_IMPACT_HOPS = 2`. `parseImpactRequest(unknown)`
mirrors `parseExplainRequest`: the first issue's field, or `request`. `InvalidImpactRequest` extends
`DomainError`, code `INVALID_IMPACT_REQUEST`, message `Invalid impact request: <field>`. The 500
code-point limit and the NUL check exist because DIS-90 will write `change` into `query_log.text`.

### D7. Q2 and the lexical anchor (enrich D7)

The literal Q2 text does not anchor `DiscountService` (`descu` is not `disco`) and anchors
`PriceCalculator*` and `RecalculateTotals*` through `calcu`. The Q2 reproduction uses
`cambiar los descuentos de DiscountService`; the scenario "The literal Q2 text does not anchor the
discount service" characterises the limit and its test names D7 in a comment. No glossary, no
embeddings. What the CLI and `docs/DEMO.md` show is DIS-90's call.

### D8. Out of the use case (enrich D8)

No `risk`, `usage`, `query_log`, CLI, cache or HTTP.

### P1. Capability and module names

New capability `impact` (flat, like `explain` and `context-engine`); change id `impact-graph`, the
name the ticket proposes; module `packages/core/src/impact/` with `impact.ts`, `reverse-walk.ts`,
`relevance.ts`, `impact-request.ts`, `impact-report.ts`, `index.ts`. `impact()` signature:
`impact(store: StorePort, request: unknown): Promise<ImpactReport>`; it parses the request first,
like `explain`.

### P4. No seed or golden regeneration

`packages/cli/src/seed/fingerprint.ts` hashes `packages/core/src/index/` (the directory) and
`packages/core/src/knowledge/`, not `packages/core/src/index.ts` nor `impact/`; the answer
fingerprint list does not include them either. `npm run verify` in step 9 confirms it.

### P5. Small graphs in unit tests

The small-graph scenarios (component, file node, own file, relevance) are built with
`tests/support/sample-graph.ts` and loaded into the double; their `change` text is chosen so that
it anchors only the intended symbol (for example `cambiar run` for `Anchor::run`, whose terms do not
name `Anchor::helper`), and each test asserts its anchor before asserting the report.

### P7. No ADR

The design follows `explain` and `rank.ts` and is reversible; no ADR.

## Risks / Trade-offs

- [The lexical anchor over-reaches: on the seed, `disco` also anchors `DiscountApplied` and
  `RecordDiscountAudit`, which then appear in `direct` with `hops` 0] → accepted (D7); the seed
  scenarios assert "holds". Narrowing the anchor is semantic anchoring (CM-HU-19), not this ticket.
- [A component name is a convention (`Class::method`) of the analyzers; a symbol without `::` is its
  own component] → the PHP and TypeScript analyzers both write `Class::method`; free functions stay
  whole-name components.
- [The class lookup of D2 can match no symbol, for example a trait method or a renamed class] → then
  that component simply has no test from `tested_by`; DIS-90 reads that as "no test", which is the
  conservative reading for a risk rule.
- [Up to `maxHops + 1` `tested_by` traversals instead of one] → bounded (≤ 4 statements) and
  answered by the indexed traversal; documented in the non-functional note of DIS-89 as "two
  traversals" in the ticket, refined here (P2).

## Migration Plan

No migration, no schema change, no new dependency. Rollback is reverting the merge.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E8 are the DIS-89 `[enhanced]` decisions D1–D8
of the enrich step (2026-10-30), with the destination the ticket gives; P1–P7 are the design
decisions of this proposal. Destinations: A = this change; B = another existing ticket; C = the
author; D = accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | (D1) `anchor()` unchanged, `test` symbols dropped, empty anchor → `unknown`/`no-anchor` without traversal. | D — accepted |
| E2 | (D2) Reverse walk over `calls`, `imports`, `extends`, `implements` from the anchor symbols; tests from the walk and from one `tested_by` step that includes the class of each direct component. | D — accepted |
| E2b | (D2) If the risk rule needs the coverage of each direct element, DIS-90 adds that field to the report. | B — DIS-90 |
| E3 | (D3) The component is the unit of the report; the anchor's files are left out; minimum distance and `exact` when one shortest node is `exact`. | D — accepted |
| E4 | (D4) `direct` = anchor + distance 1; `indirect` = 2..`maxHops`; `test` components only in `tests`; `origin: 'graph'`. | D — accepted |
| E5 | (D5) Weightless lexicographic relevance key, as DIS-28 D7. | D — accepted |
| E6 | (D6) Strict request; `change` 5..500 code points, not blank, no U+0000; `maxHops` 1..3, default 2; `InvalidImpactRequest(field)` before any read. | D — accepted |
| E7 | (D7) The Q2 reproduction uses `cambiar los descuentos de DiscountService`; a test characterises the literal text; what the CLI and demo show is decided by DIS-90. | B — DIS-90 |
| E8 | (D8) `risk`, CLI, `query_log`, `usage` → DIS-90; `POST /impact` → DIS-95. | B — DIS-90, DIS-95 |
| E9 | (enrich, author step) No PowerShell check: the change touches neither the CLI nor `docs/DEMO.md`. Nothing is left for the author in a PowerShell terminal; the agent runs every check in Git Bash. | C — author (nothing to do) |
| P1 | Capability `impact`, change id `impact-graph`, module `packages/core/src/impact/`, `impact(store, request: unknown)`. | A |
| P2 | `tests` entries are `{ symbol, file, origin }` ordered by the distance at which each test is found, then lexical match, then byte order; the per-distance `tested_by` traversals of D2 compute that distance. | A |
| P3 | A reached file without symbol components is reported with `symbol` = `file` = its path. | A |
| P4 | No `seed:build` nor `cache:build`: no fingerprint input is touched; `npm run verify` confirms it. | A |
| P5 | Small-graph unit tests choose a `change` that anchors only the intended symbol and assert the anchor first. | A |
| P6 | A `change` without search terms answers `no-anchor` without checking the project, as `anchor()` and `explain` do; the HTTP 404 for an unknown project is DIS-95's. | B — DIS-95 |
| P7 | No ADR. | D — accepted |
