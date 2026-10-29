## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-9-index-endpoint` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/index-endpoint/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code change (never force-push a published branch). Every commit scope is `DIS-9`
- [ ] 0.2 Confirm DIS-9 is In Progress in Linear, with a short Spanish comment naming the change `index-endpoint` and the branch
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only, never `git add -A` nor `git commit -a`)
- [ ] 0.4 Baseline: `npx vitest run tests/unit/index tests/unit/api tests/integration/index tests/integration/api tests/integration/store` green, totals recorded for the step 9 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM cache_entry`, `SELECT count(*) FROM query_log` and acme-shop's `indexed_at`/`indexed_commit`; then `node scripts/dev-processes.mjs stop`

## 1. Core: extract the shared pipeline (refactor under the existing safety net; design U1)

- [ ] 1.1 Move the private `confine` of `packages/core/src/index/index-repository.ts` to `packages/core/src/index/confine-repository.ts` as `confineRepository(sourceTree, requested, allowedRoot)` (same behaviour, TSDoc)
- [ ] 1.2 Extract read → hygiene → redact → (framework detection when asked) → analyse with the path-set check → history → validate into `packages/core/src/index/build-snapshot.ts` (`buildSnapshot`, TSDoc), passing the progress callback through so `indexRepository` reports the same phases in the same order
- [ ] 1.3 `indexRepository` now composes `confineRepository` → `buildSnapshot` → `createProject` → `saveGraph`; `tests/unit/index/index-repository.spec.ts` and `tests/integration/index/acme-shop.spec.ts` pass **unedited** (`npx vitest run tests/unit/index tests/integration/index`); `npm run typecheck` green

## 2. Core: reindex use case (TDD; spec repository-indexing "Reindexing an existing project"; design U2)

- [ ] 2.1 RED: create `tests/unit/index/reindex-project.spec.ts` (fakes in the style of `index-repository.spec.ts`: source tree with `realPath`, git, a PHP and a TypeScript recording analyzer, a recording store, an `inTransaction` that records how its work settled) with "A reindex saves over the stored project and then invalidates its cache". See it fail (no export)
- [ ] 2.2 GREEN: `ReindexReport` in `packages/core/src/index/index-report.ts`; `reindexProject`, `ReindexDependencies`, `ReindexInput` in `packages/core/src/index/reindex-project.ts`; exports from `packages/core/src/index.ts`; TSDoc on every export
- [ ] 2.3 RED → GREEN, one at a time: "A relative stored root resolves against the workspace root", "Reindexing is disabled without an allowed root, before reading the project", "An unknown project is not reindexed", "A stored root outside the allowed root is rejected before reading", "A failed cache invalidation fails the unit of work", "An invalid graph writes nothing" (a scenario that passes at once is recorded as a characterisation test in the step 9 report)
- [ ] 2.4 RED → GREEN: a non-absolute `workspaceRoot` throws `RangeError` before any call (design U2; no spec scenario, an implementation guard like `explain`'s)

## 3. Adapter: transaction runner on the pooled store (TDD; spec graph-store "Running work in one transaction on a pooled store"; design U3)

- [ ] 3.1 RED: add to the existing `tests/integration/store/open-store.spec.ts` (existing test changed: new `it`s only, the two existing ones untouched) "Work that resolves is committed". See it fail
- [ ] 3.2 GREEN: `OpenedStore.transaction` in `packages/adapters/store-postgres/src/open-store.ts` (connect, `BEGIN`, store bound to the client, `COMMIT`/`ROLLBACK`, rollback error swallowed so the work's error wins, fixed message on a failed commit, `release` in `finally`); TSDoc
- [ ] 3.3 RED → GREEN, one at a time: "Work that rejects leaves nothing", "Every connection is released after a run"; each scenario deletes what it committed (data restored, checked by a count before and after in the test)

## 4. Analyzer export

- [ ] 4.1 Export `PHP_EXTRACTOR` from `packages/analyzers/php/src/index.ts` (as `TS_COMPILER_EXTRACTOR` is from the TypeScript package); `npm run typecheck` green

## 5. API: schemas and route (TDD; spec http-index; design U5, U6)

- [ ] 5.1 Refactor (no behaviour change): move the project id pattern to `packages/api/src/schemas/common.ts` as `projectIdParamsSchema`; `askParamsSchema` becomes that schema; `npx vitest run tests/unit/api` green unedited
- [ ] 5.2 RED: create `tests/unit/api/reindex.spec.ts` (`buildApp` with `defaultDeps()` of `tests/unit/api/support.ts`, unchanged, plus an `indexing` double whose ports count their calls, and the `reindex` seam) with "Indexing disabled answers 403 without touching the store". See it fail (`404 NOT_FOUND`: no route)
- [ ] 5.3 GREEN: `AppDeps.indexing?` (`IndexingDeps`) and `AppOptions.reindex?` in `packages/api/src/app.ts`; `packages/api/src/schemas/reindex.ts` (`reindexBodySchema`, `reindexResponseSchema`, inferred types); `packages/api/src/routes/reindex.ts` (`registerReindexRoute`, `REINDEX_DOMAIN_ERRORS`), registered in `buildApp` after `registerAskRoute`; exports in `packages/api/src/index.ts`; TSDoc on every export
- [ ] 5.4 RED → GREEN, one at a time: "A body with a path or a language answers VALIDATION_ERROR without indexing", "A malformed project id answers VALIDATION_ERROR without indexing", "An unknown project answers PROJECT_NOT_FOUND", "An unreadable stored repository answers 503 without a path", "An invalid graph answers INTERNAL and saves nothing", "An incremental request is accepted as a full reindex"
- [ ] 5.5 RED → GREEN: "The index route is rate limited" (counting `reindex` seam), "A reindex logs its counters without paths" (`AppOptions.logger` with a test stream, as `tests/unit/api/errors.spec.ts`; real `reindexProject` over doubles holding an AWS access key in one file)
- [ ] 5.6 RED → GREEN: "The document lists index with its parameter, body and responses" (`GET /docs/json`)

## 6. API: composition (TDD; spec api-foundation "Configuration from the environment", "Composition from the environment"; design U4)

- [ ] 6.1 Add the workspace dependencies `@codemind/analyzer-php` and `@codemind/analyzer-typescript` to `packages/api/package.json`; `npm install` (lockfile workspace links only); then `npm audit --audit-level=high` — a new high or critical finding stops the ticket; record the output in the step 9 report; `npm run lint:architecture` green
- [ ] 6.2 Existing test changed: `tests/unit/api/composition.spec.ts` → the helper `recordingOpenStore` returns an `OpenedStore` with a `transaction` member (`(work) => work(store)`), required by the new type; no assertion of its existing `it`s changes
- [ ] 6.3 RED → GREEN in `tests/unit/api/composition.spec.ts` (new `it`s): "Missing indexing variables do not stop the API", "Both indexing variables compose the indexing dependencies"
- [ ] 6.4 GREEN: `indexingConfigFromEnv` and the `indexing` dependencies in `packages/api/src/composition.ts` (`createGitSourceTree`, `createSimpleGitHistory({ authorHashSalt })`, the analyzer and its extractor name by language, `inTransaction` = the opened store's `transaction`); `ApiConfig` unchanged; TSDoc

## 7. Integration over the seed (TDD; spec http-index scenarios over Postgres; design U7)

- [ ] 7.1 RED: create `tests/integration/api/reindex.spec.ts` (template `tests/integration/api/ask.spec.ts`: acme-shop copy under a temporary `T` with `buildOne` in `beforeAll`, `describeWithDatabase`, `useTransactionPerTest`, seed loaded in the test's transaction with `root_path` set to the copy; `indexing` with the real Git adapters, the PHP analyzer, a test salt, `allowedRoot` = `T`, `inTransaction: (work) => work(createPostgresStore({ transaction: db() }))`) with "A reindex answers 202 and invalidates the cache over the seed" (cache entry saved first; the live scripted model of `ask.spec.ts` for the follow-up `/ask`). See it fail if the route is not yet complete; otherwise record it as a characterisation test
- [ ] 7.2 RED → GREEN: "A stored root outside the allowed root answers FORBIDDEN_PATH without a path over the seed" (`allowedRoot` = another temporary directory)

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [ ] 8.1 Existing tests changed by this change, without weakening any assertion: `tests/unit/api/composition.spec.ts` (helper `recordingOpenStore` gains `transaction`, task 6.2; two new `it`s, task 6.3) and `tests/integration/store/open-store.spec.ts` (three new `it`s, task 3). No other existing test changes; in particular `tests/unit/index/index-repository.spec.ts`, `tests/integration/index/acme-shop.spec.ts`, `tests/unit/api/support.ts`, `tests/unit/api/app.spec.ts`, `tests/unit/api/ask.spec.ts`, `tests/unit/api/health-docs.spec.ts` and `tests/integration/api/ask.spec.ts` stay unedited. Grep `grep -rn "OpenedStore\|buildApp\|AppDeps\|indexRepository" tests/` and fix every type error `npm run typecheck` reports in the code, not in the tests, unless the spec requires it (then name the test here)
- [ ] 8.2 Every `#### Scenario:` of the four deltas maps to a test with exactly the same name (grep each title in `tests/`): the 12 of `http-index` (10 in `tests/unit/api/reindex.spec.ts`, 2 in `tests/integration/api/reindex.spec.ts`), the 7 of `repository-indexing`, the 3 of `graph-store`, and the 2 new ones of `api-foundation` ("Missing indexing variables do not stop the API", "Both indexing variables compose the indexing dependencies"); the unchanged scenarios of the two modified `api-foundation` requirements still map to their DIS-76 tests

