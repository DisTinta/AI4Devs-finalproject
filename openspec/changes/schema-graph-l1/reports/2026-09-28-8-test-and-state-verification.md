# Test and State Verification Report

- Date: 2026-09-28 (regenerated after the adversarial review; replaces the version written at
  `8c967ba`, which predated the rollback rewrite in `016def8`)
- Change: schema-graph-l1
- Step: 8 — Backend: Run Tests and Verify Data State
- Code verified: base `e3bafe5` plus the working-tree changes committed as the
  `fix(DIS-11): close adversarial-review gaps before archive` commit (runner, tests, docs), then
  re-verified with the CI changes of the `fix(DIS-11): keep DB integration specs out of Frontend and
  Stryker` commit (second adversarial review; see "CI conditions" below). The migration SQL
  (`0001_graph-l1.up.sql` / `.down.sql`) is unchanged from `016def8`: down drops the four tables and
  six enum types with no `IF EXISTS`, and keeps the `vector` extension.

## Commands executed

All with `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (local `docker compose`
Postgres, `pgvector/pgvector:pg16`, compose default credentials).

- `npx vitest run tests/integration/store` (targeted; two consecutive runs for parallel flakiness)
- `npx vitest run` (full suite)
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `npm run db:migrate && npm run db:rollback && npm run db:migrate` (the CI step, run locally)

### CI conditions (reproduced locally by emulating CI; the GitHub workflows were not run)

The first version of this report ran every command with `DATABASE_URL` set and did not run
Stryker. The reason it gave, that `packages/core` "has no mutants", was wrong: Stryker always does
a dry run, and CI never ran these commands without a database. The second adversarial review
found that the Frontend job (`npx vitest run`) and the mutation step (`npx stryker run`) both run
with `CI=true` and no `DATABASE_URL`. Under design D5, `tests/integration/store/support.ts` then
throws when it is imported. Fix: the Frontend step now runs
`npx vitest run --exclude 'tests/integration/**'`; Stryker uses `vitest.stryker.config.ts`, which
excludes `tests/integration/**`; and the mutation step's "any test file?" guard in `ci.yml` ignores
`tests/integration`. D5 is unchanged in the `quality` job, which has Postgres.

Local emulation, each with `CI=1`:

| Job / step emulated | `DATABASE_URL` | Command | Result |
|---|---|---|---|
| Frontend "Unit / component tests" | unset | `npx vitest run --exclude 'tests/integration/**'` ¹ | exit 0, `No test files found` (`passWithNoTests`) |
| D5 still enforced | unset | `npx vitest run` | exit 1, both store specs throw `DATABASE_URL must be set in CI` (expected) |
| `quality` → Mutation testing (the `ci.yml` shell block, verbatim) | unset | guard `find … -prune …` then `npx stryker run` | guard finds no unit test, prints the skip warning, exit 0 |
| Stryker run directly | unset | `npx stryker run` | the dry run no longer loads the store specs (vitest reports `exclude: fixtures/**, node_modules/**, tests/integration/**`). It still exits 1: with no unit tests left, vitest reports `No test files found` and Stryker aborts with `Something went wrong in the initial test run`. This zero-test state existed before this change and is why the guard skips the step. |
| `quality` → Tests | set | `npx vitest run` ¹ | 2 files, 32 passed (34 after the third review) |
| `quality` → Migrations | set | `db:migrate && db:rollback && db:migrate` | exit 0 |

¹ Run locally with `.stryker-tmp/**` excluded as well: the aborted Stryker run left a gitignored
sandbox in `.stryker-tmp/` that vitest would otherwise collect. The repository hook blocks
`rm -rf`, so the folder is still on disk. CI checks out a clean tree without it.

## Test results

- Targeted tests: 34 passed, 0 failed, 0 skipped, in both consecutive runs (32 before the third
  review's two new tests; both counts seen twice in a row)
- Required suite: 2 files, 34 passed, 0 failed, 0 skipped; runtime ≈ 24 s
- Gates (re-run after the CI changes, same results): lint exit 0 (0 errors, 4 pre-existing `no-empty-object-type` warnings on empty ports);
  typecheck exit 0; lint:architecture exit 0 (0 errors, 8 pre-existing `no-orphans` warnings on
  stub packages); docs:coverage exit 0 with no warnings; CI migrate → rollback → migrate exit 0
- Scenario coverage: the 27 `#### Scenario:` in `specs/graph-schema/spec.md` each have a test with
  the identical title. Seven extra tests pin behaviour the scenarios leave half-covered:
  - `Endpoint with both a symbol and a file is rejected (target side)`
  - `Endpoint with neither a symbol nor a file is rejected (source side)`
  - `Weight outside 0..1 is rejected (below the lower bound)` (`weight = -0.1`)
  - `DATABASE_URL is missing on migrate (blank value)` (`DATABASE_URL='   '`)
  - `Roll back a database with nothing applied` (characterisation: exit 0, schema unchanged)
  - `Single-line symbol is accepted` (`start_line = end_line = 1`, boundary of `symbol_span_valid`)
  - `CLI runs when invoked through a linked path` (runner entry point reached through a junction or
    symlink)
- SQLSTATE of the three new constraint tests: `23514 check_violation` in all three
  (`edge_target_exactly_one`, `edge_source_exactly_one`, `edge_weight_range`).

### TDD and mutation evidence (on the current code)

- Blank `DATABASE_URL` (RED → GREEN): before the fix the test failed — the runner tried to connect
  (`getaddrinfo ENOTFOUND base`) instead of reporting the missing variable. After
  `process.env.DATABASE_URL?.trim()` in `migrate.ts` it passes.
- The three new constraint tests passed on first run (the constraints already existed), so they were
  proven able to fail. `0001_graph-l1.up.sql` was loosened in three places —
  `edge_source_exactly_one` to `num_nonnulls(...) <= 1`, `edge_target_exactly_one` to `>= 1`,
  `edge_weight_range` to `CHECK (weight <= 1)` — and the shared DB rolled back and re-migrated.
  Result: exactly the three new tests failed (3 failed | 20 passed); every pre-existing constraint
  test still passed, which confirms the gap the review found. File restored byte-identical
  (`git diff --quiet`), shared DB rolled back and re-migrated with the original SQL.
- Down section, current file (no `IF EXISTS`, no extension drop), two mutations:
  - Deleting the line `DROP TYPE edge_resolution;` → "Roll back the L1 graph migration" and
    "Apply, roll back and apply again" failed (2 failed | 6 passed).
  - Appending `DROP EXTENSION vector;` → "Roll back the L1 graph migration" failed on
    `expect(schema.extensions).toContain('vector')` (1 failed | 7 passed).
  - File restored byte-identical after each mutation (`git diff --quiet`).
- Rollback with nothing applied: checked by hand on an empty temporary database before writing the
  test — `db:rollback` twice in a row prints `No migrations to run!` and exits 0 both times.
- Partial-failure atomicity (task 6.4): `migrate.ts` does not pass `singleTransaction`, so
  node-pg-migrate's default `true` applies; a comment in `migrate.ts` forbids disabling it.
- End-to-end (step 10): not applicable — the change adds no user interface or user workflow; the
  `db:*` CLI scripts are exercised in step 9.
- Notes: no flaky tests, no retries.

### Third adversarial review (same day)

- Single-line symbol, the boundary of `symbol_span_valid`: the test passed on first run, because
  the constraint is already `>=`. Mutation: the CHECK was changed to `end_line > start_line` in
  `0001_graph-l1.up.sql` and the shared DB rolled back and re-migrated. Exactly this test failed
  (1 failed | 23 passed; `23514`, constraint `symbol_span_valid`). The file was restored
  byte-identical (`git checkout`, `git diff --quiet`), then rolled back and re-migrated. The live
  constraint reads `CHECK ((end_line >= start_line))`.
- Entry point, RED → GREEN. Before the fix, running the runner through a directory junction
  (`npx tsx <junction>/migrate.ts up`, `DATABASE_URL` unset) exited **0** and printed nothing: the
  CLI was skipped without migrating. A different drive-letter case did not reproduce the problem,
  because tsx keeps the path as given. The new test failed (`expected +0 not to be +0`). After the
  fix, which compares `realpathSync` paths and folds case on win32, it passes, and the manual
  junction run exits 1 with the `DATABASE_URL` message. The test removes its link with `unlinkSync`,
  never with a recursive delete, and `packages/adapters/store-postgres/src` was checked intact
  afterwards.
- `runCommand` / `runNpmScript` now pass `timeout: 45 s` to `spawnSync`, below the 60 s timeout of
  the smallest test. A hung child is killed and reported in stderr instead of blocking the event
  loop.
- `make up` and `DATABASE_URL`: the Makefile now includes and exports `.env` when it exists.
  `make` is not installed on this machine (neither Git Bash nor WSL), and a deny rule blocks
  creating `.env`, so `make up` itself was **not** run. Evidence instead:
  - GNU make 4.x in a throwaway `alpine:3.20` container ran over a copy of the Makefile, with a
    synthetic `.env` holding the `.env.example` connection string. A probe recipe saw
    `DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind`; without `.env` it saw
    `<unset>`. `make -n up` still lists `npm run db:migrate` as the third step.
  - `DATABASE_URL=postgresql://…/codemind npm run db:migrate` (the `.env.example` value and scheme)
    → `No migrations to run!`, exit 0.
  - With `DATABASE_URL` unset, `npm run db:migrate` → exit 1, `DATABASE_URL is not set` (spec
    unchanged; no default in `migrate.ts`).
  - **Real run by the human (2026-09-28, after `283c349`):** after installing GNU make and running
    `cp .env.example .env`, `make up` was run in Git Bash with no `DATABASE_URL` in the shell.
    Every step ran in order: `docker compose up -d` (Postgres already running), `npm install`,
    `npm run db:migrate` → `No migrations to run!` (the `.env` value reached the runner),
    `npm run db:seed` → placeholder message, and `npm run dev` → Vite on `:5173` and the API
    listening on `:3000`. This closes the Major. The container evidence above is kept as a
    supplement.
- Re-run after these changes: store tests 34/34 twice, full suite 34/34, lint / typecheck /
  lint:architecture / docs:coverage exit 0 (same pre-existing warnings), CI migrate → rollback →
  migrate exit 0. The Frontend emulation (`CI=1`, no DB, integration excluded) still exits 0.

## Data state verification

- Pre-test baseline (shared DB, captured after the mutation proofs and before the verification
  runs):
  - `public` tables: `edge`, `file`, `pgmigrations`, `project`, `symbol`
  - `pgmigrations`: `0001_graph-l1`
  - rows in `project` / `file` / `symbol` / `edge`: 0 / 0 / 0 / 0
  - extensions: `plpgsql`, `vector`
  - databases: `codemind`, `postgres`, `template0`, `template1`
- Post-test validation (after both targeted runs, the full suite, the gates and the CI sequence): identical to the baseline on every line above — no leftover throwaway database, no
  test rows, migration applied.
- State restored: Yes
- Restoration actions: none needed after the verification runs. Earlier, after the constraint
  mutation, `db:rollback` + `db:migrate` with the restored SQL. The temporary database used for the manual rollback check was
  dropped immediately.

## UI evidence (if applicable)

- (none — the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
