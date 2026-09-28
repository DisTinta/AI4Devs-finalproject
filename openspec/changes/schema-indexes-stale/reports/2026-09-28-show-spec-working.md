# Show spec working — schema-indexes-stale

- Date: 2026-09-28
- Change: schema-indexes-stale (DIS-13)
- Code exercised: `feature/DIS-13-schema-indexes-stale` at `59b977c`, plus the `/verify-against-spec` fixes to `0003`
  (trigger `AFTER UPDATE ON file` guarded only by `WHEN`, function `SET search_path = public`), re-run
  after them
- System: local `docker compose` Postgres (`pgvector/pgvector:pg16`, healthy, pgvector 0.8.6).
  Shared DB: `postgres://codemind:codemind@localhost:5432/codemind`.
- Interfaces:
  - the root npm scripts `db:migrate` / `db:rollback`;
  - the database itself: the catalog (`pg_index`, `pg_constraint`, `pg_trigger`, `pg_proc`) and
    plain SQL `UPDATE file SET content_hash = …`, the way the future writers (CM-HU-02.2, 05b) will
    reach the trigger.

  There is no browser UI, so Playwright does not apply.
- Driver: [`2026-09-28-demo.mjs`](./2026-09-28-demo.mjs), independent of the Vitest suite.
  - Part A runs the real npm scripts against five throwaway databases.
  - The reference state "0001 + 0002 only" is built with node-pg-migrate's `runner`, using the same
    options as `migrate.ts`.
  - The index contract is **parsed live from the delta spec table**, not taken from the test's
    transcription.
  - Part B issues SQL on the shared DB, each scenario inside its own `BEGIN` … `ROLLBACK`.
  - Full verbatim output: [`2026-09-28-demo-output.txt`](./2026-09-28-demo-output.txt).
  - The driver imports `node-pg-migrate`, which is declared only in
    `packages/adapters/store-postgres/package.json`. It resolves from the repo root because npm
    workspaces hoist it to the root `node_modules`. Run it from the repo root after `npm ci`.
- Command: `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind node openspec/changes/schema-indexes-stale/reports/2026-09-28-demo.mjs`
  → exit 0, `SUMMARY: 14 scenarios exercised, 14 match the spec, 0 do not`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Roll back only the latest migration | `db:migrate` then one `db:rollback` | exit 0. `0003` DOWN only. 30 → 13 indexes, trigger and function gone, ten tables kept. `pgmigrations` = `0001, 0002`. Snapshot **identical** to the 0001 + 0002 reference | yes | log [A1] |
| Roll back the L1 graph migration | from "only L1 applied", `db:rollback` | exit 0, `0001` DOWN, no table and no enum | yes | log [A2] |
| Roll back both migrations leaves an empty schema | from "0001 + 0002 applied", two `db:rollback` | exits 0/0, no table and no enum, `vector` kept | yes | log [A3] |
| Roll back every migration leaves an empty schema | `db:migrate`, then one `db:rollback` per applied migration | 3 calls, all exit 0. No table, enum, index, trigger or function. `pgmigrations` empty, `vector` kept | yes | log [A4] |
| Apply, roll back and apply again | one rollback + migrate; then a full cycle (3 rollbacks + migrate) | both snapshots identical to the first, indexes, triggers and functions included | yes | log [A5] |
| Migrated schema has the query and vector indexes | catalog vs the spec table | 17 spec rows, 17 secondary indexes, 0 missing, 0 extra (columns in order, method, HNSW opclass, predicate) | yes | log [A6] |
| Every cascading foreign key is indexed | `pg_constraint` (`confdeltype = 'c'`) vs `pg_index.indkey[0]` | 15 cascading FKs, all lead an index | yes | log [A7] |
| Changing a file's content hash marks the claims that cite it stale | `UPDATE file SET content_hash = 'h2'` (was `h1`) | `current` → `stale`, `updated_at` 2000-01-01 → transaction time (`now()`) | yes | log [B1] |
| Claims citing only other files stay current | change file B, claim cites A | `current`, `updated_at` unchanged | yes | log [B2] |
| Updating other columns of a file leaves its claims current | `UPDATE file SET loc = 120, redacted = true` | `current`, `updated_at` unchanged | yes | log [B3] |
| Writing the same content hash again leaves claims current | `h1` → `h1` | `current`, `updated_at` unchanged | yes | log [B4] |
| Setting a first content hash marks the claims that cite it stale | `NULL` → `h1` | `stale` | yes | log [B5] |
| A claim already stale is not touched | `h1` → `h2` on a `stale` claim | `stale`, `updated_at` unchanged (2000-01-01) | yes | log [B6] |
| A claim citing several files becomes stale when one of them changes | only file B changes | `stale` | yes | log [B7] |

