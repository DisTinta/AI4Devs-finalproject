## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `StorePort` (`packages/core/src/ports/StorePort.ts`) has `createProject` and `saveGraph`. The
  adapter `createPostgresStore(connection)` takes `{ pool }` or `{ transaction }`; writes run in
  `BEGIN`/`COMMIT` or in `SAVEPOINT store_write` (`postgres-store.ts` → `atomically`). SQL lives in
  `queries.ts`. Domain errors live in `packages/core/src/knowledge/errors.ts` with a stable `code`.
- Schema (`0001`, `0003`): `symbol` has no `project_id`; it reaches its project through
  `file.project_id`. Each edge endpoint is a pair of nullable FKs (`*_symbol_id`, `*_file_id`),
  exactly one non-null. `edge.project_id` is set by the writer; the database does not check that
  endpoints belong to it. Partial indexes lead with each endpoint column plus `kind`
  (`edge_source_symbol_kind_idx`, `edge_source_file_kind_idx`, …); `symbol_file_id_idx` and
  `file_project_path_key` exist. No trigram index on `symbol.name`.
- DIS-23 handoff: symbol ids change on every `saveGraph` (symbols and edges are replaced); file ids
  survive while the path stays (upsert by `(project_id, path)`).
- Harness (DIS-22): `db()` is a client inside a test-owned transaction; `COMMIT`/`ROLLBACK` on it
  fails the test. The shared database may hold other projects (seed, manual runs).
- Scope decisions from the author (2026-09-30): mixed nodes (symbol and file seeds and results),
  case-insensitive substring search, `hops` in 1..3 enforced by the port; no direction parameter,
  no `listFileHashes`.

## Goals / Non-Goals

**Goals:**

- Four reads with the exact semantics of the delta spec, each one database round trip at most
  (zero when the arguments are invalid or the project id is malformed).
- `neighbors` as one `WITH RECURSIVE` statement that detects cycles and stops at `hops`.
- Argument validation as pure core logic, unit-tested without a database.

**Non-Goals (design level):**

- No query builder or SQL files: parameterised SQL strings in `queries.ts`, as for writes.
- No caching of reads in the adapter; no read replicas; no read transaction isolation beyond the
  default (`READ COMMITTED`).

## Decisions

### D1 — Read models in `packages/core/src/knowledge/`

New file `graph-read.ts` (one concept family: what reads return), re-exported from
`knowledge/index.ts`:

- `Project { id, name, rootPath, language, framework?, isSample, indexedCommit?, indexedAt?: Date,
  nodeCount, edgeCount, createdAt: Date }` — in `project.ts`, next to `NewProject`.
- `StoredFile { id, path, kind: FileKind }`.
- `StoredSymbol extends SymbolRef { id, kind: SymbolKind, endLine, signature? }` — `file`,
  `name`, `startLine` come from `SymbolRef`, so the natural identity is the same shape the write
  side uses and `symbolKey()` works on a read result.
- `NodeRef = { type: 'symbol'; id: string } | { type: 'file'; id: string }` — a seed.
- `GraphNode = ({ type: 'file' } & StoredFile) | ({ type: 'symbol' } & StoredSymbol)`;
  `Neighbor = GraphNode & { distance: number }`.
- `SymbolSearchOptions { kinds?: SymbolKind[] }`.

The discriminator is `type`, not `kind`: `kind` already means file kind / symbol kind.
The store returns mixed nodes; filtering to symbols is the consumer's job (DIS-27's `expand`
keeps `type === 'symbol'`), so the port does not grow a "symbols only" flag.
Unset optional columns (`NULL`) are omitted, not `null`, matching the write-side types.

*Alternative rejected:* returning only ids and letting callers look details up — it would need a
second round trip per result and would push callers to keep symbol ids across reindexes.

### D2 — `StorePort` read contract

Added to the existing interface, with TSDoc stating isolation, id validity and errors:

```ts
getProject(projectId: string): Promise<Project>;
listProjects(): Promise<Project[]>;
findSymbols(projectId: string, name: string, options?: SymbolSearchOptions): Promise<StoredSymbol[]>;
neighbors(projectId: string, seeds: NodeRef[], hops: number, kinds?: EdgeKind[]): Promise<Neighbor[]>;
```

`neighbors` keeps the argument order of the planning doc (`projectId, symbolIds, hops, kinds`),
with `seeds` typed as `NodeRef[]` because seeds can be files (author decision). A direction
parameter, when DIS-89 scopes it, can be appended as an optional argument defaulting to source →
target, so this contract does not break.

