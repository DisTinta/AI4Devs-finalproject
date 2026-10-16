# Spec audit — query-usage-log (DIS-74)

- Date: 2026-10-16
- Auditor: `spec-auditor` subagent (read-only); report written by the main session
- Ticket: DIS-74 (parent DIS-57)

## Verdict (run 1): CHANGES REQUIRED

## Questions for the author (product and scope decisions; not resolved by the auditor)

- **Q1 (D9, store side).** Sub-issue AC 4b says `saveQueryLog` with a malformed `projectId` throws
  `InvalidStoreQuery`; the proposal changes it to `ProjectNotFound`, matching the project's contract
  (`StorePort.ts:17-18`, `:114`; `postgres-store.ts:190,237,248`; `in-memory-store.ts:299,323`: every
  project-scoped store method reports a malformed id as `ProjectNotFound`). Recommended: accept D9 and
  record it on DIS-74. It contradicts an AC, so the author must approve it.
- **Q2 (D9, explain side).** A `no-anchor` answer for an unknown or malformed project returns `UNKNOWN`
  plus `query_not_logged`/`project-not-found`. Alternative: let the row write's `ProjectNotFound`
  propagate (consistent with a question that has search terms; DIS-78 maps it to `PROJECT_NOT_FOUND`).
  D9 changes existing behaviour the least; the alternative is more consistent. Either way
  `project-not-found` is beyond the ticket, which only names `store-write-failed`.
- **Q3 (D10).** Rejecting a question holding U+0000 is not in the ticket; it follows from D3 (PostgreSQL
  `text` cannot store NUL, and every return now writes the question). Recommended: accept. It changes
  `explain`'s request contract, which DIS-78 will expose.
- **Q4 (provenance instant).** A claim's provenance instant becomes the start of `explain` instead of the
  moment the claims are built (minutes earlier on Ollama CPU). Not asked by the ticket; side effect of
  "read the clock exactly twice". Acceptable, or a third clock read for the provenance?
- **Q5 (parent DIS-57 vs sub-issue).** Parent AC 3: "la respuesta **y el CLI** indican que
  `baselineTokens` es una estimación local"; DIS-74 lists showing usage in the CLI as a non-goal. Parent
  AC 5 requires `latency_ms > 0`; D8 allows 0 (a `no-anchor` call can really take 0 ms). Does the
  sub-issue override the parent on both points?

## 1. Scope against the ticket

Everything traces to DIS-74 except: D9 (`project-not-found` and absorbing `ProjectNotFound` on a return,
Q2); D10 (U+0000 in `explainRequestSchema` and in the record schema, Q3); moving the provenance instant
(Q4). Rows for `over-budget` are fine: the ticket's D1 says "los cinco `UNKNOWN`" but there are six
reasons and the spec covers all six; the ticket text needs fixing. Nothing widens into DIS-72.
**Improvable.**

## 2. Inherited acceptance criteria

AC 1, 2, 3a–c, 4a covered. **AC 4b contradicted (Q1) — blocking until ruled.** AC 5 covered at the
semantic level; the explain-level part is unreachable as written (B2). Parent AC 3 (CLI) and AC 5
(`latency_ms > 0`) disagree with the sub-issue (Q5).

## 3. Missing scenarios (Improvable)

- The verification-read failure path writes a row; no scenario asserts it, and the old scenario "A
  verification read failure propagates without writing" now reads the opposite way (I1).
- Nothing pins `stopped` before `call-limit`: add a scenario where the call that reaches the limit fails
  with `LlmUnavailable`.
- "Query log write": a failed rollback → `QueryLogWriteFailed`, and a failing `SAVEPOINT` propagates;
  task 3.4 adds them only conditionally.
- "A row of an unknown project is not logged" tries only a well-formed UUID; add `not-a-uuid`.

## 4. Ambiguity (Improvable)

- `design.md:36` "robust to an error at any step" → "that keeps the tokens and cost of every call that
  resolved before an error raised at any step".
- explain "a pack with enough spans" → "a pack of at least `MAX_VERIFY_CALLS_PER_ANSWER` + 1 spans".
- explain "a daily budget whose ceiling is below that cost" → "at most the cost since the start of the
  current UTC day" (`withDailyBudget` trips at `spent >= ceiling`, `budget.ts:51`).
- graph-store "(it may quote the question)" → "(the database error's message, `detail`, `hint` or
  `where` may quote the question)".

