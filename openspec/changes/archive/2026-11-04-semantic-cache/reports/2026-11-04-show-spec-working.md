# Show spec working: semantic-cache (DIS-67)

- Date: 2026-11-04
- Change: semantic-cache · PR #105 · branch `feature/dis-67-semantic-cache` (head `77db509`)
- Step: 14.3 of `tasks.md` (pre-merge review of the autonomous run)

*Agent's text: executed by the agent of the review step in an autonomous run, without the author. It
re-runs the real interfaces on 2026-11-04 instead of only reusing the step 11 evidence
(`2026-11-03-11-manual-interface-testing.md`), which stays valid for the calibration of the threshold
(11.2) and the PowerShell check (11.6).*

Environment: local Postgres `codemind-postgres-1` (migration `0005_embedding-768` applied), Ollama with
`qwen2.5-coder:latest` (chat) and `nomic-embed-text:latest` (embedding, 768 components). The `LLM_*`
variables were set only on each command; evaluation mode was obtained with `LLM_BASE_URL`,
`LLM_API_KEY`, `LLM_MODEL` and `LLM_EMBED_MODEL` empty. acme-shop id
`a794456d-6d1b-5b55-a360-13fec83dc7bc`.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| `semantic-cache` "A rephrased question is answered from the similar entry" | CLI `ask` of a rephrasing (similarity 0.9260 measured in 11.2) against the seeded price entry holding the real `nomic-embed-text` embedding of its key | Served from the cache: price entry `hit_count` 0 → 1, `last_hit_at` set, one `query_log` row `cache_hit` true, 0 tokens, cost 0 | yes | E1, E2 |
| `semantic-cache` "Evaluation mode requests no embedding" | CLI in evaluation mode: `Explícame el cálculo del precio final`, then the exact price question | `UNKNOWN (llm-required)` (no similarity hit in evaluation mode), then the stored price answer (exact hit) | yes | E3 |
| `semantic-cache` "An unavailable endpoint or an unusable vector degrades with an event" | CLI live with `LLM_EMBED_MODEL=qwen2.5-coder` (not an embedding model) and a fresh question | exit 0, stderr `{"level":"info","type":"semantic_cache_skipped","code":"embedding-unavailable"}`, the live answer arrives; its cache entry is saved with `question_embedding` NULL | yes | E4 |
| `semantic-cache` "Without an embedding model the call is answered as today" | CLI live with `LLM_EMBED_MODEL` empty and another fresh question | exit 0, live answer, stderr holds only the usual `entailment_unverified` event, no `semantic_cache_skipped` | yes | E5 |
| `semantic-cache` "A live answer is saved with its embedding and found by a rephrasing" | CLI live with `nomic-embed-text`: `¿Cómo funciona ShippingService con el transportista?`, then the rephrasing `¿Cómo funciona ShippingService con el transportista de envíos?` | first call answered live and saved with a 768-component embedding; second call served from that entry (`hit_count` 1, row `cache_hit` true, 0 tokens) | yes | E6 |
| `explain` "Answer cache" / "A hit is answered with the usage of a hit" through HTTP | `POST /api/projects/<acme>/ask` with the rephrasing | `HTTP/1.1 200 OK`, `usage.cacheHit: true`, 0 tokens, cost 0, `savingsPct` 100; body keys `answer, statements, evidence, confidence, usage` (no field says exact or similar) | yes | E7 |
| Error path through HTTP | the same request to a random UUID | `HTTP/1.1 404 Not Found`, `PROJECT_NOT_FOUND` | yes | E7 |
| Privacy of the request log | `grep -ci precio` over the API log of the run | `0` | yes | E7 |

## Evidence

E1 — the seeded price entry was given the real embedding of its key (requested from Ollama
`/v1/embeddings` with `nomic-embed-text` for `como se calcula el precio final de un pedido`: 768
components) with an `UPDATE` on its row (`ec5a434d-…`), so the id and the response stay those of the seed:

```
ec5a434d-9d8f-4ae8-b5d1-b80dd98b8fd4|768
UPDATE 1
```

E2 — `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5-coder LLM_EMBED_MODEL=nomic-embed-text npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"`: exit 0, the stored price
answer with its evidence listing; then in SQL:

