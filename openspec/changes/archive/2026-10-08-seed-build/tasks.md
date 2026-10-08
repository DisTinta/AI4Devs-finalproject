## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-91 to In Progress in Linear right away, with a short comment in Spanish (change name `seed-build` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-86 (`packages/cli/src/compose-index.ts` exists there) and DIS-98. If not, stop and ask the author
- [x] 0.3 Create feature branch `feature/DIS-91-seed-build` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions), carrying the untracked `openspec/changes/seed-build/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: `docker compose up -d`, `DATABASE_URL` exported, `npm run db:migrate`; run `npx vitest run` once, green, and record the totals for the step 9 report; record `git status --porcelain fixtures seeds` (must be empty), `git ls-files -s fixtures | sha1sum`, `sha1sum seeds/graph-dump.sql`, and `SELECT count(*), array_agg(id ORDER BY id) FROM project` on the local database

## 1. Fixture tooling: quiet `buildOne` (design D8)

- [x] 1.1 `fixtures/build-history.mjs`: `buildOne(name, cfg, { log = console.log } = {})`, the summary line goes through `log`; JSDoc updated. `node fixtures/build-history.mjs acme-shop` still prints its line; `npx vitest run tests/integration/git/build-history.spec.ts tests/integration/index` green; `git status --porcelain fixtures` shows only `build-history.mjs`

## 2. CLI: deterministic ids (TDD, design D4)

- [x] 2.1 Create `tests/unit/cli/seed-deterministic-ids.spec.ts` (AAA, no I/O). RED: test "Keys are prefixed by the project name". See it fail (module missing)
- [x] 2.2 GREEN: `packages/cli/src/seed/deterministic-ids.ts` with `SEED_ID_NAMESPACE`, `KEY_SEPARATOR` (`\u0000`, JSDoc explaining why it cannot occur), `uuidV5(namespace, name)` over `node:crypto` SHA-1, and the key builders for project, file, symbol, commit, edge endpoint and edge. Extra case (not a scenario): the published vector `uuidV5(NAMESPACE_DNS, 'python.org')` = `886313e1-3b8a-5372-9b90-0c9aee199e5d`; version nibble `5` and RFC 4122 variant

## 3. CLI: rendering the dump (TDD, design D4, D5)

- [x] 3.1 Create `tests/unit/cli/seed-render-dump.spec.ts` with a small hand-built `SeedRows` (one project, two files, symbols, edges symbol→symbol and file→symbol, two commits, file–commit links; random ids from `randomUUID`). RED: test "Ids derive from natural keys, not from the database". See it fail
- [x] 3.2 GREEN: `packages/cli/src/seed/render-dump.ts` with `renderSeedDump(rows, fingerprints, projectName)`: header, id remapping, sample attributes (`is_sample`, `root_path = 'fixtures/<projectName>'`, dates from the `HEAD` commit, counters from the rendered rows), column lists, FK order, natural-key ordering by code unit, LF and trailing LF. Define the `SeedRows` type where both the adapter and the CLI can import it (the adapter exports it, design D2)
- [x] 3.3 RED → GREEN: test "Identical edges get distinct ids whatever the row order" (several permutations; `#0`/`#1` suffixes; weight ordering with `null` first)
- [x] 3.4 RED → GREEN: test "Values are written in canonical form" (`toISOString`, `String(n)`, `NULL`, `''` doubling, `E'…'` with `\uXXXX` for controls except LF, no `\r` byte). Extra cases (not scenarios): a non-finite number and a reference to an unknown id throw; a missing `HEAD` commit throws; no `DELETE`/`ON CONFLICT`/`BEGIN`/`SET`/`embedding` in the output

## 4. CLI: fingerprints (TDD, design D6)

- [x] 4.1 Create `tests/unit/cli/seed-fingerprint.spec.ts`. RED: test "A fingerprint ignores line endings and listing order". See it fail
- [x] 4.2 GREEN: `packages/cli/src/seed/fingerprint.ts` with `fingerprint(inputs)` (sort by path, CRLF → LF, `path\0content\0`, `sha256:<hex>`)
- [x] 4.3 RED → GREEN: test "A fingerprint changes with content, files or parser versions"
- [x] 4.4 RED → GREEN: test "Each fingerprint covers exactly its declared inputs": `collectFingerprintInputs(repoRoot)` over a temporary tree under the OS temp dir (the three analyzer directories, `AnalyzerPort.ts`, two migrations `.up.sql` and one `.down.sql`, a minimal `package-lock.json`, `packages/api/src/x.ts`). Extra cases (not scenarios): a `.down.sql` change alters neither fingerprint; a lockfile without `node_modules/web-tree-sitter` throws; running it on the real repository root returns non-empty inputs including `deps:tree-sitter-php@0.24.2`

## 5. Adapter: row export (design D2)

