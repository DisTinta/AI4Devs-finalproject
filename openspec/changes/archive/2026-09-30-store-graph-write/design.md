## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/core/src/ports/StorePort.ts` is an empty interface; `packages/core/src/knowledge/` does
  not exist. Core has no runtime dependency (no Zod).
- `packages/adapters/store-postgres/src/` has only `migrate.ts`; `pg` is already a dependency.
- **No package imports `@codemind/core` yet.** This change is the first cross-workspace import.
  `@codemind/core`'s `main` points to `dist/index.js`, which only exists after `tsc --build`;
  Vitest does not build, and `tests/tsconfig.json` (Bundler resolution) does not list core as a
  reference.
- Schema facts the writer relies on (`0001`–`0003`): unique `file (project_id, path)` and
  `commit (project_id, sha)`; `symbol` has **no natural key**; every FK to `file` cascades
  (`symbol`, `edge`, `file_commit`, `evidence`); nothing but `edge` references `symbol`; the trigger
  `file_content_hash_marks_claims_stale` fires on the `DO UPDATE` branch of an upsert, but **not**
  on `DELETE`: deleting a file cascades its `evidence` and leaves the citing claim `current`; the
  database does not check that edge endpoints, `file_commit` or `evidence` stay inside one project.
- Harness (DIS-22): `db()` is a `pg` `Client` inside a transaction the harness owns; `COMMIT` or
  `ROLLBACK` on it fails the test, a `SAVEPOINT` does not.
- Linear notes on DIS-23 (from DIS-12/13/22) are requirements for this writer: upsert files in
  place, never delete-and-reinsert; stable file order against `40P01`; no cross-project rows;
  cooperate with the harness transaction.

## Goals / Non-Goals

**Goals:**

- A write path that is one transaction, set-based (a fixed number of statements per call, not per
  row), and preserves file ids across reindexes.
- Validation as pure domain logic in core, unit-tested without a database.
- An adapter usable both in production (own pool) and inside the harness transaction.

**Non-Goals (design level):**

- No generic repository/unit-of-work abstraction in core; the transaction boundary stays inside
  the adapter for this slice (DIS-85 may lift it when it orchestrates analyzer + git + store).
- No SQL files or query builder: parameterised SQL strings in TypeScript modules.

## Decisions

### D1 — Domain types in `packages/core/src/knowledge/`

One public concept per file (backend-standards §3):

- `project.ts` — `ProjectLanguage` (`'php' | 'typescript'`), `ProjectFramework`
  (`'laravel' | 'fastify' | 'none'`), `NewProject { name, rootPath, language, framework?, isSample? }`.
- `graph-file.ts` — `FileKind`, `GraphFile { path, kind, loc?, contentHash?, redacted? }`.
- `graph-symbol.ts` — `SymbolKind`, `GraphSymbol { file, name, kind, startLine, endLine, signature? }`
  and `SymbolRef { file, name, startLine }`.
- `graph-edge.ts` — `EdgeKind`, `EdgeResolution`, `EdgeEndpoint = { file: string } | { symbol: SymbolRef }`,
  `GraphEdge { source, target, kind, resolution, extractor, weight? }`.
- `graph-commit.ts` — `GraphCommit { sha, message?, authorHash?, committedAt?, prNumber? }` and
  `GraphFileCommit { file, sha, linesAdded?, linesRemoved? }`.
- `graph.ts` — `KnowledgeGraph { indexedCommit?, files, symbols, edges, commits, fileCommits }`
  and `SaveGraphResult { files, filesDeleted, symbols, edges, commits, fileCommits }`.
  `KnowledgeGraph` deliberately has **no** `framework` (or any other project attribute besides
  `indexedCommit`): `framework` belongs to `NewProject` and is fixed at `createProject`. DIS-85
  detects it before creating the project; changing it later needs its own port operation.
- `errors.ts` — `ProjectNotFound`, `ProjectNameTaken`, `InvalidGraph` (with
  `violations: GraphViolation[]`, each `{ element, field?, message }`). All extend a
  `DomainError` base with a stable `code`, so the transport (later) can map them without
  `instanceof` on adapter errors.
- `validate-graph.ts` — `validateGraph(graph): GraphViolation[]` and
  `assertValidGraph(graph): void` (throws `InvalidGraph`).

Closed sets are `as const` arrays with derived union types, declared once. The enum values mirror
the Postgres enums of `0001`; a unit test is not needed for that mirror because the integration
tests insert every value.

Symbol identity is `(file, name, startLine)` (spec → Graph shape). Alternatives rejected: a
caller-generated `key` (every analyzer would have to invent one) and `(file, name)` (overloads and
same-named methods in different classes of one file collide).

