# Manual Interface Testing Report

- Date: 2026-11-03
- Change: semantic-cache
- Step: 11 Backend: Manual Interface Testing

*Agent's text: executed by the agent of the apply step in an autonomous run. Paths mask the OS user name.*

## Preconditions (11.1)
- Local database up (`codemind-postgres-1`), `npm run db:migrate` applied `0005_embedding-768`; `\d cache_entry` shows `question_embedding vector(768)`.
- Ollama listed `qwen2.5-coder:latest` and `nomic-embed-text:latest`.
- Baseline (same as step 10): 2 projects, 6 cache entries, 0 with embedding, 0 `query_log` rows, 0 claims (so no stale claims to record). acme-shop id `a794456d-6d1b-5b55-a360-13fec83dc7bc` with three entries, all without embedding, `hit_count` 0, `last_hit_at` empty, `created_at` 2026-11-03 13:10:08.437173+00:
  - `eb1be0d7-4d77-495e-8d79-6778c759b128` `como se calcula el precio final de un pedido` (response md5 `a4f0c711...`)
  - `8c7e01e6-2672-4210-9171-5c0b6e1c8f79` `como se validan los cupones` (`1bceb7dd...`)
  - `47615246-06da-4c96-b7fd-a081de6b4ee3` `que hace orderobserver al crear un pedido` (`fb071839...`)
  The full rows were saved with `pg_dump --column-inserts` in the scratchpad for the restoration.

## Threshold calibration (11.2, design S11)
Scratchpad `tsx` script (not committed) over `createLlm(llmConfigFromEnv(...))` with `LLM_EMBED_MODEL=nomic-embed-text`; cosine similarity of the normalized keys, 768 components each.

| Kind | Pair | Similarity |
|---|---|---|
| rephrasing (CM-HU-19) | `¿Cómo se calcula el precio final de un pedido?` / `Explícame el cálculo del precio final` | 0.8321 |
| different topic (CM-HU-19) | the same price question / `¿Cómo se validan los cupones?` | 0.5506 |
| rephrasing | price question / `¿De qué manera se obtiene el precio final de un pedido?` | 0.8328 |
| rephrasing | `¿Cómo se validan los cupones?` / `¿De qué forma se validan los cupones de descuento?` | 0.9084 |
| rephrasing | price question / `¿Cómo se calcula el precio final del pedido?` | 0.9924 |
| rephrasing | price question / `¿Cómo se calcula el precio total de un pedido?` | 0.9260 |
| rephrasing | price question / `Explícame cómo se calcula el precio final de un pedido` | 0.9708 |
| rephrasing | price question / `¿Cómo calcula el sistema el precio final de un pedido?` | 0.9518 |
| different topic | `¿Qué hace OrderObserver al crear un pedido?` / `¿Cómo se calcula el envío de un pedido?` | 0.6665 |
| different topic | price question / `¿Qué hace OrderObserver al crear un pedido?` | 0.6321 |
| different topic | price question / `¿Cómo se aplica el descuento de un pedido?` | 0.7102 |
| different topic | price question / `¿Cómo se calculan los impuestos de un pedido?` | 0.8465 |
| different topic | price question / `¿Cómo se calcula el envío de un pedido?` | 0.8745 |
| different topic | `¿Cómo se validan los cupones?` / `¿Cómo se aplican los cupones?` | 0.8920 |

Result: the lowest rephrasing (0.8321) is below the highest different topic (0.8920), so no constant of [0.80, 0.95] separates all the pairs. By design S11 the constant stays `0.85`, no delta changes and no re-audit is needed; the limitation is recorded as R3 (D) of the design follow-ups, and R4 (B) sends a future calibration to DIS-69. Constant used in the next steps: `0.85`. Rephrasings of the price question that reach it: `¿Cómo se calcula el precio total de un pedido?` (0.9260, used below) and the three more at 0.9518 to 0.9924; the headline CM-HU-19 rephrasing (0.8321) does not.

## CLI live (11.3)
Variables set only on the commands (`LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5-coder`, `LLM_EMBED_MODEL=nomic-embed-text`).
1. API started (`npm -w packages/api run dev`, port 3000) and `POST /api/projects/<acme>/ask` with `{"question":"¿Cómo se calcula el precio final de un pedido?","useCache":false}`, four times: 200 each (68 s, 7 s, 5 s, 31 s), body `{"answer":"UNKNOWN","reason":"invalid-model-output",...}`. The local chat model does not return the statement shape of the explain prompt (log: `schema_violation` `invalid_shape`), so the answer is not cacheable and nothing was saved: the seeded price entry was not replaced and has no embedding (R5, D). To keep testing the similarity path with real embeddings, a scratchpad script saved the seeded price answer again through the real store (`saveCacheEntry(project, key, response, embedding)`) with the real 768-component embedding of its key: the entry now has `question_embedding` not NULL.
2. `npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"` (similarity 0.9260): answered from the cache (the stored price answer, with its evidence listing); the price entry `hit_count` 1, and a `query_log` row with `cache_hit` true, cost 0 and 0 input tokens; no completion.
3. Different topic `¿Cómo se calcula el envío de un pedido?` (chosen before running; its normalized key is none of the three seeded): it was answered from the price entry (`hit_count` 2): the pair measures 0.8745, above the threshold. This is the limitation of R3, observed live. A second different-topic question, `¿Cómo funciona ShippingService con el transportista?`, was answered live (`cache_hit` false, 2050 input tokens, `UNKNOWN (invalid-model-output)`) and left the price entry at `hit_count` 2. (`¿Cómo se aplica el descuento de un pedido?` answered `UNKNOWN (no-anchor)` and tested nothing.)

