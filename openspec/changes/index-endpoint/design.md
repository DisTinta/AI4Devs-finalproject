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

- `confineRepository(sourceTree, repoPath, allowedRoot, requestedName = repoPath)`: the current
  private `confine`, exported from a new `packages/core/src/index/confine-repository.ts`. `repoPath`
  is absolute or relative to `allowedRoot` (resolved by `confinePath`, as today); `requestedName` is
  the only name `ForbiddenPathError` carries. `indexRepository` passes `input.repoPath` for both, so
  its behaviour does not change.
- `buildSnapshot(deps, realRepo, options: { framework?: ProjectFramework; detectFramework: boolean })`
  in a new `packages/core/src/index/build-snapshot.ts`:
  read → hygiene → redact → (detect the framework only when `detectFramework` is `true`; otherwise
  `options.framework` is used as given, absent included) → analyse with the path-set check →
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
  sourceTree: SourceTreePort;                        // the API passes AppDeps.source (U4)
  git: GitPort;
  analyzerFor(language: ProjectLanguage): AnalyzerPort;
  inTransaction<T>(work: (store: StorePort) => Promise<T>): Promise<T>;  // unit of work
}
interface ReindexInput { projectId: string; allowedRoot: string | undefined; workspaceRoot: string }
```

Order (spec `repository-indexing` → "Reindexing an existing project"): a `workspaceRoot` that is not
absolute throws `RangeError` before any call, as `explain` does (spec'd in the `enabled` step); blank
`allowedRoot` → `IndexingDisabled` before any store call; `store.getProject` → `ProjectNotFound`;
`resolvedRoot = isAbsolute(rootPath) ? rootPath : join(workspaceRoot, rootPath)` (the rule of
`context-pack.ts`); `confineRepository(sourceTree, resolvedRoot, allowedRoot, project.rootPath)`, so
the path confined is the resolved one and `ForbiddenPathError` names the stored `rootPath` as stored;
`buildSnapshot(deps, realRepo, { framework: project.framework, detectFramework: false })`; then
`inTransaction(async (tx) => { const saved = await tx.saveGraph(id, graph); const n = await tx.invalidateCache(id); return { saved, n }; })`.
A project deleted between `getProject` and `saveGraph` makes `saveGraph` throw `ProjectNotFound`
inside the unit of work: it is rolled back and the route answers `404` (`StorePort.ts`: `getProject`,
`saveGraph` and `invalidateCache` all throw `ProjectNotFound` for an unknown id).
The report is `ReindexReport` (new type in `index-report.ts`): the `IndexReport` fields minus
`framework`/`frameworkSource`, plus `language` and `cacheEntriesInvalidated`.

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
`tests/integration/store/open-store.spec.ts`: commit, rollback, isolation before the commit (a second
connection reads from inside the work) and connection release.

Two clauses of that requirement are **not** tested: "a failed rollback still propagates the work's
error" and "a failed commit rejects with the fixed message". `openPostgresStore` builds its own
`pg.Pool` (`open-store.ts`), so neither failure can be provoked against a real database without a new
seam, and adding a pool factory to `OpenStoreOptions` only for these two paths widens the adapter's
public surface. Both are a few lines read in review and covered by the mutation run of the file; this
is recorded as decision E21 (D).

### U4. Composition (`composition.ts`) and `AppDeps`

- New `indexingConfigFromEnv(env)`: trimmed `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT`; returns
  `undefined` when either is blank. It never throws, and `ApiConfig`/`apiConfigFromEnv` do not change
  (so their existing tests do not change). A relative `ALLOWED_REPOS_DIR` resolves against the
  process working directory (`confinePath`, `path-policy.ts`), as in the CLI; since
  `npm -w packages/api run dev` runs with cwd `packages/api`, the comment of `.env.example` asks for
  an absolute path (E26).
- `AppDeps` gains an **optional** `indexing?: IndexingDeps`:
  `{ allowedRoot: string; git; analyzerFor(language); analyzerName(language); inTransaction }`.
  Optional so `tests/unit/api/support.ts` → `defaultDeps()` and `app.spec.ts` stay as they are, and
  absent means "indexing disabled". It holds **no** source tree: the route passes the existing
  `AppDeps.source` (already a `createGitSourceTree()`, `composition.ts`) as `sourceTree`, so there is
  one source tree instance.
- `composeFromEnv` builds it only when `indexingConfigFromEnv` returns a value:
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
- **Absent body** (E19): a `preValidation` hook of the route sets `request.body = {}` when the body is
  `undefined` (no `Content-Type`, no content: `curl -X POST`, `Invoke-RestMethod -Method Post`), so
  schema validation then sees `{}`. Fastify validates after `preValidation`, so the strict schema is
  unchanged. A body declared `application/json` but empty never reaches the hook: Fastify's parser
  fails with `FST_ERR_CTP_EMPTY_JSON_BODY`, which the error handler already answers `400`
  `VALIDATION_ERROR`.
- **`requestBody.required` in the document** (E25): `@fastify/swagger` (9.9.2,
  `lib/spec/openapi/utils.js` l. 482-486) always writes `requestBody.required: true` for a route with
  `schema.body`, whatever the schema says. `registerOpenApi` (`packages/api/src/plugins/openapi.ts`)
  therefore gains a `transformObject` that sets `requestBody.required = false` on every operation
  whose `application/json` body schema has no `required` key (or an empty one), and changes nothing
  else in the document. `/ask`'s body requires `question`, so its operation keeps `required: true`
  and `tests/unit/api/health-docs.spec.ts` stays unedited. The index operation's body
  (`{ incremental? }`) has no required key, so it is published with `requestBody.required: false`.
- `reindexResponseSchema` (`202`): `projectId` (string), `mode` (`z.literal('full')`), `analyzer`
  (string), `indexedCommit` (string), `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated`
  (integers).
- `registerReindexRoute(app, { reindex? })` (seam `AppOptions.reindex`, as `explain`):
  `indexing = app.deps.indexing ?? throw new IndexingDisabled()`; call `reindexProject`; log; reply
  `202`. Domain table `REINDEX_DOMAIN_ERRORS`: `INDEXING_DISABLED` 403, `PROJECT_NOT_FOUND` 404,
  `FORBIDDEN_PATH` 403 (fixed message, `details: {}`), `NOT_A_GIT_REPOSITORY` and `EMPTY_REPOSITORY`
  503 `the project's source cannot be read` with `details: {}`. `INVALID_GRAPH` is deliberately left
  out of the table, so the global handler answers `500` `INTERNAL` and logs it at `error`; the same
  holds for any other failure, a `CacheWriteFailed` of `invalidateCache` or the fixed-message commit
  failure of U3 included (`http-index` table, last row).
