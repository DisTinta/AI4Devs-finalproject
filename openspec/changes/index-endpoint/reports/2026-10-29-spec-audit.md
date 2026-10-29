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

---

## Run 2 (2026-10-29)

CHANGES REQUIRED

# Spec audit: `index-endpoint` (DIS-9, parent DIS-6), 2026-10-29, run 2

Inputs read: `proposal.md`, `design.md`, `tasks.md`, the deltas `specs/http-index`, `specs/repository-indexing`, `specs/graph-store` and `specs/api-foundation`, and `reports/2026-10-29-spec-audit.md` (run 1 and its resolution). From Linear: DIS-9 (description and 3 comments) and its parent DIS-6 (description, no comments). From the project: `docs/project-context.md`, `docs/openspec-tasks-mandatory-steps.md` and the main spec `openspec/specs/api-foundation/spec.md`. Code checked: `packages/core/src/index/path-policy.ts`, `index-repository.ts`, `packages/adapters/store-postgres/src/open-store.ts`, `packages/api/src/composition.ts`, `routes/ask.ts`, `plugins/error-handler.ts`, `plugins/openapi.ts`, `plugins/zod-compiler.ts`, `packages/cli/src/seed/fingerprint.ts`, `packages/adapters/git/src/config.ts`, `packages/analyzers/*/src/index.ts`, `tests/integration/store/open-store.spec.ts`, `tests/integration/api/ask.spec.ts`, `seeds/graph-dump.sql`, `.env.example`, and `node_modules/@fastify/swagger/lib/spec/openapi/utils.js` (v9.9.2).

## Questions for the author

None new. Run 1's Q1–Q3 were answered by the agent as E18, E17 and E16. Those answers do not contradict the ticket or the project, so I accept them. Three items stay pending for the author, all destination C: closing DIS-6 on the adapted reading (E18), the PowerShell check (E13), and the new review of the regenerated golden entries (E16).

---

## 1. Scope against the ticket

Clean. Every item comes from DIS-9 `[enhanced]` E1–E14 or from the run-1 corrections E15–E24:
- the route, its schema and its error table;
- the core use case;
- the pooled transaction runner;
- the optional variables;
- the completion log;
- the documentation;
- the seed and golden regeneration that the fingerprint ADR forces.

The `projectIdParamsSchema` move and the `PHP_EXTRACTOR` export are refactors the route needs. Nothing pulls in DIS-10 (the incremental plan) or DIS-42 (lazy `stale` recomputation).

## 2. Inherited acceptance criteria

Clean.
- **DoD "test de integración de los cuatro códigos":** covered over Postgres by 4 seed scenarios.
  - `202`: "A reindex answers 202 and invalidates the cache over the seed".
  - `400`: "An invalid request answers VALIDATION_ERROR over the seed".
  - `403`: "A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed".
  - `404`: "An unknown project answers PROJECT_NOT_FOUND over the seed".
- **DoD "ruta visible en `/docs`":** covered by "The document lists index…".
- **DoD "cacheHit = false" after a reindex:** covered by the seed `202` scenario.
- **DIS-6 AC1, AC2 and AC3:** AC3 (every `cache_entry` invalidated) is covered. AC2 asks for `language: ruby` → `400` and an unknown project → `404`; both are covered. AC1 and AC2's `rootPath` and `jobId` are met in the adapted form of E1/E3/E18 (accepted, closing DIS-6 is C).
- **DIS-9 `[enhanced]` AC1–AC5:** all covered. AC5 ("fallo después de `saveGraph`") is covered by the core scenario plus the adapter scenario. The rejection of a single Postgres test was argued in run 1, and I accept it.

## 3. Missing scenarios

Clean. Every MUST clause of the four deltas now has a scenario. Two clauses are not tested, and design U3 records them with their reason (E21, D):
- `graph-store`: rollback failure;
- `graph-store`: commit failure.

## 4. Ambiguity

Clean. The forbidden words (fast, easy, secure, efficient, many, appropriate, robust) do not appear in the proposal, the design, the specs or the tasks. The only hits outside the reports are "a short Spanish comment" in task 0.2 (not a behaviour) and a non-matching hit in 10.1. The run-1 vague wording ("large", "short") was replaced by acme-shop's size, the duration measured in step 11 and the 300 s `requestTimeout`.

## 5. Open decisions