Validation runs at runtime even though the types forbid a missing `resolution`: the graph comes
from analyzers at runtime and the AC (DIS-15) requires the rejection. It collects **all**
violations, not the first one. Edge `weight` range and enum membership are left to the database
(spec → Graph validation, last paragraph) — they need no cross-reference and a `CHECK`/enum already
guards them.

Alternative rejected: validating in the adapter. It is a business rule, so it lives in core; the
adapter calls `assertValidGraph` first (adapters may depend on core).

### D2 — `StorePort` write contract

```ts
export interface StorePort {
  createProject(project: NewProject): Promise<string>;
  saveGraph(projectId: string, graph: KnowledgeGraph): Promise<SaveGraphResult>;
}
```

Reads (`getProject`, `findSymbols`, `neighbors`, …) are added by DIS-24 to the same interface.
Every exported member gets TSDoc (docs:coverage gate).

### D3 — Adapter construction and transaction ownership

`packages/adapters/store-postgres/src/postgres-store.ts` exports
`createPostgresStore(connection)` with

```ts
type StoreConnection = { pool: Pool } | { transaction: ClientBase };
```

- `{ pool }` — each `saveGraph` checks out a client, runs `BEGIN` … `COMMIT` (`ROLLBACK` on error),
  releases the client.
- `{ transaction }` — the caller owns an open transaction. `saveGraph` runs
  `SAVEPOINT store_write` … `RELEASE SAVEPOINT`; on error
  `ROLLBACK TO SAVEPOINT store_write` + `RELEASE`, then rethrows. It never sends `COMMIT` or
  `ROLLBACK`. The harness's `db()` goes here.

Alternatives rejected: detecting whether the client is already in a transaction
(`pg_current_xact_id_if_assigned()` is `NULL` until the first write, so it cannot tell); always
using a `SAVEPOINT` (fails outside a transaction block); an injected "executor" callback (more API
for the same two cases).

`createProject` is a single `INSERT … RETURNING id`, but it goes through the same helper: in
`{ transaction }` mode a failed `INSERT` (duplicate name) would otherwise abort the caller's whole
transaction (`25P02`). Found during apply (task 5.1); both methods share one savepoint name,
`store_write`.

### D4 — `saveGraph` statement plan

1. `assertValidGraph(graph)` (core) → `InvalidGraph`, before touching the connection.
2. Open the transaction or savepoint (D3).
3. `SELECT id FROM project WHERE id = $1 FOR UPDATE`. No row → `ProjectNotFound`. A `projectId`
   that is not a UUID is also `ProjectNotFound`, checked before the query (otherwise Postgres raises
   `22P02`). The row lock serialises concurrent `saveGraph` calls on the same project, which also
   removes the file-order deadlock between two reindexes of one project.
   Step 1 runs first, so an invalid graph is `InvalidGraph` whatever the id (spec → Saving requires
   an existing project).
4. `DELETE FROM edge WHERE project_id = $1`, then
   `DELETE FROM symbol WHERE file_id IN (SELECT id FROM file WHERE project_id = $1)`.
   Symbols are replaced, not upserted: they have no natural key and only edges reference them.
   Consequence, intended (adversarial review 2026-09-30): symbol ids change on every save and any
   `symbol.embedding` is lost. DIS-24 must not expose symbol ids as stable; CM-HU-08 recomputes
   symbol embeddings after each reindex.
5. Mark stale the claims whose evidence the next step cascades away:
   ```sql
   UPDATE claim SET status = 'stale', updated_at = now()
    WHERE project_id = $1 AND status = 'current'
      AND EXISTS (SELECT 1 FROM evidence e JOIN file f ON f.id = e.file_id
                   WHERE e.claim_id = claim.id AND f.project_id = $1 AND f.path <> ALL($2))
   ```
   Same parameters as step 6, and it must run before it: after the delete no evidence is left to
   join. `SaveGraphResult` is unchanged. Alternative rejected for now: a `BEFORE DELETE ON file`
   trigger, which would cover every deleter and not only `saveGraph`, but needs a migration; it may
   be proposed as a separate improvement.
6. `DELETE FROM file WHERE project_id = $1 AND path <> ALL($2)` — files that left the repository;
   the schema cascades their `file_commit` and `evidence`. Result count → `filesDeleted`.
