## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/core/src/ports/LlmPort.ts` is an empty interface, already re-exported by
  `packages/core/src/ports/index.ts`. `packages/adapters/llm/src/index.ts` is `export {}`; its
  `package.json` depends only on `@codemind/core`. No package in `packages/` depends on `zod`.
- Domain errors follow `packages/core/src/knowledge/errors.ts`: `DomainError` with a stable `code`,
  one class per failure, typed fields instead of free text.
- Environment reading follows `packages/adapters/git/src/config.ts` (`authorHashSaltFromEnv(env)`):
  the environment is a parameter, only the composition root passes `process.env`, and the message
  names the variable, never its value. Its test, `tests/unit/git/salt-config.spec.ts`, is the
  template for the configuration tests.
- The schema fixes the embedding dimension at `vector(1536)` (`file.embedding`, `symbol.embedding`,
  `cache_entry.question_embedding`, migrations `0001` and `0002`, HNSW indexes in `0003`). Nothing
  writes those columns yet: they are always `NULL`.
- Tests resolve workspace packages to `src/` through the Vitest alias and `tests/tsconfig.json`
  `paths`; `@codemind/adapter-llm` is in neither. Stryker mutates `packages/core` and `packages/cli`
  only. Packages compile with `module`/`moduleResolution` `Node16`, TypeScript `^5.5`, `strict`.
- No caller exists yet: DIS-18 (evaluation adapter, budget), DIS-29/DIS-56 (prompts) and CM-HU-12
  (API) will consume the port.

## Goals / Non-Goals

**Goals:**

- A port whose shape DIS-18, DIS-29, DIS-56 and CM-HU-12 can use without changing it.
- One place that turns the environment into a typed LLM configuration, failing at boot.
- An HTTP client fully testable with an injected `fetch`, no network.
- A key that cannot reach an error, by construction rather than by redaction.

**Non-Goals (design level):**

- No composition root wiring: nothing calls `llmConfigFromEnv` from `process.env` yet (the CLI `ask`
  and the API arrive with DIS-29 / CM-HU-12).
- No shared HTTP helper for other adapters; no retry/backoff policy.

## Decisions

### D1 — Contract and types live in core; the HTTP shape stays in the adapter

`packages/core/src/llm/llm-request.ts` declares `LlmPurpose = 'answer' | 'verify'`,
`LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }`,
`CompletionRequest = { messages: readonly LlmMessage[]; purpose: LlmPurpose }`,
`CompletionResult = { text; model; usage: { inputTokens; outputTokens } }` and
`EmbeddingResult = { vectors: number[][]; usage: { inputTokens } }`. `LlmPort` (in
`ports/LlmPort.ts`) is `{ readonly mode: 'live' | 'evaluation'; complete(request); embed(texts) }`.
The OpenAI wire names (`prompt_tokens`, `choices`, `data[].index`) never leave the adapter. The port
names the purpose, not the model: which model serves `verify` is configuration, not domain.

`packages/core/src/llm/index.ts` re-exports the module and `packages/core/src/index.ts` exports it,
like `knowledge/` and `index/`.

*Alternative rejected:* a `model` field on the request. It would push vendor configuration into
every caller and make `LLM_MODEL_VERIFY` a caller concern.

### D2 — `EMBEDDING_DIMENSIONS` in core, checked by the adapter

`packages/core/src/llm/embedding-dimensions.ts` exports `EMBEDDING_DIMENSIONS = 1536`, with a
comment naming the three `vector(1536)` columns and their migrations. It is the single source of the
number in TypeScript; the SQL keeps its own literal (migrations cannot import TypeScript). The
adapter checks every returned vector against it and fails with `dimension-mismatch` carrying
`expected` and `received`. No `dimensions` parameter is sent: support for it across
OpenAI-compatible servers is uneven, and silently truncated vectors would hide a wrong model choice.

*Alternative rejected:* making the dimension configurable (`LLM_EMBED_DIMENSIONS`). The columns are
fixed by the schema, so a configurable number could only disagree with them; changing it is a
migration, owned by CM-HU-19 (DIS-46).

### D3 — `LlmUnavailable` in core, one class with a closed `reason`

`packages/core/src/llm/errors.ts`: `LlmUnavailable extends DomainError`, `code = 'LLM_UNAVAILABLE'`,
`reason: LlmUnavailableReason` (`'http-status' | 'invalid-response' | 'network' | 'timeout' |
'not-configured' | 'dimension-mismatch'`), optional `status`, `expected`, `received`, and optional
`systemCode` (only with reason `network`, see D4). The message is built only from the reason, those
numbers and `systemCode` (e.g. `LLM unavailable: http-status 500`,
`LLM unavailable: network ECONNREFUSED`). It lives in
core because the domain (DIS-18 budget, DIS-29 `UNKNOWN`, CM-HU-12 status mapping) branches on it,
like `ProjectNotFound`.

*Alternative rejected:* one class per reason. Callers degrade the same way for all of them; a closed
`reason` is what `INVALID_SEED` already does in this repository.

