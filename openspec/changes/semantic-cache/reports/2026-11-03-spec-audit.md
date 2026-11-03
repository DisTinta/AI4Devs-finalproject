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
