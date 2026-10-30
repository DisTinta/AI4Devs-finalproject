## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Feature branch `feature/dis-110-open-store-test-flake` (`BRANCH_PREFIX=feature/`, ticket id in lower case), created from an up-to-date `final-project-CRN` before the propose; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD`. Every commit scope is `DIS-110`
- [x] 0.2 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`); DIS-110 stays Done (no state change, no new ticket)
- [x] 0.3 Baseline: Docker Postgres up; `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run tests/integration/store/open-store.spec.ts` green, totals recorded for the step 3 report; in the test database record `SELECT count(*) FROM project` and `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-tx%'`

## 1. Test: remove the global project-count assertion (design D1)

- [x] 1.1 Existing test changed: in `tests/integration/store/open-store.spec.ts`, `it` "Every connection is released after a run", remove the line `const before = await projectCount();` and the assertion `expect(await projectCount()).toBe(before);`. Keep `expect(Date.now() - started).toBeLessThan(2_000);` and `expect(await sessionsLeft(applicationName)).toBe(0);` unchanged and in that order; the `it`'s name is unchanged
- [x] 1.2 Keep the helper `projectCount()`: confirm with `grep -n "projectCount" tests/integration/store/open-store.spec.ts` that the three `it`s "Work that resolves is committed", "Work that rejects leaves nothing" and "Work's writes are invisible to another connection before the commit" still call it; no other line of the file changes (`git diff` shows exactly two removed lines)

## 2. Review and Update Existing Tests (MANDATORY)

- [x] 2.1 The only existing test changed is the `it` of 1.1 in `tests/integration/store/open-store.spec.ts`; its remaining assertions are the whole `graph-store` scenario "Every connection is released after a run" (close within 2 s, no session left). No other test file and no `packages/**` file changes (`git diff --stat origin/final-project-CRN -- packages tests` lists only that file)

## 3. Run Tests and Verify Data State (MANDATORY)

- [x] 3.1 Targeted stability: run `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test npx vitest run tests/integration/store` five times in a row, then once the full integration suite in parallel (`… npx vitest run tests/integration`); record the totals of each run and any failure. Pass criterion (design X1, X2): the `it` "Every connection is released after a run" passes in all six runs. A failure of one of the three `it`s of design F1 ("Work that resolves is committed", "Work that rejects leaves nothing", "Work's writes are invisible to another connection before the commit") on its `projectCount()` assertion, of a race listed in `docs/TESTING.md` → Carreras conocidas, or of a test of another file that this change does not touch and that passes in one run of its file alone (e.g. a whole-database read or a timeout under parallel load; design F3, X2), is recorded in the report as evidence and not fixed. A failure of a test of another file that also fails in one run of its file alone is run alone on `origin/final-project-CRN`: if it fails there too it is pre-existing, recorded for the author (destination C) with both commands and totals, and does not block the step; if it passes there it is treated as caused by this change. Any failure caused by this change, and any other failure, is diagnosed and fixed in this change after updating the proposal non-goals, the design and tasks 1.2 and 2.1 under `docs/base-standards.md` §7, and the six runs are repeated
- [x] 3.2 Broader suite and gates: `npx vitest run --project dom --project seed-build --project node` with the same `DATABASE_URL`, `npm run lint`, `npm run typecheck`, `npm run docs:coverage`. The `harness` Vitest project is not run: no file under `tests/harness`, `.claude/` or the kit changes. The pass criterion of 3.1 applies
- [x] 3.3 Seed fingerprint: confirm in `packages/cli/src/seed/fingerprint.ts` that no fingerprint input is under `tests/` (design D2) and that `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json` is empty
- [x] 3.4 Post-state: the 0.3 counts unchanged (no `codemind-tx%` session left, the project count as before). Restore and document if not; `node scripts/dev-processes.mjs stop`
- [x] 3.5 Report `openspec/changes/open-store-test-flake/reports/YYYY-MM-DD-3-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6) with the baseline, the six runs of 3.1, the gates of 3.2 and the fingerprint check of 3.3, and for each failure classed under design F3 the command and totals of its file run alone, and for each failure that also fails alone the command and totals of the run alone on `origin/final-project-CRN`
- [x] 3.6 Mark complete only after the tests pass and the report exists

## 4. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 4.1 Not applicable: no HTTP endpoint, CLI command or other interface changes (test-only edit); record it in the step 3 report. No PowerShell check is needed

## 5. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 5.1 Not applicable: no user interface changes; record it in the step 3 report

## 6. Update Technical Documentation (MANDATORY)

- [x] 6.1 `/update-docs`: no documentation is invalidated (`docs/TESTING.md` → Carreras conocidas does not list this `it`; `docs/project-context.md` describes the file, not this assertion); the docs gate passes. No ADR, no API specification change

## 7. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Commit (scope `DIS-110`, explicit paths), push and open the PR in Spanish against `final-project-CRN`
- [x] 7.2 CI green: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 3 report. A failure covered by the pass criterion of 3.1 (an F1 `it` on its `projectCount()` assertion, a race listed in `docs/TESTING.md` → Carreras conocidas, or a test of another file this change does not touch, design F3) is re-run once and recorded; any other failure is handled as in 3.1 (design X1, X2). If the re-run fails again, the failing file is run alone locally and classified as in 3.1; a CI still red after two corrections is a clean stop (`docs/AUTONOMOUS-RUN.md` §6)
- [x] 7.3 `/show-spec-working`: reuse the step 3 evidence (the six runs) → `reports/YYYY-MM-DD-show-spec-working.md`
- [x] 7.4 `/verify-against-spec` (inline mode, verified against `proposal.md`, `design.md` and the `graph-store` scenario, `skip_specs: true`; DIS-110's acceptance criteria 1-6 were delivered by `pool-transaction-release` and do not apply, the author's instruction in `proposal.md` → Why and What Changes stands in for them) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [x] 7.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [x] 7.6 Every finding gets an A/C/D destination in `design.md` → Follow-ups (no new tickets); fixes on the same PR, re-running what each fix invalidates
- [ ] 7.7 `/opsx:archive`, commit it to the same PR, push, CI green; `node scripts/dev-processes.mjs stop`. The agent does not merge (instruction of this run): the author merges. A short Spanish comment on DIS-110, which stays Done