## 9. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 9.1 Capture the pre-test baseline: the 0.4 indicators
- [ ] 9.2 Targeted: `npx vitest run tests/unit/index tests/unit/api tests/integration/index tests/integration/api tests/integration/store`
- [ ] 9.3 Broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 9.4 `npm run test:mutation -- --mutate "packages/api/src/routes/reindex.ts,packages/api/src/schemas/reindex.ts,packages/core/src/index/reindex-project.ts,packages/core/src/index/build-snapshot.ts,packages/core/src/index/confine-repository.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [ ] 9.5 `/privacy-ethics-check` over the diff (no path in error bodies or logs; secrets redacted before the store; the author hash salt never logged; the endpoint accepts no path); record the result
- [ ] 9.6 Verify the post-test state: the 0.4 counts unchanged (the integration specs roll back; the open-store scenarios delete what they commit); no `.stryker-tmp/` left. Restore and document if not
- [ ] 9.7 `node scripts/dev-processes.mjs stop`; report `openspec/changes/index-endpoint/reports/YYYY-MM-DD-9-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6) with the baseline, the characterisation tests, the existing tests changed (8.1), the `npm audit` output (6.1), the Stryker score and survivors (9.4) and the privacy check (9.5)
- [ ] 9.8 Mark complete only after the tests pass and the report exists

