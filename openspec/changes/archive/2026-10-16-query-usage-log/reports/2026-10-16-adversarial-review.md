# Adversarial review — query-usage-log (DIS-74)

- Date: 2026-10-16
- Run by the `adversarial-review` skill in a read-only fork; the main session saved its report.

**Scope:** `feature/DIS-74-query-usage-log` compared with `feature/entrega-2-CRN`: 5 commits and 54 files. The reviewer read the whole production diff: migration 0004, the Postgres store and queries, `explain.ts`, `usage.ts`, `usage-meter.ts`, `query-log.ts`, `semantic.ts`, `verify-answer.ts`, `StorePort`, the errors and the events. It also read the four delta specs (the full "Answer usage" and "Query log" requirements), the design (U8, U9, Risks), `tasks.md` (committed and uncommitted), the four existing reports, `packages/cli/src/commands/ask.ts`, and the token schemas of the LLM adapter, plus the diff of every pre-existing test that changed. It did not re-run any tests; it relied on CI run 38892815466 as the step 12 addendum records it.

## Findings

| # | Severity | File:line | Finding | Why it matters |
|---|---|---|---|---|
| F1 | Minor | `design.md:188`, `packages/core/src/knowledge/query-log.ts:48-53`, `packages/adapters/llm/src/response-schemas.ts:4`, `packages/core/src/explain/explain.ts:166,175-182` | Design U9 lets `InvalidStoreQuery` from the row write propagate because "explain builds a valid entry". Explain can't guarantee that. The adapter accepts any non-negative integer token count with no upper bound (`z.number().int().nonnegative()`). The entry schema caps counts at `INTEGER_MAX` and cost at `9_999.999999`. If an endpoint reports `prompt_tokens` ≥ 2³¹, or a cost above the cap, `saveRow` rethrows `InvalidStoreQuery`. By then `saveClaims` has already committed and the model calls have been paid. | A misbehaving or hostile OpenAI-compatible endpoint gets claims stored, no `query_log` row, and the spend never reaches the daily ceiling. That breaks D1. The CLI then reports `INTERNAL` for an answer that was actually persisted. Unlikely in practice, but the design's stated premise is false at the adapter boundary. |
| F2 | Minor | `packages/adapters/store-postgres/src/postgres-store.ts:86`, `packages/core/src/explain/explain.ts:181` | On the pool path, `connection.pool.connect()` sits outside the `try` that maps errors to `QueryLogWriteFailed`. A connection failure at the final row write reaches `saveRow` as a raw `pg` error, and explain rejects even though the claims are committed. The spec allows this ("Other query log write errors propagate"; StorePort says connection-acquisition failure "propagates unchanged"). | Same symptom as F1, and more realistic: the call the ceiling can't see is exactly the one where the database was flaky. No scenario describes "answered, claims stored, explain rejected". |
| F3 | Minor | `design.md:293` | Under Risks, the design promises "a unit test asserts that the meter's verification bucket equals the check's tokens and cost on an answered path". No such test exists. Answered rows take verification from the check; rejection rows take it from the meter. | The two counts can drift apart silently. The mitigation the design claims is not in the code. |
| Q4 | Question | `docs/project-context.md:436`, `design.md:282` | The overshoot is documented as "one `ask` in flight". N concurrent `ask` processes each pass `sumCostSince` and overshoot by up to N × 21 calls. | The docs understate the bound: say "per concurrent `ask`". |
| Q5 | Question | git history `21df2e1`, `fe78460`, `99f62ae` | The specs, design and tasks were first committed in `99f62ae`, 8 s after the code. Git can't show the spec came first. The spec-audit report suggests the order was right, but the record is the agent's own report. | Process debt: commit the change folder at `/opsx:propose` time in future changes. |

Already reported in `2026-10-16-verify-against-spec.md`, confirmed still applicable and not repeated: 3 requirement sentences only partly tested; 7 tests weaker than their scenario; U1–U3 (new public exports, `onSemanticStart`, the `.gitleaksignore` entry).

