CHANGES REQUIRED

**Change:** `openspec/changes/semantic-cache` · **Ticket:** DIS-67 (CM-HU-19.1), parent DIS-46 (CM-HU-19), both loaded from Linear with their comments · **Audit:** first round, 2026-11-03

**Questions for the author** (they do not block the corrections below; the agent applies the default if there is no answer):
- Q1. A comment on DIS-46 (LIDR review, 2026-10-16) asks "the task that first uses embeddings for real" to decide in a short ADR whether embeddings stay on `LlmPort.embed()` or move to an `EmbeddingPort`. DIS-67 is that task, so by default the ADR belongs to this change (B1). Confirm that it does not belong to DIS-69.

---

## 1. Scope against the ticket

Clean. Each item follows from DIS-67 `[original]` ("SQL, threshold, check order"; DoD "a rephrasing hits, a different topic does not; without `embed()` it degrades without error") and from its `[enhanced]` part:
- the 768 migration and the change of `file`/`symbol` columns follow from the DIS-46 note "Decisión de embeddings para esta HU";
- the test-double changes follow from S2/S9;
- docs and the PowerShell check follow from the mandatory steps and `docs/AUTONOMOUS-RUN.md` §6.

The hit rate, `UsagePanel`, and seed and golden vectors are correctly left to DIS-69. No invented scope was found.

- **Improvable (I7).** The change departs from the ticket's own `[enhanced]` text in two places:
  - AC4 lists `not-configured` among the causes of `semantic_cache_skipped`, and S1 removes it;
  - D11 lists an `answer-cache` MODIFIED delta, and S12 drops it.

  Both are justified and announced in the propose comment, but AC4 in `[enhanced]` still says the opposite of the spec. Add a note to the `[enhanced]` part (see "Corrections → Linear").

## 2. Inherited acceptance criteria

The parent's ACs that DIS-67 inherits through its DoD are all covered by a requirement and a scenario:

| Parent AC (DIS-46) | Requirement | Scenario(s) |
|---|---|---|
| Rephrasing hits, `cacheHit`, `hit_count` +1, `embed()` once, no `complete()` | semantic-cache "Similarity lookup in explain" | "A rephrased question is answered from the similar entry"; explain "A similarity hit over the database counts in its entry and its row" |
| Different topic is answered live | same | "A question on another topic is answered live and saved with its embedding"; "The threshold is inclusive at the boundary" |
| Two projects: only that project's entries | same + graph-store "Answer cache entries" | "The most similar entry of the project wins"; "A saved embedding is found by similarity within its project"; "The similarity search is exact whatever the other projects hold" |
| Evaluation: exact hit only, else `UNKNOWN llm-required`, never fails | semantic-cache "Similarity lookup…", "Degradation without embeddings" | "Evaluation mode requests no embedding"; degradation scenarios |
| Hit rate 0.4 in CLI and `UsagePanel` | not inherited (DIS-69, D10) | — |

- **Blocking (B1).** The parent's comment (DIS-46, 2026-10-16) adds an obligation that is not an AC but is explicitly addressed to this task: *"Decidir y documentar (ADR corto) si se mantiene `LlmPort.embed()` o se separa un `EmbeddingPort` … Si cambia el diseño, actualizar la nota (b) del comentario de DIS-101"*. The change does the opposite:
  - `design.md` → Non-Goals says "no new port" with no reasoning against the reasons the comment gives (a provider or model for embeddings that differs from the chat one; degrading in evaluation mode without breaking `explain`);
  - the end of Decisions says "No ADR";
  - task 9.4 records "no ADR".

  Correction:
  - add decision S13 to `design.md`: keep `LlmPort.embed()`, with the reason (`LLM_EMBED_MODEL` already allows a separate model; `mode` already drives degradation; the S1/S2 classification covers a failing endpoint);
  - write `docs/adr/YYYYMMDD-embeddings-stay-on-llm-port.md` from `_template.md` and add it to the `docs/adr/README.md` index;
  - change 9.4 to "write the ADR";
  - check the note (b) of DIS-101 in `readme.md`.

  The dimension change (a migration of three columns) also meets the ADR README criterion ("cost more than a day to revert" or affect more than one module: core, the store adapter, the LLM adapter, docs), so the same ADR or a second one should record D3/S7.

## 3. Missing scenarios

- **Blocking (B6).** These clauses have no scenario that observes them:
  - semantic-cache "Similarity lookup in explain": "A question with no anchor or with an empty key requests no embedding";
  - explain "Precedence and UNKNOWN answers": "The model SHALL receive … none [embedding request] for an invalid request, `no-anchor`".

  The existing scenarios ("A question without anchor is unknown in both modes…") count completions only: today the scripted model records only `complete` in `requests`. An implementation that embeds before anchoring (for example, in parallel with it) would pass every listed test. Correction: add a scenario to semantic-cache "Similarity lookup in explain":

  > *Scenario: A question without anchor requests no embedding* — **GIVEN** acme-shop in the in-memory store and a live scripted model with usable embeddings that records its embedding requests · **WHEN** `¿Dónde vive el ornitorrinco?` is explained · **THEN** the answer is `UNKNOWN` `no-anchor`, the model received 0 embedding requests and 0 completions, and no exact or similarity lookup was made.

  Map it to a task in group 6.4.
- **Improvable (I4).** `useCache: false` with an embedding request that fails with `LlmUnavailable` (other than `not-configured`) or with `BudgetExhausted`: the literal reading of "Degradation without embeddings" and of design S4 gives the `semantic_cache_skipped` event even though no lookup was skipped. Nothing pins it. Add to "Turning the cache off embeds only for the save" a second WHEN with an embedding that fails with `timeout`: THEN the answer is the live one, its events start with `{ type: 'semantic_cache_skipped', code: 'embedding-unavailable' }`, and the new entry has no embedding.
- **Improvable (I10).** "The answer SHALL NOT say whether the hit was exact or by similarity": the rephrasing scenario lists fields but does not assert that no other field exists. Add to its THEN: "and the answer has exactly the keys of an exact-key hit's answer (`answer-cache`, 'Answer of a cache hit')".

## 4. Ambiguity

There are no vague words in the requirements or scenarios. In `design.md`:
- **Improvable (I3).** S3: "with `ef_search` 40 and **many** entries of other projects" and "The cache of one project is **small**". These are rationale, acceptable, but better as "more entries of other projects nearer the query than `ef_search` (40)" and "one entry per distinct question".
- **Improvable (I3).** Risks, R1: "revisit with DIS-69 if a project's cache grows **large**". This is not measurable, and it routes work to another ticket. Correction: "accepted (D): the lookup scans the project's rows with an embedding; acceptable while a project holds ≤ 1 000 entries (one per distinct question); beyond that, a new change measures it". Remove "with DIS-69".

## 5. Open decisions

- **Blocking (B2).** Changing the embedding model at the same dimension is left undecided, and it is justified by a misquoted standard.
  - Proposal → Non-goals says "changing model means invalidating the cache, `docs/backend-standards.md` §5".
  - design S7 says that §5 says "changing the model invalidates the cache" and "is not edited".
  - What §5 actually says (`docs/backend-standards.md:100-102`) is: "Embedding dimensions are fixed to the model in use: changing the model means re-embedding and reindexing everything".

  Nothing in the change invalidates or re-embeds when `LLM_EMBED_MODEL` changes to another 768-dimension model. Stored vectors of model A would be compared with queries of model B, and false hits would be served silently, with no event: the change's own "false similarity hit" risk, unmitigated. The DIS-46 note also asks to correct the DIS-5 non-goal ("changing model is reindexing, not migrating"), and the change only does that in a TSDoc. The implementer and the docs writer must decide this alone.

  Correction:
  1. Add requirement text to semantic-cache "Embedding of a saved answer": "Stored embeddings are only comparable with embeddings of the same model: after `LLM_EMBED_MODEL` changes, the operator SHALL invalidate the answer cache of every project (a full reindex, `POST /api/projects/{id}/index` with `incremental: false`, or `invalidateCache`) before asking; the system does not detect the change."
  2. Add a Risks line in `design.md` with that mitigation.
  3. Fix the quotes in the proposal and in S7.
  4. Add to group 9 an edit of `docs/backend-standards.md` §5 that says: a model of another dimension needs a migration (DIS-46 note); a model of the same dimension needs every stored vector discarded (cache invalidation); re-embedding is not done.
  5. State the same rule in `.env.example`, on the `LLM_EMBED_MODEL` line.
- **Blocking (B4).** graph-store, scenario "The in-memory double searches by similarity like the database":
  - It says "the entries of the two previous similarity scenarios". In file order those are "The most similar entry wins…" and "The similarity search is exact…", with "The in-memory double keeps, checks and fails…" in between.
  - It then requires "the boundary search with Q and minimum 0.85 resolving to its entry with a similarity of exactly 0.85". No database scenario searches with Q and minimum 0.85: "A saved embedding is found…" uses Q with 0.8 and 0.9, and "The most similar entry wins…" uses a different Q at 0.88/0.95.

  The test author has to invent the fixture and the expectation. Correction: rewrite the GIVEN/WHEN/THEN with explicit data, for example:
  - **GIVEN** the in-memory store with the entries of "A saved embedding is found by similarity within its project" (R₁ with E1, R₂ without an embedding, R₃ with E1 in the second project) and of "The most similar entry wins and ties go to the most recent" (A, B, C, D with their creation instants);
  - **WHEN** the searches of those two scenarios are made, plus one with Q (first five components `17, 10, 3, 1, 1`) and minimum 0.85 in the first project, one with an embedding of `EMBEDDING_DIMENSIONS − 1` components, and one with a similarity failure injected as an `Error`;
  - **THEN** each of the first resolves as in those scenarios; the Q/0.85 search resolves to R₁ with a similarity exactly `0.85`; the short embedding fails with `InvalidStoreQuery` naming `embedding`; the injected failure rejects with that `Error`.

  Do the same for the 200-entry scenario if it is meant to be covered (say so explicitly or exclude it).

## 6. Contradictions inside the change

- **Blocking (B3).** The change contradicts the main `explain` "Query log" requirement, which the change does not modify. The main spec `openspec/specs/explain/spec.md:1183-1187` says:
  - "A call resolves when the model returns a result" (an embedding request is a model call);
  - "No row SHALL be written when explain fails before any call resolved: … a failure of the answer cache lookup or of the recording of a hit, … or the `LlmUnavailable` and `BudgetExhausted` of the `answer` call".

  The semantic-cache delta ("Degradation without embeddings") says "its result alone does not make a call 'resolved' in the sense of `explain`, 'Query log'". The explain delta ("Precedence…") requires no row for a failure of the similarity lookup and for an embedding error other than `LlmUnavailable`/`BudgetExhausted`. After `/opsx:archive`, the main "Query log" would say an embedding that resolved makes a row mandatory before propagating, while semantic-cache and "Precedence" say no row. Correction:
  1. Add `### Requirement: Query log` to `specs/explain/spec.md` as MODIFIED (full text with every existing scenario).
  2. Change the sentence to: "A call resolves when a completion (`answer` or `verify`) returns a result …; an embedding request never counts as a resolved call."
  3. Extend the no-row list with "a failure of the similarity lookup or of the recording of its hit, a failure of the embedding request other than `LlmUnavailable` and `BudgetExhausted`".
  4. Update the 7.3 mapping.
- **Improvable (I1).** The report numbering is inconsistent:
  - design S11 and the Follow-ups row S11 put the calibration in "tasks group 12" and the "step 12 report", but the calibration is task 11.2 and group 12 is E2E (also "paso 11" in the Linear propose comment);
  - tasks 0.3 ("totals for the step 11 report"), 3.2 ("migration review … step 11 report"), 7.2 ("list every edited existing test … step 11 report") and 9.4 ("step 11 report") contradict 10.7, which puts the baseline, the edited tests, the migration review, Stryker and privacy in the **step 10** report (`…-10-test-and-state-verification.md`).

  Correction:
  - 0.3, 3.2, 7.2 → "step 10 report";
  - 9.4 → "step 10 report" (or the ADR, per B1);
  - S11 and its Follow-ups row → "tasks 11.2, step 11 report (`…-11-manual-interface-testing.md`)".
