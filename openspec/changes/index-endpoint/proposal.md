## Why

PH-07 of the planning requires that no cached answer survives a reindex, and `StorePort.invalidateCache(projectId)`
(DIS-21) exists for that but nothing calls it: a project re-indexed today keeps serving answers whose
evidence points at an older commit. There is also no way to refresh a project from the API: the only
indexing path is the CLI `index`, which always **creates** a project and fails on a taken name.

This is DIS-9 (CM-HU-05b.2, parent DIS-6 / CM-HU-05b), priority `must` (gate PH-20). Its DoD: an
integration test of the four codes (`202`/`400`/`403`/`404`); the route visible in `/docs`; after a
reindex, a question cached before answers with `cacheHit = false`.

The ticket conflicts with DIS-101, which removed `POST /api/projects/{projectId}/index` from
`readme.md` §4 because "the API never receives a file system path". The agent, as lead engineer in the
autonomous run (`docs/AUTONOMOUS-RUN.md` §6), resolved it with decision E1 of the ticket's `[enhanced]`
description: the endpoint comes back, but it **re-indexes a project that already exists** (created by
the CLI or the seed) from its stored `root_path`, language and framework, and its body carries no path
and no language. The guarantee of §4 holds; creating projects stays a CLI operation. *(Agent's text:
decisions E1–E14 were taken by the agent without the author and are copied to `design.md` →
Follow-ups with their A/B/C/D destination.)*

## What Changes

- **New route** `POST /api/projects/{projectId}/index`: strict body `{ incremental?: boolean }` (any other
  key, such as `rootPath` or `language`, is `400`); runs the reindex **synchronously inside the request**
  and answers `202` with `{ projectId, mode: "full", analyzer, indexedCommit, filesQueued, filesSkipped: 0, cacheEntriesInvalidated }`.
  `incremental` is accepted and has no effect until DIS-10 (E2, E3, E4). A request without a body is
  handled as `{}` (E19). The synchronous `202` is a recorded deviation from
  `docs/backend-standards.md` §6 (E17, design U9).
- **Error answers** through a route-level domain error table: `403` `INDEXING_DISABLED` (the API has
  no `ALLOWED_REPOS_DIR` or no `AUTHOR_HASH_SALT`), `404` `PROJECT_NOT_FOUND`, `403` `FORBIDDEN_PATH`
  (the stored root is outside `ALLOWED_REPOS_DIR`, re-checked on every reindex), `503` when the
  stored repository can no longer be read (`NOT_A_GIT_REPOSITORY`, `EMPTY_REPOSITORY`), `500`
  `INTERNAL` for an invalid graph. No message or detail carries a path (E6, E7).
- **New core use case** `reindexProject`: reads the project, resolves a relative `root_path` against
  the repository root, confines it like `indexRepository` (lexically and on real paths), runs read →
  redact → analyse → history → validate with the stored language and framework, then saves the graph
  over the existing project id and invalidates the project's answer cache **in one transaction**
  (E5). The pipeline shared with `indexRepository` is extracted without changing its behaviour.
- **Store adapter**: the pooled store (`openPostgresStore`) gains a way to run work on a store bound to
  one transaction of the pool (`BEGIN`/`COMMIT`/`ROLLBACK`, connection always released).
- **Composition**: the API reads `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` **without making them
  required** (E8): with both set it composes the indexing dependencies (Git source tree and history,
  the analyzer of each language, the transaction runner); with either missing the API still starts
  and the route answers `403` `INDEXING_DISABLED`.
- **Log**: one `info` line per completed reindex with counters and duration, never a path nor file
  content.
- **Docs**: `readme.md` §4 gets `/index` back as its third endpoint (body without paths) and the
  DIS-101 note is rewritten; `docs/project-context.md` and `.env.example` say the API also reads the
  two indexing variables.

## Capabilities

### New Capabilities

- `http-index`: the `POST /api/projects/{projectId}/index` endpoint — request validation without any
  path, the `202` response, the domain error answers (`403`/`404`/`503`/`500`), the completion log
  line and its OpenAPI entry.

### Modified Capabilities

- `repository-indexing`: adds "Reindexing an existing project" (the core use case: order of checks,
  stored language and framework, confinement, graph save plus cache invalidation as one unit, no
  partial write, report). The existing requirements, including "Indexing order and no partial
  write", do not change.
- `graph-store`: adds "Running work in one transaction on a pooled store".
- `api-foundation`: "Configuration from the environment" (two optional indexing variables that never
  fail start-up) and "Composition from the environment" (the indexing dependencies are composed only
  when both variables are set).

## Impact

- Code: `packages/core/src/index/` (new `reindex-project.ts`, the pipeline extracted from
  `index-repository.ts`), `packages/adapters/store-postgres/src/open-store.ts`,
  `packages/analyzers/php/src/index.ts` (exports `PHP_EXTRACTOR`), `packages/api/src/` (new
  `schemas/reindex.ts`, `routes/reindex.ts`; `app.ts`, `composition.ts`, `index.ts`),
  `packages/api/package.json` (the two workspace analyzer packages become dependencies of the API;
  no external dependency is added).
- Versioned data: `seeds/graph-dump.sql`, `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json`
  are regenerated (`seed:build` then `cache:build`), because the change touches seed fingerprint
  inputs; `cache:build` needs a live model (the local Ollama). The seed's rows must not change, only its
  `analyzer-fingerprint` header; the regenerated golden entries need a new review (E16, destination C).
- Tests: new `tests/unit/index/reindex-project.spec.ts`, `tests/unit/api/reindex.spec.ts`,
  `tests/integration/api/reindex.spec.ts`; new scenarios in `tests/integration/store/open-store.spec.ts`
  and `tests/unit/api/composition.spec.ts`; existing tests that change are named in `tasks.md`.
- Security and privacy: the API still never receives a path (validated by `400` scenarios); the stored
  root is confined again on each reindex; the secret redaction and author hashing of indexing apply
  unchanged; error bodies and the log carry no path. The endpoint is rate limited by IP like `/ask`.
  No new personal data is stored.
- Commands and constraints: as in `docs/project-context.md` (`npx vitest run`, `npm run typecheck`,
  `npm run lint`, `npm run lint:architecture`, `npm run test:mutation`, `npm run docs:coverage`).

### Non-goals

- A job status endpoint, a `jobId` or a persistent queue (planning gate, question 5); running the
  reindex in the background (E3, destination D).
- The incremental plan: `incremental` changes nothing yet (DIS-10).
- Creating projects over HTTP or accepting any file system path (E1).
- A CLI reindex command (E11, DIS-10 decides) or indexing from the web.
- Blocking the reindex of sample projects (E9) or serialising concurrent reindexes (E10).
- Lazy recomputation of `stale` claims (DIS-42, E14).
