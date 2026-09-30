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

PR [#10](https://github.com/DisTinta/AI4Devs-finalproject/pull/10), head `83a929f`:

- `CI` run [36741967202](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36741967202):
  success. The `quality` job's `Tests` step ran `tests/integration/store/graph-read.spec.ts`
  (27 tests) and `tests/unit/knowledge/read-arguments.spec.ts` (15 tests), neither skipped;
  12 test files passed.
- `Frontend` run [36741967187](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36741967187):
  success.

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
- Unchanged at the time of the delta: 10.2 (CI evidence), 11.4 (Purpose at archive), 11.7 (PR and
  Linear).

## Post-review delta (adversarial-review, 2026-09-30) — tasks §13

- Correction to the 6.4 wording (task 13.5): the first forced failure removed the visited-path
  check **together with** the `min(depth)` grouping; the failure came from the grouping. With only
  the visited check removed, the depth bound and the grouping still give the same result, so the
  check is performance only (design D6) and no test can isolate it.
- 13.1 RED: a search term containing a NUL character reached Postgres and failed with
  "invalid byte sequence for encoding" (`22021`) in "Invalid read arguments are rejected before
  querying"; the two new unit cases in `read-arguments.spec.ts` failed too.
- 13.2 GREEN: `assertValidSymbolSearch` rejects a term containing `\u0000` with
  `InvalidStoreQuery('name')`; `tests/unit/knowledge` + `graph-read.spec.ts` 58 passed.
- 13.3: "Projects are listed by name" also creates `…-Zeta` and asserts `-Zeta`, `-alpha`,
  `-beta` (no assertion removed or loosened).
- 13.4 forced failures (each restored from a scratch copy and confirmed with `cmp`):
  - NUL check removed → "Invalid read arguments are rejected before querying" fails;
  - `COLLATE "C"` removed from `LIST_PROJECTS` → "Projects are listed by name" fails.
- 13.6: Follow-ups section added to `design.md`; DIS-24 checklist comment `57fb31d7` (pool-mode
  read test, performance measurement), DIS-27 note `8a545b0c` (runtime `null` arguments).
- 13.7: targeted (`tests/unit/knowledge tests/integration/store`) 10 files / 162 passed; full suite
  12 files / 186 passed, 0 failed (70.20 s); `npm run typecheck` OK; `npm run lint` 0 errors
  (3 pre-existing warnings); `npm run lint:architecture` and `npm run docs:coverage` exit 0;
  `npx stryker run` all files 87.86 %, `read-arguments.ts` 90.24 % (37 killed, 4 survived: reason
  strings). Scenario traceability 27 ↔ 27. Data state after: `project` / `file` / `symbol` /
  `edge` = 0 / 0 / 0 / 0.
- 13.8 CI evidence for head `f7f5ce3` (refreshes 10.2): `CI` run
  [36744576706](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36744576706)
  success — `graph-read.spec.ts` (27 tests) and `read-arguments.spec.ts` (17 tests) ran, neither
  skipped, 12 test files passed; `Frontend` run
  [36744576661](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36744576661)
  success. The PR description's scenario table was regenerated with the test line numbers of
  `f7f5ce3`.

## Second adversarial review (2026-09-30) — destinations

Verdict PASS WITH GAPS, no Blocker or Major. Fixed (A): the PR description's scenario table
line numbers and the CI evidence of `f7f5ce3` (above). Deferred, confirmed by the author:

- C — walking through a foreign node with corrupt edges, and testing the seed and walk project
  filters on their own: added to the DIS-24 checklist comment `57fb31d7`;
- B — out-of-enum kinds (`22P02`), next to the runtime `null` arguments: DIS-27 note `8a545b0c`;
- D — non-ASCII `ILIKE` case folding follows the database `LC_CTYPE`: recorded in design D5.

No code changed for these; `design.md` Follow-ups lists each with its destination.

