## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-86 to In Progress in Linear right away, with a short comment in Spanish (change name `cli-index-command` and branch)
  - In Progress 2026-10-07 with a Spanish comment (change and branch).
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` already contains DIS-85 (PR #23): `git log origin/feature/entrega-2-CRN -- packages/core/src/index/index-repository.ts` is not empty. If it is not merged yet, stop and ask the author (DIS-86 is blocked by DIS-85)
  - `origin/feature/entrega-2-CRN` at `c5ef7c7` = merge of PR #23 (DIS-85).
- [x] 0.3 Create feature branch `feature/DIS-86-cli-index-command` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/cli-index-command/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
  - Branch created 2026-10-07 from `origin/feature/entrega-2-CRN` at `c5ef7c7`, `--no-track` (upstream unset); planning files carried untracked.
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: `docker compose up -d` and `DATABASE_URL` exported; run `npx vitest run` once, green, and record the totals for the step 9 report; record `git status --porcelain fixtures` (must be empty), `git ls-files -s fixtures | sha1sum`, and `SELECT count(*) FROM project` and `SELECT count(*) FROM commit` on the local database
  - Baseline (2026-10-07), `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`: 41 test files passed (41); 601 tests passed; 68.03 s. `git status --porcelain fixtures` empty. `git ls-files -s fixtures | sha1sum` = `b97101fedecb07b21ca67c6156224d81bc13a3e8`. `project` 0 rows, `commit` 0 rows.

## 1. Setup: package wiring (design D9, D10)

- [x] 1.1 `packages/cli/package.json`: add `@codemind/adapter-git`, `@codemind/adapter-store-postgres`, `@codemind/analyzer-php` (`*`), `pg` (same range as `packages/adapters/store-postgres`) and `@types/pg` (dev); `packages/cli/tsconfig.json`: add `references` to `../core`, `../adapters/git`, `../adapters/store-postgres`, `../analyzers/php`. Run `npm install`, `npm run typecheck` and `npm run lint:architecture` green; `git diff package-lock.json` shows only workspace links (no new third-party package besides `@types/pg` already in the lock)
  - `package-lock.json`: only the `@codemind/cli` entry changes (+3 workspace deps, `pg`, dev `@types/pg`); no new package downloaded. `npm run typecheck` green; `lint:architecture` 0 errors, 4 pre-existing warnings.
- [x] 1.2 Workspace resolution from sources (design D10): add `@codemind/adapter-git`, `@codemind/adapter-store-postgres` and `@codemind/analyzer-php` to `resolve.alias` in `vitest.config.ts` and to `paths` in `tests/tsconfig.json`, each to its `packages/*/src/index.ts`; create `packages/cli/tsconfig.run.json` (extends `./tsconfig.json`, `paths` for `@codemind/core` and the three packages to their `src/index.ts`; not referenced by the root `tsconfig.json`); root script `"cli": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts"`. Run `npm run typecheck` and `npx vitest run tests/unit` green; `npm run cli -- projects` still prints its stub
  - Alias + paths for the three packages; `packages/cli/tsconfig.run.json`; root `cli` script with `--tsconfig`. Typecheck green; `npx vitest run tests/unit` 395 passed; `npm run cli -- projects` prints its stub.

## 2. CLI: rendering and logger (TDD, design D2, D8)

- [x] 2.1 Create `tests/unit/cli/render-report.spec.ts` (AAA, no I/O). RED: test "Diagnostics and skipped paths are escaped". See it fail (module missing)
  - RED seen: module missing.
- [x] 2.2 GREEN: `packages/cli/src/render-report.ts` with `escapeLiteral` (`JSON.stringify` + `\u007f`–`\u009f` as `\uXXXX`), `renderReport(report)` (text: project id, indexed commit, `framework (detected|explicit)`, files, symbols, commits, edges `total / exact / heuristic`, counts and entries of `skipped` and `diagnostics`) and `renderProgress(phase)` (`[n/6] <phase>` from `INDEX_PHASES`)
- [x] 2.3 GREEN: `packages/cli/src/logger.ts` (`createLogger(stream)` with `info`/`error`, one `JSON.stringify` line each). Extra cases (not scenarios): `renderProgress` numbers the six phases 1–6; `renderReport` prints `explicit` for an explicit framework; a logger line is valid JSON ending in `\n`
  - The text report also shows the number of redactions in files and in commit messages. 5 tests green.

## 3. CLI: arguments and usage errors (TDD, design D1, D6)

- [x] 3.1 Create `tests/unit/cli/index-command.spec.ts` with in-memory streams (collect writes), fake ports (pattern of `tests/unit/index/index-repository.spec.ts`), a fake store and a fake `OpenTransaction` that records `open`/`commit`/`rollback`/`release` in one log. RED: test "A missing or blank name is a usage error". See it fail (module missing)
  - All unit scenarios and extra cases of steps 3–5 written first (one file, 24 tests); RED seen for all: module missing.
- [x] 3.2 GREEN: `packages/cli/src/commands/index-repository.ts` with `runIndexCommand(argv, deps)` (fresh `new Command('index')`, `exitOverride()`, `configureOutput({ writeOut, writeErr, outputError: () => {} })`, `{ from: 'user' }`), and `packages/cli/src/compose-index.ts` with `toCliError` and the `OpenTransaction` type
  - Implemented the whole command in one pass (`commands/index-repository.ts`, `compose-index.ts`, `version.ts`); after a test-helper fix (progress lines are not JSON) 24/24 green. So the per-scenario RED of 3.3–5.4 was only "module missing"; that each test can fail is shown by the forced failures of 5.7.
- [x] 3.3 RED → GREEN: test "An unsupported language is a usage error"
- [x] 3.4 RED → GREEN: test "An unsupported framework is a usage error"
- [x] 3.5 RED → GREEN: test "Help and version exit with zero" (design D1: `packages/cli/src/version.ts` exports `CLI_VERSION`, used by `.version()` of both the fresh `Command` and the global program in `index.ts`). Extra case (not a scenario): `CLI_VERSION` equals `version` in `packages/cli/package.json`

## 4. CLI: checks before connecting (TDD, design D3)

- [x] 4.1 RED → GREEN: test "Indexing is disabled before connecting without an allowed root"
- [x] 4.2 RED → GREEN: test "A path outside the allowed root is rejected before connecting"
- [x] 4.3 RED → GREEN: test "Missing configuration fails before connecting"
- [x] 4.4 RED → GREEN: test "On error stdout stays empty"
- [x] 4.5 RED → GREEN: test "A failure is logged with its code and exit"

## 5. CLI: transaction, report and log with fake ports (TDD, design D3–D6)

- [x] 5.1 RED → GREEN: test "A successful indexing commits and releases" (report written to stdout only after `commit`)
- [x] 5.2 RED → GREEN: test "A failed indexing rolls back and releases"
- [x] 5.3 RED → GREEN: test "Every redaction is logged without the secret" (synthetic AWS key id built by concatenation in the test, in one fake file and one fake commit message; the real `indexRepository` redacts them)
- [x] 5.4 RED → GREEN: test "An unexpected error is reported as INTERNAL"
- [x] 5.5 GREEN: default `OpenTransaction` in `compose-index.ts` (`pg.Client` with `connectionTimeoutMillis: 10_000`, `BEGIN`/`COMMIT`/`ROLLBACK`/`end()`, `connect` or `BEGIN` failure → CLI-local `DatabaseUnavailable`); default `ports` (real adapters, `store = client => createPostgresStore({ transaction: client })`). Extra cases (not scenarios): a rejected `rollback` does not hide the first error; a rejected `commit` → rollback attempted, exit `1`, stdout empty; `toCliError` for `INVALID_GRAPH` carries `details.violations`; `PROJECT_NAME_TAKEN` names the name as a JSON literal; a fake `sourceTree.realPath` that resolves the repository outside the root (symbolic-link escape caught by core) → exit `1`, `FORBIDDEN_PATH` naming the path as typed, `rollback` called
  - Extra cases also cover: `NotAGitRepository`/`EmptyRepository` with the real path never printed; an unknown option, a missing path and an extra argument as `USAGE` (`allowExcessArguments(false)`); arguments checked before the environment; a usage error logged with exit 2; `--json` on success is one JSON line.
- [x] 5.6 Entry point: `packages/cli/src/index.ts` delegates to `runIndexCommand(process.argv.slice(2), …)` when `process.argv[2] === 'index'` and sets `process.exitCode`; the global program keeps an `index` entry for `--help` only. Check by hand **with `dist/` removed** (design D10): delete `packages/*/dist` and `packages/*/*/dist`, then `npm run cli -- --help` lists `index`, `npm run cli -- --version` prints `CLI_VERSION`, `npm run cli -- projects` still prints its stub, and `npm run cli -- index acme-shop --name … --language php` against a scratch allowed root (copy of acme-shop with its history, `DATABASE_URL` of the local database) exits `0` — proving the CLI and the analyzer's wasm assets load from sources; delete the scratch project by name afterwards. Restore the build output with `npx tsc --build --force` (a plain `tsc --build` reports "up to date" and leaves `dist/` missing)
  - Checked 2026-10-07 with every `packages/*/dist` and `packages/*/*/dist` moved to the scratchpad (the repository hook blocks `rm -rf`; moving them away is equivalent here): `--help` lists `index`, `--version` prints `0.0.1`, `projects` prints its stub (exit 0 each); `index acme-shop --name dis86-check --language php` on a scratch root exits 0 (53 files, 121 symbols, 32 commits, edges 170/137/33, `laravel (detected)`, one `secret_redacted` line for `config/services.php:21`, no `AKIA` in either stream). Project deleted by name (counts back to 0/0/0); build output restored with `npx tsc --build --force`; the built `node packages/cli/dist/index.js index --version` also works.
- [x] 5.7 Prove key tests can fail: back up each file to the scratchpad, mutate with a node script whose anchor must match once, run, restore and confirm with `cmp`: (1) drop `outputError: () => {}` → "A missing or blank name is a usage error" fails; (2) write the report before `commit` → "On error stdout stays empty" or a commit-failure extra case fails; (3) print `error.message` for `NotAGitRepository` → "An unexpected error is reported as INTERNAL" or the step 6 path scenarios fail; (4) remove the C1 range from `escapeLiteral` → "Diagnostics and skipped paths are escaped" fails. Record the results for the step 9 report
  - Run 2026-10-07; each anchor matched once, each file restored and confirmed with `cmp`: (1) `outputError` removed → "A missing or blank name is a usage error" fails (plus the unknown-option extra case); (2) commit not awaited (`void transaction.commit()`, so the report is printed before the commit settles) → extra case "rolls back, exits 1 and prints nothing when the commit fails" fails; (3) `NOT_A_GIT_REPOSITORY` reuses `error.message` → extra case "reports a missing repository and an empty one by the path as typed…" fails (the unit-level guard; the step 6 scenarios check it end to end); (4) C1 range removed from `escapeLiteral` → "Diagnostics and skipped paths are escaped" fails. 29/29 green after restore.

## 6. Integration: acme-shop and real failures (design D4)

- [x] 6.1 Create `tests/integration/cli/index-command.spec.ts`: `beforeAll` copies `fixtures/acme-shop` without `.git` under the OS temp dir `T` and runs `buildOne` (template `tests/integration/index/acme-shop.spec.ts`; never in `fixtures/`), and creates `T/no-repo` and `T/vacio` (`git init`, no commit); `describeWithDatabase` + `useTransactionPerTest`; a savepoint `OpenTransaction` over `db()` (`SAVEPOINT cli_index` / `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT`, `release` no-op); `INDEXING_TIMEOUT_MS = 60_000`. RED → GREEN: test "acme-shop is indexed and its report printed"
  - The seven scenarios were written against the code of 3.2, so each was green on its first run (30.5 s for the file). That they can fail: with `EMPTY_REPOSITORY` reusing `error.message`, "A repository without commits is reported by the path as typed" fails (1 failed); file restored and checked with `cmp`.
- [x] 6.2 RED → GREEN: test "An explicit framework wins and --json prints the full report"
- [x] 6.3 RED → GREEN: test "A taken name rolls back and keeps the first project"
- [x] 6.4 RED → GREEN: test "An allowed root that does not exist is detected inside the transaction"
- [x] 6.5 RED → GREEN: test "A directory that is not a repository is reported by the path as typed"
- [x] 6.6 RED → GREEN: test "A repository without commits is reported by the path as typed"
- [x] 6.7 RED → GREEN: test "An unreachable database is reported without its URL" (default factory, `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`; needs no database, but lives here because it opens a real socket)
- [x] 6.8 Run `tests/integration/cli` twice to check for flakiness (temporary directory realpath on Windows, Git timing)
  - Two more runs: 7/7 passed each (32.59 s, 32.76 s).

## 7. Privacy and ethics check

- [x] 7.1 Run `/privacy-ethics-check` over the diff (stdout/stderr content, error messages, log lines, database URL handling, test literals). Record the outcome in the step 9 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)
  - PASS (2026-10-07), four Low notes, none needing action: redaction log lines carry path/sha/line/column/rule, never the value; messages use the path as typed, never the real path, the database URL or an unknown error text (INTERNAL loses debug detail, accepted in design Risks); untrusted repository strings escaped; only synthetic test literals (grep for emails, phones, Authorization, JWT, private keys: only the placeholder UUID). `pg`/`@types/pg` were already in the lock (deduped). Not assessed: `.env.example` (deny rule). Full table in the step 9 report.

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Identify tests affected by the change: none expected (no change in `packages/core` or adapters). Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only the three new spec files appear
  - Only the three new spec files plus `tests/tsconfig.json` (the `paths` of task 1.2) changed under `tests/`.
- [x] 8.2 Update affected tests without weakening their assertions (none expected). Confirm that every `#### Scenario:` of `openspec/changes/cli-index-command/specs/cli-indexing/spec.md` (21) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)
  - No existing assertion touched. 21/21 scenario titles match exactly one test each. One title clashed with a `repository-indexing` scenario of core ("Indexing is disabled without an allowed root"); renamed in the spec, the test and 4.1 to "Indexing is disabled before connecting without an allowed root". No other title exists in `openspec/specs/`.

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: `git status --porcelain fixtures` (empty), `git ls-files -s fixtures | sha1sum`, `SELECT count(*) FROM project` and `SELECT count(*) FROM commit` on the local database
  - Same as 0.5: fixtures clean, checksum `b97101fe…`, `project` 0, `commit` 0.
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/cli tests/integration/cli`, twice
  - Twice: 3 files, 36 passed (33.86 s, 33.71 s).
- [x] 9.3 Extend `stryker.config.json` (design D9): `mutate` adds `packages/cli/src/**/*.ts` and `!packages/cli/src/index.ts`; `disableTypeChecks` = `{packages/core,packages/cli}/src/**/*.ts`; confirm `vitest.stryker.config.ts` still excludes `tests/integration/**`
  - `mutate` adds `packages/cli/src/**/*.ts` and `!packages/cli/src/index.ts`; `disableTypeChecks` = `{packages/core,packages/cli}/src/**/*.ts`; `vitest.stryker.config.ts` still excludes `tests/integration/**` (unchanged).
- [x] 9.3b CI (design D9): add `'packages/cli/**'` to the `business` paths filter of `.github/workflows/ci.yml`, so a later change touching only the CLI still runs mutation testing; the PR's CI run (11.2) confirms the workflow still parses and the mutation step ran
  - `'packages/cli/**'` added to `business`, and the filter comment updated. Workflow parse is confirmed by the PR's CI run (11.2).
- [x] 9.4 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/cli/src/**/*.ts,!packages/cli/src/index.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones with extra cases). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
  - Final: `npx vitest run` 44 files, 641 passed (65.23 s); no-DB run 30 files, 428 passed; lint 0 errors (1 pre-existing warning); typecheck green; architecture 0 errors (4 pre-existing warnings); docs:coverage exit 0 (its entry for `packages/cli` is `src/index.ts`, which exports nothing, so the gate does not reach the CLI modules; they carry JSDoc anyway). Stryker on `packages/cli`: 80.69 % first run → 91.85 % after extra cases for the meaningful survivors (help text, exact usage message, trimmed root, undefined config, lookalike domain error, refused default connection, created project, default ports). Remaining 12 survived + 7 no-coverage listed in the step 9 report: equivalent, or the success path of the default transaction (needs Postgres; covered by integration and the manual demo).
