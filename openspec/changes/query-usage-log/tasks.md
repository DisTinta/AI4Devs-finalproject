## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-74 to In Progress in Linear, with a short comment in Spanish (change `query-usage-log`, branch `feature/DIS-74-query-usage-log`)
- [x] 0.2 Feature branch `feature/DIS-74-query-usage-log` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (082a6fb, DIS-72 merged) during `/opsx:propose` with no upstream; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/query-usage-log/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`); `.claude/sdd-harness.env` carries a local change that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 12 report; in the local database record `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence`, `FROM query_log`, and the applied migrations (`SELECT name FROM pgmigrations ORDER BY id`)

## 1. Schema: migration `0004_query-log-verification` (TDD, design U1) — `graph-schema` → "Roll back the latest migration", "History, claim, usage and cache column contract"

- [x] 1.1 RED: in `tests/integration/store/migrations.spec.ts` and `schema-snapshot.ts`, add the five `verify_*` columns (`verify_input_tokens`, `verify_output_tokens`, `verify_cost_usd`, `verify_calls`, `verify_latency_ms`) to the `query_log` contract, `0004_query-log-verification` to `ALL_MIGRATIONS`, the null `verify_*` assertion to "Defaults apply on a minimal claim, query log and cache entry", and rewrite "Roll back only the latest migration" for `0004` (the five `verify_*` columns gone, every other column, the indexes, trigger and function still there, `0001`–`0003` applied). See them fail
- [x] 1.2 GREEN: `packages/adapters/store-postgres/migrations/0004_query-log-verification.up.sql` / `.down.sql` (design U1, with a header comment as in `0003`); `npm run db:migrate`, `npm run db:rollback`, `npm run db:migrate` on the local database, each exit 0
- [x] 1.3 Re-run unchanged the other scenarios of both modified requirements (`npx vitest run tests/integration/store/migrations.spec.ts`), including "Roll back every migration leaves an empty schema" and "Roll back both migrations leaves an empty schema". Apply note (author, 2026-10-16): "Roll back the L1 graph migration" and "Roll back both migrations leaves an empty schema" reached their precondition with `migrate()` plus a fixed number of rollbacks, one short with `0004`; their setup now reaches it with `migrateUpTo`, assertions unchanged

## 2. Core: query log record and error (TDD, design U2) — `graph-store` → "Query log write"

- [x] 2.1 RED: create `tests/unit/knowledge/query-log.spec.ts` with the schema cases of "Invalid query log entries are rejected before writing" (each field rule; message holds no value) and the check that `QUERY_CAPABILITIES` equals the `query_capability` enum of `0002_history-claims.up.sql`; in `tests/unit/knowledge/errors.spec.ts`, the `QueryLogWriteFailed` case (code `QUERY_LOG_WRITE_FAILED`, name, no `cause`), as for `ClaimWriteFailed`. See them fail
- [x] 2.2 GREEN: `packages/core/src/knowledge/query-log.ts` (`QueryLogEntry`, `QUERY_CAPABILITIES`, schema, `assertValidQueryLogEntry`), `QueryLogWriteFailed` in `knowledge/errors.ts`; export from `knowledge/index.ts`; TSDoc on every export and member (`docs:coverage`); `grep -nE "from '\.\./(explain|context)/" packages/core/src/knowledge/query-log.ts` prints nothing

## 3. Port and Postgres adapter: `saveQueryLog` (TDD, design U3) — `graph-store` → "Query log write"

- [x] 3.1 `StorePort.saveQueryLog(entry): Promise<void>` with TSDoc at the level of `saveClaims`
- [x] 3.2 RED: create `tests/integration/store/query-log-write.spec.ts` (template `claims-write.spec.ts`) with "A query log entry is written as one row". See it fail
- [x] 3.3 GREEN: `INSERT_QUERY_LOG` in `queries.ts` and `saveQueryLog` in `postgres-store.ts` through the claim write's wrapper (design U3)
- [x] 3.4 RED → GREEN, one at a time: "Invalid query log entries are rejected before writing", "A query log entry of an unknown project writes nothing", "A failed query log write does not leak" (database rejection forced as in `claims-write.spec.ts`), "Saving a query log entry on the store's own connections commits", "A store that cannot give a connection fails the query log write with its own error" (each a characterisation test if it passes at once, recorded in the step 12 report)
- [x] 3.5 RED → GREEN: "A failed rollback of the query log write is a write failure" in a new `tests/unit/store/postgres-query-log-write-errors.spec.ts` (template `postgres-claim-write-errors.spec.ts`: a fake client whose insert and rollback fail, on the store's own connections and on a caller-owned transaction); plus the unit case that a failing `SAVEPOINT` propagates unchanged (design U3)

## 4. In-memory store double (TDD, design U4) — `graph-store` → "Query log write"

- [x] 4.1 RED: in `tests/unit/store/in-memory-store.spec.ts`, test "The in-memory double checks, keeps and fails query log entries". See it fail
- [x] 4.2 GREEN: `saveQueryLog`, the `queryLog` rows, `calls.saveQueryLog` and the `failQueryLogWrite` option in `tests/support/in-memory-store.ts`

## 5. Core: verify call limit (TDD, design U11) — `evidence-verification` → "Semantic citation check"

- [x] 5.1 RED: in `tests/unit/verify/semantic.spec.ts`, test "The verifier is called at most the call limit". See it fail
- [x] 5.2 GREEN: `MAX_VERIFY_CALLS_PER_ANSWER` in `explain/limits.ts` (TSDoc with the D2 reason, provisional per PH-27), `'call-limit'` appended to `ENTAILMENT_UNVERIFIED_REASONS`, the sent-call count in `verifyEntailment` after the cache and `stopped` checks
- [x] 5.3 RED → GREEN: "A cached pair does not count toward the call limit" and "A failed verifier keeps its reason past the call limit" (each a characterisation test if it passes at once)
- [x] 5.4 RED → GREEN (design U15): "The verification latency is the wall time of the check" — `VerificationUsage.latencyMs`, the optional `now` of `verifyEntailment`, `ZERO_USAGE` with `latencyMs: 0`; then update, because the spec changed, the two modified scenarios with an exact usage, "Evaluation mode verifies nothing" (`latencyMs: 0`, clock not read) and "The usage counts only the verifier's resolved calls" (fixed clock, `latencyMs: 0`)
- [x] 5.4b Update, because `VerificationUsage` gained `latencyMs` (not to make the suite pass): `tests/unit/verify/semantic.spec.ts` "An unavailable verifier degrades the remaining pairs" (the exact usage at :214, with a fixed clock) and `tests/unit/verify/verify-answer.spec.ts` (:63 `ZERO_USAGE` with `latencyMs: 0`; :86 and :214 with a fixed `now` in the collaborators; :229 (every citation broken, no clock read) only through `ZERO_USAGE`); `VerifyAnswerDependencies.now` and `onSemanticStart` are optional (design U15); list them in the step 12 report
- [x] 5.5 Re-run unchanged the other scenarios of "Semantic citation check", except those edited in 5.4 and 5.4b (`npx vitest run tests/unit/verify`)

## 6. Core: usage aggregation and meter (TDD, design U5, U6) — `explain` → "Answer usage"

- [x] 6.1 RED: create `tests/unit/explain/usage.spec.ts` with "Savings follow the baseline, are zero without one and may be negative" (`-0` normalised to `0`) and unit tests for `latencyMs` (at least 1), `aggregateUsage` (the AC 1 numbers) and `queryLogEntry`. See them fail
- [x] 6.2 GREEN: `packages/core/src/explain/usage.ts`; `AnswerUsage` (D5) and `GenerationUsage` in `explain-answer.ts`; exports in `explain/index.ts`; TSDoc
- [x] 6.3 RED → GREEN: create `tests/unit/explain/usage-meter.spec.ts` (buckets by purpose, cost by the table for the reported model, a failed call does not count, `resolvedCalls` and the count of resolved `verify` calls (design U15), mode and `embed` pass through) and `packages/core/src/explain/usage-meter.ts`

## 7. Core: `explain` wiring (TDD, design U7–U10) — `explain` → "Explain request", "Answer usage", "Query log", "Answer with typed statements", "Persistence failure", "Explain events and logging"

- [x] 7.1 Doubles first (no behaviour of core): `scripted-llm.ts` gains `answerModel`; `explain-doubles.ts` gains `now` (a list of instants read in turn, the last one repeated once the list is exhausted, `[NOW]` by default), `failQueryLogWrite` and `costTable` passthrough, and pushes `saveQueryLog` into `order`
- [x] 7.2 RED → GREEN: "A question holding U+0000 is rejected before the store" (`explain-request.ts`, design U10)
- [x] 7.3 RED: in `tests/unit/explain/explain-verification.spec.ts`, "An answer carries its total, generation and verification usage". See it fail
- [x] 7.4a GREEN: `explain.ts` per design U7, answered path only: start instant (also the provenance instant), meter, `answerQuestion`, end instant, `usage` by `aggregateUsage`, the row from that usage, `costTable` to `verifyAnswer` → `verifyEntailment`, and explain's `now` to `verifyAnswer` → `verifyEntailment` (design U15), so the scripted clock drives the check's two reads
- [x] 7.4b RED → GREEN: rows on the `UNKNOWN` returns — "An unknown answer after the model call leaves a row with its usage", "An unknown answer without a model call leaves a zero row", "The latency is at least one millisecond"
- [x] 7.4c RED → GREEN: the rejection row and the absorbed write failures — the meter's count of resolved `verify` calls, `onSemanticStart` in `verifyAnswer` (called just before the semantic check) and the rejection row's `verifyLatencyMs` state (`0` / `null` / the check's, design U15); then "A failure after the model calls leaves a row and keeps its error" (second clock read in the `catch`), then `QueryNotLoggedEvent` and `QUERY_NOT_LOGGED_CODES` in `explain-event.ts` with "A failed query log write still answers and says so"; `UnknownExplain` TSDoc (`events` may end with `query_not_logged`)
- [x] 7.5a RED → GREEN (rows): "With the shipped cost table every cost is zero", "No row when explain fails before a model call resolves" (each a characterisation test if it passes at once, recorded in the step 12 report)
- [x] 7.5b RED → GREEN (failures): "A verifier failure leaves a row with the calls that resolved", "A row of an unknown project is not logged", "Other query log write errors propagate", and the added AND of "A verification read failure propagates without writing" and of "A verifier failure other than unavailable or budget propagates without writing" (each a characterisation test if it passes at once)
- [x] 7.5c RED → GREEN (call limit): "Statements past the verify call limit stay inferences" (characterisation test if it passes at once after step 5)
- [x] 7.5d RED → GREEN (verifier latency and calls, design U15), one at a time: "A row without cited statements records no verification", "A row of an answer verified from the cache counts no verifier call", "A row at the verify call limit counts the limit", "Evaluation mode records no verification", "An unavailable verifier midway counts only the calls made"; and the added AND of "A verification read failure propagates without writing" (0 verification calls, verification latency 0) (each a characterisation test if it passes at once)
- [x] 7.5e RED → GREEN (adversarial review F1, author decision 2026-10-16): "An out-of-range query log entry still answers and says so" (`invalid-entry` appended to `QUERY_NOT_LOGGED_CODES`; `saveRow` maps `InvalidStoreQuery`), and "Other query log write errors propagate" rewritten for an error that is none of the three
- [x] 7.5f Tests strengthened after `/verify-against-spec` and `/adversarial-review` (F3 and the weak or partial tests of the verify report): the meter's verification equals the check's usage on an answered path (design Risks); no row for the `SourceUnavailable` of the pack, a failing prior-claims read and the `LlmUnavailable` of the `answer` call; priced rejection rows; the exact `UNKNOWN` answer; the unchanged fields of a not-logged answer; a non-constant clock for the cache row; E21 is an anchor span; an unpaired surrogate stored as U+FFFD; `saveQueryLog: 0` in "An empty, blank or missing question is rejected before the store"
- [x] 7.6 A unit test asserting that, on an answered path, the row's `verify_*` values equal `usage.verification`'s tokens, cost, calls and latency (design U5, U15)
- [x] 7.7 Rewrite the JSDoc of `explain` (usage, the row on every return and after a resolved call, `query_not_logged`, explain reads its clock twice and in live mode the semantic check reads it twice more between them, `costTable`); the TSDoc of `ExplainDependencies.now` (it now also times the latency and the semantic check)

## 8. Integration: the row and the daily spend (TDD) — `explain` → "Query log"

- [x] 8.1 RED → GREEN: in `tests/integration/explain/explain.spec.ts`, "An answer leaves one query log row the daily spend sees" (the row, `sumCostSince` on the harness transaction, and `withDailyBudget` over the same store failing the next explain with `BudgetExhausted` and no new row)

## 9. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 9.1 Identify the tests affected by the change: `grep -rn "usage\b\|usage:\|verification: {\|ENTAILMENT_UNVERIFIED_REASONS\|saveClaims\b\|StorePort\|now: () =>" tests/`, plus every `StorePort` implementer `npm run typecheck` reports
- [x] 9.2 Update, because the spec changed (not to make the suite pass), and without weakening any other assertion, one file per sub-task, each followed by its own `npx vitest run <file>`; list every edited existing test with the reason in the step 12 report:
  - [x] 9.2a `tests/unit/explain/explain.spec.ts` and `explain-verification.spec.ts`: the modified scenarios "Citations that support their statement are entailed and facts" (`usage.verification` with `latencyMs: 0`, and `usage.generation`), "A cached pair is not verified again by a second answer" and "An unsaved answer carries its verification, usage and unverified events" (`usage.verification` with `latencyMs: 0`), and every other exact `usage` or exact `events` assertion now affected by the full usage
  - [x] 9.2b `tests/integration/explain/explain.spec.ts`: exact `usage` assertions; rows written in the harness transaction need no cleanup
  - [x] 9.2c `tests/unit/cli/ask-command.spec.ts`: the helper `answered()` gains the D5 `usage` (the type requires it; `ask`'s output is unchanged)
  - [x] 9.2d `tests/integration/cli/ask-command.spec.ts`: for each scenario on the command's own pool that reaches an `explain` return, delete the `query_log` rows it commits (by id, before/after) or bind it to the harness transaction; record which in the report
  - [x] 9.2e Any other hit of 9.1 (other `StorePort` doubles gain `saveQueryLog`; tests listing `ENTAILMENT_UNVERIFIED_REASONS`)
  - [x] 9.2f The two scenarios "A verification read failure propagates without writing" and "A verifier failure other than unavailable or budget propagates without writing" keep their titles (an `openspec validate` rule: a MODIFIED requirement keeps its scenario names); their tests keep their names; each gains an AND stating that no claim is written and one query log row is
- [x] 9.3 Re-run unchanged the existing tests of the other scenarios of the modified requirements of `explain` ("Explain request", "Precedence and UNKNOWN answers", "Answer with typed statements", "Persistence failure", "Explain events and logging"): `npx vitest run tests/unit/explain tests/integration/explain`
- [x] 9.4 Confirm that each `#### Scenario:` of the four delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 10. Core: refactor

