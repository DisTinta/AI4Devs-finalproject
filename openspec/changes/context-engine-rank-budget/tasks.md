## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-28 to In Progress in Linear right away, with a short comment in Spanish (change name `context-engine-rank-budget` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-27 (`packages/core/src/context/expand.ts`, merge of PR #33). If not, stop and ask the author which base to use
- [x] 0.3 Create feature branch `feature/DIS-28-context-engine-rank-budget` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions; `BRANCH_PREFIX=feature/`), carrying the untracked `openspec/changes/context-engine-rank-budget/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: run `npx vitest run` once, green, and record the totals for the step 13 report; record `git status --porcelain seeds packages/web fixtures` (must be empty), `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, and the `analyzer-fingerprint` / `contract-fingerprint` header lines of `seeds/graph-dump.sql`

## 1. Port and store: resolution, file kind, node-wise traversal (TDD, design D4) — graph-store MODIFIED "Symbol search by name", "Bounded neighbour traversal"

- [x] 1.1 RED: in `tests/integration/store/graph-read.spec.ts` (`Requirement: Bounded neighbour traversal`), test "The traversal work grows with nodes, not paths" (40 files, pairwise `co_changed`, inserted inside the rolled-back transaction; `EXPLAIN (ANALYZE, FORMAT JSON)` of `NEIGHBORS`, `Actual Rows` of the `Recursive Union` node ≤ 320). See it fail on the row bound with the current CTE
- [x] 1.2 Port: `resolution: EdgeResolution` on `Neighbor` and `fileKind: FileKind` on `StoredSymbol` (`packages/core/src/knowledge/graph-read.ts`), JSDoc on both; update the `neighbors` / `findSymbols` JSDoc in `ports/StorePort.ts`. `npm run typecheck` lists the mappers and test literals to fix — fix them without weakening assertions
- [x] 1.3 GREEN: `NEIGHBORS` walks `(node_type, node_id, depth, all_exact)` with `UNION`, no `visited`; `reached` takes `min(depth)` and `bool_or(all_exact)` at that depth; the four `LATERAL` branches carry `e.resolution`; select `sf.kind`; `FIND_SYMBOLS` selects `f.kind AS file_kind`; `postgres-store.ts` maps `resolution` and `fileKind`. Update the query's doc comment (no more path enumeration). Test 1.1 green
- [x] 1.4 RED → GREEN: "A node reached by an exact shortest path is exact"
- [x] 1.5 RED → GREEN: "A node reached only through heuristic edges is heuristic"
- [x] 1.6 RED → GREEN: "A shorter heuristic path wins over a longer exact one"
- [x] 1.7 RED → GREEN: "A symbol result carries the kind of its file" (`Requirement: Symbol search by name`); extra case, not a scenario: a symbol neighbour carries its file kind too
- [x] 1.8 Confirm every other `graph-read.spec.ts` test stays green and unchanged (cycles, hop limit, minimum distance, directions, one statement, isolation)

## 2. Test support: doubles (design D4, D5, D10)

- [x] 2.1 RED: in `tests/unit/store/in-memory-store.spec.ts`, the four new traversal scenarios and the file-kind scenario as `<title> (in-memory double)` (the work-bound one asserts only "each file once, at distance 1"). See the resolution ones fail
- [x] 2.1b GREEN: rewrite the double's `neighbors` in `tests/support/in-memory-store.ts` to a BFS over `(node, allExact)` states per depth level with the D4 semantics, and `fileKind` from the stored file; every existing `(in-memory double)` test stays green
- [x] 2.2 `tests/support/acme-shop-graph.ts`: add what the ranking scenario needs (file kinds as in the seed; every 1-hop neighbour of `PriceCalculator` / `PriceCalculator::compute`); extend `tests/unit/context/acme-shop-graph-coherence.spec.ts` to check file kinds. See it pass; break one kind locally to see it fail, then restore
- [x] 2.3 Create `tests/support/in-memory-source-tree.ts` per design D5 (contents by root/commit/path, `SourceUnavailable('missing', path)` when absent, injectable failures, `calls.readFileAt` and recorded `{ root, commit, path }` arguments). `readFiles` / `realPath` throw `Error('not implemented')`

## 3. Port and adapter: reading one file at a commit (TDD, design D5) — repository-indexing ADDED "Reading one file at a commit", MODIFIED "Source tree contract"

