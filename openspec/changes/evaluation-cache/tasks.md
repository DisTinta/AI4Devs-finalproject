## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-21 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `evaluation-cache` and the branch `feature/DIS-21-evaluation-cache`
- [x] 0.2 Feature branch `feature/DIS-21-evaluation-cache` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/evaluation-cache/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 11 report; in the local database record `SELECT count(*) FROM project`, `SELECT count(*) FROM claim`, `SELECT count(*) FROM query_log`, `SELECT count(*) FROM cache_entry` and `SELECT max(created_at) FROM query_log`

## 1. Core: question normalization (TDD, design C1) — `answer-cache` → "Question normalization"

- [x] 1.1 RED: create `tests/unit/cache/normalize.spec.ts` with "Case, accent and punctuation variants share one key". See it fail (module missing)
- [x] 1.2 GREEN: `packages/core/src/cache/normalize.ts` (`normalizeQuestion`, TSDoc), `packages/core/src/cache/index.ts`, export from `packages/core/src/index.ts`
- [x] 1.3 RED → GREEN, one at a time: "Identifiers, symbols and compatibility characters become plain words", "A question of only punctuation has no key, and a key is stable" (characterisation tests if they pass at once, recorded in the step 11 report)

## 2. Core: cacheability, stored response and hit (TDD, design C2) — `answer-cache` → "Cacheable answers", "Stored response", "Answer of a cache hit"

- [x] 2.1 Factory: `tests/support/cached-answer.ts` with `cachedAnswer(overrides?)` and `cachedNoEvidence()`, each returning a fresh object per call (`backend-standards.md` §7), builds a valid stored answered response (one `FACT` statement citing `app/Services/PriceCalculator.php` 16–44 of the acme-shop subset, one evidence entry, no prior claims, a full `usage` with `cacheHit: false`) and the `no-evidence` stored `UNKNOWN`
- [x] 2.2 RED: create `tests/unit/cache/response-cache.spec.ts` with "Only stored current answers and no-evidence unknowns are cacheable". See it fail
- [x] 2.3 GREEN: `packages/core/src/cache/response-cache.ts` with `isCacheable`; add `STATEMENT_TYPES` to `packages/core/src/explain/typing-rules.ts` and derive `StatementType` from it (`npm run typecheck` and `npx vitest run tests/unit` stay green)
- [x] 2.4 RED → GREEN: "A stored response keeps the answer without its events", "A no-evidence unknown is stored without events" (`toStoredResponse`, `storedResponseSchema`, `parseStoredResponse`)
- [x] 2.5 RED → GREEN: "Invalid stored responses are rejected without leaking" (strict objects, the evidence-id reference check, answer evidence `excerpt` a string, `cacheHit` literal `false`; a negative `savingsPct` and a `null` prior-claim excerpt accepted, as the scenario of 2.4 checks)
- [x] 2.6 RED → GREEN: "A hit carries the stored answer and the usage of this call", "A cached unknown is answered without usage" (`answerFromCache`, `savingsPct` from `explain/usage.ts`; widen `AnswerUsage.cacheHit` to `boolean`); exports in `cache/index.ts`; `npm run lint:architecture` green (no cycle between `cache/` and `explain/`)

## 3. Core: store port and in-memory double (TDD, design C3, C5) — `graph-store` → "Answer cache entries"

- [x] 3.1 RED: in `tests/unit/store/in-memory-store.spec.ts`, "The in-memory double keeps, checks and fails cache entries". See it fail
- [x] 3.2 GREEN (port): `packages/core/src/knowledge/cache-entry.ts` (`CacheEntry`, `assertValidCacheKey`, `assertValidCacheResponse`, `assertValidEntryId`, `assertValidHitInstant`), `CacheWriteFailed` in `packages/core/src/knowledge/errors.ts`, the four methods on `StorePort` with TSDoc (checks, errors, transaction behaviour); exports in `packages/core/src/index.ts`
- [x] 3.3 GREEN (double): `findCacheEntry`, `saveCacheEntry`, `touchCacheEntry`, `invalidateCache` in `tests/support/in-memory-store.ts` with `calls.*`, `cacheEntries()`, `seedCacheEntry()`, `failCacheCall` and a JSON round trip of each stored response; 3.1 green
- [x] 3.4 Every other `StorePort` double in `tests/` that `npm run typecheck` reports gets the four methods without changing what its tests assert: a double given to `explain` delegates to the in-memory double (or answers a miss: `findCacheEntry` resolves `undefined`, `saveCacheEntry` resolves); only doubles never given to `explain` may throw. `doubles()` of `tests/support/explain-doubles.ts` forwards `failCacheCall` and records `findCacheEntry`, `touchCacheEntry` and `saveCacheEntry` in `order` under their own names (design C5)

## 4. Adapter: Postgres cache entries (TDD, design C4) — `graph-store` → "Answer cache entries"