- [x] 9.5 Verify the post-test state matches the baseline (same checksum, `git status --porcelain fixtures` empty, same `project` and `commit` counts: the harness rolled everything back). Restore and document if not
  - Identical to the baseline: fixtures clean, same checksum, `project` 0, `commit` 0.
- [x] 9.6 Create the report `openspec/changes/cli-index-command/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6. Include the baseline of 0.5, the forced failures of 5.7, the Stryker score and the privacy check of 7.1
  - Report `reports/2026-10-07-9-test-and-state-verification.md`.
- [x] 9.7 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Note the current state (9.1 indicators). Delete `packages/*/dist` and `packages/*/*/dist` before the first command (design D10: `npm run cli` must not depend on build output); restore with `npx tsc --build --force` in 10.6. Prepare a scratch allowed root under the OS temp dir with a copy of acme-shop and its history (`buildOne`), plus `no-repo` and `vacio`; export `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` (scratch value) and `DATABASE_URL`
  - Counts 0/0/0; scratch root `<scratch>/root` (acme-shop with history, `no-repo`, `vacio`); every `dist/` moved to the scratchpad (hook blocks `rm -rf`).
- [x] 10.2 Exercise the success path with the real entry point: `npm run cli -- index acme-shop --name dis86-demo --language php`, then the same with `--framework none --json` and another name; record exit codes, stdout, stderr (progress, `secret_redacted` lines) and the stored projects (`SELECT name, framework, indexed_commit FROM project`)
  - Exit 0 for text and `--json`; both projects stored with `indexed_commit` = `HEAD`, frameworks `laravel` / `none`.
- [x] 10.3 Mutating operations: the command commits by design. Restore the state afterwards by deleting the demo projects by name (the schema cascades), and confirm the `project` and `commit` counts equal the 10.1 baseline
  - DELETE 2 by name; counts back to 0/0/0.
- [x] 10.4 Exercise the error cases: empty `ALLOWED_REPOS_DIR` (with and without `--json`), `../etc`, `/tmp/otro`, `--language cobol`, `--language typescript`, `--framework symfony`, no `--name`, `--name '   '`, `no-repo`, `vacio`, a repeated name, empty `AUTHOR_HASH_SALT`, `DATABASE_URL` to port 1, `--help`, `--version`; record each exit code and the error line, and check that no output contains the planted key, the real path of the scratch root or the database URL/password
  - All 17 error/help cases behave as specified (table in the report). Git Bash rewrites `/tmp/otro` before the CLI sees it; rerun with `MSYS_NO_PATHCONV=1` names `"/tmp/otro"`.
- [x] 10.5 Document every command and output in `openspec/changes/cli-index-command/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths); run `/show-spec-working` for the evidence of the PR
  - Reports `reports/2026-10-07-10-manual-interface-testing.md` (full transcript, masked) and `reports/2026-10-07-show-spec-working.md` (19/21 scenarios through the real CLI, incl. a `git mktree` repo with an ESC in a path printed as `\u001b`; the other two by unit tests).
