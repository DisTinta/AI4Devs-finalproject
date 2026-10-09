# Verify Against Spec — llm-adapter (DIS-17)

- Date: 2026-10-09
- Run by: `/verify-against-spec` (forked, read-only session; this report is its output, saved by the main session)
- Audited: branch `feature/DIS-17-llm-adapter` (HEAD `3a0390f`) against `origin/feature/entrega-2-CRN`, spec
  `openspec/changes/llm-adapter/specs/llm-adapter/spec.md`

All 22 scenarios have a passing test (`npx vitest run tests/unit/llm` 33/33; `tsc -p tests/tsconfig.json` green).
Remaining: two places where the code does not match the spec text, an unfinished `.env.example`, and seven
behaviours the spec does not define. Destinations of every finding: `design.md` → Follow-ups (addendum below).

## 1. Requirements implemented correctly

| Requirement (spec line) | Code | Test |
|---|---|---|
| Configuration is classified and validated (9–30): trimming, blank = unset (`config.ts:93-96`), mode matrix (`:57-60`), http/https URL (`:84-91`), timeout `^[0-9]+$` 1..2147483647, default 120000 (`:77-82`), `LLM_CONFIG_INVALID` naming the variable, never the value (`:37-46`), nothing else checked in evaluation mode (`:57`) | `packages/adapters/llm/src/config.ts` | `tests/unit/llm/llm-config.spec.ts:18,30,46,57,77,105`, extras `:141`, `:145` |
| Model per purpose (76–83): `verify` → `LLM_MODEL_VERIFY` else `LLM_MODEL` (`config.ts:65`, `openai-compatible-llm.ts:62`); embeddings only `embedModel`, `not-configured` before any request (`openai-compatible-llm.ts:76-77`) | as listed | `openai-compatible-llm.spec.ts:108,248` |
| Completion request and response (103–113): trailing `/` removed (`config.ts:63`), POST `<base>/chat/completions` (`:34`), Content-Type, Bearer only with a key (`:28-29`), body `{model, messages}` without `stream` (`:65`), 2xx only (`:39`), shape (`response-schemas.ts:6-9`), usage default 0 (`:68-72`) | as listed | `openai-compatible-llm.spec.ts:59,82,96` |
| Embeddings, order, dimension (141–154): empty list sends nothing (`:78`), body `{model, input}` without `dimensions` (`:79`), indexes exactly 0..n-1, reordered (`:107-115`), every vector vs 1536 (`:81-85`, `packages/core/src/llm/embedding-dimensions.ts:7`), usage default 0 (`:86`) | as listed | `openai-compatible-llm.spec.ts:151,176,202,221,234` |
| Endpoint failures map to one error (196–203): `http-status` + status (`:39`), `AbortSignal.timeout` over request and body read (`:30,36,45`), `network` + `systemCode` only for `^E[A-Z]+$` (`:97-100`), invalid JSON/shape (`:48-54`); closed reason list (`packages/core/src/llm/errors.ts:4-10`) | as listed | `openai-compatible-llm.spec.ts:303,316,335,355` |
| The API key never leaks (238–242): no `cause`, message from reason and numbers only (`errors.ts:45-65`); key used only for the header (`openai-compatible-llm.ts:29`); config errors carry no values (`config.ts:43`) | as listed | `openai-compatible-llm.spec.ts:365`, `llm-unavailable.spec.ts:61` |
| Only a live configuration builds the client (255–259): parameter typed `LiveLlmConfig` (`openai-compatible-llm.ts:24`); `npm run typecheck` includes `tests/tsconfig.json` (`package.json:21`) | as listed | `openai-compatible-llm.spec.ts:131-140` (`@ts-expect-error` at `:137`) |

## 2. Requirements missing or partial

1. **A connection failure while reading the body is `invalid-response`, not `network`.** Spec 198–199 defines
   `network` as "the request could not be sent or the connection failed"; `openai-compatible-llm.ts:44-45` maps any
   non-timeout `response.text()` failure to `invalid-response`. Design D6 (`design.md:143`) chose this on purpose,
   so design and spec disagree. No test.
2. **"Validated at boot" (line 9) is only half true:** nothing calls `llmConfigFromEnv` at boot yet (only tests);
   the design defers it (`design.md:34-35`).