## 5. Open decisions (Improvable)

- `savingsPct` can be `-0` (`Math.round(-0.5)`); pin "a result of −0 is 0".
- The spec reads the clock twice on a rejection that writes a row, but design U7 step 3 never reads the
  second instant in the `catch`.
- U12: the `now` list in `explain-doubles.ts` has no rule when exhausted; pin "the last instant repeats".
- "No row when explain fails before a model call resolves" does not say which question the second and
  third calls use; with a no-search-terms question D9 makes it a `no-anchor` return. Say "the price
  question".
- The unit scenario needs a pack with `baselineTokens` 40 000 = `ceil(code points / 4)` of whole files:
  a cited file of exactly 160 000 code points. Say so in U12.

## 6. Contradictions inside the change

- **B1, blocking.** "Citations that support their statement are entailed and facts" still asserts `usage`
  is exactly `{ verification: {…} }`, contradicting "Answer usage" (here generation is 1 000/200).
- **B2, blocking.** "Statements past the verify call limit stay inferences" needs 21 statements;
  `MAX_STATEMENTS` is 20 (`limits.ts:18`) and the quarantine rejects more (`statement-schema.ts:39`), so
  the answer would be `UNKNOWN` `invalid-model-output`. Rewrite with 20 statements and 21 pairs.
- **B3, blocking.** The spec and U7 step 4 build an answered row from the answer's `usage` (verification
  from the semantic check); design Risks says "the row always comes from the meter". Align them.
- **I1, improvable.** "A verification read failure propagates without writing" and "A verifier failure
  other than unavailable or budget propagates without writing" now contradict their requirement (both
  write a row). Rename "…without writing claims", tests with them.
- **I2, improvable.** "No row … `ProjectNotFound`, `SourceUnavailable`": both also occur after the model
  (`SourceUnavailable` `too-large` of the verification reads, `ProjectNotFound` of the claim write), and
  those write a row. Qualify the list.

## 7. Contradictions with the project (Improvable)

- graph-schema "Roll back the latest migration" says a rollback removes "every table, enum type, index,
  trigger and function"; `0004` creates columns only. Add "column".
- `docs/project-context.md:815-818`: `db:seed`/`make up` deletes by `CASCADE` the sample projects'
  `query_log` rows, so re-seeding resets that day's recorded spend. Document it (15.1, 15.2).
- graph-store "A query log entry is written as one row" expects an exact sum since a fixed date; the
  shared test database can hold committed rows. Make it relative to the cost read before.

No ADR conflicts.

## 8. Contrast with the real code

- Correct: `explain.ts:104,118`, `verify-answer.ts:89`, `semantic.ts:54`, loop order cache → `stopped` →
  call (`semantic.ts:64-82`), `verify/` already imports `explain/limits.ts`, rounding matches.
- U3: the wrapper is `atomically` (`postgres-store.ts:76`), already generic; only `toClaimWriteError`
  (`:123`) is claim-specific. Say `atomically(connection, work, toQueryLogWriteError)` with a new mapper
  that returns domain errors unchanged and maps any other error to `QueryLogWriteFailed`.
- U5 meter: sound; the only way to keep the usage of resolved `verify` calls before a propagated error.
  Fine once B3 is resolved.
- U11 ordering: correct. Do not split the cap across statements: going head-first maximises fully
  verified statements.
- D3 "tal cual": a lone UTF-16 surrogate is stored as U+FFFD (node-postgres encodes UTF-8). State the
  exception or test only well-formed strings.
- `tests/unit/knowledge/errors.spec.ts:42-49` tests `ClaimWriteFailed`; task 2.1 adds no matching test
  for `QueryLogWriteFailed`.

## 9. Task size (Improvable)

- 7.4 rewires all of `explain.ts` in one GREEN: split into (a) meter, `costTable`, answered usage;
  (b) rows on `UNKNOWN` returns; (c) rejection row and absorbed write failures.
- 7.5 holds ten scenarios: split 7.5a (rows, 4), 7.5b (failures, 5), 7.5c (call limit, 1).

## 10. Mandatory steps

All present with labels (0, 9, 12, 13, 14, 15, 17). Improvable: 13 should add an unknown project name
(`PROJECT_NOT_FOUND`, no new row); 12.4 should mutate `explain/explain.ts` and `verify/semantic.ts` too.

## 11. Traceability

