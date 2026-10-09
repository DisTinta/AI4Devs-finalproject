## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 Set DIS-17 to In Progress in Linear right away, with a short comment in Spanish (change name `llm-adapter` and branch)
- [x] 0.2 `git fetch` and confirm that `origin/feature/entrega-2-CRN` contains DIS-92 (`packages/cli/src/seed-load.ts` exists there). If not, stop and ask the author which base to use
- [x] 0.3 Create feature branch `feature/DIS-17-llm-adapter` from `origin/feature/entrega-2-CRN` (`docs/project-context.md` → Branch and ticket conventions; `BRANCH_PREFIX=feature/`), carrying the untracked `openspec/changes/llm-adapter/` planning files with it. Leave the upstream unset so a bare `git push` cannot target the delivery branch
- [x] 0.4 Verify branch creation and current branch status (`git status`, `git branch --show-current`)
- [x] 0.5 Baseline: run `npx vitest run` once, green, and record the totals for the step 11 report; record `git status --porcelain seeds packages/web fixtures` (must be empty) and `sha1sum seeds/graph-dump.sql`

## 1. Core: contract, dimension and error (TDD, design D1–D3)

- [x] 1.1 Create `tests/unit/llm/llm-unavailable.spec.ts` (not a scenario; it backs design D3 and gives Stryker something to kill): `LlmUnavailable` has `code` `LLM_UNAVAILABLE`, keeps `reason`, `status`, `expected`, `received`, keeps `systemCode`, is a `DomainError`, has no `cause`, and its message holds only the reason, those numbers and `systemCode`. RED: see it fail (module missing)
- [x] 1.2 GREEN: `packages/core/src/llm/errors.ts` (`LlmUnavailable`, `LlmUnavailableReason`), `packages/core/src/llm/embedding-dimensions.ts` (`EMBEDDING_DIMENSIONS = 1536`, comment naming the three `vector(1536)` columns), `packages/core/src/llm/llm-request.ts` (`LlmPurpose`, `LlmMessage`, `CompletionRequest`, `CompletionResult`, `EmbeddingResult`), `packages/core/src/llm/index.ts`, export from `packages/core/src/index.ts`. Do **not** edit `packages/core/src/knowledge/` or `packages/core/src/index/` (seed `analyzer-fingerprint` inputs): import `DomainError` from `knowledge/errors.ts` as is. JSDoc on every export
- [x] 1.3 Replace the stub in `packages/core/src/ports/LlmPort.ts` with `{ readonly mode: 'live' | 'evaluation'; complete(request): Promise<CompletionResult>; embed(texts: readonly string[]): Promise<EmbeddingResult> }` (design D1); `npm run typecheck` and `npm run lint:architecture` green

## 2. Adapter: dependency and test wiring (design D7, D8)

- [x] 2.1 `npm install zod@^4 -w @codemind/adapter-llm` (only that workspace; check that `packages/api/package.json` is unchanged and that the root `package-lock.json` diff only adds `zod`)
- [x] 2.2 Add `@codemind/adapter-llm` → `packages/adapters/llm/src/index.ts` to the alias of `vitest.config.ts` and to `paths` in `tests/tsconfig.json`; add the project reference to core in `packages/adapters/llm/tsconfig.json` if `tsc --build` needs it (pattern of `packages/adapters/git/tsconfig.json`)

## 3. Adapter: configuration (TDD, design D5) — requirement "LLM configuration is classified and validated at boot"

- [x] 3.1 Create `tests/unit/llm/llm-config.spec.ts` (pattern of `tests/unit/git/salt-config.spec.ts`). RED: test "No URL and no key selects evaluation mode". See it fail (module missing)
- [x] 3.2 GREEN: `packages/adapters/llm/src/config.ts` with `EvaluationLlmConfig`, `LiveLlmConfig`, `LlmConfig`, `DEFAULT_LLM_TIMEOUT_MS`, `LlmConfigError` (`LLM_CONFIG_INVALID`, `variable`) and `llmConfigFromEnv(env)` in the check order of design D5
- [x] 3.3 RED → GREEN: test "A URL without a key selects live mode" (base URL stored without trailing `/`; `verifyModel` resolved)
- [x] 3.4 RED → GREEN: test "A key without a URL fails without showing the key"
- [x] 3.5 RED → GREEN: test "A URL without a model fails"
- [x] 3.6 RED → GREEN: test "A malformed timeout or URL fails naming the variable"
- [x] 3.7 RED → GREEN: test "A valid timeout overrides the default". Extra cases (not scenarios): `LLM_MODEL_VERIFY` present → `verifyModel`; `LLM_EMBED_MODEL` trimmed; evaluation mode ignores a malformed `LLM_TIMEOUT_MS`

## 4. Adapter: completions (TDD, design D6, D7) — requirements "Model selection per purpose", "Completion request and response", "Only a live configuration builds the HTTP client"

