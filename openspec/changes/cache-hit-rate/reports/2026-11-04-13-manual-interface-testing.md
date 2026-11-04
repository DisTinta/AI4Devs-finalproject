# Manual Interface Testing Report

- Date: 2026-11-04
- Change: cache-hit-rate
- Step: 13. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

Text of the agent (autonomous run, DIS-69). Every command ran from the repository root in Git Bash on
Windows 11, against the scratch database `codemind_dis69` of the local PostgreSQL 16 container
(`DATABASE_URL` on the command line only, never `db:seed` on the shared database). The OS user name is
not shown. Ollama answers at `http://localhost:11434` with `qwen2.5-coder` and `nomic-embed-text`.

## Commands executed

### 13.1 Scratch database

- `CREATE DATABASE codemind_dis69` (psql inside the container), then `npm run db:migrate` (migrations
  0001 to 0005) and `npm run db:seed` with `DATABASE_URL=postgresql://codemind:***@localhost:5432/codemind_dis69`:

```
2 projects loaded
  acme-shop  php/laravel  174 nodes · 170 edges
  task-api  typescript/fastify  102 nodes · 100 edges
```

- `SELECT count(*) FROM cache_entry WHERE question_embedding IS NOT NULL` is `6`, and `cache_entry` holds
  7 rows: the six golden entries with their vectors and the drift entry (`drift:`) without one.

### 13.2 CLI (evaluation mode: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and `LLM_EMBED_MODEL` empty on the command)

1. `npm run cli -- projects`:

```
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z  cache 0/0 sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z  cache 0/0 sample
```

2. Three times `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`: the golden
   answer, instantly, each time. Then `projects`: the acme-shop line ends `cache 3/3 (100%) sample`.
3. `npm run cli -- ask acme-shop "¿Qué hace PriceCalculator con los impuestos?"` (anchors, not cached):
   `UNKNOWN (llm-required)` and its message. Then `projects`: `cache 3/4 (75%) sample`.
4. `npm run cli -- impact acme-shop "cambiar los descuentos de DiscountService"`: the report (`DIRECTO`,
   `DiscountApplied`, …). Then `projects`: still `cache 3/4 (75%) sample`.
5. `SELECT capability, cache_hit, count(*) FROM query_log GROUP BY 1, 2`: `explain|f|1`, `explain|t|3`,
   `impact|f|1`: the field counts the four `explain` rows and not the `impact` row.

### 13.3 Live similarity over the seeded golden entry (AC5, design S12)

- `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5-coder LLM_EMBED_MODEL=nomic-embed-text npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"`:
  the golden answer of `Q1` («El precio final de un pedido se calcula utilizando una serie de servicios…»),
  with no model call to answer.
