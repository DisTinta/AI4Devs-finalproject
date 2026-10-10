## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-27 to In Progress in Linear right away, with a short comment in Spanish (change name `context-engine-anchor-expand` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-24 (`neighbors` in `packages/core/src/ports/StorePort.ts`) and DIS-18 (`sumCostSince`). If not, stop and ask the author which base to use
- [x] 0.3 Create feature branch `feature/DIS-27-context-engine-anchor-expand` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions; `BRANCH_PREFIX=feature/`), carrying the untracked `openspec/changes/context-engine-anchor-expand/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: run `npx vitest run` once, green, and record the totals for the step 11 report; record `git status --porcelain seeds packages/web fixtures` (must be empty), `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, and the `analyzer-fingerprint` / `contract-fingerprint` header lines of `seeds/graph-dump.sql`

## 1. Port: direction and `fileId` (TDD, design D3, D5) — requirements "Validation of read arguments", "Bounded neighbour traversal", "Validity of ids returned by reads" (graph-store, MODIFIED)

- [x] 1.1 In `tests/integration/store/graph-read.spec.ts`, inside `Requirement: Validation of read arguments`, RED: test "An invalid traversal direction is rejected before querying" (direction `'sideways'` cast through `as unknown as TraversalDirection`; reuse the statement counter). See it fail
- [x] 1.2 GREEN: `TraversalDirection` and `TRAVERSAL_DIRECTIONS` in `packages/core/src/knowledge/graph-read.ts`; `'direction'` in `StoreQueryArgument` (`knowledge/errors.ts`); `assertValidTraversal(hops, kinds?, direction?)` in `knowledge/read-arguments.ts`; optional fifth argument `direction?: TraversalDirection` on `StorePort.neighbors` with its JSDoc (default `'out'`, `@throws InvalidStoreQuery` naming `direction`); `postgres-store.ts` passes it to the validator. Export the new type and constant from `knowledge/index.ts`. JSDoc on every export
- [x] 1.3 Add `fileId: string` to `StoredSymbol` (JSDoc: same validity as `StoredFile.id`); `npm run typecheck` lists the mappers and test literals to fix — fix them without weakening assertions

## 2. Adapter: two-way CTE and file id (TDD, design D4, D5) — requirements "Bounded neighbour traversal", "Validity of ids returned by reads"

- [x] 2.1 RED: test "Incoming edges are followed with direction in" in `graph-read.spec.ts` (`Requirement: Bounded neighbour traversal`)
- [x] 2.2 GREEN: `EDGE_SOURCE` and the two mirrored `LATERAL` branches in `NEIGHBORS` (`packages/adapters/store-postgres/src/queries.ts`), every branch gated by `$6::text` and filtered by `e.project_id = $1`; update the query's doc comment; `postgres-store.ts` passes `direction ?? 'out'` as `$6`
- [x] 2.3 RED → GREEN: test "Edges are followed both ways with direction both"
- [x] 2.4 Update the existing test "Edges are followed from source to target only" to the MODIFIED scenario (no direction and `'out'`, both only `B`)
- [x] 2.5 Update the existing test "The traversal is one statement" to the MODIFIED scenario (one call per direction `out`, `in`, `both`; exactly one statement each)
- [x] 2.6 RED → GREEN: test "A symbol result carries the id of its file" (`Requirement: Validity of ids returned by reads`): `FIND_SYMBOLS` selects `f.id AS file_id`, `NEIGHBORS` selects `s.file_id`, `toStoredSymbol` / `toNeighbor` map `fileId`
- [x] 2.7 Extra case, not a scenario, in `graph-read.spec.ts` under `Requirement: Project isolation of reads`: a cross-project edge pointing **into** the first project's `A` from another project's node, traversed with direction `in` and `both`, returns an empty result and does not fail (backs the four-branch project filter of D4)
- [x] 2.8 Confirm the remaining `Bounded neighbour traversal`, isolation and validity tests stay green and unchanged (`npx vitest run tests/integration/store/graph-read.spec.ts`)

## 3. Test support: in-memory double and acme-shop subset (design D6, D7)

