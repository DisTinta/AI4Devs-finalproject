## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 Feature branch `feature/dis-104-answer-language` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/answer-language/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch)
- [ ] 0.2 Confirm DIS-104 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `answer-language` and the branch `feature/dis-104-answer-language`
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline: `npx vitest run` once (integration database as `docs/TESTING.md` says) and record the totals; `npm run verify` exits `0` on the author's local database; in that database record, for acme-shop, `SELECT count(*) FROM claim`, `FROM query_log`, and `SELECT count(*), sum(hit_count) FROM cache_entry` (re-checked in 8.4)

## 1. Live measurement with the current prompt (MANDATORY - AGENT MUST EXECUTE; design D5, before any source change)

- [ ] 1.1 Check the local model: `curl -s http://localhost:11434/api/tags` lists `qwen2.5-coder`; record `ollama --version`. If Ollama does not answer, record it, apply the design D5 fallback (destination C: Spanish checklist comment on DIS-104 and a Follow-ups line) and skip 1.2-1.4 and 7.1-7.3
- [ ] 1.2 Start the API with `npm run dev` in the background, with `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=qwen2.5-coder`, `LLM_API_KEY=` and `LLM_TIMEOUT_MS=1200000` in that command's environment (never reading or editing `.env`); ports 3000/5173 free first; wait for it with `Monitor`
- [ ] 1.3a Send `¿Qué hace DiscountService?` with `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` and body `{"question": "…", "useCache": false}`, in the background, waited with `Monitor`; record the end-to-end duration, the response body (with `usage.verification.calls`) and the `explain event` lines of the API log for it. No integration test runs meanwhile
- [ ] 1.3b Same as 1.3a with `¿Qué hace ShippingService?`
- [ ] 1.3c Same as 1.3a with `¿Qué hace TaxService?`
- [ ] 1.4 Stop the API (its process tree). Start `openspec/changes/answer-language/reports/YYYY-MM-DD-language-measurement.md` with the "before" half: machine, Ollama version, model, settings, commands, for each question the `answer` and statements, the language the agent reads in each and the rule's decision, the duration and `usage.verification.calls`. Restoration deferred to 8.3 (one reseed after both runs); step 6 runs against a database that still holds the 1.3 rows

## 2. Language rule (TDD; spec "Question and answer language", design D1)

- [ ] 2.1 RED: create `tests/unit/explain/question-language.spec.ts` with "The language rule decides Spanish, English or nothing" (the exact inputs and results of both WHEN/THEN pairs of the scenario: quotes and brackets stripped, repeated edge punctuation, all-caps words, a backtick pair, an unmatched backtick) plus a table test over every word of both lists (one Spanish signal plus `¿` gives `es`; two English list words give `en`) and the code-token cases (`PriceCalculator::compute`, `snake_case`, `v2`, a backtick span). See it fail (module missing)
- [ ] 2.2 GREEN: `packages/core/src/explain/question-language.ts` with `detectLanguage(text): TextLanguage | null` and `TextLanguage`, exported from `packages/core/src/explain/index.ts`; TSDoc citing DIS-104 design D1; no new dependency; `npx vitest run tests/unit/explain/question-language.spec.ts` green
- [ ] 2.3 REFACTOR with the suite green; `npm run typecheck`, `npm run lint`

## 3. Spanish system message (TDD; spec "Prompt and evidence ids", design D2)

- [ ] 3.1 RED: create `tests/unit/explain/prompt-language.spec.ts` with "A Spanish question gets the explicit Spanish instruction" (system message equal to the nine literal lines of the delta spec joined by `\n`, no `Answer in the language of the question.`, hash equal to the SHA-256 of `JSON.stringify(messages)`) and "An English or undecided question keeps the generic system message" (`price`, `q`, `How is the price computed?`: system message equal to `EXPLAIN_SYSTEM_PROMPT` and to its eight literal lines). See the first fail
- [ ] 3.2 GREEN: `packages/core/src/explain/prompt.ts` — `EXPLAIN_SYSTEM_PROMPT` unchanged byte for byte, new exported `EXPLAIN_SYSTEM_PROMPT_ES`, `buildPrompt` chooses by `detectLanguage(sanitized.question)`, `ExplainPrompt.questionLanguage`; TSDoc and the header comment updated; `npx vitest run tests/unit/explain` green with `tests/unit/explain/prompt.spec.ts` and `tests/unit/explain/explain.spec.ts` untouched