Every scenario maps to a task; two map to scenarios whose text was wrong (B1, B2). Numbers checked:
0.0141 + 0.0024 = 0.0165 USD; `savingsPct` 90, 0, −25, 88.3; rows 300/30 (200/20 verify) and 200/20
(100/10 verify).

## Corrections to apply (as given by the auditor)

1. B1: "Citations that support…" last AND → `usage.verification` `{ calls: 3, cacheHits: 0, inputTokens:
   300, outputTokens: 15, costUsd: 0 }` and `usage.generation` `{ inputTokens: 1000, outputTokens: 200,
   costUsd: 0 }`.
2. B2: rewrite the GIVEN with `MAX_STATEMENTS` statements and `MAX_VERIFY_CALLS_PER_ANSWER` + 1 pairs
   (first statement cites two spans, last cites only an `anchor` span); state the reliance on
   `MAX_STATEMENTS` = `MAX_VERIFY_CALLS_PER_ANSWER`.
3. I1: rename the two scenarios "…without writing claims"; add to the first an AND on the row with the
   `answer` call's tokens and cost.
4. I2: qualify the no-row list.
5. `savingsPct`: "a result of −0 is 0".
6. "No row…": say "the price question".
7. "A row of an unknown project…": add `not-a-uuid`.
8. Budget ceiling wording: "at most the cost since the start of the current UTC day".
9. (Covered by 3.)
10. Precedence: "SHALL send its `query_log` row to the store".
11. If Q2 = propagate, rewrite the D9 sentences.
12. evidence-verification: scenario "A failed verifier keeps its reason past the call limit".
13. graph-schema: add "column" to the rollback requirement.
14. graph-store: "(the database error's message, `detail`, `hint` or `where` may quote the question)".
15. graph-store: relative cost check in "A query log entry is written as one row".
16. graph-store: scenario "A failed rollback of the query log write is a write failure"; task 3.4
    unconditional.
17. design Goals wording.
18. B3: design Risks bullet aligned with the spec.
19. U3: `atomically` + `toQueryLogWriteError`.
20. U7 step 3: second clock read in the `catch`.
21. U12: `now` list repeats its last instant; 160 000 code-point file for the 40 000 baseline.
22. Lone-surrogate exception to "tal cual" (U9 or new U14).
23. Task 2.1: `QueryLogWriteFailed` in `errors.spec.ts`.
24. Split 7.4 and 7.5.
25. 9.2a names "Citations that support…"; add 9.2f (renames of I1).
26. 12.4: mutate `explain.ts` and `semantic.ts` too.
27. 13.3: `ask no-such-project` → exit 1, `PROJECT_NOT_FOUND`, no new row.
28. 15.1, 15.2: re-seeding deletes the sample projects' `query_log` rows and resets that day's spend.
29. proposal: author rulings on D9/D10 and the provenance decision (Q4).
30. Linear comment on DIS-74 in Spanish with the `[enhanced]` adjustments (six `UNKNOWN` reasons, AC 4b,
    AC 5 with 20 statements / 21 pairs, D9, D10, provenance, differences with DIS-57).

## Resolution of run 1 (2026-10-16)

Author rulings (AskUserQuestion, 2026-10-16):

- Q1 + Q2 → "ProjectNotFound + evento": `saveQueryLog` rejects a malformed or unknown id with
  `ProjectNotFound`; `explain` absorbs it on a return as `query_not_logged` `project-not-found` (D9 kept).
- Q3 → "Sí, rechazar": D10 kept.
- Q4 → "Aceptar inicio de explain": provenance instant = first clock read; added to the proposal.
- Q5 → "latency_ms ≥ 1": the CLI stays out of scope; `latencyMs` is at least 1 ms (D8 changed; spec
  "Answer usage", new scenario "The latency is at least one millisecond"; design U6).

Per correction:

