## MODIFIED Requirements

### Requirement: Context pack

The Context Engine SHALL build, for a question about one project, a context pack: the anchor and
its expansion, ranked, read from the project's repository at its indexed commit, redacted, and
fitted to a token budget.

- Inputs: the project id, the question, `tokenBudget` (an integer from 1000 to 32000, 8000 when not
  given) and `hops` (an integer from 1 to 3, 2 when not given), plus the workspace root, an absolute
  path the caller provides, and optionally the anchor already computed for that question (a list of
  symbols as the symbol search returns them). When the anchor is given, the pack SHALL use it and
  SHALL NOT search symbols again; each given anchor symbol MUST carry a well-formed file id, otherwise
  the call MUST fail with `RangeError` naming `anchors` before any store call. A given empty anchor
  gives a `no-anchor` pack.
- An `ok` pack SHALL carry `status: 'ok'`, its `spans`, `tokens` (the sum of the spans' tokens),
  `baselineTokens`, `tokenBudget`, `omitted`, `estimator: 'chars-div-4'` and `commit`, the indexed
  commit its files were read at. Each span SHALL carry
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
  The files of a pack SHALL be read with a single batched read of the source reader, never one read
  per file.
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

#### Scenario: A given anchor is used without searching again

- **WHEN** the acme-shop graph is loaded, the anchor of `¿Cómo se calcula el precio final de un
  pedido?` is computed, and the pack of the same question is built with that anchor
- **THEN** the pack equals the pack built without a given anchor
- **AND** no symbol search was sent to the store while building it

#### Scenario: A given anchor symbol without a file id is rejected

- **WHEN** a pack is built with a given anchor whose only symbol has no file id
- **THEN** the call fails with `RangeError` naming `anchors`
- **AND** no call was sent to the store

#### Scenario: A pack names the commit it was read at

- **WHEN** acme-shop is loaded and the pack of `¿Cómo se calcula el precio final de un pedido?` is built
- **THEN** the pack's `commit` is the project's indexed commit, the one every file of the pack was
  read at

#### Scenario: The files of a pack are read in one batch

- **WHEN** the pack of a question whose candidates span three distinct files is built
- **THEN** the source reader received exactly one batched read, naming each of the three files once,
  and no single-file read
