## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-18 to In Progress in Linear right away, with a short comment in Spanish (change name `llm-evaluation-budget` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-17 (`packages/adapters/llm/src/openai-compatible-llm.ts` exists there). If not, stop and ask the author which base to use
- [x] 0.3 Create feature branch `feature/DIS-18-llm-evaluation-budget` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions; `BRANCH_PREFIX=feature/`), carrying the untracked `openspec/changes/llm-evaluation-budget/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: run `npx vitest run` once, green, and record the totals for the step 11 report; record `git status --porcelain seeds packages/web fixtures` (must be empty), `sha1sum seeds/graph-dump.sql packages/web/src/data/sample-projects.ts`, and the `analyzer-fingerprint` / `contract-fingerprint` header lines of `seeds/graph-dump.sql`

## 1. Core: errors and cost table (TDD, design D2, D4) — requirement "Cost of a call from the cost table"

- [x] 1.1 Create `tests/unit/llm/cost-table.spec.ts`. RED: test "The cost of a priced model is computed and rounded" (injected table). See it fail (module missing)
- [x] 1.2 GREEN: `packages/core/src/llm/cost-table.ts` with `ModelPrice`, `CostTable`, `COST_TABLE` (frozen; `llama3.2`, `mistral`, `qwen2.5-coder`, `nomic-embed-text` at 0; comment with the rule for paid entries: official pricing URL + date checked), `costUsd` and `hasPrice` (`Object.hasOwn`); export from `packages/core/src/llm/index.ts`. JSDoc on every export
- [x] 1.3 RED → GREEN: test "A model without a price costs nothing and has no price" (injected table; `otro`, `llama3.2:3b`; extra case not a scenario: `toString` / `__proto__` have no price)
- [x] 1.4 RED → GREEN: test "The shipped table holds only the Ollama examples at zero"
- [x] 1.5 `packages/core/src/llm/errors.ts`: add `'evaluation-mode'` to `LlmUnavailableReason`; add `BudgetExhausted` (`BUDGET_EXHAUSTED`, `spentUsd`, `dailyBudgetUsd`, `resetsAt`; message with numbers and ISO time only). Back it with cases in `tests/unit/llm/llm-unavailable.spec.ts` (new `describe` for `BudgetExhausted`: code, fields, `DomainError`, no `cause`) — not scenarios, they give Stryker something to kill

## 2. Port and store: daily cost sum (TDD, design D6, D9) — requirements "Daily cost sum", "Validation of read arguments"

- [x] 2.1 Add `sumCostSince(since: Date): Promise<number>` to `packages/core/src/ports/StorePort.ts` with JSDoc (global sum, `NULL` ignored, `0` without rows, `@throws InvalidStoreQuery` naming `since`); `npm run typecheck` shows the store adapter as the only missing implementation
- [x] 2.2 Create `tests/integration/store/query-cost.spec.ts` (harness of `tests/integration/store/support.ts`, `withRollback`; projects created through the store, `query_log` rows inserted with explicit `created_at`). RED: test "The cost since an instant is summed across projects"
- [x] 2.3 GREEN: `SUM_COST_SINCE` in `packages/adapters/store-postgres/src/queries.ts` and `sumCostSince` in `postgres-store.ts` through `runQuery` (`Number(total)`)
- [x] 2.4 RED → GREEN: test "With no matching row the cost is zero" (clear `query_log` inside the test transaction first, like the empty-listing test). Extra case (not a scenario) in `query-cost.spec.ts`: a store built with `{ pool }` (pattern of `tests/integration/store/graph-write-pool.spec.ts`, `pool.end()` in `finally`) reads `sumCostSince` and gets a `number` (`typeof … === 'number'`), backing "own connections and caller-owned transaction" of the requirement "Daily cost sum"; it writes nothing, so nothing to clean up
- [x] 2.5 RED → GREEN: test "An invalid instant for the cost sum is rejected before querying", in `tests/integration/store/graph-read.spec.ts` inside `Requirement: Validation of read arguments`, reusing its statement counter: add `'since'` to `StoreQueryArgument` (`packages/core/src/knowledge/errors.ts`) and `assertValidCostSince` to `packages/core/src/knowledge/read-arguments.ts`, called first in `sumCostSince`

## 3. Core: daily budget (TDD, design D5) — requirement "Daily spend ceiling"

- [x] 3.1 Create `tests/unit/llm/budget.spec.ts` (fake `sumCostSince` recording `since`; recording inner `LlmPort`; fixed clock). RED: test "A reached ceiling blocks completions and embeddings"
- [x] 3.2 GREEN: `packages/core/src/llm/budget.ts` with `withDailyBudget`, `startOfUtcDay`, `startOfNextUtcDay`; JSDoc of `withDailyBudget` states that `createLlm` does not apply it and gives the composition `cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined ? withDailyBudget(createLlm(cfg), { store, dailyBudgetUsd: cfg.dailyBudgetUsd }) : createLlm(cfg)`; export from `packages/core/src/llm/index.ts`
- [x] 3.3 RED → GREEN: test "Below the ceiling the request reaches the model" (extra cases not scenarios: the clock read per call, `since` at a day boundary `2026-10-09T00:00:00Z` and `23:59:59.999Z`, a failure of the inner model passes through unchanged)
- [x] 3.4 RED → GREEN: test "The ceiling survives a restart" in `tests/integration/store/query-cost.spec.ts` (two store + `withDailyBudget` instances over the harness transaction; rows of today summing `1.5`; ceiling `1`; inner model records no call)

## 4. Adapter: evaluation model and selector (TDD, design D1, D3) — requirements "Evaluation mode never calls the model", "One entry point builds the model for the configured mode"

- [x] 4.1 Create `tests/unit/llm/evaluation-llm.spec.ts`. RED: test "Without URL and key no request is sent" (`vi.spyOn(globalThis, 'fetch')`, restored after each test; both environments; `complete` answer/verify, `embed(['a'])`, `embed([])`)
- [x] 4.2 GREEN: `packages/adapters/llm/src/evaluation-llm.ts` (`createEvaluationLlm`) and `packages/adapters/llm/src/create-llm.ts` (`createLlm`, JSDoc: no budget, see `withDailyBudget`); export both from `packages/adapters/llm/src/index.ts`
- [x] 4.3 RED → GREEN: test "A live configuration does not type-check against the evaluation model" (`// @ts-expect-error`; confirm RED by temporarily typing the parameter as `LlmConfig` and seeing `npm run typecheck` fail on the unused directive, then restore)
- [x] 4.4 RED → GREEN: test "The entry point builds a live model for a live configuration" (recording fake `fetch`, pattern of `tests/unit/llm/openai-compatible-llm.spec.ts`)

