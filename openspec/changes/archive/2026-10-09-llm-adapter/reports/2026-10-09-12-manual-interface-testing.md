# Manual Interface Testing Report

- Date: 2026-10-09
- Change: llm-adapter
- Step: 12 — Backend: Manual Interface Testing (agent-executed)

## Setup

- The adapter has no CLI or HTTP entry point yet, so it was driven by a throwaway Node script in the session
  scratchpad (outside the repository, deleted afterwards) that imports the built package
  (`npx tsc --build`, then `packages/adapters/llm/dist/index.js`), calls `llmConfigFromEnv` with an explicit env
  object, `createOpenAiCompatibleLlm` with the real global `fetch`, and prints the result or the error's fields,
  `String(error)` and `JSON.stringify(error)`.
- Ollama was not installed. With the author's approval: `winget install --id Ollama.Ollama` (0.40.2, exit 0),
  `ollama pull llama3.2`, `ollama pull nomic-embed-text`.
- Environment finding: on this machine Ollama's CUDA runner crashes loading any model
  (`CUDA error: the provided PTX was compiled with an unsupported toolchain`, `exit status 0xc0000409`): the NVIDIA
  driver is older than the CUDA build Ollama ships. Through the adapter this surfaced as `http-status 500`, with the
  body withheld as designed (D4); the cause was read from Ollama's own log and a direct `curl`. The test server was
  restarted on CPU (`CUDA_VISIBLE_DEVICES=-1 ollama serve`). Not a defect of this change; the author can update the
  GPU driver or run Ollama on CPU.

## Success path (12.2)

Env `{"LLM_BASE_URL":"http://localhost:11434/v1","LLM_API_KEY":"","LLM_MODEL":"llama3.2"}`, one `user` message.

| Run | Result | Time |
|---|---|---|
| Cold (model not loaded, `ollama ps` empty) | `complete` text non-empty, `model: "llama3.2"`, `usage: {inputTokens: 37, outputTokens: 34}` | 18 334 ms |
| Warm | text non-empty, `usage: {inputTokens: 37, outputTokens: 25}` | 915 ms |

The cold start fits well inside the 120 s default timeout. No key was configured, so no `Authorization` header
was sent (the header rule itself is pinned by the unit scenarios, which record the request).

## Embeddings against the real server (12.3)

| Case | Result |
|---|---|
| `LLM_EMBED_MODEL=nomic-embed-text`, `embed(["hola"])` | `LLM_UNAVAILABLE`, `dimension-mismatch`, `expected: 1536`, `received: 768` — the documented risk (non-goal; DIS-46) |
| `embed([])` | `{ vectors: [], usage: { inputTokens: 0 } }` in 2 ms (no request) |
| `LLM_EMBED_MODEL` unset, `embed(["hola"])` | `not-configured` |

## Error cases (12.4)

| Case | Result |
|---|---|
| Closed port `http://127.0.0.1:59999/v1` and `http://localhost:59999/v1` | `network`, `systemCode: "ECONNREFUSED"` |
| Port 1 (`http://localhost:1/v1`) | `network`, no `systemCode`: port 1 is on `fetch`'s blocked-port list, Node rejects with cause `bad port` and no code — correct per design D4 (only `^E[A-Z]+$` codes are copied) |
| Unknown model (`LLM_MODEL=no-such-model`) | `http-status`, `status: 404` |
| `LLM_TIMEOUT_MS=1` | `timeout` |
| `LLM_API_KEY=centinela-manual` + unknown model (404) | `http-status 404`; message, `String` and JSON contain no `centinela-manual` |
| `LLM_API_KEY=centinela-manual` + closed port | `network ECONNREFUSED`; no `centinela-manual` anywhere |
| Config: key without URL (`{"LLM_API_KEY":"centinela-manual"}`) | `LlmConfigError`, `LLM_CONFIG_INVALID`, `variable: "LLM_BASE_URL"`; no key in message or JSON |
| Config: `LLM_BASE_URL=localhost:11434` | `LlmConfigError` naming `LLM_BASE_URL` |
| Config: empty env | `mode: "evaluation"` |

## State restoration (12.5)

- No database or repository file is involved. The scratch script was deleted; `git status` shows only the
  change's own files (plus the author's pre-existing `.claude/` and `.gitignore` edits, outside this change).
- The test Ollama server (CPU) was stopped. The installer had also started the Ollama tray app, which was stopped
  to restart the server on CPU; Ollama stays installed with `llama3.2` and `nomic-embed-text` pulled, ready for
  the author to start.
- Paths in this report mask nothing personal (no OS user name printed).

## Outcome

- Status: PASS — every scenario family behaves against a real OpenAI-compatible server as specified.
