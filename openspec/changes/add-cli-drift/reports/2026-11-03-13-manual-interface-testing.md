# Manual Interface Testing Report

- Date: 2026-11-03
- Change: add-cli-drift
- Step: 13. Backend: Manual Interface Testing (the interface is the CLI); 14. End-to-End Testing: not applicable (the change adds no web or HTTP interface; the CLI is exercised end to end by the integration tests of step 8 and by this step)

All text of this report is the agent's. Paths are shown relative to the repository (the OS user name is masked); document text appears only as the excerpts the command prints.

## Environment

- Local PostgreSQL (docker compose) seeded with `npm run db:seed` (acme-shop, task-api; the golden answers and the golden drift report loaded). Before the runs: `claim` 0, `cache_entry` 7, acme-shop `drift:` `hit_count` 0, `query_log` empty (timestamp 2026-11-03 23:43:27Z).
- Git Bash on Windows 11, Node v24.11.1. Ollama 0.40.13 served with `OLLAMA_CONTEXT_LENGTH=16384`, `qwen2.5-coder`; the machine's `.env` configures the model (live mode).

## Success path in evaluation mode (task 13.2)

`LLM_BASE_URL= LLM_API_KEY= npm run cli -- drift acme-shop`: exit `0`; stdout the golden report of `seeds/drift/acme-shop.json` (a block for `README.md` with 1 contradiction and a block for `docs/pricing.md` with 1, the second with five code citations) ending with an empty line and `note: golden report (answer cache)`; stderr empty. After it, the `drift:` entry's `hit_count` was `1` and `query_log` held one row: `capability` `drift`, `question` `drift:`, `cache_hit` true, every counter 0, `latency_ms` 28. The full output is pasted in `docs/DEMO.md` step 7.

## Live path with Ollama (task 13.3)

- `npm run cli -- drift acme-shop --doc docs/pricing.md`, `.env` as configured, `DAILY_BUDGET_USD` unset, started 23:43:51Z: exit `1` after about 6 minutes, stderr `{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"timeout"}}}`. The default `LLM_TIMEOUT_MS` is shorter than one 8,000-token confrontation on this machine (the DIS-72 gotcha). The failure left the row the spec asks for: `drift:docs/pricing.md`, `cache_hit` false, 17,872 input tokens, 260 output tokens, cost 0, 3 verify calls, `latency_ms` 384,596 (the spend before the error was kept, and the error was not replaced).
- The same with `LLM_TIMEOUT_MS=1200000` on the command line, started 23:50:32Z, ended 23:52:41Z (2 min 9 s): exit `0`; stdout `docs/pricing.md: 0 claims checked, 0 omitted, 0 dropped, 0 contradictions`, no note; stderr one line, `{"level":"info","type":"drift_claim_skipped","docPath":"docs/pricing.md","claimIndex":0,"reason":"invalid-model-output","subcode":"unknown_evidence_id"}`; row: `drift:docs/pricing.md`, `cache_hit` false, 8,010 input tokens, 104 output tokens, cost 0, 0 verify calls, `latency_ms` 113,617. The small local model skipped its one claim; the run is the evidence that a live run prints, logs and writes its row.
- Tiny `DAILY_BUDGET_USD`: `qwen2.5-coder` is priced at 0 in `COST_TABLE`, so a spend of 0 never reaches a ceiling and `BUDGET_EXHAUSTED` cannot be provoked with it (Follow-up AP3). With an unpriced model, `DAILY_BUDGET_USD=1 LLM_MODEL=unpriced-model npm run cli -- drift acme-shop` printed `{"error":{"code":"LLM_CONFIG_INVALID","message":"DAILY_BUDGET_USD is set but LLM_MODEL has no price in COST_TABLE; see .env.example","details":{"variable":"DAILY_BUDGET_USD","modelVariable":"LLM_MODEL"}}}`, exit `1`, before any connection. The stop by an exhausted budget is covered by the unit scenario "A daily budget stops the drift model call".

## Error cases (task 13.4)

| Command | Exit | stdout | stderr |
|---|---|---|---|
| `npm run cli -- drift` | 2 | empty | `{"error":{"code":"USAGE","message":"missing argument","details":{}}}` |
| `npm run cli -- drift acme-shop --doc ""` | 2 | empty | `{"error":{"code":"INVALID_DRIFT_REQUEST","message":"invalid drift request","details":{"field":"docPath"}}}` |
| `npm run cli -- drift no-existe` | 1 | empty | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` |
| `DATABASE_URL= npm run cli -- drift acme-shop` | 1 | empty | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` |
| `LLM_BASE_URL= LLM_API_KEY= npm run cli -- drift task-api` | 0 | `UNKNOWN (llm-required)` and `evaluation mode (cache-only): set LLM_* to enable drift` | empty |

## PowerShell (task 13.5, run by the agent)

`docs/DEMO.md` step 7 holds the command text and the captured output. A scratch file with exactly the two lines `LLM_BASE_URL=` and `LLM_API_KEY=` was written in the session scratch directory (not `.env`; `.env` was not edited, and no `$env:` variable was set). The command, from the repository root:

`npx tsx --env-file=<that file> --import=./scripts/load-env.mjs --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts drift acme-shop`

- `pwsh -NoProfile -Command '…'`, PowerShell 7.6.9: exit `0`; the output ends with `note: golden report (answer cache)`.
- `powershell.exe -NoProfile -Command '…'`, Windows PowerShell 5.1.26100: exit `0`; the output is identical to the PowerShell 7 one.
- With the same file, `drift acme-shop --doc docs/pricing.md` printed `UNKNOWN (llm-required)` and its message in both versions, which proves the two variables reached the command empty although `.env` configures a model (without the flag, the same command ran the model, see above).
- The first attempt in PowerShell 7 used a file name ending in `.env`, which the agent's tooling refuses to write; the file was named differently and the runs above are those of the final file. The `query_log` rows of the PowerShell runs are in the list below (`cache_hit` true for the golden, false and zero for `UNKNOWN`).

## Restore (task 13.6) and the rows written

The command's intended effect is one `query_log` row per run, and the table is append-only by design. Rows written by this step (all `capability` `drift`): `drift:` golden hit (step 13.2, the first PowerShell 7 attempt with the missing file, the final PowerShell 7 run and the PowerShell 5.1 run: four rows, `cache_hit` true, counters 0); `drift:` miss in evaluation mode for `task-api`, and `drift:docs/pricing.md` in evaluation mode (PowerShell, two runs): counters 0, `cache_hit` false; the two live rows above. `npm run db:seed` then replaced the sample projects and, with them, those rows (`query_log` empty, `hit_count` 0, `cache_entry` 7). `git status` shows no stray file; `node scripts/dev-processes.mjs stop` reported no dev process of the repository.

## Outcome

- Status: PASS
- Blocking issues: none. Deviations: AP3 (a tiny budget cannot exhaust with the 0-priced local model).