7. Upsert files from `unnest(...)` arrays, `ORDER BY path`,
   `ON CONFLICT (project_id, path) DO UPDATE SET kind, loc, content_hash, redacted`,
   `RETURNING id, path` → path→id map. `embedding` is never written, so a reindex does not clear
   one computed later. The `DO UPDATE` branch fires the stale trigger when the hash changes.
   The snapshot rules: every column in the `SET` list takes `EXCLUDED`, so an omitted `loc` or
   `content_hash` becomes `NULL` (current L1 state, not history).
8. Insert symbols from `unnest(...)` with `file_id` resolved from the map, `RETURNING id, file_id,
   name, start_line` → identity→id map.
9. Insert edges from `unnest(...)`, each endpoint resolved to one of the four FK columns.
10. Upsert commits `ON CONFLICT (project_id, sha) DO UPDATE SET x = COALESCE(EXCLUDED.x, commit.x)`
   for `message`, `author_hash`, `committed_at`, `pr_number`, `RETURNING id, sha` (`DO UPDATE`, not
   `DO NOTHING`, so existing rows are returned). History is only added to: an omitted value keeps
   the stored one. An explicit `null` cannot be told apart from an omitted field (both reach SQL as
   `NULL`), so it also keeps the stored value; clearing a history field is not supported.
11. Upsert `file_commit` `ON CONFLICT (file_id, commit_id)` with the same `COALESCE` rule for
    `lines_added`, `lines_removed`.
12. `UPDATE project SET indexed_commit, indexed_at = now(), node_count = files + symbols,
    edge_count = edges` — exactly these four columns; `name`, `root_path`, `language`,
    `framework` and `is_sample` are never in the `SET` list.
13. Commit or release (D3); return the counts.

`unnest` of typed arrays keeps each table to one statement and one set of parameters, whatever the
graph size (no 65 535-parameter cap, no N+1). Enum columns are passed as `text[]` and cast
(`::file_kind`, …). Empty arrays are valid and write nothing.

Alternative rejected: delete-all-and-reinsert files — loses `file_commit` and `evidence` by cascade
and skips the stale trigger (DIS-12, DIS-13 notes).

### D5 — Error mapping

The adapter maps exactly one Postgres error: `23505` on `project_name_key` in `createProject` →
`ProjectNameTaken`. Every other database error (for example `23514` on `edge_weight_range`) is
rethrown unchanged after the rollback; the spec only requires that the call fails and writes
nothing. `ProjectNotFound` and `InvalidGraph` are raised by the adapter/core code, never mapped
from SQL errors.

### D6 — Resolving `@codemind/core` (first cross-workspace import)

- `packages/adapters/store-postgres/tsconfig.json` gets `references: [{ "path": "../../core" }]`,
  so `tsc --build` builds core first and type-checks against it.
- Vitest resolves `@codemind/core` to `packages/core/src/index.ts` through `resolve.alias` in
  `vitest.config.ts`, so tests never depend on a stale `dist/`. `vitest.stryker.config.ts` inherits
  the alias through `mergeConfig` and is not changed.
- `tests/tsconfig.json` gets a matching `paths` entry for `@codemind/core`.

Alternative rejected: running `tsc --build` before Vitest (slower, and a stale `dist/` would make
tests pass against old code). If the alias approach does not type-check cleanly, stop and ask
before choosing another resolution.

### D7 — Tests

- `tests/unit/knowledge/validate-graph.spec.ts` — the six validation scenarios, on synthetic
  graphs, no database.
- `tests/integration/store/graph-write.spec.ts` — the remaining scenarios on the DIS-22 harness,
  with `createPostgresStore({ transaction: db() })`. Setup rows the store does not write (claim,
  evidence) use plain parameterised SQL in the test body; `createProject` of the store (not the
  harness factory) creates projects, so it is exercised too.
- `tests/integration/store/graph-write-pool.spec.ts` — "Saving on the store's own connections
  commits": the only test that commits to the shared database. It uses a `unique()` project name,
  reads from a second connection, and deletes the project in a `finally` (the cascade removes the
  rest). It does not use `useTransactionPerTest()`. Its graph is the minimum that touches every
  table `saveGraph` writes: 1 file (`src/a.ts`, kind `source`), 1 symbol in it, 1 edge
  symbol→file (`imports`, `exact`, a synthetic extractor), 1 commit (fixed hex sha) and 1
  file–commit link between them, with `indexedCommit` = that sha. The second connection asserts one
  row in each of `file`, `symbol`, `edge`, `commit`, `file_commit` for the project, and
  `node_count` 2 / `edge_count` 1.
- `tests/support/sample-graph.ts` — a small synthetic graph builder shared by unit and integration
  tests (no real names or e-mails; hashes are fixed hex strings).