- The `202` is sent with `reply.code(202)`; the response schema is declared under `202`.
- Registered in `buildApp` after `registerAskRoute`, so it sits behind the rate limit and appears in
  `/docs`.

### U6. Completion log

`request.log.info({ projectId, mode: 'full', filesQueued, redactions, cacheEntriesInvalidated, durationMs }, 'reindex completed')`,
with `redactions = events.length + commitEvents.length` and `durationMs` from `performance.now()`
around the use case. No path field; events are counted, never logged (an event carries a file path).

Timing and logging stay in the route, beyond the "validate, delegate, serialise" of
`docs/backend-standards.md` §3, with the precedent of `/ask` (`routes/ask.ts`, its completion events):
the duration is an HTTP observability field, not part of the core report, which stays plain
JSON-serialisable data with no clock (decision E20).

### U9. `202` for synchronous work (deviation from `docs/backend-standards.md` §6)

`docs/backend-standards.md` §6 reserves `202` for "work accepted and processed asynchronously". This
route answers `202` after the reindex has run to completion inside the request. The deviation is kept
on purpose (E17): the ticket title, its DoD ("the four codes `202`/`400`/`403`/`404`") and the parent's
AC2 fix `202`, and switching to `200` would change the ticket's contract. The planning gate (question
5) excluded a job status endpoint, so there is no background job to justify `202` in §6's sense. Moving
the reindex to the background later **would** change clients: the counters (`indexedCommit`,
`filesQueued`, `cacheEntriesInvalidated`) would no longer be known when answering, so the body would
change; that move is out of scope (E3, D). The readme documents the route as synchronous.

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
- `tests/integration/store/open-store.spec.ts`: the four scenarios of U3 over the shared database,
  deleting what they commit.

### U8. Documentation

`readme.md` §4: `/index` returns as the third product endpoint (body `{ incremental? }`, absent body
equal to `{}`, `202` body, errors `400`/`403`/`404`/`429`/`500`/`503`, the same list as the OpenAPI
requirement), and the DIS-101 note becomes "the API never receives a path: it re-indexes a project
created by the CLI from its stored root". The Entrega 1 recommendations table row "Que el servidor no
acepte rutas de repositorio" (l. 34) keeps its status and its third column is rewritten to the fixed
text "La API no recibe rutas: solo reindexa un proyecto creado por la CLI desde su raíz guardada", since
its old first half ("El indexado es solo por la CLI local") stops being true. The row "Alinear el
contrato OpenAPI…" (l. 26) is historical and stays as it is. `docs/project-context.md`: the API's
three routes, the two optional variables, the transaction runner. `.env.example`: the comments of
`ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` say the API reads them too. No ADR: the decision is local to
this endpoint and reversible (it adds a route and an optional dependency).

## Risks / Trade-offs

