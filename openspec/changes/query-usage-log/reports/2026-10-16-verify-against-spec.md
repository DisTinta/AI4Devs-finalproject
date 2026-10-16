# Verify against spec: query-usage-log (DIS-74)

- **Branch:** `feature/DIS-74-query-usage-log`, compared with `feature/entrega-2-CRN` (5 commits, 54 files).
- **Specs checked:** the four delta specs under `openspec/changes/query-usage-log/specs/` (explain, evidence-verification, graph-schema, graph-store).
- **Test status:** I did not re-run any tests, since running them writes caches. Every "green" in the table comes from the step 12 report (`reports/2026-10-16-12-test-and-state-verification.md`): a local run with 1,347 passed and 0 failed. The CI evidence is still pending (task 17.3 is unchecked). *Note added by the main session: the PR's CI run 38892815466 is green with the same totals; see the addendum of the step 12 report.*

**Verdict:** No requirement is missing from the code. Every scenario has a test with the same name, and all are green locally. The gaps are in the tests: 3 requirement sentences are only partly tested, and 7 tests assert less than their scenario says.

## 1. Requirements implemented correctly

All paths below are under `packages/core/src/` unless they start with `packages/adapters` or `tests/`.

**explain → Explain request**
- The U+0000 rule is in `explain/explain-request.ts:44`. Test: `tests/unit/explain/explain.spec.ts:87`.
- The other five scenarios are unchanged and tested at `explain.spec.ts:60-162`.

**explain → Precedence and UNKNOWN answers**
- The row is written before every return (`explain/explain.ts:155-157` and `:166`), after the claim write (`:262`).
- An UNKNOWN answer gets no `usage` (`:156-157`).
- Tests: `explain.spec.ts:185-389` and `tests/unit/explain/explain-verification.spec.ts:142-232`. The exact call order in those tests includes `saveQueryLog`.

**explain → Answer usage**
- The usage shape is in `explain/explain-answer.ts` (the `AnswerUsage` and `GenerationUsage` types).
- Aggregation and savings: `explain/usage.ts:18-23` and `:56-71`. Latency of at least 1 ms: `usage.ts:33-35`.
- The shipped cost table is the default (`explain.ts:127`). The clock is read after validation (`:126`) and before the row (`:155` and `:151`).
- Tests: `explain-verification.spec.ts:753`, `:813`, `:988`, and `tests/unit/explain/usage.spec.ts:21`.

**explain → Query log**
- The row is built in one place (`usage.ts:109-127`).
- The model is wrapped in a usage meter (`explain/usage-meter.ts:46-71`), so a failure midway still leaves a row with the spend so far.
- A rejection writes a row only after a model call resolved, and the original error is kept (`explain.ts:146-154`).
- The verification latency of a rejection row is 0, `null` or the check's own value, as specified (`explain.ts:128`, `:239-241`, `:248`).
- `query_not_logged` is handled at `explain.ts:175-189`, with codes at `explain/explain-event.ts:29`.
- Tests: `explain-verification.spec.ts:833-1228`, and the integration test `tests/integration/explain/explain.spec.ts:223`.

**explain → Answer with typed statements / Persistence failure / Explain events and logging**
- The call limit is `explain/limits.ts:37`, with reason `call-limit` at `explain-event.ts:140`.
- `query_not_logged` is added to the event union (`explain-event.ts:175`) and always comes last (`explain.ts:188`).
- Tests: `explain-verification.spec.ts:252-659` and `:1122`, `explain.spec.ts:472-770`, and `tests/unit/explain/explain-sanitization.spec.ts:363` and `:398`.

**evidence-verification → Semantic citation check**
- The limit check runs after the cache and "stopped" checks (`verify/semantic.ts:89`).
- The clock is read only in live mode (`semantic.ts:69-70`), and latency is floored at 0 (`:117`).
- Tests: `tests/unit/verify/semantic.spec.ts:83-357`.

**graph-schema**
- Migration 0004 is in `packages/adapters/store-postgres/migrations/0004_query-log-verification.{up,down}.sql`.
- Tests: `tests/integration/store/migrations.spec.ts:377` and `:449-518`, and `tests/integration/store/history-claims-constraints.spec.ts:428`.