3. **`.env.example` is not finished** (proposal 37–39; task 10.1 open). `HEAD:.env.example` has neither
   `LLM_EMBED_MODEL` nor `LLM_TIMEOUT_MS`. The uncommitted working-tree edit ships `LLM_API_KEY=ollama`,
   `LLM_BASE_URL=http://localhost:11434/v1` and an empty `LLM_MODEL` (a `.env` copied from it fails at boot with
   `LLM_MODEL`, and it is no longer an evaluation default), keeps the comments "Vacía = modo evaluación" and "Con
   Ollama local: LLM_API_KEY=ollama" (both contradict spec line 17), and sets `LLM_EMBED_MODEL=nomic-embed-text`
   without the `dimension-mismatch` comment.
4. **Two requirement sentences have no test (code complies):** the key only in `Authorization` (240) — nothing
   checks URL and body; "the same `Authorization` rule" for embeddings (144) — no embeddings test checks the header.

## 3. Unspecified behaviour

1. `mode: 'live' | 'evaluation'` on the port (`LlmPort.ts:9`, `openai-compatible-llm.ts:59`, asserted at
   `openai-compatible-llm.spec.ts:71`): in proposal and design D1, not in the spec. DIS-18 needs it.
2. The public `fetch` option (`OpenAiCompatibleLlmOptions`, exported from `index.ts:11`): a test seam from D6/D8
   that became public API.
3. Response validation stricter than the spec (`response-schemas.ts:7-8,14`): every `choices` element validated,
   `usage` fields required as non-negative integers when `usage` is present, `usage: null` rejected. A server with
   `usage: null` or partial usage gets `invalid-response` although its text is valid (design D7, not spec).
4. `embed([])` without `LLM_EMBED_MODEL`: the code throws `not-configured` (`:77` before `:78`); spec 81 and 153
   both seem to apply. No test.
5. Order of configuration checks, one error at a time (`config.ts:58-66`): design D5, not spec.
6. No runtime guard against an evaluation configuration, and `openai-compatible-llm.spec.ts:138` pins
   `.not.toThrow()`. The spec claims "no code path can build an HTTP client from an evaluation configuration"
   (258–259); an `as any` path can.
7. Message format (`errors.ts:49,58-65`) unspecified; `status`, `expected`, `received`, `systemCode` are always own
   properties holding `undefined` (`errors.ts:51-54`), while the spec says "no `systemCode`" (202).

Smaller: a hand-built `LiveLlmConfig` with an invalid `timeoutMs` makes `AbortSignal.timeout`
(`openai-compatible-llm.ts:30`) throw outside the `try`, breaking "Nothing else SHALL escape a request" (201).
Unreachable through `llmConfigFromEnv`.

## Specific checks

- Dependency not in the manifest: none (`zod` in `packages/adapters/llm/package.json:10` and the lockfile).
- Authorisation check: not applicable (outbound client); header rule implemented (`:29`).
- Response fields the spec does not mention: `LlmPort.mode` (3.1), `LlmUnavailable.name`, undefined detail
  properties (3.7). `CompletionResult` and `EmbeddingResult` match the spec.
- Tests asserting less than their scenario: "A network failure is reported as network" (`:350`) uses
  `toBe(undefined)` where the scenario says "absent" (`not.toHaveProperty` would fail today); "No URL and no key
  selects evaluation mode" `{}` case leaves `LLM_MODEL` unset rather than empty (negligible); "Errors never contain
  the key" assertion `:386` is redundant after `:385`.

## Scenario → test → state

