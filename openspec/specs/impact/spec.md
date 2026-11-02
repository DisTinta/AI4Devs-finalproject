# impact Specification

## Purpose

Tells a developer, before a change, which components of one indexed project depend on what the
change describes, directly and transitively, and which tests cover it, from the deterministic graph
only and ordered by relevance. An answered report also names the risk level of the change (`HIGH`,
`MEDIUM` or `LOW`) with its rationale, and every returned report writes one `query_log` row.

## Requirements

### Requirement: Impact request validation

The impact use case SHALL accept a request with exactly these fields: `projectId` (a string),
`change` and, optionally, `maxHops`. It SHALL check the request before any read of the store:

- `change` SHALL be a string of 5 to 500 characters (code points) that is not only whitespace and
  holds no U+0000.
- `maxHops` SHALL be an integer from 1 to 3; when it is absent it SHALL be 2.
- Any other field SHALL make the request invalid.

An invalid request SHALL fail with `InvalidImpactRequest` naming the field at fault (`change`,
`maxHops`, `projectId`, or `request` for a malformed request or an unknown field). The error SHALL
never hold the value received, and no store method SHALL be called.

#### Scenario: An out-of-range hop count is rejected before any read

- **GIVEN** a store double that counts its calls
- **WHEN** impact is asked with a valid `change` and `maxHops` 4, then 0, then 1.5
- **THEN** each call fails with `InvalidImpactRequest` naming `maxHops`
- **AND** the store received no call

#### Scenario: An invalid change is rejected before any read

- **GIVEN** a store double that counts its calls
- **WHEN** impact is asked with a `change` of 4 characters, of 501 characters, of only spaces, and
  one holding U+0000
- **THEN** each call fails with `InvalidImpactRequest` naming `change`, whose message does not hold
  the value received
- **AND** the store received no call

#### Scenario: The hop count defaults to two

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` without `maxHops`
- **THEN** the report equals the report of the same request with `maxHops` 2

### Requirement: Anchoring the change

The impact use case SHALL anchor `change` with the Context Engine's lexical anchoring, unchanged,
and SHALL drop from the anchor every symbol of a file of kind `test` (a test is not what changes; it
is reported under `tests`). When the remaining anchor is empty, the answer SHALL be
`{ status: 'unknown', reason: 'no-anchor' }`, with `events` only as the requirement "Query log of an
impact call" says, and the graph SHALL not be traversed. An unknown or malformed `projectId` SHALL
fail with `ProjectNotFound` whenever `change` has at least one search term, as anchoring does.

#### Scenario: A change that anchors nothing answers no-anchor

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cómo se gestionan los reembolsos`
- **THEN** the answer is `{ status: 'unknown', reason: 'no-anchor' }`
- **AND** the store received no traversal

#### Scenario: A change that anchors only tests answers no-anchor

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `tocar applies`, whose terms name only the test method
  `OrderPricingTest::test_final_price_applies_discount_before_tax`
- **THEN** the answer is `{ status: 'unknown', reason: 'no-anchor' }`
- **AND** the store received no traversal

