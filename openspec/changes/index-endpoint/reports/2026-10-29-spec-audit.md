CHANGES REQUIRED

# Spec audit: `index-endpoint` (DIS-9, parent DIS-6), 2026-10-29, first audit

Inputs read: `proposal.md`, `design.md`, the deltas `specs/http-index`, `specs/repository-indexing`, `specs/graph-store` and `specs/api-foundation`, and `tasks.md`. From Linear: DIS-9 (description and 2 comments) and its parent DIS-6. From the project: `docs/project-context.md`, `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/AUTONOMOUS-RUN.md`, the main specs `api-foundation`, `repository-indexing` and `graph-store`, and `docs/adr/20261017-stale-fingerprint-fails-verify.md`. Code checked: `index-repository.ts`, `path-policy.ts`, `open-store.ts`, `postgres-store.ts`, `StorePort.ts`, `api/app.ts`, `composition.ts`, `routes/ask.ts`, `error-handler.ts`, `cli/src/seed/fingerprint.ts`, `scripts/load-env.mjs`, `scripts/env.mjs` and `.dependency-cruiser.cjs`.

## Questions for the author

- **Q1 (scope, parent and sub-issue disagree).** DIS-6 AC1 and AC2 ask for a body with `rootPath` and `language: php`, and a `202` with `jobId`. DIS-9 E1 and E3 replace them with a reindex of an existing project that receives no path and no language and returns no `jobId`, citing DIS-101 and gate question 5. Do you accept that the parent's AC1 and AC2 are met in this adapted form, and that `jobId` is dropped?
- **Q2 (standard).** `docs/backend-standards.md` §6 reserves `202` for "work accepted and processed asynchronously". E3 runs the reindex synchronously and still answers `202`. Do you keep `202` as a recorded deviation from §6, or switch to `200`, which changes the ticket title and DoD?
- **Q3 (run resources).** The change touches seed and golden fingerprint inputs (see B1). Regenerating the golden answers needs a live model (Ollama, as in DIS-107). This run started DIS-9 without the `ollama` flag. Do you want to rerun DIS-9 with Ollama, or should the regeneration become a destination-C step for you before the merge?

---

## 1. Scope against the ticket

Clean, with one small exception. Every item of the proposal comes from DIS-9 `[enhanced]` (E1–E14): the route, the `503`/`500` mappings (E7), the pooled transaction runner, the optional variables (E8), the completion log and the docs. The move of `projectIdParamsSchema` to `common.ts` (U5) and the `PHP_EXTRACTOR` export are refactors the route needs. Nothing widens the change to the parent's incremental plan.

- **Improvable.** The `RangeError` for a non-absolute `workspaceRoot` (design U2, task 2.4) is behaviour no requirement states. Task 2.4 itself says "no spec scenario". Either add it to the `enabled` step of "Reindexing an existing project" with a scenario, or drop task 2.4. Under rule 1 of base-standards, a behaviour that only lives in code is a spec/code discrepancy.

## 2. Inherited acceptance criteria

- **B2 (blocking): the DoD "Test de integración de los cuatro códigos" is not met.** In this project an integration test runs under `tests/integration/` against Postgres. The integration spec only covers `202` ("A reindex answers 202 and invalidates the cache over the seed") and `403` ("A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed"). `400` and `404` exist only as `inject` unit tests with doubles. Correction: add two seed scenarios to `http-index` and task 7.3 (texts in "Corrections to apply").
- Parent AC3 (every `cache_entry` invalidated after any reindex) and DoD "ruta visible en `/docs`": covered.
- Ticket AC5, "a failure after `saveGraph` leaves nothing", is covered by two scenarios together: the core one ("A failed cache invalidation fails the unit of work") and the graph-store one ("Work that rejects leaves nothing"). No single test proves it against Postgres. **Improvable:** see point 3.
- Parent AC1 and AC2 versus E1 and E3: question Q1, not resolved here.

## 3. Missing scenarios

All improvable. Each one is a MUST clause with no scenario:

- `repository-indexing` "Reindexing an existing project":
  - the `confine` step's "a missing allowed root rejects with `IndexingDisabled`";
  - "the framework is not detected";
  - "The project's `name`, `rootPath`, `language`, `framework` and `isSample` SHALL NOT change".
- `graph-store` "Running work in one transaction on a pooled store":
  - "When the rollback itself fails, the work's error SHALL still be the one propagated";
  - "A failure to commit SHALL reject, without the driver's text…";
  - "No write of the work SHALL be visible to other connections before the commit".

  `openPostgresStore` builds its own `pg.Pool` (`open-store.ts:44`), so the first two cannot be provoked without a seam. Either add a seam (an optional `pool` factory in `OpenStoreOptions`) and a scenario, or state in design U3 that they are not tested and why. The third one can be tested: read with a second connection from inside the work.