- [x] 3.1 Create `tests/support/acme-shop-graph.ts`: a `KnowledgeGraph` subset copied from `seeds/graph-dump.sql` with the `tests/support/sample-graph.ts` helpers (files, symbols and edges listed in design D7, including `README.md`, `docs/pricing.md` with no edge, `CouponValidator`, and the class `DiscountService` with files `app/Services/DiscountService.php` and `app/Services/ShippingService.php` and the seed's single `co_changed` edge between them, `seeds/graph-dump.sql:248`)
- [x] 3.2 Create `tests/unit/context/acme-shop-graph-coherence.spec.ts` (pattern of `tests/unit/seed/sample-projects-coherence.spec.ts`): every file, symbol and edge of the subset exists in the seed with the same path, name, start line, kind and resolution (explicitly including the class `DiscountService` and the `co_changed` edge `DiscountService.php → ShippingService.php`). See it pass; break one name locally to see it fail, then restore
- [x] 3.3 Create `tests/unit/store/in-memory-store.spec.ts`. RED: first double test, "Symbols are found by a case-insensitive fragment of the name (in-memory double)". See it fail (module missing)
- [x] 3.4 GREEN: `tests/support/in-memory-store.ts` with `createInMemoryStore({ projects })` per design D6 (UUIDs, `fileId`, `assertValidSymbolSearch` / `assertValidTraversal` reuse, well-formed-UUID `ProjectNotFound`, literal case-insensitive `includes`, BFS with minimum distance and `direction`, `Buffer.compare` ordering, call counters, writes throwing `not implemented`, header comment with the non-ASCII limit)
- [x] 3.5 RED → GREEN, one at a time, the rest of the double's suite, each named `<graph-store scenario title> (in-memory double)`: the remaining `Symbol search by name` scenarios, every `Bounded neighbour traversal` scenario that does not count database statements (including the three direction scenarios and "A symbol result carries the id of its file"), the two isolation scenarios that need no direct SQL insert, and the invalid-argument and invalid-direction scenarios (without the statement assertions, replaced by the double's call counters)

## 4. Domain: question terms and anchoring (TDD, design D1) — requirements "Question terms", "Lexical anchoring" (context-engine)