- **Improvable (I6).** explain delta, "Answer cache" → Lookup: "explain goes on to step 4 without an event (only a skip may add its `semantic_cache_skipped` event)" contradicts itself. Rewrite as: "after a similarity miss explain goes on to step 4 without an event; after a skipped similarity step it goes on with the `semantic_cache_skipped` event of `semantic-cache`, 'Degradation without embeddings', when that requirement adds one; in evaluation mode a miss of the key answers exactly the `UNKNOWN` `llm-required` of step 4."

## 7. Contradictions with the project

- **Blocking: B2** (backend-standards §5 misquoted and left wrong, see point 5).
- **Blocking: B3** (main `explain` "Query log", see point 6).
- **Blocking: B1** (DIS-46 comment and `docs/adr/README.md` criterion, see point 2).
- **Improvable (I8).** `docs/backend-standards.md:92-96` requires that migrations follow "Expand → Backfill → Migrate reads → Contract", and treats "truncating `ALTER TYPE`" as a reason to review. Migration 0005 is a single truncating type change (`USING NULL`). S6 explains why nothing is lost on up, but it does not say why the expand/contract rule does not apply. Add to S6: "Exception to Expand→Contract: no code reads or writes the three columns before this change, and the up migration runs before the code that writes them; there is no reader to migrate. `/migration-review` must confirm it."
- `docs/backend-standards.md:145-148` (budget: "before every completion and every embedding"; "On exhaustion the use case degrades to cache-only"): consistent with S8 and the budget scenario.
- `openspec/specs/http-ask/spec.md:214-222` keeps a `dimension-mismatch` mapping with 768/1536. That is consistent: the mapping stays valid even though `explain` no longer propagates that error.

## 8. Contrast with the real code

The design matches the code:
- `packages/core/src/explain/explain.ts:319-331`: the insertion point between the exact lookup and `llm.mode === 'evaluation'`;
- `:189-197`: the rejection row only when `meter.resolvedCalls() > 0`;
- `packages/core/src/explain/usage-meter.ts:62,68`: `embed` is a pass-through, and `resolvedCalls` counts answer and verify only, as S8 says;
- `packages/adapters/store-postgres/src/queries.ts:433-456`: `FIND_CACHE_ENTRY` starts from `project`;
- `postgres-store.ts:240,432-452`: `runProjectQuery`, `INSERT_CACHE_ENTRY`;
- `tests/support/scripted-llm.ts:139-141`: `embed` throws a plain `Error`, as S9 says.

The test names cited in tasks 2.1, 3.1, 4.4, 5.3, 6.1 and 6.8 exist (for example `tests/unit/llm/llm-unavailable.spec.ts:31,68`, `tests/integration/store/migrations.spec.ts:27,450`, `tests/unit/explain/explain.spec.ts:92,126,197`, `tests/unit/cli/ask-command.spec.ts:236`).

- **Blocking (B5, also point 10).** `seeds/cache/acme-shop.json:16-17,151-152` already holds exact entries for `como se calcula el precio final de un pedido` and `como se validan los cupones`. The manual plan (11.3–11.5) assumes they do not exist:
  - In 11.3, "`ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` answers live and saves an entry whose `question_embedding` is not `NULL`" will be an exact hit on the seed entry: no live answer, no embedding saved. "¿Cómo se validan los cupones?" "answers live" will also be an exact hit.
  - So the expected similarity hit of the rephrasing cannot happen: the only matching entry, the seed's, has no embedding.
  - 11.4 (evaluation mode, exact question served from the cache) and the hits of 11.3 change `hit_count`/`last_hit_at` of seed rows. 11.7 deletes only rows created after the baseline and so leaves those counters changed. A save with `useCache: false` on a seeded key would delete a seed row that 11.7 does not recreate.

  Correction to 11.1–11.7:
  - in 11.1, record `id, question_normalized, hit_count, last_hit_at` of every acme-shop `cache_entry`;
  - in 11.3, first ask the price question with `useCache: false` through the API (or use a calibration pair whose keys are absent from `seeds/cache/acme-shop.json`) so that a live entry with an embedding exists, and state that the seeded coupon entry gives an exact hit, so the "different topic" check uses a question absent from the seed;
  - in 11.7, also restore the recorded `hit_count`/`last_hit_at` of the pre-existing rows and re-insert any seeded row a save replaced (or re-run `npm run db:seed` for acme-shop, recorded);
  - re-check that the 11.1 snapshot matches.

## 9. Task size

No task exceeds a single agent turn. The largest are 5.3 (two new Postgres scenarios and two extended existing tests), 6.6 (four scenarios, one at a time) and 4.5 (10 test files declare a `StorePort` double; bounded). Acceptable.

## 10. Mandatory steps

- Step 0 is the branch (0.1 `feature/dis-67-semantic-cache`, matching `BRANCH_PREFIX`), with 0.2 verification. ✓
- Sections are labelled: 7 `(MANDATORY)`, 9 `(MANDATORY)`, 10 `(MANDATORY)`, 11 `(MANDATORY - AGENT MUST EXECUTE)`, 12 `(MANDATORY if applicable - AGENT MUST EXECUTE)`, 14 Pre-merge last with the three checks in order, fixes on the same PR, archive commit before merge (the agent merging is allowed by `docs/AUTONOMOUS-RUN.md:135`). ✓
- Report path and name in 10.7 and 11.8. ✓
- **Blocking: B5** (restoration of mutated state in 11.7 is incomplete, see point 8).
- **Improvable (I2).** `docs/openspec-tasks-mandatory-steps.md` §2 lists the mandatory steps "in this order": Review tests → Run tests → Manual → E2E → Update docs → Pre-merge. The task list puts docs (9) before Run Tests (10). Move "Update Technical Documentation" after group 12, or record why docs must precede the docs gate in 10.3 (`npm run docs:coverage`). That reason is legitimate, but it should be stated.
- **Improvable (I5).** 11.2 may move `SEMANTIC_CACHE_MIN_SIMILARITY` within [0.80, 0.95] after the suite is green, and several scenarios hard-code values relative to 0.85:
  - the boundary vector `17,10,3,1,1` (= 0.85 exactly) and `0.8499`;
  - A = 0.88 must stay above the threshold;
  - the rephrasing at 0.9 would miss at 0.92 or more.

  Add to S11 and 11.2 the rule for re-deriving them: a boundary vector with an exact rational cosine equal to the new constant; A, B and the rephrasing similarities at least 0.03 above it; 0.8499 replaced by the constant minus 1e-4. Also add that a changed delta after apply follows `docs/base-standards.md` §7: update the artifacts first, then re-run the spec audit.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache · Similarity threshold and embedded text | The threshold is 0.85 and inclusive | 1.1, 1.2 |
| | Only one finite non-zero vector of the schema's dimension is usable | 1.3 |
| semantic-cache · Similarity lookup in explain | A rephrased question is answered from the similar entry | 6.2, 6.3 |
| | A question on another topic is answered live and saved with its embedding | 6.4 |
| | The threshold is inclusive at the boundary | 6.4 |
| | An exact hit requests no embedding | 6.4 |
| | The most similar entry of the project wins | 6.5 |
| | Equal similarities go to the most recent entry | 6.5 |
| | A rejected similar entry is a miss without trying the next | 6.5 |
| | Evaluation mode requests no embedding | 6.4 |
| | Turning the cache off embeds only for the save | 6.4 |
| | A failing similarity lookup or hit record stops before the model | 6.5 |
| | *(clause "no anchor or empty key requests no embedding")* | **— hole, B6** |
| semantic-cache · Degradation without embeddings | Without an embedding model the call is answered as today | 6.6 |
| | An unavailable endpoint or an unusable vector degrades with an event | 6.6 |
| | A spent daily budget skips the lookup and the answer call still fails | 6.6 |
| | Another embedding error propagates before the model | 6.6 |
| | The skip event carries nothing of the question or the error | 6.7 |
| | The embedding request is not counted in the usage or the row | 6.7 |
| semantic-cache · Embedding of a saved answer | A live answer is saved with its embedding and found by a rephrasing | 6.7 |
| explain · Precedence and UNKNOWN answers | A live miss requests one embedding before the pack (new) | 6.8 |
| | 15 unchanged scenarios | existing tests (7.3) |
| explain · Answer cache | A similarity hit over the database counts in its entry and its row (new) | 6.9 |
| | 15 unchanged scenarios | existing tests (7.3) |
| explain · Explain events and logging | The skip event comes before the sanitisation events (new) | 6.8 |
| | 7 unchanged scenarios | existing tests (7.3) |
| explain · Query log | *(must be MODIFIED, B3)* | **— hole, B3** |
| graph-store · Answer cache entries | A saved embedding is found by similarity within its project | 5.1, 5.2 |
| | The most similar entry wins and ties go to the most recent | 5.3 |
| | The similarity search is exact whatever the other projects hold | 5.3 |
| | The in-memory double searches by similarity like the database | 4.1, 4.3 (fixture undefined, B4) |
| | Invalid cache arguments are rejected before querying (modified) | 5.3 |
| | Cache calls on an unknown project fail without writing (modified) | 5.3 |
| | 10 unchanged scenarios | 5.4 |
| graph-schema · Roll back the latest migration | Roll back only the latest migration (modified) | 3.1, 3.2 |
| | Roll back the query log verification migration (new) | 3.1 |
| | Roll back the L1 graph / both / every migration (unchanged) | 3.4 |
| graph-schema · L1 column contract | Migrated schema matches the column contract | 3.1 |
| | Defaults apply on a minimal insert | 3.4 (unchanged) |
| | An embedding of another dimension is rejected by the column | 3.3 |
| graph-schema · History, claim, usage and cache column contract | Migrated schema matches the history, claim, usage and cache column contract | 3.1 |
| | Defaults apply on a minimal claim, query log and cache entry | 3.4 (unchanged) |
| llm-adapter · The client waits as long as the configured timeout | Without an injected fetch the request does not use the global fetch | 2.3 |
| | Without an injected fetch timeouts, refusals and redirects keep their mapping; A response after 300 s is accepted | unchanged (7.3) |
| llm-adapter · Completion request and response | A null usage reports zero tokens; A usage field of the wrong type is an invalid response | 2.3 (helper) |
| | other scenarios | unchanged (7.3) |
| llm-adapter · Embedding request, order and dimension | Embeddings are returned in input order; …missing or duplicated indexes…; A vector of another dimension is rejected | 2.3 |
| | Embeddings without usage report zero tokens; Embeddings for no texts send nothing | 2.3 (helper), 2.4 |
| | The schema dimension is 768 | 2.1, 2.2 |

The table has two holes (B6, B3), both blocking.

---

## Corrections to apply

### `openspec/changes/semantic-cache/design.md`
1. **B1.** Rewrite the last part of Decisions:
   - Replace "No ADR: …" with a new decision **S13**: "Embeddings stay on `LlmPort.embed()` (DIS-46 review comment): `LLM_EMBED_MODEL` already selects a separate model on the same OpenAI-compatible endpoint, `mode` already drives degradation, and S1/S2 classify every failure; a separate `EmbeddingPort` would duplicate the budget wrapper and the composition. Recorded in ADR `docs/adr/YYYYMMDD-embeddings-stay-on-llm-port.md`, together with D3/S7 (dimension 768 and its migration)."
   - In Non-Goals, change "no new port" to "no new port (S13)".
   - Add S13 to Follow-ups with destination A.
2. **B2.** In S7:
   - Replace "`docs/backend-standards.md` §5 ('changing the model invalidates the cache') stays true and is not edited" with: "`docs/backend-standards.md` §5 says 'changing the model means re-embedding and reindexing everything'; this change edits it (task 9.6): a model of another dimension needs a migration; a model of the same dimension needs every stored cache vector discarded by invalidating each project's cache (a full reindex or `invalidateCache`); no re-embedding is done."
   - Add to Risks: "[`LLM_EMBED_MODEL` changed to another 768-dimension model] → stored vectors are not comparable and could give false hits; the operator invalidates the caches (`.env.example`, `docs/project-context.md`, `semantic-cache` 'Embedding of a saved answer'); nothing detects it (D — accepted)."
3. **I8.** In S6, add the Expand→Contract exception sentence from point 7.
4. **I1.** In S11 and its Follow-ups row, replace "tasks group 12" and "step 12 report" with "task 11.2" and "step 11 report".
5. **I3.** S3: replace "many entries" with "more entries … than `ef_search` (40)" and "is small" with "holds one entry per distinct question". R1 (Risks and Follow-ups): replace the text with the measurable wording of point 4 and remove "revisit with DIS-69".
6. **I5.** Add to S11 the rule for re-deriving the threshold-dependent scenario values (point 10).