**graph-store → Query log write**
- Postgres store: `postgres-store.ts:282-310`. The order is id form, then schema, then project inside the write (`rowCount === 0` at `:306`). Database errors become an error with no database text (`:136`).
- The insert statement is in `queries.ts:124`.
- The entry schema is in `knowledge/query-log.ts:52-94`, and `QueryLogWriteFailed` in `knowledge/errors.ts:101`.
- The in-memory test store follows the same order: `tests/support/in-memory-store.ts:313`.
- Tests: `tests/integration/store/query-log-write.spec.ts:111-278`, `tests/unit/store/postgres-query-log-write-errors.spec.ts:58`, and `tests/unit/store/in-memory-store.spec.ts:770`.

**Specific checks**
- **New dependencies:** none. `zod` was already in the manifest (`packages/core/package.json:12`, ^4.6.5), and `package.json` and the lockfile are untouched.
- **Authorisation:** the spec asks for none. The only gate is the project check (malformed or unknown id fails with `ProjectNotFound`), and it is done in both stores.
- **Response fields:** none beyond the spec. `AnswerUsage` has exactly the 10 specified fields, `VerificationUsage` exactly 6, `QueryNotLoggedEvent` only `{type, code}`, and `QueryLogEntry` exactly 14 fields, enforced by a strict schema (`query-log.ts:56`).

## 2. Requirements missing or partial

No behaviour is missing from the code. Three requirement sentences are only partly tested:

1. **"Query log":** *"No row SHALL be written when explain fails before any call resolved: an invalid request, the `ProjectNotFound` of anchoring or of the pack, the `SourceUnavailable` of the pack's read, a failure of the prior-claims read, or the `LlmUnavailable` and `BudgetExhausted` of the `answer` call."*
   - The code handles all of these with one check (`explain.ts:150`).
   - The test (`explain-verification.spec.ts:1032`) covers only the invalid request, `ProjectNotFound` and `BudgetExhausted`.
   - The tests that reach the other cases (`explain.spec.ts:253`, `:322`, `:338`) never check that no row was written (`saveQueryLog` received 0 calls).
2. **"Query log", rejection rows "priced as in requirement 'Answer usage'":** every test that produces a row on a rejection uses an unpriced model, so the cost is always 0 (`explain-verification.spec.ts:172`, `:210`, `:893`, `:1057`). The pricing path is shared with the priced UNKNOWN-row test (`:833`), so the risk is low, but this sentence is untested.
3. **"Query log":** *"an unpaired UTF-16 surrogate is stored as U+FFFD"*. No test. The behaviour depends on how the `pg` driver encodes UTF-8.

## 3. Unspecified behaviour

None of these change behaviour at the spec's interfaces. Each still needs a decision: remove it, or add it to the spec.

| # | What | Where | Recommended destination |
|---|---|---|---|
| U1 | New public exports from `@codemind/core`: `savingsPct`, `latencyMs`, `aggregateUsage`, `queryLogEntry`, `meterLlm` and 5 types. Only the design (U6) mentions them; the spec doesn't. | `explain/index.ts:13-14` | Add a line to the explain spec, or mark them internal and move their unit tests to relative imports. |
| U2 | New optional `onSemanticStart` callback on the exported `verifyAnswer`. It is the mechanism behind "none when raised inside the check" (design U15). | `verify/verify-answer.ts:36`, `:100` | Record it as internal plumbing in design Follow-ups, or spec it. |
| U3 | `.gitleaksignore` suppression for commit `21df2e1` (`tests/unit/knowledge/query-log.spec.ts:14`). Neither the spec nor the design mentions it. | `.gitleaksignore:15-17` | Keep it, and record it in design Follow-ups. |

