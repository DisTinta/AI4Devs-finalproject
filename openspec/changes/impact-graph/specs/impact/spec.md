## Purpose

Tells a developer, before a change, which components of one indexed project depend on what the
change describes, directly and transitively, and which tests cover it, from the deterministic graph
only and ordered by relevance.

## ADDED Requirements

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
`{ status: 'unknown', reason: 'no-anchor' }` and the graph SHALL not be traversed. An unknown or
malformed `projectId` SHALL fail with `ProjectNotFound` whenever `change` has at least one search
term, as anchoring does.

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
only, the edges of kinds `calls`, `imports`, `extends` and `implements` from target to source (who
calls, imports, extends or implements), in 1 to `maxHops` steps, within the project. It SHALL not
follow any other edge kind for dependants, nor edges from source to target, and every read SHALL be
scoped to the project.

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

An answered report SHALL be `{ status: 'answered', direct, indirect, tests }`. Its unit SHALL be the
component:

- A symbol's component SHALL be its name up to the first `::` (the whole name when it has none), in
  the symbol's file; a reached file whose own file contributes no symbol component to the report
  SHALL be its own component, named by its path.
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

### Requirement: Tests covering the change

`tests` SHALL hold, each once by component, the components of `test` files that the reverse
traversal reached and the targets of one `tested_by` step from source to target taken from the
anchor symbols, from every node the traversal reached outside `test` files, and from the class of
each `direct` component reached through one of its methods: the symbol named exactly as the
component, in the same file, when the project has one.

#### Scenario: Tests come from the walk and from the classes of direct components

- **GIVEN** the in-memory store loaded with the acme-shop subset
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 1
- **THEN** `tests` is exactly `DiscountServiceTest` then `PriceCalculatorTest`, in that order
- **AND** `OrderPricingTest`, two hops away, is not in `tests`

### Requirement: Relevance order

Each list of an answered report SHALL be ordered by a lexicographic key without weights, so that the
order is deterministic and every position can be explained:

- `direct` and `indirect`: `hops` ascending; then `exact` before `heuristic`; then the entries whose
  `symbol` or `file`, normalised as the change's terms are, contains one of the change's terms;
  then `symbol` and then `file` in byte order.
- `tests`: the distance at which each test is found (for a test reached by the traversal, its
  distance; for a test found through `tested_by`, one more than the distance of the node it covers,
  that node at its own distance or 0 for the anchor); then the lexical match; then `symbol` and
  `file` in byte order.

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

### Requirement: Impact over the indexed acme-shop seed

Over the acme-shop graph loaded from the versioned seed into the database, the impact use case SHALL
give the dependants and tests of question Q2 of the fixtures, and SHALL reach a dependant three hops
away only when `maxHops` is 3.

#### Scenario: Q2 is reproduced over the seed

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` and the Postgres store
- **WHEN** impact is asked for `cambiar los descuentos de DiscountService` with `maxHops` 2
- **THEN** `direct` holds `DiscountService` with `hops` 0 and `PriceCalculator` with `hops` 1 and
  `resolution` `exact`
- **AND** `indirect` holds `CheckoutController`, `OrderController`, `RecalculateTotals` and
  `SendOrderConfirmation`, each with `hops` 2 and `resolution` `heuristic`
- **AND** `tests` holds `DiscountServiceTest`, `PriceCalculatorTest` and `OrderPricingTest`
- **AND** `indirect` does not hold `OrderObserver`

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
