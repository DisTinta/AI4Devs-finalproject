## Why

CM-HU-07 (DIS-7) promises that evaluation costs 0 € without an account and that a paid provider can
never drain its quota. DIS-17 delivered the `LlmPort` contract and the live OpenAI-compatible client,
but only **classifies** the evaluation mode: nothing implements it, so no caller can be composed
without credentials, and `DAILY_BUDGET_USD` is documented (`readme.md` §1.4, §2.5 (6),
`docs/backend-standards.md` §8) but read by nothing. This is DIS-18 (CM-HU-07.2): the evaluation
adapter that never calls the model, and a daily spend ceiling computed from `query_log` (gate PH-14:
never an in-memory counter, so a restart cannot reset it). It blocks DIS-39 (explain), DIS-70
(semantic verification), DIS-74 (usage) and DIS-76 (API composition).

## What Changes

- **Evaluation adapter** (`packages/adapters/llm/src/evaluation-llm.ts`, new):
  `createEvaluationLlm(config: EvaluationLlmConfig): LlmPort` reports mode `evaluation`, never touches
  `fetch`, and rejects every `complete()` and `embed()` with `LlmUnavailable` and the **new reason
  `evaluation-mode`**. `not-configured` keeps its meaning (live mode without `LLM_EMBED_MODEL`).
- **Selector** `createLlm(config: LlmConfig, options?)`, exported from `@codemind/adapter-llm`: builds
  the evaluation adapter or the live client from the configuration's mode, so the composition root
  does not branch. It does **not** apply the budget (it has no store).
- **Cost table** (`packages/core/src/llm/cost-table.ts`, new): `COST_TABLE` (USD per million input and
  output tokens), `costUsd(model, usage, table?)` (0 for a model without an entry, rounded to 6
  decimals, the scale of `query_log.cost_usd`) and `hasPrice(model, table?)` (exact name, no tag
  normalisation). `COST_TABLE` holds no invented paid prices: only the `.env.example` Ollama models
  (`llama3.2`, `mistral`, `qwen2.5-coder`, `nomic-embed-text`) at 0.
- **Daily budget** (`packages/core/src/llm/budget.ts`, new): `withDailyBudget(llm, { store,
  dailyBudgetUsd, now? })` wraps an `LlmPort`; before every call it reads the spend since the start of
  the current UTC day with `StorePort.sumCostSince` and, when `spent >= dailyBudgetUsd`, rejects with
  the new domain error `BudgetExhausted` (`BUDGET_EXHAUSTED`) without calling the model. The ceiling
  blocks `embed()` too, on purpose.
- **Store** (`StorePort.sumCostSince(since)`, new): sum of `query_log.cost_usd` from `since`, across
  every project, `NULL` ignored, `0` without rows; an invalid date fails with `InvalidStoreQuery`
  (new argument `since`) before querying.
- **Configuration**: `llmConfigFromEnv` reads `DAILY_BUDGET_USD` in live mode only (positive decimal;
  blank = no ceiling). With a ceiling, `LLM_MODEL`, `LLM_MODEL_VERIFY` and `LLM_EMBED_MODEL` must have
  a price in `COST_TABLE`, or the configuration fails naming `DAILY_BUDGET_USD` and the model
  variable, never a value, and saying that with local Ollama `DAILY_BUDGET_USD` stays empty.

## Non-goals

- Serving the cache when the budget is exhausted (CM-HU-13) and mapping `BudgetExhausted` to `429`
  (CM-HU-12 / DIS-76, DIS-78).
- Writing `query_log` or computing `cost_usd` per `ask` (CM-HU-11.2 / DIS-74): this change only reads.
- Composing the LLM in `packages/api` or the CLI (DIS-76; a comment there already describes the
  composition `withDailyBudget(createLlm(cfg), …)`).
- A per-project or per-user budget; an in-memory counter (PH-14); a configurable time zone.
- Paid model prices, dynamic prices from a provider API, reserving cost before a call (the call that
  crosses the ceiling is allowed; the ceiling stops the next one).
- A new index on `query_log.created_at` (design D6).

## Privacy and logging impact

No personal data: `query_log` is read only as an aggregate sum; no question text leaves the store.
`BudgetExhausted` and the new configuration error carry only numbers, dates and variable names,
never variable values. Nothing new is logged. The API-key guarantees of `llm-adapter` are unchanged;
the evaluation adapter receives no key at all.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `llm-adapter`: the configuration also reads and validates `DAILY_BUDGET_USD` and checks model prices
  under a ceiling (MODIFIED); new requirements for the evaluation adapter and its `evaluation-mode`
  reason, the mode selector, the cost table and the daily budget (ADDED).
- `graph-store`: new daily cost-sum read over `query_log` (ADDED); `since` joins the read arguments
  validated before querying (MODIFIED).

## Impact

- Code (core): `packages/core/src/llm/{cost-table,budget}.ts` (new), `errors.ts` (`BudgetExhausted`,
  reason `evaluation-mode`), `index.ts`; `packages/core/src/ports/StorePort.ts` (`sumCostSince`);
  `packages/core/src/knowledge/{errors,read-arguments}.ts` (argument `since`).
- Code (adapters): `packages/adapters/llm/src/{evaluation-llm,create-llm,config,index}.ts`;
  `packages/adapters/store-postgres/src/{queries,postgres-store}.ts`.
- Tests: `tests/unit/llm/{evaluation-llm,cost-table,budget,llm-config}.spec.ts`,
  `tests/integration/store/query-cost.spec.ts`. No new dependency, no migration.
- Seed: `knowledge/` and `store-postgres/src` are inputs of the seed's analyzer fingerprint, so
  `seeds/graph-dump.sql` is regenerated with `npm run seed:build`; only its `analyzer-fingerprint`
  header may change (design D9).
- Mutation: the new core files are inside Stryker's `mutate` (≥ 70 %).
- Docs: `readme.md` §1.4 (`DAILY_BUDGET_USD` row), `.env.example` (comment of `DAILY_BUDGET_USD`),
  `docs/backend-standards.md` §8, `docs/project-context.md`, `prompts.md`.
- Linear: DIS-18; parent DIS-7; DIS-76 (composition, already commented), DIS-74 (writer of
  `cost_usd`, consumer of `costUsd`).
