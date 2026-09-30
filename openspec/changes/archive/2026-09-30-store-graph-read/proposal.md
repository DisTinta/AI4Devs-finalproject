## Why

DIS-23 gave `StorePort` a transactional write path, but nothing can read the graph back: the
Context Engine (DIS-27, CM-HU-08.1), impact (DIS-89) and the `projects` command (CM-HU-06.2) are
blocked on reads that are isolated by project and that walk the graph N hops in one recursive
statement without looping on cycles. This is DIS-24 (CM-HU-02.3), the last slice of CM-HU-02
(DIS-15).

## What Changes

- **`StorePort` read contract** (added to the existing interface, write methods unchanged):
  - `getProject(projectId)` → the project with its indexing metadata; `ProjectNotFound` when it
    does not exist;
  - `listProjects()` → every project, ordered by name ascending; `[]` when there is none;
  - `findSymbols(projectId, name, options?)` → the project's symbols whose name contains `name`,
    case-insensitively, optionally filtered by symbol kind;
  - `neighbors(projectId, seeds, hops, kinds?)` → the nodes reachable from the seeds by following
    edges from source to target in 1..`hops` steps, each returned once with its minimum distance.
- **Mixed graph nodes.** Edges connect symbols and files, so seeds can be symbols or files, the
  traversal crosses both, and each result is typed (`symbol` or `file`). The store returns mixed
  nodes; a consumer that wants only symbols filters by `type` itself (DIS-27's expansion does).
- **Natural identity in every read result.** Symbol ids change on every `saveGraph` (DIS-23 handoff:
  symbols are replaced wholesale). Each symbol result carries its file path, name and start line
  (`SymbolRef`), and each file result its path, so callers never need to keep a symbol id across a
  reindex. An id returned by a read is valid only until the next `saveGraph` of that project.
- **Isolation first.** Every read filters by `project_id` before anything else: no result, seed or
  traversed edge can come from another project. Reading an unknown project fails with
  `ProjectNotFound`, never with a silent empty result (HU AC).
- **Bounded traversal.** `hops` MUST be an integer in 1..3 (`MAX_HOPS` = 3 in core, readme: "a
  maximum of 3"); otherwise, and for an empty `findSymbols` term or an empty `kinds` list, a new
  domain error `InvalidStoreQuery` is raised before any SQL runs. A project id that is not a
  well-formed UUID fails with `ProjectNotFound` on every project-scoped read, also without SQL.
- **Read models** in `packages/core/src/knowledge/`: `Project`, `StoredFile`, `StoredSymbol`,
  `GraphNode`, `Neighbor`, `NodeRef`.
- **PostgreSQL adapter** in `packages/adapters/store-postgres/src/`: parameterised SQL only;
  `neighbors` is a single `WITH RECURSIVE` statement with cycle detection and depth limit.
- Integration tests under `tests/integration/store/` on the DIS-22 harness; unit tests for the
  read-argument validation under `tests/unit/knowledge/`.

## Non-goals

- **No traversal direction parameter.** `neighbors` follows edges source → target only. Reverse
  and undirected traversal (DIS-89 impact) are out of scope unless scoped separately; the
  parameter can be added later without changing the default behaviour.
- **No `listFileHashes`** (incremental plan, CM-HU-05b) unless scoped separately.
- No ranking, no weighting by `resolution`, `kind` or `weight`, no embeddings (CM-HU-08.2 / F7).
  Results carry no path or "best edge" information beyond the minimum distance.
- No pagination or limit on `findSymbols` / `listProjects`; ordering is deterministic.
- No reads of `commit`, `file_commit`, `claim`, `evidence`, `query_log`, `cache_entry`.
- No in-memory `StorePort` double (DIS-27).
- No HTTP route, no CLI command, no migration, no new dependency. The traversal relies on the
  `0003` endpoint indexes; the readme's 100 000-edge / 200 ms target is not measured here.
- No change to `createProject` or `saveGraph` behaviour.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-store`: adds the read side — project lookup and listing, symbol search by name, bounded
  N-hop neighbour traversal with cycle detection, per-project isolation of every read, the
  validity of returned ids, and `InvalidStoreQuery`. The purpose line widens from "the write side"
  to both sides. Existing write requirements are unchanged.

## Impact

- Code: `packages/core/src/ports/StorePort.ts` (four methods), `packages/core/src/knowledge/`
  (read models, `MAX_HOPS`, `InvalidStoreQuery`, read-argument validation),
  `packages/adapters/store-postgres/src/` (`queries.ts`, `postgres-store.ts`, a read module).
  Tests in `tests/unit/knowledge/` and `tests/integration/store/`.
- Dependencies: none new. Architecture gates unchanged: SQL only in `store-postgres`, `core`
  imports no infrastructure. Commands per `docs/project-context.md` (`npx vitest run`,
  `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage`).
- Privacy: reads return code structure only (paths, symbol names, signatures); no personal data.
  Test data stays synthetic.
- Downstream: unblocks DIS-27 and DIS-89 (DIS-89 still needs the direction parameter) and the
  `projects` command of CM-HU-06.2.