- [x] 4.1 Create `tests/unit/llm/openai-compatible-llm.spec.ts` with a recording fake `fetch` (url, method, headers, parsed body; scripted replies; call count). RED: test "With a key the completion is sent and parsed". See it fail
- [x] 4.2 GREEN: `packages/adapters/llm/src/response-schemas.ts` (chat schema) and `packages/adapters/llm/src/openai-compatible-llm.ts` with `createOpenAiCompatibleLlm(config: LiveLlmConfig, { fetch? })` and `complete()` (design D6); `embed()` throws `not-configured` for now
- [x] 4.3 RED → GREEN: test "Without a key the completion is sent without Authorization"
- [x] 4.4 RED → GREEN: test "A completion without usage reports zero tokens"
- [x] 4.5 RED → GREEN: test "The verify purpose falls back to the generation model"
- [x] 4.6 RED → GREEN: test "An evaluation configuration does not type-check against the client" (`// @ts-expect-error` on the evaluation call, plus the live call in the same test); confirm RED by temporarily typing the parameter as `LlmConfig` and seeing `npm run typecheck` fail on the unused directive, then restore

## 5. Adapter: embeddings (TDD, design D2, D6, D7) — requirement "Embedding request, order and dimension" and the embeddings scenario of "Model selection per purpose"

- [x] 5.1 RED → GREEN: test "Embeddings are returned in input order" (embeddings schema; order by `index`)
- [x] 5.2 RED → GREEN: test "Embeddings with missing or duplicated indexes are an invalid response" (one vector for two texts; indexes `[0, 0]`; indexes `[0, 2]`)
- [x] 5.3 RED → GREEN: test "Embeddings without usage report zero tokens"
- [x] 5.4 RED → GREEN: test "Embeddings for no texts send nothing"
- [x] 5.5 RED → GREEN: test "A vector of another dimension is rejected"
- [x] 5.6 RED → GREEN: test "Without an embedding model, embeddings fail and completions work"

## 6. Adapter: failures and the key (TDD, design D4, D6) — requirements "Endpoint failures map to one error", "The API key never leaks"

