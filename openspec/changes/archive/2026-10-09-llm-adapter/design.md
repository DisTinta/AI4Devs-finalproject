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
`LLM unavailable: network ECONNREFUSED`). A detail that does not apply is **absent** (no own property),
not present with `undefined`, so `'systemCode' in error` and `JSON.stringify` tell the truth
(verify-against-spec 3.7). It lives in
core because the domain (DIS-18 budget, DIS-29 `UNKNOWN`, CM-HU-12 status mapping) branches on it,
like `ProjectNotFound`.

*Alternative rejected:* one class per reason. Callers degrade the same way for all of them; a closed
`reason` is what `INVALID_SEED` already does in this repository.

### D4 — No `cause`, no response body: the key cannot leak by construction

`LlmUnavailable` is never given a `cause`, and no part of a response body, of a `fetch` rejection
message or of a Zod issue is copied into it. Only the reason, the HTTP status, the dimensions and,
for `network`, a `systemCode` reach the error. `systemCode` is copied from the error's own `code`
or its `cause.code` (Node's `fetch` wraps the socket error in `cause`; a body stream error may carry the
code itself) only when it matches `/^E[A-Z]+$/` (`ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`…) or
`/^UND_ERR_[A-Z_]+$/` (`UND_ERR_SOCKET`, `UND_ERR_CONNECT_TIMEOUT`…), both anchored; anything else is
dropped. Both are fixed identifiers of the runtime (the OS error names and undici's error codes), never
free text: a closed alphabet of capital letters and `_` cannot carry a key. They are the piece of
information that tells "Ollama is not running" from "wrong host" or "connection cut". The `UND_ERR_*`
pattern was added after `/adversarial-review` (author decision): a real mid-body socket cut in Node
gives `UND_ERR_SOCKET`, never an `E…` code, so without it `systemCode` would almost never be filled. The key is read once into the live configuration and only used to build the
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
  `1..300000` → `LLM_TIMEOUT_MS`. The upper bound is the default `headersTimeout` and `bodyTimeout`
  (300 s) of the undici agent behind Node's global `fetch`, which this adapter does not replace: above
  it Node ends the request by itself at 300 s, before the configured timeout, so a larger value would
  promise something the runtime does not do. (The first version allowed up to 2³¹ − 1 ms, the Node timer
  limit; `/adversarial-review` showed undici's lower ceiling; author decision.) The bound is checked on
  the parsed number, so long digit strings are simply above it. The first failure is thrown (boot fails on one variable at a time, like the CLI's
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
| `fetch` or `response.text()` rejects with an error whose own or `cause` code is `UND_ERR_HEADERS_TIMEOUT` or `UND_ERR_BODY_TIMEOUT` (undici's own timeouts; checked before the `systemCode` extraction) | `timeout`, no `systemCode` |
| `fetch` rejects with an error named `AbortError` or `TimeoutError` | `timeout` |
| `fetch` rejects otherwise | `network` (+ `systemCode`, D4) |
| status not 2xx, 3xx included (`redirect: 'manual'`: Node returns the 3xx itself) | `http-status` (+ `status`); the body is cancelled, never read |
| `response.text()` rejects with an error named `AbortError` or `TimeoutError` (headers arrived, body did not finish in time) | `timeout` |
| `response.text()` rejects otherwise (the connection was cut while the body was read) | `network` (+ `systemCode`, same helper as for `fetch`, D4) |
| `JSON.parse` throws, or `safeParse` fails | `invalid-response` |
| embeddings whose `index` values are not exactly `0..n-1`, each once | `invalid-response` |
| a vector of length ≠ `EMBEDDING_DIMENSIONS` | `dimension-mismatch` |

Classification goes by the error's `name`, in both places where the signal can fire: `fetch` itself
and the body read. `AbortSignal.timeout` keeps running after the headers arrive, so a server that
sends `200` and stalls the body is aborted during `response.text()`; classifying by `name` there too
is what makes that case `timeout` and not `network`. The body is read once (`response.text()`, then
`JSON.parse` in a `try`). The signal itself is created inside the same `try` as `fetch`, so even a
hand-built `LiveLlmConfig` with an invalid `timeoutMs` ends as an `LlmUnavailable` and nothing else
escapes a request (verify-against-spec, smaller note); it surfaces as `network` (the `RangeError` is not
an abort), a programming error unreachable through `llmConfigFromEnv`, accepted as such.

undici's connect timeout (`UND_ERR_CONNECT_TIMEOUT`, a fixed 10 s) is deliberately **not** in that list:
it fires before the configured timeout, while the connection is being opened, so it is a `network`
failure (with `systemCode` `UND_ERR_CONNECT_TIMEOUT`): a host that cannot be reached reports `network`
after ~10 s whatever `LLM_TIMEOUT_MS` says (adversarial review round 2, question).

Redirects are not followed (`redirect: 'manual'`, verify-against-spec round 2): following one turns the
POST into a GET to another URL, may carry `Authorization` along, and would accept a 2xx from an endpoint
nobody configured. A 3xx is reported as `http-status`; `LLM_BASE_URL` must point at the final endpoint.
`LLM_BASE_URL` also rejects user info (Node's `fetch` refuses it) and a query or fragment (the endpoint
paths are appended to the URL), so a misconfiguration fails at boot instead of on every request.

*Revised after verify-against-spec (author decision):* the first version mapped every non-timeout
failure of `response.text()` to `invalid-response`; the spec defines `network` as "the connection
failed", so a body cut is now `network`. `embed([])` returns `{ vectors: [], usage:
{ inputTokens: 0 } }` before touching `fetch`; `embed()` without `embedModel` throws
`not-configured` before touching `fetch`. Vectors are ordered by `index` (the schema only asks for a number; the adapter checks the
rest itself); a `data` list whose indexes
are not exactly `0..n-1` for `n` input texts (a missing, duplicated or out-of-range index) is
`invalid-response`.

*Alternatives rejected:* a vendor SDK (`openai`) — a heavy dependency for two endpoints, and it adds
its own retries and error types that would have to be unwrapped; `undici` directly — Node 20's
global `fetch` is the same engine.

### D7 — Zod schemas for the two responses, only in the adapter

`packages/adapters/llm/src/response-schemas.ts` holds `chatCompletionResponse` and
`embeddingsResponse`. Unknown fields are ignored (servers add their own).

- `choices`: a non-empty array whose **first** element has a string `message.content`; the other
  elements are not validated (`[first, ...rest]` with `rest` unknown).
- `usage` (both endpoints): absent or `null` → `0`; each field (`prompt_tokens`, `completion_tokens`)
  absent or `null` → `0`; a field present and not a non-negative integer → the parse fails →
  `invalid-response`. Lenient where servers differ (Ollama and others omit or null fields), strict
  where a value is present but wrong, since a wrong count would be stored as cost later (DIS-18).
- `data`: `{ index: number; embedding: number[] }[]`; the adapter itself checks that the indexes are exactly
  `0..n-1`, each once (D6).

*Revised after verify-against-spec (author decision):* the first version required both usage fields
whenever `usage` was present and rejected `usage: null`. `zod` is installed in `packages/adapters/llm` only (`^4`, current
4.6.x; Zod 4 supports TypeScript ≥ 5.5 with `strict`, which the repository already uses). This is
the first use of Zod in the repository, so the *target* note in `docs/backend-standards.md` §1 goes.

### D8 — Tests at the HTTP boundary, through the package name

The public `fetch` option of `createOpenAiCompatibleLlm` is this test seam; it is part of the exported
signature on purpose (a composition root may also inject an instrumented `fetch`), and is not a spec
behaviour (verify-against-spec 3.2, destination D).

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
- [A completion that needs more than 300 s cannot be waited for] → `LLM_TIMEOUT_MS` is capped at
  300000 by undici's own limits (D5); a longer wait would need a dedicated dispatcher (an `undici`
  dependency), not justified while answers are short and non-streaming.
- [A 2xx body is read whole with no size limit] → Accepted (D): bounded in time by the timeout; the
  endpoint is configured by the operator, not chosen by a user. Revisit with streaming.
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

Findings of `/verify-against-spec` (report `reports/2026-10-09-verify-against-spec.md`):

- **A — 2.1** body read cut → `network`: code, D6 and a new scenario (author decision).
- **A — 2.2** "validated at boot": the spec now says "validated when read"; boot reading is the
  composition root's job (DIS-29 / CM-HU-12).
- **A — 2.3** `.env.example`: the author pastes the LLM block written from the spec (task 10.1).
- **A — 2.4** two extra tests: the key only in `Authorization` (not in URL or body); embeddings follow
  the same `Authorization` rule.
- **A — 3.1** `mode: 'live'` added to the spec (requirement "Only a live configuration builds the HTTP
  client").
- **D — 3.2** the `fetch` option is a deliberate seam (D8).
- **A — 3.3** `usage` relaxed and only `choices[0]` validated (author decision; D7, three scenarios).
- **A — 3.4** `embed([])` without `LLM_EMBED_MODEL` is `not-configured`: spec text and an extra test.
- **D — 3.5** order of configuration checks, one error at a time: design D5, not spec behaviour.
- **A — 3.6** spec softened to "no code that type-checks"; the `.not.toThrow()` assertion removed.
- **A — 3.7** absent details are absent properties; the network scenario asserts `not.toHaveProperty`.
- **A — smaller note** `AbortSignal.timeout` created inside the `try` (D6).
Findings of the second `/verify-against-spec` round (addendum of the same report):

- **A — 2.1** the spec's Purpose says "validated when read".
- **A — 2.2 / 3.1** the invalid hand-built `timeoutMs` test asserts reason `network`; recorded in D6.
- **A — 3.2** redirects are not followed (`redirect: 'manual'`, new scenario "A redirect is not followed").
- **A — 3.3** `LLM_BASE_URL` rejects user info, a query and a fragment (values added to the malformed-URL
  scenario).
- **A — 3.4** the body of a non-2xx response is cancelled.
- **D — 3.5** out-of-scope commits on this branch, by author decision: `0057fb3 chore(harness)` (the
  `KIT_PROTECT_SPECS` switch) and `b21adce test(harness)` (Vitest `testTimeout`/`hookTimeout` 20 s for the
  load-dependent Git integration timeouts on Windows); listed in the PR description.
- **D — low impact** the message texts of `LlmUnavailable` and `LlmConfigError` are not part of the spec
  (only "no key, no values" is); `isAbort` treats any `AbortError`/`TimeoutError` as the request's own, which
  holds while there is a single signal.
- **A — drift** the `.gitleaks.toml` description now names the current lines.

Findings of `/adversarial-review` (report `reports/2026-10-09-adversarial-review.md`):

Second `/adversarial-review` round (addendum of the same report): PASS WITH GAPS, no Blocker or Major.

- **A — index guard test:** the schema now only asks `index` to be a number, so the adapter's own check is
  what rejects `-1` and `0.5` (the extra test reaches it).
- **A — own-error code:** extra test with the code on the error itself (`UND_ERR_SOCKET` on a rejection,
  `UND_ERR_BODY_TIMEOUT` on a body error).
- **A — PR description and tasks 13.2/14.1:** regenerated; 13.2 ticked with the CI run once green.
- **A — step 11 addendum** for the adversarial rounds.
- **A — `.gitleaks.toml` drift:** the description no longer lists line numbers.
- **A — question, `UND_ERR_CONNECT_TIMEOUT`:** stays `network` with `systemCode` (D6).

Final `/verify-against-spec` round (code matches the spec, 29/29):

- **A — drift** `.env.example` timeout range (fixed by the author, `15361c2`) and the `data` line of D7.
- **D — 3.2** cancelling the body of a non-2xx response is design-only (D6): it frees the connection and is
  not observable through the port.
- **D — 3.7** every trailing `/` of `LLM_BASE_URL` is stripped, not just one: consistent with "without
  trailing `/`" (D5).

First `/adversarial-review` round:

- **A — Major, undici timeout ceiling:** `LLM_TIMEOUT_MS` capped at 300000 and undici's header/body
  timeout codes classified as `timeout` (author decision; D5, D6, new scenario "A runtime header or body
  timeout is a timeout").
- **A — `UND_ERR_*` in `systemCode`** (author decision; D4, new scenario "A runtime socket failure carries
  its code").
- **A — index guard:** extra tests for `index` `-1` and `0.5`, and `inInputOrder` rejects any index that is
  not a non-negative integer by itself, not only through the schema.
- **A — stale show-spec-working:** addendum with the real `fetch` for the redirect, cut-body, base-URL,
  `usage` and undici behaviours.
- **D — unbounded 2xx body:** Risks above.
- **B — DIS-29 (composition root), one comment:** `LiveLlmConfig.apiKey` is a plain property, so the
  composition root must never log or serialise the configuration; a key with characters `fetch` rejects in
  a header fails every request as `network` (validate it there or here if it shows up); empty `messages`
  and per-request input limits (batching) are the caller's job.
- **A — tasks:** 8.2 count, 13.2 CI evidence, 14.1.
- **D — out-of-scope commits:** already recorded above.

- **A — CI `secrets`** gitleaks flagged the synthetic test key `centinela-secreta-123` (`generic-api-key`,
  spec line 246 and the key-leak test); checked unredacted, allowed by exact value in `.gitleaks.toml`.

- **B — DIS-46 (CM-HU-19):** choose the embedding model; migrate `vector(1536)` if its dimension
  differs, update `EMBEDDING_DIMENSIONS`; correct DIS-5's non-goal. Note already on DIS-46.
- **B — DIS-18 (CM-HU-07.2):** the evaluation adapter that implements `LlmPort` with
  `mode: 'evaluation'` from `EvaluationLlmConfig`, and the budget.
- **D — privacy check, Low:** a key with a remote `http://` URL travels in clear; accepted (Risks).
- **B — DIS-29 / DIS-41, privacy check, Low:** what is sent to a cloud endpoint (repository content) is owned
  there.
- **B — CM-HU-12 (DIS-59):** map `LLM_UNAVAILABLE` and `LLM_CONFIG_INVALID` to the API error shape;
  add `zod` to `packages/api`.