### `openspec/changes/semantic-cache/proposal.md`
1. **B2.** Non-goals: replace "(changing model means invalidating the cache, `docs/backend-standards.md` §5)" with "(after a change of embedding model the operator invalidates the caches; `docs/backend-standards.md` §5 is corrected to say so)". Docs bullet: add `docs/backend-standards.md` §5 and the ADR.
2. **B3.** Modified Capabilities → `explain`: add "'Query log' (an embedding request never counts as a resolved call; similarity-lookup and embedding failures write no row)".

### `openspec/changes/semantic-cache/specs/semantic-cache/spec.md`
1. **B6.** Under "Similarity lookup in explain", add the scenario "A question without anchor requests no embedding" (text in point 3).
2. **B2.** In "Embedding of a saved answer", add the paragraph from point 5, correction 1.
3. **I4.** In "Turning the cache off embeds only for the save", add the second WHEN/THEN with a `timeout` embedding (point 3).
4. **I10.** In "A rephrased question is answered from the similar entry", add the key-equality clause (point 3).

### `openspec/changes/semantic-cache/specs/explain/spec.md`
1. **B3.** Add `### Requirement: Query log` as MODIFIED, with the full current text and all 15 scenarios. Change the "resolves" sentence and extend the no-row list exactly as in point 6.
2. **I6.** "Answer cache" → Lookup: replace the contradictory sentence with the wording of point 6.

### `openspec/changes/semantic-cache/specs/graph-store/spec.md`
1. **B4.** Rewrite "The in-memory double searches by similarity like the database" with explicit entries, searches and expectations (point 5), including the Q/0.85 search and whether the 200-entry case is covered.

### `openspec/changes/semantic-cache/tasks.md`
1. **B6.** In 6.4, add "A question without anchor requests no embedding".
2. **B3.** In 7.3, list the "Query log" requirement among the modified ones whose unchanged scenarios still map to their tests.
3. **B5.** In 11.1, record `id, question_normalized, hit_count, last_hit_at` of every acme-shop `cache_entry` (the seed holds the price and coupon keys, `seeds/cache/acme-shop.json:17,152`). In 11.3, create the live entry with an embedding through `useCache: false` (or use pairs absent from the seed), and use a different-topic question absent from the seed. In 11.7, restore the recorded `hit_count`/`last_hit_at` of the pre-existing rows and re-insert any seeded row that a save replaced (or re-seed acme-shop, recorded), then compare with the 11.1 snapshot.
4. **B1.** In 9.4, write the ADR(s) of design S13 from `docs/adr/_template.md` and add them to `docs/adr/README.md`. Check note (b) of DIS-101 in `readme.md`.
5. **B2.** Add 9.6: edit `docs/backend-standards.md` §5 (embeddings bullet) with the S7 wording. In 9.3, add the "change of embedding model → invalidate the caches" rule to `.env.example` and `docs/project-context.md`.
6. **I1.** 0.3, 3.2, 7.2, 9.4: "step 11 report" → "step 10 report".
7. **I2.** Move group 9 (docs) after group 12, or add a line explaining why it precedes the docs gate of 10.3.
8. **I5.** In 11.2, add the re-derivation rule for scenario values when the constant moves, and re-run the spec audit after the delta changes (§7).

### Linear (Spanish; the `[original]` block is not touched)
- **DIS-67, new comment:**

  > *Texto del agente (auditoría de spec, 2026-11-03).* Veredicto CHANGES REQUIRED con 6 bloqueantes, que se corrigen en el propio cambio `semantic-cache`:
  > - B1: ADR corto sobre `LlmPort.embed()` frente a `EmbeddingPort`, que pide el comentario de DIS-46, y la decisión S13.
  > - B2: cambiar de modelo de embeddings con la misma dimensión obliga a invalidar la caché; se corrige la cita de backend-standards §5.
  > - B3: delta MODIFIED de «Query log»: `embed` no cuenta como llamada resuelta.
  > - B4: datos explícitos en el escenario del doble en memoria.
  > - B5: la prueba manual choca con las entradas sembradas de acme-shop (precio y cupones) y la restauración debe reponer `hit_count`/`last_hit_at`.
  > - B6: escenario «una pregunta sin ancla no pide embedding».
- **DIS-67, `[enhanced]` part** (append at the end, without touching `[original]`):

  > *Nota del agente (auditoría, 2026-11-03):* el criterio 4 queda matizado por S1 de `design.md`: sin `LLM_EMBED_MODEL` (`not-configured`) se salta la similitud **sin** evento; `answer-cache` no lleva delta (S12). Cambiar de modelo de embeddings con la misma dimensión exige invalidar la caché de cada proyecto (B2).
- **DIS-46, comment:**

  > *Texto del agente (2026-11-03).* La decisión sobre `LlmPort.embed()` / `EmbeddingPort` que pedía la revisión de la Entrega 1 se toma en DIS-67 (cambio `semantic-cache`, decisión S13) y queda en un ADR. También se corrige en `docs/backend-standards.md` §5 el non-goal de DIS-5: otra dimensión exige migración, y otro modelo de la misma dimensión exige invalidar la caché.

---

## Resolution of run 1

*Agent's text: correction round 1 of an autonomous run (2026-11-03), decided as lead engineer without the author. Each decision is in `design.md` → Follow-ups, table "Spec audit, run 1", with its destination; none has destination C. `openspec validate semantic-cache --strict` passes after the corrections.*

| Finding | Resolution | Where |
|---|---|---|
| Q1 | Decided by the agent: the ADR belongs to DIS-67, the first task that uses embeddings for real, not to DIS-69 (which only adds seed vectors and the hit rate). Destination A | design S13, Follow-ups Q1 |
| B1 | Fixed: decision S13 (embeddings stay on `LlmPort.embed()`, with the reasons against the DIS-46 comment's arguments); "No ADR" removed; Non-Goals says "no new port (S13)"; task 9.4 writes the ADR from `_template.md`, also covering D3/S6/S7, and indexes it in `docs/adr/README.md`; task 9.1 updates the `readme.md` embeddings note and the DIS-101 review row that pointed to DIS-46. The suggested comment on DIS-46 was not posted (the write to a ticket other than DIS-67 was denied by the run's permission layer); the decision is recorded in the DIS-67 comment and `[enhanced]` note, and will be in the ADR and the `readme.md` note that DIS-46's review pointed to | design S13, Non-Goals, Follow-ups; tasks 9.1, 9.4; proposal Docs |
| B2 | Fixed: quote of `docs/backend-standards.md` §5 corrected in proposal and S7; requirement text added to `semantic-cache` "Embedding of a saved answer" (after a change of `LLM_EMBED_MODEL` the operator invalidates every project's cache; not detected); risk R2 (D, accepted); task 9.5 edits §5; task 9.3 states the rule in `.env.example` and `docs/project-context.md` | proposal Non-goals and Docs; design S7, Risks, Follow-ups R2; semantic-cache delta; tasks 9.3, 9.5 |
| B3 | Fixed: `### Requirement: Query log` added to the `explain` delta as MODIFIED with its full current text and its 15 scenarios; "a call resolves" now means a completion (`answer` or `verify`), an embedding request never counts; the no-row list gains the similarity lookup and its hit record and an embedding failure other than `LlmUnavailable`/`BudgetExhausted`. The `semantic-cache` sentence on resolved calls now says the same. Proposal lists the modified requirement; task 7.3 maps its unchanged scenarios | explain delta; semantic-cache delta; proposal; task 7.3 |
| B4 | Fixed: the double's scenario now names its entries (R₁, R₂, R₃ in two projects; A–D in a third, with C and D's instants), its searches (those of the two database scenarios plus Q/0.85, a short embedding and an injected `Error`) and its expectations (R₁ with similarity exactly `0.85` for Q/0.85). The 200-entry scenario is explicitly not repeated on the double, which has no index | graph-store delta; task 4.1 |
| B5 | Fixed: 11.1 snapshots every acme-shop `cache_entry` row and names the three seeded keys; 11.3 creates the live entry with an embedding through `POST /ask` with `useCache: false` (the CLI has no cache switch) and uses a different-topic question absent from the seed; 11.5 uses an uncached question absent from the seed; 11.7 re-inserts replaced seed rows with their recorded values, restores `hit_count`/`last_hit_at` and compares with the snapshot | tasks 11.1, 11.3, 11.5, 11.7 |
| B6 | Fixed: scenario "A question without anchor requests no embedding" added to `semantic-cache` "Similarity lookup in explain"; mapped in task 6.4 | semantic-cache delta; task 6.4 |
| I1 | Fixed: 0.3, 3.2 and 7.2 name the step 10 report; the old 9.4 is now the ADR task, named in the step 10 report; S11 and its Follow-ups row name task 11.2 and the step 11 report | tasks 0.3, 3.2, 7.2, 9.4; design S11, Follow-ups |
| I2 | Decided by the agent: group 9 keeps its place before group 10, with the reason written at the top of group 9 (the docs gate `npm run docs:coverage` of 10.3 checks this documentation). Destination A | tasks group 9 |
| I3 | Fixed: S3 says "more entries of other projects nearer the query than `ef_search` (40)" and "one entry per distinct question"; R1 uses the measurable wording (≤ 1 000 entries per project; beyond that a new change measures it) and is no longer routed to DIS-69 | design S3, Risks, Follow-ups R1 |
| I4 | Fixed: "Turning the cache off embeds only for the save" gains a second case with a `timeout` embedding (skip event first, entry saved without embedding); mapped in 6.4 | semantic-cache delta; task 6.4 |
| I5 | Fixed: S11 and 11.2 carry the re-derivation rule of the threshold-dependent values and the §7 rule (update artifacts, re-run the spec audit) | design S11; task 11.2 |
| I6 | Fixed: "Answer cache" → Lookup rewritten with the wording proposed by the audit | explain delta |
| I7 | Fixed: note appended to the `[enhanced]` part of DIS-67 (AC4 refined by S1; no `answer-cache` delta, S12; model change rule); `[original]` untouched | Linear DIS-67 |
| I8 | Fixed: S6 states the Expand → Contract exception; 3.2 asks `/migration-review` to confirm it | design S6; task 3.2 |
| I10 | Fixed: the rephrasing scenario asserts the answer has exactly the keys of an exact-key hit's answer | semantic-cache delta |

---

## Run 2 (2026-11-03)

CHANGES REQUIRED

**Change:** `openspec/changes/semantic-cache` · **Ticket:** DIS-67 (CM-HU-19.1), parent DIS-46 (CM-HU-19). Both were loaded from Linear with their comments. · **Audit:** second run, 2026-11-03, on the change after correction round 1.

**Questions for the author:** none. Q1 of run 1 was decided by the agent: the ADR belongs to DIS-67, decision S13. That answer is acceptable because it agrees with the DIS-46 review comment, which addresses "the task that first uses embeddings for real".

**Status of run 1.** All six blocking findings of run 1 (B1–B6) and the improvable findings I1–I8 and I10 are resolved in the artifacts, and the fixes were checked:
- S13 and task 9.4 (ADR);
- the §5 quote and task 9.5;
- the MODIFIED "Query log" requirement, with 15/15 scenarios, matching `openspec/specs/explain/spec.md:1148-1340`;
- the explicit data in the double's scenario;
- the seed-aware manual plan, 11.1–11.7;
- the no-anchor scenario.

This run found two new blocking defects.

---

## 1. Scope against the ticket

Clean. Every item follows from DIS-67 `[original]` ("SQL, umbral, orden de comprobación"; DoD: a rephrasing hits, a different topic does not, and without `embed()` the call degrades without error) and from its `[enhanced]` part. The 768 migration follows from the DIS-46 note "Decisión de embeddings para esta HU". The ADR follows from the DIS-46 review comment of 2026-10-16.

The following stay with DIS-69, as they should:
- the hit rate and `UsagePanel`;
- seed and golden vectors.

The `[enhanced]` note of correction round 1 now records why the change departs from AC4 (S1) and from D11 (S12). No invented scope was found.

## 2. Inherited acceptance criteria

Every parent AC that DIS-67 inherits has a requirement and a scenario:

| Parent AC (DIS-46) | Requirement | Scenario(s) |
|---|---|---|
| Rephrasing hits: `cacheHit`, `hit_count` +1, `embed()` once, no `complete()` | semantic-cache "Similarity lookup in explain" | "A rephrased question is answered from the similar entry"; explain "A similarity hit over the database counts in its entry and its row" |
| A different topic is answered live | same | "A question on another topic is answered live and saved with its embedding"; "The threshold is inclusive at the boundary" |
| Two projects: only that project's entries count | same + graph-store "Answer cache entries" | "The most similar entry of the project wins"; "A saved embedding is found by similarity within its project"; "The similarity search is exact whatever the other projects hold" |
| Evaluation mode: exact hit only, otherwise `UNKNOWN llm-required`, never fails | semantic-cache "Similarity lookup…", "Degradation without embeddings" | "Evaluation mode requests no embedding"; the four degradation scenarios |
| Hit rate 0.4 in CLI and `UsagePanel` | not inherited (DIS-69, D10) | — |

The DIS-46 review obligation (an ADR on `LlmPort.embed()` versus `EmbeddingPort`) is covered by S13 and task 9.4.

The parent's AC1 says the similarity "supera el umbral" (strictly above), while D2/S11 make the threshold inclusive (`>=`). This is a decision marked as the agent's text, it is documented, and it is pinned by "The threshold is 0.85 and inclusive". Accepted; not a finding.

## 3. Missing scenarios

Every MUST clause has a scenario that observes it. Two scenarios are underspecified:

- **Improvable (I1).** semantic-cache, "The threshold is inclusive at the boundary". The second explain must be "answered live", but the GIVEN only specifies the model's embeddings, not its completions. Correction: add to the GIVEN "a live scripted model that answers one statement citing the anchor span and accepts every verification".
- **Improvable (I2).** semantic-cache, "The most similar entry of the project wins". The scenario does not give the keys of A, B and C. Its second part depends on "D … with the same key text as A". If A's key were the rephrased key, the expected live answer would be an exact hit instead. Correction: add "none of A, B, C or D is stored under the rephrased question's key" to the GIVEN.

## 4. Ambiguity

Clean. The only matches in the artifacts are:
- "a small vector builder" (tasks 6.1), a description of test support;
- "as many symbol searches as" (an existing scenario), an exact count.

The wording that run 1 flagged in S3 and R1 is now measurable.

## 5. Open decisions

- **Blocking (B8), also point 10.** The manual plan of 11.4 and 11.5 expects results that the plan itself makes impossible. The cache state left by earlier steps decides the outcome:
  - After 11.3, the rephrased key `explicame el calculo del precio final` has no entry, because 11.3 served it by similarity and a hit is not saved again.
  - The first run of 11.4 asks "the same rephrased question with `LLM_EMBED_MODEL` empty". It is answered live and, being cacheable, it is **saved under the rephrased key** (semantic-cache, "Embedding of a saved answer"; explain, "Answer cache" → Save).
  - The second run of 11.4 (`LLM_EMBED_MODEL=qwen2.5-coder`) then gets an **exact hit**. No embedding is requested, so the expected "stderr shows the `semantic_cache_skipped` `embedding-unavailable` event" cannot happen.
  - The evaluation run of 11.4 expects "rephrased question `UNKNOWN (llm-required)`". It will get an exact hit on that same saved entry.
  - 11.5 expects "with the embedding model broken as in 11.4, the `semantic_cache_skipped` line", but does not say which question or `useCache` value to use. With the rephrased question it is again an exact hit and no event.

  The executing agent would have to redesign the steps on its own. Correction to 11.4 and 11.5:
  1. Before running 11.4, choose and record three anchored questions whose normalized keys are absent from the 11.1 snapshot, from 11.3 and from each other (for example, other rephrasings of the price question).
  2. Use the first for the `LLM_EMBED_MODEL` empty run (expected: live answer, no event).
  3. Use the second for the `LLM_EMBED_MODEL=qwen2.5-coder` run (expected: live answer whose events start with `semantic_cache_skipped` `embedding-unavailable`).
  4. Keep `Explícame el cálculo del precio final` for the evaluation run only. It has no entry at that point, so it gives `UNKNOWN (llm-required)`, and the exact price question is served from the cache.
  5. In 11.5, send the broken-embedding request with `"useCache": false` (which always requests the embedding; semantic-cache, "Turning the cache off embeds only for the save", second case), or with the third recorded question.
  6. In 11.7, delete the entries these runs create, which the "created after the 11.1 `max(created_at)`" rule already covers.

## 6. Contradictions inside the change

- **Blocking (B7).** The MODIFIED "Precedence and UNKNOWN answers" requirement and the unchanged scenarios it carries disagree on what "a call" to the model is.
  - The requirement text now separates completions from embedding requests: "The model SHALL receive no completion up to step 7 … The model SHALL receive at most one embedding request per call, at step 3, in live mode only, and none for an invalid request, `no-anchor`, an exact cache hit or evaluation mode."
  - So in live mode an `over-budget` answer, a failing prior-claims read and an unindexed project each **receive one embedding request**. With the default scripted model (task 6.1, design S9) that request is made and fails with `not-configured`.
  - Yet the delta keeps these scenarios word for word:
    - "A pack where nothing fits is unknown over budget": "the prior-claims read and the model received 0 calls";
    - "A failing prior-claims read stops before the model": "the model received 0 calls";
    - "An unknown project or an unindexed one fails without calling the model": "the model received 0 calls".
  - The same clash affects the MODIFIED "Query log" requirement: "every counter and cost 0 when no call was made" for a live `over-budget`.
  - The existing tests only pass because they count `d.model.requests`, which records completions only (`tests/unit/explain/explain.spec.ts:326,343,410`; `tests/support/scripted-llm.ts:74,120-143`).
  - After `/opsx:archive`, the main spec would state both things. `/verify-against-spec` (14.4) would have to decide which one holds.

  Correction (one sentence, no scenario rewrite): add to "Precedence and UNKNOWN answers", right after the sentence on embedding requests:
  > "In the scenarios of `explain`, the calls or requests a model 'received' are its completions (`answer` and `verify`); embedding requests are counted only where a scenario names them as embedding requests."

  Also extend the "Query log" phrase "every counter and cost 0 when no call was made" to "when no completion was made". In 7.3, note that these three scenarios keep their tests because they count completions.

Everything else in the proposal, design and deltas is consistent:
- the order anchor → exact → similarity → evaluation → live;
- S1/S2 and "Degradation without embeddings";
- S4 and the "Answer cache" Lookup/Save text;
- S8 and "Query log";
- S10 and the boundary scenarios;
- S11 and 11.2.

## 7. Contradictions with the project

Clean.
- `docs/backend-standards.md` §5: the quote is now correct (S7). The edit is task 9.5, and the Expand → Contract exception is stated in S6 and confirmed in 3.2.
- The budget rule ("before every completion and every embedding") matches S8 and "A spent daily budget skips the lookup and the answer call still fails".
- `openspec/specs/explain/spec.md` "Query log" is now MODIFIED consistently. Only the "call" wording conflicts, and that is B7, inside the delta.
- `answer-cache` is unchanged, which is consistent with S12.
- The ADR (task 9.4) meets the `docs/adr/README.md` criterion.
- The `http-ask` `dimension-mismatch` mapping is still valid.

## 8. Contrast with the real code

Clean.
- The insertion point lies between `findCacheEntry` (`packages/core/src/explain/explain.ts:322`) and `if (llm.mode === 'evaluation')` (`:331`).
- `saveCache` is at `:249-256`, and the row on error is guarded by `meter.resolvedCalls() > 0` (`:193`).
- `packages/core/src/cache/response-cache.ts:3-7` already imports leaf modules of `explain/` (never `explain.ts`). S4's type-only import from `explain-event.ts` follows that existing pattern and creates no cycle with `explain.ts`.
- The seeded keys cited in 11.1 exist at `seeds/cache/acme-shop.json:17,152,295`.
- The tests named in 6.8 and 6.9 exist: `tests/unit/explain/explain-sanitization.spec.ts:363`, `tests/integration/explain/explain.spec.ts:354`.

## 9. Task size

Clean. The largest tasks are:
- 9.1, several `readme.md` edits in one file;
- 5.3, two new Postgres scenarios and two extended tests, one at a time;
- 6.6, four scenarios, one at a time;
- 4.5, a bounded set of doubles.

Each fits in one agent turn.

## 10. Mandatory steps

- Step 0 is the branch: 0.1 (`feature/dis-67-semantic-cache`), verified in 0.2. ✓
- Groups 7, 9 and 10 are labelled `(MANDATORY)`, 11 is `(MANDATORY - AGENT MUST EXECUTE)`, 12 is `(MANDATORY if applicable - AGENT MUST EXECUTE)` and 14 is Pre-merge. ✓
- Report paths are given in 10.7 and 11.8. ✓
- Group 9 is placed before group 10 on purpose, with the reason stated (I2 of run 1). ✓
- State restoration: 10.6 and 11.7 cover the counts, the seeded rows that were replaced, `hit_count`/`last_hit_at`, and the stopped servers. ✓
- **Blocking: B8.** Steps 11.4 and 11.5 of the mandatory manual step cannot produce their stated outcomes (point 5).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache · Similarity threshold and embedded text | The threshold is 0.85 and inclusive | 1.1, 1.2 |
| | Only one finite non-zero vector of the schema's dimension is usable | 1.3 |
| semantic-cache · Similarity lookup in explain | A rephrased question is answered from the similar entry | 6.2, 6.3 |
| | A question on another topic is answered live and saved with its embedding | 6.4 |
| | The threshold is inclusive at the boundary | 6.4 |
| | An exact hit requests no embedding | 6.4 |
| | The most similar entry of the project wins | 6.5 |
| | Equal similarities go to the most recent entry | 6.5 |
| | A rejected similar entry is a miss without trying the next | 6.5 |
| | Evaluation mode requests no embedding | 6.4 |
| | Turning the cache off embeds only for the save (both cases) | 6.4 |
| | A question without anchor requests no embedding | 6.4 |
| | A failing similarity lookup or hit record stops before the model | 6.5 |
| semantic-cache · Degradation without embeddings | Without an embedding model the call is answered as today | 6.6 |
| | An unavailable endpoint or an unusable vector degrades with an event | 6.6 |
| | A spent daily budget skips the lookup and the answer call still fails | 6.6 |
| | Another embedding error propagates before the model | 6.6 |
| | The skip event carries nothing of the question or the error | 6.7 |
| | The embedding request is not counted in the usage or the row | 6.7 |
| | (`skipCode` classification, no scenario of its own) | 1.4 |
| semantic-cache · Embedding of a saved answer | A live answer is saved with its embedding and found by a rephrasing | 6.7 |
| | (model-change rule, operator duty) | 9.3, 9.4, 9.5 |
| explain · Precedence and UNKNOWN answers | A live miss requests one embedding before the pack (new) | 6.8 |
| | 15 unchanged scenarios | existing tests (7.3) |
| explain · Answer cache | A similarity hit over the database counts in its entry and its row (new) | 6.9 |
| | 15 unchanged scenarios | existing tests (7.3) |
| explain · Explain events and logging | The skip event comes before the sanitisation events (new) | 6.8 |
| | 7 unchanged scenarios | existing tests (7.3) |
| explain · Query log | 15 unchanged scenarios; new no-row cases pinned by semantic-cache scenarios | 7.3 (6.5, 6.6) |
| graph-store · Answer cache entries | A saved embedding is found by similarity within its project | 5.1, 5.2 |
| | The most similar entry wins and ties go to the most recent | 5.3 |
| | The similarity search is exact whatever the other projects hold | 5.3 |
| | The in-memory double searches by similarity like the database | 4.1, 4.3 |
| | Invalid cache arguments are rejected before querying (modified) | 5.3 |
| | Cache calls on an unknown project fail without writing (modified) | 5.3 |
| | 10 unchanged scenarios | 5.4 |
| graph-schema · Roll back the latest migration | Roll back only the latest migration (modified) | 3.1, 3.2 |
| | Roll back the query log verification migration (new) | 3.1 |
| | Roll back the L1 graph / both / every migration (unchanged) | 3.4 |
| graph-schema · L1 column contract | Migrated schema matches the column contract | 3.1 |
| | Defaults apply on a minimal insert | 3.4 |
| | An embedding of another dimension is rejected by the column | 3.3 |
| graph-schema · History, claim, usage and cache column contract | Migrated schema matches the history, claim, usage and cache column contract | 3.1 |
| | Defaults apply on a minimal claim, query log and cache entry | 3.4 |
| llm-adapter · The client waits as long as the configured timeout | Without an injected fetch the request does not use the global fetch | 2.3 |
| | Timeouts, refusals and redirects keep their mapping; A response after 300 s is accepted | unchanged (7.3) |
| llm-adapter · Completion request and response | A null usage reports zero tokens; A usage field of the wrong type is an invalid response | 2.3 |
| | other scenarios | unchanged (7.3) |
| llm-adapter · Embedding request, order and dimension | Embeddings are returned in input order; Missing or duplicated indexes; A vector of another dimension is rejected | 2.3 |
| | Embeddings without usage report zero tokens; Embeddings for no texts send nothing | 2.3, 2.4 |
| | The schema dimension is 768 | 2.1, 2.2 |