- [x] 3.1 RED: in `tests/integration/git/git-source-tree.spec.ts`, test "A file is read as the given commit stores it". See it fail (method missing)
- [x] 3.2 GREEN: `SourceUnavailable` (`code 'SOURCE_UNAVAILABLE'`, `reason`, `path?`, message without content) in `packages/core/src/knowledge/errors.ts`, exported; `readFileAt(root, commit, path)` on `ports/SourceTreePort.ts` with JSDoc (`@throws RangeError`, `@throws SourceUnavailable`); implementation in `packages/adapters/git/src/git-source-tree.ts` (argument checks, root checks, `git --literal-pathspecs ls-tree -z -l --full-tree <commit> -- <path>`, `cat-file blob`, strict UTF-8, BOM dropped), always through `spawnGit`; widen the `args` rule in `spawnReaderGit`'s JSDoc (`packages/adapters/git/src/repository.ts`) as design D5 says. `GIT_ENV` and `GitSpawner` unchanged
- [x] 3.3 RED → GREEN: "A path or commit that names no file is unavailable"
- [x] 3.4 RED → GREEN: "Content that is not UTF-8 is unavailable"
- [x] 3.5 RED → GREEN: "A file over the size limit is unavailable without being read"
- [x] 3.6 RED → GREEN: "A root that is not a repository is unavailable"
- [x] 3.7 RED → GREEN: "Malformed arguments are rejected before running git" (count spawns with `gitSourceTreeWith`)
- [x] 3.8 RED → GREEN: "Reading one file executes nothing from the repository" (reuse the marker-file setup of the existing hygiene test)
- [x] 3.9 Confirm the existing `Source tree contract` tests stay green and unchanged

## 4. Domain: anchoring caps (TDD, design D6) — context-engine MODIFIED "Lexical anchoring"