### D4 — No `cause`, no response body: the key cannot leak by construction

`LlmUnavailable` is never given a `cause`, and no part of a response body, of a `fetch` rejection
message or of a Zod issue is copied into it. Only the reason, the HTTP status, the dimensions and,
for `network`, a `systemCode` reach the error. `systemCode` is copied from the rejection's
`cause.code` (Node's `fetch` wraps the socket error there) only when it matches `/^E[A-Z]+$/`
(`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`…); anything else is dropped. A closed alphabet of capital
letters cannot carry a key, and it is the piece of information that tells "Ollama is not running"
from "wrong host". The key is read once into the live configuration and only used to build the
`Authorization` header. This makes the "key never leaks" requirement hold for any error a server or
the runtime can produce, instead of depending on scrubbing every string.

*Trade-off:* debugging loses the original error. Accepted: the reason, status and `systemCode` are
enough to act, and an error holding a server body is exactly where a reflected key would appear.

### D5 — Configuration: discriminated union, `LlmConfigError` in the adapter

`packages/adapters/llm/src/config.ts` exports `EvaluationLlmConfig = { mode: 'evaluation' }`,
`LiveLlmConfig = { mode: 'live'; baseUrl; apiKey?; model; verifyModel; embedModel?; timeoutMs }`,
`LlmConfig` (their union), `DEFAULT_LLM_TIMEOUT_MS = 120_000`, `LlmConfigError` and
`llmConfigFromEnv(env: Record<string, string | undefined>): LlmConfig`.

- Order of checks: trim everything; both URL and key absent → evaluation; key without URL →
  `LLM_BASE_URL`; URL not parsable by `new URL()` or protocol not `http:`/`https:` → `LLM_BASE_URL`;
  `LLM_MODEL` absent → `LLM_MODEL`; `LLM_TIMEOUT_MS` present and not `/^[0-9]+$/` with a value in
  `1..2147483647` → `LLM_TIMEOUT_MS`. The upper bound is the largest delay a Node timer accepts
  (2³¹ − 1 ms); above it Node warns and fires after 1 ms, so `9999999999` would silently become an
  immediate timeout. The bound is checked on the parsed number, so no precision is lost for longer
  digit strings (they are above the bound anyway). The first failure is thrown (boot fails on one variable at a time, like the CLI's
  `MISSING_CONFIG`).
- `baseUrl` is stored without trailing `/` so the endpoints are `${baseUrl}/chat/completions` and
  `${baseUrl}/embeddings`. `verifyModel` is already resolved (`LLM_MODEL_VERIFY` or `LLM_MODEL`), so
  the client never repeats the fallback.
- `LlmConfigError extends DomainError` (from `@codemind/core`), `code = 'LLM_CONFIG_INVALID'`,
  field `variable`, message `<VARIABLE> is missing or invalid; see .env.example`. It lives in the
  adapter because the variable names are an adapter concern; core never sees the environment.

*Alternatives rejected:* the key decides the mode (old `readme.md` wording) — it forces a fake
`ollama` key on every developer; collecting all failures in one error — the CLI already reports one
missing variable at a time, and two conventions would confuse the composition root.

### D6 — Client: injected `fetch`, one request per call, `AbortSignal.timeout`

`packages/adapters/llm/src/openai-compatible-llm.ts` exports
`createOpenAiCompatibleLlm(config: LiveLlmConfig, options?: { fetch?: typeof fetch }): LlmPort` with
`mode: 'live'`. Typing the parameter as `LiveLlmConfig` is what makes an evaluation configuration a
type error; the test pins it with `// @ts-expect-error`, which `npm run typecheck` checks because it
covers `tests/`.

Per request: `POST` with `Content-Type: application/json`, `Authorization: Bearer <key>` only when
`apiKey` is set, body `{ model, messages }` (no `stream`, no sampling options) or
`{ model, input }`, and `signal: AbortSignal.timeout(config.timeoutMs)`. Mapping:

| What happens | `reason` |
|---|---|
| `fetch` rejects with an error named `AbortError` or `TimeoutError` | `timeout` |
| `fetch` rejects otherwise | `network` (+ `systemCode`, D4) |
| status not 2xx | `http-status` (+ `status`) |
| `response.text()` rejects with an error named `AbortError` or `TimeoutError` (headers arrived, body did not finish in time) | `timeout` |
| `response.text()` rejects otherwise, `JSON.parse` throws, or `safeParse` fails | `invalid-response` |
| embeddings whose `index` values are not exactly `0..n-1`, each once | `invalid-response` |
| a vector of length ≠ `EMBEDDING_DIMENSIONS` | `dimension-mismatch` |

Classification goes by the error's `name`, in both places where the signal can fire: `fetch` itself
and the body read. `AbortSignal.timeout` keeps running after the headers arrive, so a server that
sends `200` and stalls the body is aborted during `response.text()`; classifying by `name` there too
is what makes that case `timeout` and not `invalid-response`. The body is read once
(`response.text()`, then `JSON.parse` in a `try`). `embed([])` returns `{ vectors: [], usage:
{ inputTokens: 0 } }` before touching `fetch`; `embed()` without `embedModel` throws
`not-configured` before touching `fetch`. Vectors are ordered by `index`; a `data` list whose indexes
are not exactly `0..n-1` for `n` input texts (a missing, duplicated or out-of-range index) is
`invalid-response`.

*Alternatives rejected:* a vendor SDK (`openai`) — a heavy dependency for two endpoints, and it adds
its own retries and error types that would have to be unwrapped; `undici` directly — Node 20's
global `fetch` is the same engine.

### D7 — Zod schemas for the two responses, only in the adapter

`packages/adapters/llm/src/response-schemas.ts` holds `chatCompletionResponse`
(`choices: [{ message: { content: string } }, ...]` non-empty, optional `usage` with non-negative
integer `prompt_tokens` / `completion_tokens`) and `embeddingsResponse` (`data: { index:
non-negative integer; embedding: number[] }[]`, optional `usage.prompt_tokens`). Unknown fields are
ignored (servers add their own). `zod` is installed in `packages/adapters/llm` only (`^4`, current
4.6.x; Zod 4 supports TypeScript ≥ 5.5 with `strict`, which the repository already uses). This is
the first use of Zod in the repository, so the *target* note in `docs/backend-standards.md` §1 goes.

### D8 — Tests at the HTTP boundary, through the package name

`tests/unit/llm/llm-config.spec.ts` (requirement "LLM configuration…", pattern
`salt-config.spec.ts`) and `tests/unit/llm/openai-compatible-llm.spec.ts` (the other requirements),
with a small fake `fetch` that records each request (`url`, `method`, headers, parsed body) and
replies from a script. Timeout scenario: `LLM_TIMEOUT_MS=50` and two fakes, one whose `fetch`
rejects only when its `signal` aborts and one that resolves at once with a `200` `Response` whose
`ReadableStream` body errors only when the `signal` aborts, so the test waits ~50 ms with real
timers. Network scenario: fake rejections shaped like Node's (`TypeError('fetch failed')` with a
`cause` carrying `code`). The alias `@codemind/adapter-llm` is
added to `vitest.config.ts` and `tests/tsconfig.json`, so the tests import by package name like the
other adapters.