- [x] 5.1 Create `packages/adapters/store-postgres/src/export-seed.ts` with `exportSeedRows(client, projectName)` and the `SeedRows` type (parameterised queries only; project by name; symbol rows joined with their file path; commit `committed_at` as `Date`); re-export both from `packages/adapters/store-postgres/src/index.ts`. Covered by the step 7 integration tests (no separate scenario); `npm run typecheck` and `npm run lint:architecture` green

## 6. CLI: transaction wrapper and command (TDD, design D1, D3, D7)

- [x] 6.1 Create `tests/unit/cli/seed-build.spec.ts` with in-memory streams, a fake `buildHistory` that records calls, a fake base `OpenTransaction` recording `open`/`commit`/`rollback`/`release` in one log, fake ports (pattern of `tests/unit/cli/index-command.spec.ts`) and a temporary output directory holding a previous seed with known content. RED: test "Missing configuration fails before anything else" (stderr holds exactly the error line, no progress lines). See it fail (module missing)
- [x] 6.2 GREEN: `packages/cli/src/seed/seed-transaction.ts` (`createSeedTransaction(base, read)`: `commit` = read then `inner.rollback()`, never `inner.commit()`) and `packages/cli/src/seed-build.ts` with `runSeedBuild(deps)` in the order of design D1, a no-op `onProgress` passed to `indexWithEnvironment`, the summary's `<output>` relative to `repoRoot` or the file name only when outside (design D1 → Streams), the error mapping of D3 (`INTERNAL` → `seed build failed; nothing was written`; `CommitUncertain` included), the atomic write of D7 and the summary line; script guard that runs it only when executed directly
- [x] 6.3 RED → GREEN: test "A failed indexing leaves the previous seed intact" (fake ports throw; log shows `rollback` and `release`, never `commit` of the base; no `.tmp` file left; stderr holds exactly one line and no progress lines)
- [x] 6.4 RED → GREEN: test "A failed read-back is not reported as saved" (fake `read` throws inside `commit()`; no output contains `may have been saved`). Extra cases (not scenarios): a successful run calls the base `rollback` and never its `commit`; a write failure (output directory removed before the write) → `INTERNAL`, no `.tmp` left; a domain error (`PROJECT_NAME_TAKEN` from a fake store) keeps its code and names `__codemind_seed_build__`
- [x] 6.5 Root `package.json`: `"seed:build": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-build.ts"`. `db:seed` stays the placeholder (DIS-92)
- [x] 6.6 Prove key tests can fail: back up each file to the scratchpad, mutate with a node script whose anchor must match once, run, restore and confirm with `cmp`: (1) `commit` of the wrapper calls `inner.commit()` → 6.4's extra case fails; (2) drop the `#n` suffix → "Identical edges get distinct ids whatever the row order" fails; (3) format dates with `toString()` → "Values are written in canonical form" fails; (4) skip CRLF normalisation → "A fingerprint ignores line endings and listing order" fails; (5) write the output directly instead of temp + rename → "A failed read-back is not reported as saved" or the write-failure case fails. Record results for the step 9 report

## 7. Integration: acme-shop seed (design D9)

- [x] 7.1 Create `tests/integration/cli/seed-build.spec.ts`: `beforeAll` copies `fixtures/acme-shop` without `.git` under the OS temp dir `T` (never `fixtures/`, PH-22); `fixturesRoot = T`; output to `T/out/graph-dump.sql`; real `repoRoot`; `describeWithDatabase` + `useTransactionPerTest`; savepoint base `OpenTransaction` over `db()`; generous timeout (`60_000`). RED → GREEN: test "The acme-shop seed is generated" (on success stdout is exactly one line ending in `-> graph-dump.sql`, since the output is outside `repoRoot`, and stderr is empty)
- [x] 7.2 RED → GREEN: test "Two consecutive builds produce identical files" (also asserts no seed id equals any `project`/`file`/`symbol` id in `db()`)
- [x] 7.3 RED → GREEN: test "The time zone does not change the file" (design D9: assert the offset changed first; `SET TIME ZONE 'America/Bogota'` on `db()`; restore `TZ`)
- [x] 7.4 RED → GREEN: test "An existing acme-shop project does not block the build" (create `acme-shop` on `db()` with the store first)
- [x] 7.5 RED → GREEN: test "The allowed repositories directory of the environment is ignored"
- [x] 7.6 RED → GREEN: test "The database is unchanged after a build" (default base on `DATABASE_URL`; project ids read through a separate client before and after; no `__codemind_seed_build__` remains)
- [x] 7.7 RED → GREEN: test "An unreachable database is reported without its URL by the seed build"
- [x] 7.8 Run `tests/integration/cli/seed-build.spec.ts` twice to check for flakiness (Windows temp realpath, Git timing, time zone)

## 8. Privacy and ethics check

