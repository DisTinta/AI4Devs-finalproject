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

## Run 2

Verdict: CHANGES REQUIRED

- Date: 2026-10-17
- Inputs read: `proposal.md`, `design.md`, `tasks.md`, the five deltas (`answer-cache`, `explain`, `graph-store`, `http-ask`, `cli-ask`) and the run 1 report with its resolution table. Linear DIS-21 and parent DIS-16 were loaded with their comments: DIS-21 has 3 comments (handovers from DIS-78, DIS-41 and DIS-39) and DIS-16 has none.
- Main specs: `openspec/specs/explain/spec.md`, `openspec/specs/http-ask/spec.md`.
- Code and tests checked: `packages/core/src/explain/{explain,explain-answer}.ts`, `packages/cli/src/commands/ask.ts`, `tests/support/explain-doubles.ts`, `tests/unit/explain/{explain,explain-verification,explain-sanitization}.spec.ts`, `tests/unit/api/ask.spec.ts`, `tests/integration/cli/ask-command.spec.ts`, `seeds/graph-dump.sql`, `docs/adr/`.
- D1–D14 and the post-audit amendments of D3, D5, D6 and D8 are treated as delegated decisions under the autonomous-run ADR, to be reviewed later by the author. They are not open questions.

**Questions for the author:** none. Q1 is decided as D14; Q2 is resolved, with one caveat in N5.

---

### 0. Run 1 findings — resolution check

| Finding | Status in the artifacts | Note |
|---|---|---|
| Q1 | Resolved | D14 is in the DIS-21 `[enhanced]` description and in design C11. The claim holds: `seeds/graph-dump.sql` has 0 matches for `reem`, `gest` or `pedi` (case-insensitive). A scenario pinning it is still missing: see N2. |
| Q2 / M17 | Resolved, with a caveat | Tasks 16.1 and 16.9 cite the ADR and say who merges. The cited file is not on this branch: see N5. |
| B1 | Resolved | `explain` "Query log" and "Answer with typed statements", and `http-ask` "Ask events and verification verdicts", are MODIFIED and copied in full (scenario counts match the main specs: 15, 16 and 2). Each repeat sends `useCache: false`. I checked the other scenarios that run `explain` twice. Each run builds its own `doubles()`/`acmeShop()`, so none is affected: `explain-verification.spec.ts:324-522, 954-991, 1149-1184, 1231-1267`, `explain-sanitization.spec.ts:363-396`. |
| B2, B3 | Resolved | `answer-cache` "Stored response" lines 76-84 and 91; scenarios at lines 100-101 and 115; design C2 lines 94-98; task 2.5. |
| B4 | Resolved | Design C6 lines 198-206 keeps the error as `pending` and writes the row with `.catch(() => undefined)`. The scenario at lines 1056-1058 covers the double failure. |
| M1 | Resolved | "A hit whose row is not written still answers and says so" (task 6.6). |
| M2 | Resolved | `explain` delta line 941. |
| M3 | Resolved | `explain` delta lines 897-898. |
| M4 | Resolved | `graph-store` delta lines 141-142, task 4.5. |
| M5 | Resolved | Design lines 148 and 306-308. |
| M6 | Resolved | `graph-store` delta lines 54-55, C5, task 3.3. |
| M7 | Resolved | Task 3.4, C5. |
| M8 | Resolved | Proposal lines 97-103. |
| M9 | Resolved | C8, task 2.1. |
| M10 | Resolved | C10, task 14.2. |
| M11 | Resolved | C5 line 172. |
| M12 | **Partly resolved** | `doubles()` now records the cache calls in `order`. But C5 line 177 ("filter them only if they break") leaves the exact-order assertions to the implementer, and they will break: see N1. |
| M13 | Resolved | C4 line 139. |
| M14 | Resolved, with a caveat | C1 gives the reason the key does not reuse `anchor.ts`. Folding the three error mappers is put in task 10.1, but 10.1's file scope does not cover them: see N7. |
| M15 | Resolved | 4.3a/4.3b, 6.5a/6.5b. |
| M16 | Resolved | Task 12.4. |

---

### 1. Scope against the ticket

**Clean.** Everything follows from DIS-21 (DoD, `[enhanced]` D1–D14 and the amendments):

- the `answer-cache` capability;
- the four `StorePort` methods;
- `useCache` in `explain` and `/ask`;
- the cache placed before `llm-required`;
- `invalidateCache` with no caller yet;
- the CLI scenario;
- the docs.

The three MODIFIED requirements added for B1 only change the repeat calls, so they are not new scope. The non-goals match the ticket (DIS-26, DIS-34, CM-HU-14.1, CM-HU-19, DIS-9, no migration). Nothing widens the change to DIS-16's whole story.

### 2. Inherited acceptance criteria

| DIS-16 AC | Inherited by DIS-21 | Requirement → scenario | Status |
|---|---|---|---|
| AC1 hit with variants, `cacheHit`, cost 0, `hit_count` goes up | DoD 1 | explain "Answer cache" → "A cached question is answered from the cache in both modes"; answer-cache "Case, accent and punctuation variants share one key" | covered |
| AC2 evaluation miss → `200` `llm-required` | DoD 2 | explain → "Evaluation mode without an entry answers llm-required and saves nothing"; http-ask main "Evaluation mode answers UNKNOWN llm-required over the seed" | covered |
| AC3 fingerprint check | no (CM-HU-14.1) | — | out of scope, correct |
| AC4 live, `useCache` true/false | [enhanced] AC 4 | "A live answer is saved once…", "Turning the cache off…" | covered |
| AC5 live miss saved with the full response | [enhanced] AC 3 | "A live answer is saved once…"; answer-cache "A stored response keeps the answer without its events" | covered |
| AC6 refund question answers `UNKNOWN` without the LLM | D14 says it is met by `no-anchor` coming before the cache | **no scenario pins it** | **N2 (blocking)** |

DIS-21's own [enhanced] ACs (hit, evaluation miss, saved without duplicates, `useCache: false` and the budget ceiling, `invalidateCache`, invalid entry, failed save) each have a requirement and a scenario. The 429 for an uncached question is covered by the main http-ask scenario "A spent daily budget stops the model over the seed".

