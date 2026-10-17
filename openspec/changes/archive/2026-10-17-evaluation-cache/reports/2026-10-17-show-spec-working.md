# Show Spec Working — evaluation-cache (DIS-21)

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Task: 16.4 (`/show-spec-working`)
- Run by the agent inside the autonomous workflow of Entrega 2, against the local compose database
  (`postgres://codemind:codemind@localhost:5432/codemind`), Windows with Git Bash. The scratchpad
  directory is written `<scratchpad>`. Request bodies with accents were sent from UTF-8 files with
  `curl --data-binary` (the step 12 report explains why a `-d '<literal>'` from Git Bash is not UTF-8).

This run repeats the step 12 interactions on the current head (`5c6a60b`) rather than reusing their
output, and adds the refund demo question (http-ask, D14) and a second `invalidateCache` call.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| answer-cache — Case, accent and punctuation variants share one key | entry saved under `normalizeQuestion('¿Cómo se calcula el precio final de un pedido?')`; asked as `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO` (CLI and API) and as the accented original (API) | key `como se calcula el precio final de un pedido`; all three hit | yes | E1, E2, E3 |
| graph-store — A saved entry is found by its project and key | `saveCacheEntry` then `findCacheEntry` through `createPostgresStore({ pool })` | entry id returned | yes | E1 |
| graph-store — Touching an entry records the hit | four hits (one CLI, three API) | `hit_count` 1 after the CLI hit, 4 after the last API hit; `last_hit_at` set | yes | E2, E6 |
| graph-store — Invalidating a project deletes only its entries | `invalidateCache(acme)` twice | `{"deleted":1}`, then `{"deleted":0}`; `cache_entry` count 0 | yes | E6 |
| cli-ask — Evaluation mode prints a cached answer | `npm run cli -- ask acme-shop "COMO SE CALCULA …"` with no `LLM_*` | exit 0, the stored answer with `1. [FACT] …` and `evidence: app/Services/PriceCalculator.php:16-44`, no `note:` line | yes (entry seeded through the store, see Not demonstrated) | E2 |
| explain — Evaluation mode without an entry answers llm-required and saves nothing | CLI `¿Qué hace CouponValidator?`; API uncached question; API cached question after invalidation | `UNKNOWN (llm-required)` and the message; `cache_entry` count unchanged | yes | E2, E3, E6 |
| explain — A cached question is answered from the cache in both modes | API in evaluation mode (E3) and API live with an unreachable model (E5) | 200 with the stored answer, `usage.cacheHit` true, `costUsd` 0, tokens 0; the live server answered without reaching the model (an unreachable model would have failed) | yes | E3, E5 |
| explain / http-ask — `useCache: false` skips the lookup | same cached body with `"useCache": false` in evaluation mode | 200 exact `llm-required` body | yes | E3 |
| explain — A question without anchor is not looked up in the cache / http-ask — The refund demo question answers no-anchor without the model over the seed | `¿Cómo se gestionan los reembolsos de un pedido?` in evaluation mode and live | both 200 exactly `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`; `cache_entry` holds only the seeded price entry | yes | E4, E5 |
| http-ask — A cached question answers from the cache over the seed | `POST …/ask` `COMO SE CALCULA …` | 200, keys `answer`, `statements`, `evidence`, `confidence`, `usage`; `usage.cacheHit` true; `query_log` rows of hits have `cache_hit` true | yes | E3, E4 |
| http-ask — A spent daily budget still answers a cached question | `query_log` row with `cost_usd` 1, `DAILY_BUDGET_USD=0.000001`, live model unreachable | cached question 200 from the cache; `"useCache": false` → 429 `BUDGET_EXHAUSTED` with `cacheOnly: true` | yes | E5 |
| http-ask — An invalid token budget, cache flag or extra key answers VALIDATION_ERROR | `"useCache":"yes"`; extra key `cache` | 400 `VALIDATION_ERROR` with the `useCache` `invalid_type` issue; 400 with `unrecognized_keys` | yes | E3 |
| http-ask — unknown project | random UUID | 404 `PROJECT_NOT_FOUND` | yes | E3 |
| http-ask — OpenAPI | `GET /docs/json` | `useCache` documented with the new description, default `true` | yes | E3 |