There are no holes in the table.

---

## Corrections to apply

### `openspec/changes/semantic-cache/specs/explain/spec.md`
1. **B7.** In "Precedence and UNKNOWN answers", after the sentence "The model SHALL receive at most one embedding request per call, … or evaluation mode.", add:
   > "In the scenarios of `explain`, the calls or requests a model 'received' are its completions (`answer` and `verify`); embedding requests are counted only where a scenario names them as embedding requests."
2. **B7.** In "Query log", third bullet, replace "every counter and cost 0 when no call was made" with "every counter and cost 0 when no completion was made".

### `openspec/changes/semantic-cache/specs/semantic-cache/spec.md`
1. **I1.** "The threshold is inclusive at the boundary", GIVEN: replace "and a live model whose embedding of the rephrased key is …" with "and a live scripted model that answers one statement citing the anchor span and accepts every verification, whose embedding of the rephrased key is …".
2. **I2.** "The most similar entry of the project wins", GIVEN: add "; none of A, B, C or D is stored under the rephrased question's key".

### `openspec/changes/semantic-cache/tasks.md`
1. **B8.** Rewrite 11.4:
   > "Degradation: before running it, choose and record two anchored questions whose normalized keys are absent from the 11.1 snapshot, from 11.3 and from each other (D₁, D₂). Ask D₁ with `LLM_EMBED_MODEL` empty (live, no event, answered live). Ask D₂ with `LLM_EMBED_MODEL=qwen2.5-coder` (the embedding request fails with `http-status`, `invalid-response` or `dimension-mismatch`; stderr shows the `semantic_cache_skipped` `embedding-unavailable` event and the answer still arrives). Then, in evaluation mode (no `LLM_*`), ask the exact price question (served from the cache) and `Explícame el cálculo del precio final`, which has no entry because 11.3 served it by similarity (`UNKNOWN (llm-required)`, no call to Ollama)."
2. **B8.** In 11.5, change "with the embedding model broken as in 11.4, the `semantic_cache_skipped` line at `info`" to:
   > "and, with the embedding model broken as in 11.4, a request with `"useCache": false` (which always requests the embedding) whose request log shows the `semantic_cache_skipped` line at `info`".
3. **B7.** In 7.3, add: "'A pack where nothing fits is unknown over budget', 'A failing prior-claims read stops before the model' and 'An unknown project or an unindexed one fails without calling the model' keep their tests unchanged: they count completions (`model.requests`), as the clarified 'Precedence' text says."

### Linear (Spanish; the `[original]` block is not touched)
- **DIS-67, new comment:**
  > *Texto del agente (auditoría de spec, segunda ejecución, 2026-11-03).* Veredicto CHANGES REQUIRED con 2 bloqueantes nuevos; los 6 de la primera ejecución están resueltos. Se corrigen en el propio cambio `semantic-cache`:
  > - B7: en «Precedence and UNKNOWN answers» y «Query log», aclarar que las «llamadas» que recibe el modelo en los escenarios son completions; las peticiones de embedding solo cuentan donde un escenario las nombra (hoy tres escenarios sin cambios dicen «0 calls» aunque en vivo se pide un embedding).
  > - B8: la prueba manual 11.4/11.5 no puede dar lo que espera: la primera respuesta en vivo de la pregunta reformulada la guarda bajo su clave y las siguientes son aciertos exactos (sin evento y sin `llm-required`). Se usan preguntas nuevas registradas para cada caso degradado y `useCache: false` en la API.

---

## Resolution of run 2

*Agent's text: correction round 2 of an autonomous run (2026-11-03), decided as lead engineer without the author. Run 2 had no question for the author. Each decision is in `design.md` → Follow-ups, table "Spec audit, run 2", with its destination; none has destination C. `openspec validate semantic-cache --strict` passes after the corrections. The suggested DIS-67 comment was posted with the decisions of this round.*

| Finding | Resolution | Where |
|---|---|---|
| B7 | Fixed: "Precedence and UNKNOWN answers" now says that in the `explain` scenarios the calls or requests a model "received" are its completions (`answer` and `verify`), and embedding requests count only where a scenario names them; "Query log" says "every counter and cost 0 when no completion was made"; task 7.3 states that the three "0 calls" scenarios keep their tests because they count completions (`model.requests`) | explain delta; task 7.3 |
| B8 | Fixed: 11.4 records three fresh anchored questions D₁, D₂, D₃ (keys absent from the 11.1 snapshot, from 11.3 and from each other); D₁ with `LLM_EMBED_MODEL` empty, D₂ with the broken embedding model (skip event), and the rephrased question only in evaluation mode (`UNKNOWN (llm-required)`, it has no entry after 11.3); 11.5 sends D₃ with `"useCache": false` to the API restarted with the broken embedding model and expects the `semantic_cache_skipped` line; the new entries are removed by the 11.7 rule | tasks 11.4, 11.5 |
| I1 | Fixed: the GIVEN of "The threshold is inclusive at the boundary" names a live scripted model that answers one statement citing the anchor span and accepts every verification | semantic-cache delta |
| I2 | Fixed: the GIVEN of "The most similar entry of the project wins" adds that none of A, B, C or D is stored under the rephrased question's key | semantic-cache delta |

---

## Run 3 (2026-11-03)

APPROVED

**Change:** `openspec/changes/semantic-cache` · **Ticket:** DIS-67 (CM-HU-19.1), parent DIS-46 (CM-HU-19). I loaded both from Linear with their comments. · **Audit:** third run, 2026-11-03, on the change after correction round 2.

**Questions for the author:** none. The earlier rounds left agent decisions marked as agent's text:
- Q1 of run 1: the ADR belongs to DIS-67.
- S1: `not-configured` skips without an event.
- S12: no `answer-cache` delta.
- D2: the threshold is inclusive.

All of them are consistent with the ticket, the DIS-46 review comment and the project, so I accept them.

**Status of run 2.** B7, B8, I1 and I2 are resolved in the artifacts, and I checked each fix:
- **B7:** "Precedence and UNKNOWN answers" now has the sentence that in `explain` scenarios a "received" call is a completion (explain delta, lines 61–63). "Query log" says "when no completion was made" (line 624). Task 7.3 names the three "0 calls" scenarios.
- **B8:** 11.4 and 11.5 use D₁, D₂ and D₃. The rephrased question is asked only in evaluation mode, and D₃ is sent with `useCache: false` to the API with the broken embedding model.
- **I1 and I2:** both GIVENs are completed.

This run found no blocking defect. It lists seven improvable findings below.

---

## 1. Scope against the ticket

Clean. Every item follows from DIS-67 `[original]` ("SQL, umbral, orden de comprobación"; DoD: a rephrasing hits, a different topic does not, and without `embed()` the call degrades without error) or from its `[enhanced]` part:
- The 768 migration follows from the DIS-46 note "Decisión de embeddings para esta HU".
- The ADR follows from the DIS-46 review comment of 2026-10-16.
- The changes to the test doubles follow from S2 and S9.

The hit rate, `UsagePanel`, and seed and golden vectors stay with DIS-69. Nothing invented was found.

- **Improvable (I6).** The `[enhanced]` text of DIS-67 still states two things the change has since replaced:
  - "`docs/backend-standards.md` §5 ya dice que cambiar de modelo obliga a re-embeber, no cambia". Task 9.5 now edits §5 (design S7).
  - The SQL is described as `LEFT JOIN LATERAL … ORDER BY question_embedding <=> $2::vector … LIMIT 1` and as "una sentencia indexada por proyecto". This is exactly the HNSW post-filtering shape that S3 rejects in favour of an exact search through a `MATERIALIZED` CTE.

  The round-1 note covers the rule for a change of model but not these two points. Append a note (see Corrections → Linear).

## 2. Inherited acceptance criteria

Every parent AC that DIS-67 inherits has a requirement and a scenario:

| Parent AC (DIS-46) | Requirement | Scenario(s) |
|---|---|---|
| A rephrasing hits: `cacheHit`, `hit_count` +1, `embed()` once, no `complete()` | semantic-cache "Similarity lookup in explain" | "A rephrased question is answered from the similar entry"; explain "A similarity hit over the database counts in its entry and its row" |
| A different topic is answered live | same | "A question on another topic is answered live and saved with its embedding"; "The threshold is inclusive at the boundary" |
| Two projects: only that project's entries count | same, plus graph-store "Answer cache entries" | "The most similar entry of the project wins"; "A saved embedding is found by similarity within its project"; "The similarity search is exact whatever the other projects hold" |
| Evaluation mode: exact hit only, otherwise `UNKNOWN llm-required`, never fails | semantic-cache "Similarity lookup…", "Degradation without embeddings" | "Evaluation mode requests no embedding"; the four degradation scenarios |
| Hit rate 0.4 in CLI and `UsagePanel` | not inherited (DIS-69, D10) | — |

The DIS-46 review obligation (an ADR on `LlmPort.embed()` versus `EmbeddingPort`, and an update to the DIS-101 note) is covered by S13 and tasks 9.1 and 9.4.

The DIS-46 note asking to correct the DIS-5 non-goal is covered by S7 and task 9.5.

The parent's "supera el umbral" against the inclusive `>=` was already accepted in run 2.

## 3. Missing scenarios

Every MUST clause has a scenario that observes it. The clause "a question with no anchor or with an empty key requests no embedding" is pinned by "A question without anchor requests no embedding". The empty key is a documented guard that cannot be reached after anchoring.

- **Improvable (I2).** graph-store, "The most similar entry wins and ties go to the most recent". The GIVEN does not bound the similarity of C and D with Q, nor the similarity of A and B with the embedding of C and D. If the test author picked vectors where C or D reaches more than 0.95 with Q, the first search would not resolve to B. If A or B reached 0.99 or more with C's embedding, the second search would not resolve to D. The THEN pins the outcome, so a careful author picks consistent data, but the scenario should say so. The in-memory double's scenario reuses these entries, so it inherits the gap. Correction: add to the GIVEN "C and D have a similarity below 0.88 with Q, and A and B a similarity below 0.99 with the embedding of C and D".

## 4. Ambiguity

Clean. Searching the change outside `reports/` for fast, easy, secure, efficient, many, appropriate, robust, small and large finds only:
- "a small vector builder" (task 6.1), a description of test support;
- "too-large", an error reason;
- "as many … as" and "however many", exact counts in unchanged scenarios.

## 5. Open decisions

None blocking. Formats, limits, error cases, empty and absent inputs, orderings and test names are all fixed:
- the vector text and the `::vector` cast;
- the order of the checks;
- `minSimilarity` in [0, 1];
- ties by `created_at DESC`, then `id DESC`;
- the closed event codes;
- the D₁, D₂ and D₃ questions of the manual plan.

Two small gaps remain in the manual plan:

- **Improvable (I4).** 11.3 expects the CLI rephrasing «Explícame el cálculo del precio final» to be a similarity hit. That only holds if the 11.2 calibration gives that pair a similarity at or above the final constant. S11 allows the outcome "no value in [0.80, 0.95] separates them; the constant stays 0.85 and the limitation is recorded", and then the planned hit cannot happen. The plan does not say what the executing agent does in that case. Correction: in 11.3 (and 11.5), use a rephrasing of the price question whose similarity measured in 11.2 reaches the final constant. Name it in the step 11 report. If no measured rephrasing reaches it, record that, run the step with the observed miss, and add the limitation to `design.md` → Follow-ups (D).
- **Improvable (I5).** 11.5 sends `"useCache": false` without naming the question, and expects "entry replaced with an embedding". With the rephrased question there is no entry under its key to replace: 11.3 served it by similarity and 11.4 asked it in evaluation mode. A new one is created. With the price question, the entry is replaced. Correction: write "with the rephrased question and `"useCache": false` (200, live answer; a new entry under the rephrased key with a non-`NULL` `question_embedding`, checked in SQL, deleted in 11.7)".

