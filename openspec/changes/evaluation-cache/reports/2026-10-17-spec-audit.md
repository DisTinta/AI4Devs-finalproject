CHANGES REQUIRED

# Spec audit — evaluation-cache (DIS-21, parent DIS-16)

- Date: 2026-10-17
- Auditor: `spec-auditor` subagent (read-only; this file is written by the main session,
  docs/base-standards.md §7.1)
- The first line is the verdict of the latest run.

## Run 1

Verdict: CHANGES REQUIRED

**Questions for the author**

- **Q1 — DIS-16 AC 6 (refund question) and D2.** The demo question Q6 `¿Cómo se gestionan los reembolsos de un pedido?` (`fixtures/README.md:190`) gives the anchor terms `gestionan`/`gest`, `reembolsos`/`reem` and `pedido`/`pedi` (`packages/core/src/context/anchor.ts:48-67`). If no acme-shop symbol contains any of them, Q6 answers `no-anchor` at step 2, before the cache is looked up (D2). Then a golden `no-evidence` entry for Q6 (D4) can never be served, and the parent's "también está cacheada" cannot hold. Q6 would still answer `UNKNOWN` without the LLM, but with reason `no-anchor`. I could not check against the real graph whether Q6 anchors. Which do you want: is `no-anchor` without the LLM enough for AC 6, or must golden entries be looked up before the `no-anchor` step? I am not resolving this here. It is a scope question between DIS-16 and DIS-21 D2/D4.
- **Q2 — Autonomous-run ADR.** `20261016-autonomous-workflow-run-entrega-2` is not on this branch, so I could not verify what it authorises. Tasks 16.1 ("authorised by the autonomous-run ADR") and 16.9 ("merge only after the archive commit") go against `docs/openspec-tasks-mandatory-steps.md` §3 ("confirm with the author first"; "The agent never merges"). Please confirm the ADR covers opening the PR and merging without the author, and who does the merge.

D1–D13 are treated as delegated decisions to be reviewed later, not as open questions.

---

## 1. Scope against the ticket

**Clean.** Everything in the proposal, the specs and the tasks follows from DIS-21 and its D1–D13:

- `normalize.ts`, `response-cache.ts`, the four `StorePort` methods, `useCache`, the `llm-required` policy placed behind the cache, `invalidateCache` without a caller, the transports, the docs.
- The non-goals match the ticket: golden answers are DIS-26, golden review is DIS-34, fingerprints are CM-HU-14.1, similarity is CM-HU-19, the `invalidateCache` caller is DIS-9, no migration.
- Support work is small and justified: `STATEMENT_TYPES` in `typing-rules.ts` (design C2) and `tests/support/cached-answer.ts`.
- The `cli-ask` delta follows from the user story ("CLI `ask` y `POST …/ask`").
- Nothing widens the change to the parent's full story.

## 2. Inherited acceptance criteria

| DIS-16 AC | Inherited by the DIS-21 DoD / [enhanced] | Requirement → scenario | Status |
|---|---|---|---|
| AC1: evaluation hit with case/punctuation variants, `cacheHit`, `costUsd 0`, `hit_count` goes up | yes (DoD 1). The golden part is DIS-26 | explain "Answer cache" → "A cached question is answered from the cache in both modes"; answer-cache "Case, accent and punctuation variants share one key" | covered |
| AC2: evaluation miss → `200` `UNKNOWN` `llm-required` + message, no model call, no own error code | yes (DoD 2) | explain → "Evaluation mode without an entry answers llm-required and saves nothing"; http-ask main "Evaluation mode answers UNKNOWN llm-required over the seed" (unchanged) | covered |
| AC3: fingerprint check by `verify` | no (CM-HU-14.1) | — | out of scope, correct |
| AC4: live + `useCache` true/false | yes ([enhanced] AC 4) | "A live answer is saved once and a repeat is served from the cache", "Turning the cache off calls the model and replaces the entry" | covered |
| AC5: live miss saved with `question_normalized` + full response (evidence, usage) | yes ([enhanced] AC 3) | "A live answer is saved once…"; answer-cache "A stored response keeps the answer without its events" | covered |
| AC6: refund demo question cached, `UNKNOWN` without LLM | partially (D4 "si ancla") | "A no-evidence unknown is cached and served without the model" | **see Q1**. Not blocking: the golden content is DIS-26 |

