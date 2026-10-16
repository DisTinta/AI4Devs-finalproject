# Show spec working — query-usage-log (DIS-74)

- Date: 2026-10-16
- Code: branch `feature/DIS-74-query-usage-log`, HEAD `7ee73c3` (PR #44, CI green). Production code is
  identical to the commit the step 13 live run used (`99f62ae..7ee73c3` only renames a test constant and
  adds a `.gitleaksignore` entry).
- System: local compose Postgres (`postgres://codemind:codemind@localhost:5432/codemind`) with acme-shop
  indexed; the real CLI (`npm run -s cli -- ask …`). Live model evidence reused from step 13
  ([`2026-10-16-13-manual-interface-testing.md`](./2026-10-16-13-manual-interface-testing.md)), as task
  17.3 allows: local Ollama `qwen2.5-coder`, CPU only.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| `graph-schema` → Migrated schema matches the history, claim, usage and cache column contract (the five `verify_*` columns) | `information_schema.columns` on the migrated database | `verify_input_tokens`, `verify_output_tokens`, `verify_calls`, `verify_latency_ms` integer NULL; `verify_cost_usd` numeric(10,6) NULL | Yes | below (A0) |
| `explain` → An answer leaves one query log row the daily spend sees (a real answered `explain` over acme-shop) | live `explain` with the `ask` composition, `qwen2.5-coder` (step 13) | one row: 8 739 / 224 tokens, `baseline_tokens` 7 123, `cost_usd` 0.000000, `latency_ms` 211 783, `cache_hit` false, `verify_input_tokens` 1 818, `verify_output_tokens` 32, `verify_cost_usd` 0.000000, `verify_calls` 4, `verify_latency_ms` 68 077; equal to `answer.usage` field by field | Yes (shipped cost table, so every cost is 0) | step 13 report |
| `explain` → An unknown answer without a model call leaves a zero row; Evaluation mode records no verification | `ask` without `LLM_*` | exit 0, `UNKNOWN (llm-required)`; one row with every counter and cost 0, `baseline_tokens` NULL, `verify_calls` 0, `verify_latency_ms` 0, `latency_ms` 48 (≥ 1) | Yes | below (A) |
| `llm-adapter` → Daily spend ceiling (reads `query_log.cost_usd`, now written) and `explain` → No row when explain fails before a model call resolves (`BudgetExhausted` of the `answer` call) | row of today at 0.02 USD, `ask` with `DAILY_BUDGET_USD=0.01` | exit 1, `BUDGET_EXHAUSTED`, `spentUsd` 0.02; no new row | Yes | below (B) |
| `explain` → No row when explain fails before a model call resolves (unknown project) | `ask no-such-project` | exit 1, `PROJECT_NOT_FOUND`; no new row | Yes | below (C) |
| `explain` → No row when explain fails before a model call resolves (invalid request) | `ask acme-shop "   "` | exit 2, `INVALID_EXPLAIN_REQUEST` naming `question`, no value; no new row | Yes | below (D) |
| `explain` → No row … (`LlmUnavailable` of the `answer` call) | `ask` live on CPU, `LLM_TIMEOUT_MS=300000` (step 13) | exit 1, `LLM_UNAVAILABLE` `timeout` after 307 s; no row | Yes | step 13 report |

## Evidence

### A0 — schema

```
$ psql -tAc "select column_name, data_type, numeric_precision, numeric_scale, is_nullable from information_schema.columns where table_name='query_log' and column_name like 'verify_%' order by ordinal_position"
verify_input_tokens|integer|32|0|YES
verify_output_tokens|integer|32|0|YES
verify_cost_usd|numeric|10|6|YES
verify_calls|integer|32|0|YES
verify_latency_ms|integer|32|0|YES
```

### A — evaluation mode

```
$ DATABASE_URL=… npm run -s cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
UNKNOWN (llm-required)
evaluation mode (cache-only): set LLM_* to enable free-form asks
exit 0

$ psql -tAc "select id, capability, question, input_tokens, output_tokens, coalesce(baseline_tokens::text,'NULL'), cost_usd, latency_ms, cache_hit, verify_input_tokens, verify_output_tokens, verify_cost_usd, verify_calls, verify_latency_ms from query_log order by created_at"
71cbf1ae-24b9-435f-83d4-fe7fe422d84b|explain|¿Cómo se calcula el precio final de un pedido?|0|0|NULL|0.000000|48|f|0|0|0.000000|0|0
```

### B — daily ceiling

```
$ psql -tAc "insert into query_log (project_id, question, capability, cost_usd) values ('<acme-shop id>', 'show-spec-working budget probe', 'explain', 0.02) returning id"
616e64ff-5775-46d4-9b62-ed008bda30c8
spend since 00:00 UTC: 0.020000

$ DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder DAILY_BUDGET_USD=0.01 npm run -s cli -- ask acme-shop "<Q1>"
{"error":{"code":"BUDGET_EXHAUSTED","message":"the daily LLM budget is exhausted","details":{"spentUsd":0.02,"dailyBudgetUsd":0.01,"resetsAt":"2026-10-17T00:00:00.000Z"}}}
exit 1
rows before 2 after 2
```

### C — unknown project

```
$ DATABASE_URL=… npm run -s cli -- ask no-such-project "<Q1>"
{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}
exit 1
rows before 2 after 2
```

### D — invalid request

```
$ DATABASE_URL=… npm run -s cli -- ask acme-shop "   "
{"error":{"code":"INVALID_EXPLAIN_REQUEST","message":"invalid question","details":{"field":"question"}}}
exit 2
rows before 2 after 2
```

No screenshot: the change has no browser UI.

## State

- Before: project 1, claim 0, evidence 0, query_log 0; migrations `0001`–`0004` applied.
- After: rows `71cbf1ae-…` and `616e64ff-…` deleted by id; project 1, claim 0, evidence 0, query_log 0.
- Restored: yes.

## Not demonstrated through the interface

These scenarios need a failing database, a scripted model or a project id the CLI cannot send. They are
covered by the unit and integration tests the PR's CI ran (traceability table of `pr-description.md`):

- `explain` → A failure after the model calls leaves a row and keeps its error; A verifier failure
  leaves a row with the calls that resolved (a non-`ClaimWriteFailed` claim-write error and a crashing
  verifier cannot be provoked from the CLI).
- `explain` → A failed query log write still answers and says so; A row of an unknown project is not
  logged; Other query log write errors propagate (need an injected store failure; the CLI resolves the
  project by name before `explain`, so `no-anchor` with an unknown id is unreachable there).
- `explain` → Statements past the verify call limit stay inferences; A row at the verify call limit
  counts the limit (need a model that cites 21 distinct pairs).
- `explain` → A question holding U+0000 is rejected before the store (argv cannot carry NUL; the CLI
  check above shows the same validation path with a blank question).
- `graph-store` → the database-failure and rollback-failure scenarios of "Query log write".
- `evidence-verification` → the call-limit and latency scenarios of "Semantic citation check" (scripted
  verifier and clock).

## Handoff

The change is **demonstrably working** through its real interface: the schema carries the verification
columns; a real answered `explain` over acme-shop writes one `query_log` row equal to its `usage`, with
`cost_usd` 0 and every `verify_*` column filled; `UNKNOWN` answers write zero rows; the paths that fail
before a model call write nothing; and the daily ceiling now reads the recorded spend. The failure and
call-limit paths are exercised by the CI-run tests only. No screenshot or other file was left at the
repository root.