## 6. Contradictions inside the change

No blocking contradiction. These parts are consistent across proposal, design and deltas:
- the order anchor → exact → similarity (live) → evaluation → live;
- S1/S2 and "Degradation without embeddings";
- the `useCache: false` path (no lookup of any kind, embedding still requested, skip event on failure);
- S8 and "Query log";
- S10 and the boundary scenarios;
- S11 and 11.2.

- **Improvable (I1).** Task 1.2 adds an exported `reachesThreshold(similarity)` to `similarity-cache.ts`. Design S4, which lists the module's exports (`SEMANTIC_CACHE_MIN_SIMILARITY`, `usableVector`, `skipCode`), does not mention it. In production the threshold is applied by the store (`1 - distance >= $3` in Postgres, and the in-memory double's own comparison), so `reachesThreshold` would be called only by its unit test. That makes it a third copy of the inclusive rule that no production path uses, and Stryker would not protect the real comparison. Correction, either of:
  - (a) add `reachesThreshold` to S4 as the single TypeScript statement of the inclusive rule, and have the in-memory double (task 4.3) apply it;
  - (b) drop it and let "The threshold is 0.85 and inclusive" compare with `>=` against the exported constant.

  Option (a) keeps the scenario's wording, "compared with it".

## 7. Contradictions with the project

Clean.
- The quote of `docs/backend-standards.md` §5 is now correct (S7), its edit is task 9.5, and the Expand → Contract exception is stated in S6 and confirmed in task 3.2.
- The budget rule ("before every completion and every embedding") matches S8 and "A spent daily budget skips the lookup and the answer call still fails".
- Every cross-reference in the deltas resolves to an existing main requirement:
  - `answer-cache` "Question normalization", "Cacheable answers", "Stored response" and "Answer of a cache hit";
  - `llm-adapter` "Daily spend ceiling" (`openspec/specs/llm-adapter/spec.md:518`);
  - `graph-store` "Query log write" (`openspec/specs/graph-store/spec.md:887`).
- `openspec/specs/local-startup/spec.md:549` ("no embeddings, which `ask` does not need") stays true, because `ask` degrades.

- **Improvable (I7).** `openspec/specs/graph-schema/spec.md:633` describes the purpose of the HNSW index on `cache_entry.question_embedding` as "cache hit by question similarity". S3 deliberately does not use that index for the lookup. The text is not wrong (the index stays as the schema contract, for future use), but a reader of the main spec would assume the lookup uses it. Correction: add to S3 one sentence saying that the purpose column of the graph-schema index table describes the intended use and stays as it is, because the cache lookup is exact and does not use the index. No delta is needed.

## 8. Contrast with the real code

Clean.
- The insertion point lies between `store.findCacheEntry` (`packages/core/src/explain/explain.ts:322`) and `if (llm.mode === 'evaluation')` (`:331`).
- `saveCache` is at `:249`, and the row on error is guarded by `meter.resolvedCalls() > 0` (`:193`).

I checked every `LlmPort` double in `tests/` whose `embed` throws a plain `Error`, because design S2 makes such an error propagate:
- `tests/support/scripted-llm.ts:139` changes in 6.1;
- `tests/unit/cli/ask-command.spec.ts:248` changes in 6.1;
- `tests/unit/api/composition.spec.ts:85` never reaches `explain` (it calls `complete` only);
- `tests/unit/cli/cache-build.spec.ts:189` replaces `explain` with a stub;
- `tests/integration/store/query-cost.spec.ts:165` returns a result and only calls `complete`;
- `tests/unit/explain/explain-verification.spec.ts:460` delegates to the scripted model, which falls back to `not-configured`.

No other existing test changes behaviour.

- **Improvable (I3), also point 10.** The restoration in 11.7 deletes claims by `created_at` and compares counts and the acme-shop `cache_entry` rows. A live answered answer also runs the stale claim refresh (`openspec/specs/explain/spec.md:1611`). The refresh rewrites existing claim rows through `UPDATE_REFRESHED_CLAIM` (`packages/adapters/store-postgres/src/queries.ts:383`). If acme-shop holds due stale claims among the prior claims of the questions asked, 11.3–11.5 change pre-existing rows that 11.7 neither restores nor detects. Correction:
  - in 11.1, record the acme-shop `claim` rows with `status = 'stale'` in full (`id, object, status, type, provenance, updated_at`);
  - in 11.7, restore any of them that changed and compare them with the snapshot;
  - if 11.1 finds none, record that and skip the step.

## 9. Task size

Clean. The largest tasks are:
- 9.1, several edits to `readme.md`;
- 5.3, two new Postgres scenarios and two extended tests, one at a time;
- 6.4 and 6.6, several scenarios each, one at a time;
- 4.5, a bounded set of doubles.

Each fits in one agent turn.

## 10. Mandatory steps

- Step 0 is the branch: 0.1 (`feature/dis-67-semantic-cache`, matching `BRANCH_PREFIX`), verified in 0.2. ✓
- Labels: groups 7, 9 and 10 are `(MANDATORY)`; 11 is `(MANDATORY - AGENT MUST EXECUTE)`; 12 is `(MANDATORY if applicable - AGENT MUST EXECUTE)`; 14 is Pre-merge and comes last, with the three checks in order. Fixes go to the same PR, and the archive commit comes before the merge. ✓
- Group 9 is placed before group 10 on purpose, with the reason stated (the docs gate in 10.3). ✓
- The reports are created in 10.7 and 11.8. ✓
- State restoration is in 10.6 and 11.7: counts, seeded rows that were replaced, `hit_count` and `last_hit_at`, stopped servers. ✓ The refreshed claims gap is I3 (improvable).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache · Similarity threshold and embedded text | The threshold is 0.85 and inclusive | 1.1, 1.2 |
| | Only one finite non-zero vector of the schema's dimension is usable | 1.3 |
| semantic-cache · Similarity lookup in explain | A rephrased question is answered from the similar entry | 6.2, 6.3 |
| | A question on another topic is answered live and saved with its embedding | 6.4 |
| | The threshold is inclusive at the boundary | 6.4 |
| | An exact hit requests no embedding | 6.4 |
| | The most similar entry of the project wins | 6.5 |
| | Equal similarities go to the most recent entry | 6.5 |
| | A rejected similar entry is a miss without trying the next | 6.5 |
| | Evaluation mode requests no embedding | 6.4 |
| | Turning the cache off embeds only for the save (both cases) | 6.4 |
| | A question without anchor requests no embedding | 6.4 |
| | A failing similarity lookup or hit record stops before the model | 6.5 |
| semantic-cache · Degradation without embeddings | Without an embedding model the call is answered as today | 6.6 |
| | An unavailable endpoint or an unusable vector degrades with an event | 6.6 |
| | A spent daily budget skips the lookup and the answer call still fails | 6.6 |
| | Another embedding error propagates before the model | 6.6 |
| | The skip event carries nothing of the question or the error | 6.7 |
| | The embedding request is not counted in the usage or the row | 6.7 |
| | (`skipCode` classification, unit cases, no scenario of its own) | 1.4 |
| semantic-cache · Embedding of a saved answer | A live answer is saved with its embedding and found by a rephrasing | 6.7 |
| | (rule for a change of model, operator duty) | 9.3, 9.4, 9.5 |
| explain · Precedence and UNKNOWN answers | A live miss requests one embedding before the pack (new) | 6.8 |
| | 15 unchanged scenarios (three "0 calls" scenarios count completions) | existing tests (7.3) |
| explain · Answer cache | A similarity hit over the database counts in its entry and its row (new) | 6.9 |
| | 15 unchanged scenarios | existing tests (7.3) |
| explain · Explain events and logging | The skip event comes before the sanitisation events (new) | 6.8 |
| | 7 unchanged scenarios | existing tests (7.3) |
| explain · Query log | 15 unchanged scenarios; new no-row cases pinned by semantic-cache scenarios | 7.3 (6.5, 6.6) |
| graph-store · Answer cache entries | A saved embedding is found by similarity within its project | 5.1, 5.2 |
| | The most similar entry wins and ties go to the most recent | 5.3 |
| | The similarity search is exact whatever the other projects hold | 5.3 |
| | The in-memory double searches by similarity like the database | 4.1, 4.3 |
| | Invalid cache arguments are rejected before querying (modified) | 5.3 (4.6 for the double) |
| | Cache calls on an unknown project fail without writing (modified) | 5.3 |
| | 10 unchanged scenarios | 5.4 |
| graph-schema · Roll back the latest migration | Roll back only the latest migration (modified) | 3.1, 3.2 |
| | Roll back the query log verification migration (new) | 3.1 |
| | Roll back the L1 graph / both / every migration (unchanged) | 3.4 |
| graph-schema · L1 column contract | Migrated schema matches the column contract | 3.1 |
| | Defaults apply on a minimal insert | 3.4 |
| | An embedding of another dimension is rejected by the column | 3.3 |
| graph-schema · History, claim, usage and cache column contract | Migrated schema matches the history, claim, usage and cache column contract | 3.1 |
| | Defaults apply on a minimal claim, query log and cache entry | 3.4 |
| llm-adapter · The client waits as long as the configured timeout | Without an injected fetch the request does not use the global fetch | 2.3 |
| | Timeouts, refusals and redirects keep their mapping; A response after 300 s is accepted | unchanged (7.3) |
| llm-adapter · Completion request and response | A null usage reports zero tokens; A usage field of the wrong type is an invalid response | 2.3 |
| | other scenarios | unchanged (7.3) |
| llm-adapter · Embedding request, order and dimension | Embeddings are returned in input order; Missing or duplicated indexes; A vector of another dimension is rejected | 2.3 |
| | Embeddings without usage report zero tokens; Embeddings for no texts send nothing | 2.3, 2.4 |
| | The schema dimension is 768 | 2.1, 2.2 |

The table has no holes.

---

## Corrections to apply

None of these block the apply. They can go in one pass before task 1.1, or be recorded as accepted.

### `openspec/changes/semantic-cache/design.md`
1. **I1.** S4, list of the module's exports: add "`reachesThreshold(similarity)` (similarity `>=` `SEMANTIC_CACHE_MIN_SIMILARITY`), the single TypeScript statement of the inclusive rule, applied by the in-memory double". Alternatively, remove `reachesThreshold` from task 1.2.
2. **I7.** S3, after "The HNSW index stays (schema contract; …)": add "The purpose column of the `graph-schema` index table ('cache hit by question similarity') describes the intended use and stays unchanged; the cache lookup of this change is exact and does not use the index."
3. Follow-ups: add a table "Spec audit, run 3" with I1–I7 and their destinations.

### `openspec/changes/semantic-cache/specs/graph-store/spec.md`
1. **I2.** "The most similar entry wins and ties go to the most recent", GIVEN: append "; C and D have a similarity below 0.88 with Q, and A and B a similarity below 0.99 with the embedding of C and D".

### `openspec/changes/semantic-cache/tasks.md`
1. **I1.** 4.3: add "the threshold check applies `reachesThreshold`" (or, if option (b) is chosen, remove `reachesThreshold` from 1.2).
2. **I3.** 11.1: add "record the acme-shop `claim` rows with `status = 'stale'` in full (`id, object, status, type, provenance, updated_at`), or that there are none". 11.7: add "restore and compare those rows (a live answer's stale claim refresh rewrites them through `UPDATE_REFRESHED_CLAIM`)".
3. **I4.** 11.3: replace the fixed rephrasing with "a rephrasing of the price question whose similarity measured in 11.2 reaches the final constant (named in the step 11 report); if none reaches it, record that, run the step with the observed miss, and add the limitation to `design.md` → Follow-ups (D)". Apply the same rule in 11.5.
4. **I5.** 11.5: replace "with `"useCache": false` (200, live answer, entry replaced with an embedding)" with "with the rephrased question and `"useCache": false` (200, live answer; a new entry under the rephrased key with a non-`NULL` `question_embedding`, checked in SQL, deleted in 11.7)".