DIS-21's own [enhanced] ACs (hit, evaluation miss, save without duplicates, `useCache: false` and the budget ceiling, `invalidateCache` with a malformed or unknown id, invalid entry, save failure) each have a requirement and a scenario. **No blocking gap here**, as long as B1 is fixed: B1 is a contradiction, not a missing AC.

## 3. Missing scenarios

- **M1 (improvable).** No scenario covers a cache hit whose `query_log` row write fails. Explain "Answer cache" → Lookup says "it then writes its `query_log` row". "Explain events and logging" says a hit carries only `query_not_logged` when its row was not written. D7 says the same ("más `query_not_logged` si falla la fila"). Fix: add a case to "A failed query log write still answers and says so", or a new scenario "A hit whose row is not written still answers and says so" (`events` exactly `[{ type: 'query_not_logged', code: 'store-write-failed' }]`).
- **M2 (improvable).** D10 and "Answer usage" say the clock is read exactly twice on a hit, and that `last_hit_at` is the first read. "A cached question is answered from the cache in both modes" checks the instant but not the number of reads. Fix: add "**AND** the clock was read exactly twice in each call".
- **M3 (improvable).** Explain "Answer cache" and answer-cache "Question normalization" say a question whose key is empty "SHALL be neither looked up nor saved". This cannot happen after anchoring: anchoring needs a letter-or-digit token of at least `MIN_TOKEN_LENGTH` (`anchor.ts:48-67`), and such a token survives `normalizeQuestion`. So no scenario through `explain` can exercise the rule. Also, the count sentence of "Precedence and UNKNOWN answers" ("looked up 0 times for an invalid request, `no-anchor` and … `useCache: false`, and once otherwise") does not list the empty key. Fix: in explain "Answer cache", add "(unreachable after anchoring, since an anchored question holds a letter or digit; kept as a guard)". The store-level rejection of an empty key is already tested in graph-store "Invalid cache arguments are rejected before querying".
- **M4 (improvable).** graph-store "Answer cache entries" says a failure to open the savepoint on a caller-owned transaction propagates unchanged, and no scenario covers it. Fix: add a case to "A failed rollback of a cache write is a write failure" (unit, `postgres-cache-write-errors.spec.ts`): a `SAVEPOINT` that rejects gives back that same error, not `CacheWriteFailed`.

## 4. Ambiguity

None of the listed words appears in a requirement or a scenario with a vague meaning:

- "as many symbol searches as one anchoring … sends" is an exact equality.
- "however many statements cite it" is a quantifier.
- "faster than the clock's resolution" is measurable.

- **M5 (improvable), design rationale only.**
  - `design.md:258`: "questions about code rarely differ only in an accent". Proposed: "no two of the demo questions of `fixtures/README.md` share a key; a collision needs two questions that differ only in an accent or `ñ`".
  - `design.md:136`: "Simpler SQL". Proposed: "one `INSERT … ON CONFLICT` statement instead of lock + delete + insert".

## 5. Open decisions

- **B2 (blocking): a negative `savingsPct` makes a cacheable answer unreadable.** answer-cache "Stored response" accepts `usage` only with "non-negative numbers". explain "Answer usage" says `savingsPct` "is negative when the answer used more tokens than the baseline, and is not clamped" (scenario "Savings follow the baseline…": −25). Result:
  - such an answer is cacheable ("Cacheable answers"), gets saved, and is then rejected on every read;
  - in live mode it is replaced on every call and never served;
  - in evaluation mode it answers `llm-required`.

  The implementer would have to choose between clamping, rejecting or accepting. Fix: in "Stored response", write "`usage` exactly the fields of an answer's usage, with non-negative integers for tokens and latency, a non-negative cost, `savingsPct` any finite number with at most one decimal, and `cacheHit` `false`". Add "**AND** a stored answered response whose `savingsPct` is −25 is accepted" to "A stored response keeps the answer without its events", or a new scenario.
