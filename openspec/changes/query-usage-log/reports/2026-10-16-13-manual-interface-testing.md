# Manual Interface Testing Report

- Date: 2026-10-16
- Change: query-usage-log (DIS-74)
- Step: 13. Backend: Manual Interface Testing

## Preconditions (13.1)

- Local database (compose, `postgres://codemind:codemind@localhost:5432/codemind`) migrated to `0004`;
  applied: `0001_graph-l1`, `0002_history-claims`, `0003_indexes-stale`, `0004_query-log-verification`.
- acme-shop loaded and indexed (`select name, indexed_commit is not null from project` → `acme-shop|t`);
  `npx tsc --build` exit 0.
- Counts before: project 1, claim 0, evidence 0, query_log 0 (no existing `query_log` row).
- Local Ollama 0.40.5 served CPU-only (`CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1
  OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu OLLAMA_CONTEXT_LENGTH=16384 ollama.exe serve`; log:
  `inference compute … library=cpu`). The tray app was stopped first.
- Models (author, 2026-10-16): `LLM_MODEL=qwen2.5-coder`, no `LLM_MODEL_VERIFY` (the same model
  verifies). Both at 0 USD in `COST_TABLE`.

## 13.2 Live run

### Through the CLI

```
DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder LLM_TIMEOUT_MS=300000 \
  npm run -s cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

- Exit `1` after 307 s; stdout empty; stderr
  `{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"timeout"}}}`.
- No new `query_log` row: the `answer` call failed before any call resolved, which is the spec's
  "No row when explain fails before a model call resolves".
- Cause: CPU prompt evaluation of the ~7k-token prompt takes longer than the adapter's maximum
  `LLM_TIMEOUT_MS` (300 000 ms). This is a known limit of this machine (CPU-only Ollama), not of the
  change.

### Through the same composition with a longer timeout

A scratchpad script (`live-ask.mts`, outside the repository, removed afterwards) builds `explain` exactly
as `ask` does (`packages/cli/src/commands/ask.ts`: `createPostgresStore({ pool })`,
`createGitSourceTree()`, `createLlm(llmConfigFromEnv(env))`, the repository root as workspace root,
the system clock, a fresh verification cache), only with `timeoutMs: 1_200_000`, and prints the answer
kind, its events and `answer.usage` (which `ask` never prints; this also covers 13.4).

- Exit `0`, wall time 211.8 s.
- Answer: `answered`, four statements, each `INFERENCE` / `cited`; events:
  `[["entailment_unverified", "invalid-output"]]`.
- `answer.usage`:

```json
{
  "inputTokens": 8739, "outputTokens": 224, "baselineTokens": 7123, "baselineEstimator": "chars-div-4",
  "savingsPct": -22.7, "costUsd": 0, "latencyMs": 211783, "cacheHit": false,
  "generation": { "inputTokens": 6921, "outputTokens": 192, "costUsd": 0 },
  "verification": { "calls": 4, "cacheHits": 0, "inputTokens": 1818, "outputTokens": 32, "costUsd": 0, "latencyMs": 68077 }
}
```

- The one new row (`select … from query_log order by created_at`):

| column | value |
|---|---|
| id | `99679665-514f-431f-90f2-afac56aa0250` |
| capability / question | `explain` / `¿Cómo se calcula el precio final de un pedido?` |
| input_tokens / output_tokens | 8739 / 224 |
| baseline_tokens | 7123 |
| cost_usd | 0.000000 |
| latency_ms | 211783 |
| cache_hit | false |
| verify_input_tokens / verify_output_tokens | 1818 / 32 |
| verify_cost_usd | 0.000000 |
| verify_calls | 4 (≤ `MAX_VERIFY_CALLS_PER_ANSWER` = 20) |
| verify_latency_ms | 68077 |

- Checks: `input_tokens` > 0, `output_tokens` > 0, `baseline_tokens` > 0, `cost_usd` 0, `latency_ms` > 0,
  `cache_hit` false, `verify_input_tokens` > 0, `verify_calls` > 0, `verify_latency_ms` > 0; the row
  equals `answer.usage` field by field. `verify_latency_ms` ≤ `latency_ms` (observation, not a spec rule).
- **Verifier share:** the semantic check took 68.1 s of the 211.8 s call, **32 %** of `latency_ms`,
  for 4 calls (~17 s per `verify` call on CPU).
- Observation for the author: `savingsPct` is **−22.7** on this question. `baselineTokens` (7 123) is
  the cited files whole, estimated `chars-div-4`, and the input tokens are the provider's count of the
  full prompt (system prompt, wrapping, prompt ids) plus the verification. D4 allows a negative value
  and does not clamp it; the CLI does not print it. Recorded as data for Table 1 (DIS-81), not as a
  defect of this change.

## 13.3 Other paths

| Run | Command | Exit | Output | Rows |
|---|---|---|---|---|
| Evaluation mode | `DATABASE_URL=… npm run -s cli -- ask acme-shop "<Q1>"` (no `LLM_*`) | 0 | `UNKNOWN (llm-required)` + the evaluation message | one new row `31758295-fa30-46cc-a6fe-c308ec629baa`: tokens 0/0, `baseline_tokens` NULL, `cost_usd` 0.000000, `latency_ms` 37, `cache_hit` false, `verify_*` 0, `verify_calls` 0, `verify_latency_ms` 0 |
| Budget exhausted | hand-inserted row `7ed83940-2b3b-40b6-a0df-d92440a661f3` (`cost_usd` 0.02, today), then `DAILY_BUDGET_USD=0.01 LLM_BASE_URL=… LLM_MODEL=qwen2.5-coder npm run -s cli -- ask acme-shop "<Q1>"` | 1 | `{"error":{"code":"BUDGET_EXHAUSTED",…,"details":{"spentUsd":0.02,"dailyBudgetUsd":0.01,"resetsAt":"2026-10-17T00:00:00.000Z"}}}` | 2 before, 2 after: no new row besides the inserted one |
| Unknown project | `DATABASE_URL=… npm run -s cli -- ask no-such-project "<Q1>"` | 1 | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` | 2 before, 2 after: no new row |

The budget run shows the ceiling now reading `query_log.cost_usd` (`spentUsd` 0.02): before this change
nothing wrote the column and the ceiling always read 0.

## 13.5 Restore

- Deleted by id: `query_log` rows `31758295-…`, `7ed83940-…`, `99679665-…`; the four `claim` rows the live
  run stored (their `evidence` rows by cascade).
- Counts after: project 1, claim 0, evidence 0, query_log 0 (the 13.1 values).
- Ollama stopped (`ollama.exe` and the orphan `llama-server.exe`); the scratchpad script is outside the
  repository; `git status` shows no stray file.

## Outcome
- Status: PASS (the CLI path is bounded by the adapter's 300 s timeout on CPU; the same composition
  with a longer timeout wrote the expected row)
- Blocking issues: none
