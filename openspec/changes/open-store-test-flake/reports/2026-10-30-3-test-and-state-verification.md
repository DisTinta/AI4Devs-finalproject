# Test and State Verification Report

- Date: 2026-10-30
- Change: open-store-test-flake
- Step: 3. Run Tests and Verify Data State (MANDATORY)

`DB` below stands for `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test` (the
test database of `docs/TESTING.md`; Docker Postgres `codemind-postgres-1`, healthy).

## Commands executed

- Baseline (0.3, before the edit): `DB npx vitest run tests/integration/store/open-store.spec.ts`
- `docker compose exec -T postgres psql -U codemind -d codemind_test -tAc "SELECT count(*) FROM project; SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind-tx%';"` (before and after)
- 3.1: `DB npx vitest run tests/integration/store` ×5, then `DB npx vitest run tests/integration` ×1
- 3.1 (F3 run-alone evidence): `DB npx vitest run tests/integration/store/claims-refresh.spec.ts`, `DB npx vitest run tests/integration/store/graph-read.spec.ts`
- 3.2: `DB npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run docs:coverage`
- 3.3: `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json`; read `packages/cli/src/seed/fingerprint.ts`
- 3.4: `node scripts/dev-processes.mjs stop`

## Test results

- Baseline, before the edit: `open-store.spec.ts` 1 file, 9 passed.
- Diff of the test file: exactly two removed lines (`const before = await projectCount();` and `expect(await projectCount()).toBe(before);`); `projectCount()` still called at lines 167/179, 185/202, 208/226.

### Six stability runs (3.1)

| Run | Command | Files | Tests | Failures | "Every connection is released after a run" |
|---|---|---|---|---|---|
| 1 | `tests/integration/store` | 13 passed | 200 passed | none | passed |
| 2 | `tests/integration/store` | 12 passed, 1 failed | 199 passed, 1 failed | `claims-refresh.spec.ts` "A failure while refreshing leaves the claim as it was" (10 089 ms, timeout) — F3 | passed |
| 3 | `tests/integration/store` | 12 passed, 1 failed | 199 passed, 1 failed | `open-store.spec.ts` "Work that resolves is committed" (134 ms) — F1 | passed |
| 4 | `tests/integration/store` | 11 passed, 2 failed | 198 passed, 2 failed | `claims-refresh.spec.ts` same `it` (10 079 ms, timeout) — F3; `graph-read.spec.ts` "Listing with no project returns an empty list" — F3 | passed |
| 5 | `tests/integration/store` | 13 passed | 200 passed | none | passed |
| 6 | `tests/integration` (whole, parallel; 309 s) | 35 passed, 1 failed | 390 passed, 1 failed | `open-store.spec.ts` "Work that resolves is committed": `AssertionError: expected 1 to be 2` at `open-store.spec.ts:179:34`, its `projectCount()` assertion — F1 | passed |

The changed `it` passed in all six runs. Every failure is covered by the pass criterion (design X1, X2):

- F1: "Work that resolves is committed" failed on its global `projectCount()` comparison (line 179) in
  runs 3 and 6: the same race this change removes from "Every connection is released after a run",
  left to the author.
- F3, run alone (one run each, after the six runs):
  - `tests/integration/store/claims-refresh.spec.ts`: 1 file passed, 4 tests passed (4.12 s).
  - `tests/integration/store/graph-read.spec.ts`: 1 file passed, 48 tests passed (7.03 s).
  Neither also fails alone, so no run on `origin/final-project-CRN` was needed.

### Broader suite and gates (3.2)

- `DB npx vitest run --project dom --project seed-build --project node`: 186 files passed, 1984 tests passed, 331 s.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run docs:coverage`: exit 0.
- The `harness` project was not run (nothing under `tests/harness`, `.claude/` or the kit changes).

### Seed fingerprint (3.3)

`packages/cli/src/seed/fingerprint.ts` hashes `ANALYZER_DIRECTORIES`, `ANALYZER_FILES`,
`ANALYZER_PORT`, `MIGRATIONS_DIRECTORY` and `PARSER_DEPENDENCIES`; the file has no reference to
`tests` (`grep -c tests` → 0). `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json`: empty.
The seed fingerprint is unaffected.

## Data state verification

- Pre-test baseline (test database): `project` rows 1; `codemind-tx%` sessions 0.
- Post-test validation: `project` rows 1; `codemind-tx%` sessions 0.
- State restored: Yes (nothing to restore).
- Restoration actions: none. `node scripts/dev-processes.mjs stop` → "no dev process of the repository is running".

## Manual interface and end-to-end testing (steps 4 and 5)

Not applicable: test-only edit; no HTTP endpoint, CLI command or user interface changes. No PowerShell check is needed.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none. F1 and F3 failures recorded for the author (design Follow-ups).

## Addendum: CI of PR #88 (task 7.2) and run-alone limit

- PR #88, run [41036062002](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41036062002) (plus `frontend` run 41036062004): `scope`, `quality` (9 min 31 s, the whole suite with its own database), `verify`, `mutation`, `secrets` and `frontend` all `pass` on the first attempt; no re-run needed.
- Limit of the F3 evidence (adversarial review, finding R2): each F3 file was run alone once, after the six runs, not repeated under the same load; the cause of the `graph-read.spec.ts` failure was not diagnosed beyond its whole-database read. The claim that F3 is unrelated rests on the change only removing a read from one test.