- [A reindex holds the HTTP request open for its whole duration] → a repository the size of acme-shop
  (its `file` rows in the seed) is the target; the step 11 report records the measured duration of its
  reindex, and Node's default `requestTimeout` (300 s) caps any request. Moving to the background would
  change the body (U9) and is out of scope (E3, D).
- [The transaction holds row locks on the project while `saveGraph` and `invalidateCache` run] → the
  transaction opens only after the analysis and the history have finished, so it spans the two writes
  only; the step 11 report records the reindex duration, of which the transaction is a part.
- [A `/ask` running while a reindex is open reads the previous snapshot and, after the reindex's
  commit, saves a cache entry built on it (`saveCacheEntry` deletes and reinserts the pair on the
  pooled store)] → recorded, not mitigated (E15, D): the guarantee is narrowed to "no entry saved
  before the reindex's commit remains", so PH-07 holds for questions asked after the `202`. A
  mitigation (comparing `indexed_at` on save) would change the answer cache contract.
- [The change edits seed fingerprint inputs (`packages/core/src/index`,
  `packages/adapters/store-postgres/src`, `packages/analyzers/php/src`), so `seeds/graph-dump.sql` and
  `seeds/cache/*.json` go stale and the CI `verify` job fails (ADR 20261017)] → regenerated in this
  change with `seed:build` then `cache:build` with Ollama, as the last commit that touches an input
  (E16, tasks group 10); the seed's rows must stay identical (only the `analyzer-fingerprint` header
  changes). The regenerated golden entries come back with empty `reviews` (E16, review → C).
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
| E3 | Synchronous execution inside the request, `202` with the real counters; no `jobId`, no queue. `202` is kept because the ticket fixes it (U9, E17), not because a later move to the background would leave clients unchanged: it would change the body. | A; background execution → D |
| E4 | `202` body: `projectId`, `mode`, `analyzer`, `indexedCommit`, `filesQueued`, `filesSkipped`, `cacheEntriesInvalidated`; `filesSkipped` is the incremental plan's counter (DIS-10), not hygiene skips. | A |
| E5 | `invalidateCache` after `saveGraph`, in the same transaction. The CLI `index` does not call it: a project created in that transaction has no entries. | A |
| E6 | `403` for `FORBIDDEN_PATH` and `INDEXING_DISABLED`; the stored root is confined again on every reindex. | A |
| E7 | `NOT_A_GIT_REPOSITORY`/`EMPTY_REPOSITORY` → `503`; `INVALID_GRAPH` → `500` `INTERNAL`. | A |
| E8 | The API does not require `ALLOWED_REPOS_DIR` nor `AUTHOR_HASH_SALT` to start. | A |
| E9 | Reindexing a sample project is not blocked; the seed fingerprint stops matching until `db:seed`. | D |
| E10 | Concurrent reindexes of one project are not serialised; the last commit wins. | D |
| E11 | No CLI reindex command; DIS-10 decides whether it needs one. | B — DIS-10 |
| E12 | File names `routes/reindex.ts`, `schemas/reindex.ts`; change id `index-endpoint`. | A |
| E13 | PowerShell check for the author: in a new PowerShell terminal, with the API running (`npm run up`) and both indexing variables set, `Invoke-RestMethod -Method Post` to `/api/projects/<id>/index` of a project inside `ALLOWED_REPOS_DIR`, and see the route in `/docs`. The agent does the Git Bash half (tasks group 11). `docs/DEMO.md` gets no step. | C — author |
| E14 | Lazy recomputation of `stale` claims (DIS-42) is not touched; the reindex already marks them through the `content_hash` trigger. | D |
| P1 | The shared pipeline is extracted from `indexRepository` instead of faking `createProject` (U1). | A |
| P2 | The transaction runner is a member of `OpenedStore`, not a `StorePort` method; core sees it as a plain function (U2, U3). | A |
| P3 | `AppDeps.indexing` is optional; absent means disabled, so existing API test doubles do not change (U4). | A |

*Agent's text: decisions of correction round 1 of the spec audit (`reports/2026-10-29-spec-audit.md`,
run 1), taken by the agent as lead engineer without the author, answering the audit's questions Q1–Q3
and its open decisions.*

