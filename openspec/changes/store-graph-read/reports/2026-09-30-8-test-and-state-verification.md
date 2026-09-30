# Test and State Verification Report

- Date: 2026-09-30
- Change: store-graph-read
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

All with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` unless stated.

- `docker compose up -d` (Postgres healthy), `npm run db:migrate` → "No migrations to run!"
- `docker compose exec -T postgres psql -U codemind -d codemind -tAc "<pgmigrations + counts>"` (before and after)
- `npx vitest run tests/unit/knowledge tests/integration/store/graph-read.spec.ts` (twice)
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run` (and `npx stryker run --mutate packages/core/src/knowledge/read-arguments.ts` at task 2.3)
- `CI=true npx vitest run --exclude 'tests/integration/**'` with `DATABASE_URL` unset

## Test results

- Pre-change baseline (task 0.5): 11 files, 156 tests passed (65.85 s). Docker's engine was down at
  the start of the session ("Docker Desktop is unable to start"), so the baseline ran after sections
  1–2 (types, port contract with throwing adapter stubs, pure validation), which add code only and
  change no existing behaviour.
- Targeted tests, run 1: 4 files, 54 passed, 0 failed (3.43 s). Run 2: 4 files, 54 passed, 0 failed
  (3.45 s). No flakiness.
- Required suite `npx vitest run`: 12 files, 182 passed, 0 failed, 0 skipped (64.19 s) — the
  baseline 156 plus the 26 scenario tests of `graph-read.spec.ts`. After the `errors.spec.ts`
  addition below, `tests/unit/knowledge` is 29 passed.
- Frontend exclusion (`CI=true`, no `DATABASE_URL`, integration excluded): 3 files, 28 passed, no
  import error.
- Gates: `npm run lint` 0 errors (3 warnings, pre-existing empty interfaces in `AnalyzerPort`,
  `GitPort`, `LlmPort`); `npm run typecheck` OK; `npm run lint:architecture` 0 errors (8
  pre-existing `no-orphans` warnings on analyzer / llm / git stubs); `npm run docs:coverage` no
  warning.
- Mutation (`npx stryker run`, core): all files 88.10 % (threshold 70). `read-arguments.ts` 91.67 %
  (33 killed, 3 survived: the reason strings of `InvalidStoreQuery`, not fixed by the spec).
  `errors.ts` rose from 81.25 % to 87.50 % after adding an `InvalidStoreQuery` case to
  `tests/unit/knowledge/errors.spec.ts`, following the existing per-error pattern.
- Scenario traceability: 26 `#### Scenario:` in `specs/graph-store/spec.md` ↔ 26 tests named
  after them in `tests/integration/store/graph-read.spec.ts` (checked by script: none missing, none
  extra).
- Forced failures (task 6.4; each restored from a scratch copy and confirmed with `cmp`):
  - visited-path check removed and `walk` rows returned without `min(depth)` grouping →
    "A cycle yields each node once with its minimum distance" fails;
  - `e.project_id = $1` removed from the walk and the project filter removed from the symbol seed →
    "A traversal never reaches another project" fails;
  - `escapeLikeTerm` returning the term unchanged → "Wildcard characters in the term match
    literally" fails (received `getXtotal`).
- TDD note: the tests of tasks 5.2–6.3 passed on their first run, because the D6 statement and the
  D3 validation written for 5.1 / section 2 already covered them; their RED phase was not observed.
  The forced failures above are the evidence that the key ones can fail.
- Notes: existing tests changed — only `tests/unit/knowledge/errors.spec.ts` (+1 test, no assertion
  removed or loosened); new — `tests/integration/store/graph-read.spec.ts`,
  `tests/unit/knowledge/read-arguments.spec.ts`.

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1,0002_history-claims,0003_indexes-stale`
  - `project` / `file` / `symbol` / `edge`: 0 / 0 / 0 / 0
- Post-test validation:
  - `pgmigrations`: `0001_graph-l1,0002_history-claims,0003_indexes-stale`
  - `project` / `file` / `symbol` / `edge`: 0 / 0 / 0 / 0
- State restored: Yes (nothing to restore: every read test runs in the harness transaction, which
  is rolled back; the empty-list test's `DELETE FROM project` is inside it)
- Restoration actions: none

## UI evidence (if applicable)

- (none — the change has no browser UI)

## End-to-end testing (step 10.1)

Not applicable: the change adds `StorePort` reads only; no HTTP route, CLI command or web screen
exists for them yet, so no user workflow is affected.

## CI evidence (step 10.2)

Pending: to be linked after the branch is pushed.

## Outcome

- Status: PASS
- Blocking issues: none

## Post-audit delta (verify-against-spec, 2026-09-30) — tasks §12

Commands (same `DATABASE_URL`): `npx vitest run tests/integration/store/graph-read.spec.ts`,
`npx vitest run tests/unit/knowledge tests/integration/store`, `npx vitest run`,
`npm run typecheck`, `npm run lint`, the counts query of this report.

- 12.1 RED: "A cross-project edge never returns another project's node" failed on the previous SQL
  (the foreign file and symbol were returned at distance 1).
- 12.2 GREEN: node details of `NEIGHBORS` joined inside the `LEFT JOIN`ed subquery and filtered by
  `f.project_id = $1 OR sf.project_id = $1`; `graph-read.spec.ts` 27 passed.
- 12.3–12.6: tests strengthened without removing or loosening any assertion — symbol search order
  across `src/B.ts` / `src/a.ts` and the `PriceTwo` / `priceOne` name tie-break; traversal with a
  file, a second file and a symbol at distance 1 (`file:src/B.ts`, `file:src/b.ts`, `U`); literal
  `%` and `\`; project read by its upper-case id; a seed of type `file` carrying a symbol id.
- 12.7 forced failures (each restored from a scratch copy and confirmed with `cmp`):
  - project filter replaced by `WHERE true` → "A cross-project edge never returns another
    project's node" fails;
  - `COLLATE "C"` removed from `FIND_SYMBOLS` → "Symbols are found by a case-insensitive fragment
    of the name" fails (database collation `en_US.utf8`);
  - `COLLATE "C"` removed from `NEIGHBORS` → "The traversal crosses files and symbols" fails.
- 12.8: targeted 10 files / 160 passed; full suite 12 files / 184 passed, 0 failed (63.60 s) —
  182 before plus the `errors.spec.ts` case and the new scenario; `npm run typecheck` OK;
  `npm run lint` 0 errors (3 pre-existing warnings). Scenario traceability 27 ↔ 27 (none missing,
  none extra).
- Data state after the delta: `project` / `file` / `symbol` / `edge` = 0 / 0 / 0 / 0, equal to the
  baseline.
- Unchanged: 10.2 (CI evidence), 11.4 (Purpose at archive), 11.7 (PR and Linear).

