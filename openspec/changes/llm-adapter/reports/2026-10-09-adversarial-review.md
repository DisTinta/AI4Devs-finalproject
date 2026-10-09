# Adversarial Review — llm-adapter (DIS-17)

- Date: 2026-10-09
- Run by: `/adversarial-review` (forked, read-only session; this report is its output, saved by the main session)
- Scope: branch `feature/DIS-17-llm-adapter` at HEAD `3e769d1` against `origin/feature/entrega-2-CRN` (13 commits):
  spec (27 scenarios), tasks, design follow-ups, reports, adapter and core sources, the three test files; a quick
  check of Node's `fetch` (v24.11.1, undici 7.16.0) against an in-memory HTTP server. No file was written by the
  reviewer.

## Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/adapters/llm/src/config.ts:75-82`, `packages/adapters/llm/src/openai-compatible-llm.ts:33-41` | `LLM_TIMEOUT_MS` accepts up to 2147483647, but `fetch` runs on Node's global undici agent, whose documented `headersTimeout`/`bodyTimeout` are 300 s (connect 10 s). Above 300 000 ms a request fails at ~300 s with `UND_ERR_HEADERS_TIMEOUT`/`UND_ERR_BODY_TIMEOUT`, which `isAbort` does not match → `network`, and the code fails `^E[A-Z]+$` → no `systemCode`. (No dispatcher is passed: confirmed in code; the 300 s defaults come from undici's documentation, not from a 300 s run.) | Contradicts spec 233-235 (`timeout` = no complete response within the configured timeout). Likely victim: a non-streaming completion on CPU Ollama (18 s cold for a short answer in step 12) with a raised timeout gets an unexplained `network` at 5 minutes. |
| Minor | `reports/2026-10-09-show-spec-working.md:132` | The show-spec-working evidence was taken at `3a0390f`, before `26c3629` (cut body → `network`, relaxed `usage`) and `b0b2e23` (`redirect: 'manual'`, base-URL rejections, non-2xx body cancelled); 15.3.1/15.3.4 are ticked without re-running it. The unit fake `fetch` records `redirect` but never acts on it. The reviewer's in-memory check shows `redirect:'manual'` returns `302`, `ok:false`, `type:basic`. | Behaviour correct, but no real-runtime evidence in the repository for 4 of 27 scenarios. Process debt. |
| Minor | `openai-compatible-llm.ts:113-118` | A real mid-body socket cut gives `TypeError('terminated')` with cause `SocketError`, code `UND_ERR_SOCKET`: no `systemCode`. The `ECONNRESET` case of "A connection cut while reading the body is a network failure" is hand-built in the test; cut sockets, header/body timeouts and connect timeouts never produce an `E…` code in Node. | Spec text holds, but `systemCode` will almost never be filled for cut bodies or timeouts. Decide whether `UND_ERR_*` codes (fixed identifiers) are carried. |
| Minor | `response-schemas.ts:15`, `openai-compatible-llm.ts:126-133` | `inInputOrder` checks only `index >= count` and `data.length !== count`; only Zod's `.int().nonnegative()` guards negative or fractional indexes, untested, and the adapter is outside Stryker. Removing `.nonnegative()` lets `[-1, 0]` for two texts return **one** vector with no error, and every test still passes. | A schema refactor could silently break "exactly `0..n-1`" (spec 181); DIS-29/DIS-46 would store embeddings against the wrong rows. |
| Minor | `openai-compatible-llm.ts:54` | `response.text()` reads a 2xx body with no size limit; only the timeout bounds it. | A wrong or hostile endpoint can make the process use as much memory as it likes. |
| Minor | `config.ts:68` | `LiveLlmConfig.apiKey` is a plain enumerable property; "the key never leaks" covers errors only. | If the composition root (DIS-29) logs or serialises the config, the key leaks. |
| Minor | `config.ts:56`, `openai-compatible-llm.ts:29,42-44` | A key `fetch` rejects as a header value (non-Latin-1 or control character) passes config validation and then fails every request as `network` with no code. | A configuration fault looks like a network fault. |
| Minor | `tasks.md:65,102,106` | Task 8.2 still says "22 `#### Scenario:`" (all 27 map 1:1); 13.2 (CI evidence) and 14.1 still open although `pr-description.md` exists and 15.1 is ticked. | Evidence out of date; CI proof missing. |
| Minor | `vitest.config.ts:24-27`, commit `0057fb3` | Two out-of-scope commits: global `testTimeout`/`hookTimeout` 20 s (hides hangs of up to 20 s everywhere) and the switch that can turn off the spec/test protection hook (ships `KIT_PROTECT_SPECS="1"`). Already D in `design.md:272-274`. | A reviewer of DIS-17 also approves harness changes. Listed for visibility. |
| Question | `spec.md:105-120,173-188` | Nothing about `complete({ messages: [] })` or `embed()` with more inputs than a provider accepts per request; both are sent as is and come back as `http-status`. | Callers (DIS-29) need to know whether batching is their job. |

## Checked and clean

- Spec planned before code (carried untracked per task 0.3, committed right after `25ea5f2`); later spec edits came with
  code changes, recorded as author decisions with RED reported — not spec-fitting.
- No existing test modified; only new `tests/unit/llm/*` and `tests/tsconfig.json`.
- No migration; `LlmPort` had no consumers; `EMBEDDING_DIMENSIONS` matches the three `vector(1536)` columns.
- `LlmUnavailable` has no `cause`; messages hold reason and numbers or `systemCode`; `LlmConfigError` only the
  variable; `.gitleaks.toml` allowlist line numbers correct.
- Duplicate-index guard and order-by-index correct; stateless client (no interaction between concurrent calls).
- Empty/whitespace values absent; timeout bounds rejected; base URLs with `?`, `#` or user info rejected.
- `.env.example` not read (denied by the harness hook).
- Strongest tests: "Embeddings with missing or duplicated indexes are an invalid response" (catches dropping the
  duplicate check) and "Embeddings are returned in input order" (catches `push` instead of index placement).

## Verdict

**PASS WITH GAPS** — no Blocker, one Major (undici timeout ceiling) plus Minors, each to be fixed in this change or
given a destination. Destinations: `design.md` → Follow-ups (adversarial-review block).
