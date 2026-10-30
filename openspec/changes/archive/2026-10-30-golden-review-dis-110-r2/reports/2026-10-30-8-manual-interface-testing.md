# Manual Interface Testing

**Change:** `golden-review-dis-110-r2`. **Date:** 2026-10-30. **Shell:** Git Bash on Windows.

The interfaces this change runs are the CLI commands `cache:build`, `db:seed` and `verify` (design F5).
No HTTP route or UI changes, so no PowerShell check and no end-to-end test apply.

## Success paths

| Command | Exit | Output |
|---|---|---|
| `LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder LLM_MODEL_VERIFY=qwen2.5-coder npm run cache:build -- --project task-api Q1` (server with `context_length: 16384`) | 0 | `Q1: attempt 1/3 not cacheable (invalid-model-output)` / `Q1: answered in 104 s (attempt 2/3)` / `task-api: 3 golden answers -> seeds/cache/task-api.json` |
| `npm run db:seed` | 0 | `2 projects loaded` |
| `npm run verify` (no `LLM_*`) | 0 | six `✓` lines; `acme-shop: 3/3 golden answers match`, `task-api: 3/3 golden answers match` |

## Error paths

| Command | Exit | Output |
|---|---|---|
| `npm run cache:build -- --project task-api Q9` | 1 | `{"error":{"code":"USAGE","message":"unknown or repeated golden question id","details":{"allowed":["Q1","Q2","Q3"]}}}`; `git status --short seeds` empty |
| `cache:build -- --project task-api Q1` against the author's server before its restart (`context_length: 4096`) | 1 | 3 × `invalid-model-output`, `GOLDEN_NOT_CACHEABLE`; no file written (design F6) |
| the same against a stopped server on 11435 | 1 | 3 × `network`, `LLM_UNAVAILABLE` (`ECONNREFUSED`), no URL in the message; no file written (design F7) |

## Restoration

`db:seed` reloads only the two sample projects; the indicators of the step 7 report are unchanged.
`node scripts/dev-processes.mjs stop`: no repository process running. The author's Ollama keeps
running.
