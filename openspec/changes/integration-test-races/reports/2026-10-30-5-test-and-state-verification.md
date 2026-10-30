# Test and State Verification Report

- Date: 2026-10-30
- Change: integration-test-races
- Step: 5. Run Tests and Verify Data State (MANDATORY)

`DB` stands for `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test`. Raw
output of every run was kept in the session scratchpad (`runs/<label>-1.txt`). The reproduction
before any edit is in `2026-10-30-0-reproduction.md`.

## Commands executed

- 4.2: `DB npx vitest run <the six files of tasks 1–3> --no-file-parallelism`; after task 2.3,
  `DB npx vitest run tests/integration/store/query-cost.spec.ts tests/integration/cli/projects-command.spec.ts`;
  after task 2.4, `DB npx vitest run tests/integration/store/graph-read.spec.ts`
- 5.1: `docker compose exec -T postgres psql -U codemind -d codemind_test` with the counts below and
  `DELETE FROM project WHERE is_sample = true`
- 5.2: `DB npx vitest run tests/integration/store` and `DB npx vitest run tests/integration`, one tool
  call per run
- Diagnostic run, not counted in any series: `DB npx vitest run tests/integration` with the lock
  sampler (`pg_stat_activity` + `pg_blocking_pids()` every 0.5 s), after the first failure
- 5.3 (partial, see Outcome): `npm run lint`, `npm run typecheck`, `npm run docs:coverage`
- 5.4: `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json`;
  `grep -c tests packages/cli/src/seed/fingerprint.ts`
- 5.5: counts below; `docker compose exec -T postgres dropdb -U codemind codemind_test_clean`;
  `node scripts/dev-processes.mjs stop`

## Test results

### 4.2 Changed files alone

- The six files of tasks 1–3, one file at a time: 6 files passed, 39 tests passed (61.9 s).
- After task 2.3: `query-cost.spec.ts` + `projects-command.spec.ts`: 2 files, 7 tests passed.
- After task 2.4: `graph-read.spec.ts`: 1 file, 48 tests passed.

### 5.2 Stability series (pass rule: design D5, fixed before the runs)

Series A — after tasks 1–3:

| Run | Files | Tests | Failures |
|---|---|---|---|
| store 1 | 13 passed | 200 passed | — |
| store 2 | 13 passed | 200 passed | — |
| store 3 | 13 passed | 200 passed | — |
| store 4 | 13 passed | 200 passed | — |
| store 5 | 13 passed | 200 passed | — |
| whole 1 (300 s) | 3 failed, 33 passed | 3 failed, 388 passed | `projects-command` "Sample and user projects are listed": `could not serialize access due to concurrent update` at `DELETE FROM project` (16 s); `claims-write` "The most recent claims come first, at most twenty" and `graph-schema-constraints` "Deleting a file deletes its symbols": `Test timed out in 20000ms` |

Series stopped. The diagnostic run (not counted) failed `projects-command` "An empty database lists no
projects" with the same `40001` after three attempts in 196 ms. Cause in a file of this change →
correction cycle 1 (design D2a, task 2.3): bounded lock wait and a time-bounded retry.

Before restarting, `codemind_test` held one committed project `claims-recent-8e6cfd58-…` left by the
`claims-write` test that timed out in whole 1 (its `finally` never ran). One store run (`c1-store-1`,
green) had already run with it; it was deleted and the series restarted from run 1 on the restored
database.

Series B — after correction cycle 1:

| Run | Files | Tests | Failures |
|---|---|---|---|
| store 1 | 13 passed | 200 passed | — |
| store 2 | 12 passed, 1 failed | 199 passed, 1 failed | `graph-read` "Listing with no project returns an empty list": `could not serialize access due to concurrent update` at `graph-read.spec.ts:224`, three attempts in 89 ms |

Series stopped. The cause is the D2a mechanism in `graph-read.spec.ts`, the F3 target, outside the
six files D5 allowed. Design D2b extends the fix scope to that file only, with its reason recorded;
the pass criterion, run counts and cycle cap are unchanged (spec audit run 4: `APPROVED`). Correction
cycle 2 (task 2.4).

Series C — after correction cycle 2 (the last allowed):

| Run | Files | Tests | Failures |
|---|---|---|---|
| store 1 | 13 passed | 200 passed | — |
| store 2 | 13 passed | 200 passed | — |
| store 3 | 13 passed | 200 passed | — |
| store 4 | 13 passed | 200 passed | — |
| store 5 | 13 passed | 200 passed | — |
| whole 1 (294 s) | 36 passed | 391 passed | — |
| whole 2 (307 s) | 7 failed, 29 passed | 7 failed, 384 passed | `cache-entry` "A failed cache write does not leak" and `query-log-write` "A failed query log write does not leak": `canceling statement due to lock timeout` at their `CREATE TRIGGER` (10 s); `projects-command` "An empty database lists no projects": the same error at the end of its 10 s window; `claims-write` "The most recent claims come first, at most twenty", `graph-schema-constraints` "Deleting a project deletes its files", `graph-write` "A deleted file marks its claims stale", `seed-load` "The seed is loaded into an empty database": `Test timed out in 20000ms` |

Third failure after two correction cycles: by D5, a clean stop. All seven failures came from one lock
pile-up in the same seconds, behind the `CREATE TRIGGER`s of other files (design S1, Carreras
conocidas). The failure left `claims-recent-3d936b5d-…` committed; it was deleted (5.5).

### 5.3 Gates

- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run docs:coverage`: exit 0.
- `DB npx vitest run --project dom --project seed-build --project node` was not run: the step had
  already stopped (D5). The CI `quality` job runs the whole suite on the PR.

### 5.4 Seed fingerprint

`git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json`: empty.
`packages/cli/src/seed/fingerprint.ts` has no reference to `tests` (`grep -c` → 0). Unaffected.

## Data state verification

- Pre-test baseline (0.3): `project` 1 (committed sample `acme-shop` of an older seed), sample 1,
  `cache_entry` 3, `query_log` 0.
- 5.1: `DELETE FROM project WHERE is_sample = true` → `project` 0, sample 0, `cache_entry` 0,
  `query_log` 0, `file` 0.
- Post-test validation: `project` 0 after deleting the two `claims-recent-…` projects left by
  timed-out tests; `codemind-tx%` sessions 0. `codemind_test_clean` dropped. No dev process left
  running.
- State restored: Yes (to the documented state: no committed project).

## Manual interface and end-to-end testing (steps 6 and 7)

Not applicable: test and documentation edits only; no HTTP endpoint, CLI command or user interface
changes. No PowerShell check is needed.

## prompts.md (task 8.3)

Entry 75 added (the run's commission, as entry 74 did for the previous change).

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: FAIL (stability step 5.2 not passed; clean stop by design D5).
- Delivered: the changes of tasks 1–3, 2.3 and 2.4 (RC1, RC2 and F3's graph-read listing), the
  restored test database, the documentation of task 8.
- Blocking issue: the `CREATE TRIGGER` lock queue (design S1). Tasks 9.3–9.8 (reviews, archive,
  merge) were not run; the PR is left open for the author.

## Second phase (design → Second phase, D7–D10)

After the stop above, the lead of the run decided to remove RC5 (the trigger tests) in this change and
to add the start-up check and the shared snapshot helper (design L1–L4). The stability rule D10 was
fixed in the artifacts (spec audit run 6, `APPROVED`) before these runs.

### Commands executed

- 3.3/3.5/3.7 (TDD): each new helper spec run red (module missing), then green:
  `DB npx vitest run tests/integration/helpers/snapshot.spec.ts` (4 passed),
  `… rejecting-writes.spec.ts` (3 passed), `… committed-projects.spec.ts global-setup.spec.ts` (6 passed)
- 3.7 manual check: `INSERT INTO project …('guard-check'…)` in `codemind_test`, then
  `DB npx vitest run tests/integration/store/open-store.spec.ts` → refused before any test with
  `Error: The test database holds 1 committed project; it must hold none before an integration run (see docs/TESTING.md → Carreras conocidas).`;
  the project deleted (count 0). A unit-only run without `DATABASE_URL`
  (`npx vitest run tests/unit/cache`): 7 files, 37 tests passed.
- 4.3: the twelve changed or new spec files of the second phase, one at a time
  (`--no-file-parallelism`): 12 files, 107 tests passed (46.8 s).
- 5.8: `DB npx vitest run tests/integration/store` ×5 and `DB npx vitest run tests/integration` ×3, one
  tool call per run; before run 1, `SELECT count(*) FROM project` → 0.
- 5.3: `DB npx vitest run --project dom --project seed-build --project node`; `npm run lint`,
  `npm run typecheck`, `npm run docs:coverage`.
- 5.4/5.5: as in the first phase.

### Stability series (D10)

| Run | Files | Tests | Failures |
|---|---|---|---|
| store 1 | 13 passed | 200 passed | — |
| store 2 | 13 passed | 200 passed | — |
| store 3 | 13 passed | 200 passed | — |
| store 4 | 13 passed | 200 passed | — |
| store 5 | 13 passed | 200 passed | — |
| whole 1 (289 s) | 40 passed | 404 passed | — |
| whole 2 (288 s) | 40 passed | 404 passed | — |
| whole 3 (290 s) | 40 passed | 404 passed | — |

Every run green; no correction cycle was needed. (The whole suite has 40 files: the four new helper
specs.)

### Broader suite and gates (5.3)

- `DB npx vitest run --project dom --project seed-build --project node`: 190 files passed, 1997 tests
  passed (316.7 s).
- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm run docs:coverage`: exit 0.

### Seed fingerprint and post-state (5.4, 5.5)

- `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json`: empty.
- `codemind_test`: `project` 0, `codemind-tx%` sessions 0; `node scripts/dev-processes.mjs stop` →
  "no dev process of the repository is running".

### Outcome of the second phase

- Status: PASS (5.8 and 5.3).
