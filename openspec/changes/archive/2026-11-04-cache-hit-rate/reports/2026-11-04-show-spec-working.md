# Show spec working — cache-hit-rate (DIS-69)

- Date: 2026-11-04
- Change: `cache-hit-rate`, PR #108 (`feature/dis-69-cache-hit-rate` → `final-project-CRN`, head `6ec37eb`)
- Step: 16.3, pre-merge review of the autonomous run (`docs/AUTONOMOUS-RUN.md` §6)

*Agent's text (autonomous run, without the author).* Every interaction below ran in this step, from Git
Bash on Windows 11, against the scratch database `codemind_dis69` of the local PostgreSQL 16 container
(`DATABASE_URL=postgresql://codemind:***@localhost:5432/codemind_dis69` on each command; the shared
database `codemind` was only read). Ollama answered at `http://localhost:11434` with `qwen2.5-coder` and
`nomic-embed-text`. The browser scenarios reuse the step 14 evidence (task 16.3 allows it): no Playwright
MCP is available in this step.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| `cli-projects` "Sample and user projects are listed" (the `cache` field) | `npm run cli -- projects` after a fresh `db:seed` | both samples end `cache 0/0 sample` | yes | E1 |
| `semantic-cache` "Project cache hit rate" + `cli-projects` (counts only `explain`) | 2 cached `ask`, 1 uncached `ask` (`UNKNOWN llm-required`), 1 `impact`, then `projects` | acme-shop `cache 2/3 (66.7%) sample`; SQL `explain|f|1`, `explain|t|2`, `impact|f|1` | yes | E2 |
| `seed-load` "A rephrased golden question is a similarity hit after the seed" (live) | live `ask acme-shop "¿Cómo se calcula el precio total de un pedido?"` | golden answer of `Q1`; last `query_log` row `explain|t|0|0`; `Q1` `hit_count` 3 (2 exact + 1 similarity) | yes | E3 |
| `http-ask` "Ask answered response" (`usage.projectCache`, read after the call) | `POST /api/projects/<acme-shop>/ask` with the price question, twice | `200`, `cacheHit` `true`, `projectCache` `{queries:5,cacheHits:4,hitRatePct:80}` then `{queries:6,cacheHits:5,hitRatePct:83.3}` | yes | E4 |
| `http-ask` — `UNKNOWN` carries no usage | `POST …/ask` with «¿Cómo se gestionan los reembolsos de un pedido?» | `200` `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}` | yes | E5 |
| `http-ask` — unknown project | `POST /api/projects/00000000-0000-4000-8000-000000000000/ask` | `404` `PROJECT_NOT_FOUND` | yes | E6 |
| `http-ask` "Ask in the OpenAPI document" | `GET /docs/json`, answered shape's `usage.projectCache` | strict object, `required` the three keys, integers `minimum` 0, `hitRatePct` nullable number 0–100 | yes | E7 |
| `http-ask` — counts equal the table, no question text logged | SQL count of acme-shop `explain` rows; grep of the API log | `7|5` (the `UNKNOWN` call added a miss row after the second `200`); 0 matches of «precio final» / «reembolsos» | yes | E8 |
| `golden-answers` "Embedding arguments and configuration are checked before any file" | `npm run cache:embed -- --project nope`; `cache:embed` without `LLM_EMBED_MODEL` | `USAGE` `unknown golden project` with `allowed`; `MISSING_CONFIG` `LLM_EMBED_MODEL`; exit `1`; `git status` unchanged | yes | E9 |
| `ask-page` "Usage panel", "A project without logged queries shows no hit rate", wireframe | step 14 browser run (reused) | «Caché del proyecto: 100 % de aciertos (1 de 1 consulta)» → «(2 de 2 consultas)» → «75 % … (3 de 4 consultas)»; screenshots at desktop and 320 px | yes | E10 |

## Evidence

E1 — `npm run --silent cli -- projects` (exit `0`):

```
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z  cache 0/0 sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z  cache 0/0 sample
```