- `http-index` "Index accepted response": `ts-compiler` for `typescript` has no scenario. Extend "An incremental request is accepted as a full reindex", or add one with a stored TypeScript project expecting `analyzer` `ts-compiler`.
- `api-foundation` "Composition from the environment": the scenario "Both indexing variables compose…" does not check the extractor names (`analyzerName`). Add "and `analyzerName` gives `php-treesitter-laravel` for `php` and `ts-compiler` for `typescript`".

## 4. Ambiguity

Search for fast/easy/secure/efficient/many/appropriate/robust: no occurrences in `proposal.md`, the specs or `tasks.md`. Related vague wording, improvable:

- `design.md` Risks: "a reindex of a **large** repository…" and "both are **short** compared with the analysis". Replace with measurable wording: "a repository the size of acme-shop (N files; reindex measured at X s in step 10) keeps the request open for its whole duration; Node's default `requestTimeout` (300 s) caps it". Then record the duration in the step 10 report.
- `http-index` seed scenario: "`filesQueued` equal to the project's stored file count". It does not say whether that count is taken before or after the request. Write "equal to the number of `file` rows of acme-shop after the request".

## 5. Open decisions

- **B4 (blocking): an absent body.** The spec says "The body MAY be `{}`", but nothing decides a `POST` with no body and no `Content-Type`. That is what `curl -X POST` and E13's `Invoke-RestMethod -Method Post` send. With `z.strictObject` as the body schema, Fastify validates `undefined` and answers `400`. Fix it in `http-index` "Index request validation" with a scenario, and in design U5 with the schema form and the OpenAPI `requestBody.required`. Recommended: "A request without a body is a full reindex, as `{}`. A body declared `application/json` but empty stays `400` `VALIDATION_ERROR` (`api-foundation`, 'Single error format')".
- **B6 (blocking): a concurrent `/ask` during a reindex.** Take an `/ask` that reads the old snapshot while the reindex transaction is still open. After the commit, its `saveCacheEntry` (pooled, `postgres-store.ts`; it deletes and reinserts the pair) can leave an entry built on the old graph. That breaks PH-07 and the sentence "After the `202` … the project holds no answer cache entry". E10 only covers two concurrent reindexes. Decide it in `design.md` (Risks and Follow-ups, as E15) and adjust the `http-index` wording. Either mitigate (A), or record it (D) with the guarantee narrowed to "no entry saved before the reindex's commit remains".
- **Improvable: `buildSnapshot(deps, realRepo, framework?)`.** "Detect only when asked" is not defined, and a stored project may have no framework (`project.ts:41`). With an absent framework, would a reindex detect it? Fix it in U1 with an explicit option, e.g. `{ detectFramework: boolean }`. The reindex passes `false`.
- **Improvable: unmapped failures.** A `CacheWriteFailed` from `invalidateCache`, or the fixed-message commit failure of U3, falls to the global `500` `INTERNAL`. The `http-index` table does not say so. Add the row "Any other failure (cache invalidation or commit failure included) | `500` | `INTERNAL` | `unexpected error` | `{}`".

## 6. Contradictions inside the change

- **B3 (blocking): design U1 against design U2 and the `repository-indexing` `confine` step.** U1 extracts `confineRepository(sourceTree, requested, allowedRoot)` with a single `requested`. That value is resolved **against `allowedRoot`** (`confinePath`, `path-policy.ts:40`; `index-repository.ts:149`) and is also the name `ForbiddenPathError` reports (`index-repository.ts:158`). U2 says the reindex resolves a relative stored `rootPath` against **`workspaceRoot`** and then calls `confineRepository` "with the **stored** `rootPath` as the requested name". One argument cannot be both:
  - passing the stored relative `fixtures/acme-shop` confines `<allowedRoot>/fixtures/acme-shop`, which is wrong (the scenario "A relative stored root resolves against the workspace root" expects `/work/fixtures/acme-shop`);
  - passing the resolved path makes `ForbiddenPathError` name the resolved path, which the spec forbids ("names the stored `rootPath`").

  Correction in "Corrections to apply" (U1 signature, U2 call, one more scenario).
