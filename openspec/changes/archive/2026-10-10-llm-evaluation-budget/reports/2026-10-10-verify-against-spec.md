# Verify against spec: llm-evaluation-budget (DIS-18)

> Run by the `verify-against-spec` skill (forked, read-only) on 2026-10-10 over `5f95ec2..cdf23a5`;
> saved verbatim by the main session. Test states come from the step 11 report (880 passed, 0
> failed, typecheck exit 0); the skill re-ran nothing. Destinations and fixes: see the addendum at
> the end and `design.md` → Follow-ups.

Specs checked: `openspec/changes/llm-evaluation-budget/specs/llm-adapter/spec.md` and `specs/graph-store/spec.md`. Diff checked: `5f95ec2..HEAD` on `feature/DIS-18-llm-evaluation-budget`.

**Verdict:** the code matches the spec for all 23 scenarios. Nothing in the spec is missing from the code. There are two gaps in test proof, one unhandled edge case, and seven pieces of behaviour the spec never asks for, each needing a keep-or-remove decision.

## 1. Requirements implemented correctly

| Requirement | Code | Proving test |
|---|---|---|
| Config: no URL and no key gives `evaluation`, and nothing else is checked | `packages/adapters/llm/src/config.ts:80-82` | `tests/unit/llm/llm-config.spec.ts:18`, `:147` |
| Config: URL present gives `live`; key without URL names `LLM_BASE_URL`; URL without model names `LLM_MODEL`; URL shape | `config.ts:83-85`, `:134-142` | `llm-config.spec.ts:30`, `:46`, `:57`, `:77` |
| Config: timeout must be digits only, 1 to 300000, default 120000 | `config.ts:118-123` | `llm-config.spec.ts:77`, `:111` |
| Config: `DAILY_BUDGET_USD` read only in live mode; absent means no ceiling; must match `^[0-9]+(\.[0-9]+)?$` and be > 0 | `config.ts:96`, `:126-131` | `llm-config.spec.ts:157`, `:176` |
| Config: with a ceiling, models need a price, checked in order `LLM_MODEL`, `LLM_MODEL_VERIFY` (only when set), `LLM_EMBED_MODEL` | `config.ts:97-108` | `llm-config.spec.ts:193`, `:220` |
| Error `LLM_CONFIG_INVALID` carries `variable` and `modelVariable`; the message names variables, never values; it includes the Ollama hint | `config.ts:45-70` | `llm-config.spec.ts:51-54`, `:185-189`, `:209-216` |
| Evaluation model reports `evaluation`, never calls `fetch`, and always fails with `LLM_UNAVAILABLE` / `evaluation-mode` | `packages/adapters/llm/src/evaluation-llm.ts:11-21`; reason added in `packages/core/src/llm/errors.ts:11` | `tests/unit/llm/evaluation-llm.spec.ts:26` |
| Evaluation model accepts only an evaluation config at type level | `evaluation-llm.ts:11` (`EvaluationLlmConfig`) | `evaluation-llm.spec.ts:52` (`@ts-expect-error`, covered by `tests/tsconfig.json` in `npm run typecheck`) |
| One entry point builds the model for the mode, takes an injectable `fetch`, and does not apply the budget | `packages/adapters/llm/src/create-llm.ts:15-17` | `evaluation-llm.spec.ts:69` |
| Cost formula rounded to 6 decimals; unpriced model costs 0; exact-name match | `packages/core/src/llm/cost-table.ts:37-50` | `tests/unit/llm/cost-table.spec.ts:13`, `:23` |
| Shipped table holds only the four Ollama models at 0, with the paid-entry rule as a comment | `cost-table.ts:12-23` | `cost-table.spec.ts:51` |
| Ceiling: reads the spend from the database on every call, blocks at `>=`, blocks embeddings too, keeps mode, passes results and errors through unchanged | `packages/core/src/llm/budget.ts:38-58` | `tests/unit/llm/budget.spec.ts:52`, `:81`, `:130` |
| `BUDGET_EXHAUSTED` carries spend, ceiling and reset time; no text, no `cause` | `errors.ts:72-91` | `budget.spec.ts:69-76`; `tests/unit/llm/llm-unavailable.spec.ts:77-100` |
| Ceiling survives a restart | `budget.ts:43` plus the store | `tests/integration/store/query-cost.spec.ts:88` |
| Daily cost sum: global across projects, ignores unset costs, 0 when no rows, returns a number | `packages/adapters/store-postgres/src/queries.ts:118`; `postgres-store.ts:181-185`; port at `packages/core/src/ports/StorePort.ts:76-83` | `query-cost.spec.ts:36`, `:54` |
| An invalid `since` is rejected before querying, naming `since` | `packages/core/src/knowledge/read-arguments.ts:41-43`; `errors.ts:54` | `tests/integration/store/graph-read.spec.ts:657`; `tests/unit/knowledge/read-arguments.spec.ts` (new `describe`) |

