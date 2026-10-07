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
- [x] 4.8b RED → GREEN: test "The analyzer only receives redacted content" (requirement "Secrets never reach the store", added by `/opsx:update` on 2026-10-06): promote the redaction part of the 4.9 extra case "hashes the redacted content…" to this scenario and remove it from the extras, so no test is duplicated. The behaviour already exists, so RED is shown by running the test against mutation (2) of 4.10
  - RED (2026-10-06) with mutation (2) of 4.10 applied (analyzer given `indexable.files`): "The analyzer only receives redacted content" fails on `expect(received?.content).toContain(REDACTION_MARKER)` (received content still held the synthetic key). Restored with `cmp`; 19/19 green. The extra case of 4.9 keeps only the hash and commit checks, so no test is duplicated.
- [x] 4.9 Extra cases (not scenarios): `contentHash` of a known string equals its SHA-256; report `events` sorted by path across files; `skipped` sorted by path then reason; `edges.exact + edges.heuristic = edges.total`; co-change weights computed with the unfiltered links (a dropped path still lowers a weight); a path with a `..` segment is `invalid-path`; a throwing `onProgress` propagates
  - Extra case renamed "hashes the redacted content with SHA-256 and keeps a commit without message as is": hash of `abc` (FIPS 180-2 vector) and of the expected redacted text; its `redacted`/analyzer assertions moved to the 4.8b scenario.
- [x] 4.10 Prove key tests can fail: back up each file to the scratchpad, mutate with a node script whose anchor must match, run, restore and confirm with `cmp`: (1) skip the real-path confinement → "A symbolic link escaping…" fails; (2) analyze the unredacted files → "The analyzer only receives redacted content" fails; (3) call `createProject` before `assertValidGraph` → "An invalid graph creates no project" fails. Record the results for the step 7 report
  - Re-run 2026-10-06 after 4.8b; each anchor matched once, each file restored and confirmed with `cmp`: (1) real-path confinement removed → "A symbolic link escaping the allowed root is rejected before reading" fails; (2) analyzer given the unredacted files → "The analyzer only receives redacted content" fails; (3) `createProject` before `assertValidGraph` → "An invalid graph creates no project" fails. Each mutation fails exactly one test (1 failed | 18 passed); 19/19 green after restore.
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
- [x] 7.2 Update affected tests without weakening their assertions (none expected). Confirm that every `#### Scenario:` of `openspec/changes/index-repository/specs/repository-indexing/spec.md` (22) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)
  - No assertion touched. Each of the 21 scenario titles matches exactly one `it(` (grep count 1 each).
  - Grep of the 22 titles (2026-10-06), count of `it('<title>'` in `tests/` and file:
    ```
    1  Only the files tracked at HEAD are read  [tests/integration/git/git-source-tree.spec.ts ]
    1  A path that is not a repository root is rejected  [tests/integration/git/git-source-tree.spec.ts ]
    1  A repository with no commit is rejected  [tests/integration/git/git-source-tree.spec.ts ]
    1  Symbolic links and submodules are skipped and reported  [tests/integration/git/git-source-tree.spec.ts ]
    1  Content that is not UTF-8 is skipped and reported  [tests/integration/git/git-source-tree.spec.ts ]
    1  The real path follows symbolic links  [tests/integration/git/git-source-tree.spec.ts ]
    1  Progress phases are reported once and in order  [tests/unit/index/index-repository.spec.ts ]
    1  A path outside the allowed root is rejected before reading  [tests/unit/index/index-repository.spec.ts ]
    1  Indexing is disabled without an allowed root  [tests/unit/index/index-repository.spec.ts ]
    1  A symbolic link escaping the allowed root is rejected before reading  [tests/unit/index/index-repository.spec.ts ]
    1  An allowed root that does not exist disables indexing  [tests/unit/index/index-repository.spec.ts ]
    1  A failure reading the source tree writes nothing  [tests/unit/index/index-repository.spec.ts ]
    1  A failure reading the history writes nothing  [tests/unit/index/index-repository.spec.ts ]
    1  An invalid graph creates no project  [tests/unit/index/index-repository.spec.ts ]
    1  A file the analyzer did not receive creates no project  [tests/integration/index/acme-shop.spec.ts ]  (added 2026-10-07, task 12.1)
    1  A file the analyzer did not return creates no project  [tests/integration/index/acme-shop.spec.ts ]  (added 2026-10-07, task 13.2)
    1  Reading executes nothing from the repository  [tests/integration/git/git-source-tree.spec.ts ]  (added 2026-10-07, task 13.4)
    1  A HEAD on an orphan branch is rejected as empty  [tests/integration/git/git-source-tree.spec.ts ]  (added 2026-10-07, task 14.5)
    1  A broken HEAD propagates git's error  [tests/integration/git/git-source-tree.spec.ts ]  (added 2026-10-07, task 14.4)
    git-history delta (added 2026-10-07, task 14.1):
    1  A broken HEAD rejects the history read  [tests/integration/git/simple-git-history.spec.ts ]
    1  Reading the history executes nothing from the repository  [tests/integration/git/simple-git-history.spec.ts ]
    1  Repository configuration does not change the history  [tests/integration/git/simple-git-history.spec.ts ]
    1  Reading the history never fetches a missing object  [tests/integration/git/simple-git-history.spec.ts ]  (task 15.2)
    1  A .git directory or a bare repository is rejected  [tests/integration/git/simple-git-history.spec.ts ]  (task 15.1)
    repository-indexing, added 2026-10-07 (tasks 15.1, 15.2):
    1  A .git directory or a bare repository is not a repository root  [tests/integration/git/git-source-tree.spec.ts ]
    1  A partial clone never fetches a missing object  [tests/integration/git/git-source-tree.spec.ts ]
    1  A taken project name saves no graph  [tests/unit/index/index-repository.spec.ts ]
    1  Malformed, repeated and binary entries never reach the analyzer  [tests/unit/index/index-repository.spec.ts ]
    1  The planted secret of acme-shop never reaches the database  [tests/integration/index/acme-shop.spec.ts ]
    1  The analyzer only receives redacted content  [tests/unit/index/index-repository.spec.ts ]
    1  A secret in a commit message is redacted  [tests/unit/index/index-repository.spec.ts ]
    1  The framework is detected from the root manifest  [tests/unit/index/framework-detect.spec.ts ]
    1  An explicit framework wins over detection  [tests/unit/index/index-repository.spec.ts ]
    1  acme-shop is indexed completely  [tests/integration/index/acme-shop.spec.ts ]
    ```

