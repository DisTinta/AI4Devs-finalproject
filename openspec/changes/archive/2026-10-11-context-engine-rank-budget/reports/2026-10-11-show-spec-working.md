# Show spec working — context-engine-rank-budget (DIS-28)

- Date: 2026-10-11 · PR #34
- System: local Postgres (`docker compose`, `pgvector/pgvector:pg16`) with the acme-shop seed loaded by
  `npm run db:seed`; git over `fixtures/acme-shop` (`HEAD` = the seed's `indexed_commit` `4f028db4…`).
- Interface: no CLI or HTTP entry point uses the Context Engine yet (DIS-39), so each scenario was
  exercised through a throwaway script (`tmp/demo-pack.mts`, gitignored, deleted afterwards) that calls
  the real adapters (`createPostgresStore({ pool })`, `createGitSourceTree()`) and core
  (`buildContextPack`, `anchor`, `expand`, `rankCandidates`), with the store and source tree wrapped in
  counting proxies. Each line checks the scenario's THEN mechanically and prints PASS or FAIL.
- Command: `npx tsx --tsconfig packages/cli/tsconfig.run.json tmp/demo-pack.mts <repo>` (repository
  path masked as `<repo>`, OS user as `<user>`).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| A question is anchored on the symbols its words name | `anchor` on the real store, Q1 | 11 anchors incl. `PriceCalculator`, `PriceCalculator::compute` | Yes | line 2 |
| A long question sends a bounded number of searches | 30 tokens of 8 letters | 16 `findSymbols` calls | Yes | line 3 |
| A symbol result carries the kind of its file | `findSymbols('PriceCalculator')` | `source` / `test` | Yes | line 4 |
| (real index) neighbours carry resolution | `neighbors(compute, 1, both)` | `discountFor` exact, `README.md` heuristic | Yes | line 5 |
| The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match | `rankCandidates` over real `expand` at 1 hop | exactly the author's order | Yes | line 6 |
| The pack of the price question holds the calculator class once | `buildContextPack`, Q1, 8000 | tokens 4330 ≤ 8000, one span 16–44, text = `git show` lines 16–44, no `compute` span | Yes | line 7 |
| Every anchor symbol of the question enters the pack as an anchor | same pack | the spans holding the three symbols are `anchor`/d0 | Yes | line 8 |
| A relative root path is resolved against the workspace root | same pack, counting source | every read under `<repo>/fixtures/acme-shop` | Yes | line 9 |
| Every pack declares its estimator | ok and empty packs | `chars-div-4` both | Yes | lines 11, 15 |
| A file node gives a whole-file span | Q1 at 1 hop | `README.md` 1–43, 43 lines at the commit, no symbol | Yes | line 12 |
| The budget is never exceeded and no span is truncated (real data) | Q1 at 1000 | tokens 999, omitted 42 | Yes | line 13 |
| A method inside an included class is not counted twice (real data) | Q1 at 8000 | `PriceCalculator` 16–44 once, `compute` absent | Yes | line 7 |
| A question without anchor gives an empty pack without reading | `¿Dónde vive el ornitorrinco?` | empty/no-anchor; neighbors 0, getProject 0, readFileAt 0 | Yes | line 14 |
| An invalid token budget is rejected before the store | 999, 32001, 1.5 | `RangeError` naming `tokenBudget` ×3; 0 store/git calls | Yes | line 16 |
| A relative workspace root is rejected | `workspaceRoot: 'repo'` | `RangeError` naming `workspaceRoot`; 0 calls | Yes | line 17 |
| A pack with an invalid hop count is rejected | hops 0, 4 | `InvalidStoreQuery` naming `hops` ×2 | Yes | line 18 |
| A pack for an unknown project fails | unknown UUID | `ProjectNotFound` | Yes | line 19 |
| Unreadable source fails without its content | workspace root without the repository | `SourceUnavailable` `not-a-repository` naming the path, no content | Yes | line 20 |
| The process working directory is never used | pack with `process.cwd()` replaced | identical pack | Yes | line 21 |
| A project never indexed has no source to read | project created and saved without a commit, then deleted | `SourceUnavailable` `not-indexed`, readFileAt 0 | Yes | line 22 |
| A file is read as the given commit stores it | `readFileAt` on the fixture | equal to `git show` (1185 characters) | Yes | line 23 |
| A path or commit that names no file is unavailable | `app/Nope.php`, `app` (a directory) | `SourceUnavailable` `missing` ×2 | Yes | line 24 |
| Malformed arguments are rejected before running git | commit `HEAD`, path `../etc/passwd` | `RangeError` naming `commit` / `path` | Yes | line 25 |
| A root that is not a repository is unavailable | root = `fixtures/acme-shop/app` | `SourceUnavailable` `not-a-repository` | Yes | line 26 |

Also reused from step 15 ([`2026-10-11-15-manual-interface-testing.md`](./2026-10-11-15-manual-interface-testing.md)):
«A prefix anchors a Spanish verb on an English identifier» (`¿Cómo se validan los cupones?` anchored
on `CouponValidator`), «Anchoring in an unknown project fails» and the latency measurement.

## Evidence

```
 1: project acme-shop rootPath=fixtures/acme-shop indexedCommit=4f028db4d51a3321031f3a24b3f36240410ed38c workspaceRoot=<repo>
 2: PASS | A question is anchored on the symbols its words name | 11 anchors
 3: PASS | A long question sends a bounded number of searches | findSymbols calls=16
 4: PASS | A symbol result carries the kind of its file | PriceCalculator=source PriceCalculatorTest=test
 5: PASS | (real index) neighbours carry resolution | discountFor=exact README.md=heuristic
 6: PASS | The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match | PriceCalculator > PriceCalculator::compute > PriceCalculatorTest > DiscountService::discountFor > ShippingService::shippingFor > TaxService::taxFor > OrderPricingTest::test_final_price_applies_discount_before_tax > RecalculateTotals::handle > CheckoutController::store > OrderController::show > SendOrderConfirmation::handle > Order::getSubtotalAttribute > file:README.md
 7: PASS | The pack of the price question holds the calculator class once | status=ok tokens=4330 baselineTokens=7123 calculator spans=16-44 text matches git show=true
 8: PASS | Every anchor symbol of the question enters the pack as an anchor | PriceCalculatorTest→anchor/d0; RecalculateTotals::handle→anchor/d0; OrderPricingTest::test_final_price_applies_discount_before_tax→anchor/d0
 9: PASS | A relative root path is resolved against the workspace root | readFileAt roots=<repo>\fixtures\acme-shop
10:   (each file read once: readFileAt calls=29; files in the pack=29)
11: PASS | Every pack declares its estimator (ok) | ok estimator=chars-div-4
12: PASS | A file node gives a whole-file span | README.md 1-43, lines at commit=43, symbol=undefined
13: PASS | The budget is never exceeded and no span is truncated (real data) | budget 1000: status=ok tokens=999 omitted=42
14: PASS | A question without anchor gives an empty pack without reading | status=empty reason=no-anchor neighbors=0 getProject=0 readFileAt=0
15: PASS | Every pack declares its estimator (empty) | empty estimator=chars-div-4
16: PASS | An invalid token budget is rejected before the store | tokenBudget must be an integer from 1000 to 32000 / tokenBudget must be an integer from 1000 to 32000 / tokenBudget must be an integer from 1000 to 32000 ; store+git calls=0
17: PASS | A relative workspace root is rejected | workspaceRoot must be an absolute path ; store+git calls=0
18: PASS | A pack with an invalid hop count is rejected | Invalid store query: hops must be an integer from 1 to 3 (got 0) / Invalid store query: hops must be an integer from 1 to 3 (got 4)
19: PASS | A pack for an unknown project fails | Project not found: 00000000-0000-4000-8000-000000000000
20: PASS | Unreadable source fails without its content | SourceUnavailable: Source unavailable: not-a-repository: tests/Unit/PriceCalculatorTest.php
21: PASS | The process working directory is never used | identical pack with process.cwd() faked: true
22: PASS | A project never indexed has no source to read | Source unavailable: not-indexed ; readFileAt=0
23: PASS | A file is read as the given commit stores it | 1185 characters, equal to git show: true
24: PASS | A path or commit that names no file is unavailable | Source unavailable: missing: app/Nope.php / Source unavailable: missing: app
25: PASS | Malformed arguments are rejected before running git | commit must be a full object id (40 or 64 lowercase hexadecimal characters) / path must be a repository-relative path with no empty, "." or ".." segment
26: PASS | A root that is not a repository is unavailable | Source unavailable: not-a-repository: Services/PriceCalculator.php
27: 
28: failures=0
```

## State

- Before: `project` 0, `file` 0, `symbol` 0, `edge` 0, `query_log` 0; `fixtures/` clean.
- During: `npm run db:seed` → `1 project loaded` (1, 53, 121, 170, 0); the script also created and
  deleted the project `demo-unindexed-dis28` (left: 0) and one empty temp directory.
- After: `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` (1 row, cascade) → 0, 0, 0, 0, 0;
  the temp directory and `tmp/demo-pack.mts` removed; `git status --porcelain fixtures` empty.
- Restored: yes.

## Not demonstrated at the interface (covered by tests against real systems or the doubles)

Their inputs do not exist in the acme-shop index or need a constructed graph or repository:

- `context-engine`: «A question without terms anchors nothing and does not search», «A question whose
  terms match nothing anchors nothing» (both seen through the no-anchor pack above), «The anchor keeps the
  symbols that match the most terms» (needs 40 matching symbols), «Tokens are a quarter of the
  characters, rounded up» (pure function), «Generated candidates never exceed the budget» (property
  test), «A whole file replaces the symbol spans it contains», «A candidate that contains one span and
  cuts across another is dropped», «An anchor that does not fit leaves room for its neighbours», «A pack
  where nothing fits is empty and over budget», «Whole files are counted once for the baseline» and
  «Secrets are redacted before counting» (the fixture holds no secret): unit tests in
  `tests/unit/context/`.
- `graph-store`: «A node reached by an exact shortest path is exact», «A node reached only through
  heuristic edges is heuristic», «A shorter heuristic path wins over a longer exact one», «The traversal
  work grows with nodes, not paths» (the 40-file clique and its `EXPLAIN`): integration tests against
  Postgres in `tests/integration/store/graph-read.spec.ts`.
- `repository-indexing`: «Content that is not UTF-8 is unavailable», «A file over the size limit is
  unavailable without being read», «Reading one file executes nothing from the repository»: integration
  tests on throwaway repositories in `tests/integration/git/git-source-tree.spec.ts`.

All of them pass in the step 14 run (1010/1010 with the database).

## Handoff

The change is demonstrably working: 24 checks against the real database and git, 0 failures, state
restored. No screenshot was taken (no browser UI), and nothing was left at the repository root.