- [x] 6.1 RED → GREEN: test "A non-2xx status is reported with the status"
- [x] 6.2 RED → GREEN: test "A body that is not JSON or has another shape is an invalid response"
- [x] 6.3 RED → GREEN: test "A network failure is reported as network" (rejections shaped like Node's `TypeError('fetch failed')` with `cause.code` `ECONNREFUSED`, a free-text code and no code; `systemCode` only for the first, design D4)
- [x] 6.4 RED → GREEN: test "A request that exceeds the timeout is aborted" (`LLM_TIMEOUT_MS=50`, real timers; a fake `fetch` that rejects only on `signal` abort, and a fake that answers `200` at once with a body stream that errors only on `signal` abort; both → `timeout`, design D6)
- [x] 6.5 RED → GREEN: test "Errors never contain the key" (every failure kind of 6.1–6.4 with `centinela-secreta-123` in the body or rejection message; check `message`, `cause`, `JSON.stringify`, `String`)
- [x] 6.6 REFACTOR with the suite green (`/tdd-refactor`): one request helper shared by `complete()` and `embed()`; no behaviour change
- [x] 6.7 `packages/adapters/llm/src/index.ts`: replace the stub with the public exports (`llmConfigFromEnv`, the config types, `LlmConfigError`, `DEFAULT_LLM_TIMEOUT_MS`, `createOpenAiCompatibleLlm`); JSDoc on every export

## 7. Privacy and ethics check

- [x] 7.1 Run `/privacy-ethics-check` over the diff (the key only in `Authorization`; no value in any error or message; no log; model output parsed with Zod; `zod` justified as an AI-suggested dependency). Record the outcome in the step 11 report; fix any finding in this change or classify it (A/B/C/D, `docs/project-context.md` → Tracking deferred findings)

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Identify tests affected by the change: anything importing `LlmPort` or `@codemind/core`'s index (`grep -rn "LlmPort\|adapter-llm" tests packages`); confirm with `git diff --stat origin/feature/entrega-2-CRN -- tests` that only `tests/unit/llm/` and `tests/tsconfig.json` changed
- [x] 8.2 Update affected tests without weakening their assertions. Confirm that each of the 22 `#### Scenario:` of `specs/llm-adapter/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `tests/`; no scenario without a test, no scenario with two)

## 9. Docs and gates before verification

- [x] 9.1 `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage` green; JSDoc on every new export
- [x] 9.2 Confirm the seed fingerprint is untouched: `git diff --stat origin/feature/entrega-2-CRN -- packages/core/src/knowledge packages/core/src/index packages/core/src/ports/AnalyzerPort.ts` is empty (otherwise rerun `npm run seed:build` per `docs/project-context.md` → seed gotcha, as the last commit)

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `.env.example`: Ollama example (`LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=` empty, `LLM_MODEL=<chat model>`, `LLM_EMBED_MODEL=nomic-embed-text` with a comment that it fails with `dimension-mismatch` until DIS-46, `# LLM_TIMEOUT_MS=120000`); keep the evaluation default (URL and key empty) as the shipped values. If reading `.env.example` is denied, stop and ask the author
- [x] 10.2 `readme.md` §1.4: rows for `LLM_EMBED_MODEL` and `LLM_TIMEOUT_MS`; the `LLM_API_KEY` and `LLM_BASE_URL` rows say that `LLM_BASE_URL` decides the mode and that Ollama needs no key; the Ollama `ask` example drops `LLM_API_KEY=ollama`
- [x] 10.3 `docs/backend-standards.md` §1: remove the *target* note on Zod (keep Playwright's)
- [x] 10.4 `docs/project-context.md`: closed decision 2 (`LLM_BASE_URL` decides the mode; evaluation only with URL and key empty); the "infra packages are stubs" gotcha lists `adapters/llm` as implemented (`createOpenAiCompatibleLlm`, `llmConfigFromEnv`, DIS-17); a short LLM adapter gotcha (no `cause` by design, `EMBEDDING_DIMENSIONS` vs `vector(1536)`, `nomic-embed-text` fails until DIS-46); the alias list in Testing includes `@codemind/adapter-llm`
- [x] 10.5 No ADR (design D9); confirm nothing in the implementation contradicted that
- [x] 10.6 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 11. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 11.1 Capture the pre-test baseline: the 0.5 indicators (`git status --porcelain seeds packages/web fixtures`, `sha1sum seeds/graph-dump.sql`); this change has no database state
- [x] 11.2 Run the targeted tests: `npx vitest run tests/unit/llm`, twice (the timeout scenario must not flake)
- [x] 11.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx stryker run --mutate "packages/core/src/llm/**/*.ts"` (score ≥ `MIN_MUTATION_SCORE=70`; list surviving mutants and kill the meaningful ones)
- [x] 11.4 Verify the post-test state matches the baseline (no file under `seeds/`, `packages/web/` or `fixtures/` changed; no `.stryker-tmp/` left behind). Restore and document if not
- [x] 11.5 Create the report `openspec/changes/llm-adapter/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template in `docs/openspec-tasks-mandatory-steps.md` §6, including the 0.5 baseline, the Stryker score and the privacy check of 7.1
- [x] 11.6 Mark complete only after the tests pass and the report exists

## 12. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 12.1 The adapter has no CLI or HTTP entry point yet: exercise it through a throwaway `tsx` script in the session scratchpad (never committed) that calls `llmConfigFromEnv` with an explicit env object and `createOpenAiCompatibleLlm`. Check that Ollama answers on `http://localhost:11434` (`ollama list`); if Ollama is not installed or has no chat model, stop and ask the author before installing anything
- [x] 12.2 Success path: `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY` empty, `LLM_MODEL=<installed chat model>`: `complete()` with one `user` message returns non-empty text, the model and non-zero token counts; the first call after `ollama stop` (cold start) completes within the default timeout
- [x] 12.3 Embeddings against the real server: with `LLM_EMBED_MODEL=nomic-embed-text` (if pulled), `embed(["hola"])` fails with `LLM_UNAVAILABLE`, `dimension-mismatch`, expected `1536`, received `768` — the documented risk, not a success; `embed([])` returns no vectors
- [x] 12.4 Error cases: base URL on a closed port → `network`; an unknown `LLM_MODEL` → `http-status` with Ollama's status; `LLM_TIMEOUT_MS=1` → `timeout`; `LLM_API_KEY=centinela-manual` on a failing request → the printed error never holds `centinela-manual`; configuration errors for a key without URL and for `LLM_BASE_URL=localhost:11434`
- [x] 12.5 No state to restore (no database, no file written outside the scratchpad); delete the scratchpad script and confirm `git status` shows no stray file
- [x] 12.6 Document every command and output in `openspec/changes/llm-adapter/reports/YYYY-MM-DD-12-manual-interface-testing.md` (mask the OS user name in paths)

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 13.1 No user interface uses the adapter yet (DIS-29 / CM-HU-12): record "not applicable; adapter exercised against a real Ollama in step 12" in the step 11 report
- [ ] 13.2 After pushing (switch `gh` to the DisTinta account first, back to Cristina-JumpMath afterwards), confirm in the PR's CI run that `tests/unit/llm/` ran and passed and that the mutation step covered `packages/core/src/llm`. Link the run in the step 11 report

## 14. Pull request preparation

- [ ] 14.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed, the `zod` justification and the Stryker score; after verification, set DIS-17 to In Review in Linear with a comment in Spanish linking the PR and the change

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [ ] 15.2 Run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/llm-adapter/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`)
- [ ] 15.3 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 15.4 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 15.5 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards
