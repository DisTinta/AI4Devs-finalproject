## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-44 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `verify-smoke` and the branch `feature/DIS-44-verify-smoke`
- [x] 0.2 Feature branch `feature/DIS-44-verify-smoke` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/verify-smoke/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 9 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM claim`, `SELECT count(*) FROM query_log`, `SELECT count(*), sum(hit_count) FROM cache_entry` and `SELECT max(created_at) FROM query_log`; confirm the seed and golden fingerprints still equal what the code computes (as measured in DIS-44 `[reality-map]`) with a one-off `npx tsx --tsconfig packages/cli/tsconfig.run.json -e` script that imports `collectFingerprintInputs` + `fingerprint` and `answerFingerprint` from their source files and prints them next to the seed header and the golden file's values; run the same script in a clean `git worktree add <scratchpad>/clean HEAD` (removed afterwards with `git worktree remove`) and confirm identical values (A13); dump the local database with `docker compose exec -T postgres pg_dump -U codemind -Fc codemind` to `pre-dis44.dump` in the session scratchpad (outside the repository), restored in 10.7

## 1. Shared seed fingerprints (refactor, design C1)

- [x] 1.1 Move `SeedFingerprints`, `headerFingerprints`, `currentSeedFingerprints` and `indexedCommitOf` (with `literals`) verbatim from `packages/cli/src/cache-build.ts` to `packages/cli/src/cache/seed-header.ts` (exported, TSDoc); `cache-build.ts` imports them and re-exports the type and `indexedCommitOf`; no behaviour change. `npx vitest run tests/unit/cli/cache-build.spec.ts tests/integration/cli/cache-build.spec.ts` green, untouched

## 2. Structural comparison (TDD, design C5) — `verify-smoke` → "Golden answers are compared on structure only"

- [x] 2.1 RED: create `tests/unit/cache/compare-golden.spec.ts` with "Free text, ids and usage are not compared" (golden and served built from `tests/support/cached-answer.ts`). See it fail (module missing)
- [x] 2.2 GREEN: `packages/cli/src/cache/compare-golden.ts` (`compareGolden`, `GoldenDifference`, the line render; TSDoc)
- [x] 2.3 RED → GREEN: "Count and span differences are listed in a fixed order" (cases A–D), including case (E) (A1), plus, as plain tests (not scenarios): the `UNKNOWN` `llm-required` difference with the `db:seed` hint, each of `type`, `verification` and `status`, and a value with a control character rendered as its escaped literal

## 3. Verify command: checks before connecting (TDD, design C2, C3) — `verify-smoke` → "Verify command contract and configuration", "Seed and golden fingerprints are current"

- [x] 3.1 RED: create `tests/unit/cli/verify.spec.ts` (doubles for every seam of `VerifyDeps`, temporary seed and cache directories, no database) with "Missing database configuration fails before verifying anything". See it fail
- [x] 3.2 GREEN: `packages/cli/src/verify.ts` (`runVerify`, `VerifyDeps`, `toFailure`, the entry guard of `seed-load.ts`) and the root script `verify` in `package.json`
- [x] 3.3 RED → GREEN, one at a time: "An invalid seed or golden file fails before connecting", "A stale seed fingerprint stops verify before any question", "A stale golden file stops verify before any question", "A seed project without golden answers is reported" (A2: the empty-entries case)

## 4. Verify command: asking and reporting (TDD, design C3, C4, C6, C7)

- [x] 4.1 RED → GREEN in `tests/unit/cli/verify.spec.ts` with an `explain` double and a recording `openTransaction`: "A failure while asking is reported after the lines already printed" (rollback and release called, `commit` never)
- [x] 4.2 RED → GREEN, plain tests in the same file (output): the stdout format of several golden files (entry lines first, summary lines last, A3); exit `1` on a mismatch with stderr empty; a question and a project name holding a control character printed escaped
- [x] 4.3 RED → GREEN, plain tests in the same file (failures and request): `DATABASE_UNAVAILABLE` with `details` `{}` when the opener throws `DatabaseUnavailable`; a failure after the open (an `explain` double throwing a `pg`-like connection error) reported as `INTERNAL` (A6); `SEED_NOT_LOADED` (through the `listProjects` seam, A12) for the first failing project in golden-file order, for a sample with the seed's id and another `indexedCommit` (A10), and for a seed project without an indexed commit (A12); the `explain` request (`projectId` of the seed, the entry's `question`, cache on, a model in evaluation mode, an absolute `workspaceRoot` even for a relative `repoRoot`)
- [x] 4.4 RED: create `tests/integration/cli/verify.spec.ts` (`describeWithDatabase`, `useTransactionPerTest`, `loadSeed` and `saveCacheEntry` of the versioned files on `db()`, a savepoint `openTransaction` that records `commit`, fingerprint seams returning the files' own values per design C10/A4) with "Every golden answer matches". See it fail
- [x] 4.5 GREEN: the transaction, `listProjects`, the real `explain` over `createPostgresStore({ transaction })` with `createEvaluationLlm`, the comparison and the output; 4.4 green
- [x] 4.6 RED → GREEN, one at a time: "An altered golden answer is reported field by field" (a temporary `cacheDir` holding a copy of the golden file with Q3 `statements[0].type` = `FACT`), "A missing cache entry is reported as a cache miss"
- [x] 4.7 RED → GREEN, one at a time: "A database without the current seed is reported" (the four cases; for "no project", delete the project named `acme-shop` inside the harness transaction first (a broad delete would lock rows other files commit in parallel), since a local `make up` leaves a committed acme-shop, `docs/project-context.md` → Testing), "Verify leaves the database as it was"
- [x] 4.8 RED → GREEN, one at a time: "No request reaches a model even when one is configured" (local `node:http` server on port 0 counting requests; second run with `LLM_BASE_URL=ftp://x`, `DAILY_BUDGET_USD=abc`, `CACHE_BUILD_TIMEOUT_MS=abc`), "An unreachable database is reported without its URL by verify" (the default opener; `details` `{}`)

