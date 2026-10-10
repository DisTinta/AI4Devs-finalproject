## Context

See proposal.md (Why). Current state the approach builds on:

- `LlmPort` (`packages/core/src/ports/LlmPort.ts`) already declares `mode: 'live' | 'evaluation'`;
  `LlmUnavailable` (`packages/core/src/llm/errors.ts`) has a closed `reason` union without
  `evaluation-mode`.
- `llmConfigFromEnv` (`packages/adapters/llm/src/config.ts`) returns `EvaluationLlmConfig |
  LiveLlmConfig` and `LlmConfigError` carries one `variable`. `createOpenAiCompatibleLlm` accepts only
  `LiveLlmConfig` (type-level guard, spec `llm-adapter`).
- `query_log` (migration `0002`) has `cost_usd numeric(10,6) NULL` and `created_at timestamptz NOT
  NULL DEFAULT now()`; only `query_log_project_id_idx` exists (`0003`). No code writes `query_log`
  yet (DIS-74).
- `createPostgresStore` runs reads through `runQuery` (one statement, no `SAVEPOINT`); read arguments
  are validated in `packages/core/src/knowledge/read-arguments.ts` and fail with `InvalidStoreQuery`
  naming a `StoreQueryArgument` (`'name' | 'kinds' | 'hops'`).
- No composition root composes the LLM yet (`packages/api/src/index.ts` is a stub; DIS-76).

## Goals / Non-Goals

**Goals:**

- A composition root can build a working `LlmPort` from any valid configuration with one call, and
  add the ceiling with a second one, without branching on vendor details.
- No code path in evaluation mode can reach `fetch`, by construction rather than by a runtime check.
- The ceiling's only source of truth is the database (PH-14), so it holds across restarts and across
  several processes sharing the database.

**Non-Goals:**

- Writing `cost_usd` (DIS-74 calls `costUsd`), serving the cache (CM-HU-13), the HTTP mapping
  (CM-HU-12). See proposal.md (Non-goals).
- Exact enforcement under concurrency: two calls that read the spend at the same time can both pass
  (D5).

## Decisions

### D1 — Evaluation adapter: a separate factory with no `fetch` at all

`createEvaluationLlm(config: EvaluationLlmConfig): LlmPort` in
`packages/adapters/llm/src/evaluation-llm.ts`. It takes no options object, imports nothing from the
HTTP client and rejects with `new LlmUnavailable('evaluation-mode')`. Both `complete` and `embed` are
`async` so the rejection is a rejected promise, like the live client's failures.

The `config` parameter exists so the type check binds the factory to the evaluation variant (spec
scenario "A live configuration does not type-check…", mirror of the DIS-17 guard). It is **used**,
not ignored: the port's mode comes from it (`mode: config.mode`, typed `'evaluation'`). A `_config`
prefix would not pass `npm run lint`: `eslint.config.mjs` takes `tseslint.configs.recommended`
without `argsIgnorePattern`, so `@typescript-eslint/no-unused-vars` reports `_config` too (checked
with `npx eslint --stdin` on 2026-10-09). The ESLint config is not changed for this. Alternatives: a `mode` flag on the live client (rejected: the HTTP code would be one `if`
away from evaluation mode, the opposite of "by construction"); a class with a private constructor
(rejected: the codebase uses factory functions everywhere).

### D2 — New reason `evaluation-mode`, added as an ADDED requirement

`LlmUnavailableReason` gains `'evaluation-mode'`; `describe()` needs no change (no details). The
Linear ticket says the delta "modifies the requirement that lists the reasons", but no requirement of
`llm-adapter` lists them all: "Endpoint failures map to one error" lists only endpoint failures, and
`not-configured` lives in "Model selection per purpose". So the reason is introduced by the ADDED
requirement "Evaluation mode never calls the model", which is where it is observable; no existing
requirement changes meaning. Callers (DIS-39) are expected to branch on `mode` before calling (PH-08);
the reason is the safety net when they do not.

### D3 — Selector `createLlm` in its own file, without the budget