- **B1 (blocking): `requestBody.required` cannot be "absent or `false`" with the route as designed.**
  - **What the change promises.** `http-index` "Index in the OpenAPI document" says the request body is "not required", and its scenario demands `requestBody.required` "absent or `false`". Task 5.6 tests exactly that. Design U5 says the operation "leaves `requestBody.required` absent or `false` (the schema has no required key)".
  - **Why that is wrong.** The rationale is false for the installed `@fastify/swagger` 9.9.2. `node_modules/@fastify/swagger/lib/spec/openapi/utils.js:482-486` always writes `openapiMethod.requestBody = { required: true, content: {} }` when a route declares `schema.body`. The comment there says "requestBody.required should always be true". `resolveBodyParams` (l. 276-297) never resets it. The project's `transform` (`packages/api/src/plugins/zod-compiler.ts:84`, `zodToOpenApi`) only converts schemas, and `registerOpenApi` (`packages/api/src/plugins/openapi.ts:19-31`) sets no `transformObject`.
  - **What it leaves open.** As written, task 5.6 cannot pass, and the implementer would have to choose alone among three options:
    - a document post-processor (`transformObject`) in `plugins/openapi.ts`;
    - removing `schema.body` and validating in the handler, which breaks the "validation by schema" pattern;
    - dropping the clause.
  - **Where to fix it.** Design U5, the `http-index` OpenAPI requirement, proposal Impact and tasks 5.3/5.6/9.4.
  - **Recommended decision.** A generic `transformObject` in `registerOpenApi`. It sets `requestBody.required = false` on every operation whose `application/json` body schema has no `required` key, and leaves every other document field untouched. `/ask`'s body has required `question`, so its document does not change, and `tests/unit/api/health-docs.spec.ts` stays unedited. `plugins/openapi.ts` joins the Impact list and the Stryker `--mutate` list.
- **Improvable: a relative `ALLOWED_REPOS_DIR`.** `confinePath` resolves the allowed root against the process cwd (`path-policy.ts:39`). The API is started with `npm -w packages/api run dev`, whose cwd is `packages/api`, while the CLI runs from the repository root. So the same relative value names two different directories. The behaviour comes from the existing code (the CLI has it too), but no artifact states it. Add one line to `api-foundation` "Configuration from the environment" or to design U4. Recommended text: "a relative `ALLOWED_REPOS_DIR` resolves against the process working directory, as in the CLI; `.env.example` asks for an absolute path". The alternative is to resolve it against `workspaceRoot`.

## 6. Contradictions inside the change

- **Improvable: the composition wording in the proposal.** `proposal.md` → What Changes → Composition says the indexing dependencies hold the "(Git source tree and history, …)". Design U4 and E23, and the `api-foundation` delta, say `IndexingDeps` holds **no** source tree and that `AppDeps.source` is reused. Replace "(Git source tree and history, the analyzer of each language, the transaction runner)" with "(the Git history reader, the analyzer and extractor name of each language, the transaction runner; the existing source tree is reused)".
- **Improvable: design B1 rationale (linked to point 5).** U5's sentence "(the schema has no required key)" is the false premise. Replace it with the decision taken for B1.

Everything else is consistent across the proposal, design U1–U9, E1–E24 and the deltas: the signatures, the error table, the `202` deviation, the E15 guarantee and the scenario counts in 8.2. Those counts are 16 = 12 + 4, 10, 4 and 2, and I checked each against the deltas.

## 7. Contradictions with the project

Clean. The `202` deviation from `docs/backend-standards.md` §6 is recorded (U9, E17), and so is the timing in the route against §3 (U6, E20). The seed and golden regeneration follows ADR `20261017-stale-fingerprint-fails-verify`. The fingerprint inputs named in task 10 match `packages/cli/src/seed/fingerprint.ts:30-51`: `packages/core/src/index`, `packages/adapters/store-postgres/src` and `packages/analyzers/php/src` are touched, while `packages/api/src` and `packages/core/src/knowledge` are not inputs. The base branch `final-project-CRN` matches `docs/project-context.md` l. 535. The lowercase branch name is recorded (E24).

## 8. Contrast with the real code

- B1 above (`@fastify/swagger` `utils.js:482-486`, `plugins/openapi.ts:19-31`).
- These points check out against the code:
  - **The `IndexingDisabled` message.** It is `indexing disabled (fixtures-only mode)` (`path-policy.ts:10`) and matches the table.
  - **An allowed root that does not exist.** It gives `IndexingDisabled` through `realPath` (`index-repository.ts:151-153`), as the new scenario expects.
  - **Re-wrapping the lexical failure.** `confineRepository` must re-wrap the **lexical** `ForbiddenPathError` (`index-repository.ts:149`, today raised with `requested`) with `requestedName` as well, not only the real-path one (l. 158). Design U1 ("`requestedName` is the only name `ForbiddenPathError` carries") already implies it, and the third case of the scenario pins it.
  - **The empty JSON body.** `FST_ERR_CTP_EMPTY_JSON_BODY` is already answered `400` `VALIDATION_ERROR` (`error-handler.ts:27`).
  - **The seed and the cache.** `seeds/graph-dump.sql` holds no `cache_entry`, so `cacheEntriesInvalidated 1` in the seed scenario holds.
  - **The salt rule.** It is "trimmed, non-empty" (`adapters/git/src/config.ts:19-21`), the same as `indexingConfigFromEnv`.
  - **The TypeScript extractor.** `TS_COMPILER_EXTRACTOR` is already exported (`analyzers/typescript/src/index.ts:10`).