- **Improvable: E3's rationale.** It says `202` "lets it move to the background later without changing clients". A background job could not return `filesQueued`, `indexedCommit` or `cacheEntriesInvalidated` in the `202`, so clients would change. Rewrite the rationale (tied to Q2 and B5).
- **Improvable: `api-foundation` "Configuration from the environment".** It says the API reads its configuration "only from these variables" (the table of five), then "It SHALL also read the two indexing variables". Replace "only from these variables" with "from these variables, the LLM variables and the indexing variables below".
- **Improvable: `api-foundation` "Composition from the environment".** It says "for each project language, the Git source tree, the Git history reader with that salt and the analyzer of that language". Design U4 has one source tree, one history reader and `analyzerFor(language)`. Write instead: "the Git source tree, the Git history reader with that salt, the analyzer of each project language (PHP or TypeScript) and its extractor name".
- **Improvable: error lists.** Design U8 and task 12.1 list the `readme.md` errors as `400`/`403`/`404`/`429`/`503`. The spec's OpenAPI requirement also has `500`. Align them, either by adding `500` or by saying why the readme omits it.

## 7. Contradictions with the project

- **B1 (blocking): the seed and golden fingerprints go stale and the plan does not regenerate them.** The change edits files under three fingerprint inputs:
  - `packages/core/src/index/`: `index-repository.ts`, new `build-snapshot.ts`, `confine-repository.ts`, `reindex-project.ts` and `index-report.ts`;
  - `packages/adapters/store-postgres/src/open-store.ts`;
  - `packages/analyzers/php/src/index.ts`.

  All three are listed in `packages/cli/src/seed/fingerprint.ts:31-37` (`docs/project-context.md` l. 1110-1117). `docs/project-context.md` l. 1228-1235 and ADR `docs/adr/20261017-stale-fingerprint-fails-verify.md` say a stale seed or golden fingerprint fails `npm run verify` locally and in the CI `verify` job. A PR that touches these inputs must run `npm run seed:build` then `npm run cache:build`, which needs a live model, and commit both files. `tasks.md` has no such step, and `proposal.md` → Impact does not name `seeds/graph-dump.sql` or `seeds/cache/*.json`. CI task 14.2 will fail. Correction: a new task group modelled on DIS-107 tasks 3.1–3.4, plus question Q3.
- **B5 (blocking): `docs/backend-standards.md` §6, "`202` for work accepted and processed asynchronously".** E3 answers `202` after synchronous work and does not cite or justify the deviation. Correction: a design decision that names §6 and records the deviation with its reason, or a switch to `200`. The author decides (Q2).
- **Improvable: `docs/backend-standards.md` §3, "The route handler does exactly three things: validate, delegate, serialise".** U5 and U6 also time the use case and log. `/ask` does the same with its events (`routes/ask.ts:152`), so there is precedent. Measuring `durationMs` could move into the core report or stay; say which in U6.
- **Improvable: `readme.md` l. 34**, "El indexado es solo por la CLI local; la API no recibe rutas". After this change its first half is false. Task 12.1 only says to "check [it] stays true". Make it a rewrite with a fixed text, or record that the Entrega 1 table is historical and stays unedited.
- `docs/project-context.md` l. 589-600 (`AUTHOR_HASH_SALT`, `ALLOWED_REPOS_DIR`, only the composition root reads them): consistent with U4. `api-no-sql` and `analyzers-are-siblings` (`.dependency-cruiser.cjs`): not violated by the new `@codemind/analyzer-*` dependencies of `packages/api`.

## 8. Contrast with the real code

- B3 above (`path-policy.ts:37-45`, `index-repository.ts:148-161`).
- **Improvable: a duplicate abstraction.** `AppDeps.source` is already a `createGitSourceTree()` (`app.ts:21`, `composition.ts:127`), and `IndexingDeps.sourceTree` (U4) builds a second one. Reuse `deps.source`, or say why it is a separate instance.
- **Improvable: `getProject`, `saveGraph` and `invalidateCache` all throw `ProjectNotFound`** on malformed or unknown ids (`StorePort.ts:45-56, 206-214`). If the project is deleted between `getProject` and `saveGraph`, the route answers `404`. That is consistent, but no artifact states it. Add one line to U2.
- `saveGraph` sets `indexed_at = clock_timestamp()` (`queries.ts:96`), so "`indexed_at` later than before" works inside the harness transaction. Correct as written.
- `OpenedStore` (`open-store.ts:17-22`) gaining `transaction` forces the change to `recordingOpenStore`. Task 6.2 names it. Correct.

## 9. Task size

Clean. Each task fits one agent turn. Task 5.3 (AppDeps, two schemas, route, registration, exports) is the largest and still bounded.

## 10. Mandatory steps

