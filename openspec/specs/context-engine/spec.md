# context-engine Specification

## Purpose
Turns a natural-language question about one indexed project into the symbols it names (the anchor)
and expands that anchor over the knowledge graph into a candidate set of nearby symbols and files,
so the context sent to the model is grounded in the code and not in whole files.

## Requirements

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
- It SHALL search with at most the first 16 terms of the question, in term order, so a question
  sends at most 16 symbol searches whatever its length.
- The anchor SHALL hold at most 32 symbols. When the searches find more, the anchor SHALL keep the
  32 that match the most terms, breaking ties by first-found order, and SHALL return the kept
  symbols in first-found order.
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

#### Scenario: A long question sends a bounded number of searches

- **WHEN** a question made of 30 distinct tokens of 8 letters each, none a stopword, is anchored
- **THEN** at most 16 symbol searches were sent to the store

#### Scenario: The anchor keeps the symbols that match the most terms

- **WHEN** a project holds 40 symbols whose names contain `get`, exactly one of them (`getTotal`)
  also containing `total`, and the question `get total` is anchored
- **THEN** the anchor holds 32 symbols, `getTotal` among them
- **AND** the other 31 are the first 31 symbols the search for `get` found, and the 32 are in
  first-found order

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

### Requirement: Candidate ranking

The Context Engine SHALL order the candidates of a question (its anchor symbols and the nodes their
expansion reached) by a lexicographic key, with no weighted score:

1. distance, ascending; every anchor symbol has distance 0;
2. origin: `anchor` (an anchor symbol), then `exact`, then `heuristic` (the resolution of the
   node's shortest paths, as the traversal reports it);
3. file kind: `test`, then `source`, then `doc`, then `config` (a symbol's file kind is the kind of
   its file);
4. lexical match first: a candidate whose name (for a symbol) or path (for a file or a symbol),
   normalised as question terms are (lower case, no diacritics), contains a term of the question
   precedes one that does not;
5. input order: anchor symbols in anchor order, then nodes in the store's traversal order.

- Every question SHALL be ranked as a behaviour question; there is no question-type classification.
- Ranking SHALL be deterministic: the same candidates and terms give the same order.

#### Scenario: The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match

- **WHEN** the acme-shop graph is loaded, the anchor `PriceCalculator` and
  `PriceCalculator::compute` is given (in that order), its expansion at 1 hop is ranked with the
  terms of `¿Cómo se calcula el precio final de un pedido?`
- **THEN** the order is exactly: `PriceCalculator`, `PriceCalculator::compute` (both `anchor`,
  distance 0); `PriceCalculatorTest` (exact, test); `DiscountService::discountFor`,
  `ShippingService::shippingFor`, `TaxService::taxFor` (exact, source);
  `OrderPricingTest::test_final_price_applies_discount_before_tax` (heuristic, test);
  `RecalculateTotals::handle` (heuristic, source, lexical match on `calcula`);
  `CheckoutController::store`, `OrderController::show`, `SendOrderConfirmation::handle`,
  `Order::getSubtotalAttribute` (heuristic, source); file `README.md` (heuristic, doc)

### Requirement: Token estimate

The Context Engine SHALL estimate the tokens of a text locally, without any network call, as the
number of its characters (Unicode code points) divided by 4, rounded up, and SHALL declare that
estimator as `chars-div-4` on every context pack, so its consumers know every token count is an
estimate.

#### Scenario: Tokens are a quarter of the characters, rounded up

- **WHEN** the tokens of ``, `abcd`, `abcde` and of a text of one astral letter are estimated
- **THEN** they are 0, 1, 2 and 1

### Requirement: Token budget

The Context Engine SHALL fit the spans of the ranked candidates to a token budget, walking them in
rank order, so that the sum of the tokens of the included spans never exceeds the budget.

- A span SHALL be atomic: it is included whole or skipped, never truncated. A span that does not fit
  SHALL be skipped and the walk SHALL go on with the next candidate.
- A symbol candidate SHALL give the span of its lines (start line to end line). A file candidate
  SHALL give a whole-file span: from line 1 to the file's last line, with no symbol.
- The included spans of one file SHALL never overlap. A candidate whose lines lie inside an included
  span of the same file, or that overlaps any included span of its file without containing it, SHALL
  be dropped, even when it also contains other included spans. A candidate whose lines contain every
  included span of its file it overlaps (at least one) SHALL replace them, and SHALL be included only
  if the total after the replacement fits the budget; the replacing span SHALL take the place of the
  first span it replaces, and SHALL carry the smallest distance and the best origin (`anchor`, then
  `exact`, then `heuristic`) among itself and the spans it replaces.
- `omitted` SHALL count the candidates skipped because they did not fit; dropped candidates SHALL
  NOT be counted.
- The included spans SHALL be in rank order, except for the placement of a replacing span above.

#### Scenario: The budget is never exceeded and no span is truncated

- **WHEN** candidates of 400, 700, 300 and 500 tokens, in that rank order and from different files,
  are fitted to a budget of 1000
- **THEN** the first and the third are included, whole, the total is 700 and `omitted` is 2

#### Scenario: Generated candidates never exceed the budget

- **WHEN** at least 200 generated sets of candidates (random files, line ranges, sizes, overlaps
  and budgets from 1000 to 32000) are fitted, with a fixed seed in CI
- **THEN** for every set the total of the included spans is at most the budget, and no two included
  spans of one file overlap

#### Scenario: A method inside an included class is not counted twice

- **WHEN** the class `PriceCalculator` (lines 16–44) is ranked before its method
  `PriceCalculator::compute` (lines 25–35) and both fit
- **THEN** the pack holds a single span of `app/Services/PriceCalculator.php`, lines 16–44
- **AND** the total counts it once and `omitted` is 0

#### Scenario: A file node gives a whole-file span

- **WHEN** file `README.md` is a candidate and fits
- **THEN** its span starts at line 1, ends at the last line of `README.md` at the indexed commit and
  has no symbol

#### Scenario: A whole file replaces the symbol spans it contains

- **WHEN** `ShippingService::shippingFor` (lines 22–34) is included and then file
  `app/Services/ShippingService.php` (a `co_changed` node) is a candidate that fits once the method's
  tokens are discounted
- **THEN** the pack holds a single span of that file, from line 1 to its last line, in the place
  the method's span had, and the total is the file span's tokens

#### Scenario: A replacing span keeps the best origin and distance of what it replaces

- **WHEN** the method `DiscountService::discountFor` (exact, distance 1) is included and then the
  class `DiscountService` (heuristic, distance 2), whose lines contain it, fits
- **THEN** the pack holds one span with the class's lines and symbol, origin `exact` and distance 1

#### Scenario: A candidate that contains one span and cuts across another is dropped

- **WHEN** spans of lines 10–20 and 30–40 of one file are included, and a candidate of lines 5–35
  of the same file follows and would fit
- **THEN** the candidate is dropped, both included spans stay, and `omitted` does not count it

#### Scenario: An anchor that does not fit leaves room for its neighbours

- **WHEN** the anchor's span is larger than a budget of 1000 and a neighbour's span of 300 tokens
  follows it
- **THEN** the pack is `ok` with the neighbour's span, and `omitted` counts the anchor

### Requirement: Context pack

The Context Engine SHALL build, for a question about one project, a context pack: the anchor and
its expansion, ranked, read from the project's repository at its indexed commit, redacted, and
fitted to a token budget.

- Inputs: the project id, the question, `tokenBudget` (an integer from 1000 to 32000, 8000 when not
  given) and `hops` (an integer from 1 to 3, 2 when not given), plus the workspace root, an absolute
  path the caller provides.
- An `ok` pack SHALL carry `status: 'ok'`, its `spans`, `tokens` (the sum of the spans' tokens),
  `baselineTokens`, `tokenBudget`, `omitted` and `estimator: 'chars-div-4'`. Each span SHALL carry
  its file's path, id and kind, its start and end line, its symbol (id, name and kind) when it comes
  from a symbol, its redacted `text`, its `tokens`, its `distance` (0 for an anchor symbol) and its
  `origin` (`anchor`, `exact` or `heuristic`).
- A span's `text` SHALL be exactly its lines of the file's redacted content, each line as stored,
  joined by line feeds, with no trailing line feed. A file's last line is its number of lines, a
  final line feed ending the last line rather than starting a new one; an empty file has one empty
  line.
- Every file's content SHALL be redacted of secrets, as the indexing redacts them, before any span
  is cut or any token counted. Redaction keeps the number of lines, so line numbers stay valid.
- `baselineTokens` SHALL be the sum, over the distinct files of the included spans, of the
  estimated tokens of each whole redacted file, each file once.
- An `empty` pack SHALL carry `status: 'empty'`, a `reason`, no spans, `tokens` and
  `baselineTokens` 0, `tokenBudget`, `omitted` and `estimator: 'chars-div-4'`. The reason SHALL be
  `no-anchor` when the anchor is empty (then nothing is traversed, the project is not read, no file
  is read and `omitted` is 0), and `over-budget` when there are candidates but no span fits.
- Validation SHALL come first, before any store call: a workspace root that is not absolute MUST
  fail with `RangeError` naming `workspaceRoot`; an invalid `tokenBudget` MUST fail with
  `RangeError` naming `tokenBudget`; an invalid `hops` MUST fail with `InvalidStoreQuery` naming
  `hops`.
- An unknown project, or a project id that is not a well-formed UUID, MUST fail with
  `ProjectNotFound` when the question has a term (a question without terms gives a `no-anchor` pack,
  as anchoring does). A project with no indexed commit MUST fail with `SourceUnavailable`, reason
  `not-indexed`, after anchoring and before reading any file. A file that cannot be read MUST fail
  with the `SourceUnavailable` the source reader raises, naming the path and never the content.
- The repository root SHALL be the project's root path when it is absolute, and the root path
  joined to the workspace root by the platform's path rules when it is relative. The process
  working directory SHALL NOT be used.
- Each distinct file SHALL be read at most once per pack, and only files of candidates SHALL be read.
- Neither the question nor any span text SHALL be written to any log.

#### Scenario: The pack of the price question holds the calculator class once

- **WHEN** acme-shop is indexed in the database, its history rebuilt, and the pack of `¿Cómo se
  calcula el precio final de un pedido?` is built with a budget of 8000
- **THEN** its `tokens` is at most 8000
- **AND** it holds exactly one span of `app/Services/PriceCalculator.php`, lines 16–44, whose
  `text` equals lines 16–44 of that file at the indexed commit, redacted, and no separate span of
  `PriceCalculator::compute`

#### Scenario: Every anchor symbol of the question enters the pack as an anchor

- **WHEN** acme-shop is indexed in the database and the pack of `¿Cómo se calcula el precio final
  de un pedido?` is built with a budget of 8000
- **THEN** the spans holding the lines of `PriceCalculatorTest`, `RecalculateTotals::handle` and
  `OrderPricingTest::test_final_price_applies_discount_before_tax` have origin `anchor` and
  distance 0 (a method is held by its class's span when the class is an anchor too)

#### Scenario: Whole files are counted once for the baseline

- **WHEN** a pack includes two spans of file `F1` (4000 characters) and one span of file `F2`
  (2000 characters)
- **THEN** `baselineTokens` is 1500

#### Scenario: A question without anchor gives an empty pack without reading

- **WHEN** the acme-shop graph is loaded and the pack of `¿Dónde vive el ornitorrinco?` is built
- **THEN** the pack is `empty` with reason `no-anchor`
- **AND** no traversal and no project read were sent to the store, and no file was read

#### Scenario: A pack where nothing fits is empty and over budget

- **WHEN** the span of the anchor and the span of every candidate are larger than a budget of 1000
- **THEN** the pack is `empty` with reason `over-budget`, and `omitted` counts every candidate

#### Scenario: Secrets are redacted before counting

- **WHEN** a span's lines hold an AWS access key id
- **THEN** its `text` shows `[REDACTED: possible secret]` instead of the key
- **AND** its tokens are those of the redacted text

#### Scenario: Every pack declares its estimator

- **WHEN** an `ok` pack and an `empty` pack are built
- **THEN** both carry `estimator: 'chars-div-4'`

#### Scenario: An invalid token budget is rejected before the store

- **WHEN** a pack is built with `tokenBudget` 999, 32001 and 1.5
- **THEN** each call fails with `RangeError` naming `tokenBudget`
- **AND** no call was sent to the store

#### Scenario: A relative workspace root is rejected

- **WHEN** a pack is built with the workspace root `repo`
- **THEN** the call fails with `RangeError` naming `workspaceRoot`
- **AND** no call was sent to the store

#### Scenario: A pack with an invalid hop count is rejected

- **WHEN** a pack is built with `hops` 0 and with `hops` 4
- **THEN** both calls fail with `InvalidStoreQuery` naming `hops`

#### Scenario: A pack for an unknown project fails

- **WHEN** the pack of a question with terms is built in a well-formed UUID that is no project's id
- **THEN** the call fails with `ProjectNotFound`

#### Scenario: Unreadable source fails without its content

- **WHEN** the source reader fails with `SourceUnavailable` for the file of a candidate
- **THEN** building the pack fails with that `SourceUnavailable`, naming the path, and the error
  holds no file content

#### Scenario: A project never indexed has no source to read

- **WHEN** the pack of a question with an anchor is built for a project with no indexed commit
- **THEN** the call fails with `SourceUnavailable` with reason `not-indexed`
- **AND** no file was read

#### Scenario: A relative root path is resolved against the workspace root

- **WHEN** a pack is built with the workspace root `/repo` for a project whose root path is
  `fixtures/acme-shop`, and again for one whose root path is absolute
- **THEN** the first reads files under `/repo` joined with `fixtures/acme-shop` (on POSIX,
  `/repo/fixtures/acme-shop`), and the second under its root path as stored

#### Scenario: The process working directory is never used

- **WHEN** the same pack is built twice, once with the process working directory reported as an
  unrelated absolute directory
- **THEN** both packs are identical