- [x] 4.1 RED: create `tests/integration/store/cache-entry.spec.ts` (harness, `describeWithDatabase`, `useTransactionPerTest`, `createPostgresStore({ transaction: db() })`) with "A saved entry is found by its project and key". See it fail
- [x] 4.2 GREEN: the four methods and their SQL in `packages/adapters/store-postgres/src/postgres-store.ts` (`runProjectQuery` for the lookup; `atomically` + `toCacheWriteError` for the writes; the advisory lock, delete and insert of the save; the CTEs of touch and invalidate)
- [x] 4.3a RED → GREEN, one at a time: "Saving a key again replaces its entry", "The most recent of duplicated entries is found", "Touching an entry records the hit", "Invalidating a project deletes only its entries"
- [x] 4.3b RED → GREEN, one at a time: "Invalid cache arguments are rejected before querying" (no statement observed with a query-counting client), "Cache calls on an unknown project fail without writing", "A failed cache write does not leak" (temporary trigger inside the test's transaction)
- [x] 4.4 RED → GREEN: "Concurrent saves of one key leave one entry" and "Cache writes on the store's own connections commit" (pool, unique project name, project deleted in `finally`, as `graph-write-pool.spec.ts`)
- [x] 4.5 RED → GREEN: create `tests/unit/store/postgres-cache-write-errors.spec.ts` (template `postgres-query-log-write-errors.spec.ts`) with "A failed rollback of a cache write is a write failure" (including the failing `SAVEPOINT` case) and "A store that cannot give a connection fails cache writes with its own error"

## 5. Core: explain request and events (TDD, design C6) — `explain` → "Explain request", "Explain events and logging"

- [x] 5.1 RED → GREEN: "A non-boolean cache flag is rejected before the store" (`useCache` in `explainRequestSchema`, `EXPLAIN_REQUEST_FIELDS` gains `useCache`)
- [x] 5.2 GREEN (no test of its own, covered by 6.x): `ANSWER_NOT_CACHED_CODES` and `AnswerNotCachedEvent` in `packages/core/src/explain/explain-event.ts`, in the `ExplainEvent` union, with TSDoc; exports

## 6. Core: answer cache in explain (TDD, design C6) — `explain` → "Answer cache", "Precedence and UNKNOWN answers", "Answer usage", "Query log"

- [x] 6.1 RED: create `tests/unit/explain/explain-cache.spec.ts` (over `doubles()` of `tests/support/explain-doubles.ts` and the in-memory store with the acme-shop subset) with "A cached question is answered from the cache in both modes". See it fail
- [x] 6.2 GREEN: the lookup and hit path in `answerQuestion` (`Outcome` gains the hit), `answerFromCache` and the hit row in `explain()` (`QueryLogParts.cacheHit`)
- [x] 6.3 RED → GREEN, one at a time: "Evaluation mode without an entry answers llm-required and saves nothing", "A question without anchor is not looked up in the cache", "A failing cache lookup or hit record stops before the model", "The cache is scoped by project"
- [x] 6.4 RED → GREEN: "A live answer is saved once and a repeat is served from the cache" (the save after the second clock read and before the row)
- [x] 6.5a RED → GREEN, one at a time: "Turning the cache off calls the model and replaces the entry", "An invalid entry is a miss and a live answer replaces it", "A no-evidence unknown is cached and served without the model"
- [x] 6.5b RED → GREEN, one at a time: "Answers that are not cacheable are not saved", "The cache key ignores the budget and the hops"
- [x] 6.6 RED → GREEN, one at a time: "A failed cache write still answers and says so without leaking" (`saveCache` → `answer_not_cached` before `query_not_logged`), "Other cache write errors propagate after the row" (the row written as on the rejection path, never replacing the save's error), "A hit whose row is not written still answers and says so"
- [x] 6.7 RED → GREEN: "A cached question answers with the daily budget spent" (`withDailyBudget` over the double wrapped with a `sumCostSince` stub through the `store` hook)
- [x] 6.8 RED → GREEN: in `tests/integration/explain/explain.spec.ts`, "A hit over the database counts in its entry and its row"
- [x] 6.9 RED → GREEN: update the existing tests whose contract this change modifies, "An answer leaves one query log row the daily spend sees" (`tests/integration/explain/explain.spec.ts`) and "A valid but irrelevant citation is cited and never a fact" (`tests/unit/explain/explain-verification.spec.ts`), so their repeat call sends `useCache: false`, as the modified scenarios say; and, in the same way, the repeat call of `tests/unit/explain/explain.spec.ts` "builds the pack with the hops and budget of the request" and of `tests/unit/explain/explain-sanitization.spec.ts` "Untrusted text reaches the prompt wrapped and unchanged" (design C8); they fail without it once 6.4 is green; record all four in the step 11 report
- [x] 6.10 Update the TSDoc of `explain`, `answerQuestion`, `aggregateUsage`, `queryLogEntry`, `AnswerUsage.cacheHit` and the `UnknownExplain.events` comment (no more "until DIS-21"); `npx vitest run tests/unit/explain tests/integration/explain` green

## 7. API: forward useCache and cache over the seed (TDD, design C7) — `http-ask` → "Ask request validation", "Ask from the answer cache"

- [x] 7.1 RED: update `tests/unit/api/ask.spec.ts` "Optional fields are forwarded as the use case expects" (D6) and "Requests to one API share verification verdicts" (repeats with `"useCache": false`) to the modified scenarios (existing tests whose contract this change modifies; record them in the step 11 report). See the first fail
- [x] 7.2 GREEN: forward `useCache` in `packages/api/src/routes/ask.ts`; update the `useCache` description in `packages/api/src/schemas/ask.ts`
- [x] 7.3 RED → GREEN, one at a time, in `tests/integration/api/ask.spec.ts`: "A cached question answers from the cache over the seed", "A spent daily budget still answers a cached question" (fixed clock on a day no other suite writes, the `query_log` row inserted inside the test's transaction), "The refund demo question answers no-anchor without the model over the seed" (D14; a characterisation test if it passes at once)

## 8. CLI: cached answer in evaluation mode (TDD, design C7) — `cli-ask` → "Ask from the answer cache"

- [ ] 8.1 RED → GREEN: in `tests/integration/cli/ask-command.spec.ts`, "Evaluation mode prints a cached answer" (a characterisation test if it passes once explain is done: the CLI code does not change; record it in the step 11 report)

## 9. Backend: Review and Update Existing Tests (MANDATORY)

- [ ] 9.1 Identify the tests affected by the change: `grep -rn "cacheHit\|useCache\|EXPLAIN_REQUEST_FIELDS\|StorePort" tests/`, plus every type error `npm run typecheck` reports
- [ ] 9.2 Update only the tests whose contract this change modified (the two modified scenarios of 6.9 and the two of 7.1, the two repeated-question unit tests of 6.9 (design C8), and the eight exact `order`/`calls` assertions of design C8, extended with the cache calls, never filtered; a `StorePort` double gaining the four methods in 3.4 is a type fix, not an assertion change), without weakening any assertion; list every edited existing test with the reason in the step 11 report
- [ ] 9.3 Confirm each `#### Scenario:` of the five delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`); the unchanged scenarios of the modified `explain` and `http-ask` requirements still map to their tests

## 10. Refactor

- [ ] 10.1 With the suite green, refactor `packages/core/src/cache/**`, `packages/core/src/explain/explain.ts` and the adapter's cache methods for naming and duplication only, folding the three write-error mappers of `postgres-store.ts` into one factory (design C4) (no behaviour change, no test edits; `tests/unit/store` and `tests/integration/store` stay green); `npx vitest run tests/unit/cache tests/unit/explain tests/integration/store tests/integration/explain` stays green

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [ ] 11.1 Capture the pre-test baseline: the 0.4 indicators
- [ ] 11.2 Run the targeted tests: `npx vitest run tests/unit/cache tests/unit/explain tests/unit/store tests/unit/api tests/integration/store tests/integration/explain tests/integration/api tests/integration/cli`
- [ ] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 11.4 Run `npm run test:mutation` (score ≥ 80, the CI break threshold); for each meaningful survivor in `packages/core/src/cache/**` and the cache path of `explain.ts`, a RED → GREEN test
- [ ] 11.5 Run `/privacy-ethics-check` over the diff (design C9: the key only in `cache_entry`, events and errors with codes only, parameterised and project-scoped SQL, no call to the model on a hit); record the result in the report
- [ ] 11.6 Verify the post-test state: same `project`, `claim`, `query_log` and `cache_entry` counts as in 11.1 (the integration specs roll back or clean up in `finally`); no `.stryker-tmp/` left. Restore and document if not
- [ ] 11.7 Create `openspec/changes/evaluation-cache/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (1.3, 8.1), the edited existing tests (9.2), the Stryker score and survivors (11.4) and the privacy check (11.5)
- [ ] 11.8 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Preconditions: local database up and migrated (`docker compose up -d`, `npm run db:migrate`); record the 0.4 indicators; if acme-shop is not stored, `npm run db:seed` (record it, to restore the previous project set in 12.7); get acme-shop's id with `npm run cli -- projects`
- [ ] 12.2 Seed one cache entry for acme-shop through the store: a short `tsx` script in the scratchpad (not committed) that calls `saveCacheEntry(acmeId, normalizeQuestion('¿Cómo se calcula el precio final de un pedido?'), <the fixture of 2.1>)` on `createPostgresStore({ pool })` (no live model needed); record the entry id
- [ ] 12.3 CLI in evaluation mode (no `LLM_*`): `npm run cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` prints the cached answer (exit 0); `npm run cli -- ask acme-shop "¿Qué hace CouponValidator?"` prints `UNKNOWN (llm-required)` and the message; check `hit_count` 1 and `last_hit_at` set
- [ ] 12.4 API in evaluation mode (`npm -w packages/api run dev`, `DATABASE_URL` exported): `curl -i` `POST /api/projects/<id>/ask` with the cached question (200 answered, `usage.cacheHit: true`, `costUsd: 0`), with `"useCache": false` (200 `UNKNOWN` `llm-required`), with an uncached question (200 `llm-required` exact body), with `"useCache": "yes"` (400 `VALIDATION_ERROR`), to `/api/projects/<random UUID>/ask` (404 `PROJECT_NOT_FOUND`); `GET /docs/json` shows the new `useCache` description
- [ ] 12.5 Budget: insert one `query_log` row of acme-shop dated now with `cost_usd` 1 and restart the API live against an unreachable model (`LLM_BASE_URL=http://127.0.0.1:1/v1`) with `DAILY_BUDGET_USD=0.000001`: the cached question answers `200` from the cache; with `"useCache": false` it answers `429` `BUDGET_EXHAUSTED` with `cacheOnly: true`; stop the server and delete that row at once (checked with a count)
- [ ] 12.6 Invalidation: from the scratchpad script, `invalidateCache(acmeId)` resolves to 1 and acme-shop has no `cache_entry`; the cached question in evaluation mode answers `llm-required` again
- [ ] 12.7 Restore the state: delete every `query_log` row created after the 12.1 `max(created_at)`, confirm `cache_entry` is back to the 12.1 count, delete the projects `db:seed` added in 12.1 if it ran; re-check the 0.4 indicators equal the 12.1 values; no `codemind-api` session left in `pg_stat_activity`
- [ ] 12.8 Document every command, status and body in `openspec/changes/evaluation-cache/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths), with the restoration of 12.7

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 13.1 The change has no browser UI (`packages/web` is untouched and does not call `/ask` yet; CM-HU-14 will): record "not applicable beyond step 12" in the step 11 report
- [ ] 13.2 Record in the step 11 report that the CI evidence (new spec files ran and passed, the mutation job ≥ 80) is collected in 16.3, once the PR exists

## 14. Update Technical Documentation (MANDATORY)

- [ ] 14.1 `readme.md` §2.4 (evaluation-mode table: exact hit by normalized text, similarity only with CM-HU-19), §2.5 (6) (cached questions answer with the budget spent), §3 `CACHE_ENTRY` (exact key, one entry per project and key kept by the store, `question_embedding` unused until CM-HU-19), §4 (`useCache`, `usage.cacheHit`), and the line of §2.4/§4 that says the cache arrives with DIS-21 — design C10
- [ ] 14.2 `docs/project-context.md`: the explain pipeline note (`[DIS-21 cache slot]` → the cache step; the `cacheHit: false` line; the line "until DIS-21 adds the cache-only degradation", design C10), the `ask` CLI and API notes ("Until DIS-21…" → evaluation mode answers from the cache when an entry exists; golden entries arrive with DIS-26), the in-memory double's cache API and the new spec files in Testing (`cache-entry.spec.ts` migrates the shared DB through the harness)
- [ ] 14.3 Decide whether D3 (no unique key, one entry kept by the store) needs an ADR (`/adr-new`): it is reversible by a later migration without changing the port, so record "no ADR" with that reason in the step 11 report unless the review says otherwise
- [ ] 14.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 15. Pull request preparation

- [ ] 15.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the Why marked as the agent's decision (DIS-21 `[enhanced]` D1–D14 and the post-audit amendments), the Stryker score and "no new dependency, no migration"

## 16. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 16.1 Open the pull request against `feature/entrega-2-CRN` (authorised by ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, which relaxes `base-standards.md` §88/§90/§99 for this run; it lives on `feature/DIS-101-readme-entrega-2`, and if it is not yet in `feature/entrega-2-CRN` when the PR opens, cite it by branch and name in the PR body; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 16.2 Set DIS-21 to In Review in Linear with a comment in Spanish linking the PR and the change
- [ ] 16.3 Confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 11 report
- [ ] 16.4 Run `/show-spec-working` (may reuse the step 12 evidence); report `openspec/changes/evaluation-cache/reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 16.5 Run `/verify-against-spec`; report `openspec/changes/evaluation-cache/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 16.6 Run `/adversarial-review`; report `openspec/changes/evaluation-cache/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 16.7 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 16.8 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 16.9 `/opsx:archive`, and commit the archive to the same pull request; the agent merges, only after the archive commit and with CI green (ADR `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` lets the agent merge in this run; cited by branch and name if not yet in the base branch)