```
como se calcula el precio final de un pedido|1|2026-11-04 10:22:11.568+00
t|0|0|0.000000|2026-11-04 10:22:11.788091+00      (query_log: cache_hit, input, output, cost)
```

E3 — evaluation mode:

```
$ npm run cli -- ask acme-shop "Explícame el cálculo del precio final"
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
$ npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
El precio final de un pedido se calcula utilizando una serie de servicios y lógica definidos en la clase PriceCalculator. …
```

E4 — `LLM_EMBED_MODEL=qwen2.5-coder`, question `¿Cómo se determina el precio total de un pedido?`
(the first attempt ended with `LLM_UNAVAILABLE` `timeout` of the `answer` call while Ollama reloaded the
chat model; repeated once):

```
exit=0
{"level":"info","type":"semantic_cache_skipped","code":"embedding-unavailable"}
El precio total de un pedido se determina en varias etapas …
cache_entry: como se determina el precio total de un pedido | question_embedding IS NULL = t | hit_count 0
```

E5 — `LLM_EMBED_MODEL=` empty, question `¿Cómo se obtiene el precio total de un pedido?` (one `timeout`
retry as above): exit 0, stderr only
`{"level":"info","type":"entailment_unverified",…,"reason":"invalid-output"}`, saved entry with
`question_embedding` NULL.

E6 — live save with the embedding and a rephrasing (one `timeout` retry of the first call):

```
como funciona shippingservice con el transportista|f|768|0     (key, embedding IS NULL, dims, hit_count)
… second call …
como funciona shippingservice con el transportista|1
t|0|0.000000|2026-11-04 10:34:13.437364+00                     (query_log: cache_hit, input, cost)
```

E7 — API (`npm -w packages/api run dev` with the live variables, stopped afterwards with
`node scripts/dev-processes.mjs stop`):

```
HTTP/1.1 200 OK
{"usage":{"inputTokens":0,"outputTokens":0,"baselineTokens":7123,"baselineEstimator":"chars-div-4","savingsPct":100,"costUsd":0,"latencyMs":76,"cacheHit":true,…},"keys":["answer","statements","evidence","confidence","usage"]}
HTTP/1.1 404 Not Found
{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
grep -ci precio api.log → 0
```

No screenshot: the change has no browser UI.

## State

- Before (2026-11-04 10:21:29 UTC): `project` 2, `cache_entry` 7, with an embedding 0, `query_log` 0,
  `claim` 0, `evidence` 0; acme-shop entries `ec5a434d-…` (price), `3223ed46-…` (coupons),
  `0677f2ed-…` (`drift:`), `2a90073f-…` (OrderObserver), all `hit_count` 0, `last_hit_at` empty,
  response md5 `a4f0c711…`, `1bceb7dd…`, `5c7e6f38…`, `fb071839…`.
- After the runs: 3 new cache entries, 9 `query_log` rows, 6 claims, the price entry with an embedding
  and `hit_count` 4.
- Restored: yes. In one transaction: deleted the `cache_entry`, `query_log` and `claim` rows created
  after 10:21:29 UTC (3, 9 and 6; evidence cascades), set the price entry's `question_embedding` NULL,
  `hit_count` 0, `last_hit_at` NULL. Re-check: `project` 2, `cache_entry` 7, with an embedding 0,
  `query_log` 0, `claim` 0, `evidence` 0; the four acme-shop rows equal the snapshot (ids, md5,
  `hit_count`, `last_hit_at`, `created_at`); no `codemind*` session in `pg_stat_activity`; no dev
  process left.

## Not demonstrated

- "A spent daily budget skips the lookup and the answer call still fails" and "Another embedding error
  propagates before the model": they need a spent daily ceiling or an `LlmPort` that throws a non-LLM
  error, which the real CLI cannot produce without editing the database's spend or the adapter; they
  are pinned by `tests/unit/explain/explain-similarity.spec.ts` (green in CI run 41812095131).
- The threshold boundary (0.85 exactly) is a property of the arithmetic, pinned by the unit and
  integration tests; the real model never returns such a vector.

## Handoff

The change is demonstrably working against the real CLI, API, database and embedding model: similarity
hits, evaluation mode without similarity, degradation with and without the event, and the save of a
live answer with its embedding found by a rephrasing. The known limitation R3 (same-frame questions can
hit at 0.85) is unchanged and recorded in `design.md`. No screenshot or other file was left at the
repository root.