- **Improvable: task 3.1** says "the two existing ones untouched", but `tests/integration/store/open-store.spec.ts` has **three** `it`s (l. 40, 64, 84). Write "the three existing ones untouched".

## 9. Task size

Clean. Every task fits one agent turn. Task 5.3 is the largest and stays bounded. If B1 adds the `transformObject`, put it in its own sub-step of 5.6 rather than growing 5.3.

## 10. Mandatory steps

Clean overall:
- Step 0 creates or verifies the branch first.
- The mandatory steps are present, in order and labelled: 8 Review tests, 9 Run tests and verify data state (report path and §6 template), 11 Manual (agent executes, restoration in 11.6), 12 E2E (N/A justified), 13 Docs, and 15 Pre-merge Review last, with the archive before the merge.
- Mutating tasks restore state: 3.3 deletes what it commits; 9.6 and 11.6 restore.

Improvable:
- **Task 11.4, rate limit.** The task restarts the API twice before "the ninth request within the window", but it does not say on which instance, nor that every restart sets `RATE_LIMIT_MAX=8`. With a 60 s default window the count is also fragile. Write: "after the last restart (also with `RATE_LIMIT_MAX=8`), send nine requests within 60 s; the ninth answers `429` `RATE_LIMITED`".
- **Tasks 11.2/11.3, model mode.** The expected "`UNKNOWN` `llm-required`" after the reindex assumes evaluation mode, but `.env` may set `LLM_*`, and `scripts/load-env.mjs` would fill it, giving live mode and possibly a `503`. Add to 11.2: "with `LLM_BASE_URL=`, `LLM_MODEL=` and `LLM_API_KEY=` empty for that command (evaluation mode)".
- **Task 3.3 / scenario "Every connection is released after a run".** `pool.end()` waits for checked-out clients, so a leaked client shows up as a test timeout rather than an assertion. Add "and `close()` resolves within 2 s".

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| http-index · Index request validation | A body with a path or a language answers VALIDATION_ERROR without indexing | 5.4 |
| | A malformed project id answers VALIDATION_ERROR without indexing | 5.4 |
| | A request without a body is a full reindex | 5.3 (hook), 5.4 |
| | An invalid request answers VALIDATION_ERROR over the seed | 7.3 |
| http-index · Index accepted response | A reindex answers 202 and invalidates the cache over the seed | 7.1 |
| | An incremental request is accepted as a full reindex | 5.4 |
| | A TypeScript project answers with the ts-compiler analyzer | 5.4 |
| http-index · Index error answers | Indexing disabled answers 403 without touching the store | 5.2, 5.3 |
| | An unknown project answers PROJECT_NOT_FOUND | 5.4 |
| | A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed | 7.2 |
| | An unknown project answers PROJECT_NOT_FOUND over the seed | 7.3 |
| | An unreadable stored repository answers 503 without a path | 5.4 |
| | An invalid graph answers INTERNAL and saves nothing | 5.4 |
| | The index route is rate limited | 5.5 |
| http-index · Index completion log | A reindex logs its counters without paths | 5.5 |
| http-index · Index in the OpenAPI document | The document lists index with its parameter, body and responses | 5.6, **but `requestBody.required` has no implementing task (B1)** |
| repository-indexing · Reindexing an existing project | A reindex saves over the stored project and then invalidates its cache | 2.1, 2.2 |
| | A relative stored root resolves against the workspace root | 2.3 |
| | Reindexing is disabled without an allowed root, before reading the project | 2.3 |
| | An unknown project is not reindexed | 2.3 |
| | A stored root outside the allowed root is rejected before reading | 1.1, 2.3 |
| | An allowed root that does not exist disables reindexing | 2.3 |
| | A reindex keeps the stored project fields and detects no framework | 1.2, 2.3 |
| | A workspace root that is not absolute is rejected before any call | 2.4 |
| | A failed cache invalidation fails the unit of work | 2.3 |
| | An invalid graph writes nothing | 2.3 |
| graph-store · Running work in one transaction on a pooled store | Work that resolves is committed | 3.1, 3.2 |
| | Work that rejects leaves nothing | 3.3 |
| | Work's writes are invisible to another connection before the commit | 3.3 |
| | Every connection is released after a run | 3.3 |
| api-foundation · Configuration from the environment (modified) | Defaults apply… / An invalid variable fails… (unchanged, DIS-76 tests) | 8.2 |
| | Missing indexing variables do not stop the API | 6.3, 6.4 |
| api-foundation · Composition from the environment (modified) | five unchanged DIS-76 scenarios | 8.2 |
| | Both indexing variables compose the indexing dependencies | 6.2, 6.3, 6.4 |
| (design Risks, ADR 20261017) | seed and golden regeneration | 10.1–10.5 |

