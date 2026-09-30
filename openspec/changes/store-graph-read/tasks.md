## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-24 to In Progress in Linear right away, with a short comment in Spanish (change name `store-graph-read` and branch)
- [x] 0.2 Create feature branch `feature/DIS-24-store-graph-read` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, and apply migrations with `npm run db:migrate` (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`). Note the shared DB state: `pgmigrations` = `0001`–`0003`, and the row counts of `project`, `file`, `symbol`, `edge`
- [x] 0.5 Run `npx vitest run` once, green, as the pre-change baseline. Record the totals for the step 7 report

## 1. Core: read models, errors and port contract (design D1–D3)

- [x] 1.1 Add `Project` to `packages/core/src/knowledge/project.ts`; create `packages/core/src/knowledge/graph-read.ts` with `StoredFile`, `StoredSymbol` (extends `SymbolRef`), `NodeRef`, `GraphNode`, `Neighbor`, `SymbolSearchOptions` per D1. TSDoc on every export, including the id-validity rule
- [x] 1.2 Add `InvalidStoreQuery` (`code = 'INVALID_STORE_QUERY'`, `argument`) to `packages/core/src/knowledge/errors.ts`, with TSDoc
- [x] 1.3 Add `getProject`, `listProjects`, `findSymbols` and `neighbors` to `packages/core/src/ports/StorePort.ts` per D2, with TSDoc on isolation, source → target traversal, id validity, `ProjectNotFound` and `InvalidStoreQuery`. Update the interface comment ("graph reads are added by DIS-24"). Re-export from `knowledge/index.ts`. Run `npm run typecheck` (the adapter now fails to satisfy `StorePort`: add throwing stubs `not implemented` in `postgres-store.ts` so the build is green until section 3)

## 2. Core: read-argument validation (TDD, design D3)

- [x] 2.1 RED: create `tests/unit/knowledge/read-arguments.spec.ts`: blank and whitespace term, empty symbol kinds, `hops` 0 / 4 / 1.5 / `NaN` rejected with `InvalidStoreQuery` naming the argument; `hops` 1 and 3, absent kinds and non-empty kinds accepted. Run and see them fail
- [x] 2.2 GREEN: create `packages/core/src/knowledge/read-arguments.ts` with `MAX_HOPS`, `assertValidSymbolSearch` and `assertValidTraversal`; export from `knowledge/index.ts`. Run 2.1 green
- [x] 2.3 REFACTOR with the suite green; run `npx stryker run` and record the mutation score for `read-arguments.ts` (threshold `MIN_MUTATION_SCORE=70`)

## 3. Adapter: project reads (TDD, design D4)

- [x] 3.1 RED: create `tests/integration/store/graph-read.spec.ts` (`describeWithDatabase` + `useTransactionPerTest()`, store on `{ transaction: db() }`, graphs from `tests/support/sample-graph.ts`), with the statement-counting wrapper over `db()` (D7) defined once in the file. Add "An unindexed project is read", "A project is read with its indexing metadata", "Reading an unknown project fails" (counter 0 for `not-a-uuid`), "Listing with no project returns an empty list" (`DELETE FROM project` inside the test transaction, D7) and "Projects are listed by name" (two `unique()`-based names, assert presence and ascending relative order only, D7). Run and see them fail
- [x] 3.2 GREEN: move the `UUID` regex to a shared module in `store-postgres/src/`; add the `runQuery` helper (D4, no savepoint), `SELECT_PROJECT` / `LIST_PROJECTS` in `queries.ts`, and a `read-graph.ts` module with the row → `Project` mapping (`NULL` omitted). Implement `getProject` and `listProjects`. Run 3.1 green

## 4. Adapter: `findSymbols` (TDD, design D4/D5)

- [x] 4.1 RED → GREEN: tests "Symbols are found by a case-insensitive fragment of the name", "The search can be narrowed by kind" and "A search with no match returns an empty list". Implement `FIND_SYMBOLS` per D5 (project row + `LEFT JOIN LATERAL`, `ILIKE … ESCAPE '\'`, kinds filter, order by path, start line, name) and the row → `StoredSymbol` mapping
- [x] 4.2 RED → GREEN: tests "Wildcard characters in the term match literally" (escape `\`, `%`, `_` in TypeScript) and "Searching an unknown project fails" (well-formed unknown UUID: zero rows → `ProjectNotFound`; `not-a-uuid` → `ProjectNotFound` with the counter at 0)

## 5. Adapter: `neighbors` (TDD, design D4/D6)

- [x] 5.1 RED → GREEN: tests "A cycle yields each node once with its minimum distance", "The traversal stops at the hop limit" and "The minimum distance wins when a node is reachable by several paths". Implement `NEIGHBORS` per D6 (seed CTE, recursive walk with visited path and `depth < hops`, `reached` with `min(depth)`, project row + `LEFT JOIN`) and the row → `Neighbor` mapping; split seeds into symbol / file id arrays, dropping malformed ids
- [x] 5.2 RED → GREEN: tests "Edges are followed from source to target only", "The traversal crosses files and symbols", "A file can be a seed" and "Only the requested edge kinds are followed"
- [x] 5.3 RED → GREEN: tests "Seeds are never returned", "Unknown and empty seeds give no neighbours" and "Traversing an unknown project fails" (well-formed unknown UUID and `not-a-uuid`; counter 0 for the latter)
- [x] 5.4 RED → GREEN: test "The traversal is one statement" with the counting wrapper over `db()` (D7): exactly one `query` call for a two-seed, 3-hop traversal on a cyclic graph

## 6. Adapter: isolation, id validity and argument rejection (TDD)

- [x] 6.1 RED → GREEN: tests "A symbol search never returns another project's symbols" and "A traversal never reaches another project" (two projects with identical paths and names)
- [x] 6.2 RED → GREEN: tests "A symbol id from before a reindex names nothing after it" (same `SymbolRef`, old id as seed → empty, new id → `B`) and "A file id stays valid across a reindex that keeps its path" (old file id as seed → `b.ts` at distance 1)
- [x] 6.3 RED → GREEN: test "Invalid read arguments are rejected before querying" with the counting wrapper: every call fails with `InvalidStoreQuery` naming the argument, and the counter stays 0. Wire `assertValidSymbolSearch` / `assertValidTraversal` as step 1 of each read
- [x] 6.4 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time:
  - remove the visited-path check and return the `walk` rows without the `min(depth)` grouping → "A cycle yields each node once with its minimum distance" fails;
  - drop `e.project_id = $1` from the walk and the project filter from the seed CTE → "A traversal never reaches another project" fails;
  - skip the TypeScript escaping of the term → "Wildcard characters in the term match literally" fails.

  Record the three results for the step 7 report
- [x] 6.5 REFACTOR with the suite green: one mapping per read model, no duplicated project-existence handling, TSDoc on every export. Remove any leftover stub from 1.3

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `tests/integration/store/*`, `tests/unit/knowledge/*`, and anything that implements or mocks `StorePort`. Confirm with `git diff --stat feature/entrega-2-CRN -- tests` that only the two new spec files were added (plus `sample-graph.ts` builders if extended without changing existing defaults)
- [x] 7.2 Update affected tests without weakening their assertions (none expected). Confirm every `#### Scenario:` in `specs/graph-store/spec.md` (26 at first apply, 27 after §12) maps to exactly one test named after it

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `pgmigrations` rows and the row counts of `project`, `file`, `symbol`, `edge`
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/knowledge tests/integration/store/graph-read.spec.ts`, twice, to check for parallel flakiness
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the Frontend exclusion with `npx vitest run --exclude 'tests/integration/**'`, with `CI=true` and no `DATABASE_URL`: unit tests run, no import error
- [x] 8.4 Verify the post-test state matches the baseline (same counts). Restore and document if not
- [x] 8.5 Create the report `openspec/changes/store-graph-read/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 6.4 and the mutation score of 2.3
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Ensure Postgres is running and note the current data state (8.1 indicators). The interface is the `StorePort` implementation (no HTTP route, no CLI command exists for it)
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that builds `createPostgresStore({ pool })` on `DATABASE_URL`, creates two projects with `unique`-style names, saves a synthetic cyclic graph (files and symbols) to each, and prints `getProject`, `listProjects` (filtered to the two), `findSymbols` and `neighbors` at 1, 2 and 3 hops, with and without kinds. Verify they match the graph and never mix projects
- [x] 9.3 Exercise the reindex path: save the same snapshot again, show the old symbol id as seed returns nothing and the new one returns the neighbours. Then delete both projects and verify no row of them remains (restoration)
- [x] 9.4 Exercise the error cases from the same script: unknown and malformed project id on each read (`ProjectNotFound`), blank term, empty kinds, `hops` 0 and 4 (`InvalidStoreQuery`). Print each error's `code` and message
- [x] 9.5 Document every command and output in `openspec/changes/store-graph-read/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
- [x] 9.6 Verify the data state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
- [x] 10.2 After pushing, confirm in the PR's CI run (`ci.yml` → `Tests`) that `graph-read.spec.ts` and `read-arguments.spec.ts` ran and were not skipped. Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Update `docs/project-context.md`: the store read path (four reads, no savepoint on reads, one-statement traversal, `MAX_HOPS`, symbol ids valid only until the next `saveGraph`)
- [x] 11.2 Update `readme.md` §3.2 / task list only where it states traversal behaviour this change now fixes (recursive traversal with depth limit and cycle detection, source → target). No other product text
- [x] 11.3 ADR: none planned (reads are additive and local to the adapter). Write one via `/adr-new` only if the author asks at review
- [ ] 11.4 At archive, widen the Purpose of `openspec/specs/graph-store/spec.md` from "the write side" to write and read sides (the delta cannot carry a Purpose for an existing capability)
- [x] 11.5 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 11.6 Leave a Linear comment in Spanish on DIS-27 and DIS-89: the read contract, mixed nodes, source → target only (direction still pending for DIS-89), `MAX_HOPS`, `SymbolRef` in every symbol result and id validity. On DIS-27, state explicitly that the store returns mixed nodes and that `expand` filters to symbols (`type === 'symbol'`)
- [x] 11.7 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-24 to In Review in Linear, with a comment in Spanish linking the PR and the change

## 12. Post-audit delta (verify-against-spec, 2026-09-30)

- [x] 12.1 RED: in `tests/integration/store/graph-read.spec.ts` add "A cross-project edge never returns another project's node": two projects; insert with plain parameterised SQL on `db()` (design D7) two edges with the first project's `project_id`, from its symbol `A` to a symbol and to a file of the second project; request the neighbours of `A` at 1 hop in the first project and assert `[]` (no error). Run and see it fail: the current SQL returns the foreign nodes
- [x] 12.2 GREEN: in `packages/adapters/store-postgres/src/queries.ts` move the node-detail joins of `NEIGHBORS` into the `LEFT JOIN`ed subquery and filter it with `f.project_id = $1 OR sf.project_id = $1` (design D6), so a filtered-out node leaves no `NULL` row and the project row survives. Update the TSDoc. Run 12.1 and the whole `graph-read.spec.ts` green
- [x] 12.3 Strengthen "Symbols are found by a case-insensitive fragment of the name" (no new scenario): matches in two files whose paths only sort correctly in byte order (for example `src/B.ts` before `src/a.ts`), and two matches at the same start line of one file whose names sort differently in byte order and in `en_US.utf8` (for example `PriceTwo` before `priceOne`). Assert the full order. No existing assertion removed or loosened
- [x] 12.4 Strengthen "The traversal crosses files and symbols" (no new scenario): add, at distance 1, a symbol and a second file so that the result checks files before symbols at the same distance and two files ordered by path in byte order. Assert the full order. No existing assertion removed or loosened
- [x] 12.5 Strengthen "Wildcard characters in the term match literally" (no new scenario): also search `%` and `\` against names that contain them and names that would match only if they were wildcards or escapes; assert only the literal matches. No existing assertion removed or loosened
- [x] 12.6 Cover the spec additions in their scenarios' tests: "A project is read with its indexing metadata" also reads the project by its id in upper case and gets the same project; "Unknown and empty seeds give no neighbours" also sends a seed of type `file` carrying the id of a symbol with outgoing edges and gets `[]`. No existing assertion removed or loosened
- [x] 12.7 Prove the new and strengthened tests can fail, restoring from a scratch copy and confirming with `cmp` each time:
  - remove the `project_id` filter of 12.2 → 12.1 fails;
  - remove `COLLATE "C"` from `FIND_SYMBOLS` → 12.3 fails (local database collation `en_US.utf8`);
  - remove `COLLATE "C"` from `NEIGHBORS` → 12.4 fails.

  Record the three results
- [x] 12.8 Verify the delta: `npx vitest run tests/unit/knowledge tests/integration/store`, then `npx vitest run`, `npm run typecheck`, `npm run lint`; confirm 27 scenarios ↔ 27 tests; append a "Post-audit delta" section to `reports/2026-09-30-8-test-and-state-verification.md` with the 12.7 results. Update the DIS-24 gotcha in `docs/project-context.md` with byte-order sorting and the reached-node project filter. Do not touch 10.2, 11.4 or 11.7