## 2. Requirements missing or partial

No requirement is missing from the code. Two are only partly proven by tests, and one edge case isn't handled:

1. **"The read … SHALL write nothing"** (graph-store, Daily cost sum). The code is a single `SELECT` (`queries.ts:118`), but no test checks that nothing was written.
2. **"The read SHALL work both on the store's own connections and on a caller-owned transaction"**. The transaction path is properly tested. The own-connections test (`query-cost.spec.ts:71-84`) only checks `typeof total === 'number'` and `>= 0`. It doesn't check the actual sum, so a pool path returning a constant 0 would pass.
3. **"any paid entry added later SHALL carry the official pricing URL and the date it was checked"**. This exists only as a comment (`cost-table.ts:12-16`). Nothing enforces it. That is acceptable for a rule about future edits, but it is a convention, not a check.
4. **Edge case: a very long budget value.** The spec says "a positive decimal number". A value such as 400 nines passes the regex, `Number()` turns it into `Infinity`, and `Infinity > 0` holds (`config.ts:128-129`). The result is a ceiling that can never trip, yet every model must still have a price. The timeout has an upper limit (`config.ts:116`); the budget has none. The spec says nothing about this case.
5. **Not a gap, but worth knowing.** Applying the ceiling at boot is explicitly left to the composition root (DIS-29 / DIS-76). Nothing in production calls `createLlm` or `withDailyBudget` yet, and nothing writes `query_log.cost_usd` yet (that is DIS-74). So the ceiling has no effect in production for now.

**Specific checks:**
- **Dependencies not in the manifest:** none. `@codemind/adapter-llm` declares `@codemind/core` (`packages/adapters/llm/package.json:9`). `store-postgres` declares it at `package.json:9`. The test's `pg` import is in the root `devDependencies` (`package.json:41`). No third-party package was added.
- **Authorisation checks:** the spec requires none. The global sum across projects is what the spec asks for.
- **Fields the spec doesn't mention:** `BudgetExhausted.name` and its exact message text (`errors.ts:86-89`). The message contains only the numbers and the ISO date. `LlmConfigError.modelVariable` is covered by the spec.
- **Tests weaker than their scenario:**
  - "The ceiling survives a restart" builds the second store on the same harness transaction (`query-cost.spec.ts:113`), not a new connection. It still fails correctly against an in-memory counter, because the rows exist before any wrapper does. I judge it adequate.
  - "A reached ceiling…" doesn't itself check that the error carries no database or model text. That is pinned elsewhere, by the exact-message assertion in `llm-unavailable.spec.ts:88-90`.
  - The own-connections test from item 2 above.

## 3. Unspecified behaviour

Each item needs a decision: either add it to the spec, or remove it. Items 1 to 5 are written up in `design.md` (D4, D5), so someone has reviewed them, but they are not spec requirements.

1. **`startOfUtcDay` and `startOfNextUtcDay` are public exports of `@codemind/core`** (`budget.ts:16`, `:21`, re-exported at `packages/core/src/llm/index.ts:5`). They are tested at `budget.spec.ts:120`. Either add them to the spec or stop exporting them and test them through `withDailyBudget`.
2. **The clock is read on every call, through an injectable `now`** (`budget.ts:12`, `:39-42`), so one wrapper follows the day change at midnight UTC. Tested at `budget.spec.ts:99`. This is real behaviour (a ceiling that resets mid-process) and belongs in the spec.
3. **`COST_TABLE` is frozen** (`cost-table.ts:18-23`), and `cost-table.spec.ts:59` asserts `Object.isFrozen`. The spec says nothing about immutability.
4. **Inherited keys never count as priced** (`Object.hasOwn`, `cost-table.ts:49`), so `toString` and `__proto__` are excluded. Tested at `cost-table.spec.ts:38-43`. This goes beyond "exact name".
5. **Embedding cost: `outputTokens` is optional and defaults to 0** (`cost-table.ts:30`, `:40`). Tested at `cost-table.spec.ts:46-49`. The spec formula always has output tokens. DIS-74 will rely on this.
6. **Calls already in progress can overshoot the ceiling**, because the check and the call are not atomic (documented in `budget.ts:32`). It is an accepted trade-off in design D5, but the spec doesn't state it. Callers should know the limit is soft.
7. **The exact `BudgetExhausted` message format** is pinned word for word by `llm-unavailable.spec.ts:88-90`. The spec only requires which fields the error carries.

