# Test and State Verification Report

- Date: 2026-09-29
- Change: store-graph-write
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

All with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (local
`docker compose` Postgres, `pgvector/pgvector:pg16`), unless stated otherwise.

- `docker compose exec -T postgres psql -U codemind -d codemind -At -c "<counts>"` (before and after)
- `npx vitest run tests/unit/knowledge tests/integration/store/graph-write.spec.ts tests/integration/store/graph-write-pool.spec.ts` (twice)
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run`
- `env -u DATABASE_URL CI=true npx vitest run --exclude 'tests/integration/**'` (Frontend workflow reproduction)

## Test results

- Pre-change baseline (task 0.5): `npx vitest run tests/integration` → 6 files, 107 passed.
- Targeted tests: 4 files, 31 passed, 0 failed, 0 skipped — run 1 2.90 s, run 2 3.14 s (no flakiness).
  - `tests/unit/knowledge/validate-graph.spec.ts`: 11 (6 scenarios + 5 rule tests added after mutation testing)
  - `tests/unit/knowledge/errors.spec.ts`: 2
  - `tests/integration/store/graph-write.spec.ts`: 17 scenarios
  - `tests/integration/store/graph-write-pool.spec.ts`: 1 scenario
- Required suite: `npx vitest run` → 10 files, 138 passed, 0 failed, 0 skipped, 68.6 s (107 + 31).
- Gates: lint exit 0 (3 pre-existing `no-empty-object-type` warnings on the other empty ports; was 4,
  `StorePort` is no longer empty); typecheck exit 0; lint:architecture exit 0 (0 errors, 8 `no-orphans`
  warnings, the same count as before the change); docs:coverage exit 0.
- Frontend exclusion with `CI=true` and no `DATABASE_URL`: 2 files, 13 passed, no import error (the
  unit tests resolve `@codemind/core` through the Vitest alias, design D6).
- Mutation testing (`npx stryker run`, `packages/core`): **86.82 %** total (threshold 70).
  - `validate-graph.ts` 86.84 %, `errors.ts` 84.62 %, `graph-symbol.ts` 100 %.
  - First run, with only the six scenario tests: 67.59 % (below threshold). Survivors showed spec rules
    without a test (a symbol's file missing, duplicate commit / file–commit link, dangling link file,
    malformed endpoint, boundary values 0 and one-line spans) and redundant code (`?.` on a value
    already narrowed, `link.sha === ''` covered by not registering empty shas). Refactored and added
    the five rule tests plus `errors.spec.ts`. The 16 survivors left are message text literals.
- Scenario → test mapping: all 24 `#### Scenario:` of `specs/graph-store/spec.md` map to exactly one
  test named after it (checked by grep, task 7.2).
- Notes:
  - TDD: RED was observed for 3.2 (6/6 failing), 5.1, 6.1a and 6.1b. The tests of 6.2–6.7 were written
    after `writeGraph` already implemented the whole D4 plan and passed at first run; the forced failures
    below show that the key ones can fail.
  - No retries were needed.

### Forced failures (task 6.9)

Each mutation was applied to the source, the suite run, and the file restored from a scratchpad copy;
`cmp` confirmed it identical each time.

| # | Mutation | Result |
|---|----------|--------|
| F1 | `DELETE_ABSENT_FILES` deletes every file of the project (delete-and-reinsert) | 3 failed: "A reindex keeps file ids, history and evidence", "A changed content hash on reindex marks its claims stale", "A file missing from the snapshot is deleted" |
| F2 | `{ transaction }` mode sends `BEGIN`/`COMMIT` instead of the savepoint (run with `-t "does not commit it"`) | 1 failed: "Saving inside the caller's transaction does not commit it" — "Harness transaction was committed or ended early (opened as 10946, now none)" |
| F3 | `saveGraph` skips `assertValidGraph` | 1 failed: "A rejected graph writes nothing" — the database raised `null value in column "resolution"` instead of `InvalidGraph` |

F2 committed one test project to the shared database, as expected from the mutation. It was removed
right after with `DELETE FROM project WHERE name LIKE 'graph-write-%'` (1 row; the schema cascaded its
files), and the counts went back to 0.

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`
  - `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0, `evidence` 0
