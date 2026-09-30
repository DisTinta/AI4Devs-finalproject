## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-35 to In Progress in Linear right away, with a short comment in Spanish (change name `git-history-extraction` and branch)
- [x] 0.2 Create feature branch `feature/DIS-35-git-history-extraction` from the delivery branch `feature/entrega-2-CRN` (see `docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/git-history-extraction/` planning files with it
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Start the local stack with `docker compose up -d`, confirm Postgres is healthy, apply migrations with `npm run db:migrate`. Note the shared DB state: `pgmigrations` rows and the row counts of `project`, `file`, `commit`, `file_commit`
- [x] 0.5 Rebuild the fixture with `node fixtures/build-history.mjs acme-shop` and confirm `git -C fixtures/acme-shop log --oneline | wc -l` = 32. Run `npx vitest run` once, green, as the pre-change baseline; record the totals for the step 8 report

## 1. Build wiring and dependency (design D4, D6)

- [x] 1.1 Add `simple-git` (current major, caret range) to `packages/adapters/git/package.json` with `npm install -w packages/adapters/git simple-git`; add `references: [{ "path": "../../core" }]` to `packages/adapters/git/tsconfig.json`. Run `npm run typecheck` and `npm run lint:architecture` green

## 2. Core: domain error and `GitPort` contract (design D1, D3)

- [x] 2.1 Add `NotAGitRepository` (code `NOT_A_GIT_REPOSITORY`, `repoPath`) to `packages/core/src/knowledge/errors.ts` following `ProjectNotFound`; add a case to `tests/unit/knowledge/errors.spec.ts` (RED → GREEN) for its code, name, `repoPath` and message
- [x] 2.2 Replace the stub in `packages/core/src/ports/GitPort.ts` with `GitHistory` and `GitPort.readHistory` per D1, with TSDoc stating order (newest first), path format, the no-identity guarantee and `@throws NotAGitRepository`. Export `GitHistory` from `ports/index.ts`. Run `npm run typecheck`

## 3. Core: pseudonymisation (TDD, design D2)

- [x] 3.1 RED: create `tests/unit/knowledge/author-hash.spec.ts` with "E-mail case and surrounding whitespace do not change the hash" and "An empty e-mail falls back to the normalised name" (e-mail `''` and `'   '`, name with capitals and surrounding spaces; equal to the hash of the normalised name, different from the hash with a non-empty e-mail), plus boundaries: 64 lowercase hex, different salts differ, the output contains neither the name nor the e-mail. Run and see it fail
- [x] 3.2 GREEN: create `packages/core/src/knowledge/author-hash.ts` with `pseudonymiseAuthor` (HMAC-SHA256 via `node:crypto`); export from `knowledge/index.ts`. Run 3.1 green

## 4. Core: commit message rules (TDD, design D2)

- [x] 4.1 RED: create `tests/unit/knowledge/commit-message.spec.ts` with "A squash-style number is extracted", "A merge-commit number is extracted", "A message without a number has none", plus `stripIdentityTrailers` cases: one case per trailer name of the spec's MUST (`Co-authored-by`, `Signed-off-by`, `Reviewed-by`, `Acked-by`, `Reported-by`, `Tested-by`, `Suggested-by`, e.g. `it.each`), case-insensitive, `\r\n`, trailing blank lines trimmed, other lines verbatim). Run and see it fail
- [x] 4.2 GREEN: create `packages/core/src/knowledge/commit-message.ts` with `extractPrNumber` and `stripIdentityTrailers`; export from `knowledge/index.ts`. Run 4.1 green
- [x] 4.3 REFACTOR with the suite green (naming, TSDoc on every export). Run `npx stryker run` and record the mutation scores of `author-hash.ts` and `commit-message.ts` (threshold `MIN_MUTATION_SCORE=70`); add tests for surviving mutants that reflect spec rules

## 5. Adapter: salt configuration (TDD, design D5)

- [x] 5.1 RED: create `tests/unit/git/salt-config.spec.ts` with "A missing or blank salt is rejected" (`authorHashSaltFromEnv({})` and `{ AUTHOR_HASH_SALT: '   ' }`, and `createSimpleGitHistory({ authorHashSalt: '   ' })` in the same test; the factory throws synchronously, before any `GitPort` exists, so no `git` process can have run), plus: a set value is returned trimmed, and the error message never contains the value. Run and see it fail
- [x] 5.2 GREEN: create `packages/adapters/git/src/config.ts` (`authorHashSaltFromEnv`) and the factory's salt check in `packages/adapters/git/src/simple-git-history.ts`; export both from `packages/adapters/git/src/index.ts`. Run 5.1 green

## 6. Adapter: `readHistory` (TDD, design D4, D6)

- [x] 6.1 Create `tests/integration/git/simple-git-history.spec.ts` scaffolding: `beforeAll` rebuilds acme-shop with `node fixtures/build-history.mjs acme-shop` (spawned like `runCommand` in `tests/integration/store/support.ts`); a helper that makes a temporary repository under `os.tmpdir()` with `git -c user.name=… -c user.email=… -c commit.gpgsign=false`; `afterAll` removes the temporary directories. Synthetic identities only (no real names or e-mails)
- [x] 6.2 RED → GREEN: tests "A directory without Git is rejected", "A subdirectory of a repository is rejected" and "A non-existent path is rejected" (the error names the path). Implement D4 step 2 (`fs.realpath` + `fs.stat`, then `rev-parse --show-toplevel` compared by real path → `NotAGitRepository`; revised during apply from `checkIsRepo(IS_REPO_ROOT)`, see design D4.2, with the boundary test "accepts the top-level directory of a linked worktree")
- [x] 6.3 RED → GREEN: test "A repository without commits yields an empty history". Implement D4 step 3
- [x] 6.4 RED → GREEN: test "The acme-shop history is read completely". Implement D4 steps 4–6 (single `git log` with the RS/US format, UTF-8 and `core.quotepath=false`, numstat parsing, identity hashed immediately, message sanitised, `prNumber` extracted)
- [x] 6.5 RED → GREEN: tests "Commits of one author share a hash", "A different salt changes every hash" and "The acme-shop PR numbers are extracted"
- [x] 6.6 RED → GREEN: tests "Identity trailers are removed from the message" and "Text and binary files are counted correctly" (temporary repositories)
- [x] 6.7 RED → GREEN: test "The acme-shop history is persisted without names or e-mails" under `describeWithDatabase` + `useTransactionPerTest`, with `createPostgresStore({ transaction: db() })` like `tests/integration/store/graph-write.spec.ts`; `files` built from the distinct paths of `fileCommits` with `file()` from `tests/support/sample-graph.ts`; names and e-mails to search for read from `git -C fixtures/acme-shop log --format=%aN%n%aE`; assert the `(#61)` row's `pr_number` = 61 and `committed_at` = 2024-05-02T14:49:00Z; the no-PII check covers every column of every `commit` and `file_commit` row of the project, and `@acme.test`
- [x] 6.8 Prove the key tests can fail, restoring from a scratch copy and confirming with `cmp` each time:
  - store the raw e-mail instead of the hash → "The acme-shop history is persisted without names or e-mails" fails;
  - skip `stripIdentityTrailers` → "Identity trailers are removed from the message" fails;
  - skip the top-level comparison (accept any path inside a repository) → "A subdirectory of a repository is rejected" fails (also run once against the first `checkIsRepo()`-without-`IS_REPO_ROOT` version).

  Record the three results for the step 8 report
- [x] 6.9 REFACTOR with the suite green: parser separated from process invocation inside the adapter, no identity kept past the hashing step, TSDoc on every export

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `tests/unit/knowledge/errors.spec.ts` (new error) and any test relying on `GitPort` being empty. Confirm with `git diff --stat feature/entrega-2-CRN -- tests` that only the intended files changed
- [x] 7.2 Update affected tests without weakening their assertions. Confirm the 17 `#### Scenario:` of `specs/git-history/spec.md` map 1:1 to tests with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two), and that every MUST/SHALL requirement has at least one of them. Mapping: 3.1 (2), 4.1 (3), 5.1 (1), 6.2 (3), 6.3 (1), 6.4 (1), 6.5 (3), 6.6 (2), 6.7 (1)

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `pgmigrations` rows and the row counts of `project`, `file`, `commit`, `file_commit`; `git -C fixtures/acme-shop rev-parse HEAD`; `git status --porcelain fixtures` (must be empty: the rebuild never mutates tracked files)
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/knowledge tests/unit/git tests/integration/git`, twice, to check for flakiness
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run`. Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`: the unit tests run, no import error
- [x] 8.4 Verify the post-test state matches the baseline (same counts, same fixture `HEAD`, no temporary directory left, `git status --porcelain fixtures` empty). Restore and document if not
- [x] 8.5 Create the report `openspec/changes/git-history-extraction/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the forced failures of 6.8 and the mutation scores of 4.3
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Ensure Postgres is running and note the current data state (8.1 indicators). The interface is the `GitPort` implementation (no HTTP route, no CLI command exists for it)
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx`, that reads `fixtures/acme-shop` and `fixtures/task-api` (rebuilt first) with a scratch salt and prints counts (commits, links, PR-tagged, distinct hashes) and three sample commits. Verify against `fixtures/README.md` (32/17/3 and 28/14/3) and that no name or e-mail is printed
- [x] 9.3 Exercise the mutating path: save the acme-shop history into a new project via `createPostgresStore({ pool })`, print the stored counts, save it again (upsert: counts unchanged), then delete the project and verify every row of it is gone (restoration)
- [x] 9.4 Exercise the error cases from the same script: blank salt, non-existent path, a directory outside any repository, `packages/` (subdirectory of the Codemind repo). Print each error's name/`code`/message and confirm none contains the salt
- [x] 9.5 Document every command and output in `openspec/changes/git-history-extraction/reports/YYYY-MM-DD-9-manual-interface-testing.md`. Delete the scratch script
- [x] 9.6 Verify the data state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI, no web change). Record "not applicable", with that reason, in the step 8 report
- [x] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run (`ci.yml` → `Tests`) that `simple-git-history.spec.ts` ran, including the database block, and was not skipped; confirm the fixture rebuild works on the Ubuntu runner. Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Add `AUTHOR_HASH_SALT=` to `.env.example`, empty, with a comment: required to pseudonymise commit authors, never commit a value, changing it changes every `author_hash`
- [x] 11.2 Update `docs/project-context.md`: the `AUTHOR_HASH_SALT` variable, the git adapter (`createSimpleGitHistory`, `authorHashSaltFromEnv`), and the gotchas (fixture `.git` rebuilt by the git integration spec; a missing fixture `.git` resolves to the parent repo, hence the repo-root check; `git` needed on PATH). Update `docs/TESTING.md` for `tests/integration/git/`
- [x] 11.3 Update `readme.md` §3.2 only where it describes `author_hash` / `pr_number` and this change fixes the rule (keyed hash of the normalised e-mail, PR number from the subject). No other product text
- [x] 11.4 ADR: none planned (design D7). Write one via `/adr-new` only if the author asks at review
- [x] 11.5 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules
- [x] 11.6 Leave a Linear comment in Spanish on DIS-36 (co-change) and DIS-85 (orchestration): the `GitHistory` shape, that links to paths outside the snapshot must be dropped before `saveGraph`, `--no-renames`, and that the CLI must read the salt with `authorHashSaltFromEnv(process.env)` at boot
- [x] 11.7 Prepare the PR description (`/pr-describe`) against `feature/entrega-2-CRN`. After verification, set DIS-35 to In Review in Linear, with a comment in Spanish linking the PR and the change
