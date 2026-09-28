## Context

See `proposal.md` — Why. Current state that shapes the approach:

- `packages/adapters/store-postgres` is an empty stub (`src/index.ts` exports nothing), ESM
  (`"type": "module"`), compiled by `tsc --build` with `rootDir: src`. It is the only package allowed
  to contain SQL (`.dependency-cruiser.cjs` `api-no-sql`, `docs/backend-standards.md` §5).
- `.claude/sdd-harness.env` fixes `PATH_MIGRATIONS=packages/adapters/store-postgres/migrations`.
- Root `db:migrate` / `db:rollback` are `node -e` placeholders. CI already runs
  `db:migrate && db:rollback && db:migrate` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/test`,
  then `npx vitest run` with the same URL, against `pgvector/pgvector:pg16`.
- Locally, `docker compose up -d` provides the same image on `5432`.
- No integration-test harness exists yet (DIS-22 depends on this change), and Vitest runs test files
  in parallel with `passWithNoTests: true`.
- `tsx` is already a root devDependency (used by `npm run cli`).

## Goals / Non-Goals

**Goals:**

- A runner that the root scripts, CI and the integration tests all drive through the same entry
  point, so the test exercises exactly what CI and developers run.
- A first migration whose up and down sections are exact inverses.
- Integration tests that cannot interfere with each other or leave the shared database in a
  rolled-back state.

**Non-Goals:**

- A reusable test harness (containers, per-test transactions, factories) — DIS-22 owns it. This
  change uses the minimum inline setup and DIS-22 may replace it.
- Any TypeScript row types or repository code for the tables.
- Enforcing that an edge's endpoints belong to the same project as the edge (see Risks).

## Decisions

### D1 — node-pg-migrate as the migration tool

Chosen by the author. It is PostgreSQL-only, maintained, supports plain `.sql` migrations with up
and down sections, keeps applied state in a `pgmigrations` table, takes an advisory lock, and runs
all pending migrations in a single transaction by default (`singleTransaction: true`), which gives
the "no partial changes" guarantee for free. The spec records that guarantee as a non-normative note
(requirement "Fail clearly without a connection string") rather than a tested scenario; the runner
must not pass `singleTransaction: false`, and task 6.3 checks it. It also exposes a programmatic
`runner({ databaseUrl, dir, direction, count, migrationsTable })`.

Alternatives: a hand-written runner over `pg` (fewer dependencies, but locking, ordering and
bookkeeping become our code to test); postgrator (lighter, less adopted); Prisma/Knex/Drizzle
migrations (bring an ORM or query builder the project does not use). The PR description repeats
this justification (`docs/project-context.md`: no dependency without justification).

Migrations are written in **SQL, not the node-pg-migrate JS DSL**, because `readme.md` §3.1/§3.2
and later sub-issues (CHECKs, partial and HNSW indexes, triggers) are specified in SQL and must be
reviewable as SQL. The exact file layout (single file with `-- Up Migration` / `-- Down Migration`
markers, or the grouped `NNNN_name.up.sql` / `.down.sql` loader) is chosen at apply time from what
the installed major version documents as current; the context7 docs mark the marker form as
"legacy".

### D2 — Runner module and CLI entry

`packages/adapters/store-postgres/src/migrate.ts` exports two typed functions (`migrateUp`,
`migrateDown`) that wrap `runner()` with fixed options: `dir` = the package's `migrations/` folder
resolved from the module location (not from `process.cwd()`), `migrationsTable: 'pgmigrations'`,
`direction`, and `count: 1` for down. It also has a small CLI guard (`up` | `down` argument) that
reads `DATABASE_URL`, exits non-zero with a message naming `DATABASE_URL` when it is missing, and
exits non-zero on any runner error.

Root scripts become:

- `db:migrate` → `tsx packages/adapters/store-postgres/src/migrate.ts up`
- `db:rollback` → `tsx packages/adapters/store-postgres/src/migrate.ts down`

`tsx` avoids requiring a prior `tsc --build` for a DB command and matches how `npm run cli` already
works. Rollback reverts **one** migration per call (node-pg-migrate's default and the conventional
meaning); with a single migration in this change that equals "revert everything".

### D3 — Edge endpoints as two nullable FK pairs + CHECK (author decision)

`readme.md` §3.1 says `source_id`/`target_id` reference "SYMBOL or FILE", which a single FK column
cannot express. Chosen shape:

- `source_symbol_id uuid REFERENCES symbol(id) ON DELETE CASCADE`, `source_file_id uuid REFERENCES file(id) ON DELETE CASCADE`
- same pair for `target_*`
- `CONSTRAINT edge_source_exactly_one CHECK (num_nonnulls(source_symbol_id, source_file_id) = 1)`
- `CONSTRAINT edge_target_exactly_one CHECK (num_nonnulls(target_symbol_id, target_file_id) = 1)`

Alternatives rejected by the author: polymorphic `source_id` + `source_type` without FK (no
referential integrity, no cascade) and a synthetic per-file symbol (adds a `symbol.kind` value not in
§3.1). Consequence: the §3.1 diagram is updated, and the traversal indexes of DIS-13 must be defined
over these columns (DIS-13 will adapt `EDGE(project_id, source_id, kind)` accordingly).

### D4 — Implementation details behind the spec's column contract

The columns, types, nullability and defaults are contract and live in the spec (requirement "L1
column contract"); the constraints (`extractor` not empty, `weight` range, cascades) live in the
table requirements. This section only fixes what the spec leaves to implementation:

- Primary keys: `uuid DEFAULT gen_random_uuid()` (built into PostgreSQL 13+, no extension).
- Enum type names: `project_language`, `project_framework`, `file_kind`, `symbol_kind`,
  `edge_kind`, `edge_resolution` (`CREATE TYPE ... AS ENUM`). Adding a value later is
  `ALTER TYPE ... ADD VALUE` in a new migration.
- Foreign keys: `file.project_id`, `symbol.file_id`, `edge.project_id` and the four edge endpoint
  columns all use `ON DELETE CASCADE`.
- Constraint names, so tests and later migrations can reference them: `project_name_key`
  (unique), `file_project_path_key` (unique `(project_id, path)`), `symbol_start_line_positive`,
  `symbol_span_valid`, `edge_source_exactly_one`, `edge_target_exactly_one`,
  `edge_extractor_not_empty` (`CHECK (extractor <> '')`), `edge_weight_range`
  (`CHECK (weight BETWEEN 0 AND 1)`, which accepts NULL and both bounds).
- The migration starts with `CREATE EXTENSION IF NOT EXISTS vector`; the down section drops tables
  in reverse dependency order (`edge`, `symbol`, `file`, `project`), then the types, then
  `DROP EXTENSION IF EXISTS vector`.
- No secondary indexes beyond those implied by PK/UNIQUE — indexes are DIS-13.

### D5 — Integration tests: throwaway database for the lifecycle, transactions for constraints

- `tests/integration/store/migrations.spec.ts` covers the lifecycle scenarios. It creates a
  uniquely named throwaway database on the server of `DATABASE_URL`, runs the **real commands**
  (`npm run db:migrate` / `db:rollback` via `child_process`, with `DATABASE_URL` pointing at the
  throwaway database) and asserts exit codes, table/type existence and schema identity, then drops
  the throwaway database in `afterAll`. This keeps the shared database migrated for other test
  files running in parallel. The missing-`DATABASE_URL` scenario spawns the command with the
  variable removed.
- Schema identity = an ordered snapshot of `information_schema.columns` (table, column, type /
  `udt_name`, nullability, default), `pg_constraint` (`conname`, `pg_get_constraintdef`) and enum
  labels from `pg_enum`, for the public schema excluding `pgmigrations`; the snapshot after the
  first apply must deep-equal the snapshot after rollback + apply. Because two snapshots can be
  equal and both wrong, the test also checks the column part against a **hand-written expected
  list transcribed from the spec's "L1 column contract" table** (scenario "Migrated schema matches
  the column contract"). Defaults are compared normalised (`false`, `0`, `now()`,
  `gen_random_uuid()`), not by raw `column_default` text casts.
- `tests/integration/store/graph-schema-constraints.spec.ts` covers the table scenarios and the
  defaults scenario. In `beforeAll` it calls `migrateUp` against `DATABASE_URL` (idempotent); each
  test runs inside `BEGIN` … `ROLLBACK` on its own `pg` client, so no rows survive. Rejections are
  asserted by SQLSTATE (`23505` unique, `23502` not-null, `23514` check, `23503` FK, `22P02`
  invalid enum input) rather than by message text. Cascade scenarios delete and then `SELECT`
  inside the same transaction.
- **Avoiding flaky interaction when Vitest runs files in parallel** (minimum mitigation, not the
  DIS-22 harness):
  - `migrations.spec.ts` never touches the shared database's schema: every migrate/rollback runs
    against its own throwaway database, so it cannot roll back tables under the constraints file.
  - `graph-schema-constraints.spec.ts` is the only file that migrates the shared database, and
    `migrateUp` there is idempotent; it never rolls back.
  - Every row a constraint test inserts uses values unique to that test (a `randomUUID()` suffix on
    `project.name` and `file.path`, database-generated ids). Two open transactions inserting the
    same unique value would make the second wait on the first's lock; unique values remove that
    wait and any cross-test coupling. The "duplicate" scenarios build their duplicate from the
    test's own unique value.
  - No test commits; every constraint test ends in `ROLLBACK` (also in `finally` on failure).
- When `DATABASE_URL` is unset: in CI (`process.env.CI` set) the suites fail; locally they are
  skipped with a visible warning, so `npx vitest run` without Docker does not break. This follows
  the existing gotcha that a green run may mean zero tests ran — documented in project-context.

## Risks / Trade-offs

- [Edge endpoints can belong to a different project than `edge.project_id`] → Not enforceable with
  plain FKs across two tables; accepted for L1 and stated as a non-requirement in the spec. The
  analyzer adapters (writers) own consistency; a trigger can be added in a later migration if
  needed. No cross-table CHECK is added here.
- [DIS-13's traversal indexes are specified over `source_id` / `target_id`, which no longer exist]
  → DIS-13 must redefine `EDGE(project_id, source_id, kind)` / `EDGE(project_id, target_id, kind)`
  over `source_symbol_id` / `source_file_id` / `target_symbol_id` / `target_file_id`. This change
  creates none of those indexes; task 11.6 leaves the reminder on DIS-13.
- [`GUARD_DANGEROUS_CMD` in `.claude/sdd-harness.env` matches `DROP TABLE` / `DROP DATABASE`] → The
  hook inspects the **text of shell commands** the agent runs, not SQL inside files nor queries sent
  by the `pg` client. A `DROP` in the migration's down section or issued through `pg` in a test does
  not trigger it; `psql -c "DROP DATABASE …"` typed in the shell does. The agent does not run such
  statements through the shell. If the hook blocks a legitimate step during apply, the agent stops
  and reports; no workarounds.
- [Throwaway database needs `CREATEDB` privilege] → CI and local compose connect as the Postgres
  superuser; documented in the test file.
- [node-pg-migrate major version and ESM/Node 20 compatibility] → Verify the installed version's
  docs (context7) during apply; pin the major in `package.json`.
- [Dropping the `vector` extension on rollback] → Safe while this is the only migration using it;
  once DIS-12/13 add vector-dependent objects, their own down sections run first.
- [`readme.md` §3.1 diverges from the schema until updated] → Update the diagram in the same PR
  (documentation task).

## Migration Plan

- Local: `docker compose up -d`, then `npm run db:migrate`. Rollback with `npm run db:rollback`.
- CI: the existing apply → rollback → apply step now does real work; no workflow edit needed.
- No production data exists; there is nothing to back up or backfill.

## Open Questions

- ~~Single-file SQL with markers vs grouped `.up.sql`/`.down.sql` (D1)~~ — **resolved in task 1.1
  (2026-09-28):** node-pg-migrate 9.0.0 (Node ≥ 20.11) ships a predefined `sql` loader that groups
  `NNNN_name.up.sql` + `NNNN_name.down.sql` into one migration unit (id `NNNN_name.sql`); the marker
  form is the `legacySql` loader. The runner uses
  `migrationLoaderStrategies: [{ extensions: ['.sql'], loader: 'sql' }]` and split files.