- Step 0 is first and creates or verifies the branch. The steps are labelled: 8 Review tests (MANDATORY), 9 Run tests and verify data state (MANDATORY, report path and pattern named), 10 Manual (MANDATORY - AGENT MUST EXECUTE, restoration in 10.6), 11 E2E (MANDATORY if applicable, N/A justified), 12 Docs (MANDATORY), 14 Pre-merge Review last, in order, archive before merge. The agent merging (14.7) is allowed in autonomous mode (`docs/AUTONOMOUS-RUN.md` l. 133-135). Clean, apart from:
- The missing seed and golden regeneration step (B1).
- **Improvable: task 10.4, "restart without `AUTHOR_HASH_SALT`".** `npm -w packages/api run dev` preloads `.env`, and a variable not set in the environment gets its `.env` value (`scripts/env.mjs:106`). With the salt set in `.env`, unsetting it does nothing. Write "restart with `AUTHOR_HASH_SALT=` (empty, set for that command)". Apply the same rule to `ALLOWED_REPOS_DIR` in 10.2 and 10.4.
- **Improvable: task 10.3.** In evaluation mode an `UNKNOWN` carries no `usage`, so "answers without `cacheHit: true`" holds trivially. Before the reindex, add `POST /ask` with Q1 answering `usage.cacheHit: true` (the golden entry loaded by `db:seed`), so the "after" means something.
- **Improvable: the branch name.** `feature/dis-9-index-endpoint` is lowercase, while `docs/project-context.md` l. 535 and base-standards use `feature/DIS-n-slug`. The branch already exists and has a commit, so only record it.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| http-index · Index request validation | A body with a path or a language answers VALIDATION_ERROR without indexing | 5.4 |
| | A malformed project id answers VALIDATION_ERROR without indexing | 5.4 |
| | *(missing: absent body, B4)* | *(to add)* |
| | *(missing: 400 over the seed, B2)* | *(to add: 7.3)* |
| http-index · Index accepted response | A reindex answers 202 and invalidates the cache over the seed | 7.1 |
| | An incremental request is accepted as a full reindex | 5.4 |
| http-index · Index error answers | Indexing disabled answers 403 without touching the store | 5.2, 5.3 |
| | An unknown project answers PROJECT_NOT_FOUND | 5.4 |
| | *(missing: 404 over the seed, B2)* | *(to add: 7.3)* |
| | A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed | 7.2 |
| | An unreadable stored repository answers 503 without a path | 5.4 |
| | An invalid graph answers INTERNAL and saves nothing | 5.4 |
| | The index route is rate limited | 5.5 |
| http-index · Index completion log | A reindex logs its counters without paths | 5.5 |
| http-index · Index in the OpenAPI document | The document lists index with its parameter, body and responses | 5.6 |
| repository-indexing · Reindexing an existing project | A reindex saves over the stored project and then invalidates its cache | 2.1, 2.2 |
| | A relative stored root resolves against the workspace root | 2.3 |
| | Reindexing is disabled without an allowed root, before reading the project | 2.3 |
| | An unknown project is not reindexed | 2.3 |
| | A stored root outside the allowed root is rejected before reading | 2.3 |
| | A failed cache invalidation fails the unit of work | 2.3 |
| | An invalid graph writes nothing | 2.3 |
| graph-store · Running work in one transaction on a pooled store | Work that resolves is committed | 3.1, 3.2 |
| | Work that rejects leaves nothing | 3.3 |
| | Every connection is released after a run | 3.3 |
| api-foundation · Configuration from the environment (modified) | Defaults apply… / An invalid variable fails… (unchanged, DIS-76 tests) | 8.2 |
| | Missing indexing variables do not stop the API | 6.3, 6.4 |
| api-foundation · Composition from the environment (modified) | five unchanged DIS-76 scenarios | 8.2 |
| | Both indexing variables compose the indexing dependencies | 6.3, 6.4 |
| *(no requirement)* | *(no scenario)* | 2.4 (`RangeError` guard): orphan task, see point 1 |
| *(no requirement)* | *(no scenario)* | *(missing: seed and golden regeneration, B1)* |

Every existing requirement has scenarios and tasks. The blocking holes are the rows marked *missing* (B1, B2, B4). Task 2.4 is an orphan task (improvable).

---

## Corrections to apply

### `openspec/changes/index-endpoint/specs/http-index/spec.md`

1. **"Index request validation"** (B4). After "The body MAY be `{}`." add:
   > A request without a body (no `Content-Type`, no content) SHALL be handled as the body `{}`. A request declaring `application/json` with an empty body SHALL answer `400` `VALIDATION_ERROR` (`api-foundation`, "Single error format").

   Add the scenario:
   > #### Scenario: A request without a body is a full reindex
   > - **GIVEN** the app built with doubles, indexing configured, and a stored PHP project whose repository can be indexed
   > - **WHEN** `POST /api/projects/{id}/index` is sent with no body and no `Content-Type`, and then with `{}`
   > - **THEN** both answer `202` and the two bodies are equal