- **N2 (blocking).** D14 decides that DIS-16 AC 6 holds because Q6 (`¿Cómo se gestionan los reembolsos de un pedido?`) does not anchor over the acme-shop seed, so it answers `UNKNOWN` `no-anchor` without the model. That rests on a manual check of `seeds/graph-dump.sql`, and no scenario pins it. If the seed changes and Q6 starts to anchor, AC 6 breaks silently. DIS-26 would then be told "no golden needed" on a false premise.
  - **Fix:** add the scenario "The refund demo question answers no-anchor without the model over the seed" to http-ask "Ask from the answer cache" (integration over the seed, task 7.3).
  - Its body: GIVEN acme-shop loaded from `seeds/graph-dump.sql`, and a model that counts its calls, once in evaluation mode and once live. WHEN `POST /ask` is sent `{ "question": "¿Cómo se gestionan los reembolsos de un pedido?" }` with each. THEN both answer `200` `{ "answer": "UNKNOWN", "reason": "no-anchor", "statements": [], "evidence": [] }`, the model received no call, and no `cache_entry` was looked up or written.

### 3. Missing scenarios

- **N3 (improvable): a hit is never saved again.** "Cacheable answers" defines cacheability over "an answer of `explain`". The answer of a hit is `persisted: true` with every statement `current`, so by that text it is cacheable. Design C6 places the save in `explain()` without saying the hit path skips it. If a hit were saved:
  - its `hit_count` would go back to 0;
  - its stored `usage.cacheHit` would be `true`, which the read check rejects, so every second read would be a miss.

  The scenario "A cached question … both modes" (hit count 2) would catch it, but the rule should be written down. **Fix:** in explain "Answer cache" → **Save**, add "An answer served from the cache SHALL NOT be saved again." In design C6, add "the `{ hit }` outcome never reaches `saveCache()`".

Otherwise **clean.** Every new MUST/SHALL clause in the five deltas has a scenario. That includes the new hit-row rule (M1), the double failure on save (B4) and the failing `SAVEPOINT` (M4).

### 4. Ambiguity

**Clean.** None of fast / easy / secure / efficient / many / appropriate / robust appears with a vague meaning in the deltas, the proposal, the design or the tasks. The run 1 occurrences (M5) were reworded.

### 5. Open decisions

- **N1 (blocking): existing exact-call assertions break, and the change does not say how to update them.**
  - **The tension in the artifacts.** Design C5 (line 177) records the cache calls in `doubles().order` and adds four counters to the double's `calls`. It then says existing exact-order assertions "filter them only if they break". Task 9.2 allows edits only to "the four of 6.9 and 7.1", and `docs/openspec-tasks-mandatory-steps.md` §6.2 forbids weakening assertions.
  - **The `order` assertions that will break.** Every live call after anchoring now does `findCacheEntry`, and every cacheable answer does `saveCacheEntry`:
    - `tests/unit/explain/explain.spec.ts:306` — invalid-model-output ×3
    - `tests/unit/explain/explain.spec.ts:322` — no-evidence, which is cacheable
    - `tests/unit/explain/explain.spec.ts:769` — a stored answer
    - `tests/unit/explain/explain-verification.spec.ts:165` — broken-evidence
    - `tests/unit/explain/explain-verification.spec.ts:206` — one shared array for an invalid-model-output run and a no-evidence run, which will now differ
  - **The `calls` assertions that will break.** `explain.spec.ts:106, 129, 183` use `toEqual` on the whole object with the six existing keys. The four new keys make them fail even though their values are 0.
  - **Possibly more.** `QueryLogParts.cacheHit` (C6) is required at its call sites unless it is made optional. `tests/unit/explain/usage.spec.ts` then has to change too.
  - **What the implementer would have to decide alone:** filter the new calls out, which weakens an exact assertion, or extend the expected arrays, which edits tests that 9.2 does not list.
  - **Fix (decision to record):** extend, do not filter. These assertions pin the call order of "Precedence and UNKNOWN answers", which this change modifies (lookup at step 3, save before the row). Adding the cache calls makes them stricter. Expected values:
    - `explain.spec.ts:306` and `explain-verification.spec.ts:165`: `['findCacheEntry', 'findClaimsOverlapping', 'complete', 'saveQueryLog']`
    - `explain.spec.ts:322`: `['findCacheEntry', 'findClaimsOverlapping', 'complete', 'saveCacheEntry', 'saveQueryLog']`
    - `explain.spec.ts:769`: `[…, 'saveClaims', 'saveCacheEntry', 'saveQueryLog']` with `'findCacheEntry'` first
    - `explain-verification.spec.ts:206`: split into one expected array per run
    - `explain.spec.ts:106, 129, 183`: add `findCacheEntry: 0, saveCacheEntry: 0, touchCacheEntry: 0, invalidateCache: 0`
    - `QueryLogParts.cacheHit` becomes optional with default `false`, so `usage.spec.ts` does not change; otherwise list it.

    Record this in design C5 (replace "filter them only if they break"), C8, proposal Impact → Tests, task 9.2 and the step 11 report.

Otherwise **clean.** Formats, limits, error cases, empty and absent inputs, ordering and names are fixed. That includes the empty-key guard, the `null` response, duplicate rows, a touch after replacement, `savingsPct` < 0, a `null` prior-claim excerpt, and the order of events and errors on a failed save.

### 6. Contradictions inside the change

- **N4 (improvable): leftover D1–D13 references.** Since run 1 the ticket holds D14 and the amendments of D3, D5, D6 and D8, and design C11 cites D14. Several places still say D1–D13:
  - `proposal.md:21` ("The decisions D1–D13 were taken…");
  - `design.md:26-28` ("fixes D1–D13 … into units C1–C10"; C11 now exists);
  - `design.md:329` (Open Questions: "D1–D13 are recorded");
  - task 15.1 (PR Why "DIS-21 `[enhanced]` D1–D13").

  **Fix:** write "D1–D14 and the post-audit amendments of D3, D5, D6 and D8" in all four places, and "C1–C11" in the design.
- The run 1 contradictions (B1 part (a), B4, M8) are gone. Otherwise **clean.**

### 7. Contradictions with the project