#### Scenario: Impact in an unknown project fails

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` in a well-formed project
  id that names no project
- **THEN** the call fails with `ProjectNotFound`

### Requirement: Reverse traversal of dependants

The impact use case SHALL find the dependants of the anchor by following, from the anchor symbols
and the files of the anchor symbols, the edges of kinds `calls`, `imports`, `extends` and
`implements` from target to source (who calls, imports, extends or implements), in 1 to `maxHops`
steps, within the project. The files are seeds too because an analyzer may write these edges file
to file (the TypeScript analyzer writes `imports` that way). It SHALL not follow any other edge kind
for dependants, nor edges from source to target. Every read SHALL be scoped to the project; that
scoping is the `StorePort` contract (every read names the project and returns only its rows) and is
not tested again by this capability.

#### Scenario: Only dependants within the hop limit are reported

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 1
- **THEN** `indirect` is empty
- **AND** `direct` holds `PriceCalculator` with `hops` 1

#### Scenario: Callees, documents and co-changed files are not dependants

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 3
- **THEN** no entry of `direct`, `indirect` or `tests` names `ShippingService`, `TaxService`,
  `Order`, `README.md` or `app/Services/ShippingService.php`

### Requirement: Report by component

An answered report SHALL be `{ status: 'answered', direct, indirect, tests, docs, history, risk }`,
with `events` only as the requirement "Query log of an impact call" says; `docs` and `history` are
always present (empty when there is nothing) and are given by the requirements "Related
documentation" and "Co-change history"; `risk` is given by the requirement "Risk level of a report".
An `unknown` report SHALL have no `docs` and no `history`, and SHALL not read them. Its unit SHALL be
the component:

- A symbol's component SHALL be its name up to the first `::` (the whole name when it has none), in
  the symbol's file; a file reached by the reverse traversal or by the `tested_by` step, none of
  whose symbols is a component of the report (in any list), SHALL be its own component, named by its
  path.
- The components of the anchor SHALL be in `direct` with `hops` 0 and `resolution` `exact`. Every
  other node of an anchor symbol's file SHALL be left out (it is part of the change).
- Every other component SHALL appear once, at the minimum distance of its nodes, with `resolution`
  `exact` when one of its nodes at that distance is reached by a path of only `exact` edges, and
  `heuristic` otherwise.
- A component of a `test` file SHALL appear only in `tests`. Of the rest, those at distance 1 SHALL
  be in `direct` and those at distance 2 to `maxHops` in `indirect`.
- An entry of `direct` or `indirect` SHALL be `{ symbol, file, origin: 'graph', resolution, hops }`
  and an entry of `tests` SHALL be `{ symbol, file, origin: 'graph' }`, where `symbol` is the
  component's name and `file` the repository path of its file.

#### Scenario: Q2 is reproduced over the acme-shop subset

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the answer has `status` `answered`
- **AND** `direct` holds `DiscountService` with `hops` 0 and `PriceCalculator` with `hops` 1 and
  `resolution` `exact`
- **AND** `indirect` holds `CheckoutController`, `OrderController`, `RecalculateTotals` and
  `SendOrderConfirmation`, each with `hops` 2 and `resolution` `heuristic`
- **AND** `tests` holds `DiscountServiceTest`, `PriceCalculatorTest` and `OrderPricingTest`
- **AND** every entry has `origin` `graph`, and no entry of `direct` or `indirect` belongs to a
  `test` file

#### Scenario: A component appears once at its minimum distance

- **GIVEN** a graph where `Anchor::run` is anchored, `Caller::a` calls it with an `exact` edge, and
  `Caller::b` calls `Middle::m`, which calls it with a `heuristic` edge
- **WHEN** impact is asked with `maxHops` 2
- **THEN** `Caller` appears once, in `direct`, with `hops` 1 and `resolution` `exact`
- **AND** `Middle` is in `direct` with `hops` 1 and `resolution` `heuristic`, and `indirect` is
  empty

#### Scenario: A reached file without symbols is reported by its path

- **GIVEN** a graph where `Anchor` is anchored and the file `config/bindings.php`, which has no
  symbol, imports it
- **WHEN** impact is asked with `maxHops` 1
- **THEN** `direct` holds an entry whose `symbol` and `file` are both `config/bindings.php`

#### Scenario: The anchor's own file is not a dependant

- **GIVEN** a graph where `Anchor::run` is anchored and `Anchor::helper`, in the same file and not
  anchored, calls it
- **WHEN** impact is asked with `maxHops` 1
- **THEN** `direct` holds `Anchor` once, with `hops` 0, and no other entry of that file

#### Scenario: An unknown report has neither documents nor history

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cómo se gestionan los reembolsos`
- **THEN** the answer is `{ status: 'unknown', reason: 'no-anchor' }`, without a `docs` or a
  `history` key
- **AND** the store received no read of co-changes, document links or file commits

### Requirement: Tests covering the change

`tests` SHALL hold, each once by component, the components of `test` files that the reverse
traversal reached and the targets of one `tested_by` step from source to target taken from:

- the anchor symbols and their files;
- every node the traversal reached outside `test` files and outside the files of the anchor
  symbols (those nodes are left out of the report and seed no `tested_by` step; the traversal
  distances of other nodes still count paths that pass through them);