| Id | Decision | Destination |
|---|---|---|
| E15 | (B6) A `/ask` running while a reindex is open can save, after the reindex's commit, an answer built on the previous snapshot. Not mitigated: the `http-index` guarantee is narrowed to "no answer cache entry saved before the reindex's commit remains"; PH-07 holds for questions asked after the `202`. Mitigating would change the answer cache contract (`saveCacheEntry`), which this ticket does not own. | D — residual risk, recorded |
| E16 | (B1, Q3) The change touches seed fingerprint inputs, so this change regenerates `seeds/graph-dump.sql` (`seed:build`) and `seeds/cache/acme-shop.json` / `seeds/cache/task-api.json` (`cache:build`) with the local Ollama (`qwen2.5-coder`), as DIS-107 did, as the last commit touching an input (tasks group 10). The run was launched without the `ollama` flag, so the apply step starts Ollama from its local install if it is not serving; if it cannot serve, the ticket stops (CI `verify` would stay red). Rerunning DIS-9 is not needed. The regenerated golden entries come back with empty `reviews`; `verify` does not read them, so their new independent review goes to the author. | A (regeneration); new golden review → C — author |
| E17 | (B5, Q2) Keep `202` for a synchronous reindex, recorded as a deviation from `docs/backend-standards.md` §6 (U9): the ticket title, its DoD and the parent's AC2 fix `202`; `200` would change the ticket's contract. | A |
| E18 | (Q1) The parent DIS-6's AC1 (`rootPath`, `language: php` in the body) and AC2 (`202` with `jobId`) are met in the adapted form of E1/E3: the reindex of a stored project, without path, language or `jobId`. The `jobId` is dropped (nobody could query it; gate question 5). Whether DIS-6 can close on this reading is the author's judgement when reviewing the parent. | A; closure of DIS-6 → C — author |
| E19 | (B4) A request without a body (no `Content-Type`) is a full reindex, as `{}`; a body declared `application/json` but empty stays `400` `VALIDATION_ERROR`. Implemented with a route `preValidation` hook (U5). | A |
| E20 | Timing (`durationMs`) and the completion log stay in the route, as `/ask` does, beyond backend-standards §3's "validate, delegate, serialise" (U6). | A |
| E21 | The rollback-failure and commit-failure clauses of `graph-store` "Running work in one transaction on a pooled store" are not tested: provoking them needs a pool seam in `OpenStoreOptions`, which widens the adapter only for tests (U3). Isolation before the commit is tested. | D — recorded |
| E22 | The `RangeError` guard for a non-absolute `workspaceRoot` is spec'd in the `enabled` step with its own scenario (task 2.4 no longer orphan). `buildSnapshot` takes `{ framework?, detectFramework }`; the reindex passes `detectFramework: false`, so a project stored without a framework keeps none. `confineRepository` separates the confined path from the name in `ForbiddenPathError` (U1, U2). | A |
| E23 | `AppDeps.source` is reused as the indexing source tree; `IndexingDeps` holds no second one (U4). | A |
| E24 | The branch is `feature/dis-9-index-endpoint` (lowercase), while `docs/project-context.md` writes `feature/DIS-n-slug`. The branch already exists with commits; it is kept and only recorded. | D — recorded |

*Agent's text: decisions of correction round 2 of the spec audit (`reports/2026-10-29-spec-audit.md`,
run 2), taken by the agent as lead engineer without the author.*

| Id | Decision | Destination |
|---|---|---|
| E25 | (run-2 B1) `@fastify/swagger` 9.9.2 always publishes `requestBody.required: true` for a route with `schema.body`. The body stays declared by schema (the project's validation pattern) and a generic `transformObject` in `packages/api/src/plugins/openapi.ts` sets `requestBody.required = false` on operations whose JSON body schema has no required key; `/ask`'s document does not change (U5). The file joins the Stryker `--mutate` list. Rejected: validating in the handler (breaks the schema-validation pattern) and dropping the clause (the document would contradict E19). | A |
| E27 | (apply) The seed load (`seed:build` then `db:seed` of group 10) deletes by cascade the `query_log` rows of the sample projects, so the local baseline of 0.4 (`query_log` 8) became 0; not restorable and read by no spec. The post-seed baseline (2 / 6 / 0) is the one restored in step 11. | D — recorded |
| E28 | (apply) `tests/harness/doctor-autonomous.spec.ts` failed in the whole-suite run and did not finish alone within 300 s; it exercises the kit's autonomous preflight (`gh`, the profile) and touches nothing of this change. Not fixed here (kit file, outside the ticket). The author should rerun it outside the autonomous session. | C — author |
| E29 | (apply) Stryker survivors accepted after the red-first tests: defensive optional chaining in `markOptionalBodies`, three literals of pre-existing `openapi.ts`, and the equivalent mutants of `detectFramework` in `reindexProject` (the framework `buildSnapshot` returns is discarded by a reindex). See the step 9 report. | D — recorded |
| E26 | (run 2, improvable) A relative `ALLOWED_REPOS_DIR` keeps resolving against the process working directory, as the CLI does today (`confinePath`); it is stated in `api-foundation` and U4, and `.env.example` asks for an absolute path. Resolving it against `workspaceRoot` instead was rejected: it would make the API and the CLI read the same value differently and change existing code beyond the ticket. | A |