- **N9 (improvable): main scenarios over the seed now assume an empty cache, and DIS-26 is not warned.** Two main `http-ask` scenarios ask the price question over `seeds/graph-dump.sql` and expect it not to come from the cache:
  - "Evaluation mode answers UNKNOWN llm-required over the seed" (`openspec/specs/http-ask/spec.md:171-179`);
  - "A spent daily budget stops the model over the seed" (`:234-245`).

  They hold today because the seed has no `cache_entry`. Once DIS-26 loads the golden price answer through `db:seed`/`loadSeed`, both become cache hits and fail. **Fix:** add to design → Follow-ups a **B — DIS-26** line: "the golden load must not run inside `loadSeed` for these suites, or DIS-26 modifies the two http-ask seed scenarios to use an uncached anchored question (e.g. `¿Qué hace CouponValidator?`)".
- **Clean otherwise:**
  - the MODIFIED requirements are copied faithfully (step text of "Precedence…" checked against `openspec/specs/explain/spec.md:77-134`);
  - graph-schema "Cache entry table" leaves uniqueness to this feature;
  - closed sets are reused (`backend-standards.md` §4);
  - `cached-answer.ts` is a factory (§7);
  - no ADR in `docs/adr/` is contradicted.

### 8. Contrast with the real code

- **N1** (above) is the code-facing part of the open decision. `tests/support/explain-doubles.ts:103-117` only wraps three methods today, so every `order` assertion above was exact by construction.
- **Checked and consistent:**
  - the rejection-path row `.catch(() => undefined)` is at `explain.ts:151`, as C6 says;
  - `saveRow` is at `explain.ts:176-187`;
  - the cache slot is at `explain.ts:210-211`;
  - the no-row guard `meter.resolvedCalls() > 0` is at `explain.ts:150`;
  - `AnswerUsage.cacheHit: false` is at `explain-answer.ts:99` (C2 widens it);
  - `AnswerEvidence.excerpt` is `string | null`, "null only for a prior claim" (`explain-answer.ts:23-28`), as B3 requires;
  - `CLAIM_TYPES` includes `UNKNOWN` (`knowledge/claim.ts:16`), as answer-cache allows for prior claims;
  - `STATEMENT_TYPES` does not exist yet (`typing-rules.ts:13`), so task 2.3 creates it;
  - the CLI prints no usage (`packages/cli/src/commands/ask.ts:67, 198-204`), so the cli-ask claim "stdout is exactly the stdout of the first ask" holds;
  - the CLI and API integration tests load the seed inside the per-test transaction (`ask-command.spec.ts:156-162`), and the pool test deletes its project in `finally` (`:299-300`), so committed cache entries cannot leak between tests.

### 9. Task size

- **N7 (improvable): task 10.1 does not cover the mapper fold.** Task 10.1 limits the refactor to `packages/core/src/cache/**`, `explain.ts` and "the adapter's cache methods". Design C4 (M14) asks the same step to fold `toClaimWriteError`, `toQueryLogWriteError` and `toCacheWriteError` into `domainErrorOr(...)`, and two of those are not cache methods. **Fix:** in 10.1 add "and the three write-error mappers of `postgres-store.ts` (design C4), with `tests/unit/store/postgres-*-write-errors.spec.ts` and `tests/integration/store` green".

Otherwise **clean.** After the run 1 splits, every task fits in one turn. Task 6.6 (three scenarios, one with a double failure) is the largest and still fits.

### 10. Mandatory steps

- Step 0 is first and labelled. 0.1 sets the Linear state, as the project rule asks; 0.2–0.3 check the branch.
- The MANDATORY labels are on 9, 11, 12, 13, 14 and 16, and AGENT MUST EXECUTE on 12, 13 and 16.
- Report paths are named (11.7, 12.8, 16.4–16.6).
- State restoration is in 11.6, 12.5 and 12.7.
- Archive comes before merge (16.9).
- **N5 (improvable): the cited ADR is not on this branch.** Tasks 16.1 and 16.9 cite `docs/adr/20261016-autonomous-workflow-run-entrega-2.md`, but `docs/adr/` here has only four 2026-10-1x ADRs and not that one. It lives on `feature/DIS-101-readme-entrega-2`. When this change is archived, its tasks will link to a file that is missing in the base branch, unless DIS-101 is merged first. **Fix:** in 16.1 write "(on `feature/DIS-101-readme-entrega-2`; if it is not yet merged into `feature/entrega-2-CRN` when the PR opens, cite it by branch and name in the PR body)". Do the same in 16.9.

### 11. Traceability

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
| explain · Explain request (MOD) | A non-boolean cache flag is rejected before the store (+6 unchanged) | 5.1; 9.3 (+ N1 for `explain.spec.ts:106,129,183`) |
| explain · Precedence and UNKNOWN answers (MOD) | A question without anchor is not looked up in the cache (+14 unchanged) | 6.3; 9.3 (+ N1 for `:306,:322`, `explain-verification.spec.ts:165,:206`) |
| explain · Explain events and logging (MOD) | 5 unchanged; `answer_not_cached` covered by the Answer cache scenarios | 5.2, 6.6; 9.3 |
| explain · Answer usage (MOD) | 4 unchanged; hit usage via 2.6 / 6.1 | 6.2; 9.3 |
| explain · Query log (MOD) | An answer leaves one query log row the daily spend sees (modified) | 6.9 |
| | 14 unchanged | 9.3 |
| explain · Answer with typed statements (MOD) | A valid but irrelevant citation is cited and never a fact (modified) | 6.9 |
| | 15 unchanged | 9.3 |
| explain · Answer cache (ADD) | A cached question is answered from the cache in both modes | 6.1, 6.2 |
| | A hit over the database counts in its entry and its row | 6.8 |
| | Evaluation mode without an entry answers llm-required and saves nothing | 6.3 |
| | A live answer is saved once and a repeat is served from the cache | 6.4 |
| | Turning the cache off calls the model and replaces the entry | 6.5a |
| | An invalid entry is a miss and a live answer replaces it | 6.5a |
| | A no-evidence unknown is cached and served without the model | 6.5a |
| | Answers that are not cacheable are not saved | 6.5b |
| | The cache key ignores the budget and the hops | 6.5b |
| | The cache is scoped by project | 6.3 |
| | A failed cache write still answers and says so without leaking | 6.6 |
| | Other cache write errors propagate after the row | 6.6 |
| | A hit whose row is not written still answers and says so | 6.6 |
| | A failing cache lookup or hit record stops before the model | 6.3 |
| | A cached question answers with the daily budget spent | 6.7 |
| graph-store · Answer cache entries | A saved entry is found by its project and key | 4.1, 4.2 |
| | Saving a key again replaces its entry | 4.3a |
| | Concurrent saves of one key leave one entry | 4.4 |
| | The most recent of duplicated entries is found | 4.3a |
| | Touching an entry records the hit | 4.3a |
| | Invalidating a project deletes only its entries | 4.3a |
| | Invalid cache arguments are rejected before querying | 4.3b |
| | Cache calls on an unknown project fail without writing | 4.3b |
| | A failed cache write does not leak | 4.3b |
| | A failed rollback of a cache write is a write failure | 4.5 |
| | Cache writes on the store's own connections commit | 4.4 |
| | A store that cannot give a connection fails cache writes with its own error | 4.5 |
| | The in-memory double keeps, checks and fails cache entries | 3.1, 3.3 |
| http-ask · Ask request validation (MOD) | Optional fields are forwarded as the use case expects (+4 unchanged) | 7.1, 7.2; 9.3 |
| http-ask · Ask events and verification verdicts (MOD) | Requests to one API share verification verdicts (modified) | 7.1 |
| | The answer's events are logged by level (unchanged) | 9.3 |
| http-ask · Ask from the answer cache (ADD) | A cached question answers from the cache over the seed | 7.3 |
| | A spent daily budget still answers a cached question | 7.3 |
| | **(missing) The refund demo question answers no-anchor without the model over the seed** | **hole: N2** |
| cli-ask · Ask from the answer cache (ADD) | Evaluation mode prints a cached answer | 8.1 |