- [x] 10.6 Verify the state matches the pre-test state (9.1 indicators); restore the build output with `npx tsc --build --force` and confirm `packages/core/dist/index.js` exists
  - Counts 0/0/0, fixtures clean; build output restored with `npx tsc --build --force`, `packages/core/dist/index.js` present.

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 The interface is a CLI, already driven end to end through the real entry point in step 10; no web or HTTP change. Record "covered by step 10; no browser UI", with that reason, in the step 9 report
  - Recorded in the step 9 report: covered by step 10 through the real entry point; no browser UI.
- [x] 11.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the three new spec files ran (the integration one with Postgres and Git) and passed, and that the mutation step ran and covers `packages/cli` (`business` filter, 9.3b). Link the run in the step 9 report
  - Run 37667562708 on `d9ed31a` passed: the three CLI spec files ran (integration with Postgres and Git), 644 passed + 1 skipped; mutation covered `packages/cli` at 91.74 %. Linked in the step 9 report.

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `docs/project-context.md`: replace "nothing outside tests calls it yet (the CLI command is DIS-86)"; add a gotcha with the command contract (streams, `--json`, exit codes, error table, `OpenTransaction` and the savepoint test factory, the `ports` seam), the trimmed `ALLOWED_REPOS_DIR` read only in `compose-index.ts`, and D7 (allowed root writable only by the Codemind user, trusted repositories only); update the Stryker line (`packages/cli` mutated, `business` CI filter) and the gotcha on workspace resolution (aliases/paths for the three packages, `tsconfig.run.json`, the `tsbuildinfo` trap of D10)
  - Commands (CLI script and `tsconfig.run.json`, Stryker targets + `business` filter), the mid-build gotcha (the CLI is now the caller), the `ALLOWED_REPOS_DIR` constraint with D7, and a new gotcha on the `index` contract (order, transaction, streams, error mapping, escaping, test seams, savepoint factory, the three source mappings and the `tsbuildinfo` trap).