- **B3 (blocking): `excerpt: null` is accepted in an answer's `evidence`.** "Stored response" allows `excerpt` "a string or `null`" for both the answer's `evidence` and the prior claims' evidence. But `AnswerEvidence.excerpt` is `null` "only for a prior claim stored without one" (`packages/core/src/explain/explain-answer.ts:23-28`), and `toPublicAnswer` casts it to `string`, so a `null` makes `/ask` answer `500 INTERNAL` (`packages/api/src/routes/ask.ts:99-100`). The design added the evidence-id refinement exactly to avoid that kind of `500` (C2). A hand-written golden with `excerpt: null` would pass the check and break `/ask` on every hit. Fix:
  - "Stored response": answer `evidence` entries get `excerpt` a string; prior-claim `evidence` entries get `excerpt` a string or `null`.
  - Add "with an evidence `excerpt` `null`" to the rejected list of "Invalid stored responses are rejected without leaking".
  - Same change in design C2.
- **M6 (improvable): the in-memory double does not say whether it copies.** It "SHALL keep its entries … stored response". The Postgres adapter returns a JSON round trip of the value (`jsonb`). If the double keeps the caller's object, a test can pass by sharing the reference (an `undefined` field or a later mutation that `jsonb` would drop). Fix: in the graph-store double paragraph and design C5, write "stores and returns `JSON.parse(JSON.stringify(response))`, as the column does".
- **M7 (improvable): `StorePort` doubles that throw.** Task 3.3 lets every `StorePort` double get the four methods "throwing, or delegating". `explain` now always calls `findCacheEntry` after anchoring, so a throwing double given to `explain` makes every call fail. Fix: change 3.3 to "doubles that reach `explain` delegate to the in-memory double (or `findCacheEntry` resolves `undefined` and `saveCacheEntry` resolves); only doubles never given to `explain` may throw".

## 6. Contradictions inside the change

- **B4 (blocking): the design lets the row write mask the save's error.** Design C6 handles a save error that must propagate like this: `saveCache(…).catch(error => { pending = error })`, then `saveRow`, then `if (pending) throw pending`. `saveRow` rethrows any error other than `QueryLogWriteFailed`/`ProjectNotFound`/`InvalidStoreQuery` (`packages/core/src/explain/explain.ts:176-187`), so that error would replace `pending`. The delta's explain "Query log" says the opposite: "The error SHALL then propagate unchanged, whatever happened to the row: a failure of the row write never replaces it". The existing rejection path does it right with `.catch(() => undefined)` (`explain.ts:151`). Fix:
  - Design C6: "when `pending` is set, write the row with `store.saveQueryLog(row).catch(() => undefined)` (the rejection path), then `throw pending`; `saveRow` and its `query_not_logged` mapping only run when the save resolved or was mapped".
  - Spec: extend "Other cache write errors propagate after the row" with "…, and again with the row write also rejecting with an `Error` → explain fails with the save's error".
- **B1, part (a), see §7.** The delta's own MODIFIED "Query log" keeps the scenario "An answer leaves one query log row the daily spend sees" unchanged. Its last **AND** expects the same question, asked again over the same database with the budget spent, to fail with `BudgetExhausted` and write no row. Under the delta's new "Answer cache" requirement, the first call saved the answer, so the second call is a hit: `200`, plus one row with `cache_hit` true. The delta contradicts itself, and the existing test (`tests/integration/explain/explain.spec.ts:289-297`) will fail.
- **M8 (improvable).** Proposal → Impact says "One existing test changes because its contract changes". With B1 there are at least four. Fix it together with B1.

## 7. Contradictions with the project

- **B1 (blocking): the cache breaks main-spec scenarios that the deltas do not modify.** With the cache on by default and the in-memory double now saving entries, a second ask of the same question on the same store is a hit. Three main-spec scenarios (four with the one in §6) expect the model to run again:
  1. `openspec/specs/explain/spec.md` → "Query log" → "An answer leaves one query log row the daily spend sees" (lines 1086-1088; see §6).
  2. `openspec/specs/explain/spec.md` → "Answer with typed statements" → "A valid but irrelevant citation is cited and never a fact" (line 681: "when the same question is explained again, the prior claim of S1 is shown `INFERENCE`"). The test calls `explain` twice on the same doubles (`tests/unit/explain/explain-verification.spec.ts:370-383`). The second call becomes a hit whose `priorClaims` is the first answer's snapshot (`[]`), so line 383 fails.
  3. `openspec/specs/http-ask/spec.md` → "Ask events and verification verdicts" → "Requests to one API share verification verdicts" (lines 286-294). The test shares one store between both apps (`tests/unit/api/ask.spec.ts:555-581`). The second and third requests become hits, so `afterTwo` is `[]` instead of `['answer']`, `cacheHits` is not 1, and `afterThree` is `[]`.

  Not affected, because each run builds its own doubles: "A cached pair is not verified again by a second answer", "An answer carries the confidence of its statements" and "A row of an answer verified from the cache counts no verifier call".

  Fix:
  - Add MODIFIED requirements "Answer with typed statements" (explain) and "Ask events and verification verdicts" (http-ask), copied in full, with the repeat calls sent with `useCache: false`. Those scenarios are about the verification cache and prior claims, not the answer cache.
  - In explain "Query log", change the **AND** of "An answer leaves one query log row…" to "…explained again with `useCache: false` and the model wrapped by a daily budget…".
  - Update proposal → Impact, design C8 and tasks 7.1/9.2 to name these tests.