### D3 — Argument validation and `InvalidStoreQuery` in core

- `errors.ts`: `InvalidStoreQuery extends DomainError`, `code = 'INVALID_STORE_QUERY'`,
  `argument: 'name' | 'kinds' | 'hops'`, human message.
- `read-arguments.ts`: `MAX_HOPS = 3`; `assertValidSymbolSearch(name, options)` (non-blank term
  without NUL characters, `kinds` absent or non-empty; the NUL rule was added at the adversarial
  review: Postgres rejects NUL in a text parameter with `22021`, which would surface as a raw
  error and, in `{ transaction }` mode, abort the caller's transaction); `assertValidTraversal(hops, kinds)` (`Number.isInteger(hops)`,
  `1 <= hops <= MAX_HOPS`, `kinds` absent or non-empty). First violation throws; reads have at most
  two arguments to check, so collecting every violation (as `InvalidGraph` does) adds nothing.
- Kind values are not re-validated at runtime: they are typed unions, and the enum casts in SQL
  reject anything else. Same stance as `saveGraph`. Decided at the post-audit review (2026-09-30):
  no enum validation in core; the resulting database error is an accepted risk (see Risks).

### D4 — Adapter: running reads

- Reads run as a single `query` on the connection: `pool.query(...)` in `{ pool }` mode (no
  explicit transaction: one statement is atomic), `client.query(...)` in `{ transaction }` mode.
  **No `SAVEPOINT`** for reads: it would add statements (breaking the one-statement scenario) and a
  validated read has nothing to undo. A small `runQuery(connection, sql, params)` helper hides the
  two modes.
- Order in every read: (1) `assertValid…` from core; (2) malformed project id → `ProjectNotFound`
  (reuse the `UUID` regex of `postgres-store.ts`, moved to a shared module `ids.ts`); (3) the
  statement. Steps 1–2 send nothing to the database. The regex is case-insensitive, so an
  upper-case id is accepted and Postgres compares it as the same `uuid` value (spec).
- **Project existence in the same statement.** Each project-scoped read starts from
  `FROM project p WHERE p.id = $1` and `LEFT JOIN`s its results (`LEFT JOIN LATERAL` for the
  search, `LEFT JOIN` onto the final CTE for `neighbors`). Zero rows → `ProjectNotFound`; one row
  with a `NULL` node → exists, no results. This keeps "unknown project fails" and "one statement"
  both true without a separate existence query.
- Seeds are split in TypeScript into `symbolIds[]` and `fileIds[]` by their `type`; ids failing
  the `UUID` regex are dropped (they name no node). A seed whose `type` does not match its id (a
  symbol id sent as `file`) lands in the wrong array, matches no row of that table in `seed`, and
  so contributes nothing (spec). If nothing is left, the statement still runs (to check the
  project exists) and returns no neighbours.
- Row mapping (`snake_case` → read models, `NULL` → omitted) lives in a `read-graph.ts` module
  next to `save-graph.ts`.
- **Byte-order sorting.** Every `ORDER BY` on a name or a path uses `COLLATE "C"`, so the order is
  binary and does not depend on the database locale (the local database is `en_US.utf8`, where
  `alpha` sorts before `Zeta`). The spec states this order.

### D5 — `findSymbols` SQL

```sql
SELECT p.id AS project_id, s.id, f.path, s.name, s.kind, s.start_line, s.end_line, s.signature
  FROM project p
  LEFT JOIN LATERAL (
    SELECT … FROM file f JOIN symbol s ON s.file_id = f.id
     WHERE f.project_id = p.id
       AND s.name ILIKE '%' || $2 || '%' ESCAPE '\'
       AND ($3::symbol_kind[] IS NULL OR s.kind = ANY($3))
  ) s ON true
 WHERE p.id = $1
 ORDER BY f.path COLLATE "C", s.start_line, s.name COLLATE "C"
```