## 5. Adapter: configuration (TDD, design D7) — requirement "LLM configuration is classified and validated when read" (MODIFIED)

- [x] 5.1 In `tests/unit/llm/llm-config.spec.ts`, RED: test "The daily budget is read in live mode only"
- [x] 5.2 GREEN: `LiveLlmConfig.dailyBudgetUsd?`, `'DAILY_BUDGET_USD'` in `LlmConfigVariable`, `readDailyBudget` in `config.ts` after the live checks
- [x] 5.3 RED → GREEN: test "A malformed daily budget fails naming the variable"
- [x] 5.4 RED → GREEN: test "With a ceiling every configured model needs a price" (`LlmModelVariable`, optional `modelVariable` on `LlmConfigError` absent when it does not apply, message of design D7; `hasPrice`/`COST_TABLE` imported from `@codemind/core`)
- [x] 5.5 RED → GREEN: test "Without a ceiling a model needs no price"
- [x] 5.6 The six existing configuration scenarios stay green and unchanged (the requirement text is MODIFIED, their behaviour is not)
- [x] 5.7 REFACTOR with the suite green (`/tdd-refactor`) over `budget.ts`, `cost-table.ts`, `config.ts`; no behaviour change

## 6. Privacy and ethics check

- [x] 6.1 Run `/privacy-ethics-check` over the diff (aggregate read of `query_log` only; no value of any variable in errors or messages; no log; no key reaches the evaluation model). Record the outcome in the step 11 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 7. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 7.1 Identify tests affected by the change: `grep -rn "StorePort\|LlmUnavailableReason\|LlmConfigError\|StoreQueryArgument" tests`; the `StorePort` doubles cast with `as unknown as StorePort` need no change — confirm `npm run typecheck` agrees
- [x] 7.2 Update affected tests without weakening their assertions. Confirm that each `#### Scenario:` of `specs/llm-adapter/spec.md` (19) and `specs/graph-store/spec.md` (4) maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)

## 8. Docs and gates before verification

- [x] 8.1 `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` green; JSDoc on every new export

## 9. Update Technical Documentation (MANDATORY)

- [x] 9.1 `.env.example`: rewrite the comment of `DAILY_BUDGET_USD` (do not add the variable): positive decimal in USD; sum of `query_log.cost_usd` of the UTC day; live mode only; empty = no ceiling; with a ceiling, `LLM_MODEL`, `LLM_MODEL_VERIFY` and `LLM_EMBED_MODEL` must have a price in `COST_TABLE`; reached → cache-only with a warning
- [x] 9.2 `readme.md` §1.4, row `DAILY_BUDGET_USD`: UTC daily sum of `query_log.cost_usd`, positive decimal, live mode only, empty = no ceiling; with a ceiling, `LLM_MODEL`, `LLM_MODEL_VERIFY` and `LLM_EMBED_MODEL` must have a price in `COST_TABLE`, otherwise boot fails
- [x] 9.3 `docs/backend-standards.md` §8, "Budget ceiling": applied by the core decorator `withDailyBudget`, composed by the composition root over the live model only when a ceiling is set; `createLlm` does not apply it; threshold `>=`, UTC day; blocks embeddings too
- [x] 9.4 `docs/project-context.md`: the LLM adapter gotcha and the line "the evaluation-mode adapter is DIS-18" now describe `createEvaluationLlm` (`evaluation-mode`), `createLlm`, `withDailyBudget` + `sumCostSince`, and that the ceiling cannot trigger until DIS-74 writes `cost_usd`
- [x] 9.5 No ADR (design D8); confirm nothing in the implementation contradicted that
- [x] 9.6 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 10. Seed: regenerate the analyzer fingerprint (design D9) — last commit of the series