No row is empty. The OpenAPI row has a task, but the clause it tests has no implementation path (B1). Task 2.4, an orphan in run 1, is now linked.

---

## Corrections to apply

### `openspec/changes/index-endpoint/design.md`

1. **U5 (B1).** Replace the sentence "The OpenAPI operation leaves `requestBody.required` absent or `false` (the schema has no required key)." with:
   > `@fastify/swagger` (9.9.2, `lib/spec/openapi/utils.js` l. 482-486) always writes `requestBody.required: true` for a route with `schema.body`. `registerOpenApi` (`packages/api/src/plugins/openapi.ts`) therefore gains a `transformObject` that sets `requestBody.required = false` on every operation whose `application/json` body schema has no `required` key, and changes nothing else. `/ask`'s body requires `question`, so its document is unchanged and `tests/unit/api/health-docs.spec.ts` stays unedited.
2. **Follow-ups**: add a row with the next free id, `E25 | (run-2 B1) requestBody.required set to false through a generic transformObject in plugins/openapi.ts | A`.
3. **U4 (improvable)**: add "A relative `ALLOWED_REPOS_DIR` resolves against the process working directory, as in the CLI (`confinePath`); `.env.example` asks for an absolute path."

### `openspec/changes/index-endpoint/specs/http-index/spec.md`

No change of behaviour. Optionally, append to "Index in the OpenAPI document": "(`requestBody.required` `false`)" after "not required", so the requirement and the scenario name the same value.

### `openspec/changes/index-endpoint/specs/api-foundation/spec.md` (improvable)

In "Configuration from the environment", after the indexing-variables paragraph, add: "A relative `ALLOWED_REPOS_DIR` is resolved against the process working directory."

### `openspec/changes/index-endpoint/specs/graph-store/spec.md` (improvable)

In "Every connection is released after a run", replace "THEN no session…" with "THEN `close()` resolves within 2 s and no session…".

### `openspec/changes/index-endpoint/proposal.md`

1. **Impact → Code (B1)**: add `packages/api/src/plugins/openapi.ts` (a `transformObject` for non-required bodies).
2. **What Changes → Composition (improvable)**: replace "(Git source tree and history, the analyzer of each language, the transaction runner)" with "(the Git history reader, the analyzer and extractor name of each language, the transaction runner; the existing source tree is reused)".
3. **What Changes → Composition (improvable)**, optionally: add one sentence saying a relative `ALLOWED_REPOS_DIR` resolves against the working directory.

### `openspec/changes/index-endpoint/tasks.md`

1. **Task 5.6 (B1)**: replace it with "RED → GREEN: 'The document lists index with its parameter, body and responses' (`GET /docs/json`, `requestBody.required` `false`); GREEN adds the `transformObject` of design U5 to `packages/api/src/plugins/openapi.ts` (TSDoc); `tests/unit/api/health-docs.spec.ts` and the `/ask` document unchanged (`npx vitest run tests/unit/api`)".
2. **Task 9.4 (B1)**: add `packages/api/src/plugins/openapi.ts` to the `--mutate` list.
3. **Task 3.1**: "the two existing ones untouched" → "the three existing ones untouched".
4. **Task 3.3**: add "and `close()` resolves within 2 s" to "Every connection is released after a run".
5. **Task 11.2**: add "with `LLM_BASE_URL=`, `LLM_MODEL=` and `LLM_API_KEY=` empty for that command (evaluation mode; `.env` only fills unset variables)".
6. **Task 11.4**: replace "the ninth request within the window (429)" with "after the last restart (also with `RATE_LIMIT_MAX=8`), nine requests within 60 s: the ninth answers `429` `RATE_LIMITED`".

### Linear: DIS-9 (comment in Spanish; `[original]` not touched)