## 4. Language event (TDD; spec "Question and answer language" and "Explain events and logging", design D3, D4)

- [ ] 4.1 RED: create `tests/unit/explain/explain-language.spec.ts` (doubles of `tests/support/explain-doubles.ts`, used as they are) with "An English answer to a Spanish question is reported and still returned" (asserting `persisted: true` and one cache save under the question's key), "No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN" (the seeded cache entry, `useCache: false` where the scenario says so, and the five answers including the `no-evidence` and the `broken-evidence` `UNKNOWN`) and "The language event follows the verification events and precedes the write events". See them fail
- [ ] 4.2 GREEN: `packages/core/src/explain/explain-event.ts` — `AnswerLanguageMismatchEvent` in the `ExplainEvent` union (TSDoc: codes only); `packages/core/src/explain/explain.ts` — the language events computed after the `broken-evidence` return and passed as `[...events, ...languageEvents]` only to `storedAnswer` / `unsavedAnswer`, only when the prompt language is `es` and the `answer` reads `en`; `isCacheable` unchanged; the TSDoc of `explain` names the new event and its place in the order
- [ ] 4.3 REFACTOR with the suite green; `npx vitest run tests/unit/explain tests/unit/api tests/unit/cli`, `npm run typecheck`, `npm run lint`, `npm run lint:architecture`

## 5. Review and Update Existing Tests (MANDATORY)

- [ ] 5.1 Review the tests that pin the prompt or the exact events of a Spanish question: `tests/unit/explain/prompt.spec.ts` ("sends the explain instruction verbatim as the system message", question `q`), `tests/unit/explain/explain.spec.ts` ("Each span of the pack gets one evidence id in rank order", question `price`), `tests/unit/explain/explain-sanitization.spec.ts`, `tests/unit/explain/explain-cache.spec.ts` (including "A cached question is answered from the cache in both modes", whose all-caps question is now Spanish but is a cache hit, so no prompt is built), `tests/unit/explain/explain-verification.spec.ts`, `tests/unit/explain/usage.spec.ts`, `tests/unit/api/ask.spec.ts` ("Requests to one API share verification verdicts", answer `The final price.`: one English signal, no decision, so no event), `tests/integration/api/ask.spec.ts` (the all-caps question answered from the cache) and `tests/integration/explain/explain.spec.ts` (the stored `promptHash` equals the hash of the messages sent). Expected: none changes, because their questions are English or undecided, are answered from the cache, or their fake answers (`ok`, `La respuesta.`, `statement 1`) give no `en` decision. If one fails, fix the code, not the test, unless the delta spec changes what it pins; then change only that assertion, never weakening it, and record why in the step 6 report
- [ ] 5.2 Every `#### Scenario:` of the delta maps to a test of the same name: the three new ones of "Question and answer language" (2.1, 4.1), the two new ones of "Prompt and evidence ids" (3.1), "The language event follows the verification events and precedes the write events" (4.1); the scenarios copied unchanged keep their existing tests

## 6. Run Tests and Verify Data State (MANDATORY)

- [ ] 6.1 Targeted: `npx vitest run tests/unit/explain tests/unit/api/ask.spec.ts tests/unit/cli/ask-command.spec.ts`
- [ ] 6.2 Broader: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [ ] 6.3 `npm run test:mutation` (score >= 80 on the changed core files; kill or justify survivors with tests in the new spec files only), in the background with `Monitor`
- [ ] 6.4 `npm run verify` (the database still holds the 1.3 rows; restoration is in 8.3)
- [ ] 6.5 `/privacy-ethics-check` over the diff: the event carries only `type` and `expected`; no question or answer text reaches a log
- [ ] 6.6 Report `openspec/changes/answer-language/reports/YYYY-MM-DD-6-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6; "no dependency installed: no npm package check needed")

## 7. Live measurement with the new prompt (MANDATORY - AGENT MUST EXECUTE; design D5)

- [ ] 7.1 Start the API as in 1.2 on the implemented branch
- [ ] 7.1a Same as 1.3a with `¿Qué hace DiscountService?` (an `answer_language_mismatch` line in the log when the answer is still English)
- [ ] 7.1b Same as 1.3a with `¿Qué hace ShippingService?`
- [ ] 7.1c Same as 1.3a with `¿Qué hace TaxService?`
- [ ] 7.2 `npm run cli -- ask acme-shop "¿Qué hace DiscountService?"` with the same `LLM_*` variables in the command's environment, in the background with `Monitor`, timed; keep the full output for `docs/DEMO.md` (design D6). Stop the API
- [ ] 7.3 Complete the measurement report: the "after" half, a table per question (before/after: language of `answer` and of each statement by the agent's reading and by the rule, events, duration, `usage.verification.calls`), each pair's label and the aggregate conclusion by the classification of design D5 (prompt, model, both, not reproduced, regression; inconclusive), saying that three pairs are a small sample. A "regression" label is also recorded as a finding in `design.md` → Follow-ups

## 8. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 The interfaces this change touches are the `explain` events written by the API and the CLI; both were exercised live in 1.3, 7.1 and 7.2. Also exercise, with the API in evaluation mode (no `LLM_*` variables): `¿Qué hace DiscountService?` with `useCache: false` answers `UNKNOWN` `llm-required` with no event; a golden question (`¿Cómo se validan los cupones?`) answers from the cache with no `answer_language_mismatch` line in the log
- [ ] 8.2 Error cases unchanged: an empty question gives `400`; an unknown project id gives `404`
- [ ] 8.3 Restore the author's database: `npm run db:seed` (deletes by cascade the live rows of acme-shop and reloads the seed and the golden cache), then `npm run verify` exits `0`
- [ ] 8.4 Re-check the 0.4 counts (equal to the baseline after the reseed, or the difference explained); list any acme-shop rows of the 0.4 baseline that the reseed removed; report `openspec/changes/answer-language/reports/YYYY-MM-DD-8-manual-interface-testing.md` with every command and response

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 Not applicable to the web: the event is not shown in the web or in the public API response (non-goal). The end-to-end path of the change (CLI and API against the real model) is covered by 1.3, 7.1 and 7.2; state it in the step 8 report

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/DEMO.md` → `Probar con un modelo real`: replace the pasted output with the 7.2 output, add one sentence in Spanish on `answer_language_mismatch`, update `Cómo se capturó` (date, model, duration); `npx vitest run tests/unit/docs` green
- [ ] 10.2 `docs/project-context.md`: the event list of `explain` gains `answer_language_mismatch` (codes only, `info` level, never on a hit or an `UNKNOWN`; the answer stays cacheable) and the language rule of `question-language.ts`
- [ ] 10.3 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-104 prompts with its Índice entry in the same edit
- [ ] 10.4 ADR not warranted (design D7): record it in the step 6 report (6.6)

## 11. Pull request preparation

- [ ] 11.1 `/pr-describe` in Spanish against `final-project-CRN`: the Why marked as the agent's text, the measurement table and its conclusion, the non-goals, no dependency added, existing tests unchanged (or the one changed and why)

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Open the PR against `final-project-CRN`; DIS-104 to In Review with a Spanish comment linking it
- [ ] 12.2 CI green (wait with `Monitor`); link the run in an addendum to the step 6 report (6.6)
- [ ] 12.3 `/show-spec-working` (may reuse the 1, 7 and 8 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 12.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 12.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`, commit it to the same PR; merge (`gh pr merge <n> --merge`, through the merge gate) only after the archive commit and with CI green
