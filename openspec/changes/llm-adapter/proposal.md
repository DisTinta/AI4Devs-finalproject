## Why

CM-HU-07 (DIS-7) puts every language model behind a port, so that the rest of CODEMIND talks to
Ollama or to any OpenAI-compatible provider without knowing the vendor, and so that evaluation costs
0 € without an account. Today that port does not exist: `LlmPort` is an empty interface and
`packages/adapters/llm` is an `export {}` stub, which blocks the explanation (DIS-29), the evidence
verifier (DIS-56), usage metrics (DIS-57), the API (DIS-59) and the semantic cache (DIS-46). This is
DIS-17 (CM-HU-07.1): the contract, the OpenAI-compatible HTTP client for `chat/completions` and
`embeddings`, and an LLM configuration validated at boot, with Ollama (no key) as the real
development environment. The evaluation adapter and the daily budget are DIS-18 (CM-HU-07.2).

## What Changes

- **`LlmPort` gets its real contract** (`packages/core/src/ports/LlmPort.ts`):
  `complete(request) → { text, usage: { inputTokens, outputTokens }, model }`,
  `embed(texts) → { vectors, usage: { inputTokens } }` and `mode: 'live' | 'evaluation'`.
  `CompletionRequest` is `{ messages: readonly { role: 'system' | 'user' | 'assistant'; content }[];
  purpose: 'answer' | 'verify' }`, with no `temperature` or `maxTokens` yet.
- **New in core** (`packages/core/src/llm/`): the request/result types, `EMBEDDING_DIMENSIONS = 1536`
  as the single source of the embedding dimension (aligned with the `vector(1536)` columns of
  `graph-schema`), and the domain error `LlmUnavailable` (`LLM_UNAVAILABLE`) with a closed `reason`:
  `http-status`, `invalid-response`, `network`, `timeout`, `not-configured`, `dimension-mismatch`.
- **LLM configuration validated at boot** (`packages/adapters/llm/src/config.ts`):
  `llmConfigFromEnv(env)` returns `EvaluationLlmConfig` or `LiveLlmConfig`. `LLM_BASE_URL` decides the
  mode: URL and key both empty → `evaluation`; URL set → `live`, with the key optional (Ollama needs
  none). A key without URL, a URL without `LLM_MODEL`, a URL that is not `http`/`https` or a
  `LLM_TIMEOUT_MS` that is not a positive integer up to 2147483647 fails with `LlmConfigError`
  (`LLM_CONFIG_INVALID`), which names the variable and never its value. `LLM_MODEL_VERIFY` falls back
  to `LLM_MODEL`; `LLM_EMBED_MODEL` has no fallback.
- **OpenAI-compatible HTTP client** (`packages/adapters/llm/src/openai-compatible-llm.ts`):
  `createOpenAiCompatibleLlm(config: LiveLlmConfig, { fetch? })` over Node 20 `fetch` (injectable,
  no vendor SDK). `Authorization: Bearer <key>` only when a key is set. Every request carries an
  `AbortSignal` timeout (`DEFAULT_LLM_TIMEOUT_MS = 120000`, overridable with `LLM_TIMEOUT_MS`).
  Responses are validated with Zod `safeParse`; every failure maps to `LlmUnavailable` without the
  key or the raw response body. `embed()` checks every vector against `EMBEDDING_DIMENSIONS` and
  never sends `dimensions`.
- **Two new environment variables**, both optional: `LLM_EMBED_MODEL` and `LLM_TIMEOUT_MS`, added to
  `.env.example` (with an Ollama example: URL set, key empty) and to the variables table of
  `readme.md` §1.4, whose `LLM_API_KEY` row and Ollama `ask` example drop the `ollama` placeholder.
- **Dependency**: `zod`, only in `packages/adapters/llm` (the only package that parses in this
  ticket); the *target* note on Zod in `docs/backend-standards.md` §1 is removed.

## Non-goals

- The evaluation adapter that never calls (`evaluation-llm.ts`), the zero-traffic guarantee in
  evaluation mode, the daily budget, the cost table and `StorePort.sumCostSince` (DIS-18). This
  change only **classifies** the mode.
- **Choosing the embedding model or changing the schema's dimension.** Known risk: with Ollama,
  `embed()` fails with `dimension-mismatch` against `EMBEDDING_DIMENSIONS = 1536`
  (`nomic-embed-text` returns 768) until CM-HU-19 (DIS-46) picks the model and migrates the
  `vector(1536)` columns. This change only validates the dimension and does not demonstrate
  `embed()` live.
- Sending the `dimensions` parameter; streaming; automatic retries; non-OpenAI-compatible vendors.
- Explanation and verification prompts (DIS-29, DIS-56); mapping `LlmUnavailable` to HTTP (CM-HU-12).
- `zod` in `packages/api` (CM-HU-12 adds it when the API parses something).
- Tests against a real Ollama inside `npx vitest run`.

## Privacy and logging impact

The API key is a secret: it only travels in the `Authorization` header and never appears in an error
message, `cause`, serialisation or log; configuration errors name variables, never values. The
adapter logs nothing. Model output is untrusted input (Zod `safeParse`, never an instruction). No
personal data is sent by this change: it has no caller yet, and what later callers send to the model
(repository content) is the concern of DIS-29 / DIS-41. `/privacy-ethics-check` runs during apply.

## Capabilities

### New Capabilities

- `llm-adapter`: the `LlmPort` contract, the LLM configuration matrix validated at boot, the
  OpenAI-compatible completion and embedding requests, the embedding-dimension check and the error
  mapping that never leaks the key.

### Modified Capabilities

(none)

## Impact

- Code (core): `packages/core/src/ports/LlmPort.ts` (real contract over the stub); new
  `packages/core/src/llm/{llm-request,embedding-dimensions,errors,index}.ts`, exported from
  `@codemind/core`.
- Code (adapter): `packages/adapters/llm/src/{config,openai-compatible-llm,response-schemas,index}.ts`.
- Dependencies: `zod` in `packages/adapters/llm/package.json` (justified in the PR).
- Test wiring: alias `@codemind/adapter-llm` in `vitest.config.ts` and `tests/tsconfig.json`.
- Tests: `tests/unit/llm/{llm-config,openai-compatible-llm,llm-unavailable}.spec.ts`, with
  `fetch` mocked at the HTTP boundary (backend-standards §7).
- Mutation: the new core files are mutated by Stryker; the adapter is outside `mutate` and is covered
  by unit tests.
- Docs: `.env.example`, `readme.md` §1.4, `docs/backend-standards.md` §1, `docs/project-context.md`
  (`adapters/llm` no longer a stub; closed decision 2: `LLM_BASE_URL` decides the mode), `prompts.md`.
- Linear: DIS-17; parent DIS-7 (comment already left on the mode rule); DIS-46 owns the embedding
  model and the dimension migration.