| # | Resolution |
|---|---|
| 1 (B1) | Fixed: `usage.verification` and `usage.generation` in "Citations that support…". |
| 2 (B2) | Fixed: `MAX_STATEMENTS` statements, `MAX_VERIFY_CALLS_PER_ANSWER` + 1 pairs, reliance stated. |
| 3 (I1) | Partly rejected: `openspec validate --strict` refuses renaming scenarios inside a MODIFIED requirement (archive cannot drop them). Titles kept; "A verification read failure propagates without writing" gains an AND stating that no claim is written and one query log row is. Tasks 7.5b, 9.2f updated. |
| 4 (I2) | Fixed: the no-row list is qualified. |
| 5 | Fixed: −0 is 0 (spec, U6, savings scenario case 40 020 / 40 000). |
| 6 | Fixed: "the price question". |
| 7 | Fixed: `not-a-uuid` added. |
| 8 | Fixed: ceiling "at most the cost since the start of the current UTC day". |
| 9 | Covered by 3. |
| 10 | Fixed: "send its `query_log` row to the store". |
| 11 | Not applicable (Q2 kept D9). |
| 12 | Fixed: scenario "A failed verifier keeps its reason past the call limit"; task 5.3. |
| 13 | Fixed: "column" added to the rollback requirement. |
| 14 | Fixed. |
| 15 | Fixed: relative cost check. |
| 16 | Fixed: scenario "A failed rollback of the query log write is a write failure"; task 3.5 (unconditional, with the `SAVEPOINT` case). |
| 17 | Fixed. |
| 18 (B3) | Fixed: design Risks aligned with the spec and U7. |
| 19 | Fixed: U3 names `atomically` + `toQueryLogWriteError`. |
| 20 | Fixed: second clock read in the `catch` (U7). |
| 21 | Fixed: U12 (`now` list repeats its last instant; 160 000 code points for the 40 000 baseline). |
| 22 | Fixed: new design U13 and a sentence in spec "Query log" (unpaired surrogate → U+FFFD); "No ADR" renumbered U14. |
| 23 | Fixed: task 2.1. |
| 24 | Fixed: 7.4a–c, 7.5a–c. |
| 25 | Fixed: 9.2a names the scenario; 9.2f records the kept titles. |
| 26 | Fixed: task 12.4 mutates `explain.ts` and `semantic.ts`. |
| 27 | Fixed: task 13.3 `ask no-such-project`. |
| 28 | Fixed: tasks 15.1 and 15.2. |
| 29 | Fixed: proposal D8, D9/D10 approval, provenance item. |
| 30 | Done: Spanish comment on DIS-74 (2026-10-16), `[original]` untouched; includes the rulings. |

## Verdict (run 2, 2026-10-16): APPROVED

Every run 1 correction applied as stated (correction 3 rejected for the stated `openspec validate`
reason); the author's rulings are reflected consistently in proposal, design, specs and tasks. No
question needs an author decision. Seven improvable findings, no blocker:

- F1: task 7.1 lacked the U12 rule that the `now` list repeats its last instant.
- F2: "A verifier failure other than unavailable or budget propagates without writing" lacked the AND
  clarifying that a query log row is written.
- F3: proposal still labelled D4–D8 "open to the spec audit" and D9/D10 "(default)".
- F4: proposal's D1 quotation says "los cinco `UNKNOWN`" without pointing to the six-reason correction.
- F5: "A row of an unknown project is not logged" named no question.
- F6: "Answer usage" and "Persistence failure" said "writes" / "is written" where a failed write still
  counts; should be "sends to the store".
- F7: proposal What Changes said "reads the clock on entry"; spec and design say after validation.

## Resolution of run 2 (2026-10-16)

| Finding | Resolution |
|---|---|
| F1 | Fixed: task 7.1 copies the U12 wording. |
| F2 | Fixed: the AND added to the scenario; tasks 7.5b and 9.2f cover both scenarios. |
| F3 | Fixed: proposal intro sentence and the D9/D10 labels ("approved, 2026-10-16"). |
| F4 | Fixed: note after the D1 quotation pointing to the DIS-74 comment. |
| F5 | Fixed: the question `¿y si no?` (every token shorter than `MIN_TOKEN_LENGTH` = 3, `anchor.ts:10,63`). |
| F6 | Fixed: "sends a `query_log` row to the store" / "is sent to the store". |
| F7 | Fixed: "reads the clock once after the request is validated and once before the row"; provenance "that first clock read". |

Wording-only fixes after an APPROVED verdict; no re-run needed.

## Scope update D11 (2026-10-16, `/opsx:update`)

