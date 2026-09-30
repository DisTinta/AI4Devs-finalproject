## Why

The schema (DIS-11/12/13) and the integration harness (DIS-22) exist, but nothing can write a
knowledge graph yet: `StorePort` is an empty stub. Indexing (DIS-85), Git history (DIS-35), graph
reads (DIS-24) and the budget (DIS-18) are all blocked on a real, transactional write path that the
domain can call without knowing SQL. This is DIS-23 (CM-HU-02.2), a slice of CM-HU-02 (DIS-15).

## What Changes

- **L1 domain types** in `packages/core/src/knowledge/`: the in-memory graph an analyzer produces
  (files, symbols, edges, commits, file–commit links) and the project to index, with endpoints and
  links referenced by path / sha / symbol position, never by database id.
- **Pure graph validation in core**: rejects an edge without `resolution` or `extractor`, dangling
  references, duplicate keys, empty `sha`, negative counters and invalid spans, with a domain error,
  before any SQL runs.
- **Domain errors** `ProjectNotFound`, `ProjectNameTaken` and `InvalidGraph` in core.
- **`StorePort` write contract** (replaces the stub):
  - `createProject(input)` → project id;
  - `saveGraph(projectId, graph)` → write summary. The graph is a **full snapshot** of the project.
- **PostgreSQL adapter** in `packages/adapters/store-postgres/src/` implementing both methods:
  - one transaction per `saveGraph` (rolled back as a whole on any error);
  - files upserted with `INSERT … ON CONFLICT (project_id, path)`, keeping existing ids, so
    `file_commit` and `evidence` rows survive a reindex and the stale trigger fires;
  - files absent from the snapshot deleted (they left the repository); before the delete, in the
    same transaction, the `current` claims with evidence citing them are marked `stale`;
  - symbols and edges of the project replaced;
  - commits upserted with `ON CONFLICT (project_id, sha)`, `file_commit` upserted, never deleted;
  - project indexing metadata updated (`indexed_commit`, `indexed_at`, `node_count`, `edge_count`)
    and nothing else of the project row;
  - cooperates with a caller-owned transaction (the harness's `db()`) through a `SAVEPOINT`
    instead of `BEGIN`/`COMMIT`.
- Integration tests under `tests/integration/store/` on the DIS-22 harness, and unit tests for the
  validation under `tests/unit/knowledge/`.

## Non-goals

- No graph reads: `findSymbols`, `neighbors`, `getProject`, `listProjects` are DIS-24 (CM-HU-02.3).
  The HU-level `ProjectNotFound` AC is satisfied here only for writes.
- `saveGraph` does **not** update `project.framework` (nor `name`, `root_path`, `language`,
  `is_sample`). `framework` is set only by `createProject`; `KnowledgeGraph` has no framework
  field. DIS-85 passes the detected framework when it creates the project, or adds its own
  operation to change it later.
- No incremental reindex by `content_hash` (DIS-10) and no partial/merge write.
- No writes of `claim`, `evidence`, `query_log`, `cache_entry` (CM-HU-09/10/11/13).
- No embeddings (`file.embedding`, `symbol.embedding` stay `NULL`), no ranking (CM-HU-08).
- No Git reading, no author pseudonymisation: `author_hash` arrives already hashed (DIS-35).
- No HTTP route, no CLI command, no new migration, no new dependency.
- No `BEFORE DELETE` trigger on `file` (it would need a migration): the adapter marks the claims
  stale itself. A trigger covering every deleter may be proposed separately.
- No retry on deadlock (`40P01`). Concurrent `saveGraph` calls on one project serialise on the
  project row and files are written in a stable order; scheduling reindexes is the orchestrator's
  job (DIS-85).
- No in-memory `StorePort` double (CM-HU-08.1).

## Capabilities

### New Capabilities

- `graph-store`: the `StorePort` write contract for the L1 graph — project creation, snapshot
  semantics of `saveGraph`, transactionality, validation, identity preservation on reindex and
  cooperation with a caller-owned transaction.

### Modified Capabilities

(none — `graph-schema` and `test-db-isolation` requirements are unchanged; this change relies on
them)

## Impact

- Code: `packages/core/src/ports/StorePort.ts`, `packages/core/src/knowledge/*` (new),
  `packages/core/src/index.ts` exports, `packages/adapters/store-postgres/src/*` (new store
  module, `index.ts` export). Tests in `tests/unit/knowledge/` and `tests/integration/store/`.
- Build wiring: first package to import `@codemind/core` — store-postgres `tsconfig.json`
  reference, Vitest alias in `vitest.config.ts` (inherited by `vitest.stryker.config.ts` through
  `mergeConfig`) and a `paths` entry in `tests/tsconfig.json` (`design.md` D6).
- Dependencies: none new (`pg` is already a dependency of the adapter; core stays dependency-free).
- Architecture: SQL only in `store-postgres`; `core` imports no infrastructure (dependency-cruiser
  gate). Commands and gates per `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage`).
- Privacy: `commit` stores `author_hash` only (schema has no name/e-mail column). The writer stores
  what it receives and does not hash; `message` is free text from the repository. Test data MUST be
  synthetic (no real names or e-mails in commit messages or hashes).
- Downstream: unblocks DIS-24, DIS-35, DIS-85 and DIS-18.
