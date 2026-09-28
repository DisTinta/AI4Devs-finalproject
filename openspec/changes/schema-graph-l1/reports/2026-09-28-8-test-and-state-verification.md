# Test and State Verification Report

- Date: 2026-09-28 (regenerated after the adversarial review; replaces the version written at
  `8c967ba`, which predated the rollback rewrite in `016def8`)
- Change: schema-graph-l1
- Step: 8 — Backend: Run Tests and Verify Data State
- Code verified: base `e3bafe5` plus the working-tree changes committed as the
  `fix(DIS-11): close adversarial-review gaps before archive` commit (runner, tests, docs). The migration SQL
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
- `npm run db:migrate && npm run db:rollback && npm run db:migrate` (CI step reproduced)

Stryker was not re-run: it mutates only `packages/core`, which has no mutants yet, so it gives no
signal on this change.

## Test results

- Targeted tests: 32 passed, 0 failed, 0 skipped, in both consecutive runs (≈ 23 s each)
- Required suite: 2 files, 32 passed, 0 failed, 0 skipped; runtime ≈ 24 s
- Gates: lint exit 0 (0 errors, 4 pre-existing `no-empty-object-type` warnings on empty ports);
  typecheck exit 0; lint:architecture exit 0 (0 errors, 8 pre-existing `no-orphans` warnings on
  stub packages); docs:coverage exit 0 with no warnings; CI migrate → rollback → migrate exit 0
- Scenario coverage: the 27 `#### Scenario:` in `specs/graph-schema/spec.md` each have a test with
  the identical title. Five extra tests pin behaviour the scenarios leave half-covered:
  - `Endpoint with both a symbol and a file is rejected (target side)`
  - `Endpoint with neither a symbol nor a file is rejected (source side)`
  - `Weight outside 0..1 is rejected (below the lower bound)` (`weight = -0.1`)
  - `DATABASE_URL is missing on migrate (blank value)` (`DATABASE_URL='   '`)
  - `Roll back a database with nothing applied` (characterisation: exit 0, schema unchanged)
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
