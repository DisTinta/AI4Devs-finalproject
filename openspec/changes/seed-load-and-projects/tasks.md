## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-92 to In Progress in Linear right away, with a short comment in Spanish (change name `seed-load-and-projects` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-91 (`packages/cli/src/seed-build.ts` and the real `seeds/graph-dump.sql` exist there). If not, stop and ask the author
- [x] 0.3 Create feature branch `feature/DIS-92-seed-load-and-projects` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/seed-load-and-projects/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: `docker compose up -d`, `DATABASE_URL` exported, `npm run db:migrate`; run `npx vitest run` once, green, and record the totals for the step 11 report; record `git status --porcelain fixtures seeds packages/web` (must be empty), `sha1sum seeds/graph-dump.sql`, and `SELECT id, name, is_sample, node_count, edge_count FROM project ORDER BY name` on the local database

## 1. Adapter: seed loading (design D1, D2)

- [x] 1.1 Create `packages/adapters/store-postgres/src/load-seed.ts` with `loadSeed(client, { sql, projectNames })` and the `LoadedSample` type, in the order of design D1 (delete samples → name check with a parameterised `= ANY($1)` → throw `ProjectNameTaken` → execute the seed → select the samples ordered by `name COLLATE "C"`); no `BEGIN`/`COMMIT`; JSDoc on every export. Re-export both from `packages/adapters/store-postgres/src/index.ts`. Covered by the step 4 integration tests (adapter outside Stryker's `mutate`); `npm run typecheck` and `npm run lint:architecture` green

## 2. CLI: seed parser (TDD, design D7)

- [x] 2.1 Create `tests/unit/cli/seed-parse.spec.ts`. RED (not a scenario, it backs D7): `seedProjects` over the output of `renderSeedDump` for hand-built `SeedRows` (two files, symbols in both, edges, commits) returns one entry with the derived id, name, language, framework and the four counts, symbols attributed through `file_id`. See it fail (module missing)
- [x] 2.2 GREEN: `packages/cli/src/seed/parse-seed.ts` with `seedProjects(sql)` reading only format 1 (columns located by the statement's own column list; `'…'` with `''`, `E'…'`, `NULL`, numbers, booleans). Extra cases: a `framework` `NULL` → `null`; a name with `''`; an unreadable `INSERT` line throws; header comments and blank lines are ignored

## 3. CLI: `db:seed` command (TDD, design D1)

- [x] 3.1 Create `tests/unit/cli/seed-load.spec.ts` with in-memory streams and a fake `OpenTransaction` recording `open`/`commit`/`rollback`/`release` (pattern of `tests/unit/cli/seed-build.spec.ts`). RED: test "Missing database configuration fails before connecting" (seed-load spec). See it fail
- [x] 3.2 GREEN: `packages/cli/src/seed-load.ts` with `runSeedLoad(deps)` in the order of design D1, error mapping, `displayPath` for the seed, summary lines (`1 project loaded` / `N projects loaded`, then `  <name>  <language>/<framework|->  <n> nodes · <m> edges`), entry-module guard like `seed-build.ts`
- [x] 3.3 RED → GREEN: test "An invalid seed file fails before connecting" (missing, empty, no format line, format 2, valid header without `INSERT INTO project`, valid header with an unreadable statement; seeds under the OS temp dir; the fake factory is never opened). Extra cases (not scenarios): `2 projects loaded` for 2 loaded samples with a fake `loadSeed` result; a framework `null` prints `-`; a rejected `commit` → `INTERNAL` `unexpected error; the seed may have been loaded`; any other error → `rollback` + `release` and `INTERNAL` `seed load failed; the database is unchanged`; `ProjectNameTaken` → `PROJECT_NAME_TAKEN` with `details.name`
- [x] 3.4 Root `package.json`: `"db:seed": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts"`

## 4. Integration: `db:seed` (design D1, D2)

- [x] 4.1 Create `tests/integration/cli/seed-load.spec.ts`: `describeWithDatabase` + `useTransactionPerTest`; savepoint `OpenTransaction` over `db()` (pattern of `tests/integration/cli/index-command.spec.ts`); each test first runs `DELETE FROM project` on `db()` (reverted with the test) so the local `make up` data never interferes; the real `seeds/graph-dump.sql`. RED → GREEN: test "The seed is loaded into an empty database" (exact two stdout lines; `getProject`; row counts per table against `seedProjects` and the seed's `file_commit` count; `findSymbols(id, 'Checkout')` non-empty)
- [x] 4.2 RED → GREEN: test "Loading again changes nothing and keeps the user's projects" (a non-sample project saved through the store with a small graph from `tests/support/sample-graph.ts`; compare ids and per-table counts before and after the second load)
- [x] 4.3 RED → GREEN: test "A user project named acme-shop is left intact"
- [x] 4.4 RED → GREEN: test "An unreachable database is reported without its URL by the seed load" (default factory, `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`)
- [x] 4.5 After 5.4: run `tests/integration/cli/seed-load.spec.ts`, `tests/integration/cli/projects-command.spec.ts` and `tests/integration/cli/seed-build.spec.ts` together, twice, against a populated local database (acme-shop from `make up` plus one committed own project); if lock waits or deadlocks appear, serialise the three with `poolMatchGlobs` / `fileParallelism` and record it in design → Risks

## 5. CLI: `projects` command (TDD, design D4, D6)

- [x] 5.1 Create `tests/unit/cli/projects-command.spec.ts`. RED: test "Configuration, connection and usage errors" (cli-projects spec: unset and `'   '` `DATABASE_URL` without opening the fake factory; the real default factory against `127.0.0.1:1`; `projects extra` and `projects --json` → exit `2`, `USAGE`; one error line each, stdout empty; `--help` with `DATABASE_URL` unset → exit `0`, help on stdout, stderr empty, factory never opened). See it fail
- [x] 5.2 GREEN: `packages/cli/src/commands/projects.ts` with `runProjectsCommand(argv, deps)` and the pure `formatProjectLine(project)` (design D4); delegate `projects` in `packages/cli/src/index.ts` like `index`, keeping a `projects` entry in the global program only for `--help`. Extra cases (not scenarios): `formatProjectLine` for a project without framework, never indexed, sample and non-sample; an unexpected store error → `INTERNAL` `unexpected error; nothing was changed`, with `rollback` and `release`; a successful run calls `rollback`, never `commit`
- [x] 5.3 Create `tests/integration/cli/projects-command.spec.ts` (harness savepoint, `DELETE FROM project` first). RED → GREEN: test "Sample and user projects are listed" (load the seed with `loadSeed` on `db()`, create one indexed project and one never-indexed project through the store; compare every line in full; per-table counts unchanged after the command)
- [x] 5.4 RED → GREEN: test "An empty database lists no projects"

## 6. CLI: sample-project constant in `seed:build` (TDD, design D3)

- [x] 6.1 Create `tests/unit/cli/seed-render-sample-projects.spec.ts`. RED: test "The constant does not depend on row order" (seed-build spec). See it fail
- [x] 6.2 GREEN: `packages/cli/src/seed/render-sample-projects.ts` with `renderSampleProjects(rows, projectName)` producing exactly the spec's template (LF, final line feed). Extra cases (not scenarios): framework `null` without quotes; a name with `'` and `\` escaped; the id equals `seedId(projectKey(projectName))`, the one `renderSeedDump` writes
- [x] 6.3 Update every successful-build test in `tests/unit/cli/seed-build.spec.ts` and `tests/integration/cli/seed-build.spec.ts` to pass a temporary `sampleProjectsPath` (design D3 rule) before touching `runSeedBuild`, and extend "Missing configuration fails before anything else" with a previous constant of known content that must stay unchanged (modified scenario). Between 6.3 and 6.4 `npm run typecheck` fails on purpose (`sampleProjectsPath` is not yet a property of `SeedBuildDeps`); it is green again at the end of 6.4. Vitest still runs (it does not type-check); confirm `git status --porcelain packages/web seeds` stays empty
- [x] 6.4 RED → GREEN in `tests/unit/cli/seed-build.spec.ts`: test "A failed write of the constant leaves both files intact" (`sampleProjectsPath` inside a directory that does not exist; previous constant and seed with known content; no `.*.tmp` next to either). Then `runSeedBuild` gains `sampleProjectsPath` and writes the constant first (design D3)
- [x] 6.5 RED → GREEN: test "A failed write of the seed after the constant is a partial write" (`outputPath` inside a missing directory, constant in a temp dir; exact message and `details` with `displayPath` names; no absolute path, no `may have been saved`; the constant holds the new text)
- [x] 6.6 RED → GREEN in `tests/integration/cli/seed-build.spec.ts`: test "The sample-project constant is generated" (constant to a temporary file; exact text; id equals the seed's project id; counts equal the stdout line's; stdout unchanged)
- [x] 6.7 Prove key tests can fail: back up each file to the scratchpad, mutate with a node script whose anchor must match once, run, restore and confirm with `cmp`: (1) write the seed before the constant → 6.4 fails; (2) report the seed-write failure as `INTERNAL` → 6.5 fails; (3) `loadSeed` without the `DELETE` → 4.2 fails; (4) `formatProjectLine` with one space between fields → 5.3 fails. Record the four failures in the step 11 report

## 7. Seed and constant regeneration, coherence (design D1, D3, D8)

- [x] 7.1 Create `tests/unit/seed/sample-projects-coherence.spec.ts` with test "The versioned constant matches the versioned seed" (imports `packages/web/src/data/sample-projects.ts`, parses `seeds/graph-dump.sql` with `seedProjects`). RED: it fails because the constant does not exist yet
- [x] 7.2 Regenerate: preconditions `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing; load the author's `.env` without printing it (`set -a; . ./.env; set +a`); `npm run seed:build`. GREEN: 7.1 passes; `git diff seeds/graph-dump.sql` changes only the `analyzer-fingerprint` line (rows identical); `packages/web/src/data/sample-projects.ts` created
- [x] 7.3 Create `tests/unit/seed/sample-projects-lint.spec.ts` with test "The generated constant passes lint and type checks" (ESLint Node API `lintFiles` with the repository config: not ignored, zero messages; no `eslint-disable` in the text; TypeScript compiler API with the options of `packages/web/tsconfig.json`: zero diagnostics), with an explicit timeout (`60_000`; ESLint with typescript-eslint and the compiler API are slow, well above Vitest's 5 s default). RED first by linting a copy with a deliberate unused variable in the scratchpad, then GREEN on the versioned file

## 8. Privacy and ethics check

- [x] 8.1 Run `/privacy-ethics-check` over the diff, the regenerated seed and the constant (no secret, no real path, no author name or e-mail, no database URL in any output of `db:seed`, `projects` or `seed:build`). Record the outcome in the step 11 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 9. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 9.1 Identify tests affected by the change: `tests/unit/cli/seed-build.spec.ts` and `tests/integration/cli/seed-build.spec.ts` (new `sampleProjectsPath` seam, 6.3); `tests/unit/cli/index-command.spec.ts` if it covers `packages/cli/src/index.ts` dispatch. Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that nothing else changed
- [x] 9.2 Update affected tests without weakening their assertions. Confirm that every `#### Scenario:` of the three delta specs (`seed-load` 6, `cli-projects` 3, `seed-build` 11: the 5 copied from the main spec keep their existing tests, "Missing configuration fails before anything else" extended in 6.3; the 6 new ones get the tests of steps 6 and 7) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)

## 10. Docs and gates before verification

- [x] 10.1 `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` green; JSDoc on every new export

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 11.1 Capture the pre-test baseline: the 0.5 indicators (`git status --porcelain fixtures seeds packages/web`, `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, the local `project` rows)
- [x] 11.2 Run the targeted tests: `npx vitest run tests/unit/cli tests/unit/seed tests/integration/cli`, twice
- [x] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/cli/src/seed-load.ts,packages/cli/src/commands/projects.ts,packages/cli/src/seed/render-sample-projects.ts,packages/cli/src/seed/parse-seed.ts,packages/cli/src/seed-build.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones with extra cases)
- [x] 11.4 Verify the post-test state matches the baseline (tests never touch `fixtures/`, `seeds/` or `packages/web/`; the local `project` rows unchanged). Restore and document if not
- [x] 11.5 Create the report `openspec/changes/seed-load-and-projects/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the forced failures of 6.7, the Stryker score and the privacy check of 8.1
- [x] 11.6 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 Note the current state (11.1 indicators). Export `DATABASE_URL` of the local compose database
- [x] 12.2 `npm run db:seed` twice: exit `0`, stdout exactly `1 project loaded` and `  acme-shop  php/laravel  174 nodes · 170 edges` both times, stderr empty; `SELECT` shows acme-shop with `is_sample = true` and the same id both times
- [x] 12.3 `npm run cli -- projects`: the acme-shop line in full; with an own project indexed first (`npm run cli -- index acme-shop --name dis92-manual --language php` with `ALLOWED_REPOS_DIR` at a temp copy) its line ends with its `indexedAt`; then `npm run db:seed` again keeps `dis92-manual` (same id and counts)
- [x] 12.4 Error cases: `db:seed` with empty `DATABASE_URL`, with port 1 (no URL or password in any output), and with a non-sample `acme-shop` (delete the loaded sample with `psql`, then create a non-sample project named `acme-shop` through `npm run cli -- index`) → `PROJECT_NAME_TAKEN`, database unchanged; `projects extra` → exit `2`
- [x] 12.5 `make up` in Git Bash: the `db:seed` part prints `1 project loaded` and the acme-shop line; stop `npm run dev` afterwards
- [x] 12.6 Restore the state: delete `dis92-manual` and the manual non-sample `acme-shop`, run `npm run db:seed` so the local database holds the sample as at baseline (or restore the baseline rows if it held none); check the 11.1 indicators
- [x] 12.7 Document every command and output in `openspec/changes/seed-load-and-projects/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths)

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 13.1 No user interface reads the constant yet (DIS-60): the commands were driven end to end in step 12. Record "covered by step 12; no browser UI", with that reason, in the step 11 report
- [x] 13.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the new spec files ran (the integration ones with Postgres) and passed, and that the mutation step covered `packages/cli`. Link the run in the step 11 report

## 14. Update Technical Documentation (MANDATORY)

- [x] 14.1 `docs/project-context.md`: `db:seed` and `projects` are no longer placeholder/stub (lines ~96, ~106–110, ~524); gotcha for D1 (regenerate the seed and the constant after any change to a fingerprint input, as the last commit before the PR and after every review round); each `db:seed` / `make up` deletes by `CASCADE` the `query_log`, `claim`, `evidence` and `cache_entry` rows of the sample projects (D2); the `make up` line differs from `readme.md` §1.4 until CM-HU-18 (D5); the `sampleProjectsPath` rule for tests (D3)
- [x] 14.2 `readme.md` §1.4: check that nothing states `db:seed` is a placeholder; do not rewrite the "2 projects" output (PH-02)
- [x] 14.3 No ADR (design D9); confirm nothing in the implementation contradicted that
- [x] 14.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 14.5 If any change after 7.2 touched a fingerprint input, rerun 7.2 so the regeneration is the last commit; `git diff --exit-code seeds/ packages/web/src/data/` after a second `npm run seed:build` is clean
- [x] 14.6 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed and the Stryker score; after verification, set DIS-92 to In Review in Linear with a comment in Spanish linking the PR and the change

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 15.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/seed-load-and-projects/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [x] 15.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, regenerate the seed and the constant again as the last commit (14.5)
- [x] 15.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 15.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