- [x] 12.2 `docs/DEPLOYMENT.md`: it does not mention `ALLOWED_REPOS_DIR` today; add it with `AUTHOR_HASH_SALT` and `DATABASE_URL` for indexing, and the D7 requirement
  - Section "Indexing a repository (CLI)": the three variables, the D7 requirement and the exit-code / error contract.
- [x] 12.3 `readme.md` «Camino completo»: indexing needs neither PHP nor an LLM (web-tree-sitter); the path must be inside `ALLOWED_REPOS_DIR` (relative to it, or absolute inside it); list the exit codes briefly. Check that `.env.example` documents `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL` (ask the author to show it if the deny rule blocks reading it)
  - readme: indexing needs neither PHP nor an LLM, the path must be inside `ALLOWED_REPOS_DIR`, exit codes; env table gains `AUTHOR_HASH_SALT` and the `ALLOWED_REPOS_DIR` trust requirement. `.env.example` (shown by the author, a deny rule blocks reading it) documents `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL`; its `ALLOWED_REPOS_DIR` comment does not state the trust requirement (D7), which lives in `docs/DEPLOYMENT.md` and the readme.
- [x] 12.4 No ADR (design D10); confirm nothing in the implementation contradicted that
  - No ADR: every decision stayed local to `packages/cli` and its test/run wiring; nothing contradicted D10.