- the file of each `direct` component;
- the class of each `direct` component (the anchor's components included) whose node in the report
  is one of its methods, that is, a symbol whose name differs from the component's: the symbol named
  exactly as the component, in the same file, when the project has one. When the project has none,
  that component adds no class to the step.

#### Scenario: Tests come from the walk and from the classes of direct components

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 1
- **THEN** `tests` is exactly `DiscountServiceTest` then `PriceCalculatorTest`, in that order
- **AND** `OrderPricingTest`, two hops away, is not in `tests`

#### Scenario: A reached node's own tests are found

- **GIVEN** a graph where `Anchor::run` is anchored, the function `helperFn` (no `::`) calls it, the
  function `outerFn` calls `helperFn`, `helperFn` is tested by `HelperFnTest` and `outerFn` by
  `OuterFnTest`, each test in a file of kind `test`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 2
- **THEN** `tests` holds `HelperFnTest` and `OuterFnTest`

#### Scenario: Importers and tests written file to file are found

- **GIVEN** a graph where the symbol `Anchor` of `src/anchor.ts` is anchored, the file
  `src/caller.ts`, none of whose symbols is reached, imports the file `src/anchor.ts`, and
  `src/anchor.ts` is tested by the file `src/anchor.test.ts`, of kind `test`
- **WHEN** impact is asked for `cambiar Anchor` with `maxHops` 1
- **THEN** `direct` holds an entry whose `symbol` and `file` are both `src/caller.ts`, with `hops` 1
- **AND** `tests` holds an entry whose `symbol` and `file` are both `src/anchor.test.ts`

#### Scenario: The tests of a direct component's file are found

- **GIVEN** a graph where the class `Anchor` of `src/anchor.ts` is anchored, the class `Caller` of
  `src/caller.ts` extends `Anchor` with an `exact` edge, no edge reaches the file `src/caller.ts`,
  and `src/caller.ts` is tested by the file `src/caller.test.ts`, of kind `test`
- **WHEN** impact is asked for `cambiar Anchor` with `maxHops` 1
- **THEN** `direct` holds `Caller` with `hops` 1
- **AND** `tests` holds an entry whose `symbol` and `file` are both `src/caller.test.ts`

### Requirement: Relevance order

Each list of an answered report SHALL be ordered by a lexicographic key without weights, so that the
order is deterministic and every position can be explained:

- `direct` and `indirect`: `hops` ascending; then `exact` before `heuristic`; then the entries whose
  `symbol` or `file`, normalised as the change's terms are, contains one of the terms of
  `questionTerms(change)` (all of them, not truncated); then `symbol` and then `file` in byte order.
- `tests`: the test distance, ascending; then the lexical match; then `symbol` and `file` in byte
  order. The test distance of a test component is the smallest of: the traversal distance of any of
  its nodes the reverse traversal reached; and, for each `tested_by` edge reaching it, one more than
  the seed distance of the edge's source. The seed distance of a source is the smallest value that
  applies to it: 0 for an anchor symbol or the file of one; its traversal distance for a reached
  node; the component's `hops` (0 or 1) for the class or the file found for a `direct` component.

#### Scenario: Exact dependants come before heuristic ones at the same distance

- **GIVEN** a graph where `Anchor::run` is anchored, `Zeta::a` calls it with an `exact` edge and
  `Alpha::b` with a `heuristic` edge, `Omega::c` calls `Zeta::a` with an `exact` edge and `Beta::d`
  calls `Alpha::b` with a `heuristic` edge
- **WHEN** impact is asked with `maxHops` 2
- **THEN** `direct` lists `Anchor`, then `Zeta`, then `Alpha`
- **AND** `indirect` lists `Omega`, then `Beta`

#### Scenario: The order does not follow the names

- **GIVEN** the graph of the previous scenario with the names of the `exact` and the `heuristic`
  dependants swapped at each distance
- **WHEN** impact is asked with `maxHops` 2
- **THEN** at each distance the `exact` dependant still comes before the `heuristic` one

#### Scenario: Tests are ordered by the distance of what they cover

- **GIVEN** a graph where `Anchor::run` is anchored, the class `Anchor` (same file) is tested by
  `ZetaTest`, `Alpha::b` calls `Anchor::run` with an `exact` edge, and the class `Alpha` (same file
  as `Alpha::b`) is tested by `AlphaTest`, each test in a file of kind `test`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `tests` is exactly `ZetaTest` then `AlphaTest`

### Requirement: Impact over the indexed acme-shop seed

Over the acme-shop graph loaded from the versioned seed into the database, the impact use case SHALL
give the dependants and tests of question Q2 of the fixtures, and SHALL reach a dependant three hops
away only when `maxHops` is 3.

#### Scenario: Q2 is reproduced over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the answer has `status` `answered`
- **AND** `direct` holds `DiscountService` with `hops` 0 and `PriceCalculator` with `hops` 1 and
  `resolution` `exact`
- **AND** `indirect` holds `CheckoutController`, `OrderController`, `RecalculateTotals` and
  `SendOrderConfirmation`, each with `hops` 2 and `resolution` `heuristic`
- **AND** `tests` holds `DiscountServiceTest`, `PriceCalculatorTest` and `OrderPricingTest`
- **AND** `indirect` does not hold `OrderObserver`
- **AND** every entry has `origin` `graph`, and no entry of `direct` or `indirect` belongs to a
  `test` file

#### Scenario: A dependant three hops away needs three hops

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 3
- **THEN** `indirect` holds `OrderObserver` with `hops` 3

### Requirement: Limit of the lexical anchor

The impact use case SHALL not translate or expand the words of `change`: what it anchors is what the
Context Engine's lexical anchoring finds.

#### Scenario: The literal Q2 text does not anchor the discount service

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar el cálculo de descuentos` with `maxHops` 2
- **THEN** `direct` holds `PriceCalculator` and does not hold `DiscountService`

### Requirement: Risk level of a report

Every answered report SHALL carry `risk: { level, rationale }`; an `unknown` report SHALL have no
`risk`.

A component of `direct` (those with `hops` 0 included) SHALL be *covered* when at least one
`tested_by` edge leaves, from source to target, one of the sources the requirement "Tests covering
the change" takes for that component: its anchor symbols and their file (for a component of the
anchor), its nodes reached by the reverse traversal, its file, or its class. A test reached only
through another component, or a test that only calls the component, SHALL not cover it.

A component of `direct` SHALL have a *heuristic-only chain* when it is not a component of the anchor
and none of its nodes reached by the reverse traversal has `resolution` `exact` (the resolution of a
node's paths of minimum distance). A component of the anchor never has one.

`D` SHALL be the number of entries of the report's `docs` with `stale` `true`.

`level` SHALL be:

- `HIGH` when at least one component of `direct` is not covered or has a heuristic-only chain;
- `LOW` when every component of `direct` is covered and has `resolution` `exact`, and `D` is 0;
- `MEDIUM` otherwise: every component of `direct` is covered, none has a heuristic-only chain, and
  at least one has `resolution` `heuristic` or `D` is at least 1.

A stale document SHALL therefore never change a `HIGH` or a `MEDIUM` level, and SHALL turn what
would be `LOW` into `MEDIUM`.

`U` and `H` SHALL be counted over the entries of the answered report's `direct`: a component that is
not an entry of `direct` (a file component left out because a symbol of its file is a component)
SHALL not be counted.

`rationale` SHALL be exactly
`<F> <files>, <T> <tests>, <U> <uncovered>, <H> <heuristic>.` when `D` is 0, and
`<F> <files>, <T> <tests>, <U> <uncovered>, <H> <heuristic>, <D> <stale>.` when `D` is at least 1,
where `F` is the number of distinct `file` values of `direct` and `indirect`, `T` the number of
entries of `tests`, `U` the number of components of `direct` that are not covered and `H` the number
of components of `direct` with a heuristic-only chain. Each count SHALL be followed by its words,
singular when the count is 1 and plural otherwise (0 included):

| Count | Singular | Plural |
|---|---|---|
| `F` | `fichero afectado` | `ficheros afectados` |
| `T` | `test que cubre el cambio` | `tests que cubren el cambio` |
| `U` | `elemento directo sin test` | `elementos directos sin test` |
| `H` | `elemento directo con cadena solo heurística` | `elementos directos con cadena solo heurística` |
| `D` | `documento desalineado` | `documentos desalineados` |

The rationale SHALL never contain the text of the change. The risk SHALL be computed with at most one
store read besides those of the report (the reads that give `docs` and `history` are reads of the
report): `D` is counted from `docs`, without a read of its own.

#### Scenario: A direct component without a test makes the risk high

- **GIVEN** a graph where `Anchor::run` is anchored, the class `Anchor` (same file) is tested by
  `AnchorTest`, in a file of kind `test`, `Caller::a` calls `Anchor::run` with an `exact` edge, the
  class `Caller` is in the same file as `Caller::a`, and nothing tests `Caller`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo
  sin test, 0 elementos directos con cadena solo heurística.`

#### Scenario: Every direct component tested and exact makes the risk low

- **GIVEN** the graph of the previous scenario where, besides, the class `Caller` is tested by
  `CallerTest`, in a file of kind `test`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `LOW`
- **AND** `risk.rationale` is `2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos
  directos sin test, 0 elementos directos con cadena solo heurística.`

#### Scenario: A covered direct component whose chains are all heuristic makes the risk high

- **GIVEN** the graph of the previous scenario with the edge from `Caller::a` to `Anchor::run`
  `heuristic`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos
  directos sin test, 1 elemento directo con cadena solo heurística.`

#### Scenario: A covered direct component with an exact chain beyond its first hop makes the risk medium

- **GIVEN** a graph where `Anchor::run` is anchored, the class `Anchor` (same file) is tested by
  `AnchorTest`, `Anchor::helper` (same file, not anchored) calls `Anchor::run` with an `exact` edge,
  `Caller::a` calls `Anchor::run` with a `heuristic` edge, `Caller::b` calls `Anchor::helper` with an
  `exact` edge, the class `Caller` is in the file of `Caller::a` and `Caller::b` and is tested by
  `CallerTest`, and each test is in a file of kind `test`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 2
- **THEN** `direct` holds `Caller` with `hops` 1 and `resolution` `heuristic`, and `indirect` is empty
- **AND** `risk.level` is `MEDIUM`
- **AND** `risk.rationale` is `2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos
  directos sin test, 0 elementos directos con cadena solo heurística.`

#### Scenario: An untested heuristic direct component makes the risk high

- **GIVEN** the graph of the first risk scenario with the edge from `Caller::a` to `Anchor::run`
  `heuristic`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo
  sin test, 1 elemento directo con cadena solo heurística.`

#### Scenario: The rationale counts in the singular

- **GIVEN** a graph where `Anchor::run` is anchored, nothing depends on it and nothing tests it
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `1 fichero afectado, 0 tests que cubren el cambio, 1 elemento directo
  sin test, 0 elementos directos con cadena solo heurística.`

#### Scenario: A test written file to file covers a direct component

- **GIVEN** a graph where the symbol `Anchor` of `src/anchor.ts` is anchored, the class `Caller` of
  `src/caller.ts` extends `Anchor` with an `exact` edge, the file `src/anchor.ts` is tested by the
  file `src/anchor.test.ts` and the file `src/caller.ts` by the file `src/caller.test.ts`, both of
  kind `test`
- **WHEN** impact is asked for `cambiar Anchor` with `maxHops` 1
- **THEN** `risk.level` is `LOW`

#### Scenario: The test of an indirect component does not cover a direct one

- **GIVEN** a graph where `Anchor::run` is anchored and tested through the class `Anchor` by
  `AnchorTest`, `Caller::a` calls it with an `exact` edge, `Outer::o` calls `Caller::a` with an
  `exact` edge, the method `Outer::o` is tested by `OuterTest`, each test in a file of kind `test`,
  and nothing tests `Caller`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 2
- **THEN** `tests` holds `AnchorTest` and `OuterTest`
- **AND** `risk.level` is `HIGH` and `risk.rationale` counts `1 elemento directo sin test`

#### Scenario: A stale document turns a low risk into medium

- **GIVEN** the graph of the scenario "Every direct component tested and exact makes the risk low"
  where, besides, the document `docs/a.md` has a `describes` edge towards `Caller::a`, and a commit
  touching the file of `Caller::a` is later than the latest commit touching `docs/a.md`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `MEDIUM`
- **AND** `risk.rationale` is `2 ficheros afectados, 2 tests que cubren el cambio, 0 elementos
  directos sin test, 0 elementos directos con cadena solo heurística, 1 documento desalineado.`

#### Scenario: Two stale documents are counted in the plural

- **GIVEN** the graph of the previous scenario where, besides, the document `docs/b.md` has a
  `describes` edge towards `Anchor::run`, and a commit touching the file of `Anchor::run` is later
  than the latest commit touching `docs/b.md`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `MEDIUM`
- **AND** `risk.rationale` ends with `, 2 documentos desalineados.`

#### Scenario: A stale document leaves a high risk high

- **GIVEN** the graph of the scenario "A direct component without a test makes the risk high" where,
  besides, the document `docs/a.md` has a `describes` edge towards `Caller::a`, and a commit touching
  the file of `Caller::a` is later than the latest commit touching `docs/a.md`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `2 ficheros afectados, 1 test que cubre el cambio, 1 elemento directo
  sin test, 0 elementos directos con cadena solo heurística, 1 documento desalineado.`

### Requirement: Risk over the indexed acme-shop seed

Over the acme-shop graph loaded from the versioned seed into the database, the risk of question Q2
SHALL follow the rule of the requirement "Risk level of a report" over the seed's own `tested_by`
edges.

#### Scenario: Q2 over the seed is high risk

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** `risk.level` is `HIGH`
- **AND** `risk.rationale` is `10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos
  directos sin test, 0 elementos directos con cadena solo heurística.`

### Requirement: Query log of an impact call

Every call of the impact use case that returns a report (`answered` or `unknown`) SHALL write exactly
one `query_log` row, after the report is built: `projectId` and `question` as the request gave them
(`question` is `change`), `capability` `impact`, `inputTokens`, `outputTokens`, `costUsd`,
`verifyInputTokens`, `verifyOutputTokens`, `verifyCostUsd` and `verifyCalls` 0, `baselineTokens`
`null`, `verifyLatencyMs` `null`, `cacheHit` `false`, and `latencyMs` the whole milliseconds between
the clock read once the request is checked and the clock read once the report is built, at least 1.
The clock is read exactly twice per call that returns a report. The
clock SHALL be injectable, and SHALL be the system clock when none is given.

A call that fails (an invalid request, `ProjectNotFound` from anchoring, any failure of a store read)
SHALL write no row. When the row cannot be written because the store fails to write it, names no
project, or rejects the entry, the report SHALL still be returned, with
`events: [{ type: 'query_not_logged', code }]` and `code` `store-write-failed`, `project-not-found` or
`invalid-entry`; any other failure of the write SHALL be thrown unchanged. A report whose row was
written SHALL have no `events` key. No event SHALL hold the text of the change.

#### Scenario: An answered call writes one impact row

- **GIVEN** the in-memory store loaded with the acme-shop subset and a clock that reads `t`, then
  `t` + 7 ms
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the store holds exactly one new row, with `capability` `impact`, `question`
  `cambiar los descuentos de DiscountService`, the project's id, every token, cost and verification
  count 0, `baselineTokens` and `verifyLatencyMs` `null`, `cacheHit` `false` and `latencyMs` 7
- **AND** the report has no `events` key

#### Scenario: A no-anchor call writes one impact row

- **GIVEN** the in-memory store loaded with the acme-shop subset and a clock that always reads the
  same instant
- **WHEN** impact is asked for `cómo se gestionan los reembolsos`
- **THEN** the store holds exactly one new row, with `capability` `impact` and `latencyMs` 1

#### Scenario: A failed call writes no row

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked with `maxHops` 4, then for `cambiar los descuentos de DiscountService` in
  a well-formed project id that names no project
- **THEN** the first fails with `InvalidImpactRequest` and the second with `ProjectNotFound`
- **AND** the store received no `query_log` write

#### Scenario: A row that cannot be written leaves the report with an event

- **GIVEN** the in-memory store loaded with the acme-shop subset, whose `query_log` writes fail with
  `QueryLogWriteFailed`
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the report equals the report of the same request over a store that writes the row, plus
  `events: [{ type: 'query_not_logged', code: 'store-write-failed' }]`

#### Scenario: A change without search terms in an unknown project reports the unlogged row

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `de la en por` in a well-formed project id that names no project
- **THEN** the answer is `{ status: 'unknown', reason: 'no-anchor', events: [{ type:
  'query_not_logged', code: 'project-not-found' }] }`

#### Scenario: An impact call over the seed writes its row

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the `query_log` table holds one more row of acme-shop with `capability` `impact`, `text`
  `cambiar los descuentos de DiscountService`, `cost_usd` 0 and `latency_ms` at least 1

### Requirement: Co-change history

An answered report SHALL carry `history`: the files that have changed together with the files of the
anchor in the repository history, read from the stored `co_changed` edges, separated from the
graph's lists and marked as coming from git. The *anchor files* SHALL be the files of the anchor
symbols (after the symbols of `test` files are dropped).

- Every stored `co_changed` edge between two files with a set `weight`, one of whose ends is an
  anchor file and whose other end is not, SHALL give the other end as a co-changed file, whichever
  end is the edge's source (an edge is stored once per pair). An edge whose two ends are anchor
  files SHALL give nothing.
- Each co-changed file SHALL appear once, as `{ file, coChangeRate, prs, origin: 'git' }`: `file` its
  repository path; `coChangeRate` the largest `weight` of its edges towards the anchor files; `prs`
  the distinct pull request numbers, ascending, of the commits that touch both that file and one of
  those anchor files (a commit without a pull request number adds none, so `prs` MAY be empty).
- No threshold SHALL hide a co-changed file: every edge that the store holds counts.
- `history` SHALL be ordered by `coChangeRate` descending, then `file` in byte order.
- A co-changed file SHALL be in `history` whether or not it is also an entry of `direct`,
  `indirect` or `tests`: the lists are independent and none of them changes because of `history`.
- No author data SHALL appear in `history`.

#### Scenario: Files co-changed with the anchor's file are the history

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` is anchored, a `co_changed` edge goes from
  `src/anchor.php` to `src/zeta.php` with `weight` 0.5 and another from `src/beta.php` to
  `src/anchor.php` with `weight` 1, the commits with pull requests 7 and 3 touch both
  `src/anchor.php` and `src/zeta.php`, and a commit without a pull request and the commit with pull
  request 9 touch both `src/anchor.php` and `src/beta.php`
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `history` is exactly `{ file: 'src/beta.php', coChangeRate: 1, prs: [9], origin: 'git' }`
  then `{ file: 'src/zeta.php', coChangeRate: 0.5, prs: [3, 7], origin: 'git' }`

#### Scenario: A co-change whose commits have no pull request has no PR

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` is anchored, a `co_changed` edge goes from
  `src/anchor.php` to `src/zeta.php` with `weight` 1, and the two commits that touch both files have
  no pull request number
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `history` is exactly `{ file: 'src/zeta.php', coChangeRate: 1, prs: [], origin: 'git' }`

#### Scenario: A file of the anchor is not in the history

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` and `Other::run` of `src/other.php` are
  both anchored by `cambiar run`, and a `co_changed` edge goes from `src/anchor.php` to
  `src/other.php` with `weight` 1
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `history` is empty

#### Scenario: A file co-changed with several anchor files appears once

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` and `Other::run` of `src/other.php` are
  both anchored by `cambiar run`, `src/zeta.php` has a `co_changed` edge with `src/anchor.php` of
  `weight` 0.4, whose shared commits have pull requests 5 and 2, and one with `src/other.php` of
  `weight` 0.8, whose shared commits have pull requests 5 and 8
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `history` is exactly `{ file: 'src/zeta.php', coChangeRate: 0.8, prs: [2, 5, 8], origin:
  'git' }`

### Requirement: Related documentation

An answered report SHALL carry `docs`: the documents that describe the code of the report, each
saying whether it is out of date with that code. The *report files* SHALL be the distinct `file`
values of `direct` and `indirect`.

- A file of kind `doc` SHALL be a *related document* when the project has a `describes` edge from it
  towards a report file or towards a symbol of a report file. Its *described files* SHALL be the
  report files it has such an edge towards (to the file or to one of its symbols).
- Only commits with a commit date SHALL count; a commit without one SHALL be ignored.
- A related document SHALL be *stale* when at least one commit touching one of its described files is
  strictly later than the latest commit touching the document. A document touched by no dated commit
  SHALL not be stale.
- Each related document SHALL appear once, as `{ path, stale: true, staleSince }` when stale and
  `{ path, stale: false }` (without a `staleSince` key) otherwise. `staleSince` SHALL be the full sha
  of the earliest commit, by commit date, that touches a described file and is later than the
  document's latest commit (the first change the document missed); between commits of the same
  date, the smallest sha in byte order.
- `docs` SHALL be ordered with the stale documents first, then by `path` in byte order.
- No author data SHALL appear in `docs`.

#### Scenario: A document older than the code it describes is stale since the first change it missed

- **GIVEN** a graph where `Anchor::run` is anchored, `Caller::a` of `src/caller.php` calls it with an
  `exact` edge, the document `docs/a.md` has a `describes` edge towards `Caller::a`, `docs/a.md` is
  touched by the commit `d1` of 2024-01-01, and `src/caller.php` by the commits `c2` of 2024-03-01
  and `c1` of 2024-02-01
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `docs` is exactly `{ path: 'docs/a.md', stale: true, staleSince: 'c1' }`

#### Scenario: A document touched with or after its code is not stale

- **GIVEN** two graphs based on the previous scenario: in the first, `docs/a.md` is touched by `d1`
  and by `c2`; in the second, by `d1` and by the commit `d2` of 2024-04-01
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1, once for each graph
- **THEN** each time `docs` is exactly `{ path: 'docs/a.md', stale: false }`, without a `staleSince`
  key

#### Scenario: A document described through a file and a symbol appears once

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` is anchored, the document `README.md` has
  a `describes` edge towards the file `src/anchor.php` and another towards `Anchor::run`, and the
  document `docs/other.md` has a `describes` edge only towards a file that is not in the report
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `docs` is exactly `{ path: 'README.md', stale: false }`

#### Scenario: Stale documents come first

- **GIVEN** a graph where `Anchor::run` of `src/anchor.php` is anchored, the documents `A.md` and
  `B.md` describe `Anchor::run`, `src/anchor.php` is touched by the commit `s1` of 2024-02-01,
  `A.md` by the commit `a1` of 2024-03-01 and `B.md` by the commit `b1` of 2024-01-01
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `docs` is exactly `{ path: 'B.md', stale: true, staleSince: 's1' }` then
  `{ path: 'A.md', stale: false }`

#### Scenario: Without commits no document is stale and the history is empty

- **GIVEN** a graph without commits and without any `co_changed` edge where `Anchor::run` of
  `src/anchor.php` is anchored and the document `README.md` describes it
- **WHEN** impact is asked for `cambiar run` with `maxHops` 1
- **THEN** `docs` is exactly `{ path: 'README.md', stale: false }` and `history` is empty

#### Scenario: A failing history read fails the call without a row

- **GIVEN** the in-memory store loaded with the acme-shop subset, whose read of the dated commits of
  some files rejects with an error
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** the call rejects with that same error
- **AND** the store received no `query_log` write

### Requirement: History and documentation over the indexed acme-shop seed

Over the acme-shop graph loaded from the versioned seed into the database, the report of question Q2
SHALL hold the co-change history of the discount service and the documentation that describes its
code, and SHALL mark that documentation stale only when the code changed after it.

#### Scenario: Q2 history over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** `history` is exactly `{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24,
  33, 55], origin: 'git' }`
- **AND** `direct`, `indirect` and `tests` are those of the scenario "Q2 is reproduced over the seed",
  and `risk` is the one of the scenario "Q2 over the seed is high risk"

#### Scenario: Q2 documentation over the seed is current

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** `docs` is exactly `{ path: 'README.md', stale: false }`

#### Scenario: A later change to the price calculator makes the readme stale

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store, plus, in the same
  transaction, a new commit of acme-shop dated 2024-05-10 that touches
  `app/Services/PriceCalculator.php`
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** `docs` is exactly `{ path: 'README.md', stale: true, staleSince: <the new commit's sha> }`
- **AND** `risk.level` is `HIGH` and `risk.rationale` is `10 ficheros afectados, 3 tests que cubren
  el cambio, 4 elementos directos sin test, 0 elementos directos con cadena solo heurística, 1
  documento desalineado.`