Block 3 is short because the scope was pinned down in detail beforehand (the design's U1–U15 decisions). The extra code I found is plumbing or tooling, not behaviour.

## 4. Tests weaker than their scenario

| Test | Scenario says | Test asserts |
|---|---|---|
| `explain-verification.spec.ts:847` | "exactly the UNKNOWN answer … without `usage`" | Only a partial match plus "no `usage`". Events and any extra properties are not checked. |
| `explain-verification.spec.ts:956-961` | Each answer has "its fields unchanged" | Only `events` is compared with the reference answer, not statements, evidence, usage or confidence. |
| `explain-verification.spec.ts:228-229` | Row with "the tokens and cost of the `answer` call" | Partial match with an unpriced model (cost is trivially 0). It also never checks that the verification latency is `null`. |
| `explain-verification.spec.ts:1184` | Verification latency equals `usage.verification.latencyMs` | Under a fixed clock both are 0, so writing a constant 0 would pass. |
| `explain-verification.spec.ts:1137-1138` | The last statement is cited "although its span is an `anchor` span" | Never checks that E21 is an anchor span. |
| `explain-verification.spec.ts:988` | The shipped cost table gives 0 | Can't tell "shipped table" from "no table", because an unpriced model also costs 0 (`llm/cost-table.ts:38`). This weakness comes from the scenario itself. |
| `explain.spec.ts:82` | "no call was sent to the store" | Partial match that leaves out `saveQueryLog`. The case is covered at `explain-verification.spec.ts:1054`. |

## Scenario → test → state

Abbreviations:
- **EX** = `tests/unit/explain/explain.spec.ts`
- **EV** = `tests/unit/explain/explain-verification.spec.ts`
- **ES** = `tests/unit/explain/explain-sanitization.spec.ts`
- **US** = `tests/unit/explain/usage.spec.ts`
- **IEX** = `tests/integration/explain/explain.spec.ts`
- **SEM** = `tests/unit/verify/semantic.spec.ts`
- **MIG** = `tests/integration/store/migrations.spec.ts`
- **HCC** = `tests/integration/store/history-claims-constraints.spec.ts`
- **QLW** = `tests/integration/store/query-log-write.spec.ts`
- **PQE** = `tests/unit/store/postgres-query-log-write-errors.spec.ts`
- **IMS** = `tests/unit/store/in-memory-store.spec.ts`

State: every row is green according to the local step 12 run; I did not re-run them. "(weak)" marks a test listed in block 4.

| Scenario | Test | State |
|---|---|---|
| Empty, blank or missing question rejected | EX:60 | green |
| Malformed request rejected | EX:106 | green |
| Length limit bound | EX:129 | green |
| Length in code points | EX:147 | green |
| Invalid budget/hops/root | EX:162 | green |
| U+0000 question rejected | EX:87 | green |
| No anchor, both modes | EX:185 | green |
| Evaluation → llm-required | EX:208 | green |
| Over budget | EX:232 | green |
| Discarded model output | EX:272 | green |
| Output without statements | EX:307 | green |
| Failing prior-claims read | EX:322 | green |
| Unknown or unindexed project | EX:253 | green |
| Model failures propagate | EX:338 | green |
| Every citation broken | EV:142 | green |
| Verification read failure | EV:172 | green |
| No verification read without statements | EV:192 | green |
| Question anchored once | EX:389 | green |
| Verifier failure propagates | EV:210 | green (weak) |
| Unknown has no confidence | EV:232 | green |
| Answer typed, stored, returned | IEX:141 | green |
| Fact stored as inferred claim | IEX:172 | green |
| Evidence lists every citation | EX:511 | green |
| Re-index → stale | EX:574 | green |
| Cited spans in one read | EV:252 | green |
| Broken citation neither stored nor shown | EV:280 | green |
| Subject = first cited span | EX:472 | green |
| Supported citations entailed | EV:321 | green |
| Irrelevant citation cited | EV:357 | green |
| Cached pair not re-verified | EV:383 | green |
| Invalid verifier output → cited | EV:411 | green |
| Unavailable verifier degrades | EV:434 | green |
| Answer carries confidence | EV:488 | green |
| Confidence follows verdicts | EV:521 | green |
| Past the verify call limit stay inferences | EV:1122 | green (weak) |
| Failed write answers unsaved | EX:644 | green |
| Failed write over the database | IEX:305 | green |
| Unsaved keeps only verified citations | EV:548 | green |
| Other write errors propagate | EX:672 | green |
| Unsaved carries verification and usage | EV:576 | green |
| Nothing written to console | EX:770 | green |
| Sanitisation events first | ES:363 | green |
| No sanitisation event without a prompt | ES:398 | green |
| Evidence-broken events, no content | EV:610 | green |
| Entailment-unverified events, no content | EV:659 | green |
| Total, generation and verification usage | EV:753 | green |
| Shipped cost table → zero | EV:988 | green (weak) |
| Savings follow baseline | US:21 | green |
| Latency at least 1 ms | EV:813 | green |
| One row the daily spend sees | IEX:223 | green |
| Unknown after model call → row | EV:833 | green (weak) |
| Unknown without model call → zero row | EV:859 | green |
| No row before a call resolves | EV:1032 | green (partial, see block 2) |
| Failure after calls → row, error kept | EV:893 | green |
| Verifier failure → row with resolved calls | EV:1057 | green |
| Failed query log write still answers | EV:940 | green (weak) |
| Unknown project → not logged | EV:1089 | green |
| Other query log errors propagate | EV:1107 | green |
| Row without cited statements | EV:1150 | green |
| Row from cache counts no call | EV:1170 | green (weak) |
| Row at call limit | EV:1187 | green |
| Evaluation records no verification | EV:1198 | green |
| Unavailable verifier midway | EV:1210 | green |
| Each distinct pair once in order | SEM:83 | green |
| Verifier receives only wrapped text | SEM:123 | green |
| Only a conforming output entails | SEM:174 | green |
| Unavailable verifier degrades remaining pairs | SEM:213 | green |
| Other verifier failures propagate | SEM:243 | green |
| Evaluation mode verifies nothing | SEM:254 | green |
| Usage counts only resolved calls | SEM:271 | green |
| Verification latency = wall time | SEM:289 | green |
| At most the call limit | SEM:314 | green |
| Cached pair outside the limit | SEM:330 | green |
| Failed verifier keeps reason past limit | SEM:357 | green |
| Roll back only the latest migration | MIG:449 | green |
| Roll back the L1 migration | MIG:479 | green |
| Roll back both migrations | MIG:496 | green |
| Roll back every migration | MIG:518 | green |
| Column contract | MIG:377 | green |
| Defaults on minimal rows | HCC:428 | green |
| Entry written as one row | QLW:111 | green |
| Invalid entries rejected | QLW:165 | green |
| Unknown project writes nothing | QLW:204 | green |
| Failed write does not leak | QLW:220 | green |
| Failed rollback → write failure | PQE:58 | green |
| Own connections commit | QLW:253 | green |
| No connection → pool's own error | QLW:278 | green |
| In-memory test store checks, keeps, fails | IMS:770 | green |

No scenario is red or absent. As this skill requires, I didn't fix anything.

_Run by the `verify-against-spec` skill in a read-only fork; the main session saved the report. The
CI evidence it calls pending is now in: PR #44 run 38892815466 is green with the same totals (addendum
of the step 12 report)._