After the Entrega 1 review (LIDR, 2026-10-14, "Próximos pasos" point 3) the author added D11: nullable
`query_log.verify_latency_ms` and `verify_calls` (folded into `0004`), `VerificationUsage.latencyMs`
measured by the semantic check with explain's clock, persisted on returns and rejections, exposed in
`usage.verification`. Author-approved choices: `verify_calls` = `VerificationUsage.calls` (resolved
calls; a failed call's time counts in the latency); the check measures its own latency. Non-goal:
parallel or selective verification.

## Verdict (run 3, 2026-10-16): CHANGES REQUIRED

No product question. Blocking:

- B1: design U3 `INSERT_QUERY_LOG` listed 12 columns, without `verify_calls` and `verify_latency_ms`.
- B2: `VerifyAnswerDependencies.now` optional or required was unstated; existing exact-usage tests
  (`semantic.spec.ts:214`, `verify-answer.spec.ts:63,86,214,229`) break or turn timing-dependent once
  `latencyMs` exists, and task 5.5 claimed to re-run them unchanged.
- B3: the rejection-row latency cases "0 before the check" and "the check's latency" had no
  distinguishing scenario (default fixed clock gives 0 for both).

Improvable: D11 not recorded on DIS-74; one clock per run in the AC 1 scenario; design "D1–D10", U15
position, Migration Plan "three columns"; proposal Capabilities missing D11; "Answer usage" clause on a
check that did not run (unreachable for an answered answer) and "reads it twice more" (once on an
error inside the check); U12 without the D11 tests; 7.7 / 15.2 clock wording and the
`ExplainDependencies.now` TSDoc; 13.2 `verify_latency_ms ≤ latency_ms` only holds with a monotonic
clock.

## Resolution of run 3

| Finding | Resolution |
|---|---|
| B1 | Fixed: U3 SQL with 14 columns / parameters. |
| B2 | Fixed: U15 states `now` (default system clock) and `onSemanticStart` optional; new task 5.4b updates the four existing assertions with a fixed clock; 5.5 excludes them. |
| B3 | Fixed: "A failure after the model calls…" has a clock t₀, +100, +400, +500 → verification latency 300, latency 500; "A verification read failure propagates without writing" asserts 0 calls and latency 0; task 7.5d names both and the `onSemanticStart` forwarding. |
| D11 on Linear | Done: Spanish comment on DIS-74 (2026-10-16). |
| One clock per run | Fixed in the AC 1 scenario and "A failure after the model calls…"; U12 rule. |
| Design labels | Fixed: D1–D11, U15 moved after U14, "five `verify_*` columns". |
| Proposal Capabilities | Fixed: D11 in `explain` and `evidence-verification`. |
| "Answer usage" wording | Fixed: unreachable clause removed; "once when it starts and once when it returns". |
| U12 D11 tests | Fixed. |
| 7.7 / 15.2 | Fixed (clock wording, `ExplainDependencies.now` TSDoc, `verify_calls` gotcha). |
| 13.2 inequality | Fixed: stated as an observation under a monotonic clock, not a spec rule. |

## Verdict (run 4, 2026-10-16): APPROVED

Every run 3 resolution applied as stated; D11 coherent across proposal, design, the four delta specs
and tasks; MODIFIED blocks match the main specs except the intended edits; numbers and clock reads
consistent (4 reads on an answered path, 3 on an error inside the check, 2 without a check, 0 in
evaluation mode). No author question. Six improvable findings:

- I1: tasks 7.3/7.4a, 7.4c and 7.5b could not turn green, because the forwarding of `now`,
  `onSemanticStart`, the meter's `verify` count and the rejection state were only wired in 7.5d.
- I2: task 1.1 said "the three columns gone"; five.
- I3: design U6/U7 silent on where an `UNKNOWN` row's `verifyCalls`/`verifyLatencyMs` come from.
- I4: design U12 said "two call-limit scenarios"; three.
- I5: task 5.4b gave the wrong reason for `verify-answer.spec.ts:229` (no clock read there).
- I6: task 7.5d too large (resolved by I1).

## Resolution of run 4

| Finding | Resolution |
|---|---|
| I1 | Fixed: `now` forwarding in 7.4a; meter count, `onSemanticStart` and the rejection state in 7.4c; 7.5d keeps the five D11 scenarios and the read-failure AND. |
| I2 | Fixed. |
| I3 | Fixed: U6 `queryLogEntry` inputs; U7 step 4 `UNKNOWN` row (`verifyCalls` 0 from the meter, `verifyLatencyMs` 0 from the U15 state). |
| I4 | Fixed: the three scenarios named. |
| I5 | Fixed: :229 only through `ZERO_USAGE`. |
| I6 | Fixed by I1. |

Task-order and wording fixes after an APPROVED verdict, no scope change; no re-run needed.