E2 — evaluation mode (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_EMBED_MODEL` empty on the command):
two `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` printed the golden answer («El
precio final de un pedido se calcula utilizando una serie de servicios…»), exit `0`;
`ask acme-shop "¿Qué hace PriceCalculator con los impuestos?"` printed `UNKNOWN (llm-required)`;
`impact acme-shop "cambiar los descuentos de DiscountService"` printed its `DIRECTO` report. Then:

```
acme-shop  a794456d-6d1b-5b55-a360-13fec83dc7bc  php/laravel  174 nodes · 170 edges  2024-05-06T09:31:00.000Z  cache 2/3 (66.7%) sample
task-api  fba8e26b-1fb4-5b74-8352-d5d71ded7fe8  typescript/fastify  102 nodes · 100 edges  2024-09-02T13:07:00.000Z  cache 0/0 sample
```

`SELECT capability, cache_hit, count(*) FROM query_log GROUP BY 1,2`: `explain|f|1`, `explain|t|2`,
`impact|f|1`.

E3 — `LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=qwen2.5-coder LLM_EMBED_MODEL=nomic-embed-text npm run cli -- ask acme-shop "¿Cómo se calcula el precio total de un pedido?"`:
the golden answer of `Q1`. Last `query_log` row: `explain|t|0|0` (capability, cache hit, input and output
tokens). `cache_entry` of acme-shop with `hit_count > 0`: `como se calcula el precio final de un pedido|3`.

E4 — API started with `npm -w packages/api run dev` (scratch `DATABASE_URL`, evaluation mode), `GET /health`
`{"status":"ok"}`. Body sent from a UTF-8 file. First answer's `usage`:

```
{"inputTokens":0,"outputTokens":0,"baselineTokens":7123,"baselineEstimator":"chars-div-4","savingsPct":100,"costUsd":0,"latencyMs":59,"cacheHit":true,"generation":{"inputTokens":0,"outputTokens":0,"costUsd":0},"verification":{"calls":0,"cacheHits":0,"inputTokens":0,"outputTokens":0,"costUsd":0,"latencyMs":0},"projectCache":{"queries":5,"cacheHits":4,"hitRatePct":80}}
```

Second answer: `"projectCache":{"queries":6,"cacheHits":5,"hitRatePct":83.3}`. The counts include the
current call's row (4 earlier rows of E2–E3 plus this call).

E5 — `{"answer":"UNKNOWN","reason":"no-anchor","statements":[],"evidence":[]}`, `HTTP 200`.

E6 — `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}`, `HTTP 404`.

E7 — `usage.properties.projectCache` of the answered shape:

```
{"type":"object","properties":{"queries":{"type":"integer","minimum":0,"maximum":9007199254740991},"cacheHits":{"type":"integer","minimum":0,"maximum":9007199254740991},"hitRatePct":{"nullable":true,"type":"number","minimum":0,"maximum":100}},"required":["queries","cacheHits","hitRatePct"],"additionalProperties":false}
```

E8 — `SELECT count(*), count(*) FILTER (WHERE cache_hit) FROM query_log WHERE project_id = '<acme-shop>' AND capability = 'explain'`:
`7|5`. `grep -c -E "precio final|reembolsos"` on the API log: `0`.

E9:

```
{"error":{"code":"USAGE","message":"unknown golden project","details":{"allowed":["acme-shop","task-api"]}}}
exit=1
{"error":{"code":"MISSING_CONFIG","message":"LLM_EMBED_MODEL is not set","details":{"variable":"LLM_EMBED_MODEL"}}}
exit=1
```

E10 — step 14 report `./2026-11-04-14-end-to-end-testing.md` and its screenshots:
`./2026-11-04-usage-strip-desktop.png`, `./2026-11-04-usage-strip-320.png`,
`./2026-11-04-unknown-state-desktop.png`, `./2026-11-04-unknown-state-320.png`,
`./2026-11-04-alert-api-stopped-desktop.png`, `./2026-11-04-alert-api-stopped-320.png`,
`./2026-11-04-configuration-notice-desktop.png`.

Test runs of this step: `DATABASE_URL=…/codemind_dis69_test npx vitest run tests/unit/cache tests/unit/store tests/unit/api tests/unit/cli tests/unit/seed tests/unit/explain tests/integration/store tests/integration/api tests/integration/cli`
→ 98 files, 1110 tests passed; `npx vitest run --project dom` → 9 files, 79 tests passed.

## State

- Before: shared database `codemind`: `project` 2, `cache_entry` 7, with a vector 0, `query_log` 0,
  `max(created_at)` empty. Scratch `codemind_dis69` after `db:seed`: `project` 2, `cache_entry` 7, with a
  vector 6, `query_log` 0.
- After: shared database unchanged (2, 7, 0, 0, empty). Scratch database re-seeded with `db:seed`
  (it replaces the sample projects): 2, 7, 6, `query_log` 0, `sum(hit_count)` 0.
- Restored: yes. `node scripts/dev-processes.mjs stop` stopped the API (`stopped 1 process trees`);
  `curl /health` fails afterwards. `git status` shows only the local `.claude/sdd-harness.env` change.
  The scratch databases stay in the local container (step 13.6 deviation, destination D: dropping a
  database is denied by the kit's destructive-command hook).

## Not demonstrated

- The browser workflow was not re-driven in this step (no Playwright MCP here); the step 14 run of the
  same build (head `31d3112`, code unchanged since) is the evidence, with its screenshots.
- `cache:embed` success path was not re-run live: it rewrites the versioned golden files; task 9.3
  recorded its live run and the coherence tests check the versioned vectors.

## Handoff

The change is demonstrably working: the CLI field, the API field, the `UNKNOWN` and `404` paths, the
OpenAPI document and the live similarity hit over a seeded golden entry all match their scenarios, and
the shown counts equal `query_log`. No screenshot was written at the repository root.
