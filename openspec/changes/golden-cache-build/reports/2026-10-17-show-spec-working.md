# Show Spec Working Report

- Date: 2026-10-17
- Change: golden-cache-build (DIS-26)
- Task: 17.4 — `/show-spec-working`, run unattended (ADR `20261016-autonomous-workflow-run-entrega-2`)
- Environment: Windows 11, Git Bash, local Postgres `pgvector/pgvector:pg16` (`codemind-postgres-1`),
  `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`. Every command ran with
  `DATABASE_URL`, every `LLM_*`, `CACHE_BUILD_TIMEOUT_MS` and `DAILY_BUDGET_USD` unset except the
  ones shown. `http://127.0.0.1:9/v1` is a closed port used as an unreachable model.
- The success path of `npm run cache:build` with a live model is the real run of task 9.3 against
  local Ollama (`qwen2.5-coder`, CPU, 22 min 24 s): it is reused here, not repeated (tasks.md 17.4
  allows it). Its log is in the step 12 report, section "Real run (step 9)".

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| golden-answers › The golden answers are generated with a scripted model (success path, live model) | `npm run cache:build` against Ollama (task 9.3) | exit 0, `Q1/Q3/Q4: answered in <s> s (attempt 1/3)`, `acme-shop: 3 golden answers -> seeds/cache/acme-shop.json`; DB indicators unchanged | yes (live model in place of the scripted one) | step 12 report › Real run |
| golden-answers › An unknown or repeated question id is a usage error | `cache:build Q2` (empty env), `Q3 Q3`, `q3` | exit 1, stdout empty, `USAGE` with `details.allowed` `["Q1","Q3","Q4"]` | yes | E1 |
| golden-answers › Missing or invalid cache build configuration fails before anything else | no `DATABASE_URL`; evaluation mode; `CACHE_BUILD_TIMEOUT_MS` `0`, `3600001`, `12.5`, `abc`; `LLM_BASE_URL=ftp://x` | exit 1, stdout empty, `MISSING_CONFIG` `DATABASE_URL`, `MISSING_CONFIG` `LLM_BASE_URL`, 4 × `INVALID_CONFIG` `CACHE_BUILD_TIMEOUT_MS`, `LLM_CONFIG_INVALID` `LLM_BASE_URL`; golden file unchanged | yes | E1 |
| golden-answers › Unreachable services are reported without their URLs | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`, `LLM_BASE_URL=http://127.0.0.1:1/v1`, `LLM_API_KEY=k3y` | exit 1, `DATABASE_UNAVAILABLE`, `details` `{}`; no `s3cret`, `u:`, `k3y` nor `127.0.0.1:1` in any output | yes | E1 |
| golden-answers › A stale golden file is not partially regenerated (`missing`, `model`) | `cache:build Q3` with the golden file moved aside; with `LLM_MODEL=other-model` | exit 1, `GOLDEN_STALE` with `details.reason` `missing`, then `model`; nothing printed on stdout | yes (the `invalid` and `fingerprint` cases are covered by tests only) | E2, E1 |
| golden-answers › A missing or outdated seed is refused (missing, analyzer fingerprint) | `cache:build` with `seeds/graph-dump.sql` moved aside; with the first hex digit of its `analyzer-fingerprint` changed | exit 1, `INVALID_SEED` `missing` with the `db:seed` message; `GOLDEN_STALE` `seed out of date: run npm run seed:build` `seed` | yes (the `indexed_commit` case is covered by tests only) | E2 |
| golden-answers › Retries and failures (a model that keeps failing as `network`) | `cache:build Q3` with a current golden file and an unreachable model | three lines `Q3: attempt n/3 not cacheable (network)`, then `LLM_UNAVAILABLE` `network` `ECONNREFUSED`; `git diff --exit-code seeds/cache` 0, no `.tmp` file | yes (same rule as the `timeout` scenario, reason `network`) | E1 |
| seed-load › Golden answers are loaded and served in evaluation mode | `npm run db:seed`, then CLI `ask` (Q1 in upper case, Q4) and `POST /api/projects/{id}/ask` (Q3) without `LLM_*` | `db:seed` stdout exactly the two lines; three `cache_entry` rows with `hit_count` 0 and no last hit; CLI exit 0 with the golden answers; API `200`, `usage.cacheHit: true`, `usage.costUsd: 0`, `usage.inputTokens: 0`; hit counts then 1 | yes | E3, E4 |
| seed-load › An invalid golden file fails before connecting (broken JSON, wrong file name) | `db:seed` with `seeds/cache/acme-shop.json` = `{"format": 1,`; with a copy named `other.json` | exit 1, stdout empty, `INVALID_SEED` `cache`, `details.file` `seeds/cache/acme-shop.json` / `seeds/cache/other.json`, message `<file> is not a loadable codemind golden file`; `cache_entry` ids unchanged | yes | E3 |
| Evaluation mode outside the golden questions | API `useCache: false` with Q3; Q6 | `200` `UNKNOWN` `llm-required`; `200` `UNKNOWN` `no-anchor` | yes (behaviour of earlier changes, unaltered) | E4 |