2. **New seed scenarios** (B2):
   > #### Scenario: An invalid request answers VALIDATION_ERROR over the seed
   > - **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres with its `root_path` pointing at a copy of `fixtures/acme-shop` with its history built, under the API's allowed repositories root, and one answer cache entry of acme-shop
   > - **WHEN** `POST /api/projects/not-a-uuid/index` is sent `{}`, and `POST /api/projects/<acme-shop's id>/index` is sent `{ "rootPath": "/tmp/x" }`
   > - **THEN** both answer `400` `VALIDATION_ERROR`; no response contains `/tmp/x`; and acme-shop's `indexed_at`, `indexed_commit` and `cache_entry` row are unchanged
   >
   > #### Scenario: An unknown project answers PROJECT_NOT_FOUND over the seed
   > - **GIVEN** the seed loaded as above and no project with the id `00000000-0000-4000-8000-000000000000`
   > - **WHEN** `POST /api/projects/00000000-0000-4000-8000-000000000000/index` is sent `{}`
   > - **THEN** it answers `404` with exactly `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "project not found", "details": {} } }`
3. **"Index accepted response"** (B6). Replace "After the `202`, the project's graph is the new snapshot and the project holds no answer cache entry" with the wording that matches the decision recorded as E15, for example:
   > After the `202`, the project's graph is the new snapshot and no answer cache entry saved before the reindex's commit remains.
4. **"Index error answers"** (point 5). Add a table row: `Any other failure (the cache invalidation or the commit included) | 500 | INTERNAL | unexpected error | {}`.
5. **Seed scenario "A reindex answers 202…"** (point 4). Replace "`filesQueued` equal to the project's stored file count" with "`filesQueued` equal to the number of `file` rows of acme-shop after the request".
6. **"An incremental request…"** or a new scenario (point 3): a stored TypeScript project answers `analyzer` `ts-compiler`.

### `openspec/changes/index-endpoint/specs/repository-indexing/spec.md`

1. **`confine` row** (B3). Write:
   > resolve a relative stored `rootPath` against `workspaceRoot` (an absolute one is used as is) and confine the resolved path to `allowedRoot` exactly as the `confine` phase … does; a `ForbiddenPathError` names the stored `rootPath` as stored (relative or absolute), never the resolved path nor the real path.

   Add to "A stored root outside the allowed root is rejected before reading" a third case: "then one whose stored root is the relative `fixtures/acme-shop`, with the workspace root `/work` and the allowed root `/repos`: it rejects with `ForbiddenPathError` naming `fixtures/acme-shop`".
2. **Missing scenarios** (point 3), improvable:
   - an allowed root that does not exist rejects with `IndexingDisabled`;
   - a project stored with no framework and a `composer.json` declaring Laravel keeps no framework, and `getProject` after the reindex returns the same `name`, `rootPath`, `language`, `framework` and `isSample`.
3. If task 2.4 stays, add to the `enabled` step: "a `workspaceRoot` that is not absolute throws `RangeError` before any call", with a scenario.

### `openspec/changes/index-endpoint/specs/graph-store/spec.md`

Improvable. Add "Work's writes are invisible to another connection before the commit" (read from a second connection inside the work: no project with that name). For the commit-failure and rollback-failure clauses, add a pool seam and scenarios, or keep them untested and say so in design U3.

### `openspec/changes/index-endpoint/specs/api-foundation/spec.md`

Improvable:

- "Configuration from the environment": replace "only from these variables" with "from these variables, then the LLM variables and the indexing variables below".
- "Composition from the environment": replace "for each project language, the Git source tree, the Git history reader with that salt and the analyzer of that language (PHP or TypeScript)" with "the Git source tree, the Git history reader with that salt, and for each project language its analyzer (PHP or TypeScript) and extractor name".
- In "Both indexing variables compose…", add "and the extractor names `php-treesitter-laravel` and `ts-compiler`".

### `openspec/changes/index-endpoint/design.md`