Every `#### Scenario:` maps to exactly one test, named after it (26 after the post-audit delta, 27
after the post-review delta; the two history/file-value scenarios and "A deleted file marks its
claims stale" live in `graph-write.spec.ts`).

## Risks / Trade-offs

- [Two symbols with the same name on the same start line in one file] → rejected as a duplicate by
  validation, so the analyzer learns early; revisit the identity (add `kind`) if a real analyzer
  hits it.
- [`ORDER BY` inside `INSERT … SELECT` is not a formal lock-order guarantee] → the project row
  lock (D4 step 3) already serialises reindexes of one project, which is the only case that shares
  file rows; cross-project writes never touch the same `file` rows. No `40P01` retry here.
- [The stale trigger updates `claim` rows per changed file inside the write] → fine at fixture
  scale; measured later by DIS-85 on a real repository.
- [Evidence written by another transaction while `saveGraph` runs can miss the invalidation]
  (DIS-13 note) → out of scope: the evidence writer (CM-HU-09/10, DIS-10) must lock the file with
  `SELECT … FOR UPDATE` and re-check the hash. Recorded, not solved here.
- [`{ transaction }` mode trusts the caller to have opened a transaction] → documented in TSDoc; a
  `SAVEPOINT` outside a transaction block fails loudly (`25P01`), so misuse is not silent.
- [First cross-workspace import may break `typecheck`, Vitest or Stryker resolution] → D6, verified
  by a dedicated task before any domain code depends on it.
- [`message` is free repository text and may contain personal data] → stored as given (schema
  decision of DIS-12); test data is synthetic.

## Follow-ups (adversarial review 2026-09-30)

Found by the review and not fixed in this change. The technical ones are recorded as one list in
Linear, a comment on DIS-23 or a single tech-debt issue (task 13.6):

- No test pairs an invalid graph with an unknown or malformed project id, so the "validation
  before project check" order (D4 steps 1 and 3) is unpinned.
- In `{ transaction }` mode, an error from `ROLLBACK TO SAVEPOINT` or `RELEASE` replaces the
  original error.
- The fixed savepoint name `store_write` is unsafe for concurrent calls on one `ClientBase`;
  document "one call at a time per client" or guard it.
- `validateGraph` throws `TypeError` instead of `InvalidGraph` on malformed runtime input
  (`{ symbol: null }` endpoint, missing `source`/`target`, `files`/`edges` not arrays).
- "A reindex keeps file ids, history and evidence" does not assert that the claim stays `current`
  when the hash is unchanged.
- `{ pool }` mode has no automated failure test (`ROLLBACK`, `release(broken)`); only the manual
  step 9.4 covers it.

Added by the second review (same list, no new issue):

- The stale marking of deleted files (D4 step 5) only looks at claims of the saving project, while
  the trigger looks at every project. Evidence citing another project's file (accepted by the
  database, DIS-13 note) loses its claim's invalidation when the file is deleted. No test covers the
  cross-project case, so dropping `f.project_id = $1` or `status = 'current'` from the query would
  go unnoticed.
- The stale query and `DELETE_ABSENT_FILES` filter with `path <> ALL($2)`: cost files × snapshot
  size. Fine at fixture scale, slow on a real repository (DIS-85); an anti-join against
  `unnest($2)` avoids it.
- "A database rejection rolls back the whole write" creates no claim, so it does not show that the
  claim updates (stale query and trigger) are undone on rollback.
- `NaN` and non-integer values (`startLine`, counters) pass `validateGraph` and fail as a database
  error inside the transaction, not as `InvalidGraph` (atomic, nothing written).

Inbound debt, absorbed (closes it for the archive ritual; not moved to another ticket):

- DIS-22 note on DIS-23 (`dc537bdf`): the harness rule "`useTransactionPerTest()` rejects
  concurrent tests" has no automated test. DIS-23 adds no concurrent test and does not touch
  `useTransactionPerTest()`, so the trigger condition of the note is not met. Recorded here as known
  debt of the harness.

Hand-off to DIS-85: `saveGraph` needs the complete snapshot every time. An empty or partial graph
deletes every missing file with its history and evidence, and marks its claims `stale`
(Spanish comment on DIS-85).

Recorded only, no issue:

- Tasks 6.2–6.7 are checked RED → GREEN, but those tests passed on their first run (RED not
  observed; the step 8 report discloses it).
- The change's artifacts are uncommitted, so the order spec → code of §12 is evidenced only by the
  report. Commit them before the PR.

## Migration Plan

No schema migration. Deploy is the merge; rollback is reverting the commit (no stored data depends
on the new code beyond rows written through it, which the schema already allows).