## Evidence

### E1 — `npm run cache:build`, configuration, usage, unreachable services

```text
### USAGE Q2, empty env
$  npm run cache:build Q2
exit=1
stdout:
stderr:
  {"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q3","Q4"]}}}

### USAGE Q3 Q3
$ DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build Q3 Q3
exit=1
stdout:
stderr:
  {"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q3","Q4"]}}}

### USAGE q3
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build q3
exit=1
stdout:
stderr:
  {"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q3","Q4"]}}}

### MISSING_CONFIG DATABASE_URL
$ LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}

### MISSING_CONFIG LLM_BASE_URL (evaluation mode)
$ DATABASE_URL=… LLM_BASE_URL= LLM_API_KEY= npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"MISSING_CONFIG","message":"LLM_BASE_URL is not set","details":{"variable":"LLM_BASE_URL"}}}

### INVALID_CONFIG CACHE_BUILD_TIMEOUT_MS=0 | 3600001 | 12.5 | abc (four runs, identical output)
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder CACHE_BUILD_TIMEOUT_MS=<value> npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"INVALID_CONFIG","message":"CACHE_BUILD_TIMEOUT_MS is invalid; see .env.example","details":{"variable":"CACHE_BUILD_TIMEOUT_MS"}}}

### LLM_CONFIG_INVALID ftp
$ DATABASE_URL=… LLM_BASE_URL=ftp://x LLM_MODEL=qwen2.5-coder npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}

### Unreachable services, credentials
$ DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db LLM_BASE_URL=http://127.0.0.1:1/v1 LLM_API_KEY=k3y LLM_MODEL=qwen2.5-coder npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}

### Partial regeneration, model differs
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=other-model npm run cache:build Q3
exit=1
stdout:
stderr:
  {"error":{"code":"GOLDEN_STALE","message":"golden file cannot be partially regenerated (model): run npm run cache:build","details":{"reason":"model"}}}

### Partial regeneration Q3, unreachable model
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build Q3
exit=1
stdout:
  Q3: attempt 1/3 not cacheable (network)
  Q3: attempt 2/3 not cacheable (network)
  Q3: attempt 3/3 not cacheable (network)
stderr:
  {"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"network","systemCode":"ECONNREFUSED"}}}
```

Afterwards `git diff --exit-code seeds/cache` exited `0` and `seeds/cache/` held only
`acme-shop.json`.

### E2 — stale or missing inputs

```text
### Partial regeneration, no golden file   (seeds/cache/acme-shop.json moved to the scratchpad)
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build Q3
exit=1
stdout:
stderr:
  {"error":{"code":"GOLDEN_STALE","message":"golden file cannot be partially regenerated (missing): run npm run cache:build","details":{"reason":"missing"}}}

### Outdated seed   (header changed from sha256:c133c15b… to sha256:f133c15b…)
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"GOLDEN_STALE","message":"seed out of date: run npm run seed:build","details":{"reason":"seed"}}}

### Missing seed   (seeds/graph-dump.sql moved to the scratchpad)
$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:9/v1 LLM_MODEL=qwen2.5-coder npm run cache:build
exit=1
stdout:
stderr:
  {"error":{"code":"INVALID_SEED","message":"seeds/graph-dump.sql is not a loadable codemind seed (missing)","details":{"reason":"missing"}}}
```

Every file was put back; `git diff --exit-code seeds` exited `0`.

### E3 — `npm run db:seed`