`$2` is the term with `\`, `%` and `_` escaped (`\\`, `\%`, `\_`) in TypeScript; `ILIKE` gives the
case-insensitive comparison. Filtering starts at `file.project_id` (unique index
`file_project_path_key` leads with it), then `symbol_file_id_idx`.

*Alternative rejected:* `position(lower($2) in lower(name)) > 0` — no escaping needed, but it
diverges from the `ILIKE` idiom a future `pg_trgm` index would serve.

### D6 — `neighbors` SQL: one recursive statement

```sql
WITH RECURSIVE
seed(node_type, node_id) AS (
  SELECT 'symbol', s.id FROM symbol s JOIN file f ON f.id = s.file_id
   WHERE f.project_id = $1 AND s.id = ANY($2::uuid[])
  UNION
  SELECT 'file', f.id FROM file f WHERE f.project_id = $1 AND f.id = ANY($3::uuid[])
),
walk(node_type, node_id, depth, visited) AS (
  SELECT node_type, node_id, 0, ARRAY[node_type || ':' || node_id] FROM seed
  UNION ALL
  SELECT nx.node_type, nx.node_id, w.depth + 1, w.visited || (nx.node_type || ':' || nx.node_id)
    FROM walk w
    CROSS JOIN LATERAL (
      SELECT <target type>, COALESCE(e.target_symbol_id, e.target_file_id)
        FROM edge e
       WHERE e.project_id = $1 AND e.source_symbol_id = w.node_id AND w.node_type = 'symbol'
         AND ($5::edge_kind[] IS NULL OR e.kind = ANY($5))
      UNION ALL
      SELECT … WHERE e.project_id = $1 AND e.source_file_id = w.node_id AND w.node_type = 'file' …
    ) nx(node_type, node_id)
   WHERE w.depth < $4
     AND NOT (nx.node_type || ':' || nx.node_id) = ANY(w.visited)
),
reached AS (
  SELECT node_type, node_id, min(depth) AS distance FROM walk
   WHERE depth > 0 AND (node_type, node_id) NOT IN (SELECT node_type, node_id FROM seed)
   GROUP BY node_type, node_id
)
SELECT p.id AS project_id, n.*
  FROM project p
  LEFT JOIN (
    SELECT r.*, <file and symbol columns>
      FROM reached r
      LEFT JOIN file f ON r.node_type = 'file' AND f.id = r.node_id
      LEFT JOIN symbol s ON r.node_type = 'symbol' AND s.id = r.node_id
      LEFT JOIN file sf ON sf.id = s.file_id
     WHERE f.project_id = $1 OR sf.project_id = $1
  ) n ON true
 WHERE p.id = $1
 ORDER BY n.distance, (n.node_type = 'symbol'), <path> COLLATE "C", <start_line>, <name> COLLATE "C"
```

- **Isolation:** seeds are resolved only among the project's files and symbols, and every edge step
  requires `e.project_id = $1`. A foreign seed is not in `seed`, so it reaches nothing. The reached
  nodes are also filtered by project (`f.project_id = $1` / `sf.project_id = $1`, post-audit
  review 2026-09-30), so an edge of the project whose target belongs to another project — which
  the DIS-23 writer never produces, and the schema does not forbid — never returns that node. The
  filter sits **inside** the `LEFT JOIN`ed subquery, not in the outer `WHERE`: filtered-out nodes
  then leave no `NULL` row behind, and when every reached node is filtered out the project row
  still comes back, so the call returns `[]` instead of `ProjectNotFound`. A foreign node can
  still count as an intermediate step (the walk follows the project's edges from it); only
  another cross-project edge could lead back, and that is not defended further.
- **Cycles:** each path carries the nodes it visited; a step to a visited node is pruned. With
  `depth < hops` and `hops <= 3`, the walk is finite even without the path check; the path check
  keeps it from re-expanding a cycle inside the depth budget. Its role is **performance only**
  (adversarial review, 2026-09-30): the observable results — each node once, minimum distance,
  never past `hops` — come from the depth bound and `GROUP BY … min(depth)`, so no test can tell
  the path check apart, and removing it alone changes no result.
- **Minimum distance, once:** `GROUP BY … min(depth)`; seeds removed in `reached`.
- **Index use:** the two `UNION ALL` branches of the lateral each match one partial index
  (`edge_source_symbol_kind_idx`, `edge_source_file_kind_idx`) instead of an `OR` across both.
- **Direction:** only `source_* = current node` is followed (source → target).

*Alternatives considered:* PostgreSQL 14+ `CYCLE … SET … USING` clause — equivalent, less
familiar, and it still enumerates paths; per-depth dedup is not possible in a recursive CTE
(no aggregates in the recursive term), so path enumeration is accepted with the `hops <= 3` cap.
An iterative loop in TypeScript (one query per hop) is rejected: the HU asks for one recursive
statement.

### D7 — Tests

- `tests/unit/knowledge/read-arguments.spec.ts`: the validator (blank term, empty kinds, `hops`
  0/1/3/4/1.5/`NaN`), no database.
- `tests/integration/store/graph-read.spec.ts`: `describeWithDatabase` + `useTransactionPerTest()`,
  store on `{ transaction: db() }`; graphs built with the `tests/support/sample-graph.ts` builders
  (`file`, `symbol`, `edge`, `ref`) and written with `saveGraph`. One test per `#### Scenario:`,
  named after it.
