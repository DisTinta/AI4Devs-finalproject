# Adversarial review: llm-evaluation-budget (DIS-18)

> Run by the `adversarial-review` skill (forked, read-only) on 2026-10-10 over
> `origin/feature/entrega-2-CRN...HEAD` (PR #32, head `11767af`); saved verbatim by the main session.
> Nothing was re-run: test states come from the step 11 report and its addendum. A permission rule
> blocked reading the `.env.example` diff, so its comment text was not reviewed. Destinations and
> fixes: see the addendum at the end and `design.md` → Follow-ups.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Minor | `packages/core/src/llm/budget.ts:41-44` | `ensureBudgetLeft` does not catch errors from `store.sumCostSince`. If the database is down, `complete`/`embed` reject with the raw `pg` error instead of `LlmUnavailable` or `BudgetExhausted`. The spec says nothing about this case. | The model is not called, which is safe. But a caller that falls back to cache-only on `LLM_UNAVAILABLE` (DIS-76 / CM-HU-12) gets an untyped infrastructure error, and its text could reach a user-facing message. No scenario covers it. |
| Minor | `packages/core/src/llm/budget.ts:39-44` | `withDailyBudget` is a public core API but does not check `dailyBudgetUsd`. `NaN` never blocks (`x >= NaN` is false), and `0` or a negative value always blocks. Only `llmConfigFromEnv` validates the value. | Any composition that does not pass the value through `llmConfigFromEnv` (a test helper, or a future CLI flag) can create a ceiling that never trips without any warning. |
| Minor | `packages/adapters/store-postgres/src/queries.ts:118` | `SUM_COST_SINCE` has a lower bound only (`created_at >= $1`). A row dated in the future counts toward every day until that date. Clock skew or a crashed test can leave such a row: the own-connections test commits rows dated 2100 (`tests/integration/store/query-cost.spec.ts:79`), and if its `finally` never runs, every developer ceiling of 0.7 USD or less stays tripped until 2100. | This matches the spec ("at or after that instant"), but the requirement says "spend of the current day". The two differ for future-dated rows, and no scenario covers that difference. |
| Minor | `tests/integration/store/query-cost.spec.ts:72-95` | This test commits a `project` row and `query_log` rows to the shared database. `tests/integration/cli/seed-load.spec.ts:159` and `:171` take snapshots of `SELECT * FROM project` and `SELECT * FROM query_log` with no filter, inside a READ COMMITTED transaction. If Vitest runs the two files at the same time, the snapshots can differ. | Possible flaky test across files. `graph-write-pool.spec.ts` already used this pattern; this change adds another committed write to it. |
| Minor | `packages/adapters/store-postgres/src/queries.ts:118`, migrations `0003_indexes-stale.up.sql:19` | `query_log` has no index on `created_at`. With a ceiling, every completion and every embedding batch runs a full-table `SUM`. | Each LLM call costs more as `query_log` grows. Indexing runs many embedding batches. This does not matter at the current scale, but nobody owns it yet. |
| Minor | `packages/core/src/llm/cost-table.ts:19-20` and `packages/adapters/llm/src/config.ts:104-106` | Prices are looked up by model name only, not by endpoint and model. A paid OpenAI-compatible host that serves a model named exactly `mistral` or `llama3.2` passes the boot check with a ceiling, but every call costs 0, so the ceiling never trips. `design.md` lists the risk that "paid model must be added", but not this name collision. | The ceiling would look active while never protecting anything. It is unlikely, but nothing warns about it. |
| Minor | `readme.md:343` | The readme says, in the present tense, that the LLM stops being called once the ceiling is reached and that boot fails ("el arranque falla"). Nothing in production calls `llmConfigFromEnv`, `createLlm` or `withDailyBudget` (grep of `packages/*/src`). `docs/project-context.md` does say the ceiling has no effect until DIS-74/DIS-76. | The user-facing readme describes behaviour that does not exist yet. |
| Question | `openspec/changes/llm-evaluation-budget/specs/**` (first committed in `e7e11eb`, after `7aca97b` and `31ac354`) | Git history cannot show that the spec existed before the code. Task 0.3 kept the planning files untracked until after the feature commits. The only edit after that first commit is the 2.4 fix in `11767af` (finite budget and the 400 × `9` case), with RED recorded. | This is process debt, not a Linear issue. Accept it, or commit the planning artifacts first next time. |

## What was checked

**Spec and task alignment**
- All 23 scenarios map one-to-one to tests with the same names. Every new test was re-read against its scenario.
- The tasks marked `[x]` have their evidence in the step 11 and 12 reports. 14.1 and 15.2–15.5 are honestly left open.
- The only extra behaviour is the 7 items `/verify-against-spec` already listed, all classified D in `design.md` → Follow-ups.

**Hostile input**
- Budget values: `abc`, `0`, `0.0`, `-1`, `1e3`, `1.` and 400 × `9` are rejected. A tiny decimal that rounds to `0` is also rejected, because the check is `> 0`.
- Blank and whitespace values count as unset.
- With a ceiling, the model order is `LLM_MODEL`, then `LLM_MODEL_VERIFY` (only when set), then `LLM_EMBED_MODEL`. Inherited keys such as `toString` are never priced (`Object.hasOwn`).
- An invalid `since` is rejected before any query.
- The comparison is `>=`, and the spend exactly at 1 is tested.
- The day is computed in UTC on every call. `timestamptz` and a JS `Date` parameter compare correctly.
- Two concurrent requests can overshoot the ceiling; design D5 accepts this.
- Evaluation mode makes no `fetch` call, including for `embed([])`.

**Blast radius**
- `sumCostSince` is the only new `StorePort` member, and `createPostgresStore` is the only implementation in `packages/`.
- Nothing in production calls the new entry points yet.
- No migration.
- The change after the seed commit (`935b5b0`) only touches `packages/adapters/llm` and tests, which are not seed fingerprint inputs (`packages/cli/src/seed/fingerprint.ts:28-37`).

**Evidence quality**
- Existing test files only gained cases (`llm-unavailable.spec.ts`, `read-arguments.spec.ts`, `graph-read.spec.ts`, `llm-config.spec.ts`). No assertion was removed or weakened.
- Mutation run: 100 % on `core/src/llm` and `read-arguments.ts`. `config.ts` is outside the mutation scope; its `Number.isFinite` check is pinned by the 400 × `9` case instead.
- The most important test is "A reached ceiling blocks completions and embeddings" (`tests/unit/llm/budget.spec.ts:52`). It catches these mutations:
  - `>=` → `>`: the spend-equals-`1` answers would pass through and `inner.calls` would not be empty.
  - Dropping `startOfUtcDay`: `store.asked` would hold `15:00Z` instead of `00:00Z`.
  - Dropping `+ 1` in `startOfNextUtcDay`: `resetsAt` would be wrong.
  - Calling `llm.complete` before the check: `inner.calls` would not be empty.

## Verdict

**PASS WITH GAPS.** There are no Blockers and no Majors. The seven Minors and one Question each need a destination before archiving.

## Recommended next steps (as written by the reviewer)

1. **A (fix now, cheap):** reword `readme.md:343` so it says the ceiling only applies once the composition root wires it in (DIS-76) and DIS-74 writes `cost_usd`.
2. **B (DIS-76, the composition root):** add a hand-off comment in Spanish on DIS-76 and a Follow-ups line in `design.md`:
   - decide how a `sumCostSince` failure inside `withDailyBudget` reaches the caller (map it to `LlmUnavailable`, or document it);
   - always build the ceiling from `llmConfigFromEnv`, never from a raw number (the `withDailyBudget` input-check finding).
3. **C (one debt issue, or the lighter checklist comment on DIS-18):**
   - index on `query_log(created_at)`;
   - upper bound `< startOfNextUtcDay` in `SUM_COST_SINCE`, which needs a spec delta;
   - stop committed rows in the pool test leaking into parallel tests (for example a dedicated schema, or running the committing specs in sequence);
   - endpoint-aware pricing, or a warning when a ceiling is set but every configured price is 0.
4. **Not a Linear issue:** the Question about spec-before-code ordering is process debt. Note it in the step 15 summary only.
5. Add an addendum to this report once 1–3 have their destinations, then tick 15.2 and continue with 15.3–15.5.

## Addendum — destinations and fixes (2026-10-10, main session)

Per the project rule "fix in the current change", every finding fixable here was fixed here;
destinations in `design.md` → Follow-ups (and D10).

| Finding | Destination | Action |
|---|---|---|
| `sumCostSince` failure not typed | B (DIS-76) + D10 | Documented fail-closed contract in the JSDoc; extra test "fails closed when the spend cannot be read"; Spanish comment on DIS-76 |
| `withDailyBudget` does not check its ceiling | A | `RangeError` for NaN, Infinity, 0, negative; RED seen (1 failed), then green |
| No upper bound in `SUM_COST_SINCE` | D | Rows use the database `now()`; the test that could leave 2100 rows no longer commits |
| Pool test commits rows (cross-file flake) | A | One-connection pool inside a rolled-back transaction; a temporary mutation returning `0` on the pool path still fails it; `project` / `query_log` stay at 0 rows |
| No index on `created_at` | D | Design D6 |
| Price by model name only | D | Zero prices under a ceiling are valid by spec (Ollama) |
| readme present tense | A | `readme.md` §1.4 states the current status (DIS-76 / DIS-74) |
| Spec committed after the code (Question) | process note | Next change commits planning artifacts first |

Re-run after the fixes: see the step 11 report, second addendum.