- [x] 4.1 Create `tests/unit/context/anchor.spec.ts`. RED: test "The terms of a question include the prefixes of long tokens". See it fail (module missing)
- [x] 4.2 GREEN: `packages/core/src/context/anchor.ts` with `questionTerms`, `ANCHOR_STOPWORDS`, `MIN_TOKEN_LENGTH`, `PREFIX_MIN_LENGTH`, `PREFIX_LENGTH`; `packages/core/src/context/index.ts`; export from `packages/core/src/index.ts`. JSDoc on every export
- [x] 4.3 RED → GREEN: test "Diacritics do not change the terms"
- [x] 4.4 RED → GREEN: test "A question is anchored on the symbols its words name" (`anchor(store, projectId, question)` over the double loaded with the acme-shop subset)
- [x] 4.5 RED → GREEN: test "A prefix anchors a Spanish verb on an English identifier"
- [x] 4.6 RED → GREEN: test "A question without terms anchors nothing and does not search" (double's `calls.findSymbols` is 0)
- [x] 4.7 RED → GREEN: test "A question whose terms match nothing anchors nothing"
- [x] 4.8 RED → GREEN: test "Anchoring in an unknown project fails". Extra cases, not scenarios: a question without terms in an unknown project gives `[]` (no project check); duplicate symbols across terms appear once; at most two searches per distinct token (count with the double)

## 5. Domain: expansion (TDD, design D2) — requirement "Graph expansion of the anchor" (context-engine)

- [x] 5.1 Create `tests/unit/context/expand.spec.ts`. RED: test "The anchor expands to its tests, docs, callers and callees" (anchor taken from `findSymbols` on the double, so it carries real `fileId`s). See it fail
- [x] 5.2 GREEN: `packages/core/src/context/expand.ts` with `expand` and `EXPANSION_EDGE_KINDS`; export from `context/index.ts`. JSDoc on every export
- [x] 5.3 RED → GREEN: test "An anchor reaches the files co-changed with its own file" (anchor = the class `DiscountService` from `findSymbols` on the double, so it carries its real `fileId`; `app/Services/ShippingService.php` at distance 1, `app/Services/DiscountService.php` absent)
- [x] 5.4 RED → GREEN: test "The expansion never leaves the project" (double with two projects holding the same subset)
- [x] 5.5 RED → GREEN: test "An invalid hop count is rejected" (extra cases, not scenarios: invalid `hops` with an empty anchor still fails; an empty anchor in an unknown project gives `[]`; a non-empty anchor in an unknown project fails with `ProjectNotFound`)
- [x] 5.6 RED → GREEN: test "An empty anchor expands to nothing without traversing" (double's `calls.neighbors` is 0). Extra case, not a scenario: a non-empty anchor makes exactly one `neighbors` call with deduplicated file seeds and direction `'both'`
- [x] 5.7 REFACTOR with the suite green (`/tdd-refactor`) over `context/`, `read-arguments.ts`, `queries.ts` and the double; no behaviour change

## 6. Privacy and ethics check

- [x] 6.1 Run `/privacy-ethics-check` over the diff (the question is user text: never logged, only sent as search terms to the local store; no personal data in the acme-shop subset). Record the outcome in the step 11 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `grep -rn "neighbors(\|StoredSymbol\|StoreQueryArgument\|assertValidTraversal" tests packages`; the `StorePort` doubles cast with `as unknown as StorePort` need no change — confirm `npm run typecheck` agrees
- [x] 7.2 Update affected tests without weakening their assertions. Confirm that each `#### Scenario:` of `specs/context-engine/spec.md` (12) and `specs/graph-store/spec.md` (new and changed: 6) maps 1:1 to a test whose name is exactly the title (grep `it('<title>'` in `tests/`; no scenario without a test, no scenario with two; the `(in-memory double)` tests are listed apart)

## 8. Docs and gates before verification

- [x] 8.1 `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` green; JSDoc on every new export; `grep -rn "adapters\|store-postgres" packages/core/src/context` prints nothing

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `docs/project-context.md`: Context Engine entry (`packages/core/src/context/`: `anchor`, `expand`; ranking and budget pending DIS-28), the `StorePort.neighbors` `direction` argument and `StoredSymbol.fileId`, and the in-memory double in `tests/support/in-memory-store.ts` (what it implements, its non-ASCII limit, the coherence test of the acme-shop subset)
- [x] 9.2 `openspec/specs` is updated only by `/opsx:archive`; check `readme.md` §2.2 / §2.3 for mentions of `core/context` or of a source-to-target-only traversal and align them if they contradict this change
- [x] 9.3 No ADR (design D10); confirm nothing in the implementation contradicted that
- [x] 9.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 10. Seed: regenerate the analyzer fingerprint (design D9) — last commit of the series

- [x] 10.1 Preconditions: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` both print nothing; `DATABASE_URL` points to a migrated local database (`npm run db:migrate`). When reaching this step, ask the author to provide `AUTHOR_HASH_SALT` in the session with `!` — never ask earlier, never write it to any file
- [x] 10.2 Run `npm run seed:build`
- [x] 10.3 Check the diff: in `seeds/graph-dump.sql` only the `analyzer-fingerprint` header line changes (the `contract-fingerprint` line and every row identical); `packages/web/src/data/sample-projects.ts` unchanged. If any other line changes, stop and tell the author; do not commit
- [x] 10.4 Commit the regenerated seed as the last commit of the series (`chore(DIS-27): regenerate the seed fingerprint`). If a later fix touches a fingerprint input (`packages/core/src/knowledge`, `packages/adapters/store-postgres/src`, …), repeat 10.1–10.4 so the seed commit stays last

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 11.1 Capture the pre-test baseline: the 0.5 indicators, plus `SELECT count(*) FROM project`, `FROM symbol` and `FROM edge` on the local database (the integration tests write only inside rolled-back transactions)
- [x] 11.2 Run the targeted tests: `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts`
- [x] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/context/**/*.ts,packages/core/src/knowledge/read-arguments.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones)
- [x] 11.4 Verify the post-test state: the three counts equal to the baseline; `seeds/`, `packages/web/`, `fixtures/` unchanged since the step 10 commit; no `.stryker-tmp/` left behind. Restore and document if not
- [x] 11.5 Create the report `openspec/changes/context-engine-anchor-expand/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the seed diff of step 10, the Stryker score, the 1:1 scenario map of 7.2 and the privacy check of 6.1
- [x] 11.6 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 No CLI or HTTP entry point uses the Context Engine yet (DIS-39): exercise it through a throwaway `tsx` script in the session scratchpad (never committed) that calls `createPostgresStore` on the local database with the loaded acme-shop seed (`npm run db:seed` if `listProjects` does not show it; record the counts before and after, since `db:seed` writes), then `anchor` and `expand`
- [x] 12.2 Success path against the real seed: anchor `¿Cómo se calcula el precio final de un pedido?` and `¿Cómo se validan los cupones?`, print the anchored names; expand the first at 2 hops and print type, path/name and distance; check the nodes of the expansion scenario are present at distance 1; expand the class `DiscountService` (from `findSymbols`, with its real `fileId`) at 2 hops and check that file `app/Services/ShippingService.php` appears at distance 1 and `app/Services/DiscountService.php` does not
- [x] 12.3 `neighbors` with `'out'`, `'in'` and `'both'` from `PriceCalculator::compute` at 1 hop: `out` shows only callees, `in` adds the callers and `README.md`
- [x] 12.4 Error cases: unknown project id and `not-a-uuid` (`ProjectNotFound`), `hops` 4 (`InvalidStoreQuery` naming `hops`), direction `'sideways'` (`InvalidStoreQuery` naming `direction`), a question of stopwords only (`[]`)
- [x] 12.5 Nothing is written; confirm the 11.1 counts are unchanged, delete the scratchpad script and confirm `git status` shows no stray file
- [x] 12.6 Document every command and output in `openspec/changes/context-engine-anchor-expand/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths)

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 13.1 No user interface uses the Context Engine yet (DIS-39 / CM-HU-12): record "not applicable; exercised against the real database in step 12" in the step 11 report
- [x] 13.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/context/`, `tests/unit/store/in-memory-store.spec.ts` and `tests/integration/store/graph-read.spec.ts` ran and passed, that the seed-freshness check (if any) is green, and that the mutation step covered `packages/core/src/context`. Link the run in the step 11 report

## 14. Pull request preparation

- [x] 14.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed verbatim from Linear DIS-27 "Decisiones cerradas (autora, 2026-10-10)", the seed regeneration explained (D9) and the Stryker score; after verification, set DIS-27 to In Review in Linear with a comment in Spanish linking the PR and the change

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 15.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/context-engine-anchor-expand/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [x] 15.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, redo step 10 so the seed commit stays last
- [x] 15.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [x] 15.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
