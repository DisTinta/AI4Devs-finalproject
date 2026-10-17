# Manual Interface Testing Report

- Date: 2026-10-17
- Change: evaluation-cache (DIS-21)
- Step: 12 — Backend: manual interface testing (tasks 12.1–12.8)

Run by the agent inside the autonomous workflow of Entrega 2, against the local compose database
(`postgres://codemind:codemind@localhost:5432/codemind`), on Windows with Git Bash. The OS user name
in paths is masked as `<user>`; the scratchpad directory is written `<scratchpad>`.

## 12.1 Preconditions

- `npm run db:migrate` → `No migrations to run!`
- Indicators: `project` 1, `claim` 0, `query_log` 0, `cache_entry` 0, `max(query_log.created_at)`
  `NULL`. acme-shop was already stored, so `npm run db:seed` was not run.
- `npm run cli -- projects` →
  `acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample`

## 12.2 Seed one cache entry through the store

A short script in the scratchpad (not committed), `<scratchpad>/cache-manual.mts`, run with
`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/cache-manual.mts seed <acme id>`,
calls `saveCacheEntry(acmeId, normalizeQuestion('¿Cómo se calcula el precio final de un pedido?'),
cachedAnswer())` on `createPostgresStore({ pool })` and reads the entry back:

```
{"key":"como se calcula el precio final de un pedido","entryId":"eae21711-0966-4278-a078-85fd689f45d2"}
```

## 12.3 CLI in evaluation mode (no `LLM_*` in the environment)

`npm run --silent cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` → exit `0`:

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

`npm run --silent cli -- ask acme-shop "¿Qué hace CouponValidator?"` → exit `0`:

```
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
```

`SELECT hit_count, last_hit_at FROM cache_entry` → `1|2026-10-17 00:09:46.398+00`.

## 12.4 API in evaluation mode

Server: `DATABASE_URL=… npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`
(listening on `127.0.0.1:3000`, no `LLM_*`). Requests to
`POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`:

| Body | Status | Body (summary) |
|---|---|---|
| `{"question":"¿Cómo se calcula el precio final de un pedido?"}` (UTF-8 file, `--data-binary`) | `200` | the stored answer; `usage` `{inputTokens:0, outputTokens:0, baselineTokens:40000, baselineEstimator:"chars-div-4", savingsPct:100, costUsd:0, latencyMs:56, cacheHit:true, generation:{0,0,0}, verification:{0,0,0,0,0,0}}` |
| same with `"useCache":false` | `200` | exactly `{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}` |
| `{"question":"¿Qué hace CouponValidator?"}` | `200` | the same exact `llm-required` body |
| `{"question":"…","useCache":"yes"}` | `400` | `{"error":{"code":"VALIDATION_ERROR","message":"invalid request","details":{"issues":[{"path":["useCache"],"code":"invalid_type","message":"Invalid input: expected boolean, received string"}]}}}` |
| `{"question":"COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"}` | `200` | the stored answer, `usage.cacheHit: true` |

`POST /api/projects/7c1d0f52-3a4b-4c5d-9e6f-0a1b2c3d4e5f/ask` (random UUID) → `404`
`{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`.

`GET /docs/json` → `useCache`: `{"default":true,"description":"Whether to answer from the answer cache
of the project when it holds the question (exact match of its normalized form). false skips the
lookup and asks the model; the new answer still replaces the cached one.","type":"boolean"}`.

Note: the first three accented requests were sent with `curl -d '<literal>'` from Git Bash, which
sent the accented characters in a non-UTF-8 encoding (the `query_log` rows show U+FFFD), so their
key differed and they answered `llm-required`. They were sent again from UTF-8 files with
`--data-binary`, with the results above. A client encoding artefact of the shell, not of the API.

After these requests the entry's `hit_count` was 3 (one CLI hit and two API hits).

## 12.5 Daily budget spent

- `INSERT INTO query_log (project_id, question, capability, cost_usd) VALUES ('a794456d-…', 'manual budget row', 'explain', 1)`
  → id `eefb7ae7-6220-452c-a145-b86ef08fb850`.
- Server restarted live and unreachable: `LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_MODEL=qwen2.5-coder DAILY_BUDGET_USD=0.000001`.
- Cached question (UTF-8 file) → `200`, the stored answer with `usage.cacheHit: true`.
- Same body with `"useCache": false` → `429`
  `{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":1,"dailyBudgetUsd":0.000001,"resetsAt":"2026-10-18T00:00:00.000Z","cacheOnly":true}}}`.
- Server stopped (`taskkill /F`, Windows: no `SIGINT` from the agent's shell); the row deleted at once:
  `DELETE 1`, then `SELECT count(*) FROM query_log WHERE question = 'manual budget row'` → `0`.

## 12.6 Invalidation

- `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/cache-manual.mts invalidate <acme id>` → `{"deleted":1}`.
- `SELECT count(*) FROM cache_entry WHERE project_id = '<acme id>'` → `0`.
- `npm run --silent cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` → exit `0`,
  `UNKNOWN (llm-required)` and the message.

## 12.7 Restoration

- `DELETE FROM query_log` → `DELETE 11` (12.1 had no row: `max(created_at)` was `NULL`, so every row
  was created by this step).
- Indicators after: `project` 1, `claim` 0, `query_log` 0, `cache_entry` 0, `max(created_at)` `NULL`
  — equal to 12.1.
- `SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'codemind%'` → `0`.
- `db:seed` was not run in 12.1, so no project to delete.

## Outcome

- Status: PASS
- Blocking issues: none
