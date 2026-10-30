# Show spec working: integration-test-races (DIS-110)

- Date: 2026-10-30
- Interface: the integration test suite and its harness (no HTTP endpoint, CLI command or UI changes).
- Evidence reused from `2026-10-30-5-test-and-state-verification.md` (task 9.3 allows it).

## What the change promises, and the evidence

| Promise | Evidence |
|---|---|
| The integration suite no longer fails intermittently when its files run in parallel | Second-phase series D10: `tests/integration/store` 5/5 green (13 files, 200 tests each) and `tests/integration` 3/3 green (40 files, 404 tests each), no correction cycle. Before the change the same commands failed in 11 of 17 runs (`2026-10-30-0-reproduction.md`). |
| A test database with committed projects is refused at the start of a run | Manual check (task 3.7): with one committed project in `codemind_test`, `DB npx vitest run tests/integration/store/open-store.spec.ts` stopped before any test with `Error: The test database holds 1 committed project; it must hold none before an integration run (see docs/TESTING.md → Carreras conocidas).` Without `DATABASE_URL`, `npx vitest run tests/unit/cache` ran normally (7 files, 37 tests). Scenarios in `tests/integration/helpers/committed-projects.spec.ts` and `global-setup.spec.ts` (6 tests green). |
| A whole-table read sees no row another file commits during the test | `tests/integration/helpers/snapshot.spec.ts` "Rows committed by another connection after the snapshot are invisible" (green, throwaway database); used by `query-cost`, `projects-command` and `graph-read`, green in every series run. |
| A write can be made to fail without DDL | `tests/integration/helpers/rejecting-writes.spec.ts` (3 tests green: P0001 with the text in message, `detail` and `hint`; no lock on `query_log`, no trigger or temporary function); the five failure tests use it and pass; `grep -rln "CREATE TRIGGER" tests/integration` lists only `indexes-stale.spec.ts` (throwaway database). |
| No production change | `git diff --stat origin/final-project-CRN -- packages seeds fixtures package-lock.json` empty. |

## Outcome

PASS: every promise has direct evidence from a real run.