- **M9 (improvable): shared fixture.** Design C8 and task 2.1 describe `tests/support/cached-answer.ts` as a response "built once … also used by the explain, API and CLI tests". `docs/backend-standards.md` §7 (line 125) says: "Build test data with factories, never with a fixture file that every test shares". Fix: make it a factory, `cachedAnswer(overrides?)` and `cachedNoEvidence()`, that returns a fresh object on each call.
- **M10 (improvable): docs list incomplete.** `docs/project-context.md:620` (`cacheHit: false`) and `:623` ("until DIS-21 adds the cache-only degradation") will be wrong after this change, and design C10 and task 14.2 do not list them. Fix: add both lines to C10 and 14.2. Line 623 should then say: "a cached question is served before any model call, so it answers even with the ceiling spent; a miss still propagates `BudgetExhausted`/`LlmUnavailable` (D11)".
- **Clean:**
  - graph-schema "Cache entry table" (`openspec/specs/graph-schema/spec.md:593-594`) leaves uniqueness "to the cache feature"; D3 decides it in graph-store without contradicting it.
  - Closed sets reused (`backend-standards.md` §4).
  - `z.strictObject` used.
  - No migration, so §5 is not involved.
  - No ADR in `docs/adr/` is contradicted.

## 8. Contrast with the real code

- **M11 (improvable): wrong claim about ids.** Design C5 says the double's ids "come from the double's existing deterministic id source". The double uses `randomUUID()` (`tests/support/in-memory-store.ts:1,164,168,175,275,287,337`). Fix the sentence to "ids from `randomUUID()`, as the double's other rows". Scenarios that need an order must use `seedCacheEntry({ createdAt })`, not the ids.
- **M12 (improvable): `doubles()` needs changes the design does not mention.** `doubles()` (`tests/support/explain-doubles.ts:67-117`) has no pass-through for a cache failure and records only `findClaimsOverlapping`, `saveClaims` and `saveQueryLog` in `order`. Task 6.4 ("the save after the second clock read and before the row") and 6.6 need `saveCacheEntry` (and `findCacheEntry`/`touchCacheEntry`) recorded in `order`, and a `failCacheCall` option. Fix: add to C5 and task 3.3 "`doubles()` forwards `failCacheCall` and records the cache calls in `order`". Existing exact-order assertions are unaffected only if the cache calls are recorded under their own names and old tests filter them; say which in 9.1.
- **M13 (improvable): advisory lock parameters.** Design C4 uses `pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0))`. node-postgres sends parameters untyped, and `unknown || unknown` is likely to fail type resolution. Fix: write `hashtextextended($1::text || ':' || $2::text, 0)`, or pass one precomputed text parameter.
- **M14 (improvable): duplication.**
  - `normalizeQuestion` repeats the NFKD + combining-mark removal that `questionTerms` already does (`anchor.ts:48-50`). Either share a `foldDiacritics` helper or record in C1 why the two stay separate (different outputs), so they do not drift.
  - `toCacheWriteError` would be a third copy of `toClaimWriteError`/`toQueryLogWriteError` (`packages/adapters/store-postgres/src/postgres-store.ts:127-138`). Consider one factory `domainErrorOr(() => new X())`.