## Addendum — re-run after the 17.4 fixes (2026-10-16)

The skill was re-run in a read-only fork on the uncommitted tree after the 17.4 fixes (spec "Query log"
now absorbs `InvalidStoreQuery` as `invalid-entry`; tests strengthened). Its verdict: the code matches
the revised requirement; every partial and weak item of this report is fixed except "Shipped cost
table → zero", which comes from the scenario itself. It marked the changed tests "unverified" only
because it runs no tests; the main session's full run covers them (below).

Its new items and how they were resolved, in the same change:

| Item | Resolution |
|---|---|
| 2.1 — no explain-level case of a cost past `numeric(10,6)` | "An out-of-range query log entry still answers and says so" runs twice: tokens past `integer`, then a cost of 10 000 000 USD; the scenario text says so |
| 2.2 — `QUERY_NOT_LOGGED_CODES` not pinned by a test | `explain.spec.ts`: "exports the closed set of query_not_logged codes" |
| 2.3 — the new scenario's "the answer is the stored answer" checked only partly | Each run's answer is compared, ids and usage aside, with the same run whose row is written |
| U4 — `invalid-entry` absorbs every `InvalidStoreQuery`, not only range overflows | Spec reworded: the cause is "the entry fails the store's record schema, for example …" |
| U5 — the unrecorded spend of an `invalid-entry` call was not stated | Spec: "In each of these cases the call's spend is not recorded, so the daily spend does not see it" |

Run of this tree (main session): `npx vitest run` 105 files, 1 351 passed, 0 failed; `lint`,
`typecheck`, `lint:architecture` (3 pre-existing `no-orphans` warnings), `docs:coverage` exit 0;
`openspec validate query-usage-log` valid. Every scenario of the four delta specs maps to a passing test.