### Linear (Spanish; the `[original]` block is not touched)
- **DIS-67, `[enhanced]` part** (append at the end):
  > *Nota del agente (auditoría de spec, tercera ejecución, 2026-11-03):* dos frases de esta parte quedan superadas por el diseño. (1) `docs/backend-standards.md` §5 sí se edita (tarea 9.5, S7): otra dimensión exige migración y otro modelo de la misma dimensión exige invalidar la caché de cada proyecto; no se re-embebe. (2) La búsqueda por similitud no es `LEFT JOIN LATERAL … ORDER BY <=> LIMIT 1` sobre el índice HNSW, sino una búsqueda exacta sobre las entradas del proyecto con una CTE `MATERIALIZED` (S3), porque el filtrado posterior de HNSW podría perder la entrada del proyecto.
- **DIS-67, new comment:**
  > *Texto del agente (auditoría de spec, tercera ejecución, 2026-11-03).* Veredicto APPROVED, sin bloqueantes. Los bloqueantes B7 y B8 de la segunda ejecución están resueltos. Quedan 7 mejorables, que se aplican en el propio cambio `semantic-cache` o se registran como aceptados:
  > - I1: `reachesThreshold` se declara en S4 y lo usa el doble en memoria.
  > - I2: se acotan las similitudes de C y D en el escenario de desempate de `graph-store`.
  > - I3: la restauración de la prueba manual cubre los claims stale que reescribe el refresco.
  > - I4: la prueba manual usa una reformulación medida en 11.2 que alcanza el umbral.
  > - I5: se nombra la pregunta de `useCache: false` en 11.5.
  > - I6: nota en `[enhanced]`.
  > - I7: frase sobre el índice HNSW en S3.

---

## Run 1 (2026-11-04)

CHANGES REQUIRED

Spec audit of `openspec/changes/semantic-cache` for DIS-67 (CM-HU-19.1), parent DIS-46 (CM-HU-19). Date: 2026-11-04. I read the Linear sub-issue, its parent and all comments on both. I audited the change as it stands now: it is applied, PR #105 is open, and tasks 0–14.1 are checked. This is the first audit of the relaunched workflow. The earlier report `reports/2026-11-03-spec-audit.md` covers runs 1–3, and its findings are not repeated here.

**Questions for the author**

- **Q1 (product decision, not blocking).** The parent's first acceptance criterion pairs «¿Cómo se calcula el precio final de un pedido?» with «explícame el cálculo del precio final» and says the similarity is above the threshold. Calibration R3 used the reference model this change picks (`nomic-embed-text`, D3) and found otherwise:
  - The parent's own rephrasing pair scores 0.8321, below 0.85, so it misses.
  - Different-topic questions that share the same sentence frame reach the threshold: shipping 0.8745, "apply coupons" 0.8920. The manual run served the price answer to the shipping question.
  - The agent accepted both effects as a D follow-up without the author.

  The scenarios meet the criterion with synthetic vectors, so the criterion has a formal requirement and scenario. But accepting false hits that serve a wrong cached answer is a product decision, and `docs/base-standards.md` §7.1 step 3 leaves those to the author. **Does the author accept R3 as it is, or should this change move the threshold or the embedded text?**

---

## 1. Scope against the ticket

Clean. Everything traces to the sub-issue ("SQL, umbral, orden de comprobación", DoD "reformulación acierta, tema distinto no; sin `embed()` se degrada sin error") or to explicit asks in the parent:
- **Migration and dimension.** The 768 migration of all three embedding columns and the edit to `docs/backend-standards.md` §5 come from the DIS-46 note of 2026-10-09 ("Esta HU decide el modelo de embeddings … añade la migración"; "Corregir el non-goal de CM-HU-01").
- **ADR.** The ADR `docs/adr/20261103-embeddings-stay-on-llm-port.md` and the DIS-101 row in `readme.md` come from the DIS-46 comment of 2026-10-16.
- **Excluded.** Hit rate, UI and golden vectors are excluded and routed to DIS-69 (D10). The change does not widen to the parent's whole story.

## 2. Inherited acceptance criteria

Clean, apart from Q1.

| DIS-46 criterion | Requirement / scenario |
|---|---|
| Rephrasing hits, `embed()` once, no `complete()` | `semantic-cache` "Similarity lookup in explain" → "A rephrased question is answered from the similar entry" |
| Different topic is answered live | → "A question on another topic is answered live and saved with its embedding" |
| Two projects, only own `project_id` | → "The most similar entry of the project wins"; `graph-store` → "A saved embedding is found by similarity within its project" |
| Evaluation mode degrades to exact key, then `llm-required`; never fails for lack of embedding | → "Evaluation mode requests no embedding"; "Degradation without embeddings" (4 scenarios) |
| Hit rate 0.4 shown in CLI and `UsagePanel` | Not in the sub-issue DoD; DIS-69 (D10, B). Correctly excluded |

## 3. Missing scenarios

- **I3 (improvable).** In `semantic-cache` "Embedding of a saved answer", the clause "An answer served from the cache SHALL NOT be saved again, and its entry keeps its stored embedding" has no scenario step that asserts it. "A live answer is saved with its embedding and found by a rephrasing" only checks the hit count. Correction: add to that scenario "**AND** the store received exactly one save, and the entry still holds the embedding of the price question's key".
- **I3b (improvable).** The same requirement says "the operator SHALL invalidate the answer cache of every project … before asking". That is an operator duty, not system behaviour; no test can pin it. Correction: make it non-normative ("Stored embeddings are only comparable … ; after `LLM_EMBED_MODEL` changes the operator invalidates …; the system does not detect the change"). It stays documented in `.env.example`, `docs/project-context.md`, `docs/backend-standards.md` §5 and the ADR.
- **I4 (improvable).** The tie-break "then to the greatest id" (in `semantic-cache` "Similarity lookup in explain" and `graph-store` "Answer cache entries") has no scenario on the similarity path. Every tie scenario uses different `created_at` values. Correction: in `graph-store` "The most similar entry wins and ties go to the most recent", add an entry E with the same embedding and `created_at` as D and a greater `id`, inserted directly, and expect E. Or state that the id tie is pinned only by the existing `findCacheEntry` scenario.
- **I5 (improvable).** "it appears at most once per answer" (the skip event) is never asserted. The scenarios only say "events start with". Correction: in "An unavailable endpoint or an unusable vector degrades with an event", add "and holds no other `semantic_cache_skipped` event".

## 4. Ambiguity

Clean. Outside `reports/`, the change contains "fast", "easy", "secure", "efficient", "many", "appropriate" and "robust" only in two unchanged `explain` scenarios: "as many symbol searches as" and "however many statements cite it". Both are exact counts.

## 5. Open decisions

- **B1 (blocking, also points 7 and 10).** The seed and golden fingerprint refresh was decided outside the change's artifacts. The change edits seed fingerprint inputs: the store adapter, `core/knowledge` and a new `migrations/*.up.sql`, which is a contract fingerprint input. `docs/project-context.md:1481-1488` requires a PR that touches them to run `npm run seed:build` then `npm run cache:build` and commit both, and says regenerated entries need a new review.
  - `tasks.md` has no task for this.
  - Not planning it caused the clean stop of 2026-11-03 (`FINGERPRINT_MISMATCH`).
  - After apply, commit `f26c898` refreshed `seeds/graph-dump.sql`, `seeds/cache/*.json`, `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json`. It used a procedure Linear calls E1: refresh the `seed.*` headers only, without `cache:build`, keeping the DIS-110 signatures.
  - No artifact names that procedure, the files, E1–E3 or the commit. A grep of the change for "fingerprint", "seed:build" and "graph-dump" finds nothing.
  - The Linear note of 2026-11-04 says itself that "E1 a E3 pasan a `design.md` → Follow-ups … en el siguiente paso que edite la rama".

  `docs/base-standards.md` §7 forbids a post-apply fix that is not first reflected in the artifacts. The procedure also departs from `project-context.md:1486-1487`, which says to regenerate with `cache:build`, and the change gives no stated reason. Fix it in `tasks.md` (a new task), `proposal.md` → Impact and `design.md` → Follow-ups (see Corrections).

## 6. Contradictions inside the change

- **B2 (blocking, also point 8).** Who applies `reachesThreshold`:
  - Design S4: `reachesThreshold` is "the single TypeScript statement of the inclusive rule, applied by the in-memory double".
  - Task 4.3: "the threshold check applies `reachesThreshold`".
  - Design Follow-up R6 (D) says the opposite: the double compares with the `minSimilarity` it receives.
  - The code follows R6. `tests/support/in-memory-store.ts:557` has `best.similarity < minSimilarity`, and `reachesThreshold` is called only from `tests/unit/cache/similarity-cache.spec.ts`.
  - The TSDoc at `packages/core/src/cache/similarity-cache.ts:19-20` still says it is "applied by the in-memory store".

  So two artifacts and a code comment state a false fact, and nothing in production code calls `reachesThreshold`. Rule 1 of `docs/base-standards.md` §3 forbids leaving that unresolved. Correction (artifacts first, under §7):
  - Edit S4 and task 4.3 to match R6: `reachesThreshold` is the core statement of the inclusive rule, tested on its own; the double and the SQL apply `>=` to the `minSimilarity` argument.
  - Fix the TSDoc to say the same.
  - Alternatively, make the double call `reachesThreshold` when `minSimilarity === SEMANTIC_CACHE_MIN_SIMILARITY`. This is not recommended because it ties a store double to a core constant.
- **I1 (improvable).** Where the tests live:
  - Tasks 6.2 and 6.4–6.7 and `proposal.md` → Impact ("extended `tests/unit/explain/explain-cache.spec.ts`") put the `semantic-cache` explain scenarios in `explain-cache.spec.ts`.
  - R6 and the code put them in `tests/unit/explain/explain-similarity.spec.ts`.

  Correction: name `explain-similarity.spec.ts` (new) in tasks 6.2 and 6.4–6.7 and in the Tests line of `proposal.md` → Impact.

## 7. Contradictions with the project

- **B1** (see point 5) contradicts `docs/project-context.md` → Gotchas, "`verify` and the fingerprint policy" (lines 1481-1488), and the regeneration order at lines 1472-1474 (`seed:build` → `cache:build` → `drift:build`). The change neither plans that order nor documents why `cache:build` was not needed.
- **I6 (improvable).** Task 14.7 has the agent merge (`gh pr merge <n> --merge`). That is allowed only in an autonomous run, by the exception table in `docs/AUTONOMOUS-RUN.md` §5 (line 135). `docs/openspec-tasks-mandatory-steps.md` §3 (Pre-merge Review, point 5) and base-standards rule 9 say the agent never merges. Correction: condition the task on that exception, as in the correction text below.
- Otherwise clean:
  - The `docs/backend-standards.md` §5 embeddings bullet already holds the new rule (lines 99-104, linking the ADR), and HNSW SQL stays in `store-postgres`.
  - The deltas do not duplicate `answer-cache` (S12).

## 8. Contrast with the real code

- **B2** (see point 6): `packages/core/src/cache/similarity-cache.ts:19-26` and `tests/support/in-memory-store.ts:557`.
- **I2 (improvable).** The scenario `semantic-cache` → "The most similar entry of the project wins" and its test disagree:
  - The scenario's GIVEN has "two projects whose graphs both anchor the price question", and its AND step explains "in the second project after C is removed, with only an entry D".
  - In the test `tests/unit/explain/explain-similarity.spec.ts:187-208`, C is seeded under a random project id with no graph, and C's hit count is never asserted. The test only reads `d.projectId`.
  - The AND step is implemented as a separate test with a name that is not in the spec, "An entry without an embedding is never a similarity hit" (`:210`). It runs in the same project, which breaks the 1:1 name rule of task 7.3.

  Correction: split the scenario into two, using the spec text given in the correction list below. The test stays as it is, apart from adding the assertion on C.
- Everything else matches the design:
  - `explain.ts:376-392` follows the order exact → embed (live, non-empty key) → similarity lookup (unless `useCache: false`) → evaluation.
  - `finish` and `saveCache` pass `state.embedding`, and `withEvents` puts the skip event first (`:313`).
  - `FIND_SIMILAR_CACHE_ENTRY` (`queries.ts:452-464`) is the `MATERIALIZED` CTE of S3, with the threshold outside.
  - The double's checks and tie order match the SQL.
  - There is no duplicated abstraction: `recordHit` is shared by both kinds of hit.

