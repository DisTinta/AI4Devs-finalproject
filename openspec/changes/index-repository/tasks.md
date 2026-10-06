## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-85 to In Progress in Linear right away, with a short comment in Spanish (change name `index-repository` and branch)
- [x] 0.2 Create feature branch `feature/DIS-85-index-repository` from the delivery branch `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/index-repository/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
  - Branch created 2026-10-06 from `origin/feature/entrega-2-CRN` at `78ef40c` (PR #22 merged), upstream unset.
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.4 Baseline: `docker compose up -d` and `DATABASE_URL` exported; run `npx vitest run` once, green, and record the totals for the step 7 report; record `git status --porcelain fixtures` (must be empty), `git ls-files -s fixtures | sha1sum`, and `SELECT count(*) FROM project` on the local database
  - Baseline (2026-10-06): 35 test files passed (35); 520 tests passed; 71.62s, with `DATABASE_URL` set. `git status --porcelain fixtures` empty. `git ls-files -s fixtures | sha1sum` = `b97101fedecb07b21ca67c6156224d81bc13a3e8`. `project` 0 rows, `commit` 0 rows.

## 1. Port and domain error (TDD, design D3, D5)

- [x] 1.1 RED: in `tests/unit/knowledge/errors.spec.ts` add an extra case (not a scenario) for `EmptyRepository`: `instanceof DomainError`, `code` `EMPTY_REPOSITORY`, `repoPath` kept, message names the path and says "no commit". See it fail
- [x] 1.2 GREEN: `EmptyRepository` in `packages/core/src/knowledge/errors.ts` with JSDoc stating "no commit, not no files"
- [x] 1.3 Create `packages/core/src/index/index-report.ts` (`INDEX_PHASES`, `IndexPhase`, `SkipReason`, `SkippedEntry`, `CommitRedactionEvent`, `IndexReport`) and `packages/core/src/ports/SourceTreePort.ts` (`SourceTree`, `SourceTreePort`), with JSDoc; export them from the `index/` and `ports/` barrels. Run `npm run typecheck` and `npm run lint:architecture` (apply the D3 fallback if a cycle is flagged)

## 2. Adapter: Git source tree (TDD, design D1, D11)

- [x] 2.1 Create `tests/integration/git/git-source-tree.spec.ts` (template `tests/integration/git/simple-git-history.spec.ts`: throwaway repositories under the OS temp dir, synthetic identities, cleanup in `afterAll`). RED: test "A path that is not a repository root is rejected". See it fail (module missing)
- [x] 2.2 GREEN: move `assertRepositoryRoot` and `hasCommits` from `simple-git-history.ts` to `packages/adapters/git/src/repository.ts` (no behaviour change; `npx vitest run tests/integration/git` green), create `git-source-tree.ts` with `createGitSourceTree()` and export it from `packages/adapters/git/src/index.ts`
- [x] 2.3 RED → GREEN: test "A repository with no commit is rejected"
- [x] 2.4 RED → GREEN: test "Only the files tracked at HEAD are read" (`git ls-tree -r -z --full-tree HEAD` + `binaryCatFile`; committed content, not the working tree)
- [x] 2.5 RED → GREEN: test "Symbolic links and submodules are skipped and reported" (entries created with `git update-index --cacheinfo`, D11)
- [x] 2.6 RED → GREEN: test "Content that is not UTF-8 is skipped and reported" (`TextDecoder` with `fatal: true`)
- [x] 2.7 RED → GREEN: test "The real path follows symbolic links" (junction on Windows, `'dir'` elsewhere)
- [x] 2.8 Extra cases (not scenarios): a non-ASCII file name arrives intact; an executable file (`100755`) is read; a commit tracking no file resolves to `{ files: [], skipped: [] }`; a linked worktree root is accepted

## 3. Domain: framework detection (TDD, design D3)

- [x] 3.1 Create `tests/unit/index/framework-detect.spec.ts` (template `tests/unit/index/path-policy.spec.ts`, AAA, no I/O). RED: test "The framework is detected from the root manifest". See it fail
- [x] 3.2 GREEN: `packages/core/src/index/framework-detect.ts` with `detectFramework`; export it from the barrel
- [x] 3.2b Layer guard (design D3, author decision): `GUARD_HTTP_IN_BUSINESS` in `.claude/sdd-harness.env` matches transport imports, not the bare word `fastify`; verified with `grep -qE` (no match on `knowledge/project.ts` and `index/framework-detect.ts`; match on the five sample import lines; output kept for the step 8 report); `npm run lint:architecture` green; separate commit `chore(DIS-85): match transport imports in the core layer guard`
  - Commit `b04675d`. Also checked with the hooks' own loader (`load_env_safe`): the value keeps `\"` literally, which only adds `\` to the bracket; same results.
- [x] 3.3 Extra cases (not scenarios): `"require": null`; `laravel/framework` as a value rather than a key; `fastify` only in `peerDependencies` → `none`; a `composer.json` that is a JSON string