**One hole (N2): blocking.** Every scenario written in the deltas maps to a task. The hole is the scenario that D14 needs and that does not exist yet.

---

### New findings — summary

| Id | Point | Severity | Subject |
|---|---|---|---|
| N1 | 5, 8 | **blocking** | Exact `order` / `calls` assertions in 8 existing explain tests break; filter-or-extend is left to the implementer, against task 9.2 |
| N2 | 2, 11 | **blocking** | D14's claim for DIS-16 AC 6 (Q6 → `no-anchor` over the seed) has no scenario |
| N3 | 3 | improvable | Say that a hit is never saved again |
| N4 | 6 | improvable | Leftover "D1–D13" / "C1–C10" references |
| N5 | 10 | improvable | The ADR cited in 16.1/16.9 is not on this branch |
| N7 | 9 | improvable | Task 10.1 scope does not cover the mapper fold of C4 |
| N9 | 7 | improvable | B follow-up for DIS-26: the main seed scenarios assume no golden entry |

(N6 and N8 were dropped while auditing: N6 is covered by an existing main scenario, and N8 was merged into N3.)

---

### Corrections to apply

### `openspec/changes/evaluation-cache/specs/http-ask/spec.md`

- **ADDED "Ask from the answer cache" (N2).** Append the scenario:
  > #### Scenario: The refund demo question answers no-anchor without the model over the seed
  >
  > - **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into Postgres, and a model that counts its calls, first in evaluation mode and then live
  > - **WHEN** `POST /api/projects/<acme-shop's id>/ask` is sent `{ "question": "¿Cómo se gestionan los reembolsos de un pedido?" }` with each model
  > - **THEN** both answer `200` with the body exactly `{ "answer": "UNKNOWN", "reason": "no-anchor", "statements": [], "evidence": [] }`
  > - **AND** the model received no call, and acme-shop has no `cache_entry`

### `openspec/changes/evaluation-cache/specs/explain/spec.md`

- **ADDED "Answer cache" → Save (N3).** After "…with a hit count of 0.", add: "An answer served from the cache SHALL NOT be saved again."

### `openspec/changes/evaluation-cache/design.md`

- **Context, lines 26-28 (N4).** "fixes D1–D13" → "fixes D1–D14 and the post-audit amendments of D3, D5, D6 and D8"; "units C1–C10" → "units C1–C11".
- **C5, line 177 (N1).** Replace "(existing exact-order assertions are checked in task 9.1 and filter them only if they break)" with: "existing exact assertions on `order` and on the double's `calls` are extended, never filtered. They pin the call order of 'Precedence and UNKNOWN answers', which this change modifies. The affected tests are `tests/unit/explain/explain.spec.ts:106, 129, 183, 306, 322, 769` and `tests/unit/explain/explain-verification.spec.ts:165, 206` (task 9.2)."
- **C6 (N1, N3).**
  - "`QueryLogParts` gains `cacheHit: boolean`" → "gains `cacheHit?: boolean`, `false` when absent".
  - Add: "The `{ hit }` outcome never reaches `saveCache()`."
- **C8 (N1).** Under "Existing tests whose contract this change modifies", add the eight assertions of C5 with their new expected values (see §5 N1).
- **Open Questions, line 329 (N4).** "None: D1–D14 and the post-audit amendments are recorded in the DIS-21 `[enhanced]` description."
- **Follow-ups (N9).** Add: "**B — DIS-26**: loading the golden entries must not turn the http-ask seed scenarios 'Evaluation mode answers UNKNOWN llm-required over the seed' and 'A spent daily budget stops the model over the seed' into cache hits. Either keep the golden load out of `loadSeed` for those suites, or modify the two scenarios to use an uncached anchored question."

### `openspec/changes/evaluation-cache/proposal.md`

- **Why, line 21 (N4).** "The decisions D1–D13" → "The decisions D1–D14 (and the post-audit amendments of D3, D5, D6 and D8)".
- **Impact → Tests (N1).** After the four tests, add: "The exact call-order and call-count assertions of eight existing explain tests are extended with the cache calls (`explain.spec.ts:106, 129, 183, 306, 322, 769`; `explain-verification.spec.ts:165, 206`): the precedence they pin now includes the lookup and the save."

### `openspec/changes/evaluation-cache/tasks.md`

- **7.3 (N2).** Add the third scenario "The refund demo question answers no-anchor without the model over the seed".
- **9.2 (N1).** "the four of 6.9 and 7.1" → "the four of 6.9 and 7.1, and the eight exact `order`/`calls` assertions of design C5, extended with the cache calls (never filtered)".
- **10.1 (N7).** Add "and the three write-error mappers of `postgres-store.ts` folded into one factory (design C4); `tests/unit/store` and `tests/integration/store` stay green".
- **15.1 (N4).** "D1–D13" → "D1–D14 and the post-audit amendments".
- **16.1 and 16.9 (N5).** After the ADR path, add "(on `feature/DIS-101-readme-entrega-2`; if it is not yet in `feature/entrega-2-CRN` when the PR opens, cite it by branch and name in the PR body)".