- **Counting statements** (one-statement, rejected-before-querying and malformed-project-id
  scenarios): the store is built on a thin wrapper over `db()` whose `query` increments a counter
  before delegating. Only reads use it, so `saveGraph`'s savepoint statements are not counted.
- **Project listing:** the shared database may already hold projects, so the ordering test creates
  two projects with `unique()`-based names whose sort order is known and asserts their presence and
  relative order, not the total list. The empty-list test runs `DELETE FROM project` inside the
  per-test transaction (the harness rolls it back; the schema cascades) and then lists. It can wait
  on a project row another test file holds locked (`saveGraph`'s `FOR UPDATE`); that wait ends with
  the other transaction and is accepted.
- **Cross-project edge** (post-audit scenario): the writer cannot produce one, so the test inserts
  it with plain parameterised SQL on `db()` in the test body (as DIS-23 D7 did for claims), with
  the first project's `project_id` and a target symbol and a target file of the second project.
- Test data synthetic, as in DIS-23.

## Risks / Trade-offs

- [Path enumeration grows with fan-out^hops on dense graphs] → `hops <= 3` in the port; the
  readme's 100 000-edge / 200 ms target is not measured here. If it fails when measured, switch to
  a frontier-per-depth variant or add `LIMIT`s; the port contract does not change.
- [`ILIKE '%term%'` scans the project's symbols; no trigram index] → acceptable at L1 sizes;
  `pg_trgm` + GIN index is a separate migration if search becomes slow.
- [A read failing at the database inside a caller-owned transaction aborts that transaction (no
  savepoint)] → inputs are validated and ids pre-checked, so the statement should not raise; a
  failure is a bug to surface, not to hide.
- [`READ COMMITTED` reads can interleave with a concurrent `saveGraph` across calls] → each read is
  one statement, so each result is a consistent snapshot; callers chaining reads (search then
  traverse) across a reindex get an empty traversal, which the id-validity requirement documents.
- [Edges whose endpoints belong to another project, if a future writer breaks the invariant] → the
  traversal filters `edge.project_id` and the reached nodes' project, so a foreign node is never
  returned (D6). It can still be walked through as an intermediate step; the DIS-23 writer cannot
  produce such edges, so this is not defended further.
- [A kind value outside the enum, from an untyped caller] → the `::symbol_kind[]` /
  `::edge_kind[]` cast fails with Postgres `22P02`, surfaced as a raw database error, and in
  `{ transaction }` mode (reads have no savepoint) it aborts the caller's transaction. Accepted at
  the post-audit review (2026-09-30): the TypeScript types prevent it, and core does not validate
  enum values (same stance as `saveGraph`).

## Migration Plan

No migration. Additive port methods; `createProject` / `saveGraph` unchanged. Rollback is
reverting the commit.

## Follow-ups

Deferred findings of the adversarial review (2026-09-30), with their destination
(`docs/project-context.md` → Tracking deferred findings):

- **C — Pool-mode read regression test.** Every automated read test uses `{ transaction: db() }`;
  the production `pool.query` path was only exercised by the manual script of report 9. Tracked
  in one Spanish checklist comment on DIS-24 (comment `57fb31d7`).
- **C — Traversal performance measurement** against the readme target (100 000 edges, 2 hops,
  under 200 ms). Path enumeration grows with fan-out^hops (see Risks). Same DIS-24 checklist
  comment (`57fb31d7`).
- **B — Runtime `null` arguments from untyped callers** (`seeds: null`, `name: null`) throw a
  `TypeError` in the adapter, not a domain error. Owned by DIS-27's input validation (comment
  `8a545b0c` on DIS-27).

Fixed in the change (§13): a NUL character in the search term (`InvalidStoreQuery('name')`) and
the missing byte-order test of `listProjects`. Recorded only (destination D): the visited-path
check is performance only (D6).

## Open Questions

- Whether DIS-27's in-memory double should share `read-arguments.ts` validation — likely yes; it
  does not change this design.