## 4. Domain: the index use case (TDD with in-memory fakes, design D2–D10)

- [x] 4.1 Create `tests/unit/index/index-repository.spec.ts` with hand-written fakes for the four ports that record every call in one shared log, and a progress spy. RED: test "Progress phases are reported once and in order". See it fail (module missing)
- [x] 4.2 GREEN: `packages/core/src/index/index-repository.ts` happy path (confine ×2, read, redact, detect, analyze with `contentHash`/`redacted`, history, co-change, validate, create, save, report); export it from the barrel
  - Report ordering uses UTF-8 byte (code point) order, not `<`: design D10 corrected in apply.
- [x] 4.3 RED → GREEN: tests "A path outside the allowed root is rejected before reading", "Indexing is disabled without an allowed root", "A symbolic link escaping the allowed root is rejected before reading" (including `requestedPath = 'acme-shop'` and no `/elsewhere` in the message: capture and rethrow with `input.repoPath`, design D4) and "An allowed root that does not exist disables indexing" (`NotAGitRepository` from `realPath(allowedRoot)` rethrown as `IndexingDisabled`, D4)
  - RED seen for the two real-path cases (real path leaked as `requestedPath`; `NotAGitRepository` instead of `IndexingDisabled`). The two lexical cases were already green after 4.2 (`confinePath` covers them).
- [x] 4.4 RED → GREEN: tests "A failure reading the source tree writes nothing" and "A failure reading the history writes nothing" (`EmptyRepository` on missing `head`, D5)
  - RED seen for the empty history (resolved instead of rejecting); the `readFiles` failure was already green after 4.2.
- [x] 4.5 RED → GREEN: tests "An invalid graph creates no project" and "A taken project name saves no graph"
  - Both green at once: validate-before-create came with 4.2. That they can fail is shown in 4.10 (mutation 3).
- [x] 4.6 RED → GREEN: test "Malformed, repeated and binary entries never reach the analyzer" — create `packages/core/src/index/source-path.ts` (`selectIndexableFiles`, D6) and the orphan-link filter (D8)
- [x] 4.7 RED → GREEN: test "A secret in a commit message is redacted" (D2; key built by concatenation)
- [x] 4.8 RED → GREEN: test "An explicit framework wins over detection"
- [ ] 4.8b RED → GREEN: test "The analyzer only receives redacted content" (requirement "Secrets never reach the store", added by `/opsx:update` on 2026-10-06): promote the redaction part of the 4.9 extra case "hashes the redacted content…" to this scenario and remove it from the extras, so no test is duplicated. The behaviour already exists, so RED is shown by running the test against mutation (2) of 4.10
- [ ] 4.9 Extra cases (not scenarios): `contentHash` of a known string equals its SHA-256; report `events` sorted by path across files; `skipped` sorted by path then reason; `edges.exact + edges.heuristic = edges.total`; co-change weights computed with the unfiltered links (a dropped path still lowers a weight); a path with a `..` segment is `invalid-path`; a throwing `onProgress` propagates
- [ ] 4.10 Prove key tests can fail: back up each file to the scratchpad, mutate with a node script whose anchor must match, run, restore and confirm with `cmp`: (1) skip the real-path confinement → "A symbolic link escaping…" fails; (2) analyze the unredacted files → "The analyzer only receives redacted content" fails; (3) call `createProject` before `assertValidGraph` → "An invalid graph creates no project" fails. Record the results for the step 7 report
  - Each anchor matched once; each file restored and confirmed with `cmp`. (1) real-path confinement removed → "A symbolic link escaping the allowed root is rejected before reading" fails; (2) analyzer given the unredacted files → extra case "hashes the redacted content…" fails (re-run against the acme-shop scenario in 5.2); (3) `createProject` before `assertValidGraph` → "An invalid graph creates no project" fails. 18/18 green after restore.
- [x] 4.11 REFACTOR with the suite green: JSDoc on every export; core imports only `node:path`, `node:crypto` and its own modules; `npm run lint:architecture`, `npm run docs:coverage`, `npm run typecheck`, `npm run lint` green

## 5. Integration: acme-shop end to end (design D11)

- [x] 5.1 Create `tests/integration/index/acme-shop.spec.ts`: `beforeAll` copies `fixtures/acme-shop` without `.git` under the OS temp dir and runs `buildOne` (never in `fixtures/`); `describeWithDatabase` + `useTransactionPerTest`; store on `db()`; salt `'test-salt'`. RED → GREEN: test "acme-shop is indexed completely"
  - Green on first run once the per-test timeout was raised to 60 s (`INDEXING_TIMEOUT_MS`; Vitest default 5 s): about 6 s per indexing, one `git cat-file` process per blob (design Risks).