## Checked and found sound

- **Hostile input at the entry points:** U+0000 rejected at the request; blank, malformed and unknown project ids give `ProjectNotFound` before any statement or zero rows inside the write (`INSERT … SELECT … WHERE p.id = $1`); a project deleted mid-call becomes `project-not-found`; the same question twice writes two rows (intended). Call-limit boundary: 21 pairs → exactly 20 requests (a `sent > MAX` mutation fails it); a cached pair doesn't count; failed calls set `stopped` before the limit check, so `calls ≤ sent ≤ calls + 1`. `verifyCostUsd ≤ costUsd` holds under rounding.
- **Rejection path:** the row write is swallowed and the original error propagates; no row when no call resolved; the meter wraps the model outside `withDailyBudget` (asserted by the integration test).
- **Blast radius:** only `ask.ts` consumes `explain`; it doesn't print `usage` and logs `query_not_logged` at `info` (design U9). `sumCostSince` / `withDailyBudget` now see explain's spend. The only production `StorePort` is Postgres. The provenance instant moved to t₀ (covered). The migration is additive and nullable; the down migration is tested. The pool-based `ask` integration test deletes its project.
- **Changed pre-existing tests:** none loosened; `history-claims-constraints` and the rollback assertions became stronger; `migrateUpTo` setup justified by the modified requirement.
- **Most important test:** IEX "An answer leaves one query log row the daily spend sees" asserts the exact row and that the next budgeted call sends 0 requests.

## Verdict

**PASS WITH GAPS.** No Blocker or Major; the evidence (CI green, mutation 95.96, exact-row integration test) is sufficient. The three Minors and the open items of verify-against-spec need destinations before archiving.

## Recommended next steps (as given)

1. F1: A (validate or clamp in `queryLogEntry`, or absorb `InvalidStoreQuery` as a new `query_not_logged` code through `/opsx:update`, TDD), or D (record the premise in design U9).
2. F2: D (non-goal: a connection failure of the final row write rejects after the claims are stored), or A together with F1.
3. F3: A — add the meter/check consistency test.
4. Q4: D — reword to "per concurrent `ask` in flight".
5. Q5: note it in the step 12 report addendum.
6. verify-against-spec items: fix as A where cheap; U3 to design Follow-ups as D.
7. Fill design.md → Follow-ups (task 17.4); re-run `/verify-against-spec` if a spec delta changes; commit `tasks.md` and the reports to PR #44 before archiving.

## Resolution (17.4, 2026-10-16)

Every finding has a destination in `design.md` → Follow-ups; none was left open and no Linear issue was
needed.

- **F1 → A.** Author decision ("Absorber como evento"): spec "Query log" absorbs `InvalidStoreQuery` of
  the row write as `query_not_logged` / `invalid-entry` and states that the call's spend is not
  recorded. TDD: "An out-of-range query log entry still answers and says so" (RED seen: the call
  rejected with `InvalidStoreQuery`), tokens and cost overflow; "Other query log write errors
  propagate" now uses a `TypeError` and checks the claims were stored.
- **F2 → D.** Author decision ("Documentar"): proposal Non-goals, spec "Query log" and design U9.
- **F3 → A.** `usage-meter.spec.ts`: the meter's verification and `verifyCalls()` equal the semantic
  check's usage over an accepted, an invalid and a failed call.
- **Q4 → A.** "Per `ask` in flight; N concurrent runs N times" in the design Risks, proposal Non-goals,
  `docs/project-context.md` and the readme `DAILY_BUDGET_USD` row.
- **Q5 → D.** Process note in the step 12 report addendum.
- The items of verify-against-spec it confirmed were fixed as recorded there.

Re-verification: `/verify-against-spec` re-run (addendum of its report); full suite 1 351 passed;
Stryker on `explain.ts` 96.73 and `usage-meter.ts` 100 (the 5 survivors of `explain.ts` are the
equivalents listed in the step 12 report). No Blocker or Major was found, so no re-run of this review is
required by task 17.5.