### Linear DIS-21 (do not touch the `[original]` block; Spanish text in the `[enhanced]` part, under «Decisiones tras la auditoría de specs»)

- **Ampliación de D14 (N2), add:**
  > «Un escenario de integración sobre la semilla fija esta decisión: la Q6 responde `UNKNOWN` `no-anchor` con `200`, sin llamada al modelo, en evaluación y en live (`http-ask` "Ask from the answer cache"). Si la semilla cambia y la Q6 llega a anclar, ese test falla, y DIS-26 tiene que volver a decidir si necesita golden.»
- **Ampliación de D6 (N1), add:**
  > «Además, ocho aserciones exactas de orden y de recuento de llamadas en `tests/unit/explain/explain.spec.ts` y `explain-verification.spec.ts` se amplían con las llamadas de la caché (búsqueda en el paso 3, guardado antes de la fila). No se filtran: fijan la precedencia que este cambio modifica.»

### Resolution of run 2 (main session, 2026-10-17)

Every finding resolved as lead engineer with `/opsx:update` (destination **A**; `design.md` →
Follow-ups). Decisions added to the DIS-21 `[enhanced]` description ("Ampliación de D14/D6/D4
(segunda pasada)").

| Finding | Resolution |
|---|---|
| N1 | Extend, never filter: design C5 and C8 list the eight exact `order`/`calls` assertions and their new expected values; proposal Impact and task 9.2 name them; `QueryLogParts.cacheHit` is optional (`false` when absent), so `usage.spec.ts` does not change. |
| N2 | New `http-ask` scenario "The refund demo question answers no-anchor without the model over the seed" (task 7.3) pins D14. |
| N3 | `explain` "Answer cache" → Save: "An answer served from the cache SHALL NOT be saved again"; design C6. |
| N4 | "D1–D14 and the post-audit amendments" and "C1–C11" in the proposal, design and task 15.1. |
| N5 | Tasks 16.1 and 16.9 say the ADR lives on `feature/DIS-101-readme-entrega-2` and is cited by branch and name until it reaches the base branch. |
| N7 | Task 10.1 covers the fold of the three write-error mappers. |
| N9 | B follow-up for DIS-26 in design → Follow-ups and in the DIS-21 description. |

## Run 3

Verdict: CHANGES REQUIRED

- Date: 2026-10-17
- **What I read:**
  - the change: `proposal.md`, `design.md`, `tasks.md`, and the five deltas (`answer-cache`, `explain`, `graph-store`, `http-ask`, `cli-ask`);
  - `reports/2026-10-17-spec-audit.md` (runs 1 and 2, with both resolution tables);
  - Linear DIS-21 (with `[enhanced]` D1–D14, "Decisiones tras la auditoría de specs" and the second-pass amendments) and its 3 comments (handovers from DIS-78, DIS-41 and DIS-39);
  - the parent DIS-16 (no comments);
  - `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (the explain/ask notes), `openspec/specs/explain/spec.md` (requirement list, "Prompt and evidence ids", "Untrusted content sanitization");
  - the code: `packages/core/src/context/anchor.ts`;
  - the tests: `tests/support/explain-doubles.ts`, `tests/unit/explain/{explain,explain-verification,explain-sanitization}.spec.ts`, `tests/unit/api/{ask.spec.ts,support.ts}`, `tests/unit/cli/ask-command.spec.ts`, `tests/integration/explain/explain.spec.ts`, `tests/integration/cli/ask-command.spec.ts`, `tests/integration/api/ask.spec.ts`;
  - the `docs/adr/` listing.
- **Treated as delegated decisions, not reopened:** D1–D14 and the post-audit amendments of D3, D4, D5, D6, D8 and D14. The agent took them as lead engineer under ADR `20261016-autonomous-workflow-run-entrega-2`, and the author reviews them later.

**Questions for the author:** none.

---

### 0. Run 2 findings — resolution check

| Finding | Status | Where |
|---|---|---|
| N1 | **Resolved for the eight assertions it named**, but the same kind of breakage exists in two tests run 2 did not see (P1) | design C5 lines 175-179 and C8 lines 264-276; proposal lines 104-106; task 9.2; DIS-21 "Ampliación de D6 (segunda pasada)"; `QueryLogParts.cacheHit?` in C6 line 199 |
| N2 | Resolved | `http-ask` delta lines 141-149; task 7.3; D14 amendment. The claim holds: `anchor.ts` drops `como`, `los` and `de`/`un`/`se` (stop words or shorter than 3), so the terms are `gestionan`/`gesti`, `reembolsos`/`reemb`, `pedido`/`pedid`. The run 2 grep for the shorter `gest`/`reem`/`pedi` covers them (see P2 for the wording). |
| N3 | Resolved | `explain` delta lines 912-913; C6 line 201 |
| N4 | Resolved | proposal line 21; design lines 26-28 and 346; task 15.1 |
| N5 | Resolved | tasks 16.1 and 16.9. The ADR is still missing from `docs/adr/` on this branch, as the tasks now say. |
| N7 | Resolved | task 10.1 |
| N9 | Resolved | design → Follow-ups lines 354-359; DIS-21 D14 amendment |

---

### 1. Scope against the ticket

**Clean.**
- Everything follows from DIS-21's DoD and `[enhanced]` D1–D14 and their amendments.
- The run 2 additions add no new scope:
  - the refund scenario pins D14;
  - the extended assertions follow from the modified precedence;
  - "a hit is never saved again" is the D4 amendment.
- The non-goals still match the ticket: DIS-26, DIS-34, CM-HU-14.1, CM-HU-19, DIS-9, no migration.

### 2. Inherited acceptance criteria

**Clean.**

| DIS-16 AC | Requirement → scenario | Status |
|---|---|---|
| AC1 hit with variants | explain "A cached question is answered from the cache in both modes"; answer-cache "Case, accent and punctuation variants share one key" | covered |
| AC2 evaluation miss | explain "Evaluation mode without an entry answers llm-required and saves nothing" | covered |
| AC3 fingerprint check | CM-HU-14.1 | out of scope, correct |
| AC4 `useCache` true/false | "A live answer is saved once…", "Turning the cache off…" | covered |
| AC5 save of a live miss | "A live answer is saved once…"; answer-cache "A stored response keeps the answer without its events" | covered |
| AC6 refund question | http-ask "The refund demo question answers no-anchor without the model over the seed" (D14) | covered |

DIS-21's own `[enhanced]` ACs all have a requirement and a scenario.

### 3. Missing scenarios

**Clean.** Every MUST/SHALL clause added since run 2 has a scenario:
- "SHALL NOT be saved again" is checked by the hit-count 2 assertion of "A cached question … both modes" and by "A live answer is saved once…".
- The refund pinning has its own scenario.

### 4. Ambiguity

None of fast / easy / secure / efficient / many / appropriate / robust appears with a vague meaning.

- **P3 (improvable).** `explain` delta, "Precedence and UNKNOWN answers", lines 124-127: "The source reader SHALL receive the pack's batched read and, for `broken-evidence` and an answer with statements only, the verification reads …; none for a cache hit, `invalid-model-output` or `no-evidence`."
  - **Problem:** "none" reads as "no verification read". A cache hit also gets no pack read. The "Answer cache" → Lookup paragraph says so ("without … reading the source"), but this count sentence does not.
  - **Fix:** "The source reader SHALL receive no call for a cache hit (no pack is built). Otherwise it receives the pack's batched read and, for `broken-evidence` and an answer with statements only, the verification reads of step 11 after the model. `invalid-model-output` and `no-evidence` get no verification read."

### 5. Open decisions

- **P1 (blocking). Two more existing tests ask the same question twice on one store, and the change does not say how to update them.**
  - **The tests:**
    - `tests/unit/explain/explain.spec.ts:368-392` "builds the pack with the hops and budget of the request" (not a scenario).
      - It calls `explain(d.deps, { …Q1, hops: 1 })` and then `explain(d.deps, { …Q1, tokenBudget: 1000 })` on the same `doubles()`.
      - The first answer is stored with one `current` statement (the default verifier entails), so it is cacheable and gets saved.
      - The key ignores `tokenBudget`/`hops` (the change's own rule, "The cache key ignores the budget and the hops"), so the second call is a hit.
      - Then `d.model.requests.filter(answer)[1]` is `undefined`, and `sentSpans(1)` throws.
    - `tests/unit/explain/explain-sanitization.spec.ts:62-99` "Untrusted text reaches the prompt wrapped and unchanged".
      - It calls `explain(d.deps, { …question })` twice on the same `project(...)` doubles. The script `citingIds('ok', [['E1']])` makes the first answer stored and cacheable.
      - The second call becomes a hit and writes no claim, so `d.loaded.storedClaims()` holds one claim.
      - `two` is then `undefined`, and `expect(two).toBe(one)` fails.
  - **Why it is blocking:**
    - Task 9.2 allows edits only to "the four of 6.9 and 7.1, and the eight exact `order`/`calls` assertions of design C8".
    - `docs/openspec-tasks-mandatory-steps.md` §6.2 forbids weakening assertions.
    - So the implementer would have to choose alone between dropping the second call (which weakens the test), giving each call its own doubles, or sending `useCache: false`. This is the same open decision as N1. Run 2 checked only `explain-sanitization.spec.ts:363-396` and `explain-verification.spec.ts`.
  - **What I checked and found unaffected** (each run builds its own doubles or store, or never reaches a cacheable answer):
    - `explain.spec.ts:134-174, 447-475, 1131-1138`;
    - `explain-sanitization.spec.ts:231, 288-299, 363-418`;
    - `explain-verification.spec.ts:386-522, 954-991, 1149-1184, 1231-1267`;
    - `tests/unit/api/ask.spec.ts`: `askApp()` is a fresh store in evaluation mode, and the use-case seams record requests;
    - `tests/unit/cli/ask-command.spec.ts`: `run()` builds a new store each time (line 92);
    - the integration explain, API and CLI specs: one ask per test, inside the harness transaction or a cleaned-up pool project.
  - **Fix (decision to record):**
    - On the repeat call of both tests, send `useCache: false`, as already done for the three B1 scenarios.
    - Neither main scenario describes the repeat:
      - the hops test is not a scenario;
      - "Untrusted text reaches the prompt wrapped and unchanged" (`openspec/specs/explain/spec.md:307-317`) explains once, and its second call checks prompt-hash stability ("Prompt and evidence ids" → "the same question and pack SHALL give the same hash").
    - So no spec delta is needed. Only test edits are needed, to be listed in C8, proposal Impact, task 9.2 (or 6.9) and the DIS-21 D6 amendment.
    - Do not give them separate doubles: the hops test compares two packs built from one store, and the hash test compares two provenances of one store. `useCache: false` keeps both assertions as strict as they are.

### 6. Contradictions inside the change

- **P4 (improvable). Stale counts after N2.**
  - **Design C8** lines 276-277: "`tests/integration/api/ask.spec.ts`: the two `http-ask` 'Ask from the answer cache' scenarios". There are now three.
  - **Proposal → Capabilities** → `http-ask` line 79: "new requirement 'Ask from the answer cache' (a hit over the seed, the spent budget)". It leaves out the refund `no-anchor` scenario.
  - **Fix:** in C8, "the three `http-ask` 'Ask from the answer cache' scenarios". In the proposal, "(a hit over the seed, the spent budget, the refund demo question answering `no-anchor` without the model, D14)".

Otherwise **clean.**

### 7. Contradictions with the project

**Clean.**
- The MODIFIED requirements are copied in full and only change what they say they change.
- No ADR in `docs/adr/` is contradicted. The four 2026-10-1x ADRs say nothing about the answer cache.
- `docs/project-context.md` lines 612, 620, 623 and 893 are the stale notes that C10 and task 14.2 already list.
- `backend-standards.md` §4 (closed sets) and §7 (factories) are respected.

The open relaxation of `docs/openspec-tasks-mandatory-steps.md` §3 (PR without confirmation, the agent merges) rests on the autonomous-run ADR. Tasks 16.1 and 16.9 cite it by branch and name. It is not reopened here.

### 8. Contrast with the real code

- **P1** (above) is the code-facing finding: `tests/unit/explain/explain.spec.ts:384-385` and `tests/unit/explain/explain-sanitization.spec.ts:76-77, 97-98`.
- **P2 (improvable). Prefixes misquoted in D14 and design C11.**
  - Design C11 (lines 303-305) and the DIS-21 D14 text give the search terms as `gestionan`/`gest`, `reembolsos`/`reem` and `pedido`/`pedi`.
  - `anchor.ts:13-16, 57-66` adds a **5-character** prefix (`PREFIX_LENGTH = 5`), and only to tokens of at least 6 characters. So the terms are `gestionan`/`gesti`, `reembolsos`/`reemb`, `pedido`/`pedid`.
  - The conclusion holds: the 4-character grep is a superset and found 0 matches. But the cited terms are wrong.
  - **Fix:** correct the three prefixes in C11, and add an `[enhanced]` amendment (the D14 bullet itself is not the `[original]` block, but amend it rather than rewrite it, for traceability).
- **Checked and consistent:**
  - the `doubles()` wrapper only records `findClaimsOverlapping`, `saveClaims` and `saveQueryLog` today (`explain-doubles.ts:103-117`), as C5 says it must extend;
  - `counting()` in `tests/unit/api/support.ts:96-109` is a `Proxy`, so the four new `StorePort` methods are counted with no change;
  - the eight N1 line numbers still match the current tests (`explain.spec.ts:106, 129, 183, 306, 322, 769`; `explain-verification.spec.ts:165, 206`);
  - `explain.spec.ts:83` and `:233` use `toMatchObject`, so the new counters do not break them.

### 9. Task size

**Clean.** P1 adds two one-line edits (a `useCache: false` each) to task 6.9 or 9.2, and both still fit in one turn.

### 10. Mandatory steps

**Clean.**
- Step 0 is first and labelled (0.1 sets the Linear state, 0.2–0.3 the branch, 0.4 the baseline).
- MANDATORY labels are on 9, 11, 12, 13, 14 and 16; AGENT MUST EXECUTE is on 12, 13 and 16.
- Report paths and patterns are named (11.7, 12.8, 16.4–16.6).
- State restoration is in 11.6, 12.5 and 12.7.
- Manual step 12.4 covers the success path, invalid input and a missing resource.
- Pre-merge Review is last, with archive before merge (16.9); the run's ADR is cited.

### 11. Traceability

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
| explain · Explain request (MOD) | A non-boolean cache flag is rejected before the store | 5.1 |
| | 6 unchanged (+ N1 `calls` assertions) | 9.2, 9.3 |
| explain · Precedence and UNKNOWN answers (MOD) | A question without anchor is not looked up in the cache | 6.3 |
| | 14 unchanged (+ N1 `order` assertions) | 9.2, 9.3 |
| explain · Untrusted content sanitization (main, not modified) | Untrusted text reaches the prompt wrapped and unchanged (**its test's repeat call breaks, P1**) | **hole: no task updates `explain-sanitization.spec.ts:76-98`** |
| explain · (non-scenario test) | builds the pack with the hops and budget of the request (**P1**) | **hole: no task updates `explain.spec.ts:368-392`** |
| explain · Explain events and logging (MOD) | 5 unchanged; `answer_not_cached` via the Answer cache scenarios | 5.2, 6.6; 9.3 |
| explain · Answer usage (MOD) | 4 unchanged; hit usage via 2.6 / 6.1 | 6.2; 9.3 |
| explain · Query log (MOD) | An answer leaves one query log row the daily spend sees (modified) | 6.9 |
| | 14 unchanged | 9.3 |
| explain · Answer with typed statements (MOD) | A valid but irrelevant citation is cited and never a fact (modified) | 6.9 |
| | 15 unchanged | 9.3 |
| explain · Answer cache (ADD) | A cached question is answered from the cache in both modes | 6.1, 6.2 |
| | A hit over the database counts in its entry and its row | 6.8 |
| | Evaluation mode without an entry answers llm-required and saves nothing | 6.3 |
| | A live answer is saved once and a repeat is served from the cache | 6.4 |
| | Turning the cache off calls the model and replaces the entry | 6.5a |
| | An invalid entry is a miss and a live answer replaces it | 6.5a |
| | A no-evidence unknown is cached and served without the model | 6.5a |
| | Answers that are not cacheable are not saved | 6.5b |
| | The cache key ignores the budget and the hops | 6.5b |
| | The cache is scoped by project | 6.3 |
| | A failed cache write still answers and says so without leaking | 6.6 |
| | Other cache write errors propagate after the row | 6.6 |
| | A hit whose row is not written still answers and says so | 6.6 |
| | A failing cache lookup or hit record stops before the model | 6.3 |
| | A cached question answers with the daily budget spent | 6.7 |
| graph-store · Answer cache entries | A saved entry is found by its project and key | 4.1, 4.2 |
| | Saving a key again replaces its entry | 4.3a |
| | Concurrent saves of one key leave one entry | 4.4 |
| | The most recent of duplicated entries is found | 4.3a |
| | Touching an entry records the hit | 4.3a |
| | Invalidating a project deletes only its entries | 4.3a |
| | Invalid cache arguments are rejected before querying | 4.3b |
| | Cache calls on an unknown project fail without writing | 4.3b |
| | A failed cache write does not leak | 4.3b |
| | A failed rollback of a cache write is a write failure | 4.5 |
| | Cache writes on the store's own connections commit | 4.4 |
| | A store that cannot give a connection fails cache writes with its own error | 4.5 |
| | The in-memory double keeps, checks and fails cache entries | 3.1, 3.3 |
| http-ask · Ask request validation (MOD) | Optional fields are forwarded as the use case expects | 7.1, 7.2 |
| | 4 unchanged | 9.3 |
| http-ask · Ask events and verification verdicts (MOD) | Requests to one API share verification verdicts (modified) | 7.1 |
| | The answer's events are logged by level (unchanged) | 9.3 |
| http-ask · Ask from the answer cache (ADD) | A cached question answers from the cache over the seed | 7.3 |
| | A spent daily budget still answers a cached question | 7.3 |
| | The refund demo question answers no-anchor without the model over the seed | 7.3 |
| cli-ask · Ask from the answer cache (ADD) | Evaluation mode prints a cached answer | 8.1 |

**Two holes, both from P1: blocking.** Every scenario written in the deltas maps to a task. The holes are two existing tests that this change breaks and that no task is allowed to edit.

---

### New findings — summary

| Id | Point | Severity | Subject |
|---|---|---|---|
| P1 | 5, 8, 11 | **blocking** | Two more existing tests repeat a cacheable question on one store (`explain.spec.ts:368-392`, `explain-sanitization.spec.ts:62-99`). They break, and task 9.2 does not allow editing them. |
| P2 | 8 | improvable | D14 / C11 quote 4-character prefixes; `anchor.ts` uses 5 (`gesti`, `reemb`, `pedid`) |
| P3 | 4 | improvable | The source-reader count sentence does not say a cache hit makes no pack read |
| P4 | 6 | improvable | C8 says "two" http-ask cache scenarios (now three); proposal Capabilities omits the refund scenario |

---

### Corrections to apply

### `openspec/changes/evaluation-cache/design.md`

- **C8, "Existing tests whose contract this change modifies" (P1).** After the eight-assertion list, add:
  > "Two more existing tests ask the same cacheable question twice on one store, and their repeat would now be a cache hit. They send the repeat with `useCache: false`, because they are about the pack's options and the prompt hash, not the answer cache:
  > - `tests/unit/explain/explain.spec.ts` 'builds the pack with the hops and budget of the request': the second call (`tokenBudget: 1000`) sends `useCache: false`;
  > - `tests/unit/explain/explain-sanitization.spec.ts` 'Untrusted text reaches the prompt wrapped and unchanged': the second call sends `useCache: false`.
  >
  > Neither main scenario describes the repeat, so no spec delta is needed."
- **C8, line 276-277 (P4).** "the two `http-ask` 'Ask from the answer cache' scenarios" → "the three `http-ask` 'Ask from the answer cache' scenarios".
- **C11, lines 303-305 (P2).** "`gestionan`/`gest`, `reembolsos`/`reem` and `pedido`/`pedi`" → "`gestionan`/`gesti`, `reembolsos`/`reemb` and `pedido`/`pedid` (`PREFIX_LENGTH` 5 of `anchor.ts`; `como`, `los`, `se`, `de`, `un` are dropped)".
- **Follow-ups (run 3).** Add: "Spec audit run 3 (CHANGES REQUIRED) — all **A**: P1 (two more repeated-question tests send the repeat with `useCache: false`: C8, proposal Impact, task 9.2), P2 (prefixes in C11), P3 (source-reader count sentence), P4 (C8 and proposal counts)."

### `openspec/changes/evaluation-cache/proposal.md`

- **Impact → Tests (P1).** After the sentence on the eight assertions, add: "Two more existing unit tests that repeat a cacheable question on one store send the repeat with `useCache: false`: 'builds the pack with the hops and budget of the request' (`explain.spec.ts`) and 'Untrusted text reaches the prompt wrapped and unchanged' (`explain-sanitization.spec.ts`)."
- **Capabilities → `http-ask` (P4).** "(a hit over the seed, the spent budget)" → "(a hit over the seed, the spent budget, and the refund demo question answering `no-anchor` without the model, D14)".

### `openspec/changes/evaluation-cache/specs/explain/spec.md`

- **MODIFIED "Precedence and UNKNOWN answers", count paragraph (P3).** Replace "The source reader SHALL receive the pack's batched read and, for `broken-evidence` and an answer with statements only, the verification reads of step 11 after the model; none for a cache hit, `invalid-model-output` or `no-evidence`." with:
  > "The source reader SHALL receive no call for a cache hit (no pack is built). Otherwise it receives the pack's batched read and, for `broken-evidence` and an answer with statements only, the verification reads of step 11 after the model. `invalid-model-output` and `no-evidence` get no verification read."

### `openspec/changes/evaluation-cache/tasks.md`

- **6.9 (P1).** Append: "; and, in the same way, the repeat call of `tests/unit/explain/explain.spec.ts` 'builds the pack with the hops and budget of the request' and of `tests/unit/explain/explain-sanitization.spec.ts` 'Untrusted text reaches the prompt wrapped and unchanged' sends `useCache: false` (design C8); they fail without it once 6.4 is green".
- **9.2 (P1).** "the four of 6.9 and 7.1, and the eight exact `order`/`calls` assertions of design C8" → "the four of 6.9 and 7.1, the two repeated-question unit tests of 6.9 (design C8), and the eight exact `order`/`calls` assertions of design C8".

### Linear DIS-21 (do not touch the `[original]` block; Spanish text in the `[enhanced]` part, under «Decisiones tras la auditoría de specs»)

- **Ampliación de D6 (tercera pasada) (P1), add:**
  > «Otros dos tests unitarios vigentes repiten una pregunta cacheable sobre el mismo store: "builds the pack with the hops and budget of the request" (`tests/unit/explain/explain.spec.ts`) y "Untrusted text reaches the prompt wrapped and unchanged" (`tests/unit/explain/explain-sanitization.spec.ts`). Con la caché activa, la repetición sería un acierto y los dos fallarían, así que la repetición se envía con `useCache: false`. Comprueban las opciones del pack y la estabilidad del hash del prompt, no la caché de respuestas. Ningún escenario principal describe esa repetición, así que la spec no cambia.»
- **Ampliación de D14 (tercera pasada) (P2), add:**
  > «Corrección: `anchor.ts` añade un prefijo de 5 caracteres (`PREFIX_LENGTH`), así que los términos de la Q6 son `gestionan`/`gesti`, `reembolsos`/`reemb` y `pedido`/`pedid`; `como`, `los`, `se`, `de` y `un` se descartan. La búsqueda de `gest`, `reem` y `pedi` en `seeds/graph-dump.sql` cubre estos términos, y la conclusión no cambia.»

### Resolution of run 3 (main session, 2026-10-17)

Every finding resolved as lead engineer with `/opsx:update` (destination **A**; `design.md` →
Follow-ups). Decisions added to the DIS-21 `[enhanced]` description ("Ampliación de D6/D14 (tercera
pasada)").

| Finding | Resolution |
|---|---|
| P1 | The repeat call of "builds the pack with the hops and budget of the request" and of "Untrusted text reaches the prompt wrapped and unchanged" sends `useCache: false` (design C8, proposal Impact, tasks 6.9 and 9.2); no spec delta, since neither main scenario describes the repeat. |
| P2 | Design C11 and the DIS-21 description give the 5-character prefixes (`gesti`, `reemb`, `pedid`). |
| P3 | `explain` "Precedence and UNKNOWN answers": the source reader receives no call for a cache hit; otherwise the pack's read plus the verification reads where they apply. |
| P4 | Design C8 says three `http-ask` cache scenarios; the proposal's `http-ask` line names the refund scenario. |