`packages/adapters/llm/src/create-llm.ts`: `createLlm(config: LlmConfig, options:
OpenAiCompatibleLlmOptions = {}): LlmPort` switches on `config.mode`. It cannot apply the budget
because the adapter package has no `StorePort` and must not get one (it would make the LLM adapter
depend on the store). The composition root does
`cfg.mode === 'live' && cfg.dailyBudgetUsd !== undefined ? withDailyBudget(createLlm(cfg), { store,
dailyBudgetUsd: cfg.dailyBudgetUsd }) : createLlm(cfg)`; this is written in the JSDoc of
`withDailyBudget` and `createLlm`, in `docs/backend-standards.md` §8, and already commented on DIS-76.

### D4 — Cost table in core, pure, with injectable table

`packages/core/src/llm/cost-table.ts`:

- `interface ModelPrice { inputPerMTok: number; outputPerMTok: number }`, `type CostTable =
  Readonly<Record<string, ModelPrice>>`, `COST_TABLE: CostTable` (frozen) with the four Ollama
  examples at 0 and a comment stating the rule for paid entries (official pricing URL + date checked).
- `costUsd(model, usage: { inputTokens: number; outputTokens?: number }, table = COST_TABLE): number`
  — `Math.round(raw * 1e6) / 1e6`; unknown model → `0`. Embeddings pass `outputTokens` omitted (0).
- `hasPrice(model, table = COST_TABLE): boolean` — `Object.hasOwn(table, model)`, so `toString` or
  `__proto__` never count as priced and the name is compared exactly.

It lives in core because the budget rule and DIS-74's `cost_usd` both depend on it; the adapter's
config imports `hasPrice` and `COST_TABLE` from `@codemind/core` (adapter → core is the allowed
direction). Alternative: the price check inside the budget at call time (rejected: the author decided
to fail at boot, and a call-time check would only surface after spending).

### D5 — `withDailyBudget`: a stateless decorator over `LlmPort`

`packages/core/src/llm/budget.ts`:
`withDailyBudget(llm: LlmPort, { store: Pick<StorePort, 'sumCostSince'>, dailyBudgetUsd: number,
now = () => new Date() }): LlmPort`. Each call computes `since = Date.UTC(y, m, d)` of `now()`, awaits
`store.sumCostSince(since)`, throws `BudgetExhausted` when `spent >= dailyBudgetUsd`, else delegates.
`mode` is read from the inner port. `startOfUtcDay` / `startOfNextUtcDay` are small exported helpers so
the boundary is unit-tested and mutation-covered.

`BudgetExhausted extends DomainError` in `packages/core/src/llm/errors.ts`: `code =
'BUDGET_EXHAUSTED'`, `spentUsd`, `dailyBudgetUsd`, `resetsAt: Date`; message with the numbers and the
ISO reset time only.

Threshold `>=`: readme §2.5 says "al alcanzar el techo"; the ticket's original DoD says "por encima",
clarified by the author (Linear DIS-18, decision 3). Day boundary UTC (decision 2).

Trade-off: check-then-call is not atomic. Concurrent calls, or a single expensive call, can overshoot
the ceiling by the cost of the calls in flight; and until DIS-74 writes `query_log`, the spend stays
`0`. Accepted: the goal is to stop a runaway loop, not exact accounting; reserving cost before the
call needs the cost before knowing the tokens (non-goal).

Alternative: in-memory counter (rejected by PH-14); a database function or trigger (rejected: logic
belongs in core, testable without a database).

### D6 — `sumCostSince` without a new index

`SUM_COST_SINCE = SELECT COALESCE(SUM(cost_usd), 0)::text AS total FROM query_log WHERE created_at >=
$1` in `queries.ts`, run through `runQuery` (works on pool and caller transaction). The `::text` cast
and `Number(total)` make the conversion explicit: `pg` returns `numeric` as a string anyway, and
`numeric(10,6)` sums of realistic daily spend are exactly representable to 6 decimals in a double.
`since` is validated first by `assertValidCostSince(since)` in `read-arguments.ts`
(`Number.isNaN(since.getTime())` → `InvalidStoreQuery('since', 'must be a valid date')`);
`StoreQueryArgument` gains `'since'`.