> *Texto del agente: segunda auditoría de especificación (spec-auditor) del change `index-endpoint`, sin la autora.*
>
> Veredicto: `CHANGES REQUIRED`, 1 hallazgo bloqueante:
> - **B1:** `@fastify/swagger` 9.9.2 marca siempre `requestBody.required: true` cuando la ruta declara `schema.body` (`lib/spec/openapi/utils.js` l. 482-486). La spec pide «no requerido» y el diseño lo atribuía a que el esquema no tiene claves obligatorias, lo que es falso. Se decide en `design.md` U5 (propuesta: un `transformObject` genérico en `plugins/openapi.ts` que pone `required: false` cuando el cuerpo no tiene claves obligatorias; `/ask` no cambia) y se añade a las tareas 5.6 y 9.4.
>
> Mejoras: redacción de la composición en `proposal.md` (no hay segundo árbol de fuentes, E23), `ALLOWED_REPOS_DIR` relativo, tareas 3.1 (son tres `it` existentes), 3.3 (`close()` en 2 s), 11.2 (forzar modo evaluación) y 11.4 (límite de peticiones tras el último reinicio).
>
> Siguen pendientes para la autora (C): comprobación en PowerShell (E13), revisión de las golden regeneradas (E16) y cierre de DIS-6 (E18).

---

## Resolution of run 2

*Agent's text: correction round 2 of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6), done by the agent as lead engineer without the author. The new decisions are E25 and E26 in `design.md` → Follow-ups, with their A/B/C/D destination, and in a Spanish comment on DIS-9. `openspec validate index-endpoint --strict` passes after the edits.*

### Questions for the author

Run 2 raised none. The destination-C items stay as they were: the PowerShell check (E13), the new review of the regenerated golden entries (E16) and closing DIS-6 (E18).

### Blocking findings

| Finding | Resolution |
|---|---|
| B1 (`requestBody.required` cannot be absent or `false`) | Decided by the agent and fixed, E25 (A). Checked against `node_modules/@fastify/swagger/lib/spec/openapi/utils.js` l. 482-486: the claim holds. The body stays declared by schema, and `registerOpenApi` gains a generic `transformObject` that sets `requestBody.required = false` only on operations whose `application/json` body schema has no `required` key, so `/ask` keeps `required: true` and `tests/unit/api/health-docs.spec.ts` stays unedited. Design U5 replaces the false premise; the `http-index` OpenAPI requirement and its scenario now name `requestBody.required` `false` (no longer "absent or `false`"); proposal What Changes and Impact name `plugins/openapi.ts`; task 5.6 implements the transform; task 9.4 adds the file to `--mutate`. Rejected alternatives: validating in the handler (breaks the schema-validation pattern) and dropping the clause (the document would contradict E19). |

### Improvable findings

| Finding | Resolution |
|---|---|
| Point 5, relative `ALLOWED_REPOS_DIR` | Decided by the agent and fixed, E26 (A): the existing behaviour is kept (resolved against the process working directory, as the CLI does) and stated in `api-foundation` "Configuration from the environment" and design U4; task 13.2 makes the `.env.example` comment ask for an absolute path, and task 11.2 uses an absolute one. Resolving against `workspaceRoot` was rejected: it would make the API and the CLI read the same value differently. |
| Point 6, composition wording in the proposal | Fixed: What Changes → Composition now lists the Git history reader, the analyzer and extractor name of each language and the transaction runner, and says the existing source tree is reused (E23). |
| Point 6, design U5's false premise | Fixed with B1. |
| Point 8, task 3.1 counts two existing `it`s | Fixed: "the three existing ones untouched" (`open-store.spec.ts` l. 40, 64, 84). |
| Point 9, the `transformObject` in its own sub-step | Fixed: it sits in task 5.6, not in 5.3. |
| Point 10, task 11.4 rate limit | Fixed: every restart keeps `RATE_LIMIT_MAX=8` and the empty `LLM_*`; after the last restart, nine requests within 60 s and the ninth answers `429` `RATE_LIMITED`. |
| Point 10, tasks 11.2/11.3 model mode | Fixed: task 11.2 sets `LLM_BASE_URL=`, `LLM_MODEL=` and `LLM_API_KEY=` empty for the command (evaluation mode). |
| Point 10, task 3.3 connection release | Fixed: the `graph-store` scenario "Every connection is released after a run" now says `close()` resolves within 2 s, and task 3.3 repeats it. |

### Linear

The Spanish comment of this round is posted on DIS-9. The `[enhanced]` description is not edited; E25 and E26 live in `design.md` → Follow-ups and in that comment.

---

## Run 3 (2026-10-29)

APPROVED

# Spec audit: `index-endpoint` (DIS-9, parent DIS-6), 2026-10-29, run 3