Two changes are not behaviour and need no decision: the regenerated fingerprint header in `seeds/graph-dump.sql` (commit `16c9dfb`), and new message assertions on existing DIS-24 code in `tests/unit/knowledge/read-arguments.spec.ts`.

## Scenario → test → state

"Green" comes from the step 11 report; nothing was re-run.

| Scenario | Test | State |
|---|---|---|
| No URL and no key selects evaluation mode | `tests/unit/llm/llm-config.spec.ts:18` | green |
| A URL without a key selects live mode | `llm-config.spec.ts:30` | green |
| A key without a URL fails without showing the key | `llm-config.spec.ts:46` | green |
| A URL without a model fails | `llm-config.spec.ts:57` | green |
| A malformed timeout or URL fails naming the variable | `llm-config.spec.ts:77` | green |
| A valid timeout overrides the default | `llm-config.spec.ts:111` | green |
| The daily budget is read in live mode only | `llm-config.spec.ts:157` | green |
| A malformed daily budget fails naming the variable | `llm-config.spec.ts:176` | green |
| With a ceiling every configured model needs a price | `llm-config.spec.ts:193` | green |
| Without a ceiling a model needs no price | `llm-config.spec.ts:220` | green |
| Without URL and key no request is sent | `tests/unit/llm/evaluation-llm.spec.ts:26` | green |
| A live configuration does not type-check against the evaluation model | `evaluation-llm.spec.ts:52` (via `npm run typecheck`) | green |
| The entry point builds a live model for a live configuration | `evaluation-llm.spec.ts:69` | green |
| The cost of a priced model is computed and rounded | `tests/unit/llm/cost-table.spec.ts:13` | green |
| A model without a price costs nothing and has no price | `cost-table.spec.ts:23` | green |
| The shipped table holds only the Ollama examples at zero | `cost-table.spec.ts:51` | green |
| A reached ceiling blocks completions and embeddings | `tests/unit/llm/budget.spec.ts:52` | green |
| Below the ceiling the request reaches the model | `budget.spec.ts:81` | green |
| The ceiling survives a restart | `tests/integration/store/query-cost.spec.ts:88` | green |
| The cost since an instant is summed across projects | `query-cost.spec.ts:36` | green |
| With no matching row the cost is zero | `query-cost.spec.ts:54` | green |
| Invalid read arguments are rejected before querying | `tests/integration/store/graph-read.spec.ts:631` | green |
| An invalid instant for the cost sum is rejected before querying | `graph-read.spec.ts:657` | green |
| *(no scenario)* the read writes nothing | none | absent |
| *(no scenario)* the read works on the store's own connections | `query-cost.spec.ts:71` (only checks the type) | green, weak |

## Addendum — fixes (2026-10-10, main session)

Destinations in `design.md` → Follow-ups.

- 2.4 (A): spec delta (finite number; 400 × `9` added to "A malformed daily budget fails naming the
  variable"); RED seen (`expected an LlmConfigError`), then `Number.isFinite` in `readDailyBudget` →
  green.
- 2.2 (A): "reads the cost sum on the store's own connections" now asserts the exact sum `0.7` of
  committed rows dated 2100 (cleaned up in `finally`); a temporary mutation returning `0` on the pool
  path made it fail (1 failed), then restored.
- 2.1 (A): new test "sums the cost with a single SELECT and writes nothing".
- 2.3, 2.5, 3.1–3.7: D, kept as documented in D4/D5 and the proposal's non-goals.

Re-run after the fixes: `npx vitest run tests/unit/llm tests/integration/store/query-cost.spec.ts`
green; full gates re-run before the push (see the step 11 report addendum).