### D9 — No ADR

Every decision here is local to the LLM adapter and cheap to revert. The two cross-cutting points
are already owned elsewhere: the embedding dimension and model (DIS-46, note left there) and the mode
rule (`docs/project-context.md` closed decision 2, updated by this change and commented on DIS-7).

## Risks / Trade-offs

- [With Ollama's usual embedding models (`nomic-embed-text`, 768) every `embed()` fails with
  `dimension-mismatch`] → Accepted and documented (proposal non-goals, `.env.example` comment);
  DIS-46 owns the model choice and the migration. No Entrega 2 consumer of `embed()` is planned.
- [120 s default timeout makes a dead endpoint slow to report] → Configurable with `LLM_TIMEOUT_MS`;
  the default favours Ollama's cold start, the real development case.
- [No `cause` makes production failures harder to diagnose] → The reason, status and, for network
  failures, a closed-alphabet `systemCode` are kept; a future logger in the composition root can log
  them without the body.
- [A server that ignores `index` order or returns extra vectors] → Rejected as `invalid-response`
  rather than guessed.
- [`@ts-expect-error` silently passes if the line stops compiling for another reason] → The positive
  case (a live configuration) is in the same test, so a broken import fails the suite.

- [`LLM_BASE_URL` accepts `http:` for any host, so a key paired with a remote `http://` URL travels in clear]
  → Accepted (privacy check, Low): `http` is what local Ollama needs and Ollama needs no key; a paid remote
  provider is configured with `https://` (readme §1.4). Rejecting `http` for non-local hosts would need a host
  allow-list this change does not own.

## Migration Plan

No data or schema change. `.env.example` gains `LLM_EMBED_MODEL` and a commented `LLM_TIMEOUT_MS`,
and its Ollama example leaves `LLM_API_KEY` empty; existing `.env` files with `LLM_API_KEY=ollama`
keep working (a key is simply sent). Rollback is reverting the commits.

## Follow-ups

- **B — DIS-46 (CM-HU-19):** choose the embedding model; migrate `vector(1536)` if its dimension
  differs, update `EMBEDDING_DIMENSIONS`; correct DIS-5's non-goal. Note already on DIS-46.
- **B — DIS-18 (CM-HU-07.2):** the evaluation adapter that implements `LlmPort` with
  `mode: 'evaluation'` from `EvaluationLlmConfig`, and the budget.
- **D — privacy check, Low:** a key with a remote `http://` URL travels in clear; accepted (Risks).
- **B — DIS-29 / DIS-41, privacy check, Low:** what is sent to a cloud endpoint (repository content) is owned
  there.
- **B — CM-HU-12 (DIS-59):** map `LLM_UNAVAILABLE` and `LLM_CONFIG_INVALID` to the API error shape;
  add `zod` to `packages/api`.
