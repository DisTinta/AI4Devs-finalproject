# Verify against spec: semantic-cache (DIS-67)

- Date: 2026-11-04
- Change: semantic-cache · PR #105 · head `77db509`
- Step: 14.4 of `tasks.md`, inline mode of `verify-against-spec` (`docs/AUTONOMOUS-RUN.md` §6)

*Agent's text: conformance audit written by the agent of the review step in an autonomous run, without
the author. Compared: the five delta specs of `openspec/changes/semantic-cache/specs/` against the
diff `origin/final-project-CRN...HEAD` (production code, migrations, tests and doubles).*

## 1. Requirements implemented correctly

| Requirement (delta) | Code | Tests |
|---|---|---|
| `semantic-cache` "Similarity threshold and embedded text": constant `0.85`, inclusive, not read from the environment; the embedded text is the cache key without prefix; usable vector = one vector of `EMBEDDING_DIMENSIONS` finite components, not all 0 | `packages/core/src/cache/similarity-cache.ts:16` (constant), `:25` (`reachesThreshold`), `:36` (`usableVector`); key embedded at `packages/core/src/explain/explain.ts:385` → `:346` (`llm.embed([key])`) | `tests/unit/cache/similarity-cache.spec.ts` ("The threshold is 0.85 and inclusive", "Only one finite non-zero vector of the schema's dimension is usable") |
| `semantic-cache` "Similarity lookup in explain": live only, after the exact miss, before evaluation mode and the pack; one embedding request; one lookup with `SEMANTIC_CACHE_MIN_SIMILARITY`; the hit served and recorded as an exact hit; a rejected entry is a miss without event or second try; `useCache: false` embeds only for the save; no anchor or empty key requests nothing; lookup and hit-record failures propagate | `explain.ts:376-392` (exact lookup, then `llm.mode === 'live' && key !== ''`, `embedKey`, `findSimilarCacheEntry`, shared `recordHit` at `:326`); the hit leaves through the exact-hit path of `explain()` (`answerFromCache`, row with the cache flag) | `tests/unit/explain/explain-similarity.spec.ts` (the 12 scenarios of the requirement, names identical), `tests/unit/explain/explain.spec.ts` ("A live miss requests one embedding before the pack"), `tests/integration/explain/explain.spec.ts` ("A similarity hit over the database counts in its entry and its row") |
| `semantic-cache` "Degradation without embeddings": `not-configured` silent; other `LlmUnavailable` and unusable vector → `embedding-unavailable`; `BudgetExhausted` → `budget-exhausted`; other errors propagate before the pack with no row; event first, once, code only; embedding not counted in usage nor row | `similarity-cache.ts:53` (`skipCode`), `explain.ts:346-353` (`embedKey`), `:307` (`withEvents` puts the skip event before the answer's events), `explain-event.ts:243-271` (closed codes, event type in the union); the meter does not count `embed` (`packages/core/src/explain/usage-meter.ts:62`) | `explain-similarity.spec.ts` (the 6 scenarios of the requirement), `tests/unit/explain/explain-sanitization.spec.ts` ("The skip event comes before the sanitisation events") |
| `semantic-cache` "Embedding of a saved answer": the vector of the similarity step saved with a cacheable answer whatever `useCache` is; none after a skip; a hit is not saved again | `explain.ts:250` (`saveCache(…, state.embedding)`), `:274` | `explain-similarity.spec.ts` ("A live answer is saved with its embedding and found by a rephrasing", "A question on another topic is answered live and saved with its embedding") |
| `explain` "Precedence and UNKNOWN answers", "Answer cache", "Explain events and logging", "Query log" (modified) | `explain.ts:376-392`, `:307`, `:186-195` (no row when no completion resolved: `embed` is not a resolved call of the meter) | the unchanged tests of the four requirements (title grep: every `explain` scenario found in `tests/`) plus the two new scenarios above |
| `graph-store` "Answer cache entries": `findSimilarCacheEntry` (checks in order, exact search over the project's entries with an embedding, ties by `created_at` then id, threshold outside), optional `embedding` of `saveCacheEntry`, the in-memory double | `packages/core/src/ports/StorePort.ts:266`, `:289`; `packages/core/src/knowledge/cache-entry.ts:76`, `:93`; `packages/adapters/store-postgres/src/postgres-store.ts:450`, `:468`; `packages/adapters/store-postgres/src/queries.ts:452`, `:480`; `tests/support/in-memory-store.ts:538`, `:561` | `tests/integration/store/cache-entry.spec.ts` ("A saved embedding is found by similarity within its project", "The most similar entry wins and ties go to the most recent", "The similarity search is exact whatever the other projects hold", "Invalid cache arguments are rejected before querying", "Cache calls on an unknown project fail without writing"), `tests/unit/store/in-memory-store.spec.ts` ("The in-memory double searches by similarity like the database") |
| `graph-schema` columns `vector(768)`, rollback of `0005` | `packages/adapters/store-postgres/migrations/0005_embedding-768.up.sql`, `.down.sql` | `tests/integration/store/migrations.spec.ts` (the column-contract tests, "Roll back only the latest migration", "Roll back the query log verification migration", "An embedding of another dimension is rejected by the column") |
| `llm-adapter` 768 components | `packages/core/src/llm/embedding-dimensions.ts:8` (the adapter reads the constant) | `tests/unit/llm/llm-unavailable.spec.ts` ("The schema dimension is 768"), `tests/unit/llm/openai-compatible-llm.spec.ts` (768-component fixtures), `tests/unit/llm/default-transport.spec.ts` |

## 2. Requirements missing or partial

None in the production code. One test is partial against its scenario (see the table at the end):

- `semantic-cache` "Turning the cache off embeds only for the save", first WHEN: «the new entry under the
  rephrased key holds E2». `tests/unit/explain/explain-similarity.spec.ts:269-295` checks that no
  lookup was made, that one embedding was requested and that the answer is live, but never reads the
  entry's embedding after the first call; it only asserts, after the second call, that the entry has
  no embedding (`:293`). A mutation of `explain.ts:250` that dropped the vector when `useCache` is
  `false` would pass every test of the change. **Finding V1.**

## 3. Unspecified behaviour

- `reachesThreshold` (`similarity-cache.ts:25`) is exported but no production code calls it: the
  store applies `>=` to the `minSimilarity` it receives. This is not unrequested scope: design S4 and
  the follow-ups B2 (relaunch) and R6 record it as the single statement of the inclusive rule, tested
  on its own. Already decided (D, R6); no new finding.
- `usableVector` and `skipCode` are exported through `packages/core/src/cache/index.ts`; they are the
  pure helpers of design S4 and carry no behaviour beyond the requirement text. Kept (S4).
- `SimilarCacheEntry.similarity` (`cache-entry.ts`) is returned by the store: specified in `graph-store`
  "Answer cache entries" (the store resolves to the entry "and that `similarity`").
- The Postgres search can resolve to an entry whose computed similarity is `NaN`: with stored or query
  components large enough to overflow single precision (for example `3e38`), pgvector's `<=>` returns
  `NaN`, `1 - NaN` is `NaN`, and in Postgres `NaN >= 0.85` is true (checked on the local database:
  `select (1 - ('[3e38,3e38]'::vector <=> '[1,1]'::vector)) >= 0.85` → `t`). Such vectors pass
  `assertValidEmbedding` (finite JavaScript numbers). The requirement says the entry is resolved only
  when its similarity is at least the minimum, which `NaN` is not: behaviour the spec does not allow.
  **Finding V2.**

Other checks:

- Dependencies: none added (`package.json` and `package-lock.json` untouched by the diff).
- Authorisation: the project has no authentication; every store call is scoped by `projectId`, checked
  before any statement (`postgres-store.ts:456-458`).
- Response fields: none added; the public answer of a similarity hit has exactly the keys of an exact
  hit (asserted at `explain-similarity.spec.ts:113`; observed on the real API in the show-spec-working
  report: `answer, statements, evidence, confidence, usage`).
- Tests weaker than their scenario: V1 above. The other scenario tests assert at least their THEN
  (read one by one; for example "The most similar entry of the project wins" asserts B's hit count 1
  and A's and C's 0).

## Scenario → test → state

State from CI run 41812095131 (head `77db509`, every check green) and the title grep of the step.

| Scenario | Test | State |
|---|---|---|
| semantic-cache · The threshold is 0.85 and inclusive | `tests/unit/cache/similarity-cache.spec.ts` | green |
| semantic-cache · Only one finite non-zero vector of the schema's dimension is usable | `tests/unit/cache/similarity-cache.spec.ts` | green |
| semantic-cache · A rephrased question is answered from the similar entry | `tests/unit/explain/explain-similarity.spec.ts` | green |
| semantic-cache · A question on another topic is answered live and saved with its embedding | same file | green |
| semantic-cache · The threshold is inclusive at the boundary | same file | green |
| semantic-cache · An exact hit requests no embedding | same file | green |
| semantic-cache · The most similar entry of the project wins | same file | green |
| semantic-cache · An entry without an embedding is never a similarity hit | same file | green |
| semantic-cache · Equal similarities go to the most recent entry | same file | green |
| semantic-cache · A rejected similar entry is a miss without trying the next | same file | green |
| semantic-cache · Evaluation mode requests no embedding | same file | green |
| semantic-cache · Turning the cache off embeds only for the save | same file | green, partial (V1) |
| semantic-cache · A question without anchor requests no embedding | same file | green |
| semantic-cache · A failing similarity lookup or hit record stops before the model | same file | green |
| semantic-cache · Without an embedding model the call is answered as today | same file | green |
| semantic-cache · An unavailable endpoint or an unusable vector degrades with an event | same file | green |
| semantic-cache · A spent daily budget skips the lookup and the answer call still fails | same file | green |
| semantic-cache · Another embedding error propagates before the model | same file | green |
| semantic-cache · The skip event carries nothing of the question or the error | same file | green |
| semantic-cache · The embedding request is not counted in the usage or the row | same file | green |
| semantic-cache · A live answer is saved with its embedding and found by a rephrasing | same file | green |
| explain · A live miss requests one embedding before the pack | `tests/unit/explain/explain.spec.ts` | green |
| explain · The skip event comes before the sanitisation events | `tests/unit/explain/explain-sanitization.spec.ts` | green |
| explain · A similarity hit over the database counts in its entry and its row | `tests/integration/explain/explain.spec.ts` | green |
| explain · the 52 unchanged scenarios of the four modified requirements | their existing files (`explain.spec.ts`, `explain-cache.spec.ts`, `explain-verification.spec.ts`, `explain-sanitization.spec.ts`, `explain-language.spec.ts`, `stale-refresh.spec.ts`, `tests/integration/explain/explain.spec.ts`) | green |
| graph-store · A saved embedding is found by similarity within its project | `tests/integration/store/cache-entry.spec.ts` | green |
| graph-store · The most similar entry wins and ties go to the most recent | same file | green |
| graph-store · The similarity search is exact whatever the other projects hold | same file | green |
| graph-store · Invalid cache arguments are rejected before querying | same file | green |
| graph-store · Cache calls on an unknown project fail without writing | same file | green |
| graph-store · The in-memory double searches by similarity like the database | `tests/unit/store/in-memory-store.spec.ts` | green |
| graph-store · the 11 unchanged scenarios of "Answer cache entries" | `cache-entry.spec.ts`, `postgres-cache-write-errors.spec.ts`, `in-memory-store.spec.ts` | green |
| graph-schema · Migrated schema matches the column contract / the history, claim, usage and cache column contract | `tests/integration/store/migrations.spec.ts` | green |
| graph-schema · Roll back only the latest migration / Roll back the query log verification migration / An embedding of another dimension is rejected by the column | same file | green |
| graph-schema · the unchanged rollback and defaults scenarios | `migrations.spec.ts`, `graph-schema-constraints.spec.ts`, `history-claims-constraints.spec.ts` | green |
| llm-adapter · The schema dimension is 768 | `tests/unit/llm/llm-unavailable.spec.ts` | green |
| llm-adapter · A vector of another dimension is rejected, and the other embedding/completion scenarios | `tests/unit/llm/openai-compatible-llm.spec.ts`, `default-transport.spec.ts` | green |
| llm-adapter · A response after 300 s is accepted | none in the suite: a recorded manual check by its own text ("run once by hand: too slow for the suite"), unchanged by this change (the requirement is copied for its 768-component fixture) | absent by design |

## Verdict

The implementation matches the five deltas except V1 (a scenario test weaker than its THEN) and V2 (a
`NaN` similarity can pass the minimum in Postgres). Both are fixed in this PR; see
`2026-11-04-adversarial-review.md` → Resolution.