## Degradation (11.4)
Fresh anchored questions chosen before running: D1 `¿Cómo se calcula el precio bruto de un pedido?`, D2 `¿Cómo se determina el precio final de un pedido?`, D3 `¿Cómo se obtiene el precio final de un pedido?`.
- D1 with `LLM_EMBED_MODEL=` empty: answered live (`UNKNOWN (invalid-model-output)`, exit 0), only a `schema_violation` line on stderr, no `semantic_cache_skipped` event. (The first attempt ended with `LLM_UNAVAILABLE` `timeout` while Ollama reloaded the chat model; repeated.)
- D2 with `LLM_EMBED_MODEL=qwen2.5-coder`: exit 0, stderr `{"level":"info","type":"semantic_cache_skipped","code":"embedding-unavailable"}`, the answer still arrived and, being cacheable this time, was saved without an embedding (a new entry, deleted in 11.7).
- Evaluation mode (`LLM_BASE_URL=` empty): `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` answered from the cache; `Explícame el cálculo del precio final` answered `UNKNOWN (llm-required)` with `evaluation mode (cache-only)`, no call to Ollama.
- D3 is used in 11.5.

## API live (11.5)
Server with the 11.3 variables, `curl -i`:
- rephrased question `¿Cómo se calcula el precio total de un pedido?`: `HTTP/1.1 200 OK`, the stored price answer (price entry `hit_count` 4 after the CLI runs).
- the same question with `"useCache": false`: 200 on the second try (the others: 503 `LLM_UNAVAILABLE` `timeout` at 120 s while Ollama swapped models, 503 again on a later attempt), body `UNKNOWN invalid-model-output`; no new entry, so the check "a new entry under the rephrased key with a non-NULL embedding" could not be made live (R5, D); the unit test "Turning the cache off embeds only for the save" and the integration test pin it.
- an uncached question `¿Cómo funciona ShippingService con los transportistas?`: 200, `UNKNOWN invalid-model-output` (live).
- a random UUID `6f1d3c2e-8b4a-4c55-9a77-2e0f6b1c9d11`: 404 (`PROJECT_NOT_FOUND`); a too short question: 400 `VALIDATION_ERROR`.
- the request logs of both server runs contain no question text (`grep -ci precio` over each log: 0).
- API restarted with `LLM_EMBED_MODEL=qwen2.5-coder`, D3 with `"useCache": false`: 200 (`UNKNOWN invalid-model-output`), and the log has `{"level":30,...,"type":"semantic_cache_skipped","code":"embedding-unavailable","msg":"explain event"}` (level 30 is `info`).
- Servers stopped with `node scripts/dev-processes.mjs stop`.

## PowerShell check (11.6)
`pwsh` 7.6.9 and `powershell.exe` 5.1.26100.9818, `-NoProfile -Command 'npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"'`, with the three `LLM_*` variables set by Bash on the command (no `$env:` variable; the `.env` of the repository holds the chat model but no `LLM_EMBED_MODEL`, so without it the same command answers live: first attempt in `pwsh` gave `UNKNOWN (invalid-model-output)`, and in `powershell.exe` an `LLM_UNAVAILABLE` `timeout`). With `LLM_EMBED_MODEL=nomic-embed-text` both shells answered from the cache: the price entry went from `hit_count` 4 to 6 and the last two `query_log` rows have `cache_hit` true.

## Restoration (11.7)
- Deleted the 4 acme-shop cache entries present at the end (the price entry with its embedding and `hit_count` 6, `como se determina el precio final de un pedido`, and the two unchanged seeded ones) and re-inserted the three recorded rows with their ids, keys, responses, `hit_count` 0, empty `last_hit_at`, `created_at` and `question_embedding` NULL; deleted 21 `query_log` rows and 5 claims (with their 15 evidence rows) written by the live answers; no project was added (`db:seed` was not needed).
- Compared with the snapshot: ids, response hashes, hit counts and instants equal; 2 projects, 6 cache entries, 0 with embedding, 0 `query_log`, 0 claims, 0 evidence; no `codemind-api` session in `pg_stat_activity`; no dev process left.

## Outcome
- Status: PASS, with the observations R3 (false similarity hits at 0.85 for same-frame questions) and R5 (the local chat model rarely returns a cacheable answer).
- Blocking issues: none
