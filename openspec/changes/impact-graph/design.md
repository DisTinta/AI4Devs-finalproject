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
- `knowledge/graph-edge.ts`: there is no "contains" edge between a method and its class. The PHP
  analyzer writes `tested_by` class to class (`DiscountService → DiscountServiceTest`,
  `PriceCalculator → PriceCalculatorTest`) and `imports` file to class
  (`packages/analyzers/php/src/edges.ts`); the TypeScript analyzer writes both `imports` and
  `tested_by` file to file (`packages/analyzers/typescript/src/edges.ts:32-34` and `:113`; the
  `task-api` rows of `seeds/graph-dump.sql`). In the acme-shop seed no edge of kind `calls`,
  `imports`, `extends`, `implements` or `tested_by` has a file as its target or as the source of a
  `tested_by` (checked with `grep` over the seed's `INSERT INTO edge` rows), so seeding files
  (D2) leaves the PHP oracle unchanged.
- `context/rank.ts` (DIS-28 D7): the lexicographic, weightless ranking this design follows; its
  private `matchesLexically` is extracted and shared (D5).
- `knowledge/byte-order.ts`: `compareBytes`, the UTF-8 byte order already used by
  `index/incremental-plan.ts` and `knowledge/co-change.ts`.
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
- Bounded work: at most 16 searches for the anchor, at most one search per distinct direct
  component (the anchor's components included) whose node in the report is a method, one reverse traversal and at most `maxHops + 1` (≤ 4)
  `tested_by` traversals.

**Non-Goals:**

- Any change to the behaviour of `anchor`, `StorePort`, the Postgres adapter or the double. The only
  edit outside `impact/` is the extraction of the lexical-match helper from `context/rank.ts` (D5),
  which keeps `rankCandidates` unchanged.
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

1. `neighbors(projectId, seeds, maxHops, ['calls','imports','extends','implements'], 'in')`, seeds =
   the anchor symbols and their files (decision R2). These are the dependency kinds `readIndexState`
   uses for the incremental reindex. `co_changed` and `describes` belong to DIS-94. The file seeds
   are needed for analyzers that write `imports` file to file (TypeScript): there, every importer of
   the anchor's file is a dependant, which is the granularity that analyzer records. With the PHP
   analyzer `imports` target the class symbol, so the file seeds add nothing (Context).
2. For each direct component (distance ≤ 1, not a `test` file, the anchor's components included)
   whose node in the report is a symbol whose name differs from the component's (a method), when no
   anchor symbol is that class and no node reached outside the anchor symbols' files is that class
   (decision R10): `findSymbols(projectId, component)` and keep the
   symbol whose name equals the component exactly and whose `fileId` equals the method's. Only
   direct components: their coverage is what the risk rule of DIS-90 reads; the coverage of indirect
   components comes from the walk only. When no symbol matches, the component adds no class. A
   class of a direct component counts that component's `hops` as its seed distance whenever that is
   smaller than its traversal distance (step 3), whether it was looked up or already reached.
3. `neighbors(projectId, seeds, 1, ['tested_by'], 'out')`, seeds = the anchor symbols and their
   files, every reached node outside `test` files and outside the anchor symbols' files (symbols and
   files), the file of each direct component (the only route to the tests of a direct component
   whose file the walk did not reach; scenario "The tests of a direct component's file are found",
   decision R9) and the classes of step 2, deduplicated. The nodes of
   the anchor symbols' files are not seeds: they are left out of the report (D3), and the anchor
   file seed and the class lookup of the anchor's components already cover them. Skipped when the
   seed list is empty (it never is once the anchor is not empty).

The test distance used for ordering (D5) is computed here (decision R3). The seed distance of a
source is the smallest value that applies to it: 0 for an anchor symbol or its file; the traversal
distance for a reached node; the component's `hops` (0 or 1) for the class or the file found for a
direct component. A `tested_by` target's distance is one more than the smallest seed distance it is
reached from; a test component also reached by the walk keeps the smaller of the two distances.
Because `neighbors` returns only the target and its distance (1) from the whole seed set, the walk
keeps the per-seed distance by grouping the seeds by seed distance and sending one `tested_by`
traversal per distinct seed distance present (at most `maxHops + 1`), smallest distance first; a
test already found keeps its first, and so smallest, distance. Alternative rejected: one traversal
and a fixed test order by name only, which loses "the test of what changes first" (decision P2).

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
(`normaliseText` of `symbol` or `file` contains a term of `questionTerms(change)`, every term, not
truncated to the `MAX_QUESTION_TERMS` that anchoring searched), `symbol` then `file` by
`compareBytes` (`packages/core/src/knowledge/byte-order.ts`, byte order, the same order the store
uses). For `tests` the first position is the test distance of D2. The sort is stable, but byte
order makes every key unique per list, so input order never decides.

The lexical match reuses a helper extracted from `context/rank.ts` `matchesLexically`:
`containsAnyTerm(texts, terms)` in a new `packages/core/src/context/lexical-match.ts`, exported and
used by both `rank.ts` and `impact/relevance.ts`, not copied (decision R6). `anchor.ts` is not
edited. `context/` is not a seed or answer fingerprint input
(`packages/cli/src/cache/answer-fingerprint.ts` leaves it out on purpose), so P4 holds.

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
embeddings. What the CLI and `docs/DEMO.md` show is DIS-90's call. The parent DIS-83 AC1 names the
literal text; after the first spec audit the agent confirmed, as lead engineer, that DIS-89 reproduces
the graph part of Q2 with the rewritten text and that the literal-text clause of DIS-83 AC1 is
carried by DIS-90 (decision R1, destination B).

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
name `Anchor::helper`), and each test asserts its anchor before asserting the report. The scenarios
added after the first spec audit write their `change` text in the spec; the older small-graph
scenarios leave it to the test, which asserts the anchor first (decision R8).

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
- [Deviation from `docs/backend-standards.md` §5, "Avoid N+1: a graph traversal is one recursive
  query, not a loop of queries"] → D2 step 2 runs one `findSymbols` per distinct direct component
  (the anchor's components included) whose node in the report is a method (at most one per component, so bounded by the direct components of at
  most `MAX_ANCHORS` = 32 anchors), and D2 step 3 runs at most `maxHops + 1` `tested_by`
  statements. Each traversal itself is still one recursive statement. Why: `StorePort` has no batch
  symbol lookup, and changing the port is a non-goal; the ticket's non-functional note accepts the
  cost. Recorded as R7.
- [On a TypeScript project, seeding the anchor's file makes every importer of that file a
  dependant, even an importer of another symbol of the file] → accepted: it is the granularity the
  TypeScript analyzer records (file → file `imports`); a finer one needs symbol-level imports from
  that analyzer, not this ticket.

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
| E2 | (D2) Reverse walk over `calls`, `imports`, `extends`, `implements` from the anchor symbols; tests from the walk and from one `tested_by` step that includes the class of each direct component. Refined by R2 (the anchor's files are seeds too) and R3 (test distance). | D — accepted |
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

*Agent's text: decisions of correction round 1 of the spec audit
(`reports/2026-10-30-spec-audit.md`, run 1), taken by the agent as lead engineer without the author
(`docs/AUTONOMOUS-RUN.md` §2 and §6). Each one answers a question or a finding of that run.*

| Id | Decision | Destination |
|---|---|---|
| R1 | (Audit Q1) DIS-89 reproduces the graph part of Q2 with `cambiar los descuentos de DiscountService`; the literal text of DIS-83 AC1 stays characterised here (it does not anchor `DiscountService`) and its clause is carried by DIS-90, owner of the `impact` command and of what the demo shows. Widening the anchor (glossary, translation, embeddings) is semantic anchoring (CM-HU-19), not this ticket. | B — DIS-90 |
| R2 | (Audit Q2, B4) Option (a): the reverse walk and the `tested_by` step are also seeded with the files of the anchor symbols, and the `tested_by` step with the file of each direct component, so that a TypeScript project (file → file `imports` and `tested_by`) gets its importers and tests. It fulfils ticket D2 for every analyzer of the seed (`task-api` included) at no extra statement; the PHP oracle does not change (no acme-shop edge of those kinds touches a file). Refines E2 and ticket D2 ("only the anchor symbols"). New scenario "Importers and tests written file to file are found". | A |
| R3 | (B2) Test distance: the smallest of the walk distance and, per `tested_by` edge, one more than the source's seed distance (0 for an anchor symbol or its file, the traversal distance for a reached node, the component's `hops` for the class or file found for a direct component). The class lookup applies to the anchor's components too. New scenario "Tests are ordered by the distance of what they cover". | A |
| R4 | (B3) The `tested_by` step seeds every reached node outside `test` files and outside the anchor's files; the nodes of the anchor's files seed nothing and their paths still count in the walk distances. New scenario "A reached node's own tests are found"; the case of a class lookup that finds nothing is an extra case of task 3.5. | A |
| R5 | (B1) The seed scenario also asserts `status` `answered`, `origin` `graph` and no `test` component in `direct` or `indirect`, as DIS-89 AC2 inherits from AC1. | A |
| R6 | (Improvable, code reuse) Byte order through `compareBytes` (`knowledge/byte-order.ts`); the lexical match through `containsAnyTerm`, extracted from `rank.ts` into `context/lexical-match.ts` and shared, with `rankCandidates` unchanged and its tests untouched. The lexical match uses every term of `questionTerms(change)`, not truncated. | A |
| R7 | (Improvable, `docs/backend-standards.md` §5) The per-component `findSymbols` and the per-distance `tested_by` statements are a recorded, bounded deviation from "Avoid N+1" (design → Risks), because `StorePort` has no batch lookup and changing it is a non-goal. | D — accepted |
| R8 | (Improvable) Project scoping is guaranteed by the `StorePort` contract and not tested again; a `projectId` given as a number is an extra case of task 1.3; the new scenarios write their `change` text; End-to-End testing is not applicable (no UI); the merge of 12.7 is for the autonomous run only. | A |

*Agent's text: decisions of correction round 2 of the spec audit
(`reports/2026-10-30-spec-audit.md`, run 2), taken by the agent as lead engineer without the author
(`docs/AUTONOMOUS-RUN.md` §2 and §6). Run 2 asked no question for the author.*

| Id | Decision | Destination |
|---|---|---|
| R9 | (Audit run 2, B1) New scenario "The tests of a direct component's file are found" (task 4.7) pins the file seed of a direct component in the `tested_by` step and its seed distance (the component's `hops`); the spec has 22 scenarios (20 unit, 2 integration). | A |
| R10 | (Audit run 2, improvable) D2 step 2 skips the class lookup only when the class is an anchor symbol or a node reached outside the anchor symbols' files, and a direct component's class always counts the component's `hops` as seed distance when smaller, so the design matches the spec in both corner cases of the audit; the spec's "reached file" component bullet uses D3's wording (no circular "own file"). | A |
| R11 | (Audit run 2, improvable, Linear) The `[enhanced]` text of DIS-89 (D2 "solo los símbolos del ancla", "dos travesías") is not edited: the round 1 and round 2 comments on DIS-89 record the refinements R2 and R7 and are enough for traceability; this widens nothing. | D — accepted |
| R12 | (Audit run 3, improvable) The file-component rule names files reached by the `tested_by` step; Goals and Risks name the anchor's components in the class-lookup bound. Applied to the spec and the design before the apply. | A |

*Agent's text: decisions taken in the apply step (`docs/AUTONOMOUS-RUN.md` §6), without the author.*

| Id | Decision | Destination |
|---|---|---|
| A1 | The integration run uses a second database (`codemind_it`, created in the same container) because the local `codemind` database holds the loaded seed (2 projects) and `tests/integration/helpers/global-setup.ts` refuses a non-empty one; emptying it would have destroyed the state step 9 reads. | D — accepted |
| A2 | The small-graph unit tests (`components.spec.ts`, `relevance.spec.ts`) were written after the first version of the walk, not before it: the request, anchor and Q2 tests were red first (module missing, `impact is not a function`). Stryker then showed surviving mutants and three tests were added from them. Recorded for honesty, not as a rule. | D — accepted |
| A3 | Stryker (`impact/` rows: 77.5 % overall, `impact.ts` 100, `impact-request.ts` 83.7, `relevance.ts` 79, `reverse-walk.ts` 69.9; global score 92.88 ≥ the 80 break threshold). Surviving mutants accepted: string literals of the seed `type` (`'symbol'`/`'file'`), redundant guards whose other branch gives the same result (for example `if (anchorFiles.has(fileId)) continue` for a node whose component merges into the anchor's), the `||=`/`<` merge of minimum distance (the store returns nodes in distance order), the `sort` of seed distances (insertion order already ascends in every graph the tests build) and `?.` over an issue list that is never empty. | D — accepted |
| A3b | Killing the seed-distance survivors needs a graph where a larger seed distance is inserted before a smaller one for the same node; none of the 22 scenarios produces it. If the author wants them killed, a property test over random graphs (DIS-94 or later). | D — accepted |
| A4 | The manual run (step 9) on the real seed matches the spec: `maxHops` 1 gives no `indirect` and tests `DiscountServiceTest`, `PriceCalculatorTest`; 2 adds the four `heuristic` callers and `OrderPricingTest`; 3 adds `OrderObserver` and two routes. The literal Q2 text anchors `PriceCalculator` and `RecalculateTotals` only. | D — accepted |

*Agent's text: decisions taken in the review step (`/show-spec-working`, `/verify-against-spec` and
`/adversarial-review` in inline mode, `docs/AUTONOMOUS-RUN.md` §6), without the author. Reports:
`reports/2026-10-30-show-spec-working.md`, `reports/2026-10-30-verify-against-spec.md`,
`reports/2026-10-30-adversarial-review.md`.*

| Id | Decision | Destination |
|---|---|---|
| V1 | (Minor, fixed) A direct method component with a blank name (`::run`) made `findTests` send a blank `findSymbols`, which the store rejects; the call failed instead of adding no class. A blank component now has no class and sends no search (task 12.6.1). The analyzers never write such a name; the fix makes the spec's "adds no class" hold for any graph. | A |
| V2 | (Unspecified behaviour) `context/index.ts` re-exports `containsAnyTerm`, as it re-exports every `context/` module. Kept: pure helper, and leaving one module out of the barrel would break its convention. | D — accepted |
| V3 | (Minor, fixed) The two Q2 tests checked "no `direct`/`indirect` entry in a `test` file" with the `tests/` path prefix; they now check the files of kind `test` of the graph and of the loaded seed (task 12.6.2). | A |
| V4 | (Minor) The redundant `hopsOf(...).length > 0` assertion of "The literal Q2 text does not anchor the discount service" is left: both `THEN`s are asserted exactly, so it weakens nothing. | D — accepted |
| V5 | (Minor, process) The R12 wording reached the spec in the commit after the implementation, and the spec-audit report lacked "Resolution of run 3". The wording is the one run 3 proposed and changes no behaviour; the resolution section is appended (task 12.6.3). | A |
| V6 | The scenario "A change that anchors only tests answers no-anchor" holds over the acme-shop subset; on the full seed `tocar applies` also anchors `DiscountApplied` (prefix `appli`), the accepted over-reach of the lexical anchor (Risks, D7). | D — accepted |