## 5. CI job (design C9) — `verify-smoke` → "Verify runs in a CI job of its own"

- [x] 5.1 Add `yaml` (`^2.9.1`, the version already in `package-lock.json`) to the root `devDependencies` and run `npm install`; only the root entry of the lock file changes (A5)
- [x] 5.2 RED: create `tests/unit/ci/verify-job.spec.ts` with "The CI workflow runs verify in a job of its own" (including no `continue-on-error` and no other job on `POSTGRES_DB: verify`). See it fail
- [x] 5.3 GREEN: the `verify` job in `.github/workflows/ci.yml` (own `pgvector/pgvector:pg16` service, `POSTGRES_DB: verify`, `npm ci` → `db:migrate` → `db:seed` → `verify`, no `LLM_*`, `timeout-minutes: 10`, a header comment citing PH-23) and `verify` in the `scope` loop and its comment; `quality` untouched

## 6. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 6.1 Identify the tests affected by the change: `grep -rn "cache-build\|headerFingerprints\|\"verify\"\|ci.yml" tests/`, plus every type error `npm run typecheck` reports
- [x] 6.2 No existing test changes its assertions; if one must, stop and record why in the step 9 report, never weakening it
- [x] 6.3 Confirm each `#### Scenario:` of the delta spec maps 1:1 to a test with exactly the same name (grep each title in `tests/`), except "The verify job is green on the pull request", a recorded check (14.3)

## 7. Refactor

- [x] 7.1 With the suite green, refactor `packages/cli/src/verify.ts` and `packages/cli/src/cache/{compare-golden,seed-header}.ts` for naming and duplication only (no behaviour change, no test edits, no fingerprint input touched); `npx vitest run tests/unit/cache tests/unit/cli tests/unit/ci tests/integration/cli` stays green

## 8. Real run against the local database

