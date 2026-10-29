## Context

See `proposal.md` → Why. The pieces this change composes already exist:

- `indexRepository` (`packages/core/src/index/index-repository.ts`) runs confine → read → redact →
  analyse → history → save, but its `save` phase always calls `createProject`; there is no path that
  writes a new snapshot over an existing project. Its private `confine` holds the two-step
  confinement (lexical, then real paths, without revealing a link's target).
- `StorePort.saveGraph(projectId, graph)` already writes a complete snapshot over an existing project
  (keeping file ids by path, deleting what left the snapshot; graph-store "Snapshot semantics"), and
  `StorePort.invalidateCache(projectId)` (DIS-21) deletes the project's answer cache entries. Nobody
  calls the latter today.
- The API's store is a pooled store (`openPostgresStore`): each write opens and commits its own
  transaction, so `saveGraph` followed by `invalidateCache` on it would be two transactions. A store
  bound to a caller-owned transaction (`createPostgresStore({ transaction })`) wraps each write in a
  `SAVEPOINT`, which is how the CLI `index` keeps one transaction for the whole indexing
  (`packages/cli/src/compose-index.ts`, `defaultOpenTransaction`).
- `packages/api` must not issue SQL (`GUARD_DB_IN_HTTP` hook, dependency-cruiser `api-no-sql`); the
  transaction therefore has to be opened inside `@codemind/adapter-store-postgres`.
- The route pattern (`/ask`): Zod schemas in `schemas/`, one route file with its own domain error
  table in `config.domainErrors`, `AppOptions` seams for tests, `inject` tests with in-memory doubles
  under Stryker and one integration spec over the seed.

## Goals / Non-Goals

**Goals:**

- One core use case that re-indexes an existing project and invalidates its cache atomically, sharing
  every rule of the indexing pipeline with `indexRepository` (no second copy of confinement, hygiene,
  redaction or history rules).
- An endpoint that cannot be used to make the server read an arbitrary path.
- No change in the observable behaviour of `indexRepository`, the CLI `index` or `/ask`; no new test
  of theirs edited to pass.

**Non-Goals:**

- Background execution, job ids, progress reporting over HTTP.
- Any change to the CLI (`index` keeps creating projects; no `reindex` command).
- Changing `StorePort` (no new port method: the transaction runner lives in the composition, not in
  the port).

## Decisions

### U1. Extract the shared pipeline from `indexRepository`

`index-repository.ts` is split, behaviour unchanged:

- `confineRepository(sourceTree, requested, allowedRoot)`: the current private `confine`, exported
  from a new `packages/core/src/index/confine-repository.ts`, still naming the path *as requested* in
  `ForbiddenPathError`.
- `buildSnapshot(deps, realRepo, framework?)` in a new `packages/core/src/index/build-snapshot.ts`:
  read → hygiene → redact → (detect framework only when asked) → analyse with the path-set check →
  history (empty-repository check, commit redaction, `co_changed` edges) → validate. It returns the
  validated graph plus the report pieces (`events`, `commitEvents`, `diagnostics`, `skipped`,
  `edges` counts, `framework`/`frameworkSource`) and throws `InvalidGraph` before anything is written.
- `indexRepository` keeps its signature, its progress phases (the callback is passed through) and its
  `createProject` → `saveGraph` order. `tests/unit/index/index-repository.spec.ts` and
  `tests/integration/index/acme-shop.spec.ts` are the safety net: they must stay green **without being
  edited**.

*Alternative rejected:* calling `indexRepository` with a fake store that turns `createProject` into
"return the existing id". It would hide the semantic difference (create vs. replace) behind a test
double in production code and would still save without invalidating the cache.

### U2. `reindexProject` in core (`packages/core/src/index/reindex-project.ts`)

```ts
interface ReindexDependencies {
  store: StorePort;                                  // reads the project (no write)
  sourceTree: SourceTreePort;
  git: GitPort;
  analyzerFor(language: ProjectLanguage): AnalyzerPort;
  inTransaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>;  // unit of work
}
interface ReindexInput { projectId: string; allowedRoot: string | undefined; workspaceRoot: string }
```

Order (spec `repository-indexing` → "Reindexing an existing project"): blank `allowedRoot` →
`IndexingDisabled` before any store call; `store.getProject` → `ProjectNotFound`; resolve a relative
`rootPath` against `workspaceRoot` (`isAbsolute ? rootPath : join(workspaceRoot, rootPath)`, the rule
of `context-pack.ts`); `confineRepository` with the **stored** `rootPath` as the requested name;
`buildSnapshot` with the stored framework (no detection); then
`inTransaction(async (tx) => { const saved = await tx.saveGraph(id, graph); const n = await tx.invalidateCache(id); return { saved, n }; })`.
The report is `ReindexReport` (new type in `index-report.ts`): the `IndexReport` fields minus
`framework`/`frameworkSource`, plus `language` and `cacheEntriesInvalidated`. A `workspaceRoot` that is
not absolute throws `RangeError` before any call, as `explain` does.

`inTransaction` is a plain function type, not a port method: core stays free of any notion of
connection, and the unit tests pass `(work) => work(store)` with an in-memory store.

*Alternative rejected:* adding `StorePort.replaceGraphAndInvalidateCache`. It would put a use-case
composition into the port and duplicate `saveGraph`'s contract in two adapters.

### U3. Transaction runner on the pooled store (`open-store.ts`)

`OpenedStore` gains `transaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>`:
`pool.connect()` → `BEGIN` → `work(createPostgresStore({ transaction: client }))` → `COMMIT` /
`ROLLBACK` (a rollback failure is swallowed so the work's error wins, as in `indexWithEnvironment`)
→ `client.release()` in `finally`. A failed `COMMIT` rejects with an error whose message is fixed
(`the transaction could not be committed`), never the driver's. It is spec'd in `graph-store` →
"Running work in one transaction on a pooled store" and tested in
`tests/integration/store/open-store.spec.ts`.

### U4. Composition (`composition.ts`) and `AppDeps`

- New `indexingConfigFromEnv(env)`: trimmed `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT`; returns
  `undefined` when either is blank. It never throws, and `ApiConfig`/`apiConfigFromEnv` do not change
  (so their existing tests do not change).
- `AppDeps` gains an **optional** `indexing?: IndexingDeps`:
  `{ allowedRoot: string; sourceTree; git; analyzerFor(language); analyzerName(language); inTransaction }`.
  Optional so `tests/unit/api/support.ts` → `defaultDeps()` and `app.spec.ts` stay as they are, and
  absent means "indexing disabled".
- `composeFromEnv` builds it only when `indexingConfigFromEnv` returns a value: `createGitSourceTree()`,
  `createSimpleGitHistory({ authorHashSalt })`, `createPhpAnalyzer()` / `createTypeScriptAnalyzer()`
  by language (the same mapping as the CLI's `defaultPorts`), and `inTransaction` = the opened store's
  `transaction`. `packages/api/package.json` adds the workspace dependencies
  `@codemind/analyzer-php` and `@codemind/analyzer-typescript` (no registry package; `npm install`
  only refreshes the lockfile's workspace links, followed by `npm audit --audit-level=high`).
- `ComposeSeams.openStore` returns `OpenedStore`, which now has `transaction`: the double in
  `tests/unit/api/composition.spec.ts` (`recordingOpenStore`) must add one (named in `tasks.md`).
- `analyzerName`: `php` → `PHP_EXTRACTOR` (`php-treesitter-laravel`), `typescript` →
  `TS_COMPILER_EXTRACTOR` (`ts-compiler`). `PHP_EXTRACTOR` is exported from
  `packages/analyzers/php/src/index.ts` (today only `edges.ts` exports it).

*Alternative rejected:* moving the CLI's `defaultPorts` into a shared package. It binds the store to a
`ClientBase`, which the API must not see; the four-line mapping is duplicated instead, and recorded as
debt only if a third caller appears.

### U5. Schemas and route (`schemas/reindex.ts`, `routes/reindex.ts`)

- `reindexParamsSchema` reuses the project id pattern of `/ask`: the pattern is moved from
  `schemas/ask.ts` to `schemas/common.ts` as `projectIdParamsSchema`, and `askParamsSchema` becomes an
  alias of it (same published document; the `/ask` tests do not change).
- `reindexBodySchema = z.strictObject({ incremental: z.boolean().optional() })`.
- `reindexResponseSchema` (`202`): `projectId` (string), `mode` (`z.literal('full')`), `analyzer`
  (string), `indexedCommit` (string), `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated`
  (integers).
- `registerReindexRoute(app, { reindex? })` (seam `AppOptions.reindex`, as `explain`):
  `indexing = app.deps.indexing ?? throw new IndexingDisabled()`; call `reindexProject`; log; reply
  `202`. Domain table `REINDEX_DOMAIN_ERRORS`: `INDEXING_DISABLED` 403, `PROJECT_NOT_FOUND` 404,
  `FORBIDDEN_PATH` 403 (fixed message, `details: {}`), `NOT_A_GIT_REPOSITORY` and `EMPTY_REPOSITORY`
  503 `the project's source cannot be read` with `details: {}`. `INVALID_GRAPH` is deliberately left
  out of the table, so the global handler answers `500` `INTERNAL` and logs it at `error`.
- The `202` is sent with `reply.code(202)`; the response schema is declared under `202`.
- Registered in `buildApp` after `registerAskRoute`, so it sits behind the rate limit and appears in
  `/docs`.

### U6. Completion log

`request.log.info({ projectId, mode: 'full', filesQueued, redactions, cacheEntriesInvalidated, durationMs }, 'reindex completed')`,
with `redactions = events.length + commitEvents.length` and `durationMs` from `performance.now()`
around the use case. No path field; events are counted, never logged (an event carries a file path).

### U7. Tests

- `tests/unit/index/reindex-project.spec.ts`: core scenarios with in-memory fakes in the style of
  `index-repository.spec.ts` (fake source tree with `realPath`, fake git, two recording analyzers, a
  recording store, `inTransaction` recording settle order).
- `tests/unit/api/reindex.spec.ts`: `inject` with `defaultDeps()` plus an `indexing` double and the
  `reindex` seam where the use case's result is canned; runs under Stryker.
- `tests/integration/api/reindex.spec.ts`: template `tests/integration/api/ask.spec.ts` (acme-shop copy
  under a temporary `T` with `buildOne`, seed in the harness transaction, `root_path` set to the copy);
  `indexing` built with the real Git adapters, the PHP analyzer, a test salt, `allowedRoot` = `T` and
  `inTransaction: (work) => work(createPostgresStore({ transaction: db() }))` (the harness transaction
  is the unit of work; its rollback restores the data).
- `tests/integration/store/open-store.spec.ts`: the three scenarios of U3 over the shared database,
  deleting what they commit.

### U8. Documentation

`readme.md` §4: `/index` returns as the third product endpoint (body `{ incremental? }`, `202` body,
errors `400`/`403`/`404`/`429`/`503`), and the DIS-101 note becomes "the API never receives a path: it
re-indexes a project created by the CLI from its stored root". `docs/project-context.md`: the API's
three routes, the two optional variables, the transaction runner. `.env.example`: the comments of
`ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` say the API reads them too. No ADR: the decision is local to
this endpoint and reversible (it adds a route and an optional dependency).

## Risks / Trade-offs

- [A reindex of a large repository holds the HTTP request open for its whole duration] → acceptable for
  the fixture-sized repositories of the project; the `202` contract lets it move to the background later
  without changing clients (E3, D).
- [The transaction holds row locks on the project while `saveGraph` and `invalidateCache` run] → both
  are short compared with the analysis, which runs before the transaction opens.
- [Reindexing a sample project changes the seed's fingerprint] → documented as E9 (D); `npm run db:seed`
  restores it.
- [Two concurrent reindexes of the same project] → each is one transaction; the last commit wins (E10, D).
- [Extracting the pipeline could change `indexRepository`'s behaviour] → its unit and integration
  specs must pass unedited (U1), and Stryker runs over `packages/core/src/index/**`.

## Migration Plan

No schema migration. Deploying the change only adds a route; with `ALLOWED_REPOS_DIR` or
`AUTHOR_HASH_SALT` unset the API behaves as before plus a `403` route. Rollback is reverting the merge.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run (`docs/AUTONOMOUS-RUN.md`
§6), without the author; copied from the DIS-9 `[enhanced]` description (E1–E14) plus the design
decisions of this proposal (P1–P3). Destinations: A = this change; B = another existing ticket;
C = the author; D = out of scope, recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | The endpoint re-indexes an existing project from its stored `root_path`, language and framework; it receives no path and no language (resolves the conflict with DIS-101 / `readme.md` §4). Creating projects stays CLI-only. | A |
| E2 | Body `z.strictObject({ incremental?: boolean })`; any other key is `400`; `incremental` has no effect until DIS-10. | A |
| E3 | Synchronous execution inside the request, `202` with the real counters; no `jobId`, no queue. | A; background execution → D |
| E4 | `202` body: `projectId`, `mode`, `analyzer`, `indexedCommit`, `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated`; `filesSkipped` is the incremental plan's counter (DIS-10), not hygiene skips. | A |
| E5 | `invalidateCache` after `saveGraph`, in the same transaction. The CLI `index` does not call it: a project created in that transaction has no entries. | A |
| E6 | `403` for `FORBIDDEN_PATH` and `INDEXING_DISABLED`; the stored root is confined again on every reindex. | A |
| E7 | `NOT_A_GIT_REPOSITORY`/`EMPTY_REPOSITORY` → `503`; `INVALID_GRAPH` → `500` `INTERNAL`. | A |
| E8 | The API does not require `ALLOWED_REPOS_DIR` nor `AUTHOR_HASH_SALT` to start. | A |
| E9 | Reindexing a sample project is not blocked; the seed fingerprint stops matching until `db:seed`. | D |
| E10 | Concurrent reindexes of one project are not serialised; the last commit wins. | D |
| E11 | No CLI reindex command; DIS-10 decides whether it needs one. | B — DIS-10 |
| E12 | File names `routes/reindex.ts`, `schemas/reindex.ts`; change id `index-endpoint`. | A |
| E13 | PowerShell check for the author: in a new PowerShell terminal, with the API running (`npm run up`) and both indexing variables set, `Invoke-RestMethod -Method Post` to `/api/projects/<id>/index` of a project inside `ALLOWED_REPOS_DIR`, and see the route in `/docs`. The agent does the Git Bash half (task 11). `docs/DEMO.md` gets no step. | C — author |
| E14 | Lazy recomputation of `stale` claims (DIS-42) is not touched; the reindex already marks them through the `content_hash` trigger. | D |
| P1 | The shared pipeline is extracted from `indexRepository` instead of faking `createProject` (U1). | A |
| P2 | The transaction runner is a member of `OpenedStore`, not a `StorePort` method; core sees it as a plain function (U2, U3). | A |
| P3 | `AppDeps.indexing` is optional; absent means disabled, so existing API test doubles do not change (U4). | A |