```text
### db:seed with the versioned golden file
$ DATABASE_URL=… npm run db:seed
exit=0
stdout:
  1 project loaded
    acme-shop  php/laravel  174 nodes · 170 edges
stderr:

$ psql: question_normalized | hit_count | last_hit_at  (acme-shop)
como se calcula el precio final de un pedido|0|-
como se validan los cupones|0|-
que hace orderobserver al crear un pedido|0|-

### db:seed with a golden file named other.json   (a copy of acme-shop.json)
exit=1
stdout:
stderr:
  {"error":{"code":"INVALID_SEED","message":"seeds/cache/other.json is not a loadable codemind golden file","details":{"reason":"cache","file":"seeds/cache/other.json"}}}

### db:seed with a broken golden file   (content `{"format": 1,`)
exit=1
stdout:
stderr:
  {"error":{"code":"INVALID_SEED","message":"seeds/cache/acme-shop.json is not a loadable codemind golden file","details":{"reason":"cache","file":"seeds/cache/acme-shop.json"}}}
```

After both failures the `cache_entry` ids were still the ones the successful load created
(`3c8599e6-…`, `8d8384fe-…`, `937482f1-…`, all `hit_count` 0); `other.json` was moved out, the golden
file restored, and `git diff --exit-code seeds/cache` exited `0`.

### E4 — the golden answers served in evaluation mode

CLI, no `LLM_*`:

```text
$ DATABASE_URL=… npm run cli ask acme-shop "COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO"
exit=0
stdout:
  El precio final de un pedido se calcula mediante el método `compute()` en la clase `PriceCalculator`. …
  statements:
  1. [FACT] El método `compute()` en la clase `PriceCalculator` es el encargado de calcular el precio final de un pedido.
     evidence: app/Services/PriceCalculator.php:16-44
  2. [FACT] Primero se aplica el descuento al subtotal.
  3. [INFERENCE] Luego se calcula el impuesto sobre el valor descontado.
  4. [INFERENCE] Finalmente se suman el impuesto y el envío al valor descontado para obtener el precio final.
stderr: (empty)

$ DATABASE_URL=… npm run cli ask acme-shop "¿Qué hace OrderObserver al crear un pedido?"
exit=0
stdout:
  OrderObserver recalculateTotals en el created y updated methods, emitiendo OrderPlaced evento al crear o Actualizar un pedido.
  statements: 3 (two FACT, one INFERENCE), evidence app/Observers/OrderObserver.php:14-28
stderr: (empty)

$ psql: question_normalized | hit_count
como se calcula el precio final de un pedido|1
como se validan los cupones|0
que hace orderobserver al crear un pedido|1
```

API (`npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`, no `LLM_*`;
bodies sent from UTF-8 files with `curl --data-binary`):

```text
POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask {"question":"¿Cómo se validan los cupones?"}
HTTP/1.1 200 OK
{"answer":"Los cupones se validan en el servicio CouponValidator.","statements":[{"text":"El método CouponValidator::isRedeemable($code) verifica …","type":"INFERENCE","verification":"cited","evidenceIds":["ev-1"]}],"evidence":[{"id":"ev-1","file":"app/Services/CouponValidator.php","startLine":14,"endLine":39,…}],…}
usage: {"inputTokens":0,"outputTokens":0,"baselineTokens":4422,"baselineEstimator":"chars-div-4","savingsPct":100,"costUsd":0,"latencyMs":24,"cacheHit":true,…}

POST … {"question":"¿Cómo se validan los cupones?","useCache":false}
HTTP/1.1 200 OK
{"answer":"UNKNOWN","reason":"llm-required","message":"evaluation mode (cache-only): set LLM_* to enable free-form asks","statements":[],"evidence":[]}

POST … {"question":"¿Cómo se gestionan los reembolsos de un pedido?"}
HTTP/1.1 200 OK
{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}
```

No screenshot was taken (the change has no browser UI); none was left at the repository root.

## State

- Before: `project` 1, `claim` 0, `query_log` 0, `cache_entry` 3 (the three golden entries, `hit_count` 0).
- After the demonstration: `query_log` 6 (two CLI asks, four API asks), golden `hit_count`s 1/2/1.
- Restored: yes. The API server stopped (`Stop-Process` on the listener of port 3000; `/health` then
  fails with exit 7); `DELETE FROM query_log` → `DELETE 6` (there were none before); `npm run db:seed`
  again → the same two lines and the three golden entries back to `hit_count` 0 (new ids, as the
  modified "Sample projects are loaded idempotently" states). Final: `project` 1, `claim` 0,
  `query_log` 0, `cache_entry` 3; no `codemind%` session in `pg_stat_activity`; `git status` shows
  only the author's local `.claude/sdd-harness.env`, and `seeds/` is unchanged.

## Not demonstrated

These scenarios need a scripted model, a forced write failure or a temporary repository tree, which
the real interface cannot produce; they are exercised by the tests named after them (step 12 report),
and their real-interface counterpart is the live run of task 9.3:

- golden-answers › "An invalid model output is retried", "A question without a cacheable answer
  fails without writing", "Answers that cannot become golden fail at once", "A model that keeps timing
  out is reported as unavailable" (the `network` variant of the same retry rule is shown in E1),
  "Only the named question is regenerated" (a real partial regeneration costs ~5–9 min of CPU per
  question; not repeated), "A non-sample acme-shop blocks the cache build", "The build's request
  limit applies and the daily ceiling does not", "A slow model answer within the build's limit is
  kept", "A failed write leaves the previous golden file intact", "The canonical render is stable",
  "Golden files with an invalid shape are rejected", "The answer fingerprint covers exactly its
  declared inputs", "The versioned golden file matches the seed, the questions and the code",
  "The golden questions match the demo-question table".
- golden-answers › "A stale golden file is not partially regenerated" for `invalid` and
  `fingerprint`; "A missing or outdated seed is refused" for the changed `indexed_commit`.
- seed-load › "A seed without golden files loads only the graph", "Loading golden answers again does
  not duplicate them" (shown in part: a second `db:seed` left three entries), "A failed golden save
  leaves the database unchanged".

## Handoff

The change is demonstrably working through its real interfaces: `npm run cache:build` validates its
arguments and configuration before anything else, refuses stale or missing inputs, retries and
reports model failures without URLs or credentials and never touches the golden file on failure;
the live run of task 9.3 produced the versioned golden file with Ollama; `npm run db:seed` loads it
with the seed (and rejects broken or misnamed golden files before connecting); and the CLI and the
API answer the three golden questions from the cache in evaluation mode at zero cost. The wording of
the Q4 golden answer is the 7B model's (it says the `updated` method also emits `OrderPlaced`, which
the code does not do); reviewing the golden answers' wording is DIS-34's scope, as the step 12 report
records.