## Evidence

### E0 — Baseline

```
project|1
claim|0
query_log|0
cache_entry|0
max(query_log.created_at) = NULL
acme-shop = a794456d-6d1b-5b55-a360-13fec83dc7bc
```

No `LLM_*` variable in the environment (`env | grep -c '^LLM_'` → `0`).

### E1 — Seed one entry through the store

`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/cache-manual.mts seed a794456d-…`
(the step 12 script: `saveCacheEntry(acmeId, normalizeQuestion('¿Cómo se calcula el precio final de un
pedido?'), cachedAnswer())` and `findCacheEntry` on the same key):

```
{"key":"como se calcula el precio final de un pedido","entryId":"c5559905-923e-45e3-a84a-b87f1c212815"}
```

### E2 — CLI in evaluation mode

`npm run --silent cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` → `exit=0`

```
The final price is computed by PriceCalculator::compute.

statements:
1. [FACT] PriceCalculator::compute applies the discount before the tax.
   evidence: app/Services/PriceCalculator.php:16-44

evidence:
app/Services/PriceCalculator.php:16-44
    class PriceCalculator
    {
        public function compute(Order $order): Money
```

`npm run --silent cli -- ask acme-shop "¿Qué hace CouponValidator?"` → `exit=0`

```
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
```

Database after both: `SELECT hit_count, last_hit_at IS NOT NULL FROM cache_entry` → `1|t`;
`query_log` rows `cache_hit|cost_usd|input_tokens|output_tokens` → `t|0.000000|0|0` and
`f|0.000000|0|0`.

### E3 — API in evaluation mode

Server started with `DATABASE_URL` only (`<scratchpad>/serve.sh`) → `{"status":"ok"}`.
`U=http://127.0.0.1:3000/api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`.

`{"question":"¿Cómo se calcula el precio final de un pedido?"}` → `status=200`

```
{"answer":"The final price is computed by PriceCalculator::compute.","statements":[{"text":"PriceCalculator::compute applies the discount before the tax.","type":"FACT","verification":"entailed","evidenceIds":["ev-1"]}],"evidence":[{"id":"ev-1","file":"app/Services/PriceCalculator.php","startLine":16,"endLine":44,"excerpt":"class PriceCalculator\n{\n    public function compute(Order $order): Money\n"}],"confidence":0.72,"usage":{"inputTokens":0,"outputTokens":0,"baselineTokens":40000,"baselineEstimator":"chars-div-4","savingsPct":100,"costUsd":0,"latencyMs":51,"cacheHit":true,"generation":{"inputTokens":0,"outputTokens":0,"costUsd":0},"verification":{"calls":0,"cacheHits":0,"inputTokens":0,"outputTokens":0,"costUsd":0,"latencyMs":0}}}
```

`{"question":"¿Cómo se calcula el precio final de un pedido?","useCache":false}` → `status=200`

```
{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}
```

`{"question":"¿Qué hace CouponValidator?"}` → `status=200`, the same exact `llm-required` body.

`{"question":"x","useCache":"yes"}` → `status=400`

```
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"too_small","message":"Too small: expected string to have >=5 characters"},{"path":["useCache"],"code":"invalid_type","message":"Invalid input: expected boolean, received string"}]}}}
```

`{"question":"x","cache":true}` → `status=400`

```
{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["question"],"code":"too_small","message":"Too small: expected string to have >=5 characters"},{"path":[],"code":"unrecognized_keys","message":"Unrecognized key: \"cache\""}]}}}
```

`POST /api/projects/7c1d0f52-3a4b-4c5d-9e6f-0a1b2c3d4e5f/ask` → `status=404`
`{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`

`GET /docs/json` →
`"useCache":{"default":true,"description":"Whether to answer from the answer cache of the project when it holds the question (exact match of its normalized form). false skips the lookup and asks the model; the new answer still replaces the cached one.","type":"boolean"}`

### E4 — Refund demo question and upper-case variant (evaluation mode)