- **Clean:**
  - C4's `atomically` and `runProjectQuery` usage matches `postgres-store.ts:80-171`.
  - The hit before `llm-required` fits the marked slot (`explain.ts:210-211`).
  - The `/ask` forward follows the `tokenBudget` pattern (`ask.ts:142`).
  - `toPublicAnswer` already publishes `cacheHit` (`ask.ts:111`).
  - `sumCostSince: notImplemented` in the double (`in-memory-store.ts:302`) matches C5.

## 9. Task size

- **M15 (improvable).**
  - Task 4.3 bundles eight Postgres scenarios, including a temporary-trigger leak test and a query-counting client. Split it: 4.3a (replace, duplicates, touch, invalidate) and 4.3b (invalid arguments, unknown project, leak).
  - Task 6.5 bundles five explain scenarios. Split it: 6.5a (`useCache: false`, invalid entry, no-evidence) and 6.5b (not cacheable, budget/hops key).
  - Task 3.3 touches up to 14 `StorePort` doubles (see M7). It fits in one turn if the rule of M7 is fixed beforehand.

## 10. Mandatory steps

- Step 0 is first and labelled. 0.1 sets the Linear state, per project rule; 0.2–0.3 check the branch.
- MANDATORY labels are present on 9, 11, 12, 13, 14 and 16. AGENT MUST EXECUTE is on 12, 13 and 16.
- The report path and pattern are named (11.7, 12.8).
- State restoration: 11.6, 12.5, 12.7.
- The last step is Pre-merge Review, in the right order, with the archive before the merge.
- **M16 (improvable).** Manual step 12.4 covers invalid input (`useCache: "yes"`) but no missing resource, which `docs/openspec-tasks-mandatory-steps.md` §3 requires. Fix: add "`POST /api/projects/<random UUID>/ask` → `404` `PROJECT_NOT_FOUND`".
- **M17 (improvable).** Tasks 16.1 and 16.9 rely on the ADR (see Q2). Write who merges explicitly and cite the ADR file.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| answer-cache · Question normalization | Case, accent and punctuation variants share one key | 1.1, 1.2 |
| | Identifiers, symbols and compatibility characters become plain words | 1.3 |
| | A question of only punctuation has no key, and a key is stable | 1.3 |
| answer-cache · Cacheable answers | Only stored current answers and no-evidence unknowns are cacheable | 2.2, 2.3 |
| answer-cache · Stored response | A stored response keeps the answer without its events | 2.4 |
| | A no-evidence unknown is stored without events | 2.4 |
| | Invalid stored responses are rejected without leaking | 2.5 |
| answer-cache · Answer of a cache hit | A hit carries the stored answer and the usage of this call | 2.6 |
| | A cached unknown is answered without usage | 2.6 |
| explain · Explain request (MOD) | A non-boolean cache flag is rejected before the store (+6 unchanged) | 5.1; 9.3 |
| explain · Precedence and UNKNOWN answers (MOD) | A question without anchor is not looked up in the cache (+13 unchanged) | 6.3; 9.3 |
| explain · Explain events and logging (MOD) | (5 unchanged; `answer_not_cached` order covered by "A failed cache write…") | 5.2, 6.6; 9.3 |
| explain · Answer usage (MOD) | (4 unchanged; hit usage via 2.6 / 6.1) | 6.2; 9.3 |
| explain · Query log (MOD) | 15 unchanged, **one of which contradicts the cache (B1)** | **hole: no task updates "An answer leaves one query log row the daily spend sees"** |
| explain · Answer cache (ADD) | A cached question is answered from the cache in both modes | 6.1, 6.2 |
| | A hit over the database counts in its entry and its row | 6.8 |
| | Evaluation mode without an entry answers llm-required and saves nothing | 6.3 |
| | A live answer is saved once and a repeat is served from the cache | 6.4 |
| | Turning the cache off calls the model and replaces the entry | 6.5 |
| | An invalid entry is a miss and a live answer replaces it | 6.5 |
| | A no-evidence unknown is cached and served without the model | 6.5 |
| | Answers that are not cacheable are not saved | 6.5 |
| | The cache key ignores the budget and the hops | 6.5 |
| | The cache is scoped by project | 6.3 |
| | A failed cache write still answers and says so without leaking | 6.6 |
| | Other cache write errors propagate after the row | 6.6 |
| | A failing cache lookup or hit record stops before the model | 6.3 |
| | A cached question answers with the daily budget spent | 6.7 |
| explain · Answer with typed statements (**should be MOD, B1**) | A valid but irrelevant citation is cited and never a fact | **hole: no delta, no task** |
| graph-store · Answer cache entries | A saved entry is found by its project and key | 4.1, 4.2 |
| | Saving a key again replaces its entry | 4.3 |
| | Concurrent saves of one key leave one entry | 4.4 |
| | The most recent of duplicated entries is found | 4.3 |
| | Touching an entry records the hit | 4.3 |
| | Invalidating a project deletes only its entries | 4.3 |
| | Invalid cache arguments are rejected before querying | 4.3 |
| | Cache calls on an unknown project fail without writing | 4.3 |
| | A failed cache write does not leak | 4.3 |
| | A failed rollback of a cache write is a write failure | 4.5 |
| | Cache writes on the store's own connections commit | 4.4 |
| | A store that cannot give a connection fails cache writes with its own error | 4.5 |
| | The in-memory double keeps, checks and fails cache entries | 3.1, 3.3 |
| http-ask · Ask request validation (MOD) | Optional fields are forwarded as the use case expects (+4 unchanged) | 7.1, 7.2; 9.3 |
| http-ask · Ask from the answer cache (ADD) | A cached question answers from the cache over the seed | 7.3 |
| | A spent daily budget still answers a cached question | 7.3 |
| http-ask · Ask events and verification verdicts (**should be MOD, B1**) | Requests to one API share verification verdicts | **hole: no delta, no task** |
| cli-ask · Ask from the answer cache (ADD) | Evaluation mode prints a cached answer | 8.1 |

