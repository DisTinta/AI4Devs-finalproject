# Manual interface testing of `ask` (DIS-40, step 12)

**Change:** `cli-ask` · **Date:** 2026-10-13 · **Paths:** no output below holds an OS path; the
database URL is masked as `<DATABASE_URL>`.

The terminal is the client: every case runs the real entry point as `npm run cli` does
(`npx tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts ask …`), from Git Bash
at the repository root, with `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` unset unless stated.

## Preconditions and state

| Check | Result |
| --- | --- |
| `fixtures/acme-shop/.git` present | yes, before the run (not created by step 12) |
| `project` / `claim` / `evidence` before (0.4 baseline) | 0 / 0 / 0 |
| `npm run db:seed` (12.1, again before the CPU runs after the first restore) | `1 project loaded` · `acme-shop  php/laravel  174 nodes · 170 edges` |
| `claim` / `evidence` / `query_log` after every case | 0 / 0 / 0 |
| Restore (12.6) | see the last section |

```
export DATABASE_URL=<DATABASE_URL>
npm run db:seed
```

## Evaluation mode, success path (12.2)

| Case | Command | Exit | stdout | stderr |
| --- | --- | --- | --- | --- |
| Q1 | `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` | 0 | `UNKNOWN (llm-required)` / `evaluation mode (cache-only): set LLM_* to enable free-form asks` | empty |
| No anchor | `ask acme-shop "¿Dónde vive el ornitorrinco?"` | 0 | `UNKNOWN (no-anchor)` | empty |

## Live mode (12.3)

The author chose `llama3.2` (3.2B, the only chat model installed in the local Ollama 0.40.2).

**GPU attempt.** With the Ollama tray app's own server, the first run exited `1` after 33 s with
`{"error":{"code":"LLM_UNAVAILABLE","message":"the language model is unavailable","details":{"reason":"http-status","status":500}}}`.
A direct `POST /v1/chat/completions` showed the cause, outside this change and already met in
DIS-17 (`llm-adapter` step 12 report): `llama-server process has terminated: … CUDA error: the
provided PTX was compiled with an unsupported toolchain` — the NVIDIA driver is older than Ollama's
CUDA build. Restarted with `CUDA_VISIBLE_DEVICES=-1` only, Ollama fell back to Vulkan, which lost
the device on the 2,050-token prompt (`ggml_vulkan: device lost on Vulkan0`, same `500`).

**CPU run.** The tray app and its server were stopped and a server started on pure CPU, as the
author did for DIS-17:

```
CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu ollama serve
```

(the server log confirms `inference compute … library=cpu`). Then, twice:

```
LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2 LLM_TIMEOUT_MS=300000 npx tsx … ask acme-shop "¿Cómo se calcula el precio final de un pedido?"
```

| Run | Time | Exit | stdout | stderr |
| --- | --- | --- | --- | --- |
| 1 (model load cold) | 3 m 25 s | 0 | `UNKNOWN (invalid-model-output)` | `{"level":"info","type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":4363,"outputSha256":"c2d43303…","issues":[],"issueCount":0}` |
| 2 | 34 s | 0 | `UNKNOWN (invalid-model-output)` | `{"level":"info","type":"schema_violation","stage":"l2_inference","subcode":"invalid_json","outputBytes":1231,"outputSha256":"5672f326…","issues":[],"issueCount":0}` |

The live path works end to end (real store on a pool, git source tree, real HTTP model): the 3B
model did not return the strict JSON `explain` requires, so both runs answered the honest
`UNKNOWN` of spec "Ask UNKNOWN output", with the event and none of the model's text. No typed
answer was produced, so no `claim`/`evidence` row was written (0 / 0 before and after) and none had
to be deleted. A typed live answer needs a larger model; the typed output itself is covered by the
integration scenario "A typed answer is printed with its evidence and stored" (scripted model).

A configuration slip during the run is also evidence: `LLM_TIMEOUT_MS=600000` (over the 300,000
ms ceiling) exited `1` with `{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_TIMEOUT_MS is missing or invalid; see .env.example","details":{"variable":"LLM_TIMEOUT_MS"}}}`
before any connection, without the value.

## Error cases (12.4)

Each: stdout empty, exactly one stderr line.

| Case | Command | Exit | stderr |
| --- | --- | --- | --- |
| Unknown name | `ask no-existe "q"` | 1 | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` |
| Case differs | `ask ACME-SHOP "q"` | 1 | `{"error":{"code":"PROJECT_NOT_FOUND","message":"project not found","details":{}}}` |
| Blank question | `ask acme-shop "   "` | 2 | `{"error":{"code":"INVALID_EXPLAIN_REQUEST","message":"invalid question","details":{"field":"question"}}}` |
| No question | `ask acme-shop` | 2 | `{"error":{"code":"USAGE","message":"missing argument","details":{}}}` |
| Empty URL | `DATABASE_URL= ask acme-shop "¿Cómo se calcula…?"` | 1 | `{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}` |
| Port 1 | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db ask acme-shop "¿Cómo se calcula…?"` | 1 | `{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}` |
| Invalid LLM | `LLM_BASE_URL=ftp://x ask acme-shop "¿Cómo se calcula…?"` | 1 | `{"error":{"code":"LLM_CONFIG_INVALID","message":"LLM_BASE_URL is missing or invalid; see .env.example","details":{"variable":"LLM_BASE_URL"}}}` |

No output of any case holds the question, `ACME-SHOP`, `no-existe`, the database URL, `s3cret`,
`127.0.0.1` or `ftp://x`.

## Restore (12.6)

- `DELETE FROM project WHERE is_sample AND name = 'acme-shop'` → `DELETE 1`; `project` / `claim` /
  `evidence` back to 0 / 0 / 0, the 0.4 baseline.
- `fixtures/acme-shop/.git` kept: it existed before step 12.
- `git status`: only the change's own files (no stray file from the run).