- SQL: the call's `query_log` row is `explain|t|0|0|0.000000` (cache hit, zero input and output tokens,
  zero cost), and `Q1`'s `cache_entry.hit_count` is `4`: the three exact hits of step 13.2 plus this
  similarity hit (the scenario's `1` is for a fresh seed, "A rephrased golden question is a similarity
  hit after the seed").
- `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5-coder LLM_EMBED_MODEL= npm run cache:embed`:
  `{"error":{"code":"MISSING_CONFIG","message":"LLM_EMBED_MODEL is not set","details":{"variable":"LLM_EMBED_MODEL"}}}`,
  exit `1`; `git hash-object seeds/cache/acme-shop.json seeds/cache/task-api.json` is
  `cfffacaecef3ce3893add1f4b433ce55aeb120e2` and `a445a4dc534c8f54c80caee8090e7d925d326f6d`, the values
  after the live `cache:embed` run of task 9.3: the command wrote nothing.

### 13.4 API (`npm -w packages/api run dev`, scratch `DATABASE_URL`, evaluation mode)

- `GET /health`: `{"status":"ok"}`.
- A first `POST /api/projects/<acme-shop>/ask` typed straight on the Git Bash command line lost its
  non-ASCII characters (`question` stored as `�C�mo…`) and answered `UNKNOWN llm-required`, with a miss
  row logged: an artefact of the shell's encoding, not of the API. The requests below send the body from a
  UTF-8 file (`--data @file`).
- `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` with the price question, twice:
  `200` both times, `usage.cacheHit` `true`, `usage.projectCache` `{"queries":7,"cacheHits":5,"hitRatePct":71.4}`
  and then `{"queries":8,"cacheHits":6,"hitRatePct":75}`. SQL after both calls:
  `SELECT count(*), count(*) FILTER (WHERE cache_hit) FROM query_log WHERE project_id = '<acme-shop>' AND capability = 'explain'`
  is `8|6`: the figures equal the table.
- An `UNKNOWN` question («¿Cómo se gestionan los reembolsos de un pedido?»): `200`,
  `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`: no `usage`.
- A random UUID: `404`, `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`.
- `GET /docs/json` lists `projectCache` under the answered shape's `usage`: an object with `queries` and
  `cacheHits` (integer, minimum 0) and `hitRatePct` (nullable number, minimum 0, maximum 100).
- The request log (`api.log`) holds no question text (0 matches for «precio final» and «reembolsos»).
- Rows and latency of `COUNT_EXPLAIN_QUERIES` (design R6): acme-shop had 10 `query_log` rows (9 `explain`);
  `EXPLAIN (ANALYZE, TIMING OFF)` of the statement: `Bitmap Index Scan on query_log_project_id_idx`,
  `Execution Time: 0.140 ms`, `Planning Time: 0.558 ms`.

### 13.5 PowerShell checks

Versions: PowerShell 7 (`pwsh -NoProfile`) **7.6.9**; Windows PowerShell (`powershell.exe -NoProfile`)
**5.1.26100.9818**. No `$env:` variable is set: the scratch `DATABASE_URL` and the `LLM_*` values go on the
command through `env` (Git for Windows), and the question is built from code points so the shell's code
page cannot alter it.

| Shell | Command | Result |
|---|---|---|
| `pwsh` 7.6.9 | `npm run cli -- projects` | exit `0`; acme-shop `cache 6/9 (66.7%) sample`, task-api `cache 0/0 sample` |
| `pwsh` 7.6.9 | live `npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"` | the golden answer of `Q1` (similarity hit) |
| `powershell.exe` 5.1.26100.9818 | the same live `ask` | the golden answer of `Q1` (similarity hit) |
| `powershell.exe` 5.1.26100.9818 | `npm run cli -- projects` | exit `0`; acme-shop `cache 8/11 (72.7%) sample`: the two shells' `ask` calls were two more hits, 6 + 2 of 9 + 2 |

### 13.6 Restoration

- `node scripts/dev-processes.mjs stop` closed the API (`stopped 1 process trees`); then
  `no dev process of the repository is running`; `curl http://127.0.0.1:3000/health` fails.
- `pg_stat_activity` holds no session with `application_name = 'codemind-api'`.
- The shared database `codemind`: `project` 2, `cache_entry` 7, `cache_entry` with a vector 0,
  `query_log` 0, `max(created_at)` empty: the 0.3 indicators, unchanged.
- **Deviation, decided by the agent:** `DROP DATABASE codemind_dis69` was denied by the kit's
  destructive-command hook (`GUARD_DANGEROUS_CMD` covers `DROP DATABASE`) and, in an autonomous run, no
  one can confirm it. The agent did not work around the hook (no `dropdb`, no other route): the scratch
  databases `codemind_dis69` and `codemind_dis69_test` stay in the local container, local and isolated,
  holding only the synthetic seed. Step 14 re-seeds `codemind_dis69` with `db:seed` (which replaces the
  sample projects and so resets their `query_log` and `hit_count`) instead of re-creating it. Recorded in
  `design.md` → Follow-ups (destination D).

## Outcome

- Status: PASS
- Blocking issues: none. One deviation: the scratch databases are not dropped (see 13.6).
