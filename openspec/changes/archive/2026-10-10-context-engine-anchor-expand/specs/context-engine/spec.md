## Purpose

Turns a natural-language question about one indexed project into the symbols it names (the anchor)
and expands that anchor over the knowledge graph into a candidate set of nearby symbols and files,
so the context sent to the model is grounded in the code and not in whole files.

## ADDED Requirements

### Requirement: Question terms

The Context Engine SHALL derive the search terms of a question deterministically, without any
network call:

- The question SHALL be lower-cased and its diacritics removed (canonical decomposition, then the
  combining marks dropped), and split on every character that is not a letter or a digit.
- Token lengths SHALL be counted in characters (letters or digits).
- Tokens with fewer than 3 characters SHALL be dropped, and so SHALL the tokens of a fixed list of
  Spanish and English stopwords.
- For every token of 6 or more characters, its 5-character prefix SHALL also be a term, right after
  the token, so a Spanish inflection still meets an English identifier (`validan` → `valid`).
- The terms SHALL be deduplicated, prefixes included, keeping their first-appearance order.

#### Scenario: The terms of a question include the prefixes of long tokens

- **WHEN** the terms of `¿Cómo se calcula el precio final de un pedido?` are derived
- **THEN** they are `calcula`, `calcu`, `precio`, `preci`, `final`, `pedido` and `pedid`, in that
  order

#### Scenario: Diacritics do not change the terms

- **WHEN** the terms of `cupón` and of `cupon` are derived
- **THEN** both are exactly `cupon`

### Requirement: Lexical anchoring

The Context Engine SHALL anchor a question in one project by searching the project's symbols by name
with each term of the question, and SHALL return the union of the symbols found, each once
(deduplicated by symbol id).

- Anchoring SHALL match symbol names only (case-insensitive substring, as the store's symbol search
  does); it SHALL NOT use embeddings nor signatures.
- It SHALL send at most one symbol search per term, so at most two per distinct token.
- A question with no term SHALL give an empty anchor without searching the store at all. A question
  whose terms match no symbol SHALL give an empty anchor.
- Each anchor symbol SHALL carry what a symbol search returns, including the id of its file.
- When the question has at least one term, an unknown project, or a project id that is not a
  well-formed UUID, MUST fail with `ProjectNotFound`. A question without terms SHALL give an empty
  anchor without checking the project.
- The question SHALL NOT be written to any log.

#### Scenario: A question is anchored on the symbols its words name

- **WHEN** the acme-shop graph is loaded and the question `¿Cómo se calcula el precio final de un
  pedido?` is anchored
- **THEN** the anchor includes `PriceCalculator::compute` and `PriceCalculator`

#### Scenario: A prefix anchors a Spanish verb on an English identifier

- **WHEN** the acme-shop graph is loaded and the question `¿Cómo se validan los cupones?` is
  anchored
- **THEN** the anchor includes `CouponValidator`

#### Scenario: A question without terms anchors nothing and does not search

- **WHEN** the question `¿Qué es el de un?` is anchored
- **THEN** the anchor is empty
- **AND** no symbol search was sent to the store

#### Scenario: A question whose terms match nothing anchors nothing

- **WHEN** the acme-shop graph is loaded and a question whose terms match no symbol name
  (`¿Dónde vive el ornitorrinco?`) is anchored
- **THEN** the anchor is empty

#### Scenario: Anchoring in an unknown project fails

- **WHEN** a question is anchored in a well-formed UUID that is no project's id, and in
  `not-a-uuid`
- **THEN** both calls fail with `ProjectNotFound`

### Requirement: Graph expansion of the anchor

The Context Engine SHALL expand an anchor into the nodes of the same project reachable from it in
1..`hops` steps, following edges of kinds `calls`, `tested_by`, `describes` and `co_changed` in both
directions.

- The seeds SHALL be every anchor symbol and the file of every anchor symbol, each file once, so
  that `co_changed` edges (which join files) are reachable.
- The result SHALL be the reached nodes, symbols and files, each once with its minimum distance,
  in the store's traversal order; no seed SHALL appear in it. Ranking and filtering the result is
  out of this requirement.
- `hops` MUST be an integer from 1 to 3; otherwise the expansion MUST fail with
  `InvalidStoreQuery` naming `hops`.
- Precedence: `hops` SHALL be validated before anything else, so an invalid `hops` fails with
  `InvalidStoreQuery` even when the anchor is empty. An empty anchor SHALL then give an empty result
  without traversing the store and without checking the project. With a non-empty anchor, an
  unknown project, or a project id that is not a well-formed UUID, MUST fail with
  `ProjectNotFound`, as the store's traversal reports it.
- The expansion SHALL ask the store for a single traversal, whatever the size of the anchor.

#### Scenario: The anchor expands to its tests, docs, callers and callees

- **WHEN** the acme-shop graph is loaded and the anchor `PriceCalculator` and
  `PriceCalculator::compute` (whose file is `app/Services/PriceCalculator.php`) is expanded at 2
  hops
- **THEN** the result contains, at distance 1, file `README.md` (an incoming `describes`),
  `PriceCalculatorTest` (an outgoing `tested_by`),
  `OrderPricingTest::test_final_price_applies_discount_before_tax` (an incoming `calls`), and
  `DiscountService::discountFor`, `TaxService::taxFor` and `ShippingService::shippingFor` (outgoing
  `calls`)
- **AND** neither anchor symbol nor `app/Services/PriceCalculator.php` is in it, nor file
  `docs/pricing.md`, which has no edge

#### Scenario: An anchor reaches the files co-changed with its own file

- **WHEN** the acme-shop graph is loaded and the anchor made of the class `DiscountService` (file
  `app/Services/DiscountService.php`), taken from a symbol search so that it carries its real file
  id, is expanded at 2 hops
- **THEN** the result contains file `app/Services/ShippingService.php` at distance 1 (the
  `co_changed` edge between the two files)
- **AND** file `app/Services/DiscountService.php` is not in it

#### Scenario: The expansion never leaves the project

- **WHEN** two projects hold the same acme-shop subset (same paths, names and edges) and the first
  project's anchor is expanded at 3 hops
- **THEN** every node of the result belongs to the first project

#### Scenario: An invalid hop count is rejected

- **WHEN** an anchor is expanded with `hops` 0 and with `hops` 4
- **THEN** both calls fail with `InvalidStoreQuery` naming `hops`

#### Scenario: An empty anchor expands to nothing without traversing

- **WHEN** an empty anchor is expanded at 2 hops
- **THEN** the result is empty
- **AND** no traversal was sent to the store