## 8. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 8.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures | sha1sum`, `SELECT count(*) FROM project` and `SELECT count(*) FROM commit` on the local database
- [x] 8.2 Run the targeted tests: `npx vitest run tests/unit/index tests/integration/index tests/integration/git`, twice
- [x] 8.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/index/**/*.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones with extra cases). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
  - Final code `ce50dae`: 39 files, 556 passed (63.04 s); no-DB run 26 files, 368 passed; lint 0 errors (1 pre-existing warning), typecheck, architecture (4 pre-existing warnings), docs:coverage green. Stryker `index/`: 94.48 % → 96.48 % after killing meaningful survivors (extra cases + `isValidPath`/`compareBytes` refactor, commit `ce50dae`); 3 equivalent survivors in new code, listed in the report.
- [x] 8.4 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty, same `project` and `commit` counts: the harness rolled everything back). Restore and document if not
- [x] 8.5 Create the report `openspec/changes/index-repository/reports/YYYY-MM-DD-8-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the baseline of 0.4, the forced failures of 4.10, the Stryker score and the privacy check of 6.1
  - Report `reports/2026-10-06-8-test-and-state-verification.md`.
- [x] 8.6 Mark complete only after the tests pass and the report exists

## 9. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Note the current state (8.1 indicators). The interface is the core API `indexRepository` with the real adapters (no CLI command uses it yet: DIS-86)
- [x] 9.2 Exercise the success path: a scratch script in the scratchpad (not in the repo), run with `npx tsx` after `npx tsc --build`, that copies acme-shop to a temporary root, rebuilds its history, opens a transaction on a `pg` client, indexes it with the real adapters, prints the report and the stored project, then **rolls back**
  - Scratch script `manual-index.mjs` (scratchpad), one `pg` transaction rolled back in `finally`; report `reports/2026-10-06-9-manual-interface-testing.md`.
- [x] 9.3 Mutating operations: confirm after the script that the `project` and `commit` counts equal the 8.1 baseline (rollback restored the state); if a commit happened by mistake, delete the project by name (the schema cascades) and document it
  - Inside the transaction 1 project, after `ROLLBACK` 0; `project`/`commit`/`file` rows 0/0/0 as the baseline.
- [x] 9.4 Exercise the error cases from the same script: `repoPath` `../etc`, blank root, a directory junction/symlink inside the root pointing outside it, a non-repository directory, a fresh `git init` repository, a repeated name; print each error's `name`, `code` and message, and check that no message or report contains the planted key
  - Seven error cases as specified, each with the expected error and phases; no message shows the junction target or an AWS key id.
- [x] 9.5 Document every command and output in `openspec/changes/index-repository/reports/YYYY-MM-DD-9-manual-interface-testing.md` (mask the OS user name in paths)
- [x] 9.6 Verify the state matches the pre-test state (8.1 indicators)

## 10. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 10.1 Confirm no user interface or user workflow is affected (no route, no CLI command, no web change: the CLI is DIS-86). Record "not applicable", with that reason, in the step 8 report
  - Recorded in the step 8 report.
- [x] 10.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the four new spec files ran (the integration ones with Postgres and Git) and passed. Link the run in the step 8 report
  - `quality` run 37508118785 on `2e036b8`: pass, 555 passed / 1 skipped (Windows-only case); `index-repository.spec.ts` 21, `git-source-tree.spec.ts` 9, `framework-detect.spec.ts` 3, `acme-shop.spec.ts` 2 (Postgres + Git), all passed; core Stryker 96.00 %. `frontend` run 37508118844 pass (no web change). Linked in the step 8 report "CI evidence (task 10.2)".

## 11. Update Technical Documentation (MANDATORY)

- [x] 11.1 Update `docs/project-context.md`: the gotchas that say "nothing calls them yet (indexing is DIS-85)" and "the caller (DIS-85) must drop them first"; add a gotcha with the use-case order and phases, `SourceTreePort` reading `HEAD` via `ls-tree` (not the working tree), the caller-owned transaction (D9), and `createGitSourceTree` among the `adapters/git` exceptions in "The infra packages are stubs"
  - Gotchas updated: `adapters/git` also implements `SourceTreePort`; orphan links, `co_changed` in the same snapshot, duplicates and the real-path check now name `indexRepository`; "nothing calls them yet" now points at DIS-86; new gotcha with phases, errors, caller-owned transaction, `ls-tree`, timing and the acme-shop oracle limit; mutation line with 96.48 % for `index/`.
- [x] 11.2 No ADR (design D12); confirm nothing in the implementation contradicted that
  - No ADR: nothing in the implementation contradicted D12. The layer-guard change is a hook config tweak recorded under D3.
- [x] 11.3 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `/update-docs`: `readme.md` package tree gains `core/index/` and `SourceTreePort`, and the FILE section says `content_hash` is over the redacted content. Checked, no change: data model (no migration), API spec (no route), dependencies (none), standards, `fixtures/README.md`, `docs/TESTING.md`. `docs:coverage` exit 0. `prompts.md` §29 (3 literal prompts) + Índice entry 29.
- [x] 11.4 Leave the Spanish Linear comment on DIS-86 with the composition contract (design Follow-ups)
  - Spanish comment on DIS-86 with the composition contract, the error list, progress phases and the Low privacy finding (destination B).
- [x] 11.5 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed and the Stryker score. After verification, set DIS-85 to In Review in Linear with a comment in Spanish linking the PR and the change
  - PR #23 (https://github.com/DisTinta/AI4Devs-finalproject/pull/23) opened against `feature/entrega-2-CRN` with the author's Why copied verbatim (`reports/pr-description.md`, commit `2e036b8`). In Review in Linear once CI is green.
- [ ] 11.6 At archive time, run the archive ritual: close or reassign the 10 inbound notes of DIS-85 (DIS-12, DIS-23 ×2, DIS-35 ×2, DIS-36, DIS-47, DIS-84, DIS-96 ×2), and classify every review gap (A/B/C/D). No `code-analysis` delta is needed for the `compareEdges` tie-break: `code-analysis` already requires it ("no two edges SHALL share `kind`, source and target", the line-700 rule and its scenario "An exact edge takes precedence over a heuristic one"), and the PHP analyzer's output is unchanged (it filters before `sortUniqueEdges`); the tie-break only makes the shared helper meet that rule whatever the input order

## 12. Follow-up of /verify-against-spec (2026-10-07, author decisions)

- [x] 12.1 U1 — spec (`/opsx:update`): a file the analyzer returns without having been given it makes indexing reject with `InvalidGraph` naming that path, in `save`, before `createProject`; new scenario "A file the analyzer did not receive creates no project". RED → GREEN: integration test of that name in `tests/integration/index/acme-shop.spec.ts` (real store, no new project row) and unit extra case "rejects a file the analyzer did not receive with InvalidGraph naming its path, before createProject" (replaces "keeps a file the analyzer returns without an input as it is"), plus extra case "saves every file with redacted and a 64-hex contentHash"
  - RED seen for both with the fix stashed (`expected { …(14) } to be an instance of InvalidGraph`); green with it. Design D4 mapping updated.
- [x] 12.2 U3 — `compareEdges` ranks `exact` before `heuristic` on an equal key, so `sortUniqueEdges` keeps the exact edge whatever the input order (code-analysis rule). Spec and design D8 clarified: "every edge" / `edges.total` are the saved edges after that deduplication. RED → GREEN: two cases in `tests/unit/knowledge/edge-order.spec.ts` and extra case "saves one exact edge when an exact and a heuristic edge share kind, source and target"
  - RED seen: `compareEdges` returned 0 and the heuristic edge was kept when it came first.
- [x] 12.3 U2 — spec clarified (a leading UTF-8 BOM is dropped when decoding; `contentHash` over the content without it). Test "drops a leading UTF-8 byte order mark when decoding" in `git-source-tree.spec.ts`, shown to fail with `ignoreBOM: true` and restored
- [x] 12.4 Tests M1 (`rootPath` is the real path), M3 (`rev-parse HEAD` and `status --porcelain` unchanged), W1/W3 (`row_to_json` of every snapshot table + the real analyzer's input; fails with the redaction removed, two mutations, file restored identical), M4 (JSON round trip, `toStrictEqual`), W2 (`'elsewhere'` without separators)
- [x] 12.5 Record U4–U8 and M2 as accepted without a test in `reports/2026-10-07-verify-against-spec.md`; run `npx vitest run`, `npm run lint`, `npm run typecheck`; re-run `/verify-against-spec` (no contradiction)

## 13. Follow-up of /adversarial-review (2026-10-07, author decisions)

- [x] 13.1 #1 — check whether the `compareEdges` tie-break adds anything to `code-analysis`: it does not (the "no two edges share kind, source and target" contract, the line-700 rule and the scenario "An exact edge takes precedence over a heuristic one" already require it; the PHP analyzer filters before `sortUniqueEdges`). No delta; `AnalyzerPort` JSDoc and task 11.6 updated. PHP analyzer suite run: 10 files, 164 tests green
- [x] 13.2 #2/#3 — spec (`/opsx:update`): the returned paths must be exactly the given ones, one sentence next to U1, `InvalidGraph` naming every missing or extra path; scenario "A file the analyzer did not return creates no project". Contract checked first: "exactly one `GraphFile` per distinct input path", and an unparseable PHP file stays in `files`. RED → GREEN: that scenario (integration, real store, no report returned) and the unit extra case "rejects a file the analyzer did not return…"
  - RED seen for both (indexing resolved with a report); green after the check in `index-repository.ts`.
- [x] 13.3 #4 — `hasCommits`: `rev-parse --verify --quiet HEAD` prints nothing both for an unborn branch and a broken ref (probe 2026-10-07), so an empty answer is told apart with `symbolic-ref --quiet HEAD`; every git failure inside `hasCommits` propagates (the root check still turned git failures into `NotAGitRepository` until task 14.2). RED → GREEN: `tests/unit/git/has-commits.spec.ts` (git missing via a fake, unborn, resolved, neither) and "propagates a broken HEAD as a git error, never as EmptyRepository" (broken branch ref → git error; junk `.git/HEAD` → `NotAGitRepository`); "A repository with no commit is rejected" still green
- [x] 13.4 P — spec scenario "Reading executes nothing from the repository" (fsmonitor, hooks directory, clean/smudge filter, textconv, `log.showSignature` + `gpg.program`). RED without hardening: `readHistory` ran the repository's `gpg.program`. GREEN after `GIT_CONFIG` gained `core.fsmonitor=false`, `core.hooksPath=<null device>`, `core.attributesFile=`, `log.showSignature=false`, all through `readerGit` (simple-git needs `allowUnsafeFsMonitor` / `allowUnsafeHooksPath` for the first two). A temporary `git status` in `readFiles` makes the test fail (clean filter ran), file restored identical
- [x] 13.5 #5 and #6 — design Risks line for the blob size (non-goal, DIS-35 debt); design Follow-up and Spanish comment on DIS-86 for the path re-resolution window (only the repository path; files come from the object database)

## 14. Follow-up of the second /verify-against-spec and /adversarial-review (2026-10-07, author decisions)

- [x] 14.0 Commit the previous round locally (571/571 green) before changing anything: `62817d6`, `b88b4c4`, `bbfe6ea`
- [x] 14.1 a — `git-history` delta (`/opsx:update`, ADDED only): "A broken HEAD propagates git's error" and "Reading the history executes nothing from the repository" (programs and output-changing configuration); `proposal.md` "Modified Capabilities" corrected. Scenarios "A broken HEAD rejects the history read" and "Reading the history executes nothing from the repository" were red against the adapter of `3985502` (empty history; `trap.sh --verify`), green with `b88b4c4`
- [x] 14.2 b — `assertRepositoryRoot` maps only git's "not a git repository" to `NotAGitRepository`; every other failure propagates. Every git process runs with `GIT_ENV` (`LC_ALL=C`, `LANGUAGE=C`, closed variable list). RED → GREEN: `tests/unit/git/repository-root.spec.ts` (fake git injected: not a repository, dubious ownership, `EACCES`, `ENOENT`, other; the environment). Narrowing showed that simple-git refuses a full `process.env` holding `EDITOR`, which the old catch-all would have reported as "not a Git repository"; hence the closed list. The machine's git has no translations, so no localised red could be shown
- [x] 14.3 c — spec: "any other git failure propagates unchanged"; `hasCommits`'s own error says "HEAD names no commit and no branch" (`has-commits.spec.ts`, red first)
- [x] 14.4 d, e — `LOG_ARGUMENTS` pins `--root`, `--no-renames` (the `git-history` policy), `--no-ext-diff`, `--no-textconv`, `--no-relative`; the hostile repository (`tests/integration/git/hostile-repository.ts`) adds `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true`, `core.quotePath=true` and an accented path; "Reading executes nothing from the repository" and "Repository configuration does not change the history" compare with a clean read (red: the root commit lost its links). The broken-ref scenario also reads the history
- [x] 14.5 f, g, h — trap scenario GIVEN lists textconv and "a hooks directory"; unit case "names every missing and every extra path in one InvalidGraph"; spec "`HEAD` names no commit → `EmptyRepository`" with scenario "A HEAD on an orphan branch is rejected as empty" (behaviour already in place, so green at once: a clarification, not a change)

## 15. Follow-up of the third /verify-against-spec and /adversarial-review (2026-10-07, last round for Minor findings)

- [x] 15.0 Commit the previous round locally (584/584 green): `2b65a87`, `3f4d3cd`, `a6a0046`, `8a82cd1`
- [x] 15.1 Major 1 (regression of 14.2) — a `.git` directory or a bare repository answers "must be run in a work tree": mapped to `NotAGitRepository`. Spec scenarios in both deltas (`git-history` "Not a repository" as MODIFIED, copied verbatim plus the scenario). RED → GREEN in both integration specs and `repository-root.spec.ts`
- [x] 15.2 Major 2 — lazy fetch of a partial clone ran the promisor remote's upload program (reproduced). `GIT_NO_LAZY_FETCH=1` in `GIT_ENV`; scenarios "A partial clone never fetches a missing object" and "Reading the history never fetches a missing object", red first (`upload-pack …` in the marker)
- [x] 15.3 C1, C2, C3 — a `realpath` failure other than a missing path propagates; `hasCommits` lets git say why with `rev-parse --verify HEAD`; the junk `.git/HEAD` case moved out of the scenario into an extra case. Red first in the unit specs
- [x] 15.4 Spec contradiction (mailmap) and U-A — `mailmap.file=`, `mailmap.blob=` and `core.useReplaceRefs=false` in `GIT_CONFIG`; the hostile config adds `i18n.logOutputEncoding=ISO-8859-1` and a remapping `mailmap.file` (red: author hashes changed); both deltas state the closed environment and the C locale
- [x] 15.5 Trivial Minors — the top-level path loses only its trailing newline (no `trim`); broken-ref tests assert git's own words (`fatal: No such ref: HEAD`); `SourceTreePort` and `GitPort` JSDoc follow the spec. Non-trivial Minors and questions accepted with their reason in the report and design Risks