## 10. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 10.1 Preconditions in Git Bash: Docker Postgres up, `npm run db:migrate`, `npm run db:seed` if acme-shop is not stored (record it); record the 0.4 indicators; copy `fixtures/acme-shop` (without `.git`) to a scratchpad directory, build its history with `fixtures/build-history.mjs`, and point acme-shop's `root_path` at the copy with one `UPDATE` through `docker compose exec` (record the previous value to restore it)
- [ ] 10.2 Start the API with `DATABASE_URL`, `ALLOWED_REPOS_DIR` = the scratchpad directory and a test `AUTHOR_HASH_SALT` exported for that command only (never edit `.env`), `RATE_LIMIT_MAX=8`: `npm -w packages/api run dev`; get acme-shop's id with `npm run cli -- projects`
- [ ] 10.3 Success path with `curl -i`: `POST /api/projects/<id>/index` `{}` (202, record the body); the same with `{"incremental":true}`; confirm acme-shop's `cache_entry` count is 0 afterwards; `POST /api/projects/<id>/ask` with `¿Cómo se calcula el precio final de un pedido?` answers without `cacheHit: true` (evaluation mode: `UNKNOWN` `llm-required`); `GET /docs/json` lists `/api/projects/{projectId}/index`
- [ ] 10.4 Error paths: `{"rootPath":"/tmp/x"}` and `/api/projects/not-a-uuid/index` (400, no value echoed); a random UUID (404); restart with `ALLOWED_REPOS_DIR` pointing at another empty scratch directory (403 `FORBIDDEN_PATH`, no path in the body); restart without `AUTHOR_HASH_SALT` (403 `INDEXING_DISABLED`); the ninth request within the window (429)
- [ ] 10.5 Stop the server and `node scripts/dev-processes.mjs stop`; no `codemind-api` session left in `pg_stat_activity`
- [ ] 10.6 Restore the state: `npm run db:seed` to bring acme-shop back to the seed's snapshot and `root_path` (the reindex replaced its graph and dropped its cache entries; E9), or the recorded previous values if the seed was not used; remove the scratchpad copy; re-check the 0.4 indicators (the `query_log` rows created by 10.3 deleted by `created_at` after the 10.1 baseline)
- [ ] 10.7 Report `openspec/changes/index-endpoint/reports/YYYY-MM-DD-10-manual-interface-testing.md` with every command, status and body (mask the OS user name in paths) and the restoration of 10.6
- [ ] 10.8 PowerShell check for the author (design Follow-ups E13, destination C): not run by the agent; the report names it as pending for the author