- [x] 8.1 On the migrated local database: `npm run db:seed`, then `npm run verify` without any `LLM_*` exported: exit `0`, the three `✓` lines and `acme-shop: 3/3 golden answers match`; record the output and the wall time (< 5 s, the ticket's figure, measured with `time`)

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 9.1 Capture the pre-test baseline: the 0.4 indicators
- [x] 9.2 Run the targeted tests: `npx vitest run tests/unit/cache tests/unit/cli tests/unit/ci tests/integration/cli`
- [x] 9.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 9.4 Run `npm run test:mutation` (score ≥ 80, the CI break threshold); for each meaningful survivor in `verify.ts`, `compare-golden.ts` and `seed-header.ts`, a RED → GREEN test
- [x] 9.5 Run `/privacy-ethics-check` over the diff (design C11: no URL, credentials, absolute path or answer text in any output; terminal-safe values; no commit); record the result in the report
- [x] 9.6 Verify the post-test state: same `project`, `claim`, `query_log` and `cache_entry` counts and `hit_count` sum as in 9.1 (compared again after the 10.7 restore); no `.stryker-tmp/` and no temporary seed or golden copy left. Restore and document if not
- [x] 9.7 Create `openspec/changes/verify-smoke/reports/YYYY-MM-DD-9-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the real run (step 8), the Stryker score and survivors (9.4), the privacy check (9.5) and the ADR of task 12.2 (design C12, A9); after 10.7, add an addendum with the post-restore indicators
- [x] 9.8 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Preconditions: local database up, migrated and seeded (8.1); record the 0.4 indicators
- [x] 10.2 Success path: `npm run verify` (exit `0`, stdout exact, stderr empty); again with `LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_API_KEY=k3y` and with `LLM_BASE_URL=ftp://x` (same output, exit `0`); `hit_count` of every golden entry still `0` and no `query_log` row after the 10.1 `max(created_at)`; `npm run verify -- extra` gives the same output and exit `0` (A11)
- [x] 10.3 Error paths, each with exit code and the exact stderr line: no `DATABASE_URL`; `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` (no `s3cret` in any output)
- [x] 10.4 Altered golden answer: copy `seeds/cache/acme-shop.json` to the scratchpad, change Q3 `statements[0].type` to `FACT` in the working copy, run `npm run verify` (exit `1`, the `✗` line and the diff line, `2/3`), restore the file (checked with `git diff --exit-code seeds/cache`)
- [x] 10.5 Stale fingerprint: change one character of `answerFingerprint` in the working copy of the golden file, run `npm run verify` (exit `1`, `FINGERPRINT_MISMATCH` `golden`, stdout empty), restore it (`git diff --exit-code seeds/cache`); same with the seed's `analyzer-fingerprint` line (`FINGERPRINT_MISMATCH` `seed`), restored (`git diff --exit-code seeds/graph-dump.sql`)
- [x] 10.6 Cache miss: `DELETE FROM cache_entry` of acme-shop with psql, run `npm run verify` (exit `1`, three cache-miss lines, `0/3`), then `npm run db:seed` to restore
- [x] 10.7 Restore the state: restore the 0.4 dump (`docker compose exec -T postgres pg_restore -U codemind -d codemind --clean --if-exists` fed with `pre-dis44.dump`); re-check the 0.4 indicators against 0.4; no `codemind` session left in `pg_stat_activity`
- [x] 10.8 Document every command, exit code and output in `openspec/changes/verify-smoke/reports/YYYY-MM-DD-10-manual-interface-testing.md` (mask the OS user name in paths), with the restoration of 10.7

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 11.1 The change has no browser UI (`packages/web` is untouched); record "not applicable beyond step 10" in the step 9 report
- [x] 11.2 Record in the step 9 report that the CI evidence (the `verify` job green with its output, the new spec files ran in `quality`, the mutation job ≥ 80) is collected in 14.3, once the PR exists

## 12. Update Technical Documentation (MANDATORY)

- [x] 12.1 `docs/project-context.md`: Commands (`npm run verify` is real: what it checks, in which order, its codes and output; remove "still a placeholder"), CI (the `verify` job, its own database, the `scope` loop), Gotchas (the fingerprint policy D2: touching a seed or answer fingerprint input means `seed:build` then `cache:build` locally, or `verify` stays red; the cache-miss hint; after pulling a regenerated seed or golden file, run `npm run db:seed` before `verify`, A10), Testing (the new spec files and the fingerprint seams of A4); also the "mid-build" paragraph that still says "`verify` is a placeholder that no-ops" (`grep -n placeholder docs/project-context.md`)
- [x] 12.2 ADR for the fingerprint policy D2 (design C12, A9) with `/adr-new` under `docs/adr/`, its why written by the agent and marked as the agent's decision (ADR `20261016-autonomous-workflow-run-entrega-2`); linked from `docs/project-context.md` → Gotchas
- [x] 12.3 `readme.md`: check §1.4, §2.4, §6 and the CI lines (`grep -n verify readme.md`) and change only sentences that became false (e.g. the "golden/caché" wording stays; any "pending" mention goes)
- [x] 12.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 13. Pull request preparation

- [x] 13.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-44 `[enhanced]` D1–D14 and the amendments A1–A13), the real run of step 8, the Stryker score and "no migration; `yaml` added as a root devDependency, no new package in the lock file"

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 14.1 Open the pull request against `feature/entrega-2-CRN` (authorised by ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, which relaxes `base-standards.md` §88/§90/§99 for this run; it lives on `feature/DIS-101-readme-entrega-2`, and if it is not yet in `feature/entrega-2-CRN` when the PR opens, cite it by branch and name in the PR body; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards) — PR #51
- [x] 14.2 Set DIS-44 to In Review in Linear with a comment in Spanish linking the PR and the change
- [x] 14.3 Confirm in the PR's CI run that the `verify` job is green with the three `✓` lines and `acme-shop: 3/3 golden answers match` ("The verify job is green on the pull request"), that `quality` is green with `graph-read.spec.ts` unchanged and the new spec files ran, and that the mutation job is ≥ 80; link the run in an addendum to the step 9 report — run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39037228884, mutation score 95.94
- [x] 14.4 Run `/show-spec-working` (may reuse the step 8 and 10 evidence); report `openspec/changes/verify-smoke/reports/YYYY-MM-DD-show-spec-working.md`
- [x] 14.5 Run `/verify-against-spec`; report `openspec/changes/verify-smoke/reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 14.6 Run `/adversarial-review`; report `openspec/changes/verify-smoke/reports/YYYY-MM-DD-adversarial-review.md`
- [x] 14.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report. A fix that changes a seed or answer fingerprint input means `seed:build` and/or `cache:build` again (record it)
- [x] 14.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 14.9 `/opsx:archive`, and commit the archive to the same pull request; the agent merges, only after the archive commit and with CI green (ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` lets the agent merge in this run; cited by branch and name if not yet in the base branch)