- [x] 10.1 Preconditions: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` both print nothing; `DATABASE_URL` points to a migrated local database (`npm run db:migrate`). When reaching this step, ask the author to provide `AUTHOR_HASH_SALT` in the session with `!` — never ask earlier, never write it to any file
- [x] 10.2 Run `npm run seed:build`
- [x] 10.3 Check the diff: in `seeds/graph-dump.sql` only the `analyzer-fingerprint` header line changes (the `contract-fingerprint` line and every row identical); `packages/web/src/data/sample-projects.ts` unchanged. If any other line changes, stop and tell the author; do not commit
- [x] 10.4 Commit the regenerated seed as the last commit of the series (`chore(DIS-18): regenerate the seed fingerprint`). If a later fix touches a fingerprint input (`packages/core/src/knowledge`, `packages/adapters/store-postgres/src`, …), repeat 10.1–10.4 so the seed commit stays last

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 11.1 Capture the pre-test baseline: the 0.5 indicators, plus `SELECT count(*) FROM query_log` on the local database (the integration tests insert rows only inside rolled-back transactions)
- [x] 11.2 Run the targeted tests: `npx vitest run tests/unit/llm tests/integration/store/query-cost.spec.ts tests/integration/store/graph-read.spec.ts`
- [x] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/llm/**/*.ts,packages/core/src/knowledge/read-arguments.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones)
- [x] 11.4 Verify the post-test state: `query_log` count equal to the baseline; `seeds/`, `packages/web/`, `fixtures/` unchanged since the step 10 commit; no `.stryker-tmp/` left behind. Restore and document if not
- [x] 11.5 Create the report `openspec/changes/llm-evaluation-budget/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the seed diff of step 10, the Stryker score and the privacy check of 6.1
- [x] 11.6 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 No CLI or HTTP entry point uses the LLM yet (DIS-76): exercise it through a throwaway `tsx` script in the session scratchpad (never committed) that calls `llmConfigFromEnv` with explicit env objects, `createLlm`, `withDailyBudget` and `createPostgresStore` on the local database
- [x] 12.2 Evaluation path: empty env → mode `evaluation`; `complete` and `embed` fail with `evaluation-mode`; a `fetch` wrapper in the script counts zero calls
- [x] 12.3 Ceiling path against the real database: record the `query_log` count; inside one transaction that the script rolls back, insert rows of today on an existing project summing `1.5`; with `DAILY_BUDGET_USD=1` and `LLM_MODEL=llama3.2` (Ollama URL; Ollama need not answer) `complete` fails with `BUDGET_EXHAUSTED` before any request; build a second store + wrapper (restart) and see the same; roll back and confirm the count is back to the baseline
- [x] 12.4 Below the ceiling, if Ollama answers on `http://localhost:11434` with `llama3.2`: `complete` returns text through the wrapper; if Ollama is not available, record it and do not install anything without asking the author
- [x] 12.5 Configuration errors: `DAILY_BUDGET_USD=abc`; `DAILY_BUDGET_USD=1` + `LLM_MODEL=llama3.2:3b` (the printed message names the variables, holds no value and mentions Ollama)
- [x] 12.6 Delete the scratchpad script; confirm `git status` shows no stray file and the `query_log` count equals the baseline
- [x] 12.7 Document every command and output in `openspec/changes/llm-evaluation-budget/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths)

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 13.1 No user interface uses the LLM yet (DIS-39 / CM-HU-12): record "not applicable; exercised against the real database in step 12" in the step 11 report
- [x] 13.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/llm/` and `tests/integration/store/query-cost.spec.ts` ran and passed, that the seed-freshness check (if any) is green, and that the mutation step covered `packages/core/src/llm`. Link the run in the step 11 report

## 14. Pull request preparation

- [ ] 14.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (Linear DIS-18 "Decisiones de la autora"), the seed regeneration explained (D9) and the Stryker score; after verification, set DIS-18 to In Review in Linear with a comment in Spanish linking the PR and the change

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 15.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/llm-evaluation-budget/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [ ] 15.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report; if a fix touches a fingerprint input, redo step 10 so the seed commit stays last
- [ ] 15.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 15.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
