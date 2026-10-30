## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-110-integration-test-races` (`BRANCH_PREFIX=feature/`, ticket id in lower case), created from an up-to-date `final-project-CRN` (`6a089ac`) before the propose; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD`. Every commit scope is `DIS-110`
- [x] 0.2 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`; `.claude/sdd-harness.env` stays unstaged); DIS-110 stays Done (no state change, no new ticket)
- [x] 0.3 Docker Postgres up (`codemind-postgres-1`); record in the test database `codemind_test`: `SELECT count(*) FROM project`, `SELECT count(*) FROM project WHERE is_sample`, `SELECT count(*) FROM cache_entry`, `SELECT count(*) FROM query_log`
- [x] 0.4 Reproduction before any edit (design → Root-cause analysis): `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run tests/integration/store` ×5 and `… npx vitest run tests/integration` ×6 (three with the lock sampler), then the same on a new empty database `codemind_test_clean` (×3 each), with the deadlock reports of `docker compose logs postgres`; raw outputs kept in the session scratchpad and summarised in `reports/2026-10-30-0-reproduction.md` (per run: command, totals, failing tests with their first error line)

## 1. Tests: scope the open-store checks (design D1)

- [ ] 1.1 Existing test changed: `tests/integration/store/open-store.spec.ts`, `it`s "Work that resolves is committed", "Work that rejects leaves nothing" and "Work's writes are invisible to another connection before the commit": remove `const before = await projectCount();` and replace `expect(await projectCount()).toBe(before);` with `expect(await projectIds(name)).toEqual([]);`. No other line of these `it`s changes; names unchanged
- [ ] 1.2 Same file: remove the helper `projectCount()` (no caller left; `grep -n projectCount` returns nothing) and replace the comment of line 105 (line 104, the spec reference, stays) with the text of design D1 (F2)

## 2. Tests: own snapshot for whole-table reads (design D2)

- [ ] 2.1 Existing test changed: `tests/integration/store/query-cost.spec.ts`: add a local `inOwnSnapshot(work)` (own `connect()` client, `BEGIN ISOLATION LEVEL REPEATABLE READ`, always `ROLLBACK`, at most three attempts retried only on `40001`, client ended in a `finally`); "The cost since an instant is summed across projects", "With no matching row the cost is zero" and "The ceiling survives a restart" run their arrange and act inside it on a store over that client, with the same rows, instants, amounts and assertions; "reads the cost sum on the store's own connections" opens its transaction with `BEGIN ISOLATION LEVEL REPEATABLE READ` and retries its arrange and act on `40001`, at most three attempts, rolling back between attempts; every per-attempt value (`failures`, `calls`, ids) is created inside the snapshot's `work`; "sums the cost with a single SELECT and writes nothing" unchanged; the file comment says why
- [ ] 2.2 Existing test changed: `tests/integration/cli/projects-command.spec.ts`: the same local `inOwnSnapshot(work)`; "Sample and user projects are listed" and "An empty database lists no projects" run their arrange and act inside it (`savepointTransaction` and `list` on that client); assertions unchanged; every per-attempt value (`log`, ids) is created inside the snapshot's `work`; the `describe` drops `useTransactionPerTest()` and migrates with `beforeAll(migrateSharedDatabase, 60_000)` (no test uses `db()` any more); the file comment says why

## 3. Tests: scope the seed loaders' writes (design D3)

- [ ] 3.1 Existing tests changed: in the `seeded()` helper of `tests/integration/api/ask.spec.ts`, `tests/integration/api/reindex.spec.ts` and `tests/integration/cli/ask-command.spec.ts`, `DELETE FROM project` becomes `DELETE FROM project WHERE name = ANY($1::text[])` with a local `const names = seedProjects(SEED).map((p) => p.name)` also passed to `loadSeed`, and `UPDATE project SET root_path = $1` gets `WHERE is_sample = true`; the file comments (`api/ask.spec.ts:24`, `api/reindex.spec.ts:27`, `cli/ask-command.spec.ts:26`) and the `seeded()` doc comments say what the helper now deletes and updates
- [ ] 3.2 Existing tests changed: `claimCount()` of `tests/integration/api/ask.spec.ts` and `tests/integration/cli/ask-command.spec.ts` counts only the claims of sample projects (design D3)

## 4. Review and Update Existing Tests (MANDATORY)

- [ ] 4.1 The existing test files changed are exactly the six of tasks 1–3: `tests/integration/store/open-store.spec.ts`, `tests/integration/store/query-cost.spec.ts`, `tests/integration/cli/projects-command.spec.ts`, `tests/integration/api/ask.spec.ts`, `tests/integration/api/reindex.spec.ts`, `tests/integration/cli/ask-command.spec.ts`. No test name changes, no assertion is removed or weakened beyond the scoping of design D1–D3, and no `packages/**` file changes (`git diff --stat origin/final-project-CRN -- packages tests` lists only those six files)
- [ ] 4.2 Each changed file passes alone: `DATABASE_URL=… npx vitest run <file>` for the six files, totals recorded

## 5. Run Tests and Verify Data State (MANDATORY)

- [ ] 5.1 Restore the test database (design D4): in `codemind_test`, record the 0.3 counts, run `DELETE FROM project WHERE is_sample = true`, record the counts again (`project`, `cache_entry`, `query_log` all 0)
- [ ] 5.2 Stability runs, under the pass rule of design D5 (fixed before the runs; not widened after seeing results): at least five consecutive runs of `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run tests/integration/store` and three consecutive runs of `… npx vitest run tests/integration` (files in parallel). The step passes only if every run has 0 failed tests. Any failure stops the series and is diagnosed from its raw output and the Postgres log; a cause removable in one of the six files of task 4.1 is fixed in this change after updating the artifacts (`docs/base-standards.md` §7) and both series (store and whole suite) restart from run 1; at most two correct-and-restart cycles, a third failure is a clean stop reported to the author (destination C); a fix that needs another test file, or a cause that is not removable in tests, is recorded in Carreras conocidas and the step is reported as not passed (destination C). Any outcome other than PASS is a clean stop: commit and push the work, open the PR for the author if useful, and do not run 9.3–9.8. One tool call per run, timeout ≥ 420000 ms. Every run executed counts; a failing run beyond the minimum stops the series. Every run's totals, and every restart with its reason, go to the report
- [ ] 5.3 Broader suite and gates: `DATABASE_URL=… npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run docs:coverage`. The `harness` Vitest project is not run: no file under `tests/harness`, `.claude/` or the kit changes. The suite run is one run with 0 failed tests; a failure is handled as in 5.2
- [ ] 5.4 Seed fingerprint: confirm in `packages/cli/src/seed/fingerprint.ts` that no fingerprint input is under `tests/` or `docs/` (design D6) and that `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json` is empty
- [ ] 5.5 Post-state: in `codemind_test`, the 5.1 counts after the runs (`project` 0, no committed sample, no `codemind-tx%` session left); `DROP DATABASE codemind_test_clean`; `node scripts/dev-processes.mjs stop`
- [ ] 5.6 Report `openspec/changes/integration-test-races/reports/YYYY-MM-DD-5-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6) with 4.2, 5.1–5.5
- [ ] 5.7 Mark complete only after the tests pass and the report exists

## 6. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 6.1 Not applicable: no HTTP endpoint, CLI command or other interface changes (test and documentation edits only); record it in the step 5 report. No PowerShell check is needed

## 7. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 7.1 Not applicable: no user interface changes; record it in the step 5 report

## 8. Update Technical Documentation (MANDATORY)

- [ ] 8.1 `docs/TESTING.md` → Carreras conocidas rewritten from design RC1–RC4 and D4: what this change removed, what remains with cause and mitigation (including `claims-refresh.spec.ts`'s `CREATE TRIGGER` lock conflict, stated as not removed by decision Q1, not as unremovable; the same conflict in `explain.spec.ts` (60 s bound); every file that loads the versioned seed in its harness transaction (RC4, including `cli/verify.spec.ts`); and `query-log-write.spec.ts:160`), and the check that the test database holds no committed seed with the command that empties it
- [ ] 8.2 `docs/project-context.md` → "Golden answers tests": the sentence on the two racing scenarios aligned with 8.1. `/update-docs`: no other documentation invalidated; no ADR, no API specification change
- [ ] 8.3 `prompts.md`: an entry if this run's prompts qualify under `docs/project-context.md` → "prompts.md — synchronous AI log"; otherwise state why not in the step 5 report

## 9. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 9.1 Commit (scope `DIS-110`, explicit paths), push and open the PR in Spanish against `final-project-CRN`
- [ ] 9.2 CI green: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 5 report. A failure is diagnosed as in 5.2 (re-run once only if the cause is recorded in Carreras conocidas); a CI still red after two corrections is a clean stop (`docs/AUTONOMOUS-RUN.md` §6)
- [ ] 9.3 `/show-spec-working`: reuse the step 5 evidence → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 9.4 `/verify-against-spec` (inline mode: a fresh read-only subagent reads, the agent checks each finding; against `proposal.md`, `design.md` and the scenarios of the changed tests, `skip_specs: true`) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 9.5 `/adversarial-review` (inline mode, same way) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 9.6 Every finding gets an A/C/D destination in `design.md` → Follow-ups (no new tickets); A items fixed on the same PR, re-running what each fix invalidates; a fix that edits any test file re-runs 5.2 (both series) and 5.3 under design D5 before 9.8, recorded in an addendum to the step 5 report
- [ ] 9.7 `/opsx:archive`, commit it to the same PR, push, CI green; `node scripts/dev-processes.mjs stop`
- [ ] 9.8 Merge: the author asked during this run for the agent to merge (design F6): only `gh pr merge <n> --merge`, alone on its line, through the merge gate (`docs/AUTONOMOUS-RUN.md` §5) once every check of the archive commit is green and the step 5 report records 5.2 and 5.3 as PASS; if the gate or the classifier denies it, the PR is left ready for the author. A short Spanish comment on DIS-110, which stays Done