No index on `created_at`: it is one aggregate per model call, `query_log` grows by one row per `ask`
in a single-user tool, so a sequential scan stays far below the model's latency. Adding it later is a
plain `0004` migration with no data change. Alternative: index now (rejected: an index the query does
not need yet is a write cost and a migration to review for nothing).

### D7 — Configuration: `DAILY_BUDGET_USD` and the price check in `llmConfigFromEnv`

- `LiveLlmConfig.dailyBudgetUsd?: number`, read only after the mode is `live` (evaluation keeps
  checking nothing). Parser in the style of `readTimeout`: `/^[0-9]+(\.[0-9]+)?$/`, `> 0` and finite (`Number.isFinite`, verify 2.4); else
  `LlmConfigError('DAILY_BUDGET_USD')`.
- With a ceiling, the models are checked in the order `model`, `verifyModel` (only when
  `LLM_MODEL_VERIFY` was set: when it falls back to `LLM_MODEL` it is the same name, already checked),
  `embedModel` when present. The first without `hasPrice` throws
  `new LlmConfigError('DAILY_BUDGET_USD', modelVariable)`.
- `LlmConfigVariable` gains `'DAILY_BUDGET_USD'`; new `type LlmModelVariable = 'LLM_MODEL' |
  'LLM_MODEL_VERIFY' | 'LLM_EMBED_MODEL'`; `LlmConfigError` gains an optional readonly
  `modelVariable` (absent, not `undefined`, when it does not apply — same convention as
  `LlmUnavailable`'s details). Message for that case: `DAILY_BUDGET_USD is set but <modelVariable>
  has no price in COST_TABLE; with a local Ollama leave DAILY_BUDGET_USD empty; see .env.example`.
  Variable names only, never values.

Alternative: a separate `budgetConfigFromEnv` (rejected: the price check needs the model names, which
`llmConfigFromEnv` already owns; two readers would duplicate the trimming rules).

### D8 — Tests and layer order

Order (`LAYER_ORDER`): port (`StorePort.sumCostSince`) → domain (`cost-table.ts`, `budget.ts`,
errors) → adapters (store, evaluation, selector, config). One test per `#### Scenario:`:

- `tests/unit/llm/cost-table.spec.ts` — the three cost-table scenarios (injected table, except the
  shipped-table one).
- `tests/unit/llm/budget.spec.ts` — fake `sumCostSince`, recording inner `LlmPort`, fixed clock.
- `tests/unit/llm/evaluation-llm.spec.ts` — `vi.spyOn(globalThis, 'fetch')`; the `@ts-expect-error`
  type-check scenario; the selector scenario with the existing `fakeFetch` pattern.
- `tests/unit/llm/llm-config.spec.ts` — the four new configuration scenarios appended.
- `tests/integration/store/query-cost.spec.ts` — the two cost-sum scenarios and "The ceiling survives a
  restart" (real Postgres, `withRollback`, rows inserted with explicit `created_at`; the projects are
  created through the store). The invalid-`since` scenario goes next to the existing
  invalid-arguments test in `tests/integration/store/graph-read.spec.ts`, reusing its statement
  counter.

The unit `StorePort` doubles in `tests/unit/{index,cli}` are cast with `as unknown as StorePort`, so
the new port method breaks none of them.

No ADR: every decision is local to the LLM and store modules and cheap to revert.

### D9 — The seed's analyzer fingerprint changes; `seed:build` closes the series

`packages/cli/src/seed/fingerprint.ts` (`ANALYZER_DIRECTORIES`) hashes every file of
`packages/core/src/knowledge` and `packages/adapters/store-postgres/src`, among others. This change
edits both: `knowledge/errors.ts` and `knowledge/read-arguments.ts` (argument `since`, D6), and
`store-postgres/src/queries.ts` and `postgres-store.ts` (`sumCostSince`). Keeping `knowledge/` intact
would not avoid the regeneration, because the store adapter is an input too, so `since` is validated
where the other read arguments are, with `InvalidStoreQuery`, as DIS-18 E5 asks.