## 11. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 11.1 Not applicable beyond step 10: no browser UI changes (`packages/web` is untouched and does not call `/index`); record it in the step 9 report

## 12. Update Technical Documentation (MANDATORY)

- [ ] 12.1 `readme.md` §4: `/index` returns as the third product endpoint (body `{ incremental? }`, `202` body, errors `400`/`403`/`404`/`429`/`503`, error code table rows `INDEXING_DISABLED`, `FORBIDDEN_PATH`, `NOT_A_GIT_REPOSITORY`, `EMPTY_REPOSITORY`); rewrite the DIS-101 note ("the API never receives a path: it re-indexes a project the CLI created, from its stored root"); check the Entrega 1 recommendations table (around lines 26 and 34) stays true
- [ ] 12.2 `docs/project-context.md`: the API routes (three product routes), `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` also read by the API (optional), the transaction runner of the pooled store, and the Testing list (`tests/unit/index/reindex-project.spec.ts`, `tests/unit/api/reindex.spec.ts`, `tests/integration/api/reindex.spec.ts`); `.env.example`: the comments of the two variables say the API reads them too
- [ ] 12.3 ADR not warranted (local, reversible decision; design U8): record it in the step 9 report. `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-9 prompts with its Índice entry in the same edit

## 13. Pull request preparation

- [ ] 13.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text (E1–E14, P1–P3), the conflict with DIS-101 and how E1 resolves it, the existing tests changed (8.1), the `npm audit` result, the Stryker score, and the pending PowerShell check (E13, destination C)

## 14. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 14.1 Open the PR against `final-project-CRN`; DIS-9 to In Review with a Spanish comment linking it
- [ ] 14.2 CI green, including the mutation job: wait in the foreground with `gh pr checks <n> --watch --interval 60` (timeout 600000), repeated until no check is pending; link the run in an addendum to the step 9 report
- [ ] 14.3 `/show-spec-working` (may reuse the step 10 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 14.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 14.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 14.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates and add an addendum to the affected report; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 14.7 `/opsx:archive`, commit it to the same PR; `node scripts/dev-processes.mjs stop`; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
