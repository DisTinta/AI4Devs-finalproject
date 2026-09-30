## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-23 to In Progress in Linear right away, with a short comment in Spanish (change name `store-graph-write` and branch)
- [x] 0.2 Create feature branch `feature/DIS-23-store-graph-write` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions)
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, and apply migrations with `npm run db:migrate` (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`). Note the shared DB state: `pgmigrations` = `0001`–`0003`, and the row counts of `project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim` and `evidence`
- [x] 0.5 Run `npx vitest run tests/integration` once, green, as the pre-change baseline. Record the totals for the step 8 report

## 1. Build wiring: first import of `@codemind/core` (design D6)

- [x] 1.1 Add `references: [{ "path": "../../core" }]` to `packages/adapters/store-postgres/tsconfig.json`; add `resolve.alias` `@codemind/core` → `packages/core/src/index.ts` to `vitest.config.ts` (`vitest.stryker.config.ts` inherits it through `mergeConfig`, unchanged); add the matching `paths` entry to `tests/tsconfig.json`
- [x] 1.2 Prove the wiring with a throwaway import (a type-only `import type { StorePort } from '@codemind/core'` in the adapter's `index.ts`, and a scratch test in the scratchpad importing it): `npm run typecheck`, `npx vitest run` and `npm run lint:architecture` green. Delete the scratch test. If any of them cannot be made green with D6, stop and ask the author (D6)

## 2. Core: domain types and errors (design D1)

- [x] 2.1 Create `packages/core/src/knowledge/{project,graph-file,graph-symbol,graph-edge,graph-commit,graph}.ts` per D1: `as const` value lists with derived unions matching the `0001` enums, the graph element types, `SymbolRef`, `EdgeEndpoint`, `KnowledgeGraph` and `SaveGraphResult`. TSDoc on every export
- [x] 2.2 Create `packages/core/src/knowledge/errors.ts`: `DomainError` base with a stable `code`, `ProjectNotFound`, `ProjectNameTaken`, `InvalidGraph` with `violations: GraphViolation[]`. TSDoc on every export
- [x] 2.3 Create `packages/core/src/knowledge/index.ts` and re-export it from `packages/core/src/index.ts`. Run `npm run typecheck` and `npm run lint:architecture`

## 3. Core: graph validation (TDD, design D1)

- [x] 3.1 Create `tests/support/sample-graph.ts` (D7): a builder for a small consistent synthetic graph (files, symbols, edges of every endpoint combination, commits, file–commit links) with overridable parts. No real names or e-mails
- [x] 3.2 RED: create `tests/unit/knowledge/validate-graph.spec.ts` with one test per scenario: "An edge without resolution is rejected", "An edge without extractor is rejected", "A dangling reference is rejected", "Duplicate keys are rejected", "Invalid history and span values are rejected", "A valid graph passes validation". Run and see them fail
- [x] 3.3 GREEN: create `packages/core/src/knowledge/validate-graph.ts` with `validateGraph` (collects every violation) and `assertValidGraph` (throws `InvalidGraph`). Run 3.2 green
- [x] 3.4 REFACTOR with the suite green: naming, TSDoc, one concern per helper. Run `npx stryker run` and record the mutation score for `validate-graph.ts` (threshold `MIN_MUTATION_SCORE=70`); add tests for surviving mutants that reflect spec rules

## 4. Core: `StorePort` write contract (design D2)

- [x] 4.1 Replace the stub in `packages/core/src/ports/StorePort.ts` with `createProject` and `saveGraph` per D2, with TSDoc stating snapshot semantics, `ProjectNotFound`, `ProjectNameTaken` and `InvalidGraph`. Remove the throwaway import of 1.2 if it is now redundant. Run `npm run typecheck`

## 5. Adapter: `createProject` (TDD, design D3/D5)

- [x] 5.1 RED: create `tests/integration/store/graph-write.spec.ts` (`describeWithDatabase` + `useTransactionPerTest()`, store built with `createPostgresStore({ transaction: db() })`). Add tests "A project is created unindexed" and "A duplicate project name is rejected". Run and see them fail
- [x] 5.2 GREEN: create `packages/adapters/store-postgres/src/postgres-store.ts` with `StoreConnection`, `createPostgresStore` and `createProject` (single `INSERT … RETURNING id`, `23505` on `project_name_key` → `ProjectNameTaken`). Export from the adapter's `index.ts`. Run 5.1 green

## 6. Adapter: `saveGraph` (TDD, design D3/D4)

- [x] 6.1a RED → GREEN: test "Edges connect the saved rows of the same project". Implement D4 steps 1–8: validation, open the transaction/savepoint (D3), `FOR UPDATE` on the project, delete the project's edges and symbols, delete files absent from the snapshot, upsert files `ORDER BY path` by `(project_id, path)`, insert symbols and edges with `unnest`. Keep SQL in a `queries` module inside `store-postgres/src/`
- [x] 6.1b RED → GREEN: test "A first save persists the whole graph". Implement D4 steps 9–12: upsert commits by `(project_id, sha)`, upsert `file_commit`, update the four project metadata columns, commit/release (D3) and return the counts
- [x] 6.2 RED → GREEN: tests "Saving to an unknown project fails" (well-formed UUID), "Saving with a malformed project id fails" (`not-a-uuid`, domain error, not a database error) and "A rejected graph writes nothing" (validation runs before the connection is touched)
- [x] 6.3 RED → GREEN: test "Metadata reflects the saved snapshot" (`indexed_commit`, `node_count` = files + symbols, `edge_count`, `indexed_at` ≥ a timestamp read before the call; `name`, `root_path`, `language`, `framework` and `is_sample` unchanged)
- [x] 6.4 RED → GREEN: tests "A reindex keeps file ids, history and evidence" and "A changed content hash on reindex marks its claims stale". Claim and evidence rows are inserted with plain parameterised SQL in the test body (D7)
- [x] 6.5 RED → GREEN: tests "A file missing from the snapshot is deleted" and "Symbols and edges are replaced by the snapshot"
- [x] 6.6 RED → GREEN: tests "Commits are upserted and never dropped" and "Other projects are untouched"
- [x] 6.7 RED → GREEN: tests "A database rejection rolls back the whole write" (edge weight 1.5, previous snapshot intact), "Saving inside the caller's transaction does not commit it" and "A failed save leaves the caller's transaction usable" (savepoint rollback, D3)
- [x] 6.8 RED → GREEN: create `tests/integration/store/graph-write-pool.spec.ts` with "Saving on the store's own connections commits" per D7 (the minimal graph defined there, `{ pool }` mode, `unique()` project name, read from a second connection, delete the project in `finally`). Confirm afterwards that no row of that project remains
- [x] 6.9 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time:
  - replace the file upsert with delete-and-insert → "A reindex keeps file ids, history and evidence" fails;
  - make `{ transaction }` mode send `BEGIN`/`COMMIT` → "Saving inside the caller's transaction does not commit it" fails;
  - skip `assertValidGraph` → "A rejected graph writes nothing" fails.

  Record the three results for the step 8 report
- [x] 6.10 REFACTOR with the suite green: statement plan readable, no duplicated endpoint mapping, TSDoc on every export (including the `{ transaction }` caller contract)

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: the `tests/integration/store/*` and `tests/integration/helpers/*` specs, and any test that relies on `StorePort` being empty. Confirm with `git diff --stat feature/entrega-2-CRN -- tests/integration/store tests/integration/helpers` that only the new spec files were added there
- [x] 7.2 Update affected tests without weakening their assertions (none expected). Confirm every `#### Scenario:` in `specs/graph-store/spec.md` (24 at first apply, 26 after §12, 27 after §13) maps to exactly one test named after it

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `pgmigrations` rows and the row counts of `project`, `file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`, `evidence`
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/knowledge tests/integration/store/graph-write.spec.ts tests/integration/store/graph-write-pool.spec.ts`, twice, to check for parallel flakiness
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the Frontend exclusion with `npx vitest run --exclude 'tests/integration/**'`, with `CI=true` and no `DATABASE_URL`: the unit tests run, no import error
- [x] 8.4 Verify the post-test state matches the baseline (same counts, no leftover project from the pool test). Restore and document if not
- [x] 8.5 Create the report `openspec/changes/store-graph-write/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 6.9 and the mutation score of 3.4
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Ensure Postgres is running and note the current data state (8.1 indicators). The interface is the `StorePort` implementation (no HTTP route, no CLI command exists for it)
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that builds `createPostgresStore({ pool })` on `DATABASE_URL`, creates a project with a `unique`-style name, saves a synthetic graph, and prints the result and the stored counts per table. Verify they match the graph
- [x] 9.3 Exercise the mutating paths: save a second snapshot that drops one file, changes one hash and adds a commit; print file ids before/after and the commit count. Then delete the project and verify every row of it is gone (restoration)
- [x] 9.4 Exercise the error cases from the same script: unknown project id (`ProjectNotFound`), non-UUID id, duplicate project name (`ProjectNameTaken`), an edge without `resolution` (`InvalidGraph` with its violations), an edge with weight 1.5 (database error, nothing written). Print each error's `code`/message
- [x] 9.5 Document every command and output in `openspec/changes/store-graph-write/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
- [x] 9.6 Verify the data state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
- [ ] 10.2 After pushing, confirm in the PR's CI run (`ci.yml` → `Tests`) that `graph-write.spec.ts`, `graph-write-pool.spec.ts` and `validate-graph.spec.ts` ran and were not skipped. Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Update `docs/project-context.md`: the store write path (`createPostgresStore`, `{ pool }` vs `{ transaction: db() }` in tests), replace "decided in DIS-23" in Testing with the SAVEPOINT rule, the `@codemind/core` resolution (Vitest alias, tsconfig reference), and `tests/support/`
- [x] 11.2 Update `readme.md` §3.2 only where it states writer behaviour this change now fixes (upsert by path, snapshot deletion of absent files, `node_count` = files + symbols). No other product text
- [x] 11.3 ADR: none planned (the transaction ownership and snapshot semantics are local to the adapter and easy to revert). Write one via `/adr-new` only if the author asks at review
- [x] 11.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 11.5 Leave a Linear comment in Spanish on DIS-24 (reads) and DIS-85 (orchestration): the port shape, symbol identity `(file, name, startLine)`, snapshot semantics, `{ transaction }` mode, and the evidence-writer lock rule that remains open (DIS-13 note)
- [ ] 11.6 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-23 to In Review in Linear, with a comment in Spanish linking the PR and the change

## 12. Post-audit delta (verify-against-spec, 2026-09-30)

- [x] 12.1 RED: in `tests/integration/store/graph-write.spec.ts` add "An omitted history value keeps the stored one" and "A file's optional values follow the snapshot". Run: the first fails on the current SQL. The second pins current behaviour and is expected green; prove it can fail by temporarily wrapping `loc` in `COALESCE` in `UPSERT_FILES`, then restore from a scratch copy and confirm with `cmp`
- [x] 12.2 GREEN: in `packages/adapters/store-postgres/src/queries.ts`, `UPSERT_COMMITS` and `UPSERT_FILE_COMMITS` set each optional column to `COALESCE(EXCLUDED.<col>, <table>.<col>)`; `UPSERT_FILES` unchanged. Update their TSDoc. Run 12.1 and the whole `graph-write.spec.ts` green
- [x] 12.3 Strengthen "A first save persists the whole graph": the test's own graph (the shared `sampleGraph` defaults unchanged) gives one commit a `committedAt` and one symbol a `signature`; assert both stored values, and assert the four stored edges by endpoints, `kind`, `resolution`, `extractor` and `weight`. No existing assertion removed or loosened
- [x] 12.4 Strengthen "A reindex keeps file ids, history and evidence": the second snapshot keeps `F` with the same `content_hash` but changes other content (`F`'s `loc`, a different symbol set, an added commit and link on `F`); assert the same id, the earlier links still present plus the new one, and the evidence row. No existing assertion loosened
- [x] 12.5 Verify the delta: `npx vitest run tests/unit/knowledge tests/integration/store`, then `npx vitest run`, `npm run typecheck`, `npm run lint`; confirm 26 scenarios ↔ 26 tests; append a "Post-audit delta" section to `reports/2026-09-29-8-test-and-state-verification.md`. Do not touch 10.2 or 11.6

## 13. Post-review delta (adversarial-review, 2026-09-30)

- [x] 13.1 RED: in `tests/integration/store/graph-write.spec.ts` add "A deleted file marks its claims stale" (files `A` and `B`; claim `c1` with evidence on `B`, claim `c2` with evidence only on `A`; claim and evidence rows inserted with plain parameterised SQL, D7; second snapshot with only `A`, same `content_hash`). Run and see it fail: `c1` is still `current`
- [x] 13.2 GREEN: in `packages/adapters/store-postgres/src/queries.ts` add `MARK_CLAIMS_STALE_FOR_ABSENT_FILES` (design D4 step 5) with TSDoc, and run it in `save-graph.ts` right before `DELETE_ABSENT_FILES`, with the same parameters. Run 13.1 and the whole `graph-write.spec.ts` green
- [x] 13.3 Prove the test can fail: move the new query after `DELETE_ABSENT_FILES` → 13.1 fails. Restore from a scratch copy and confirm with `cmp`
- [x] 13.4 Verify the delta: `npx vitest run tests/unit/knowledge tests/integration/store`, then `npx vitest run`, `npm run typecheck`, `npm run lint`; confirm 27 scenarios ↔ 27 tests; append a "Post-review delta" section to `reports/2026-09-29-8-test-and-state-verification.md` (with the 13.3 result)
- [x] 13.5 Docs: run `/update-docs`; check what `readme.md` and `docs/project-context.md` say about `stale` and deleted files; add the relevant prompts to `prompts.md`
- [x] 13.6 Record the six technical follow-ups of `design.md` → Follow-ups (InvalidGraph order, savepoint rollback error, concurrent savepoint, `TypeError` on malformed input, claim `current` on unchanged-hash reindex, pool mode without failure test) as one list, in Spanish: a comment on DIS-23, or a single tech-debt issue. Not one issue per minor. The two "Recorded only" items are left out. Link the comment or issue in the step 8 report
- [x] 13.7 Do not touch 10.2 or 11.6; do not archive until both are done