Three holes, all from B1: blocking.

---

## Corrections to apply

### `openspec/changes/evaluation-cache/specs/answer-cache/spec.md`

- **"Stored response", answered bullet (B2, B3).** Replace the `evidence` and `usage` parts with: "`evidence` a list of exactly `{ id, fileId, path, startLine, endLine, excerpt }` with integer lines, `startLine` at least 1, `endLine` not below `startLine` and `excerpt` a string; `priorClaims` … whose `evidence` entries are as above except that `excerpt` may be `null`; `usage` exactly the fields of an answer's usage (`explain`, "Answer usage"), with non-negative integers for tokens and latency, a non-negative cost, `savingsPct` any finite number with at most one decimal, and `cacheHit` `false`".
- **"Invalid stored responses are rejected without leaking" (B3).** Add "with an evidence `excerpt` `null`" to the WHEN list.
- **"A stored response keeps the answer without its events" (B2).** Add: "**AND** the same answer with `usage.savingsPct` −25 is accepted by the check".

### `openspec/changes/evaluation-cache/specs/explain/spec.md`

- **MODIFIED "Query log" → "An answer leaves one query log row the daily spend sees" (B1).** Last **AND** becomes: "when the same question is explained again **with `useCache: false`** and the model wrapped by a daily budget whose ceiling is at most the cost since the start of the current UTC day, explain fails with `BudgetExhausted` and no new row is written".
- **New MODIFIED "Answer with typed statements" (B1).** Copy the main requirement in full. In "A valid but irrelevant citation is cited and never a fact", write: "…and when the same question is explained again **with `useCache: false`**, the prior claim of S1 is shown `INFERENCE`".
- **"Answer cache" → "Other cache write errors propagate after the row" (B4).** Add: "…; and again with the `query_log` row write also rejecting with an `Error` → explain fails with the save's error".
- **"Answer cache" (M1).** Add the scenario "A hit whose row is not written still answers and says so": hit with `failQueryLogWrite` → `QueryLogWriteFailed`; the answer is the hit, and `events` is exactly `[{ type: 'query_not_logged', code: 'store-write-failed' }]`.
- **"A cached question is answered from the cache in both modes" (M2).** Add "**AND** the clock was read exactly twice in each call".
- **"Answer cache", first paragraph (M3).** After "A question whose key is empty SHALL be neither looked up nor saved", add "(unreachable after anchoring, which needs a letter or digit token; kept as a guard)".

### `openspec/changes/evaluation-cache/specs/http-ask/spec.md`

- **New MODIFIED "Ask events and verification verdicts" (B1).** Copy it in full. In "Requests to one API share verification verdicts": "**WHEN** the same question is sent twice to that app, the second time with `"useCache": false`, and then once with `"useCache": false` to a second app built with the same doubles".

