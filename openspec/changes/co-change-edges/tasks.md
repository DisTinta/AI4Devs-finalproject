## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-36 to In Progress in Linear right away, with a short comment in Spanish (change name `co-change-edges` and branch)
- [x] 0.2 Create feature branch `feature/DIS-36-co-change-edges` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/co-change-edges/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, apply migrations with `npm run db:migrate`. Note the shared DB state: `pgmigrations` rows and the row counts of `project`, `file`, `edge`, `commit`, `file_commit`
- [x] 0.5 Rebuild both fixtures with `node fixtures/build-history.mjs` and confirm 32 / 28 commits (`git -C fixtures/<name> log --oneline | wc -l`). Run `npx vitest run` once, green, as the pre-change baseline; record the totals for the step 8 report

## 1. Core: co-change rule (TDD, design D1–D5, D7)

- [x] 1.1 RED: create `tests/unit/knowledge/co-change.spec.ts` (header comment pointing at the delta spec, structure of `validate-graph.spec.ts`, `fileCommit()` from `tests/support/sample-graph.ts`) with the scenarios "Files changed together form a weighted edge", "A single shared commit is not enough", "Each pair yields one edge from the smaller path" and "An empty history yields no edges". Assert whole edge objects with `toEqual`. Run and see it fail
- [x] 1.2 GREEN: create `packages/core/src/knowledge/co-change.ts` with `CO_CHANGE_EXTRACTOR`, `MIN_CO_CHANGES`, `MAX_FILES_PER_COMMIT`, `coChangeEdges` (design D2) and the private byte-order comparator (D3); export from `packages/core/src/knowledge/index.ts`. Run 1.1 green
- [x] 1.3 RED → GREEN: add "A path outside the snapshot yields no edge but still counts" (weight `2 / 3`), "A commit with more than 100 files is ignored" and "A commit with exactly 100 files is counted" (synthetic filler paths built in the test). Adjust the implementation only if a test fails for a real reason
- [x] 1.4 RED → GREEN: add "Duplicate links in one commit count once" (weight `2 / 3`) and "Author hash and line counts do not affect co-change" (two histories built with `commit()` and `fileCommit()`: same shas and paths, different `authorHash` on every commit and different or absent `linesAdded`/`linesRemoved` on every link; derive from each history's `fileCommits` and compare with `toEqual`). `coChangeEdges` never receives commits, so the `authorHash` half holds by construction; the test still builds both histories so a future signature change that reads commits is caught. Adjust the implementation only if a test fails for a real reason
- [x] 1.5 REFACTOR with the suite green: TSDoc on every export (one canonical edge per pair, `neighbors` reads source → target only, edges must go in the same `saveGraph` snapshot as the other edges, `knownPaths` must be the snapshot's paths). Run `npm run typecheck`, `npm run lint`, `npm run docs:coverage`
- [x] 1.6 Run `npx stryker run` and record the mutation score of `co-change.ts` (threshold `MIN_MUTATION_SCORE=70`); add tests for surviving mutants that reflect spec rules, list the others in the step 8 report

## 2. Integration: persistence on the fixtures (design D6)

- [x] 2.1 In `tests/integration/git/simple-git-history.spec.ts`, make `beforeAll` run `node fixtures/build-history.mjs` with no argument (both fixtures), raising its timeout as needed; update the header comment (spec reference adds `openspec/changes/co-change-edges/specs/git-history/spec.md`; it rebuilds both fixtures). Run the existing git tests green
- [x] 2.2 RED → GREEN: new `describeWithDatabase('co-change persistence')` block with `useTransactionPerTest()` and the test "The documented fixture pairs are persisted": for acme-shop and task-api, one project each (`unique(...)`), read with `createSimpleGitHistory({ authorHashSalt: SALT })`, `files` = distinct paths of `fileCommits` via `file()`, `edges` = `coChangeEdges(fileCommits, new Set(paths))`, `saveGraph`; then `SELECT` from `edge` joined to `file` for source/target paths: exactly one `co_changed` row per project with `extractor = 'git'`, `resolution = 'heuristic'` and the paths and weights of the spec (1 and 0.75)
- [x] 2.3 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time: `MIN_CO_CHANGES = 1` → the integration test fails (extra acme-shop pairs); union without `- shared` → "Files changed together form a weighted edge" fails; cap with `>=` instead of `>` → "A commit with exactly 100 files is counted" fails. Record the three results for the step 8 report

## 3. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 3.1 Identify tests affected by the change: only `tests/integration/git/simple-git-history.spec.ts` (fixture rebuild) and the new unit spec. Confirm with `git diff --stat feature/entrega-2-CRN -- tests` that only the intended files changed
- [x] 3.2 Confirm the 10 `#### Scenario:` of `specs/git-history/spec.md` map 1:1 to tests with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two), and that every SHALL has at least one of them. Mapping: 1.1 (4), 1.3 (3), 1.4 (2), 2.2 (1)

## 4. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 4.1 Capture the pre-test baseline: `pgmigrations` rows and row counts of `project`, `file`, `edge`, `commit`, `file_commit`; `git -C fixtures/<name> rev-parse HEAD` for both; `git status --porcelain fixtures` (must be empty)
- [x] 4.2 Run the targeted tests twice to check for flakiness: `npx vitest run tests/unit/knowledge tests/integration/git`
- [x] 4.3 Run the broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 4.4 Verify the post-test state matches the baseline (same counts, same fixture `HEAD`s, `git status --porcelain fixtures` empty). Restore and document if not
- [x] 4.5 Create the report `openspec/changes/co-change-edges/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the forced failures of 2.3 and the mutation score of 1.6
- [x] 4.6 Mark complete only after the tests pass and the report exists

## 5. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Ensure Postgres is running and note the data state (4.1 indicators). The interface is the exported core function plus `saveGraph` (no HTTP route or CLI command exists for it)
- [x] 5.2 Success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx` after `npx tsc --build`, that reads both fixtures with a scratch salt, prints every co-change edge and the number of counted commits, and checks them against `fixtures/README.md` (one pair each, weights 1 and 0.75)
- [x] 5.3 Mutating path: save the acme-shop graph with its co-change edges into a new project via `createPostgresStore({ pool })`, print the stored `co_changed` rows, save again (edges replaced, same count), then delete the project and verify every row of it is gone
- [x] 5.4 Error/edge cases from the same script: an edge set computed with a `knownPaths` larger than `files` is rejected by `saveGraph` with `InvalidGraph` and nothing is written; empty history → `[]`
- [x] 5.5 Document every command and output in `openspec/changes/co-change-edges/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
- [x] 5.6 Verify the data state matches the pre-test state (4.1 indicators)

## 6. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 6.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
- [ ] 6.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run (`ci.yml` → `Tests`) that `co-change.spec.ts` and the `co-change persistence` block ran and were not skipped, and that rebuilding both fixtures works on the Ubuntu runner. Link the run in the step 8 report

## 7. Update Technical Documentation (MANDATORY)

- [x] 7.1 Update `docs/project-context.md`: Testing (the git spec rebuilds both fixtures); Gotchas (`co_changed` semantics: one canonical edge per pair from the smaller path, support ≥ 2, 100-file cap, Jaccard weight, no author data, must be saved in the same snapshot as the analyzers' edges — DIS-85; `neighbors` reaches only the target side until DIS-89); update the mutation-score line if it changes
- [x] 7.2 Update `readme.md` §3.2 only where it describes the `co_changed` weight formula, if this change fixes it (Jaccard, support ≥ 2, no line weighting). No other product text
- [x] 7.3 ADR: none planned (design D8). Write one via `/adr-new` only if the author asks at review
- [x] 7.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 7.5 Leave a Linear comment in Spanish on DIS-85 (compose `co_changed` edges into the same snapshot as the analyzers' edges; `knownPaths` = snapshot paths) and on DIS-94 (one canonical edge per pair: query both endpoints; weight semantics)
- [ ] 7.6 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-36 to In Review in Linear, with a comment in Spanish linking the PR and the change