- [x] 4.1 Before coding, count Q1's real anchor on the seed (`findSymbols` per term over the loaded database, throwaway scratchpad script) and confirm it is under 32; if not, stop and ask the author about `MAX_ANCHORS`
- [x] 4.2 RED → GREEN in `tests/unit/context/anchor.spec.ts`: "A long question sends a bounded number of searches" (`MAX_QUESTION_TERMS = 16`, double's `calls.findSymbols`)
- [x] 4.3 RED → GREEN: "The anchor keeps the symbols that match the most terms" (`MAX_ANCHORS = 32`; 40 `get…` symbols on the double)
- [x] 4.4 Confirm the five existing anchoring tests stay green and unchanged

## 5. Domain: token estimate and ranking (TDD, design D3, D7) — context-engine ADDED "Token estimate", "Candidate ranking"

- [x] 5.1 Create `tests/unit/context/tokenizer.spec.ts`. RED: "Tokens are a quarter of the characters, rounded up". See it fail
- [x] 5.2 GREEN: `packages/core/src/context/tokenizer.ts` with `estimateTokens` and `TOKEN_ESTIMATOR = 'chars-div-4'`; export from `context/index.ts`. JSDoc on every export
- [x] 5.3 Create `tests/unit/context/rank.spec.ts`. RED: "The neighbourhood of the price question is ranked by distance, origin, file kind and lexical match" (anchor injected, expansion from `expand` on the double at 1 hop, terms from `questionTerms`; exact full-order comparison). See it fail. If, once green-able, the subset gives an order different from the scenario's, stop and ask the author
- [x] 5.4 GREEN: `packages/core/src/context/rank.ts` with `rankCandidates`, `Candidate`, `ContextOrigin`; the shared normalisation helper extracted in `anchor.ts`. JSDoc on every export. Extra cases, not scenarios: same key keeps input order; a file candidate matches on its path

## 6. Domain: token budget (TDD, design D8) — context-engine ADDED "Token budget"

- [x] 6.1 Add `fast-check` as a root devDependency (`npm install -D fast-check`); record the version for the privacy check (step 9)
- [x] 6.2 Create `tests/unit/context/budget.spec.ts`. RED: "The budget is never exceeded and no span is truncated". See it fail
- [x] 6.3 GREEN: `packages/core/src/context/budget.ts` with `fitToTokenBudget`, `TOKEN_BUDGET_MIN` / `TOKEN_BUDGET_MAX` / `TOKEN_BUDGET_DEFAULT`, `DEFAULT_CONTEXT_HOPS`; no name shared with `llm/budget.ts` (`npm run typecheck` fails on a duplicate `export *`). JSDoc on every export
- [x] 6.4 RED → GREEN: "A method inside an included class is not counted twice" (`omitted` 0)
- [x] 6.5 RED → GREEN: "An anchor that does not fit leaves room for its neighbours"
- [x] 6.5b RED → GREEN: "A candidate that contains one span and cuts across another is dropped"
- [x] 6.6 RED → GREEN: "Generated candidates never exceed the budget" (`fc.assert`, `numRuns ≥ 200`, fixed `seed` under `CI`; properties of D8). Extra case, not a scenario: a partial overlap is dropped and not counted in `omitted`

## 7. Domain: context pack (TDD, design D2, D9) — context-engine ADDED "Context pack", plus the two whole-file budget scenarios

- [x] 7.1 Create `tests/unit/context/context-pack.spec.ts` (store and source doubles, acme-shop subset, file contents in the source double). RED: "A question without anchor gives an empty pack without reading". See it fail
- [x] 7.2 GREEN: `packages/core/src/context/context-pack.ts` with `buildContextPack`, `ContextPack`, `ContextSpan` per design D9; export from `context/index.ts`. JSDoc on every export
- [x] 7.3 RED → GREEN: "Whole files are counted once for the baseline" (extra case: each distinct file read once, from the double's counter)
- [x] 7.4 RED → GREEN: "A file node gives a whole-file span" and "A whole file replaces the symbol spans it contains" (two tests)
- [x] 7.5 RED → GREEN: "A pack where nothing fits is empty and over budget"
- [x] 7.6 RED → GREEN: "Secrets are redacted before counting" (AWS key built at run time, as `tests/unit/cli/index-command.spec.ts` does)
- [x] 7.7 RED → GREEN: "Every pack declares its estimator"
- [x] 7.8 RED → GREEN: "An invalid token budget is rejected before the store" and "A relative workspace root is rejected" (double's counters all 0)
- [x] 7.9 RED → GREEN: "A pack with an invalid hop count is rejected" and "A pack for an unknown project fails"
- [x] 7.10 RED → GREEN: "Unreadable source fails without its content" and "A project never indexed has no source to read" (`calls.readFileAt` 0)
- [x] 7.11 RED → GREEN: "A relative root path is resolved against the workspace root" (expected root computed with `node:path` `join('/repo', 'fixtures/acme-shop')`, so the test holds on Windows and POSIX)
- [x] 7.12 RED → GREEN: "The process working directory is never used" (`vi.spyOn(process, 'cwd')` to an unrelated absolute directory, `vi.restoreAllMocks()` in `afterEach`; packs deep-equal)
- [x] 7.13 Create `tests/integration/context/context-pack.spec.ts`: Postgres with acme-shop indexed and its history rebuilt with `buildOne` (pattern of `tests/integration/cli/index-command.spec.ts`), real `createGitSourceTree()`, `workspaceRoot` from `import.meta.url`. RED → GREEN: "The pack of the price question holds the calculator class once" and "Every anchor symbol of the question enters the pack as an anchor"
- [x] 7.14 REFACTOR with the suite green (`/tdd-refactor`) over `context/`, `queries.ts`, `git-source-tree.ts` and the doubles; no behaviour change

## 8. ADR

- [x] 8.1 `/adr-new` for design D1 ("span text is read from git at the indexed commit"), with the author's why transcribed verbatim from Linear DIS-28 decision 1 (as quoted in design D1) and the two rejected alternatives

## 9. Privacy and ethics check

- [x] 9.1 Run `/privacy-ethics-check` over the diff: code and possible secrets travel towards the model (redaction before counting, D2; no log of question or span text; `SourceUnavailable` messages without content) and the new dependency `fast-check` (D11). Record the outcome in the step 13 report; fix any finding in this change or classify it (A/B/C/D)

## 10. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 10.1 Identify tests affected by the change: `grep -rn "Neighbor\|StoredSymbol\|SourceTreePort\|neighbors(\|findSymbols(" tests packages`; doubles cast with `as unknown as` need no change — confirm `npm run typecheck` agrees
- [x] 10.2 Update affected tests without weakening their assertions. Confirm each `#### Scenario:` of the three delta specs maps 1:1 to a test whose name is exactly the title (`context-engine`: 31, of which 26 new; `graph-store`: 23, of which 5 new; `repository-indexing`: 21, of which 7 new; grep `it('<title>'` in `tests/`; `(in-memory double)` copies listed apart)

## 11. Docs and gates before verification

- [x] 11.1 `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` green; JSDoc on every new export; `grep -rn "adapters\|store-postgres\|process.cwd" packages/core/src/context` prints nothing; no `console` nor logger in `packages/core/src/context`

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `docs/project-context.md`: Context Engine entry (rank, budget, tokenizer, context pack; caps; `workspaceRoot` and why not `process.cwd()`; `readFileAt` and `SourceUnavailable`; `Neighbor.resolution`, `StoredSymbol.fileKind`, node-wise CTE and the trigram threshold of D4; the source-tree double)
- [x] 12.2 readme §2.2 / §3.2: the declared estimator `chars-div-4` and that span text comes from git at `indexed_commit`; align any mention that contradicts this change. `openspec/specs` is updated only by `/opsx:archive`
- [x] 12.3 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 13. Seed: regenerate the analyzer fingerprint (design D12) — last commit of the series

- [x] 13.1 Preconditions: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` both print nothing; `DATABASE_URL` points to a migrated local database (`npm run db:migrate`). When reaching this step, ask the author to provide `AUTHOR_HASH_SALT` in the session with `!` — never ask earlier, never write it to any file
- [x] 13.2 Run `npm run seed:build`
- [x] 13.3 Check the diff: in `seeds/graph-dump.sql` only the `analyzer-fingerprint` header line changes (the `contract-fingerprint` line and every row identical); `packages/web/src/data/sample-projects.ts` unchanged. If any other line changes, stop and tell the author; do not commit
- [x] 13.4 Commit the regenerated seed as the last commit of the series (`chore(DIS-28): regenerate the seed fingerprint`). If a later fix touches a fingerprint input (`packages/core/src/knowledge`, `packages/adapters/store-postgres/src`, `packages/adapters/git/src`, …), repeat 13.1–13.4 so the seed commit stays last

## 14. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 14.1 Capture the pre-test baseline: the 0.5 indicators, plus `SELECT count(*) FROM project`, `FROM symbol`, `FROM edge` and `FROM query_log` on the local database, and `git -C fixtures/acme-shop status --porcelain` (the integration tests write only inside rolled-back transactions or throwaway repos)
- [x] 14.2 Run the targeted tests: `npx vitest run tests/unit/context tests/unit/store/in-memory-store.spec.ts tests/integration/store/graph-read.spec.ts tests/integration/git/git-source-tree.spec.ts tests/integration/context`
- [x] 14.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/context/**/*.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones)
- [x] 14.4 Verify the post-test state: the counts equal to the baseline; `seeds/`, `packages/web/`, `fixtures/` unchanged since the step 13 commit; no throwaway repo left under the OS temp dir by the new tests; no `.stryker-tmp/` left behind. Restore and document if not
- [x] 14.5 Create the report `openspec/changes/context-engine-rank-budget/reports/YYYY-MM-DD-14-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the seed diff of step 13, the Stryker score, the 1:1 scenario map of 10.2, the `fast-check` seed used in CI and the privacy check of 9.1
- [x] 14.6 Mark complete only after the tests pass and the report exists

## 15. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 No CLI or HTTP entry point uses the Context Engine yet (DIS-39): exercise it through a throwaway `tsx` script in the session scratchpad (never committed) that calls `createPostgresStore` on the local database with the loaded acme-shop seed (`npm run db:seed` if `listProjects` does not show it; record the counts before and after, since `db:seed` writes), `createGitSourceTree()` and `buildContextPack` with `workspaceRoot` = the repository root (absolute)
- [x] 15.2 Success path against the real seed: the pack of `¿Cómo se calcula el precio final de un pedido?` at 8000 and at 1000 tokens; print per span path, lines, symbol, origin, distance, tokens, plus `tokens`, `baselineTokens`, `omitted`, `estimator`; check the 16–44 span of `PriceCalculator.php`, `tokens ≤ tokenBudget`, and the saving `baselineTokens` vs `tokens`. Time the call and count git processes
- [x] 15.3 `¿Cómo se validan los cupones?` at 8000; `neighbors` from `PriceCalculator::compute` at 2 hops showing `resolution` and `fileKind`
- [x] 15.4 Error cases: `¿Dónde vive el ornitorrinco?` (`no-anchor`), `tokenBudget` 999 and `workspaceRoot` `repo` (`RangeError`), `hops` 4 (`InvalidStoreQuery`), an unknown project id (`ProjectNotFound`); `readFileAt` on a missing path (`SourceUnavailable` / `missing`)
- [x] 15.5 Nothing is written; confirm the 14.1 counts are unchanged, delete the scratchpad script and confirm `git status` shows no stray file
- [x] 15.6 Document every command and output in `openspec/changes/context-engine-rank-budget/reports/YYYY-MM-DD-15-manual-interface-testing.md` (mask the OS user name in paths; print no span text holding anything but sample code)

## 16. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 16.1 No user interface uses the Context Engine yet (DIS-39 / CM-HU-12): record "not applicable; exercised against the real database and git in step 15" in the step 14 report
- [ ] 16.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/context/`, `tests/unit/store/in-memory-store.spec.ts`, `tests/integration/store/graph-read.spec.ts`, `tests/integration/git/git-source-tree.spec.ts` and `tests/integration/context/` ran and passed, that the property test ran with the fixed seed, that the seed-freshness check (if any) is green, and that the mutation step covered `packages/core/src/context`. Link the run in the step 14 report

## 17. Pull request preparation

- [ ] 17.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed verbatim from Linear DIS-28 "Decisiones del refinamiento (aceptadas por la autora, 2026-10-10)", the ADR linked, the seed regeneration explained (D12) and the Stryker score; after verification, set DIS-28 to In Review in Linear with a comment in Spanish linking the PR and the change

## 18. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 18.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 18.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/context-engine-rank-budget/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [ ] 18.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, redo step 13 so the seed commit stays last
- [ ] 18.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 18.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