- [x] 10.1 With the suite green after step 9, refactor `explain.ts`, `usage.ts`, `usage-meter.ts`, `semantic.ts`, `knowledge/query-log.ts` and the adapter's write wrapper for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit tests/integration/store tests/integration/explain` stays green

## 11. Seed fingerprint

- [x] 11.1 `migrations/*.up.sql` and `packages/core/src/knowledge` are seed fingerprint inputs: check `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing, run `npm run seed:build`, confirm the seed's rows are unchanged (only the fingerprint lines differ in `git diff`) and that the seed tests pass (`npx vitest run tests/unit/cli/seed-build.spec.ts tests/unit/cli/seed-load.spec.ts tests/integration/cli/seed-build.spec.ts`)

## 12. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 12.1 Capture the pre-test baseline: the 0.4 indicators; integration tests run in rolled-back transactions
- [x] 12.2 Run the targeted tests: `npx vitest run tests/unit/explain tests/unit/verify tests/unit/knowledge tests/unit/store tests/unit/cli/ask-command.spec.ts tests/integration/store tests/integration/explain tests/integration/cli/ask-command.spec.ts`
- [x] 12.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 12.4 Run `npm run test:mutation -- --mutate "packages/core/src/explain/usage.ts,packages/core/src/explain/usage-meter.ts,packages/core/src/knowledge/query-log.ts,packages/core/src/explain/explain.ts,packages/core/src/verify/semantic.ts"` (score ≥ 80 each, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 12.5 Run `/privacy-ethics-check` over the diff (D3: the question is stored verbatim in the local `query_log`; never logged, never in an event or error; `QueryLogWriteFailed` without database text); record the result in the report
- [x] 12.6 Verify the post-test state: same `project`/`claim`/`evidence`/`query_log` counts as 12.1, migrations `0001`–`0004` applied; no `.stryker-tmp/` left. Restore and document if not
- [x] 12.7 Create `openspec/changes/query-usage-log/reports/YYYY-MM-DD-12-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the characterisation tests (3.4, 5.3, 7.5), the edited existing tests (9.2), the Stryker scores and survivors (12.4) and the privacy check (12.5)
- [x] 12.8 Mark complete only after the tests pass and the report exists