The **contract** fingerprint (`AnalyzerPort.ts` + `migrations/*.up.sql`) does not change: no new
migration, `AnalyzerPort.ts` untouched. `packages/core/src/llm`, `packages/core/src/ports/StorePort.ts`
and `packages/adapters/llm` are not fingerprint inputs.

Therefore the last commit of the series is `npm run seed:build` with the regenerated seed
(`docs/project-context.md` → seed gotcha). Its diff MUST change only the `analyzer-fingerprint` header
of `seeds/graph-dump.sql` (and nothing in `packages/web/src/data/sample-projects.ts`): identical rows.
Any other change in the seed is a stop-and-ask, not something to commit. `AUTHOR_HASH_SALT` is
provided by the author in the session at that step only; it is never written to any file.

## Risks / Trade-offs

- [Concurrent calls overshoot the ceiling] → accepted (D5); the next call after the rows are written
  is blocked.
- [The ceiling never triggers until DIS-74 writes `cost_usd`] → expected; stated in
  `docs/project-context.md` and covered by the integration test that inserts rows directly.
- [A user with a paid model must add it to `COST_TABLE` to use a ceiling] → intended (decision 1):
  boot fails with a message naming the variable; the `.env.example` comment explains it.
- [`hasPrice` exact match rejects Ollama tags like `llama3.2:3b` under a ceiling] → intended; with
  Ollama the ceiling is meant to stay empty, and the message says so.
- [Rounding of `costUsd` to 6 decimals loses sub-micro-dollar costs] → matches the column scale;
  the database would round the same value on insert.

## Migration Plan

No schema migration and no data change. `DAILY_BUDGET_USD` stays empty by default, so existing
environments behave exactly as before. The seed is regenerated only for its fingerprint header (D9);
`db:seed` loads the same rows. Rollback: revert the commits, seed included.

## Follow-ups

Findings of `/verify-against-spec` (report `reports/2026-10-10-verify-against-spec.md`):

- **A — 2.4** a `DAILY_BUDGET_USD` too long for a double became `Infinity`, a ceiling that never trips:
  the spec now requires a finite number (requirement text and the scenario "A malformed daily budget
  fails naming the variable", value 400 × `9`); `readDailyBudget` checks `Number.isFinite` (D7).
- **A — 2.2** the own-connections test now sums committed rows dated 2100 (exact `0.7`, project
  deleted in `finally`); a pool path answering a constant fails it.
- **A — 2.1** new test: `sumCostSince` sends exactly one `SELECT` and nothing else ("SHALL write
  nothing").
- **D — 2.3** the paid-entry rule (official pricing URL + date checked) stays a reviewed convention
  in the `COST_TABLE` comment; no automated check (no paid entry exists).
- **D — 2.5** the ceiling has no production effect until DIS-76 composes it and DIS-74 writes
  `cost_usd`: already stated in proposal (Non-goals), D5 and `docs/project-context.md`.
- **D — 3.1** `startOfUtcDay` / `startOfNextUtcDay` stay exported helpers (D5: boundary unit tests and
  mutation coverage).
- **D — 3.2** the clock is read on every call, so a long-lived wrapper follows the UTC day (D5, "each
  call computes `since`"); it is the requirement's "before every … request … the current UTC day".
- **D — 3.3, 3.4** `COST_TABLE` is frozen and inherited keys never count as priced (D4,
  `Object.hasOwn`); both serve the exact-name rule.
- **D — 3.5** embeddings pass no output tokens (D4); DIS-74 relies on it.
- **D — 3.6** check-then-call is not atomic (D5, Risks; proposal Non-goals: "the call that crosses
  the ceiling is allowed").
- **D — 3.7** the exact `BudgetExhausted` message is pinned by a test so that only numbers and the ISO
  reset time can appear in it (privacy).