| Scenario (spec line) | Test | State |
|---|---|---|
| No URL and no key selects evaluation mode (32) | `llm-config.spec.ts:18` | green |
| A URL without a key selects live mode (39) | `llm-config.spec.ts:30` | green |
| A key without a URL fails without showing the key (46) | `llm-config.spec.ts:46` | green |
| A URL without a model fails (53) | `llm-config.spec.ts:57` | green |
| A malformed timeout or URL fails naming the variable (61) | `llm-config.spec.ts:77` | green |
| A valid timeout overrides the default (70) | `llm-config.spec.ts:105` | green |
| The verify purpose falls back to the generation model (85) | `openai-compatible-llm.spec.ts:108` | green |
| Without an embedding model, embeddings fail and completions work (94) | `openai-compatible-llm.spec.ts:248` | green |
| Without a key the completion is sent without Authorization (115) | `openai-compatible-llm.spec.ts:82` | green |
| With a key the completion is sent and parsed (123) | `openai-compatible-llm.spec.ts:59` | green |
| A completion without usage reports zero tokens (134) | `openai-compatible-llm.spec.ts:96` | green |
| Embeddings are returned in input order (156) | `openai-compatible-llm.spec.ts:151` | green |
| Embeddings without usage report zero tokens (166) | `openai-compatible-llm.spec.ts:202` | green |
| Embeddings for no texts send nothing (172) | `openai-compatible-llm.spec.ts:221` | green |
| A vector of another dimension is rejected (178) | `openai-compatible-llm.spec.ts:234` | green |
| Embeddings with missing or duplicated indexes are an invalid response (186) | `openai-compatible-llm.spec.ts:176` | green |
| A non-2xx status is reported with the status (205) | `openai-compatible-llm.spec.ts:303` | green |
| A body that is not JSON or has another shape is an invalid response (212) | `openai-compatible-llm.spec.ts:316` | green |
| A network failure is reported as network (221) | `openai-compatible-llm.spec.ts:335` | green (asserts less than "absent") |
| A request that exceeds the timeout is aborted (230) | `openai-compatible-llm.spec.ts:355` | green |
| Errors never contain the key (244) | `openai-compatible-llm.spec.ts:365` | green |
| An evaluation configuration does not type-check against the client (261) | `openai-compatible-llm.spec.ts:131` | green |
| *(no scenario)* body-read connection failure → `network` (199) | — | absent |
| *(no scenario)* key only in `Authorization` (240); same rule for embeddings (144) | — | absent |

---

## Addendum — round 2 (after the round-1 fixes)

- Audited: HEAD `90d18b4`, then `f50a7f5` (two docs-only commits in between: `.env.example`, PR description).
- Evidence: `npx vitest run tests/unit/llm` 42/42 (`llm-unavailable` 7, `llm-config` 10, `openai-compatible-llm` 25);
  `tsc -p tests/tsconfig.json` clean.
- **All 26 scenarios have a passing test.** Every round-1 finding is closed or has a destination: 2.1 (code and
  scenario), 2.3 (`.env.example` in `02477d9`: shipped values empty, comments follow spec lines 16–18,
  `LLM_EMBED_MODEL` and a commented `LLM_TIMEOUT_MS` with the `dimension-mismatch` warning), 2.4 (extra tests),
  3.1, 3.3, 3.4, 3.6, 3.7 (spec or code changed), the smaller note (signal inside the `try`).

### Missing or partial

1. The spec's Purpose still says "validated at boot" while the requirement now says "validated when read".
2. The extra test for an invalid hand-built `timeoutMs` asserts only `instanceof LlmUnavailable`, not the reason.

### Unspecified behaviour

1. An invalid hand-built `timeoutMs` surfaces as `network` (the `RangeError` of `AbortSignal.timeout` is not an
   abort); unreachable through `llmConfigFromEnv`.
2. HTTP redirects are followed (`fetch` without `redirect`): a 301/302/303 turns the POST into a GET to another
   URL and a 2xx there is accepted; the spec says "one `POST`" and only 2xx.
3. `LLM_BASE_URL` accepts `http:x`, a query or fragment (`http://h/v1?k=1` → `…?k=1/chat/completions`) and
   userinfo (which Node's `fetch` refuses, so every request fails as `network`).
4. The body of a non-2xx response is neither read nor cancelled.
5. The two out-of-scope commits (`0057fb3`, `b21adce`) are in the PR description but have no destination in
   `design.md` → Follow-ups.

Also low impact: the message texts of `LlmUnavailable` and `LlmConfigError` are not in the spec; `isAbort` treats
any `AbortError`/`TimeoutError` as ours (only one signal exists). Documentation drift: the `.gitleaks.toml`
description names lines 246/367; the key now sits at spec line 290 and test line 527 (the rule matches the exact
value, so it still works).

Specific checks: no dependency outside the manifest; header rule implemented and tested; result shapes match the
spec; "An evaluation configuration does not type-check against the client" is only enforced when
`npm run typecheck` runs (CI and locally).