## 13. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 13.1 Preconditions: local database migrated (`0004` applied) with acme-shop loaded (`npx tsc --build` first); serve the local Ollama CPU-only with `OLLAMA_CONTEXT_LENGTH=16384` (`docs/project-context.md`); ask the author which models to use for `LLM_MODEL` and `LLM_MODEL_VERIFY`; record the 0.4 counts and the ids of the existing `query_log` rows
- [x] 13.2 Live run: `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`; check exit `0`, that the printed output has the same shape as before (no usage printed), and that exactly one new `query_log` row exists with capability `explain`, the question, `input_tokens` > 0, `output_tokens` > 0, `baseline_tokens` > 0, `cost_usd` 0, `latency_ms` > 0, `cache_hit` false and `verify_*` filled (`verify_input_tokens` > 0, `verify_calls` > 0 and `verify_latency_ms` > 0 when a pair was verified, `verify_calls` ≤ `MAX_VERIFY_CALLS_PER_ANSWER`; `verify_latency_ms` ≤ `latency_ms` is an observation that holds with the system's monotonic wall clock, not a spec rule); record in the report how much of `latency_ms` the verification took. If Ollama cannot run, use a local OpenAI-compatible stub written outside the repository (session scratchpad), removed in 13.5; record which one was used
- [x] 13.3 Other paths: without `LLM_*` → `UNKNOWN (llm-required)` and one new row with every counter 0 and `baseline_tokens` `NULL`; with `DAILY_BUDGET_USD=0.01` and a hand-inserted `query_log` row of today with `cost_usd` 0.02 → exit with `BUDGET_EXHAUSTED` and no new row besides the inserted one; `npm run cli -- ask no-such-project "¿Cómo se calcula el precio final de un pedido?"` → exit 1, `PROJECT_NOT_FOUND`, no new row
- [x] 13.4 Document every command, exit code, output and the `SELECT`s of the new rows in `openspec/changes/query-usage-log/reports/YYYY-MM-DD-13-manual-interface-testing.md` (mask the OS user name in paths); show `answer.usage` with a scratchpad script over the same database, since `ask` does not print it
- [x] 13.5 Restore: delete every `query_log`, `claim` and `evidence` row the runs created or inserted (by id from a before/after diff) and confirm the 0.4 counts; `git status` shows no stray file

## 14. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 14.1 The change has no browser UI and changes no interface output: step 13 drives the CLI end to end against the database; record "not applicable beyond step 13" in the step 12 report
- [x] 14.2 Record in the step 12 report that the CI evidence (new spec files ran and passed, `db:migrate` → `db:rollback` → `db:migrate` with `0004`, mutation job ≥ 80) is collected in 17.3, once the PR exists

## 15. Update Technical Documentation (MANDATORY)

- [x] 15.1 `readme.md`: §3.1 ERD `QUERY_LOG` and §3.2 `QUERY_LOG` (the five `verify_*` columns, `verify_calls` and `verify_latency_ms` measuring the verifier per query as the Entrega 1 review asked; a row per `explain` call that returns, `UNKNOWN` included, or fails after a model call; the question stored verbatim); the `DAILY_BUDGET_USD` row (no longer "el gasto leído es 0"; the overshoot of one `ask` in flight, bounded by `MAX_VERIFY_CALLS_PER_ANSWER`); the §4 `usage` example in the D5 shape; and that `db:seed` / `make up` deletes the sample projects' `query_log` rows by cascade, which resets that day's recorded spend for them
- [x] 15.2 `docs/project-context.md`: four migrations (`0004_query-log-verification`); the budget gotcha (the ceiling now sees `explain`'s spend, verification included); `explain` gotchas (the row on every return and after a resolved call, `query_not_logged`, explain reads its clock twice and in live mode the semantic check reads it twice more between them, the provenance instant, `verify_calls` counting only resolved verifier calls (cache hits never; a failed call's time is in `verify_latency_ms`), `costTable`, the meter outside `withDailyBudget`, `MAX_VERIFY_CALLS_PER_ANSWER` and `call-limit`); the in-memory double's `queryLog`; in the budget gotcha, that re-seeding (`db:seed`, `make up`) deletes the sample projects' `query_log` rows by cascade and so resets that day's spend for them
- [x] 15.3 No new ADR (design U14)
- [x] 15.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 16. Pull request preparation

- [x] 16.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-74 `[enhanced]` D1–D3, the author's rulings of 2026-10-16 on D9, D10, the provenance instant and the minimum latency from the spec audit) and the Stryker scores

## 17. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 17.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 17.2 Set DIS-74 to In Review in Linear with a comment in Spanish linking the PR and the change
- [x] 17.3 First confirm in the PR's CI run that the new spec files ran and passed, the migration round trip passed and the mutation job is ≥ 80, and link the run in an addendum to the step 12 report; then run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/query-usage-log/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`); `/show-spec-working` may reuse the step 13 evidence and must show a `query_log` row from a real `ask` over acme-shop with `cost_usd` 0 and `verify_*` filled
- [x] 17.4 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 17.5 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 17.6 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