- [x] 5.2 RED → GREEN: test "The planted secret of acme-shop never reaches the database" (`content_hash` recomputed from the redacted fixture content; `/AKIA[A-Z0-9]{16}/` over `symbol.signature` and `commit.message` of the project)
  - Mutation (2) of 4.10 (analyzer given unredacted files) re-run here: both acme-shop tests stay green. The planted key sits in a config array that yields no symbol, so the analyzer path cannot leak it into `symbol.signature` with this fixture; only the unit extra case catches that mutation. Raised to the author: new scenario "The analyzer only receives redacted content" (4.8b), design Risks.
- [x] 5.3 Run both integration files twice to check for flakiness (temporary directory realpath on Windows, Git timing)
  - Two runs of `tests/integration/index tests/integration/git`: 4 files, 33 tests passed each time (51.98 s, 50.84 s).

## 6. Privacy and ethics check

- [x] 6.1 Run `/privacy-ethics-check` over the diff (repository content, commit messages, report, error messages, test literals). Record the outcome in the step 7 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)
  - PASS WITH GAPS, three Low: absolute path in `EmptyRepository`/`NotAGitRepository` messages (B → DIS-86, with the existing `ForbiddenPathError` follow-up); commit-message free text beyond the four rules (D, DIS-35 non-goal); synthetic `.test` identity in the git spec (D). No PII, no secret literal, no logging, no dependency change. Full report in the step 8 report.

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `tests/integration/git/simple-git-history.spec.ts` (helpers moved in 2.2) and `tests/unit/knowledge/errors.spec.ts`. Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that nothing else changed besides the new specs
  - Only `tests/unit/knowledge/errors.spec.ts` changed among tracked tests (+13/-1: the import line gains `EmptyRepository`, plus one new case); `simple-git-history.spec.ts` unchanged and green after the helper move. New: the four spec files of this change.
- [ ] 7.2 Update affected tests without weakening their assertions (none expected). Confirm that every `#### Scenario:` of `openspec/changes/index-repository/specs/repository-indexing/spec.md` (22) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)
  - No assertion touched. Each of the 21 scenario titles matches exactly one `it(` (grep count 1 each).

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 8.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures | sha1sum`, `SELECT count(*) FROM project` and `SELECT count(*) FROM commit` on the local database
- [ ] 8.2 Run the targeted tests: `npx vitest run tests/unit/index tests/integration/index tests/integration/git`, twice
- [ ] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/index/**/*.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones with extra cases). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [ ] 8.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty, same `project` and `commit` counts: the harness rolled everything back). Restore and document if not
- [ ] 8.5 Create the report `openspec/changes/index-repository/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the baseline of 0.4, the forced failures of 4.10, the Stryker score and the privacy check of 6.1
- [ ] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Note the current state (8.1 indicators). The interface is the core API `indexRepository` with the real adapters (no CLI command uses it yet: DIS-86)
- [ ] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx` after `npx tsc --build`, that copies acme-shop to a temporary root, rebuilds its history, opens a transaction on a `pg` client, indexes it with the real adapters, prints the report and the stored project, then **rolls back**
- [ ] 9.3 Mutating operations: confirm after the script that the `project` and `commit` counts equal the 8.1 baseline (rollback restored the state); if a commit happened by mistake, delete the project by name (the schema cascades) and document it
- [ ] 9.4 Exercise the error cases from the same script: `repoPath` `../etc`, blank root, a directory junction/symlink inside the root pointing outside it, a non-repository directory, a fresh `git init` repository, a repeated name; print each error's `name`, `code` and message, and check that no message or report contains the planted key
- [ ] 9.5 Document every command and output in `openspec/changes/index-repository/reports/YYYY-MM-DD-9-manual-interface-testing.md` (mask the OS user name in paths)
- [ ] 9.6 Verify the state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI command, no web change: the CLI is DIS-86). Record "not applicable", with that reason, in the step 8 report
- [ ] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the four new spec files ran (the integration ones with Postgres and Git) and passed. Link the run in the step 8 report

## 11. Update Technical Documentation (MANDATORY)

- [ ] 11.1 Update `docs/project-context.md`: the gotchas that say "nothing calls them yet (indexing is DIS-85)" and "the caller (DIS-85) must drop them first"; add a gotcha with the use-case order and phases, `SourceTreePort` reading `HEAD` via `ls-tree` (not the working tree), the caller-owned transaction (D9), and `createGitSourceTree` among the `adapters/git` exceptions in "The infra packages are stubs"
- [ ] 11.2 No ADR (design D12); confirm nothing in the implementation contradicted that
- [ ] 11.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [ ] 11.4 Leave the Spanish Linear comment on DIS-86 with the composition contract (design Follow-ups)
- [ ] 11.5 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed and the Stryker score. After verification, set DIS-85 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 11.6 At archive time, run the archive ritual: close or reassign the 10 inbound notes of DIS-85 (DIS-12, DIS-23 ×2, DIS-35 ×2, DIS-36, DIS-47, DIS-84, DIS-96 ×2), and classify every review gap (A/B/C/D)