## 9. Task size

Clean. Groups 6 and 9 are large but are split into one-scenario-at-a-time steps. All tasks up to 14.1 are done, and 14.2–14.7 are single procedures.

## 10. Mandatory steps

- Step 0 creates the branch and comes first (`feature/dis-67-semantic-cache`, matching `BRANCH_PREFIX`).
- Groups 7, 9, 10, 11, 12 and 14 carry `(MANDATORY)`, and groups 11, 12 and 14 also carry `AGENT MUST EXECUTE`.
- The step 10 report path follows the template. Mutating steps restore state (10.6, 11.7). PowerShell is checked in both shells (11.6).
- Pre-merge Review is last: 14.3 → 14.4 → 14.5, then fixes on the same PR, then the archive commit before the merge.
- The docs group comes before the run-tests group, out of the listed order, with the reason stated in group 9.
- **Missing:** a task for the fingerprint refresh this stack requires (B1).

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| semantic-cache · Similarity threshold and embedded text | The threshold is 0.85 and inclusive | 1.1, 1.2 |
| | Only one finite non-zero vector of the schema's dimension is usable | 1.3 |
| semantic-cache · Similarity lookup in explain | A rephrased question is answered from the similar entry | 6.2, 6.3 |
| | A question on another topic is answered live and saved with its embedding | 6.4 |
| | The threshold is inclusive at the boundary | 6.4 |
| | An exact hit requests no embedding | 6.4 |
| | The most similar entry of the project wins | 6.5 (test deviates, I2) |
| | Equal similarities go to the most recent entry | 6.5 |
| | A rejected similar entry is a miss without trying the next | 6.5 |
| | Evaluation mode requests no embedding | 6.4 |
| | Turning the cache off embeds only for the save | 6.4 |
| | A question without anchor requests no embedding | 6.4 |
| | A failing similarity lookup or hit record stops before the model | 6.5 |
| semantic-cache · Degradation without embeddings | Without an embedding model the call is answered as today | 6.6 |
| | An unavailable endpoint or an unusable vector degrades with an event | 6.6 |
| | A spent daily budget skips the lookup and the answer call still fails | 6.6 |
| | Another embedding error propagates before the model | 6.6 |
| | The skip event carries nothing of the question or the error | 6.7 |
| | The embedding request is not counted in the usage or the row | 6.7 |
| semantic-cache · Embedding of a saved answer | A live answer is saved with its embedding and found by a rephrasing | 6.7 |
| explain · Precedence and UNKNOWN answers (MODIFIED) | A live miss requests one embedding before the pack | 6.8 |
| | 14 unchanged scenarios | 7.3 |
| explain · Answer cache (MODIFIED) | A similarity hit over the database counts in its entry and its row | 6.9 |
| | 14 unchanged scenarios | 7.3 |
| explain · Explain events and logging (MODIFIED) | The skip event comes before the sanitisation events | 6.8 |
| | 7 unchanged scenarios | 7.3 |
| explain · Query log (MODIFIED) | 15 unchanged scenarios; new clauses pinned by semantic-cache scenarios | 7.3 |
| graph-store · Answer cache entries (MODIFIED) | A saved embedding is found by similarity within its project | 5.1, 5.2 |
| | The most similar entry wins and ties go to the most recent | 5.3 |
| | The similarity search is exact whatever the other projects hold | 5.3 |
| | Invalid cache arguments are rejected before querying (modified) | 5.3 |
| | Cache calls on an unknown project fail without writing (modified) | 5.3 |
| | The in-memory double searches by similarity like the database | 4.1, 4.3 |
| | 10 unchanged scenarios | 5.4, 7.3 |
| graph-schema · Roll back the latest migration (MODIFIED) | Roll back only the latest migration | 3.1, 3.2 |
| | Roll back the query log verification migration | 3.1 |
| | L1 / both / every-migration rollback (unchanged) | 3.4 |
| graph-schema · L1 column contract (MODIFIED) | Migrated schema matches the column contract | 3.1 |
| | An embedding of another dimension is rejected by the column | 3.3 |
| | Defaults apply on a minimal insert (unchanged) | 3.4 |
| graph-schema · History, claim, usage and cache column contract (MODIFIED) | Migrated schema matches the history, claim, usage and cache column contract | 3.1 |
| | Defaults apply on a minimal claim, query log and cache entry (unchanged) | 3.4 |
| llm-adapter · The client waits as long as the configured timeout (MODIFIED) | Without an injected fetch the request does not use the global fetch | 2.3 |
| | timeouts/refusals/redirects; response after 300 s (unchanged) | 2.4, 7.3 |
| llm-adapter · Completion request and response (MODIFIED) | A null usage reports zero tokens | 2.3 |
| | other unchanged scenarios | 2.4 |
| llm-adapter · Embedding request, order and dimension (MODIFIED) | Embeddings are returned in input order | 2.3 |
| | A vector of another dimension is rejected | 2.3 |
| | Embeddings with missing or duplicated indexes are an invalid response | 2.3 |
| | The schema dimension is 768 | 2.1, 2.2 |
| | Embeddings without usage / for no texts (unchanged) | 2.4 |

No empty row. I confirmed by grep under `tests/` that every new or modified scenario name has a test.

---

## Corrections to apply

### `openspec/changes/semantic-cache/tasks.md`

1. **B1.** Add task 10.9 to group 10 and mark it done only with its evidence:

   > - [x] 10.9 Seed and golden fingerprints (`docs/project-context.md` → "`verify` and the fingerprint policy"): this change touches seed fingerprint inputs (store adapter, `core/knowledge`, `migrations/0005_embedding-768.up.sql`). Run `npm run seed:build` and confirm it regenerates the same rows (`git diff seeds/graph-dump.sql` limited to the header fingerprints); since `ANSWER_FINGERPRINT_FILES` are untouched and the rows are identical, refresh only the `seed.*` fingerprints of `seeds/cache/*.json` and `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json` (command used: <name it>), without `cache:build`, keeping the signed reviews (DIS-110 signatures; precedent DIS-94); `tests/unit/seed/golden-coherence.spec.ts`, `tests/unit/seed/drift-golden-coherence.spec.ts` and `npm run verify` green; record it, with commit `f26c898`, in an addendum to the step 10 report (design Follow-ups E1)

2. **I1.** In 6.2, replace `tests/unit/explain/explain-cache.spec.ts` with `tests/unit/explain/explain-similarity.spec.ts (new)`. Add the same file name to 6.4–6.7.
3. **B2.** Replace 4.3's "the threshold check applies `reachesThreshold`" with "the threshold check is `similarity >= minSimilarity` on the argument (design S4, R6)".
4. **I6.** At the end of 14.7, add: "the agent merges only in an autonomous run (`KIT_AUTONOMOUS_RUN=1`, `docs/AUTONOMOUS-RUN.md` §5); otherwise the author merges".

### `openspec/changes/semantic-cache/design.md`

1. **B2.** In S4, replace "It also exports `reachesThreshold(similarity)` (similarity `>=` `SEMANTIC_CACHE_MIN_SIMILARITY`), the single TypeScript statement of the inclusive rule, applied by the in-memory double." with:

   > It also exports `reachesThreshold(similarity)` (similarity `>=` `SEMANTIC_CACHE_MIN_SIMILARITY`), the core statement of the inclusive rule, tested on its own; the store (SQL and the in-memory double) applies the same `>=` to the `minSimilarity` it receives (R6).

2. **B1.** Add a table "Relaunch of the autonomous run (2026-11-04)" to Follow-ups, marked as agent's text:
   - E1 (**A**): the `FINGERPRINT_MISMATCH` is resolved by refreshing the seed fingerprints only. `seed:build` produces the same rows and the answer fingerprint is unchanged, so the signed golden files stay valid and no `cache:build` or new review is needed. Commit `f26c898`, task 10.9.
   - E2 (**B** — DIS-69): `cache:build` fails with `qwen2.5-coder` at a 4096-token context. It matters only when the golden files are regenerated with vectors, which happens in DIS-69.
   - E3 (**A**): the pending pre-merge steps run on the existing PR #105 and on this change.
3. **B1.** Add one sentence to S6 or S7: "Migration `0005` and the edits under `store-postgres/src` and `core/knowledge` are seed fingerprint inputs: the seed and golden fingerprints are refreshed in this change (task 10.9, E1)."
4. **I2.** Add an R7 row (A): "The scenario 'The most similar entry of the project wins' is split into two, matching the two tests of `explain-similarity.spec.ts`."

### `openspec/changes/semantic-cache/proposal.md`

1. **B1.** Add an Impact bullet: "**Seed:** `seeds/graph-dump.sql`, `seeds/cache/*.json`, `seeds/drift/acme-shop.json` and `docs/measurements/graph-quality.json` get refreshed fingerprints (this change touches seed fingerprint inputs); no golden answer is regenerated (design E1)."
2. **I1.** In Impact → Tests, replace "extended `tests/unit/explain/explain-cache.spec.ts`" with "new `tests/unit/explain/explain-similarity.spec.ts`".

### `openspec/changes/semantic-cache/specs/semantic-cache/spec.md`

1. **I2.** Replace "The most similar entry of the project wins" with:

   > #### Scenario: The most similar entry of the project wins
   > - **GIVEN** a project with entries A (similarity 0.88 with the rephrased question's embedding) and B (similarity 0.95), and another project with an entry C of similarity 1; none of them stored under the rephrased question's key
   > - **WHEN** the rephrased price question is explained in the first project with a live model
   > - **THEN** the answer is B's stored response; B's hit count is 1, and A's and C's are unchanged
   >
   > #### Scenario: An entry without an embedding is never a similarity hit
   > - **GIVEN** a project whose only entry has no stored embedding and a key other than the rephrased question's
   > - **WHEN** the rephrased question is explained with a live model with usable embeddings
   > - **THEN** it is answered live with `usage.cacheHit` `false`

   Add C's hit count assertion to the test (verify step).
2. **I3.** In "A live answer is saved with its embedding and found by a rephrasing", add "**AND** the store received exactly one save, and the entry still holds the embedding of the price question's key".
3. **I3b.** In "Embedding of a saved answer", replace "the operator SHALL invalidate the answer cache of every project" with "the operator invalidates the answer cache of every project".
4. **I5.** In "An unavailable endpoint or an unusable vector degrades with an event", add "and hold no other `semantic_cache_skipped` event" after the THEN.

### `openspec/changes/semantic-cache/specs/graph-store/spec.md`

1. **I4.** In "The most similar entry wins and ties go to the most recent", add an entry E inserted directly with the embedding and `created_at` of D and an `id` greater than D's. The second search then resolves to E. Mirror it in "The in-memory double searches by similarity like the database".

### Code (after the artifacts, under §7)

1. **B2.** `packages/core/src/cache/similarity-cache.ts:19-20`: replace "applied by the in-memory store (the database applies the same `>=` in SQL)" with "the store applies the same `>=` to the minimum it receives (SQL and the in-memory double)".

### Linear (in Spanish; the `[original]` block is not touched)

- **DIS-67, comment:**

  > *Texto del agente (auditoría de spec del relanzamiento, 2026-11-04).* La auditoría sale `CHANGES REQUIRED` con 2 bloqueantes: (B1) el refresco de huellas del seed (E1, commit `f26c898`) no figura en los artefactos del cambio; se añade la tarea 10.9, el impacto en `proposal.md` y E1–E3 en `design.md` → Follow-ups, con el motivo de no ejecutar `cache:build` frente a la política de `docs/project-context.md`; (B2) `design.md` S4 y la tarea 4.3 dicen que el doble en memoria aplica `reachesThreshold`, pero R6 y el código usan el `minSimilarity` recibido; se corrigen S4, 4.3 y el TSDoc. Mejoras I1–I6 en el mismo paso. Pregunta para la autora (Q1): con `nomic-embed-text`, la reformulación de la HU padre no alcanza 0,85 (0,8321) y preguntas de otro tema con la misma estructura sí (0,8745 y 0,8920); R3 lo aceptó el agente como D. ¿Se acepta así o se cambia el umbral o el texto embebido en este cambio?

- **DIS-67, `[enhanced]`:** nothing to add beyond the note already announced there. E1–E3 now reach `design.md`.