**Inputs read**
- The change: `proposal.md`, `design.md`, `tasks.md`, the deltas `specs/http-index`, `specs/repository-indexing`, `specs/graph-store` and `specs/api-foundation`, and `reports/2026-10-29-spec-audit.md` (runs 1 and 2 with their resolutions).
- Linear: DIS-9 (description with `[original]`, `[reality-map]` and `[enhanced]`, plus 4 comments) and its parent DIS-6.
- Project: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md` (structure) and `openspec/specs/api-foundation/spec.md` (error log clause).

**Code checked**
- API: `packages/api/src/app.ts`, `plugins/openapi.ts`, `plugins/zod-compiler.ts`, `plugins/error-handler.ts`, `plugins/rate-limit.ts`, `routes/ask.ts` and `schemas/ask.ts`.
- Core: `packages/core/src/index/path-policy.ts` and `packages/core/src/knowledge/errors.ts`.
- Seed: `packages/cli/src/seed/fingerprint.ts`.
- Tests: `tests/unit/api/health-docs.spec.ts` and `tests/unit/api/support.ts`.
- Libraries: `node_modules/@fastify/swagger/lib/spec/openapi/{index,utils}.js` (9.9.2) and `node_modules/zod/v4/core/json-schema-processors.js`.

## Questions for the author

There are no new questions. These items stay pending for the author, all with destination C:
- the PowerShell check (E13);
- the new review of the regenerated golden entries (E16);
- whether DIS-6 can close on the adapted reading of its AC1 and AC2 (E18).

The agent's earlier decisions E15–E26 do not contradict the ticket or the project, so I accept them.

---

## 1. Scope against the ticket

Clean. Every item traces to DIS-9 `[enhanced]` E1–E14 or to the audit decisions E15–E26.

- **Route items:** the route, its schema, its error table and the completion log.
- **Core and adapter:** the core use case and the pooled transaction runner.
- **Configuration and docs:** the optional variables and the docs.
- **Forced by the project:** the seed and golden regeneration, which ADR `20261017-stale-fingerprint-fails-verify` forces.
- **Needed by the route:** the OpenAPI `transformObject` (E25), which E19 makes necessary.

Nothing pulls in DIS-10 (the incremental plan) or DIS-42 (lazy recomputation of `stale` claims).

## 2. Inherited acceptance criteria

Clean.

- **DoD "four codes in an integration test":** four seed scenarios cover `202`, `400`, `403` and `404`.
- **DoD "route in `/docs`":** covered by "The document lists index…".
- **DoD "`cacheHit = false` after a reindex":** covered by the seed `202` scenario.
- **DIS-9 `[enhanced]` AC1–AC5:** all covered. AC5's partial write is covered by the core scenario "A failed cache invalidation fails the unit of work" together with the adapter scenario "Work that rejects leaves nothing". Run 1 rejected a single Postgres test for this, and I accept that.
- **DIS-6 AC2 and AC3:** covered. These include `language: ruby` → `400`, unknown project → `404`, and every `cache_entry` invalidated.
- **DIS-6 AC1 and AC2, `rootPath` and `jobId`:** met in the adapted form (E1/E3/E18). Closing the parent is pending for the author (C).

## 3. Missing scenarios

Clean. Every MUST clause of the four deltas has a scenario. Two clauses of the `graph-store` requirement are explicitly not tested, and design U3 records them with their reason (E21, D): rollback failure and commit failure.

## 4. Ambiguity

Clean. A case-insensitive search for fast, easy, secure, efficient, many, appropriate and robust finds no occurrence in `proposal.md`, `design.md`, the specs or `tasks.md`. The only hits are in the reports.

## 5. Open decisions

Clean. The run 2 blocker (`requestBody.required`) now has an implementation path that I checked against the installed libraries:

- **`transformObject` is supported.** `@fastify/swagger` 9.9.2 calls `transformObject({ openapiObject })` after building the document (`lib/spec/openapi/index.js` l. 77-79), so the U5 transform can set `requestBody.required = false`.
- **The body schema publishes no `required` key.** Zod 4 writes `required` only when an object has a required key (`json-schema-processors.js` l. 405-406). So `z.strictObject({ incremental: z.boolean().optional() })` publishes no `required` key, as the scenario expects, and keeps `additionalProperties: false`.
- **Existing documents are unaffected.** `/ask` and the test route `POST /api/test-only` (`tests/unit/api/support.ts` l. 15) have a required key, so the transform leaves them unchanged. `tests/unit/api/health-docs.spec.ts` asserts with `toContain`, not on the exact list of paths (l. 47-50), so the new path does not break it.
- **The `uuid` format comes from the existing pattern.** `askParamsSchema` already publishes `format: 'uuid'` (`schemas/ask.ts` l. 30), and `projectIdParamsSchema` reuses it.

## 6. Contradictions inside the change

**Improvable: the proposal promises more about logs than the design and the main spec deliver.**

- **What the proposal says.** `proposal.md` → Impact → Security and privacy: "error bodies and the log carry no path". Task 9.5 checks "no path in error bodies or logs".
- **What the design does.** Design U5 sends `INVALID_GRAPH` and every unmapped failure to the global handler, which "logs it at `error`".
- **What the main spec requires.** `openspec/specs/api-foundation/spec.md` (l. 292) requires: "An error answered with `500` SHALL be logged at level `error` with the original error".
- **Why the two conflict.**
  - `InvalidGraph` carries `element: message` for each violation (`knowledge/errors.ts` l. 48, 198-201).
  - An unexpected file-system or driver failure carries its own text, which can include the absolute root path.

  So a `500` log line can hold a path. The `http-index` requirement "Index completion log" is correct, because it covers only the success line. The broad wording of the proposal and of task 9.5 is what conflicts with the main spec. The fix is to narrow that wording, not to change behaviour (see Corrections).

The rest is consistent:
- the signatures in U1–U4;
- the error table, which matches the `readme.md` error list in U8 and the OpenAPI responses `400`/`403`/`404`/`429`/`500`/`503`;
- the `202` deviation (U9);
- the E15 guarantee;
- the scenario counts in task 8.2: 16 in `http-index` (12 unit + 4 integration), 10 in `repository-indexing`, 4 in `graph-store` and 2 in `api-foundation`. I counted each against the deltas, and each matches.

## 7. Contradictions with the project

Clean, apart from the log wording under point 6.

- **Recorded deviations.** The `202` deviation from `docs/backend-standards.md` §6 is recorded (U9, E17), and so is the timing in the route against §3 (U6, E20).
- **Fingerprint inputs.** The inputs named in task 10 match `packages/cli/src/seed/fingerprint.ts` l. 30-51. The change touches `packages/core/src/index`, `packages/adapters/store-postgres/src` and `packages/analyzers/php/src`. It does not touch `packages/core/src/knowledge`, and `packages/api` is not an input.
- **Branch name.** The lowercase branch name is recorded (E24).

## 8. Contrast with the real code

Clean. These points check out against the code:

- **Domain errors reach the route table.** `IndexingDisabled` and `ForbiddenPathError` are `DomainError`s with stable codes (`path-policy.ts` l. 5-25). The route's `config.domainErrors` is consulted before the global table (`error-handler.ts` l. 100), so the U5 table works as written.
- **The empty JSON body is already handled.** It is answered `400` `VALIDATION_ERROR` (`error-handler.ts` l. 27, `FST_ERR_CTP_EMPTY_JSON_BODY`).
- **Rejected requests count toward the rate limit.** The limit counts in `onRequest`, before validation, and exempts only `/health` and `/docs` (`rate-limit.ts` l. 25-27, 50-60). This matches the unit scenario "The index route is rate limited".
- **The response schemas follow `/ask`.** The `/ask` route declares one error schema per status (`routes/ask.ts` l. 134), the pattern U5 follows for `202` and the error codes.
- **The `preValidation` hook runs in time.** Fastify runs `preValidation` before schema validation, so the U5 hook sees an absent body before the strict schema does.

## 9. Task size

Clean. Every task fits one agent turn. Task 5.3 is the largest and stays bounded, and the OpenAPI transform lives in 5.6.

## 10. Mandatory steps

Clean overall:
- Step 0 creates or verifies the branch first.
- The mandatory steps are present, in order and labelled:
  - 8 Review and Update Existing Tests;
  - 9 Run Tests and Verify Data State, with the report path and the §6 template;
  - 11 Manual Interface Testing, executed by the agent, with restoration in 11.6;
  - 12 End-to-End Testing, not applicable and justified;
  - 13 Update Technical Documentation;
  - 15 Pre-merge Review last, with the archive before the merge.
- Mutating tasks restore state: 3.3 deletes what it commits, and 9.6 and 11.6 restore and re-check the 0.4 indicators.

**Improvable: tasks 11.3 and 11.4 use up the rate limit before the `404` check.**

- **The count.** The instance started in 11.2 has `RATE_LIMIT_MAX=8` and the default 60 s window. 11.3 sends five counted requests: `/ask`, three `/index` and `/ask` (`/docs/json` is exempt). 11.4 then sends four more on the same instance, all counted because the limit counts before validation (`rate-limit.ts` l. 44-45): the `rootPath` body, `not-a-uuid`, the empty JSON body and the random UUID.
- **The effect.** If those nine requests fall inside one window, the random UUID check answers `429` instead of `404`. The expected status then depends on timing.

The fix is to restart the API with the 11.2 command before the error paths of 11.4. The final rate limit check already runs on a fresh instance.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| http-index · Index request validation | A body with a path or a language answers VALIDATION_ERROR without indexing | 5.4 |
| | A malformed project id answers VALIDATION_ERROR without indexing | 5.4 |
| | A request without a body is a full reindex | 5.3 (hook), 5.4 |
| | An invalid request answers VALIDATION_ERROR over the seed | 7.3 |
| http-index · Index accepted response | A reindex answers 202 and invalidates the cache over the seed | 7.1 |
| | An incremental request is accepted as a full reindex | 5.4 |
| | A TypeScript project answers with the ts-compiler analyzer | 5.4 |
| http-index · Index error answers | Indexing disabled answers 403 without touching the store | 5.2, 5.3 |
| | An unknown project answers PROJECT_NOT_FOUND | 5.4 |
| | A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed | 7.2 |
| | An unknown project answers PROJECT_NOT_FOUND over the seed | 7.3 |
| | An unreadable stored repository answers 503 without a path | 5.4 |
| | An invalid graph answers INTERNAL and saves nothing | 5.4 |
| | The index route is rate limited | 5.5 |
| http-index · Index completion log | A reindex logs its counters without paths | 5.5 |
| http-index · Index in the OpenAPI document | The document lists index with its parameter, body and responses | 5.6 (incl. `transformObject`, E25) |
| repository-indexing · Reindexing an existing project | A reindex saves over the stored project and then invalidates its cache | 2.1, 2.2 |
| | A relative stored root resolves against the workspace root | 2.3 |
| | Reindexing is disabled without an allowed root, before reading the project | 2.3 |
| | An unknown project is not reindexed | 2.3 |
| | A stored root outside the allowed root is rejected before reading | 1.1, 2.3 |
| | An allowed root that does not exist disables reindexing | 2.3 |
| | A reindex keeps the stored project fields and detects no framework | 1.2, 2.3 |
| | A workspace root that is not absolute is rejected before any call | 2.4 |
| | A failed cache invalidation fails the unit of work | 2.3 |
| | An invalid graph writes nothing | 2.3 |
| graph-store · Running work in one transaction on a pooled store | Work that resolves is committed | 3.1, 3.2 |
| | Work that rejects leaves nothing | 3.3 |
| | Work's writes are invisible to another connection before the commit | 3.3 |
| | Every connection is released after a run | 3.3 |
| api-foundation · Configuration from the environment (modified) | Defaults apply… / An invalid variable fails… (unchanged, DIS-76 tests) | 8.2 |
| | Missing indexing variables do not stop the API | 6.3, 6.4 |
| api-foundation · Composition from the environment (modified) | five unchanged DIS-76 scenarios | 8.2 |
| | Both indexing variables compose the indexing dependencies | 6.2, 6.3, 6.4 |
| (design Risks, ADR 20261017) | seed and golden regeneration | 10.1–10.5 |

No row is empty, and every task maps to a requirement or to a recorded project obligation.

---

## Corrections to apply

All corrections are improvable. None blocks the apply.

### `openspec/changes/index-endpoint/proposal.md`

Impact → Security and privacy. Replace "error bodies and the log carry no path" with:
> error bodies and the `reindex completed` log line carry no path; a failure answered `500` is logged at `error` with its original error, as `api-foundation` requires for every route.

### `openspec/changes/index-endpoint/tasks.md`

1. **Task 9.5.** Replace "(no path in error bodies or logs; …" with:
   > (no path in error bodies nor in the `reindex completed` line; a `500` logs its original error as `api-foundation` requires; …
2. **Task 11.4.** At its start, add:
   > Restart the API with the exact command of 11.2 before these error paths, so the rate-limit counter starts at zero (11.3 already used five of the eight requests, and rejected requests count).

### Linear: DIS-9 (comment in Spanish; `[original]` not touched)

> *Texto del agente: tercera auditoría de especificación (spec-auditor) del change `index-endpoint`, sin la autora.*
>
> Veredicto: `APPROVED`, 0 hallazgos bloqueantes. He comprobado E25 contra las librerías instaladas. `@fastify/swagger` 9.9.2 aplica `transformObject` después de construir el documento, y Zod 4 no escribe la clave `required` cuando ningún campo es obligatorio. El cuerpo de `/index` saldrá como no obligatorio, y el documento de `/ask` no cambia.
>
> Mejoras, sin bloqueo:
> - La propuesta y la tarea 9.5 dicen que ningún log lleva rutas. Pero `api-foundation` obliga a registrar el error original de un `500` (por ejemplo `InvalidGraph`). Hay que acotar el texto a la línea `reindex completed`.
> - En la tarea 11.4 hay que reiniciar la API antes de probar los errores. Si no, la novena petición del mismo minuto (el UUID aleatorio) puede responder `429` en lugar de `404`.
>
> Siguen pendientes para la autora (C): la comprobación en PowerShell (E13), la revisión de las respuestas golden regeneradas (E16) y el cierre de DIS-6 (E18).
