## Purpose

The similarity step of the answer cache of `explain`: with an embedding model configured, a question
whose embedding is close enough to the embedding of a cached question of the same project is answered
from that cache entry, and without embeddings the step is skipped and `explain` behaves exactly as the
exact-key cache of `answer-cache` and `explain` define, never failing for lack of an embedding.

## ADDED Requirements

### Requirement: Similarity threshold and embedded text

The similarity of two questions SHALL be the cosine similarity of their embeddings. The minimum
similarity of a hit SHALL be the exported constant `SEMANTIC_CACHE_MIN_SIMILARITY`, `0.85`, declared
once in the core and not read from the environment; a similarity equal to it SHALL count as reaching
it. The text embedded for a question SHALL be its cache key (`answer-cache`, "Question
normalization"), without any prefix, so a question and a cached entry are embedded from the same kind
of text.

A vector returned by the embedding request SHALL be usable only when the request returned exactly one
vector, of exactly `EMBEDDING_DIMENSIONS` components (`llm-adapter`, "Embedding request, order and
dimension"), every component a finite number, and at least one component different from 0. Any other
result SHALL be an unusable vector.

#### Scenario: The threshold is 0.85 and inclusive

- **WHEN** the exported threshold is read, and the similarities `0.85`, `0.9`, `1` and `0.8499` are
  compared with it
- **THEN** the threshold is `0.85`, and the first three reach it and the last does not

#### Scenario: Only one finite non-zero vector of the schema's dimension is usable

- **WHEN** the usability of these embedding results is checked: one vector of `EMBEDDING_DIMENSIONS`
  components with one component `1` and the rest `0`; no vector; two such vectors; one vector of
  `EMBEDDING_DIMENSIONS − 1` components; one vector with a `NaN` component; one with an `Infinity`
  component; one vector of `EMBEDDING_DIMENSIONS` zeros
- **THEN** only the first is usable

### Requirement: Similarity lookup in explain

In live mode, when the request does not set `useCache: false`, the question has a non-empty cache key
and the exact key missed (`explain`, "Answer cache"), explain SHALL request the embedding of the key
once (step 3 of `explain`, "Precedence and UNKNOWN answers", after anchoring and the exact lookup and
before the pack) and, with a usable vector, look up once the most similar cache entry of the project whose stored
embedding has a similarity at least `SEMANTIC_CACHE_MIN_SIMILARITY` (`graph-store`, "Answer cache
entries"). Only entries of the request's project that have a stored embedding SHALL be considered;
among several, the most similar wins, and equal similarities go to the most recently created entry,
then to the greatest id.

When an entry is found and its stored response is accepted (`answer-cache`, "Stored response"),
explain SHALL record its hit and answer it exactly as an exact-key hit (`explain`, "Answer cache"):
the entry's hit count plus one and its last hit instant set to the clock's first read of the call, the
answer of a hit (`answer-cache`, "Answer of a cache hit", with `usage.cacheHit` `true`, 0 tokens and 0
cost), no pack, no prior-claims read, no source read, no completion, no claim written and a
`query_log` row with the cache flag `true`. The answer SHALL NOT say whether the hit was exact or by
similarity. No entry, or an entry whose stored response is rejected, is a miss: explain SHALL go on as
after an exact miss, without an event and without trying another entry.

The exact key SHALL always be checked first: an exact hit SHALL request no embedding. In evaluation
mode no embedding SHALL be requested and no similarity lookup made: only an exact hit is served, and a
miss answers the `UNKNOWN` `llm-required` of `explain`. With `useCache: false` no lookup of any kind
SHALL be made, but in live mode the embedding of the key SHALL still be requested once, at the same
point, for the save (requirement "Embedding of a saved answer"). A question with no anchor or with an
empty key requests no embedding.

A failure of the similarity lookup or of the recording of its hit SHALL propagate unchanged, before
any pack, completion or `query_log` row.

#### Scenario: A rephrased question is answered from the similar entry

- **GIVEN** acme-shop loaded in the in-memory store with one cache entry under the key
  `como se calcula el precio final de un pedido`, holding a valid stored answered response, the
  embedding E1 and a hit count of 0, and a live model whose embedding of the key
  `explicame el calculo del precio final` is a vector E2 with a similarity of 0.9 with E1
- **WHEN** `Explícame el cálculo del precio final` is explained with the default `useCache`
- **THEN** the answer is the stored response's `answer`, `statements`, `evidence`, `priorClaims` and
  `confidence` with `persisted: true`, `events: []`, `usage.cacheHit` `true`, `usage.costUsd` 0 and 0
  input and output tokens, and the answer has exactly the keys of an exact-key hit's answer
  (`answer-cache`, "Answer of a cache hit")
- **AND** the model received exactly one embedding request, for `["explicame el calculo del precio
  final"]`, and no completion; the source reader, the traversal and the prior-claims read received 0
  calls and no claim was written
- **AND** the exact key was looked up once before the embedding request, the similarity lookup was made
  once with E2 and the threshold `0.85`, and the entry's hit count is 1 with its last hit instant the
  clock's first read of the call
- **AND** the store received one `query_log` row with the cache flag `true`, every counter and cost 0
  and as baseline tokens the stored usage's `baselineTokens`

#### Scenario: A question on another topic is answered live and saved with its embedding

- **GIVEN** the entry of the previous scenario, and a live scripted model that answers one statement
  citing the anchor span and accepts every verification, whose embedding of the key
  `como se validan los cupones` is a vector E3 with a similarity of 0.4 with E1
- **WHEN** `¿Cómo se validan los cupones?` is explained
- **THEN** the model received one embedding request and the `answer` completion, and the answer is the
  model's stored answer with `usage.cacheHit` `false`
- **AND** the first entry keeps its hit count of 0
- **AND** the project then holds an entry under `como se validan los cupones` whose stored embedding is
  E3, and the model received no second embedding request

#### Scenario: The threshold is inclusive at the boundary

- **GIVEN** the entry of the first scenario with E1 the unit vector of the first component, and a live
  model whose embedding of the rephrased key is the vector whose first five components are
  `17, 10, 3, 1, 1` and whose other components are 0 (similarity exactly `17 / 20 = 0.85` with E1)
- **WHEN** the rephrased question is explained, and again with an embedding whose first five
  components are `16.99, 10, 3, 1, 1` (similarity below 0.85)
- **THEN** the first answer is served from the entry, and the second is answered live and leaves the
  entry's hit count at 1

#### Scenario: An exact hit requests no embedding

- **GIVEN** the entry of the first scenario and a live model that counts its embedding requests
- **WHEN** `¿Cómo se calcula el precio final de un pedido?` is explained
- **THEN** the answer is served from the entry, the model received 0 embedding requests and 0
  completions, and no similarity lookup was made

#### Scenario: The most similar entry of the project wins

- **GIVEN** two projects in the in-memory store whose graphs both anchor the price question; the first
  project with entries A (similarity 0.88 with the question's embedding) and B (similarity 0.95), and
  the second project with an entry C of similarity 1
- **WHEN** the rephrased price question is explained in the first project with a live model
- **THEN** the answer is B's stored response; B's hit count is 1, and A's and C's are unchanged
- **AND** explained in the second project after C is removed, with only an entry D that has no stored
  embedding and the same key text as A, it is answered live

#### Scenario: Equal similarities go to the most recent entry

- **GIVEN** a project with two entries of the same embedding, created at `2026-10-01T00:00:00Z`
  (response R₁) and `2026-10-02T00:00:00Z` (response R₂)
- **WHEN** a question whose embedding equals theirs (and whose key matches neither) is explained live
- **THEN** the answer is R₂'s

#### Scenario: A rejected similar entry is a miss without trying the next

- **GIVEN** a project with an entry of similarity 0.95 whose stored response is
  `{ "answer": "stale golden" }` and an entry of similarity 0.9 holding a valid stored response, and a
  live scripted model that answers one statement and accepts every verification
- **WHEN** the rephrased question is explained
- **THEN** the answer is the model's stored answer, without a `semantic_cache_skipped` event, and both
  entries keep their hit counts

#### Scenario: Evaluation mode requests no embedding

- **GIVEN** acme-shop loaded in the in-memory store with the entry of the first scenario, and an
  evaluation model that counts its embedding requests
- **WHEN** `Explícame el cálculo del precio final` is explained, and then
  `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO`
- **THEN** the first answer is exactly the `UNKNOWN` `llm-required` answer of `explain` with
  `events: []`, and the second is served from the entry
- **AND** the model received 0 embedding requests and no similarity lookup was made

#### Scenario: Turning the cache off embeds only for the save

- **GIVEN** the entry of the first scenario and a live scripted model that answers one statement and
  accepts every verification, whose embedding of the rephrased key is E2
- **WHEN** `Explícame el cálculo del precio final` is explained with `useCache: false`
- **THEN** no exact or similarity lookup was made, the model received one embedding request and the
  `answer` completion, and the new entry under the rephrased key holds E2
- **AND** explained again with `useCache: false` and an embedding request that fails with
  `LlmUnavailable` reason `timeout`, the answer is the model's stored answer whose events start with
  `{ type: 'semantic_cache_skipped', code: 'embedding-unavailable' }`, and the entry under the
  rephrased key then has no stored embedding

#### Scenario: A question without anchor requests no embedding

- **GIVEN** acme-shop loaded in the in-memory store and a live scripted model with usable embeddings
  that records its embedding requests
- **WHEN** `¿Dónde vive el ornitorrinco?` is explained
- **THEN** the answer is `UNKNOWN` with reason `no-anchor`, the model received 0 embedding requests and
  0 completions, and no exact or similarity lookup was made

#### Scenario: A failing similarity lookup or hit record stops before the model

- **GIVEN** acme-shop loaded in the in-memory store and a live model with usable embeddings that counts
  its completions
- **WHEN** the rephrased question is explained with a similarity lookup that rejects with an error, and
  then with a similar entry whose hit record rejects with `CacheWriteFailed`
- **THEN** each call fails with that same error
- **AND** the model received 0 completions, the source reader and the prior-claims read 0 calls, and
  the store received no `query_log` row

### Requirement: Degradation without embeddings

The similarity step SHALL never make `explain` fail for lack of an embedding. In live mode, when the
embedding request:

- fails with `LlmUnavailable` with reason `not-configured` (no `LLM_EMBED_MODEL`), explain SHALL skip
  the similarity lookup without an event;
- fails with `LlmUnavailable` with any other reason, or returns an unusable vector (requirement
  "Similarity threshold and embedded text"), explain SHALL skip the similarity lookup and add the event
  `{ type: 'semantic_cache_skipped', code: 'embedding-unavailable' }`;
- fails with `BudgetExhausted`, explain SHALL skip the similarity lookup and add the event
  `{ type: 'semantic_cache_skipped', code: 'budget-exhausted' }`;
- fails with any other error, that error SHALL propagate unchanged, before any pack, completion or
  `query_log` row (an `LlmPort` reports every failure as `LlmUnavailable`, so another error is a
  defect, as for a `verify` call).

After a skip, explain SHALL go on exactly as after an exact miss (evaluation mode cannot reach this
point): the pack, the completion and its own failures as today (a `BudgetExhausted` of the `answer`
call still propagates), and a cacheable answer saved without an embedding. The code SHALL be one code
of the exported closed set `SEMANTIC_CACHE_SKIPPED_CODES` (`embedding-unavailable`,
`budget-exhausted`), declared once. The event SHALL carry no message, no detail, no cause, no reason
or status of the error, no part of the question or its key, and no component of a vector; it appears
at most once per answer.

The embedding request SHALL NOT count as a model call for the usage of the answer or its `query_log`
row: its tokens and cost are not added (they are 0 USD with the reference model), and it never counts
as a resolved call in the sense of `explain`, "Query log", whatever it returns. The daily spend ceiling SHALL
still be checked before it (`llm-adapter`, "Daily spend ceiling").

#### Scenario: Without an embedding model the call is answered as today

- **GIVEN** acme-shop loaded in the in-memory store with the entry of the rephrasing scenario, and a
  live scripted model that answers one statement and accepts every verification, whose embedding
  request fails with `LlmUnavailable` reason `not-configured`
- **WHEN** the rephrased question is explained
- **THEN** the answer is the model's stored answer, its events are those of the same call without the
  similarity step (no `semantic_cache_skipped`), and no similarity lookup was made
- **AND** the new entry under the rephrased key has no stored embedding

#### Scenario: An unavailable endpoint or an unusable vector degrades with an event

- **GIVEN** acme-shop loaded in the in-memory store and a live scripted model that answers one statement
  and accepts every verification, whose embedding request, in turn, fails with `LlmUnavailable` reasons
  `network`, `timeout`, `http-status`, `invalid-response` and `dimension-mismatch`, and returns a vector
  of zeros
- **WHEN** the rephrased question is explained against each
- **THEN** each answer is the model's stored answer whose events start with exactly
  `{ type: 'semantic_cache_skipped', code: 'embedding-unavailable' }`, and no similarity lookup was
  made
- **AND** each saved entry has no stored embedding

#### Scenario: A spent daily budget skips the lookup and the answer call still fails

- **GIVEN** acme-shop loaded in the in-memory store with no entry, and a live model wrapped by a daily
  budget whose ceiling the day's spend already reaches
- **WHEN** the rephrased question is explained
- **THEN** the call fails with `BudgetExhausted` from the `answer` call, the inner model received no
  call, and the store received no `query_log` row
- **AND** with an inner model whose embedding request alone fails with `BudgetExhausted` and that
  answers one statement, the answer is the model's stored answer whose events start with
  `{ type: 'semantic_cache_skipped', code: 'budget-exhausted' }`

#### Scenario: Another embedding error propagates before the model

- **GIVEN** a live model whose embedding request rejects with a plain `Error` and that counts its
  completions
- **WHEN** the rephrased question is explained
- **THEN** the call fails with that same error, the model received 0 completions and the store received
  no `query_log` row

#### Scenario: The skip event carries nothing of the question or the error

- **GIVEN** a question holding a sentinel text that anchors in acme-shop, and a live model whose
  embedding request fails with `LlmUnavailable` reason `http-status` and status 500
- **WHEN** it is explained
- **THEN** the `semantic_cache_skipped` event has exactly the keys `type` and `code`, and the serialised
  events hold neither the sentinel, nor the key, nor `500`, nor `http-status`
- **AND** nothing is written through `console`

#### Scenario: The embedding request is not counted in the usage or the row

- **GIVEN** a live scripted model that answers one statement with 100 input and 10 output tokens per
  completion, accepts every verification, and reports 7 input tokens for its embedding request
- **WHEN** the rephrased question is explained and answered live
- **THEN** the answer's usage and its `query_log` row hold the tokens and cost of the completions only,
  exactly as the same call with no embedding model

### Requirement: Embedding of a saved answer

In live mode, a cacheable answer (`answer-cache`, "Cacheable answers") SHALL be saved with the usable
vector requested for its key at the similarity step, whatever `useCache` is, so a later rephrasing can
find it; the embedding SHALL be requested once per call, never again for the save. When no usable
vector was obtained (skip of requirement "Degradation without embeddings"), the answer SHALL be saved
without an embedding, as before. An answer served from the cache SHALL NOT be saved again, and its
entry keeps its stored embedding.

Stored embeddings are only comparable with embeddings of the same model: after `LLM_EMBED_MODEL`
changes, the operator SHALL invalidate the answer cache of every project (a full reindex,
`POST /api/projects/{id}/index` with `incremental: false`, or `invalidateCache`) before asking; the
system does not detect the change.

#### Scenario: A live answer is saved with its embedding and found by a rephrasing

- **GIVEN** acme-shop loaded in the in-memory store with no cache entry, and a live scripted model that
  answers one statement citing the anchor span and accepts every verification, whose embeddings of the
  keys of `¿Cómo se calcula el precio final de un pedido?` and `Explícame el cálculo del precio final`
  have a similarity of 0.92
- **WHEN** the price question is explained, and then the rephrased question
- **THEN** after the first call the project holds one entry under the price question's key with that
  key's embedding and a hit count of 0
- **AND** the second answer is served from that entry with `usage.cacheHit` `true`, the model received
  completions only during the first call and exactly one embedding request in each call, and the entry's
  hit count is 1