### `openspec/changes/evaluation-cache/specs/graph-store/spec.md`

- **Double paragraph (M6).** Add "and stores and returns a JSON round trip of the response (`JSON.parse(JSON.stringify(response))`), as the column does".
- **"A failed rollback of a cache write is a write failure" (M4).** Add: "**AND** with a caller-owned transaction whose `SAVEPOINT` rejects, a save rejects with that same error, not `CacheWriteFailed`".

### `openspec/changes/evaluation-cache/design.md`

- **C2 (B2, B3).** Same schema wording as in the spec: answer evidence `excerpt` is `z.string()`, prior-claim evidence `excerpt` is `z.string().nullable()`, `savingsPct` is `z.number()` (finite), with no `nonnegative()`. Note that the closed sets go through `z.literal(ARRAY)` (`backend-standards.md` §4).
- **C4 (M13).** Lock statement: `SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`.
- **C5 (M6, M11, M12).**
  - "Ids from `randomUUID()`, as the double's other rows".
  - "Stores and returns a JSON round trip of each response".
  - "`doubles()` forwards `failCacheCall` and pushes `findCacheEntry`, `touchCacheEntry` and `saveCacheEntry` into `order`".
- **C6 (B4).** Replace the `pending` paragraph with: "when the save rejects with an error other than `CacheWriteFailed`/`ProjectNotFound`, keep it as `pending`, write the row with `store.saveQueryLog(row).catch(() => undefined)` (the rejection path of `explain.ts:151`), then `throw pending`; otherwise call `saveRow` and append `answer_not_cached` then `query_not_logged`".
- **C8 (B1, M9).**
  - Name the three existing tests whose contract changes: `tests/integration/explain/explain.spec.ts` "An answer leaves one query log row the daily spend sees", `tests/unit/explain/explain-verification.spec.ts` "A valid but irrelevant citation is cited and never a fact", `tests/unit/api/ask.spec.ts` "Requests to one API share verification verdicts". All three add `useCache: false` to the repeat calls.
  - `cached-answer.ts` becomes a factory.
- **C10 (M10).** Add `docs/project-context.md` lines 620 (`cacheHit: false`) and 623 ("until DIS-21 adds the cache-only degradation").
- **C1 (M14), optional.** Shared `foldDiacritics` with `anchor.ts`, or a sentence on why the two stay separate.
- **Risks (M5).** Reword "rarely" and "Simpler SQL" as in §4.

### `openspec/changes/evaluation-cache/proposal.md`

- **Impact → Tests (B1, M8).** Replace "One existing test changes…" with the four existing tests whose contract changes: the `http-ask` forward scenario plus the three of B1, each because its repeat ask would now be a cache hit.

### `openspec/changes/evaluation-cache/tasks.md`

- **2.1 (M9).** "a factory `cachedAnswer(overrides?)` / `cachedNoEvidence()` returning a fresh object per call".
- **3.3 (M7, M12).** "doubles given to `explain` delegate to the in-memory double (or `findCacheEntry` resolves `undefined` and `saveCacheEntry` resolves); `doubles()` forwards `failCacheCall` and records the cache calls in `order`".
- **4.3 → 4.3a / 4.3b, and 6.5 → 6.5a / 6.5b (M15).**
- **New 6.10 (B1).** "RED → GREEN: update the explain tests 'An answer leaves one query log row the daily spend sees' and 'A valid but irrelevant citation is cited and never a fact' to the modified scenarios (`useCache: false` on the repeat)".
- **7.1 (B1).** Also update "Requests to one API share verification verdicts" in `tests/unit/api/ask.spec.ts`.
- **9.2 (B1).** List the four edited existing tests.
- **12.4 (M16).** Add the `404 PROJECT_NOT_FOUND` call.
- **16.1 / 16.9 (M17, Q2).** Write who merges and cite the ADR file.

### Linear DIS-21 (do not touch the `[original]` block; Spanish text for the `[enhanced]` part)

- **[enhanced] → D5, add at the end:**
  > «El esquema de lectura acepta `usage.savingsPct` negativo (puede serlo, spec `explain` "Answer usage") y exige `excerpt` de tipo texto en las evidencias de la respuesta (solo las evidencias de `priorClaims` admiten `null`), porque un `null` haría que `/ask` respondiera `500`.»
