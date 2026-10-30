## MODIFIED Requirements

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

### Requirement: Report by component

An answered report SHALL be `{ status: 'answered', direct, indirect, tests, risk }`, with `events`
only as the requirement "Query log of an impact call" says; `risk` is given by the requirement "Risk
level of a report". Its unit SHALL be the component:

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

## ADDED Requirements

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

`level` SHALL be:

- `HIGH` when at least one component of `direct` is not covered or has a heuristic-only chain;
- `LOW` when every component of `direct` is covered and has `resolution` `exact`;
- `MEDIUM` otherwise: every component of `direct` is covered, none has a heuristic-only chain, and
  at least one has `resolution` `heuristic`.

`U` and `H` SHALL be counted over the entries of the answered report's `direct`: a component that is
not an entry of `direct` (a file component left out because a symbol of its file is a component)
SHALL not be counted.

`rationale` SHALL be exactly
`<F> <files>, <T> <tests>, <U> <uncovered>, <H> <heuristic>.`, where `F` is the number of distinct
`file` values of `direct` and `indirect`, `T` the number of entries of `tests`, `U` the number of
components of `direct` that are not covered and `H` the number of components of `direct` with a
heuristic-only chain. Each count SHALL be followed by its words, singular when the count is 1
and plural otherwise (0 included):

| Count | Singular | Plural |
|---|---|---|
| `F` | `fichero afectado` | `ficheros afectados` |
| `T` | `test que cubre el cambio` | `tests que cubren el cambio` |
| `U` | `elemento directo sin test` | `elementos directos sin test` |
| `H` | `elemento directo con cadena solo heurística` | `elementos directos con cadena solo heurística` |

The rationale SHALL never contain the text of the change. The risk SHALL be computed with at most one
store read besides those of the report.

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