- [x] 8.1 Run `/privacy-ethics-check` over the diff and over the regenerated `seeds/graph-dump.sql` (no secret, no real path, no author name or e-mail, no database URL in any output). Record the outcome in the step 9 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 9. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 9.1 Identify tests affected by the change: `tests/integration/git/build-history.spec.ts` and `tests/integration/index/acme-shop.spec.ts` call `buildOne` (signature extended, default unchanged). Confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only the new spec files appear
- [x] 9.2 Update affected tests without weakening their assertions (none expected). Confirm that every `#### Scenario:` of `openspec/changes/seed-build/specs/seed-build/spec.md` (17) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)

## 10. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 10.1 Capture the pre-test baseline: the 0.5 indicators (`git status --porcelain fixtures seeds`, `git ls-files -s fixtures | sha1sum`, `sha1sum seeds/graph-dump.sql`, project ids)
- [x] 10.2 Run the targeted tests: `npx vitest run tests/unit/cli tests/integration/cli`, twice
- [x] 10.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/cli/src/seed/**/*.ts,packages/cli/src/seed-build.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones with extra cases). Reproduce the no-database run with `npx vitest run --exclude 'tests/integration/**'` and no `DATABASE_URL`
- [x] 10.4 Verify the post-test state matches the baseline (tests never touch `fixtures/` or `seeds/`; same project ids). Restore and document if not
- [x] 10.5 Create the report `openspec/changes/seed-build/reports/YYYY-MM-DD-10-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the forced failures of 6.6, the Stryker score and the privacy check of 8.1
- [x] 10.6 Mark complete only after the tests pass and the report exists

## 11. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Precondition of every regeneration (added after the second `/adversarial-review` round): `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` both print nothing (ignored files under the fixture change the fingerprint). Note the current state (10.1 indicators). Load the author's `.env` into the shell without printing it (`set -a; . ./.env; set +a`) so `AUTHOR_HASH_SALT` is the development salt
- [x] 11.2 Exercise the success path with the real entry point: `npm run seed:build`; record exit code, stdout (exactly one line ending in `-> seeds/graph-dump.sql`, no absolute path) and stderr (empty); inspect the head of `seeds/graph-dump.sql` (format line, two fingerprints) and its `project` row
- [x] 11.3 Reproducibility, the DoD of DIS-91: `git add seeds/graph-dump.sql` (stage only, no commit), run `npm run seed:build` again, and `git diff --exit-code seeds/` must be clean; repeat once with `TZ=America/Bogota`. Confirm the local `project` ids equal the baseline (nothing committed). The regenerated seed is the intended mutation of this change and stays; `fixtures/acme-shop/.git` is gitignored
- [x] 11.4 Exercise the error cases: empty `AUTHOR_HASH_SALT`, empty `DATABASE_URL`, `DATABASE_URL` to port 1, `ALLOWED_REPOS_DIR` set to another directory (must still succeed); for each failure check exit `1`, stdout empty, one error line, `seeds/graph-dump.sql` unchanged (`sha1sum`), no `.tmp` left in `seeds/`, and no URL, password or absolute path in any output
- [x] 11.5 Document every command and output in `openspec/changes/seed-build/reports/YYYY-MM-DD-11-manual-interface-testing.md` (mask the OS user name in paths); run `/show-spec-working` for the evidence of the PR
- [x] 11.6 Verify the state: project ids equal the baseline; `git status --porcelain fixtures` empty; `seeds/graph-dump.sql` is the regenerated seed and nothing else changed under `seeds/`

## 12. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 12.1 No user interface: the seed build is a development script, already driven end to end through `npm run seed:build` in step 11. Record "covered by step 11; no browser UI", with that reason, in the step 10 report
- [x] 12.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that the new spec files ran (the integration one with Postgres and Git) and passed, and that the mutation step covered `packages/cli`. Link the run in the step 10 report

## 13. Update Technical Documentation (MANDATORY)

- [x] 13.1 `docs/project-context.md`: remove `seed:build` from the placeholders (lines ~106 and ~486; `db:seed` and `verify` stay); add a gotcha with the seed contract (temporary name, never commits, header and fingerprint inputs, deterministic ids and canonical values, atomic write, the salt dependency of the empty `git diff` — DIS-91 D6 / PH-11, the `buildOne` `log` option)
- [x] 13.2 `fixtures/README.md` §«Git history»: replace "(Ticket 3, task 9)" with the real behaviour of `npm run seed:build` (rebuilds acme-shop only in Entrega 2)
- [x] 13.3 `readme.md` §1.4: check the `seed:build` sentence (~345) is still true; do not rewrite the "2 projects" output (PH-02, DIS-92 / CM-HU-18.3)
- [x] 13.4 No ADR (design D10); confirm nothing in the implementation contradicted that
- [x] 13.5 Run `/update-docs` and confirm the docs gate passes (`npm run docs:coverage`, JSDoc on every export). Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit
- [x] 13.6 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed and the Stryker score; after verification, set DIS-91 to In Review in Linear with a comment in Spanish linking the PR and the change

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 14.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/seed-build/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [x] 14.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [x] 14.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [x] 14.5 `/opsx:archive`, answering the inbound DIS-98 note in its thread (design → Follow-ups), and commit the archive to the same pull request; the author merges afterwards