- [x] 12.5 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
  - `/update-docs`: also fixed the stale "`@codemind/core` resolves to its sources in tests" gotcha (now four packages, `tsconfig.run.json` for `npm run cli`) and the `cli/` line of the readme package tree. Checked, no change: data model (no migration), API spec (no route; `docs/api` is generated), standards, `docs/TESTING.md`, `docs/DEMO.md`, `fixtures/README.md`. `docs:coverage` exit 0. `prompts.md` §30 (2 literal prompts) + Índice entry 30.
- [x] 12.6 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed, the new dependencies of `packages/cli` justified and the Stryker score. After verification, set DIS-86 to In Review in Linear with a comment in Spanish linking the PR and the change
  - `reports/pr-description.md` (Spanish, the author's Why, the dependencies, Stryker); PR #24 against `feature/entrega-2-CRN`, body updated after the review rounds; DIS-86 In Review with Spanish comments linking the PR and the change.
- [x] 12.7 At archive time, run the archive ritual: close or reassign the 5 inbound notes of DIS-86 (DIS-84, DIS-85 ×3, DIS-96), noting for each where it was resolved (trim + composition root, transaction contract, structured log, path privacy, escaping, D7), and classify every review gap (A/B/C/D)
  - Inbound: the 5 notes answered in their threads on DIS-86 (closed, or D7). Outbound: C → DIS-100 (C1, bidi and format characters in core paths), the rest D; design.md → Follow-ups.

## 13. Review round: /verify-against-spec and /adversarial-review

- [x] 13.1 Run `/verify-against-spec` and `/adversarial-review` on the change; classify each finding (fix here, author decision, or process note)
  - verify: all requirements implemented, 21/21 scenarios with a test; gaps 2.1–2.4 and 10 unspecified behaviours. adversarial: PASS WITH GAPS, one Major (DEL/C1 raw in the log, `--json` and error line), Minors, two questions. Table in the step 9 report.
- [x] 13.2 Spec first: widen "Untrusted strings are printed escaped" to every output; `INTERNAL` message `unexpected error; the project may have been saved` when the commit or anything after it fails; redaction lines only after the commit. Three scenarios added (24 in total)
- [x] 13.3 RED → GREEN for the two behaviour changes: `safe-json.ts` (`toTerminalSafeJson` in the logger, `--json` and the error line) and `CommitUncertain`; "A failed indexing logs no redaction" pins existing behaviour
  - RED: raw `\u009b` in `--json` stdout; old `nothing was saved` message. GREEN: `tests/unit/cli` 36 passed.
- [x] 13.4 Strengthen the weak tests: the acme-shop integration copy gets one commit whose message holds a concatenated key (the commit-log check is no longer 0 == 0, nor read from the unspecified `redactions:` line); `stdout === ''` for `--framework symfony`; newline-in-entry checked line by line; file `column: 19`
  - Forced failures: skipping the first commit event fails the integration scenario; un-escaping `\n` in skipped paths fails the render scenario.
- [x] 13.5 Record the author decisions in `design.md` (D8 widened, D11 behaviour beyond the spec, Risks: commit uncertainty, redaction logging, `codemind help index`)
- [x] 13.6 Rerun the gates and the real CLI; update the step 9 and show-spec-working reports
  - 44 files, 644 passed; lint/typecheck/architecture/docs green (pre-existing warnings only); Stryker `packages/cli` 91.74 % (222/13/7); real CLI on a repo with a C1 file name: escaped, no raw C1/DEL, no key; state back to baseline.
- [x] 13.7 Linear: comment in Spanish on DIS-86 with the changed rules and figures
- [x] 13.8 Second pass of `/verify-against-spec` (full spec) and `/adversarial-review` (uncommitted diff only); classify the findings
  - verify: 24/24 scenarios with a test; partial 2.1 (a failed release after the commit), weaker checks 2.2/2.3, items 9–11 of block 3. adversarial: PASS WITH GAPS, no Major, five Minors and one question. Table in the step 9 report.
- [x] 13.9 Spec: a failed release is ignored (author decision); scenario "A failed release after a commit is ignored" (25 in total), pinning existing behaviour — removing the `.catch` on `release()` fails it
- [x] 13.10 Fixes without a rule change: de-duplicate the show-spec-working tail; `commit.gpgsign=false` on the integration commit; the `--json` integration scenario compares commit log lines with `report.commitEvents.length`; the control-characters scenario checks `source`, `line` and `rule`; "A failed indexing logs no redaction" shown through the real CLI
- [x] 13.11 Design: the closed-stdout claim corrected (EPIPE is asynchronous, D11; author decision); a `COMMIT` rejected by the server is accepted as "may have been saved" (Risks); bidi/format characters out of scope (D8, archive classification); `-h`, swallowed rollback/release errors and stderr failures (D11)
- [x] 13.12 Rerun the gates; update the step 9 report and the PR description; Linear comment for the release rule and the new figures
  - 645 passed; Stryker 91.74 % (unchanged); a stop-hook run timed out once in `git-source-tree.spec.ts` under Stryker load, green alone (18/18) and in a full run right after.