- **[enhanced] → D6, add:**
  > «Además del escenario de reenvío de `http-ask`, cambian por contrato tres escenarios vigentes que repiten la misma pregunta sobre el mismo store (`explain` "An answer leaves one query log row the daily spend sees" y "A valid but irrelevant citation is cited and never a fact"; `http-ask` "Requests to one API share verification verdicts"): con la caché, la repetición sería un acierto, así que el delta los modifica para repetir con `useCache: false`.»
- **[enhanced] → D8, add:**
  > «Si el guardado falla con otro error y además falla la fila `query_log`, se propaga el error del guardado (la fila nunca lo sustituye).»
- **Q1 (refund question)**, to the description's [enhanced] part (scope goes in the description, not in a comment):
  > «Pregunta abierta para la autora: la Q6 de `fixtures/README.md` ("¿Cómo se gestionan los reembolsos de un pedido?") puede no anclar en acme-shop; con D2 respondería `UNKNOWN` `no-anchor` antes de mirar la caché, y una golden `no-evidence` (DIS-26) nunca se serviría. ¿Basta `no-anchor` sin LLM para el AC 6 de DIS-16, o la caché debe consultarse antes de `no-anchor`?»

### Resolution of run 1 (main session, 2026-10-17)

Every finding was resolved as lead engineer in this change's artifacts with `/opsx:update` (destination
**A** for all of them; see `design.md` → Follow-ups). The decisions are recorded in the DIS-21
`[enhanced]` description under "Decisiones tras la auditoría de specs".

| Finding | Resolution |
|---|---|
| Q1 | Decided: `no-anchor` keeps priority over the cache (D14, design C11). Q6 does not anchor on the acme-shop seed (none of its terms is in `seeds/graph-dump.sql`), so it answers `UNKNOWN` without the LLM at step 2, which is what DIS-16 AC 6 asks to observe. |
| Q2 | Tasks 16.1 and 16.9 cite `docs/adr/20261016-autonomous-workflow-run-entrega-2.md` and say the agent merges after the archive commit with CI green. |
| B1 | `explain` "Query log" and "Answer with typed statements", and `http-ask` "Ask events and verification verdicts", are MODIFIED so their repeats send `useCache: false`; proposal Impact, design C8 and tasks 6.9, 7.1 and 9.2 name the four edited tests. |
| B2, B3 | `answer-cache` "Stored response": negative `savingsPct` accepted; an answer's evidence `excerpt` must be a string (only prior-claim evidence may be `null`); scenarios extended; design C2. |
| B4 | Design C6: a non-mapped save error is kept, the row is written as on the rejection path and cannot replace it; scenario "Other cache write errors propagate after the row" extended. |
| M1 | New scenario "A hit whose row is not written still answers and says so" (task 6.6). |
| M2 | The hit scenario checks that the clock was read exactly twice in each call. |
| M3 | The empty-key rule is marked as a guard, unreachable after anchoring. |
| M4 | The failing `SAVEPOINT` case is added to the rollback scenario (task 4.5). |
| M5 | Design wording of C4 and Risks made measurable. |
| M6 | The in-memory double stores and returns a JSON round trip (graph-store spec, C5, task 3.3). |
| M7, M12 | Design C5 and new task 3.4: doubles given to `explain` delegate or answer a miss; `doubles()` forwards `failCacheCall` and records the cache calls in `order`. |
| M8 | Proposal Impact lists the four edited tests. |
| M9 | `tests/support/cached-answer.ts` is a factory (C8, task 2.1). |
| M10 | Design C10 and task 14.2 list the two stale `project-context.md` lines. |
| M11 | C5: ids from `randomUUID()`; ordered tests seed `createdAt`. |
| M13 | C4: `hashtextextended($1::text || ':' || $2::text, 0)`. |
| M14 | C1 records why the key does not reuse `anchor.ts`; C4 folds the three write-error mappers in the refactor step (10.1). |
| M15 | Tasks 4.3 and 6.5 split into a/b. |
| M16 | Manual step 12.4 adds `POST` to a random UUID → `404 PROJECT_NOT_FOUND`. |
| M17 | See Q2. |
