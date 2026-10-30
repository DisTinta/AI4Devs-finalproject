## Why

The integration suite still fails from time to time when its files run in parallel, as they always do
(`npx vitest run tests/integration/store`, `npx vitest run tests/integration`, and CI's `quality`
job). The previous change under DIS-110,
`openspec/changes/archive/2026-10-30-open-store-test-flake/`, left three follow-ups for the author
(its `design.md` → Follow-ups F1, F2, F3), and the author approved fixing them now under the scope of
DIS-110:

- F1: three `it`s of `tests/integration/store/open-store.spec.ts` compare the global project count
  before and after (`projectCount()`), and fail when another file commits or deletes a project in
  between.
- F2: the comment above that block says the count is checked by every scenario, which is not true.
- F3: `tests/integration/store/claims-refresh.spec.ts` hit its 10 s lock bound and
  `tests/integration/store/graph-read.spec.ts` "Listing with no project returns an empty list" failed,
  both only under the parallel run.

The reproduction runs of this change (`design.md` → Root-cause analysis) found three causes: global
reads that race other files' commits (RC1), unscoped writes that lock rows other files committed and
deadlock with the seed loaders (RC2), and a committed seed left in the local test database that turns
RC2 into queues of 20 s timeouts (RC3). They also showed more failures of the same causes:
`tests/integration/store/query-cost.spec.ts` (`expected 0.6165 to be 0.6`),
`tests/integration/cli/projects-command.spec.ts` (already in Carreras conocidas), and `deadlock
detected` in `tests/integration/api/ask.spec.ts`, `tests/integration/api/reindex.spec.ts` and
`tests/integration/cli/ask-command.spec.ts`.

## What Changes

- `tests/integration/store/open-store.spec.ts`: the three `it`s of F1 check, after their clean-up,
  that no project of their own unique name is left (`projectIds(name)`), instead of comparing the
  global count. `projectCount()` is removed (no caller left). The block comment (F2) states what the
  tests really do.
- `tests/integration/store/query-cost.spec.ts`: the three tests that empty `query_log` and then sum
  it ("The cost since an instant is summed across projects", "With no matching row the cost is zero",
  "The ceiling survives a restart") run on a connection of their own in a `REPEATABLE READ`
  transaction that is always rolled back, with a 1 s `lock_timeout`, retried on a serialization
  failure or lock timeout with a 250 ms pause for up to 10 s (design D2, D2a); the non-scenario test
  "reads the cost sum on the store's own connections" opens its transaction as `REPEATABLE READ` with
  the same policy. A `query_log` row that another
  file commits during the test is then invisible to the sum. Rows, instants, amounts and expected sums
  stay exactly those of the scenarios.
- `tests/integration/cli/projects-command.spec.ts`: both scenarios run the same way, on a connection
  of their own in a `REPEATABLE READ` transaction that is always rolled back, with the same policy
  (design D2a), so a project another file commits during the test is not listed.
- `tests/integration/store/graph-read.spec.ts` (F3): the retry loop of "Listing with no project
  returns an empty list" gets the same policy; its arrange, act and assertion are unchanged (design
  D2b, correction cycle 2 of the stability runs).
- `tests/integration/api/ask.spec.ts`, `tests/integration/api/reindex.spec.ts`,
  `tests/integration/cli/ask-command.spec.ts`: their `seeded()` helper deletes only the projects named
  like the seed's (not every project) and points only the sample projects at the fixture copy
  (`UPDATE … WHERE is_sample = true`, not every project), and their file comments say so; in
  `ask.spec.ts` and `ask-command.spec.ts`, `claimCount()` counts only the claims of sample projects
  (preventive: same cause as RC1, not observed failing).
- `docs/TESTING.md` → Carreras conocidas: rewritten with the causes found, the races that remain
  and how to check that the test database holds no committed seed; `docs/project-context.md` →
  "Golden answers tests" aligned with it.
- The local test database used for the evidence is restored to the documented state (no committed
  sample project); this is an environment action, recorded in the verification report, not a file
  change.
- No behaviour change: no production code, no spec requirement, no migration, no seed input.

## Non-goals

- No change under `packages/**`, migrations, seeds, fixtures, `vitest.config.ts` or CI.
- No new check in the test harness (`tests/integration/helpers/db.ts`) and no change to the
  `test-db-isolation` spec: a guard that refuses a seeded test database is left to the author
  (design Follow-ups).
- No change to `claims-refresh.spec.ts`, `claims-write.spec.ts`, `seed-load.spec.ts`,
  `cache-build.spec.ts` or `seed-build.spec.ts`: their failures came from the committed seed in the
  test database (RC3) or from the helpers changed here (design D3, D4). `graph-read.spec.ts` changes
  only in the retry policy of its listing test (correction cycle 2 of the stability runs, design D2b).
  `claims-refresh.spec.ts` keeps its `CREATE TRIGGER` lock wait, which a clean database shortens but
  does not remove; it is recorded in Carreras conocidas (design F3, Q1) (not removed by decision;
  rewriting how the test makes the evidence insert fail without DDL is left to the author).
- No timeout or lock bound is raised (a 1 s `lock_timeout` is added to the tests' own snapshot
  transactions, which had none; design D2a, D2b).
- No new Linear ticket; no golden round (tests are not an input of the seed fingerprint).
- No change to `.claude/` or `.cursor/`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — `skip_specs: true`. The scenarios these tests implement do not change: their data, instants
and expected results stay as written, and no requirement mentions the global project count or the
isolation level of a test's own transaction.)

## Impact

- Tests: `tests/integration/store/open-store.spec.ts`, `tests/integration/store/query-cost.spec.ts`,
  `tests/integration/cli/projects-command.spec.ts`, `tests/integration/api/ask.spec.ts`,
  `tests/integration/api/reindex.spec.ts`, `tests/integration/cli/ask-command.spec.ts`,
  `tests/integration/store/graph-read.spec.ts` (design D2b).
- Environment: the local test database loses a committed sample left by an old `db:seed` (design D4).
- Docs: `docs/TESTING.md` (Carreras conocidas); `docs/project-context.md` → "Golden answers tests"
  (lines 439-441 repeat Carreras conocidas).
- Seed fingerprint: unaffected (`packages/cli/src/seed/fingerprint.ts` hashes no file under `tests/`).
- Linear: one Spanish comment on DIS-110, which stays Done.

## Privacy and logging impact

None: test and documentation edits only, with synthetic data.
