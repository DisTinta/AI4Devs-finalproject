## What changes?

`StorePort` gains its read side: `getProject`, `listProjects`, `findSymbols` and `neighbors`, all
isolated by project. Core adds the read models, `MAX_HOPS` (3) and `InvalidStoreQuery`, and the
Postgres adapter answers each read in one statement. `neighbors` is a single `WITH RECURSIVE` over
mixed symbol and file nodes, following edges from source to target, with cycle detection and
minimum distance; names and paths sort in byte order.

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `docker compose up -d` and wait until Postgres is healthy.
2. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
3. `npm run db:migrate` (migrations `0001`–`0003`; this PR adds none).
4. `npx vitest run tests/unit/knowledge tests/integration/store` → 10 files, 160 tests passed.
5. `npx vitest run` → 12 files, 184 tests passed.
6. `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage` → exit 0
   (lint: 3 pre-existing warnings on the empty ports; architecture: 8 pre-existing `no-orphans`
   warnings).
7. `npx stryker run` → 88.10 % for `packages/core/src/knowledge/` (threshold `MIN_MUTATION_SCORE=70`).
8. Check the shared database is back to its baseline: `project`, `file`, `symbol` and `edge` have
   the same row counts as before step 4.

## Decisions / trade-offs

- **Mixed nodes** (`design.md` D1). Seeds and results can be symbols or files, told apart by
  `type`. Consumers that want only symbols filter by `type` (DIS-27's `expand`); the port has no
  "symbols only" flag.
- **Natural identity in every symbol result** (`design.md` D1). Symbol ids change on every
  `saveGraph`, so each symbol result carries its `SymbolRef` (`file`, `name`, `startLine`).
- **Source → target only** (proposal non-goals, `design.md` D2). Reverse traversal is left to
  DIS-89. It can be added later as an optional trailing argument without breaking this contract.
- **One statement per read, no savepoint** (`design.md` D4). Project existence is checked in the
  same statement (`FROM project p … LEFT JOIN`): zero rows means `ProjectNotFound`. Invalid
  arguments and malformed ids fail before any SQL.
- **Path enumeration with visited nodes** (`design.md` D6). A recursive CTE cannot deduplicate per
  depth, so each path carries the nodes it visited. Its size is bounded by `hops <= 3`. The readme's
  100 000-edge / 200 ms target is not measured here.
- **Reached nodes filtered by project inside the `LEFT JOIN`ed subquery** (`design.md` D6,
  post-audit). An edge that points into another project never returns the foreign node, and the
  project row survives even when every node is filtered out.
- **Byte-order sorting (`COLLATE "C"`)** (`design.md` D4). The order does not depend on the
  database locale.
- **Kind values outside the enum are not validated in core** (`design.md` D3, Risks). The SQL cast
  fails with `22P02`; the TypeScript types prevent it.

## Traceability

Spec: `openspec/changes/store-graph-read/specs/graph-store/spec.md`. Tests in
`tests/integration/store/graph-read.spec.ts`; the pure validation is also covered by
`tests/unit/knowledge/read-arguments.spec.ts`.

| Scenario in the specification | Test that covers it |
|---|---|
| An unindexed project is read | `tests/integration/store/graph-read.spec.ts:112` |
| A project is read with its indexing metadata | `tests/integration/store/graph-read.spec.ts:137` |
| Reading an unknown project fails | `tests/integration/store/graph-read.spec.ts:165` |
| Listing with no project returns an empty list | `tests/integration/store/graph-read.spec.ts:179` |
| Projects are listed by name | `tests/integration/store/graph-read.spec.ts:191` |
| Symbols are found by a case-insensitive fragment of the name | `tests/integration/store/graph-read.spec.ts:216` |
| The search can be narrowed by kind | `tests/integration/store/graph-read.spec.ts:248` |
| Wildcard characters in the term match literally | `tests/integration/store/graph-read.spec.ts:262` |
| A search with no match returns an empty list | `tests/integration/store/graph-read.spec.ts:291` |
| Searching an unknown project fails | `tests/integration/store/graph-read.spec.ts:303` |
| A cycle yields each node once with its minimum distance | `tests/integration/store/graph-read.spec.ts:316` |
| The traversal stops at the hop limit | `tests/integration/store/graph-read.spec.ts:339` |
| The minimum distance wins when a node is reachable by several paths | `tests/integration/store/graph-read.spec.ts:355` |
| Edges are followed from source to target only | `tests/integration/store/graph-read.spec.ts:368` |
| The traversal crosses files and symbols | `tests/integration/store/graph-read.spec.ts:381` |
| A file can be a seed | `tests/integration/store/graph-read.spec.ts:426` |
| Only the requested edge kinds are followed | `tests/integration/store/graph-read.spec.ts:445` |
| Seeds are never returned | `tests/integration/store/graph-read.spec.ts:458` |
| Unknown and empty seeds give no neighbours | `tests/integration/store/graph-read.spec.ts:474` |
| The traversal is one statement | `tests/integration/store/graph-read.spec.ts:494` |
| Traversing an unknown project fails | `tests/integration/store/graph-read.spec.ts:511` |
| A symbol search never returns another project's symbols | `tests/integration/store/graph-read.spec.ts:526` |
| A traversal never reaches another project | `tests/integration/store/graph-read.spec.ts:545` |
| A cross-project edge never returns another project's node | `tests/integration/store/graph-read.spec.ts:562` |
| A symbol id from before a reindex names nothing after it | `tests/integration/store/graph-read.spec.ts:586` |
| A file id stays valid across a reindex that keeps its path | `tests/integration/store/graph-read.spec.ts:605` |
| Invalid read arguments are rejected before querying | `tests/integration/store/graph-read.spec.ts:628` |

## Origin

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
