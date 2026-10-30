## Context

See `proposal.md` → Why. Vitest runs the integration files in parallel on one shared database
(`docs/TESTING.md`). Most tests run in the harness transaction of `useTransactionPerTest()`
(`tests/integration/helpers/db.ts`): `READ COMMITTED`, opened before the test and rolled back after
it. A few tests commit on purpose, on a pool of their own, and delete what they committed in a
`finally` (for example `open-store.spec.ts`, the "own connections" tests of `claims-write.spec.ts`,
`query-log-write.spec.ts`, `cache-entry.spec.ts` and `graph-write-pool.spec.ts`, and "answers through
the default pool…" of `ask-command.spec.ts`). Several seed-loading tests load the versioned seed,
whose two sample projects and all their rows have fixed ids, inside their harness transaction.

## Root-cause analysis

*Agent's text.* Evidence: the reproduction runs of task 0.4, before any edit, on commit `6a089ac`
(raw outputs summarised in `reports/2026-10-30-0-reproduction.md`): five runs of
`tests/integration/store` and six of `tests/integration` on the local test database `codemind_test`
(three of them with a sampler of `pg_stat_activity` and `pg_blocking_pids()` every 0.5 s), then the
same unchanged code on a new, empty database `codemind_test_clean` (three runs of each set, as CI
has), plus the deadlock reports of the Postgres log.

### RC1. Global reads under `READ COMMITTED` race other files' commits

A test reads a quantity over the whole database twice (or reads it once after emptying a table) in
`READ COMMITTED`, where every statement takes a new snapshot. A row another file commits in between
changes the result. Observed:

- `open-store.spec.ts` "Work that resolves is committed", "Work that rejects leaves nothing", "Work's
  writes are invisible to another connection before the commit" (F1): `expected 2 to be 1` /
  `expected 4 to be 3` at their `projectCount()` assertion, in 8 of the 17 runs.
- `query-cost.spec.ts` "The cost since an instant is summed across projects": `expected 0.6165 to be
  0.6`. The extra `0.0165` is exactly the `cost_usd` that `query-log-write.spec.ts` "Saving a query log
  entry on the store's own connections commits" commits (its `entry()` default) before deleting its
  project. The test emptied `query_log` and then summed every row since `2026-10-09`; the committed
  row (created now) arrived between the two statements.
- `cli/projects-command.spec.ts` "Sample and user projects are listed": the listing also printed
  `ask-pool-…` and `claims-recent-…`, projects committed by `ask-command.spec.ts` and
  `claims-write.spec.ts` after the test's `DELETE FROM project` (already in Carreras conocidas).
- Not observed, same pattern: `claimCount()` of `api/ask.spec.ts` and `cli/ask-command.spec.ts`
  counts every claim of the database before and after an ask; `claims-write.spec.ts` commits claims
  of its own project during its "own connections" tests (fixed preventively by D3).
  `query-log-write.spec.ts:160` reads `sumCostSince(startOfUtcDay())` before and after its write
  (`before + 0.0165`); within `tests/integration/store` only its own file commits `query_log` rows,
  sequentially; in the whole suite a committed ask (for example `ask-command.spec.ts`'s pool test)
  could add a row in between. Not observed; recorded, not changed (D4).

### RC2. Unscoped writes on the shared tables lock rows other files committed

`DELETE FROM project` and `UPDATE project SET root_path = $1` (no `WHERE`) in a harness transaction
lock every project row committed at that moment, and keep the lock until the test ends. The owner of
that row (its clean-up `DELETE … WHERE id`, or a `FOR SHARE` read of it) then waits for the whole
test, and so does any other unscoped `DELETE` or `UPDATE`. The seed-loading tests also wait for each
other on the fixed sample ids. Together they form chains and cycles:

- Deadlocks (Postgres log, clean database, runs 1 and 2): `api/ask.spec.ts` and `api/reindex.spec.ts`
  failed with `error: deadlock detected` at `UPDATE project SET root_path = $1` of their `seeded()`
  helper, and `api/reindex.spec.ts` and `cli/ask-command.spec.ts` at `loadSeed` (the seed's first
  `INSERT INTO project`). Every reported cycle contains one `UPDATE project SET root_path = $1`
  waiting for a project row that another seed loader's unscoped `DELETE FROM project` had deleted,
  while that loader waited for the sample id the `UPDATE`'s transaction had already inserted. The
  same run failed `cli/seed-load.spec.ts` "Golden answers are loaded and served in evaluation mode"
  (its load exited `1`), in the same seconds.
- The `UPDATE` exists to point the seed's projects at a copy of the fixture; it was written when, after
  the `DELETE`, only the seed's projects were expected to be visible. Under `READ COMMITTED` a
  project committed after the `DELETE` is visible to the `UPDATE` and gets locked.

### RC3. A committed seed in the local test database amplifies RC2

The local `codemind_test` holds a committed sample project `acme-shop` (`is_sample`, `created_at`
`2024-05-06T09:31:00Z`, 53 files, 121 symbols, 3 cache entries, and no `task-api`: a load of an
older seed). No test commits a seed (every `loadSeed` call runs on a harness or savepoint client), so
it came from a `db:seed` run against that database; `docs/TESTING.md` already says the test database
must not be the seeded one, because some specs suppose it has no seed. With that row present, every
test that runs `DELETE FROM project` or `DELETE FROM project WHERE is_sample = true` (the seed
loaders, `graph-read.spec.ts`'s listing) locks the same row and its cascade (`file` → `evidence`,
`cache_entry`, …) until it ends, so they queue one behind the other across files. The sampler saw
143 samples of such waits (each up to 6 s, chained) over three runs, nearly all between
`DELETE FROM project` / `DELETE FROM project WHERE is_sample = true` statements. Observed:

- `store/graph-read.spec.ts` "Listing with no project returns an empty list", `cli/projects-command`
  "An empty database lists no projects", `cli/seed-load` "Loading again changes nothing…" and
  `store/claims-write.spec.ts` "The most recent claims come first, at most twenty": `Test timed out in
  20000ms`, all in the same run (polluted database, run 1 of the whole suite). The error line of the
  previous change's graph-read failure was not recorded
  (`archive/2026-10-30-open-store-test-flake/reports/2026-10-30-3-test-and-state-verification.md:32`);
  its attribution to RC3 rests on this timeout and on its co-occurrence with the claims-refresh
  timeout, not on a matching message.
- F3's `store/claims-refresh.spec.ts` "A failure while refreshing leaves the claim as it was"
  (`10 089 ms` in the previous change): its `CREATE TRIGGER … ON evidence` needs a lock that conflicts
  with the `ROW EXCLUSIVE` on `evidence` that each of those queued transactions holds through the
  cascade of the committed sample (the comment of `explain.spec.ts` "A failed write over the database
  still answers without leaking" describes the same lock, DIS-41). It waits until its own
  `lock_timeout = '10s'` fails it. Not reproduced in the 17 runs of this change, so this is the
  explanation the evidence supports, not a reproduction. On a clean database the same `CREATE TRIGGER`
  still waits for any parallel transaction holding `ROW EXCLUSIVE` on `evidence`: harness tests that
  write evidence (`api/ask`, `cli/ask-command`, `claims-write`, `explain`, seed-load's
  `addHistoryRows`) and unscoped `DELETE FROM project` cascading over a committed project with files.
  RC3 lengthened that wait; removing it does not remove the conflict (D4, "remains").
- On the clean database (three runs of each set) none of the RC3 failures happened: no timeout in
  `graph-read.spec.ts`, `claims-refresh.spec.ts`, `claims-write.spec.ts` or `seed-load.spec.ts`'s
  reload; the failures left were RC1 and RC2.

### RC4. Seed loaders queue on the fixed sample ids (remains)

On the clean database the longest waits (up to 14 s) were seed loaders (`loadSeed`, the seed's first
`INSERT INTO project`) waiting for another file's harness transaction that had loaded the same seed
and was still running a long test (an ask of `api/ask.spec.ts` or `cli/ask-command.spec.ts`). The
sample ids are fixed by the versioned seed (a product artifact), so two transactions that both load
it cannot overlap. No test failed on this alone in the runs, but a 20 s test that loads the seed could
reach its timeout behind a long one; it is recorded in Carreras conocidas, not removed (D4).

The work in those tests is not slow: they wait for locks. Raising a timeout would only make the
queue longer.

## Goals / Non-Goals

**Goals:**

- Remove the observed RC1 and RC2 failures in the tests themselves, keeping what each test proves.
- F1 and F2 of the previous change.
- Restore the local test database to its documented state (RC3) and document how to check it.
- Record in `docs/TESTING.md` → Carreras conocidas every race that is not removed, with its cause and
  mitigation.

**Non-Goals:**

- No production code: RC1–RC3 are test and environment issues, not product defects. The `FOR SHARE`
  read and the unscoped statements belong to the tests or to the test transaction around production
  code.
- No change to `graph-read.spec.ts`, `claims-refresh.spec.ts`, `claims-write.spec.ts`,
  `seed-load.spec.ts`, `cache-build.spec.ts`, `seed-build.spec.ts`, the harness or the specs (D3, D6).
- No timeout or `lock_timeout` raised.

## Decisions

### D1. F1, F2: scope the open-store checks to the test's own project name

In "Work that resolves is committed", "Work that rejects leaves nothing" and "Work's writes are
invisible to another connection before the commit", remove `const before = await projectCount();`
and replace the last line `expect(await projectCount()).toBe(before);` with
`expect(await projectIds(name)).toEqual([]);`. What the global check proved for these tests is that
the test left nothing behind; the only project each test can create is the one named `name`
(`uniqueName()`), so the scoped check proves the same thing and cannot see other files. Every other
line, the order of the assertions and the names of the `it`s stay. `projectCount()` has no caller
left and is removed.

Line 105 of the block comment (F2; line 104, the spec reference, stays) becomes: "Projects created here get a name no
other test uses (`uniqueName`) and are deleted in a `finally`; the three work scenarios then check
that no project of that name is left. Checks never count every project: other files commit and delete
projects in parallel."

### D2. RC1: a rolled-back `REPEATABLE READ` transaction of the test's own for whole-table reads

Where a scenario is about the whole table (the cost of every project since an instant, the listing of
every project), it cannot be scoped by name. Those tests run on a connection of their own in
`BEGIN ISOLATION LEVEL REPEATABLE READ`, always rolled back: the snapshot is taken by the first
statement, so rows committed afterwards by other files are invisible to every later statement,
including the code under test (which receives that client, as it received `db()`). This is the
pattern `graph-read.spec.ts` "Listing with no project returns an empty list" already uses (DIS-41).
At this level a statement that writes a row another transaction changed and committed after the
snapshot fails with `40001`; the whole arrange-and-act is then retried, at most three attempts, and
the assertions run once on the result of the attempt that completed, as in `graph-read.spec.ts`.
Every value an attempt builds (rows' ids, the `failures` and `calls` arrays of "The ceiling survives a
restart", the `log` of `list()`) is created inside `work`; only `work`'s return value reaches the
assertions.

- `store/query-cost.spec.ts`: "The cost since an instant is summed across projects", "With no matching
  row the cost is zero" and "The ceiling survives a restart" move their body from `db()` to a local
  helper `inOwnSnapshot(work)` with that behaviour; their rows, instants, amounts and expected values
  are unchanged. "reads the cost sum on the store's own connections" already runs its own transaction
  on a one-connection pool: its `BEGIN` becomes `BEGIN ISOLATION LEVEL REPEATABLE READ`, and its
  arrange and act are retried on `40001` in the same way (at most three attempts, the transaction
  rolled back between attempts). "sums the cost with a single SELECT and writes nothing" asserts no sum and stays
  on `db()`. The file comment says why.
- `cli/projects-command.spec.ts`: "Sample and user projects are listed" and "An empty database lists no
  projects" move their arrange and act to a local `inOwnSnapshot(work)`; `savepointTransaction` and
  `list` receive that client; the assertions are unchanged. No test of the file uses `db()` any more
  (`tableCounts` reads the snapshot client), so the `describe` drops `useTransactionPerTest()` and
  migrates with `beforeAll(migrateSharedDatabase, 60_000)` as `open-store.spec.ts` does. The file comment says why.

The helper is local to each file (three copies with `graph-read.spec.ts`'s inline loop): a shared
helper in `tests/integration/helpers/db.ts` would add behaviour to the `test-db-isolation` capability
and is left as a follow-up (F4).

*Alternatives:* (a) instants far in the future for the cost tests: no other file writes there, but the
`graph-store` scenarios fix the 2026 instants, so the tests would no longer match them; (b) a
`REPEATABLE READ` option of `useTransactionPerTest()`: harness and spec change (F4); (c) filter the
listing to the test's own names: "An empty database lists no projects" cannot be filtered;
(d) `--no-file-parallelism`: hides the races and takes about four times longer.

### D3. RC2: scope the seed loaders' writes to the seed's projects

In the `seeded()` helpers of `api/ask.spec.ts`, `api/reindex.spec.ts` and `cli/ask-command.spec.ts`:

- `await db().query('DELETE FROM project');` becomes
  `await db().query('DELETE FROM project WHERE name = ANY($1::text[])', [names]);`, where `names` is
  a local `const names = seedProjects(SEED).map((p) => p.name)`, also passed to `loadSeed`. `loadSeed` itself
  deletes the sample projects and refuses a non-sample project that holds a seed name, so this is
  the only deletion these helpers need. Projects of other names are not touched, so other files'
  committed projects are not locked.
- `await db().query('UPDATE project SET root_path = $1', [acmeShop]);` becomes
  `… SET root_path = $1 WHERE is_sample = true`. After `loadSeed` the only visible samples are the
  seed's (any committed sample was deleted inside this transaction), the same rows the unscoped
  statement was meant for.
- The file comments that say every project is deleted (`api/ask.spec.ts:24`,
  `api/reindex.spec.ts:27`, `cli/ask-command.spec.ts:26`) and the `seeded()` doc comments are updated
  to say that only the projects named like the seed's are deleted and only the sample projects are
  pointed at the copy.

`claimCount()` of `api/ask.spec.ts` and `cli/ask-command.spec.ts` counts only the claims of sample
projects (`SELECT count(*)::int AS n FROM claim c JOIN project p ON p.id = c.project_id WHERE
p.is_sample`): every ask in those tests runs on the seed's `acme-shop`, so the counted difference is
the same; claims that other files commit on their own projects no longer count.

The whole-table `DELETE FROM project` of `seed-load.spec.ts`, `cache-build.spec.ts`,
`seed-build.spec.ts` and `projects-command.spec.ts` (inside its own snapshot after D2) stays: those
scenarios need an empty project table. They lock every project committed at that moment until the
test that ran the `DELETE` ends; the owner's clean-up (and any other unscoped `DELETE`) waits that
long. On a clean database such projects exist only while another file's committing test runs; that
remaining wait is recorded in Carreras conocidas.

### D4. RC3: restore the local test database; document the check

Before the stability runs, the committed sample of the local `codemind_test` is removed with
`DELETE FROM project WHERE is_sample = true` (cascade), its counts recorded before and after in the
step 3 report; then the counts of `project`, `cache_entry` and `query_log` are 0. The scratch
database `codemind_test_clean` of the analysis is dropped at the end. Neither is a file change.

`docs/TESTING.md` → Carreras conocidas is rewritten from RC1–RC3: what was removed by this change,
what remains (D2's retry window, D3's whole-table deletes,
`claims-refresh.spec.ts` "A failure while refreshing leaves the claim as it was" — `CREATE TRIGGER`
against `ROW EXCLUSIVE` on `evidence`, bound by `lock_timeout = '10s'`; mitigation: a test database
without a committed seed, or `--no-file-parallelism` — the same conflict in `explain.spec.ts` "A
failed write over the database still answers without leaking" (`CREATE TRIGGER` on `evidence`,
`lock_timeout = '60s'`), RC4's seed loaders (every test that loads the versioned seed in a harness
transaction: `api/ask`, `api/reindex`, `cli/ask-command`, `cli/projects-command`, `cli/verify`, and
the seed-load, cache-build and seed-build commands) — and `query-log-write.spec.ts:160`'s global
sum read twice; the existing entry on
`projects-command.spec.ts` is replaced by D2, and the one on seed-load's "A failed golden save leaves
the database unchanged" is dropped because that test already scopes its snapshot to the seed's and its
own projects), and a check that the test database holds no committed seed
(`SELECT count(*) FROM project WHERE is_sample`, expected `0`) with the command that empties it.
`docs/project-context.md` → "Golden answers tests" repeats that two scenarios race; it is updated to
match.

### D5. Stability pass rule (task 3.1), fixed before the runs

All runs are on the restored `codemind_test` (D4), after every edit of this change:

- At least five consecutive runs of `tests/integration/store` and three consecutive runs of the whole
  `tests/integration`, with files in parallel (the default).
- The step passes only if **every** run is green (0 failed tests).
- Any failure stops the series. It is diagnosed from its raw output (and, for a timeout or deadlock,
  the Postgres log). If its cause can be removed in one of the six test files of task 4.1, the
  artifacts are updated first (`docs/base-standards.md` §7), the fix is applied and both series
  (store and whole suite) restart from run 1. At most two correct-and-restart cycles; a third failure
  is a clean stop reported to the author (destination C). A fix that needs any other test file, or
  a cause that cannot be removed in tests, is recorded in Carreras conocidas with its cause and
  mitigation, and the step is reported as not passed to the author (destination C); the rule is not
  widened. Any outcome other than "passed" (this one or a third failure) is a clean stop: the change's
  work is committed and pushed, the PR may be opened for the author, and tasks 9.3–9.8 (reviews,
  archive, merge) are not run. The merge (9.8) requires the step 5 report to record 5.2 and 5.3 as
  PASS.
- Each run is one tool call with a timeout of at least 420 000 ms.
- Every run executed counts toward the series; a failing run beyond the minimum stops it like any
  other.
- A test-file edit made after 5.2 passed (tasks 9.4–9.6) re-runs both series of 5.2 and the suite of
  5.3 under this rule before 9.8; the result goes to an addendum of the step 5 report.
- Each restart and its reason is recorded in the step 3 report.

### D6. No golden round and no spec delta

The seed fingerprint (`packages/cli/src/seed/fingerprint.ts`) hashes no file under `tests/` or
`docs/`, so the CI `verify` job is unaffected. Every changed test keeps its scenario's data and
expected results; no requirement mentions the global count, the isolation of a test's own transaction
or the scope of a test's clean-up statement: `skip_specs: true`.

## Risks / Trade-offs

- [A `40001` on all three attempts of D2] → needs three commits that touch a row of the snapshot in
  the milliseconds between the snapshot and the first write; recorded in Carreras conocidas.
- [D3 narrows the clean-up of three helpers] → `loadSeed` already deletes the samples and refuses a
  user project with a seed name; no test of those files creates a project of another name before
  `seeded()`.
- [RC3 can come back] → whoever runs `db:seed` against the test database again; the check is
  documented, and a guard in the harness is F4.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. Destinations: A = this change; B = another existing
ticket; C = the author; D = out of scope, recorded.*

| Id | Decision | Destination |
|---|---|---|
| F1 | Follow-up F1 of `archive/2026-10-30-open-store-test-flake`: fixed by D1. | A |
| F2 | Follow-up F2 of the same change (the block comment): fixed by D1. | A |
| F3 | Follow-up F3 of the same change: `graph-read.spec.ts`'s listing timeout is RC3 (removed by D4) and needs no edit. `claims-refresh.spec.ts`'s lock bound is explained (RC3 lengthened a lock conflict that remains on a clean database), not reproduced; it is recorded in Carreras conocidas (D4) and the file is not edited (decision Q1 below). | A |
| Q1 | Spec audit run 1, Q1: keep `claims-refresh.spec.ts` out of scope and record its `CREATE TRIGGER` lock conflict in Carreras conocidas (option a), instead of rewriting how the test makes the evidence insert fail (option b). Least scope; the failure was not reproduced in 17 runs. Not removed by decision, not because it cannot be removed: option (b) stays available to the author (with F4). | A (decided by the agent); C for option (b) |
| F4 | A shared "own snapshot" helper and a harness guard that fails at once on a test database holding a committed sample (`is_sample`) would remove the three local copies of D2 and catch RC3 early. Both add behaviour to `tests/integration/helpers/db.ts` and the `test-db-isolation` spec; left out to keep this change minimal. | C, author |
| F5 | The scope of this change grew from F1–F3 to the RC1/RC2 failures found in the reproduction (`query-cost`, `projects-command`, `ask`, `reindex`, `ask-command`), under the run's goal "remove the remaining intermittent integration-test failures". | A |
| F6 | The run's first instruction said not to merge; during the run (2026-10-30) the author wrote in this session, in Spanish, to take care of everything and merge so the next batch can start (spec audit run 1, Q2: confirmed by that message). The merge goes through the merge gate only (tasks 9.8). | A |