`{"question":"¿Cómo se gestionan los reembolsos de un pedido?"}` (UTF-8 checked with `od -c`: `302 277`
for `¿`, `303 263` for `ó`) → `status=200`

```
{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}
```

`{"question":"COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"}` → `status=200`, the stored answer with
`"cacheHit":true` and `"verification":{"calls":0,…}`.

Server stopped (`<scratchpad>/stop.sh`, `taskkill /F`) → `server down`. Database: `hit_count` 3,
`cache_entry` count 1, `query_log` 8 rows of which 3 with `cache_hit` true.

### E5 — Live model unreachable, daily budget spent

```
INSERT INTO query_log (project_id, question, capability, cost_usd)
VALUES ('a794456d-…', 'ssw budget row', 'explain', 1) RETURNING id;
→ 559100a0-2db0-4449-9c2b-6d06f11fa0b8
```

Server restarted with `LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_MODEL=qwen2.5-coder
DAILY_BUDGET_USD=0.000001` → `{"status":"ok"}`.

- Cached question → `status=200`, the stored answer (`…"verification":{"calls":0,"cacheHits":0,…}}}`).
- Same body with `"useCache": false` → `status=429`
  `{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":1,"dailyBudgetUsd":0.000001,"resetsAt":"2026-10-18T00:00:00.000Z","cacheOnly":true}}}`
- Refund demo question live → `status=200` `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`

Server stopped; `DELETE FROM query_log WHERE question = 'ssw budget row'` → `DELETE 1`, recount `0`.
`hit_count` 4; `query_log` `cache_hit` false 6, true 4.

### E6 — Invalidation

`<scratchpad>/cache-manual.mts invalidate a794456d-…` → `{"deleted":1}`; again → `{"deleted":0}`;
`SELECT count(*) FROM cache_entry` → `0`.
`npm run --silent cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` → `exit=0`,
`UNKNOWN (llm-required)` and the message.

## State

- Before: `project` 1, `claim` 0, `query_log` 0, `cache_entry` 0, `max(query_log.created_at)` `NULL`.
- After: `project` 1, `claim` 0 (no command of this run writes a claim: evaluation mode and cache hits
  store nothing, and the live server never reached a model), `cache_entry` 0 (E6), the budget row
  deleted (E5), both API servers stopped.
- Restored: **partially**. The `query_log` rows written by the asks of this run (11 by the counts
  observed: 7 with `cache_hit` false, 4 with `cache_hit` true, all of acme-shop, all created after the
  `NULL` baseline) were not deleted: the agent's delete of those rows, and a read to confirm them, were
  refused by the session's permission classifier. They are local development rows with zero cost
  (`cost_usd` 0), so they do not move the daily spend; the author removes them when reviewing this run.

## Not demonstrated

- **A live model writing the entry** (explain "A live answer is saved once and a repeat is served from
  the cache", "Turning the cache off calls the model and replaces the entry", cli-ask's "first `ask`
  with a live model"): no live model is reachable in this environment (the local Ollama is unstable
  and `llama3.2` gives `invalid-model-output`). The entry was seeded through the store with the
  fixture of task 2.1 instead. The live save path is covered by `tests/unit/explain/explain-cache.spec.ts`
  and `tests/integration/api/ask.spec.ts` with scripted models.
- **Failure paths** (failed cache writes, rollback failures, concurrent saves, invalid stored entries,
  pool connection errors): not reachable through the interface without fault injection; covered by
  `tests/integration/store/cache-entry.spec.ts`, `tests/unit/store/postgres-cache-write-errors.spec.ts`
  and `tests/unit/explain/explain-cache.spec.ts`.
- **The cache is scoped by project**: the local database holds one project only.

## Handoff

The change is **demonstrably working** through its real interfaces (CLI and HTTP API over the local
Postgres): normalized keys hit, hits are recorded, evaluation mode serves cached answers and answers
`llm-required` otherwise, a spent budget still serves cached questions, `useCache` is validated and
documented, and invalidation removes the project's entries. The live-model save path is demonstrated
only by the test suite. No screenshot was taken and nothing was written at the repository root.