- Post-test validation:
  - `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit` 0, `claim` 0, `evidence` 0
  - No leftover `graph-write-pool-*` project: the pool test deletes its project in `finally`.
- State restored: Yes (only after F2, see above; the regular suite leaves nothing behind).
- Restoration actions: `DELETE FROM project WHERE name LIKE 'graph-write-%'` after F2.

## End-to-end testing (step 10.1)

Not applicable: the change adds no HTTP route, CLI command or web change. The interface is the
`StorePort` implementation, exercised in step 9.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none. The CI evidence of step 10.2 is added after pushing.

## Post-audit delta (tasks 12.1–12.5, 2026-09-30)

Origin: `/verify-against-spec` found that the upserts of `commit` and `file_commit` overwrote stored
history with `NULL` when a snapshot omitted an optional field, and that two tests checked less than
their scenario. Decision signed by the author: history (`commit`, `file_commit`) keeps a stored value
the snapshot omits (`COALESCE`); files follow the snapshot. Spec, design and tasks updated through
`/opsx:update` first (26 scenarios).

### Changes

- `packages/adapters/store-postgres/src/queries.ts`: `UPSERT_COMMITS` and `UPSERT_FILE_COMMITS` set
  each optional column to `COALESCE(EXCLUDED.<col>, <table>.<col>)`; TSDoc updated. `UPSERT_FILES`
  unchanged.
- `tests/integration/store/graph-write.spec.ts`:
  - new "An omitted history value keeps the stored one" and "A file's optional values follow the
    snapshot";
  - "A first save persists the whole graph" strengthened: a real `signature` and `committedAt`, and
    the four stored edges checked by endpoints, `kind`, `resolution`, `extractor` and `weight`;
  - "A reindex keeps file ids, history and evidence" strengthened: the second snapshot keeps the
    hash of `src/a.ts` but changes its `loc`, the symbols, the edges and adds a commit and a link;
    it asserts the same id, the new `loc`, the links `first, second, third` and the evidence row.
  - No existing assertion removed or loosened.

### TDD evidence (each mutation restored from a scratch copy, `cmp` identical)

| Test | Observation |
|---|---|
| An omitted history value keeps the stored one | RED on the old SQL: `message` expected `m1`, received `null`. GREEN after 12.2 |
| A file's optional values follow the snapshot | green on the current code (it pins the file rule); `loc = COALESCE(EXCLUDED.loc, file.loc)` in `UPSERT_FILES` → fails (`loc` 10, expected `null`) |
| A first save persists the whole graph (strengthened) | `symbol.signature ?? null` → `null` fails on `signature`; `commit.committedAt ?? null` → `null` fails on `committed_at` |
| A reindex keeps file ids, history and evidence (strengthened) | `DELETE_ABSENT_FILES` made to delete every file → fails on the file id |

### Results

- `npx vitest run tests/unit/knowledge tests/integration/store`: 8 files, 116 tests passed.
- `npx vitest run`: 10 files, 140 tests passed (138 before the delta + 2 new).
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, 3 warnings, all of them already there before the delta
  (`@typescript-eslint/no-empty-object-type` on the empty `AnalyzerPort`, `GitPort` and `LlmPort`
  stubs, untouched).