1. **U1** (B3, point 5). Change the signature to `confineRepository(sourceTree, repoPath, allowedRoot, requestedName = repoPath)`: `repoPath` is absolute or relative to `allowedRoot`, and `requestedName` is what `ForbiddenPathError` names. `indexRepository` passes `input.repoPath` twice. Change `buildSnapshot(deps, realRepo, options: { framework?: ProjectFramework; detectFramework: boolean })`. The reindex passes `detectFramework: false`.
2. **U2** (B3). Replace "`confineRepository` with the **stored** `rootPath` as the requested name" with "`confineRepository(sourceTree, resolvedRoot, allowedRoot, project.rootPath)`, where `resolvedRoot = isAbsolute(rootPath) ? rootPath : join(workspaceRoot, rootPath)`". Add: "A project deleted between `getProject` and `saveGraph` makes `saveGraph` throw `ProjectNotFound` inside the unit of work (rolled back, `404`)".
3. **New decision U9, "202 for synchronous work"** (B5, Q2). State that this deviates from `docs/backend-standards.md` §6, why (the ticket fixes `202`, the gate excluded job status), and that moving to the background would change the body (the counters would no longer be known). Rewrite E3's rationale to match. The author decides between keeping `202` and switching to `200`.
4. **Risks and Follow-ups, E15** (B6): "[A `/ask` running while a reindex is open can save, after its commit, an entry built on the previous snapshot] → <A mitigation | D, residual risk: PH-07 holds for questions asked after the `202`>".
5. **Risks, quantify** (point 4): replace "large repository" and "short" with the acme-shop size, the reindex duration measured in step 10, and Node's default `requestTimeout` (300 s).
6. **Risks, seed and golden fingerprints** (B1): "[The change edits seed fingerprint inputs (`packages/core/src/index`, `packages/adapters/store-postgres/src`, `packages/analyzers/php/src`), so `seeds/graph-dump.sql` and `seeds/cache/*.json` go stale and the CI `verify` job fails (ADR 20261017)] → regenerate with `seed:build` then `cache:build` (live model, Ollama) as the last commit that touches an input; the rows must stay identical (only the `analyzer-fingerprint` header changes)".
7. **U4** (point 8): reuse `AppDeps.source` as the indexing source tree, or justify a second instance.
8. **U8**: add `500` to the readme error list, or explain why it is left out. Specify the rewrite of `readme.md` l. 34.

### `openspec/changes/index-endpoint/proposal.md`

Impact: add "`seeds/graph-dump.sql` and `seeds/cache/acme-shop.json` / `seeds/cache/task-api.json` are regenerated (fingerprint inputs touched; needs Ollama)" (B1).

### `openspec/changes/index-endpoint/tasks.md`

1. **New group before step 8, "Regenerate the seed and the golden answers"** (B1), modelled on DIS-107 tasks 3.1–3.4:
   - Docker up, `npm run db:migrate`, `npm run seed:build`. Check that `git diff seeds/graph-dump.sql` touches only the `analyzer-fingerprint` line. Any other difference stops the ticket until it is explained in Follow-ups.
   - `npm run cache:build` with Ollama (`LLM_BASE_URL=http://127.0.0.1:11434/v1`, `LLM_MODEL=qwen2.5-coder`, `LLM_MODEL_VERIFY=qwen2.5-coder`), run detached with a log in the scratchpad.
   - `npm run db:seed` and `npm run verify` with no `LLM_*`: every golden answer matches.
   - Commit the three files with explicit paths.
   - If a later fix touches a fingerprint input, repeat the group so the regeneration is the last commit.
   - Without Ollama, the ticket stops (Q3).
