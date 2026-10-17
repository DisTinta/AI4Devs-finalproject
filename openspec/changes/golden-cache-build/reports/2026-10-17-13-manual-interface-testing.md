# Manual Interface Testing Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26)
- Step: 13 — Manual interface testing (`npm run cache:build`, `npm run db:seed`, CLI `ask`, `POST /ask`)
- Environment: Windows 11, Git Bash, local Postgres `pgvector/pgvector:pg16` from `docker compose`,
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`. Paths are shown relative to the
  repository root; the OS user name is masked as `<user>` where a path would hold it.

## 13.1 Preconditions

- Database up and migrated; `npm run cli -- projects`:

  ```text
  acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z sample
  ```

- Indicators (same as the 0.4 baseline and as after the real run of step 9): `project` 1, `claim` 0,
  `query_log` 11, `cache_entry` 0, `max(query_log.created_at)` `2026-10-17 00:43:58.305748+00`.

## 13.2 `npm run cache:build` error paths

Each run with every `LLM_*`, `DATABASE_URL` and `CACHE_BUILD_TIMEOUT_MS` unset except the ones named.

| Run | Exit | stdout | stderr |
|---|---|---|---|
| no `DATABASE_URL` | 1 | (empty) | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` |
| `DATABASE_URL` only (evaluation mode) | 1 | (empty) | `{"error":{"code":"MISSING_CONFIG","message":"LLM_BASE_URL is not set","details":{"variable":"LLM_BASE_URL"}}}` |
| live config + `CACHE_BUILD_TIMEOUT_MS=abc` | 1 | (empty) | `{"error":{"code":"INVALID_CONFIG","message":"CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example","details":{"variable":"CACHE_BUILD_TIMEOUT_MS"}}}` |
| live config, `-- Q2` | 1 | (empty) | `{"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q3","Q4"]}}}` |
| `LLM_BASE_URL=http://127.0.0.1:9/v1`, `LLM_MODEL=qwen2.5-coder`, `-- Q3`, current golden file | 1 | `Q3: attempt 1/3 not cacheable (network)`<br>`Q3: attempt 2/3 not cacheable (network)`<br>`Q3: attempt 3/3 not cacheable (network)` | `{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"network","systemCode":"ECONNREFUSED"}}}` |

The last run passed every check of the partial regeneration (fingerprints and models of the
versioned file are the current ones), rebuilt the history, reached the model three times and failed
as expected. `git diff --exit-code seeds/cache` exit `0` afterwards, and `seeds/cache/` holds only
`acme-shop.json` (no temporary file). The success path is the real run of step 9 (report of step 12,
section "Real run").

## 13.3 `npm run db:seed`

```text
$ npm run --silent db:seed
1 project loaded
  acme-shop  php/laravel  174 nodes · 170 edges
```

Exit `0`, stderr empty, stdout exactly these two lines (no golden count, D13). acme-shop's
`cache_entry` rows:

```text
             question_normalized              | hit_count | last_hit_at
----------------------------------------------+-----------+-------------
 como se calcula el precio final de un pedido |         0 |
 como se validan los cupones                  |         0 |
 que hace orderobserver al crear un pedido    |         0 |
```

## 13.4 CLI `ask` in evaluation mode

No `LLM_*` set. Each run exits `0`, stderr empty (a cache hit has no events), and stdout prints the
golden answer:

- `npm run cli -- ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"` → the Q1 answer
  (`El precio final de un pedido se calcula mediante el método compute() …`), four statements (two
  `FACT`, two `INFERENCE`), all citing `app/Services/PriceCalculator.php:16-44`.
- `npm run cli -- ask acme-shop "¿Cómo se validan los cupones?"` → the Q3 answer (`Los cupones se
  validan en el servicio CouponValidator.`), one `INFERENCE` citing
  `app/Services/CouponValidator.php:14-39`.
- `npm run cli -- ask acme-shop "¿Qué hace OrderObserver al crear un pedido?"` → the Q4 answer, three
  statements (two `FACT`, one `INFERENCE`) citing `app/Observers/OrderObserver.php:14-28`.

Afterwards each of the three entries has `hit_count` 1.

## 13.5 API in evaluation mode

`npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts` with `DATABASE_URL`
exported and no `LLM_*` (the same as `npm -w packages/api run dev` without `watch`). Bodies sent from
UTF-8 files with `curl --data-binary` (Git Bash does not send UTF-8 arguments reliably, as found in
DIS-21).

| Request body to `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` | Status | Body (summary) |
|---|---|---|
| `{"question":"COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"}` | `200` | the Q1 golden answer, 4 statements, 4 evidence entries, `usage.cacheHit: true`, `usage.costUsd: 0`, `usage.inputTokens: 0` |
| same with `"useCache": false` | `200` | `answer: "UNKNOWN"`, `reason: "llm-required"` |
| `{"question":"¿Cómo se gestionan los reembolsos de un pedido?"}` (Q6) | `200` | `answer: "UNKNOWN"`, `reason: "no-anchor"` |

The server was stopped afterwards (`Stop-Process` on the process listening on port 3000; `SIGINT`
cannot be sent from the shell on Windows, as in DIS-78); `curl http://127.0.0.1:3000/health` then fails.

## 13.6 A broken golden file

`seeds/cache/acme-shop.json` copied to the scratchpad, then overwritten with `{"format": 1,`:

```text
$ npm run --silent db:seed
exit=1
stdout: (empty)
stderr: {"error":{"code":"INVALID_SEED","message":"seeds/cache/acme-shop.json is not a loadable codemind golden file","details":{"reason":"cache","file":"seeds/cache/acme-shop.json"}}}
```

The database was unchanged: the counts and every `cache_entry` id with its hit count were identical
before and after (`1,0,6,3` and the same three ids). The file was restored from the copy and
`git diff --exit-code seeds/cache` exited `0`.

## 13.7 Restoration

- `DELETE FROM query_log WHERE created_at > '2026-10-17 00:43:58.305748+00'` → `DELETE 6` (the three
  CLI asks and the three API asks).
- `npm run db:seed` again → the same two lines; the three golden entries are back to `hit_count` 0.
- Final indicators: `project` 1, `claim` 0, `query_log` 0, `cache_entry` 3; no session with an
  `application_name` starting with `codemind` in `pg_stat_activity`; the API server stopped.
- Intended differences against 13.1: `cache_entry` 0 → 3 (the golden answers this change loads);
  `query_log` 11 → 0, because the first `db:seed` of 13.3 deleted by cascade the 11 rows of the
  sample project acme-shop, which is the documented behaviour of `db:seed` since DIS-92 (design D2
  there) and not something this change introduced. No other row changed.