- Scenario ↔ test: 26 `#### Scenario:` headings, each matched by exactly one test of the same name.
- Data state after the runs: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit`
  0, `claim` 0, `evidence` 0, equal to the baseline.
- Status: PASS. Tasks 10.2 and 11.6 still open (CI, PR, Linear).

## Post-review delta (tasks 13.1–13.4, 2026-09-30)

Origin: `/adversarial-review` (Major) found that deleting a file absent from the snapshot cascades
its `evidence` while the stale trigger fires only on `UPDATE`, so a claim citing only that file
stayed `current`. Decision signed by the author: fix it inside this change, in the adapter, with no
new migration (a `BEFORE DELETE` trigger may be proposed separately). Spec, design, proposal and
tasks updated through `/opsx:update` first (27 scenarios).

### Changes

- `packages/adapters/store-postgres/src/queries.ts`: new `MARK_CLAIMS_STALE_FOR_ABSENT_FILES`
  (design D4 step 5), with TSDoc.
- `packages/adapters/store-postgres/src/save-graph.ts`: runs it right before
  `DELETE_ABSENT_FILES`, with the same parameters; step comments renumbered to the new D4.
- `tests/integration/store/graph-write.spec.ts`: new "A deleted file marks its claims stale" (`c1`
  cites `src/b.ts`, `c2` cites only `src/a.ts`; snapshot with only `src/a.ts`, same hash). No
  existing test changed.

### TDD evidence (mutation restored from a scratch copy, `cmp` identical)

| Test | Observation |
|---|---|
| A deleted file marks its claims stale | RED on the old code: `c1` expected `stale`, received `current`. GREEN after 13.2 |
| same | new query moved after `DELETE_ABSENT_FILES` → fails again (`c1` `current`) |

### Results

- `npx vitest run tests/unit/knowledge tests/integration/store`: 8 files, 117 tests passed.
- `npx vitest run`: 10 files, 141 tests passed (140 before the delta + 1 new).
- `npm run typecheck`: exit 0. `npm run docs:coverage`: exit 0.
- `npm run lint`: 0 errors, 3 warnings, the same pre-existing ones (`no-empty-object-type` on
  `AnalyzerPort`, `GitPort`, `LlmPort`). `npm run lint:architecture`: 0 errors, 8 warnings, unchanged.
- Scenario ↔ test: 27 `#### Scenario:` headings, each matched by exactly one test of the same name.
- Data state after the runs: `project` 0, `file` 0, `symbol` 0, `edge` 0, `commit` 0, `file_commit`
  0, `claim` 0, `evidence` 0, equal to the baseline.
- Follow-ups (13.6): one Spanish comment on DIS-23 with the six technical minors, comment id `0d22803f-8027-4907-b7a6-981f0a4feeb9`.
- Status: PASS. Tasks 10.2 and 11.6 still open (CI, PR, Linear status).

## Second-review fixes (2026-09-30)

Origin: the second `/adversarial-review` (PASS WITH GAPS, no Major). Fixed now, as the author decided:

- "Saving to an unknown project fails" and "Saving with a malformed project id fails" no longer
  compare whole-database row counts read twice (flaky while `graph-write-pool.spec.ts` commits and
  deletes in parallel). They now assert that the test's own transaction wrote no row
  (`rowsWrittenHere`: visible rows whose `xmin` is still `in progress`; `xmin = pg_current_xact_id()`
  alone would miss the subtransaction xid of the store's `SAVEPOINT`, checked in `psql`).
  Proof it can fail: a successful `saveGraph` added before the assertion → fails with
  `file 2, symbol 3, edge 4, commit 2, file_commit 3`; restored, `cmp` identical.
- The wrong comment about 22P02 in "Saving with a malformed project id fails" corrected.
- TSDoc of the accepted UUID form (hyphenated 8-4-4-4-12 only) in `postgres-store.ts` and on
  `StorePort.saveGraph`.
- `npx vitest run tests/unit/knowledge tests/integration/store`, twice: 8 files, 117 tests passed
  both times. `typecheck`, `docs:coverage` exit 0; `lint` 0 errors, 3 pre-existing warnings.
- Linear: comment `0d22803f` on DIS-23 extended with the four new debt items and the absorbed DIS-22
  note (`dc537bdf`); hand-off on DIS-85 (comment `8efe98b2`): `saveGraph` needs the complete snapshot.

## CI evidence (task 10.2)

- PR #9 (https://github.com/DisTinta/AI4Devs-finalproject/pull/9), head `9488789`.
- CI run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36726481341 (job `quality`,
  pass, 1m40s). Step `Tests` (`npx vitest run`): `tests/integration/store/graph-write.spec.ts` 20
  tests, `tests/unit/knowledge/validate-graph.spec.ts` 11 tests,
  `tests/integration/store/graph-write-pool.spec.ts` 1 test, all ran and passed, none skipped;
  10 files, 141 tests passed. Stryker in the same job: mutation score 86.82 % (threshold 70).
- Frontend run https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/36726481178: pass.