2. **Task 7.3** (B2): RED → GREEN "An invalid request answers VALIDATION_ERROR over the seed" and "An unknown project answers PROJECT_NOT_FOUND over the seed".
3. **Task 5.4** (B4): add "A request without a body is a full reindex". In 8.2, update the counts to 15 `http-index` scenarios (11 unit, 4 integration), plus any added in `repository-indexing`.
4. **Task 2.3** (B3): the third case of "A stored root outside…". Task 1.1: the `requestedName` parameter.
5. **Task 10.2 and 10.4**: "with `AUTHOR_HASH_SALT=` (empty, set for that command; `.env` fills unset variables)", and the same for `ALLOWED_REPOS_DIR`. **Task 10.3**: before the reindex, `POST /ask` with Q1 answers `usage.cacheHit: true`.
6. **Task 12.1**: replace "check … stays true" with the new text of l. 34, e.g. "Ya resuelto antes de la revisión | La API no recibe rutas: solo reindexa un proyecto creado por la CLI desde su raíz guardada". Or record that the table is historical and is not edited.
7. **Task 2.4**: link it to the requirement (if the guard is spec'd) or remove it.

### Linear: DIS-9 (comment in Spanish; `[original]` not touched)

> *Texto del agente: auditoría de especificación (spec-auditor) del change `index-endpoint`, sin la autora.*
>
> Veredicto: `CHANGES REQUIRED`, 6 hallazgos bloqueantes, que se corrigen en los artefactos del change:
> - **B1:** el cambio toca entradas de la huella de la semilla (`packages/core/src/index`, `packages/adapters/store-postgres/src`, `packages/analyzers/php/src`). Hay que regenerar `seeds/graph-dump.sql` y `seeds/cache/*.json` (`seed:build` → `cache:build` con Ollama), o el job `verify` de CI falla.
> - **B2:** el DoD pide test de integración de los cuatro códigos. Se añaden `400` y `404` sobre la semilla.
> - **B3:** `confineRepository` necesita separar la ruta resuelta del nombre que cita `ForbiddenPathError`.
> - **B4:** una petición sin cuerpo (`curl -X POST`, `Invoke-RestMethod -Method Post`) se trata como `{}`; un cuerpo JSON vacío sigue siendo `400`.
> - **B5:** `202` síncrono contradice `docs/backend-standards.md` §6. Se registra como desviación o se cambia a `200` (decide la autora).
> - **B6:** un `/ask` concurrente con un reindexado puede dejar una entrada de caché del grafo anterior. Se registra como E15 con su destino.
>
> Preguntas para la autora: alcance frente a DIS-6 (sin `rootPath`, `language` ni `jobId`), `202` frente a `200`, y si DIS-9 se vuelve a lanzar con `ollama` para regenerar las respuestas golden.

### Linear: DIS-9 description, `[enhanced]` part

- In "Criterios de aceptación", AC3: add "Una petición sin cuerpo equivale a `{}`".
- Under the decisions table, add:
  - "E15: `/ask` concurrente con un reindexado (destino A o D)";
  - "E16: regeneración de semilla y golden por tocar entradas de la huella (A; requiere Ollama)".

---

## Resolution of run 1

*Agent's text: correction round 1 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), done by the agent as lead engineer without the author. Every decision is recorded in `design.md` → Follow-ups (E15–E24) with its A/B/C/D destination and in a Spanish comment on DIS-9. `openspec validate index-endpoint --strict` passes after the edits.*

### Questions for the author (decided by the agent)

| Question | Resolution |
|---|---|
| Q1 (scope against DIS-6) | Decided by the agent, E18 (A): the parent's AC1 and AC2 are met in the adapted form of E1/E3; `jobId` is dropped (gate question 5, nobody could query it). Closing DIS-6 on this reading is left to the author (C). |
| Q2 (`202` against backend-standards §6) | Decided by the agent, E17 (A): `202` is kept, as the ticket title, its DoD and DIS-6 AC2 fix it; the deviation from §6 is recorded as design U9. |
| Q3 (Ollama for the golden regeneration) | Decided by the agent, E16 (A): the regeneration is done in this change (tasks group 10), with the local Ollama install (present on the machine), started by the apply step if it is not serving; if it cannot serve, the ticket stops. No rerun of DIS-9 is needed. The new review of the regenerated golden entries goes to the author (C), since `verify` does not read `reviews`. |

### Blocking findings

| Finding | Resolution |
|---|---|
| B1 (seed and golden fingerprints) | Fixed. New tasks group 10 "Regenerate the seed and the golden answers with Ollama" (modelled on DIS-107 3.1–3.4, with the rule that it is the last commit touching an input, 10.5, and the repeat in 15.6); design Risks gains the stale-fingerprint risk; proposal Impact names the three files. The group sits after step 9 instead of before step 8, so the mutation fixes of 9.4 land before the regeneration and it is not repeated needlessly. |
| B2 (integration test of the four codes) | Fixed. `http-index` gains "An invalid request answers VALIDATION_ERROR over the seed" and "An unknown project answers PROJECT_NOT_FOUND over the seed"; task 7.3; counts in 8.2 updated (16 = 12 unit + 4 integration). |
| B3 (`confineRepository` path against name) | Fixed. Design U1: `confineRepository(sourceTree, repoPath, allowedRoot, requestedName = repoPath)`; U2 calls it with the resolved root and `project.rootPath`; the `confine` step of `repository-indexing` says the error names the stored root as stored; the scenario "A stored root outside the allowed root is rejected before reading" gains the relative third case; tasks 1.1, 2.2 and 2.3. |
| B4 (absent body) | Fixed, E19. `http-index` "Index request validation" states that no body equals `{}` and an empty `application/json` body is `400`; new scenario "A request without a body is a full reindex" (it also checks the empty JSON body); design U5 specifies a `preValidation` hook and `requestBody.required` absent or `false`; the OpenAPI requirement and scenario say the body is not required; tasks 5.3, 5.4, 5.6, 11.3 and 11.4. |
| B5 (`202` against §6) | Decided by the agent, E17: design U9 names §6 and records the deviation and its reason; E3's rationale rewritten; `http-index` "Index accepted response" points at U9. |
| B6 (concurrent `/ask` during a reindex) | Decided by the agent, E15 (D): not mitigated; the `http-index` guarantee is narrowed to "no answer cache entry saved before the reindex's commit remains", stated for questions asked after the `202`; design Risks records it. A mitigation would change the answer cache contract, which this ticket does not own. |

### Improvable findings

| Finding | Resolution |
|---|---|
| Point 1, `RangeError` guard without a requirement | Fixed, E22: spec'd in the `enabled` step with the scenario "A workspace root that is not absolute is rejected before any call"; task 2.4 now maps to it. |
| Point 2, AC5 without a single Postgres test | Rejected: the two scenarios together ("A failed cache invalidation fails the unit of work" in core and "Work that rejects leaves nothing" in the adapter) prove it, and the integration harness's own transaction cannot exercise the pooled runner's rollback without duplicating "Work that rejects leaves nothing". |
| Point 3, missing allowed root rejects with `IndexingDisabled` | Fixed: scenario "An allowed root that does not exist disables reindexing". |
| Point 3, framework not detected and fields unchanged | Fixed: scenario "A reindex keeps the stored project fields and detects no framework". |
| Point 3, rollback-failure and commit-failure clauses | Decided by the agent, E21 (D): not tested, no pool seam added; the reason is in design U3. |
| Point 3, writes invisible before the commit | Fixed: `graph-store` scenario "Work's writes are invisible to another connection before the commit"; task 3.3. |
| Point 3, `ts-compiler` without a scenario | Fixed: `http-index` scenario "A TypeScript project answers with the ts-compiler analyzer"; task 5.4. |
| Point 3, extractor names in the composition scenario | Fixed: "Both indexing variables compose the indexing dependencies" checks `php-treesitter-laravel` and `ts-compiler`. |
| Point 4, vague wording in design Risks | Fixed: the request-duration and lock risks name acme-shop, the duration measured in the manual step (task 11.3, report 11.7) and Node's default `requestTimeout` (300 s). |
| Point 4, `filesQueued` count before or after | Fixed: "the number of `file` rows of acme-shop after the request". |
| Point 5, `buildSnapshot` framework option | Fixed, E22: `buildSnapshot(deps, realRepo, { framework?, detectFramework })`; the reindex passes `detectFramework: false`. |
| Point 5, unmapped failures | Fixed: `http-index` error table gains the row "Any other failure (the cache invalidation or the commit included)"; design U5 says so. |
| Point 6, E3's rationale | Fixed with B5 (U9, E3 row rewritten). |
| Point 6, "only from these variables" | Fixed in `api-foundation` "Configuration from the environment". |
| Point 6, "for each project language, the Git source tree…" | Fixed in `api-foundation` "Composition from the environment" (the source tree is no longer part of the indexing dependencies, see point 8). |
| Point 6, readme error list without `500` | Fixed: design U8 and task 13.1 list `400`/`403`/`404`/`429`/`500`/`503`. |
| Point 7, backend-standards §3 (timing in the route) | Decided by the agent, E20 (A): timing and the log stay in the route, as `/ask` does; design U6 says why. |
| Point 7, `readme.md` l. 34 | Fixed: task 13.1 and design U8 give the fixed new text of the third column; l. 26 is historical and not edited. |
| Point 8, duplicate source tree | Fixed, E23: `IndexingDeps` holds no source tree; the route passes `AppDeps.source` (design U2, U4; tasks 5.3, 6.4). |
| Point 8, project deleted between `getProject` and `saveGraph` | Fixed: one line in design U2 (rolled back, `404`). |
| Point 10, task 10.4 `AUTHOR_HASH_SALT` unset | Fixed: now task 11.4 restarts with `AUTHOR_HASH_SALT=` (empty, set for that command) and 11.2 states that `.env` only fills unset variables; `ALLOWED_REPOS_DIR` is likewise set for the command. |
| Point 10, task 10.3 trivially true | Fixed: now task 11.3 first asks Q1 and expects `usage.cacheHit: true` from the golden entry, then reindexes, then asks again. |
| Point 10, branch name in lowercase | Decided by the agent, E24 (D): kept and recorded (task 0.1). |

### Linear

The Spanish comment of this round is posted on DIS-9. The `[enhanced]` description is not edited in this round: the new decisions E15–E24 live in `design.md` → Follow-ups and in that comment, which is where §6 asks for them.