## Evidence

Verbatim excerpts. The complete run is in [`2026-09-28-demo-output.txt`](./2026-09-28-demo-output.txt).

```text
reference DB (0001 + 0002 only, via runner): tables 10, enums 11, indexes 13, triggers (none), functions (none), extensions vector

[A1] after migrate: tables 10, enums 11, indexes 30, triggers file_content_hash_marks_claims_stale, functions mark_claims_stale_on_content_change, extensions vector
      | ### MIGRATION 0003_indexes-stale (DOWN) ###
    after rollback: tables 10, enums 11, indexes 13, triggers (none), functions (none), extensions vector; pgmigrations: 0001_graph-l1, 0002_history-claims; snapshot == reference: true
[A4] 3 rollbacks, exits 0/0/0; tables 0, enums 0, indexes 0, triggers (none), functions (none), extensions vector; pgmigrations: (none)
[A5] one rollback: second == first (incl. indexes, triggers, functions): true
    full cycle (3 rollbacks): second == first: true
[A6] spec rows parsed: 17; secondary indexes in catalog: 17
      edge(source_symbol_id, kind) btree WHERE source_symbol_id IS NOT NULL
      claim(project_id, status) btree WHERE status = 'stale'
      file(embedding) hnsw vector_cosine_ops
      … (all 17 in the output file)
    missing: (none); extra: (none)
[A7] indexed commit.project_id / file.project_id / file_commit.file_id   ← via their PK or UNIQUE
     indexed edge.* / symbol.file_id / evidence.* / claim, query_log, cache_entry.project_id / file_commit.commit_id  ← via 0003

[B1] before: status=current updated_at=2000-01-01T00:00:00.000Z
     after:  status=stale   updated_at=2026-09-28T18:52:26.306Z
[B4] after h1 → h1:        status=current updated_at=2000-01-01T00:00:00.000Z
[B5] after NULL → h1:      status=stale
[B6] after (already stale): status=stale  updated_at=2000-01-01T00:00:00.000Z

SUMMARY: 14 scenarios exercised, 14 match the spec, 0 do not
```

The error path of the scripts is unchanged by this change and is not re-run here. With
`DATABASE_URL` unset the scripts exit non-zero with a message that names the variable; that case is
covered by the suite and by `2026-09-28-7-manual-interface-testing.md`.

No screenshots: the change has no browser UI.

## State

- **Before:**
  - `pgmigrations` = `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`;
  - 0 rows in each of the ten tables;
  - 30 indexes in `public`;
  - databases `codemind, postgres, template0, template1`.
- **After:** identical (`STATE RESTORED (identical): true`).
- **Restored:** yes.
  - Part B never committed anything: each scenario ran inside its own `BEGIN` … `ROLLBACK`.
  - The five throwaway databases (`codemind_demo_*`) were dropped in `finally`, including the
    reference one. None is left on the server.

## Not demonstrated

- All 14 scenarios of the delta spec were demonstrated.
- Outside the delta: query latency and plan choice on real data volumes are non-goals of this
  change (CM-HU-02.3). The `EXPLAIN` check of D3 is in report 6.

## Handoff

The change is **demonstrably working**. Every scenario of the delta spec was exercised against the
real scripts and the real database, and the outcome matched its THEN exactly. That covers both
parts of the DoD:

- a `content_hash` change turns the claims that cite the file `stale`, with no application code;
- the indexes exist in the catalog, with the shape the spec fixes.

The shared database is back to its prior state, and no screenshot or other file was left at the
repository root.
