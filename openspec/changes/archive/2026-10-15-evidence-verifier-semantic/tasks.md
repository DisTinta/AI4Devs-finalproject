## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: set DIS-70 to In Progress in Linear, with a short comment in Spanish (change `evidence-verifier-semantic`, branch `feature/DIS-70-evidence-verifier-semantic`)
- [x] 0.2 Feature branch `feature/DIS-70-evidence-verifier-semantic` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `origin/feature/entrega-2-CRN` (b9f3953) during `/opsx:propose` with no upstream; confirm the upstream is still unset, so a bare `git push` cannot target the delivery branch, and that `openspec/changes/evidence-verifier-semantic/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, stop and ask the author whether to rebase
- [x] 0.3 Verify branch creation and current branch status (`git status`, `git branch --show-current`); `.claude/sdd-harness.env` carries a local `KIT_PROTECT_SPECS="0"` that is never staged
- [x] 0.4 Baseline: run `npx vitest run` once, green, and record the totals for the step 10 report; record `SELECT count(*) FROM project`, `FROM claim`, `FROM evidence`, and `SELECT verification, count(*) FROM evidence GROUP BY 1` in the local database

## 1. Core: shared untrusted-text module (design S2)

- [x] 1.1 Refactor with the suite green: move `neutralise` and `wrap` from `packages/core/src/explain/prompt.ts` to `packages/core/src/explain/untrusted-text.ts` (exported `neutralise`, `wrapUntrusted`, JSDoc on both); `prompt.ts` imports them. `npx vitest run tests/unit/explain` stays green with the same totals and the same prompt hashes, no test edited

## 2. Core: events, limits and types (design S7)

- [x] 2.1 `packages/core/src/explain/explain-event.ts`: `ENTAILMENT_UNVERIFIED_REASONS`, `EntailmentUnverifiedReason`, `EntailmentUnverifiedEvent` (JSDoc: no statement, excerpt, output or hash), `ExplainEvent` widened
- [x] 2.2 `packages/core/src/explain/limits.ts`: `MAX_VERIFY_OUTPUT_BYTES = 1_024` with its JSDoc
- [x] 2.3 `npm run typecheck` passes and `npx vitest run tests/unit/explain tests/unit/verify` stays green (no behaviour change yet)

## 3. Core: verification cache (TDD, design S3) — `evidence-verification` → "Verification cache"

- [x] 3.1 RED: create `tests/unit/verify/verification-cache.spec.ts` (spec header comment as in `syntactic.spec.ts`, one `describe` per requirement) with test "The in-memory cache evicts the least recently used key" (eviction, re-storing a held key evicts nothing, and the `RangeError` for 0, -1, 1.5, `NaN`, `2 ** 53`). See it fail
- [x] 3.2 GREEN: `packages/core/src/verify/verification-cache.ts` (`VerificationCache`, `MAX_VERIFICATION_CACHE_ENTRIES`, `createInMemoryVerificationCache`), exported from `verify/index.ts`; JSDoc on every export
- [x] 3.3 `packages/core/src/verify/verify-prompt.ts` (`VERIFY_SYSTEM_PROMPT` as in design S4, `buildVerifyMessages`) and `verificationKey(pair)` in `verification-cache.ts` (SHA-256 of the serialised messages, design S3), JSDoc on every export; their behaviour is pinned by the tests of step 4 (4.4, 4.10, 4.11)

## 4. Core: semantic check (TDD, design S1, S4) — `evidence-verification` → "Semantic citation check", "Verification cache"

- [x] 4.1 Extend `tests/support/scripted-llm.ts` (design S10): `options.verify` (default `{"entails":true}`), `answerUsage`, `verifyUsage`, `verifyModel`, `VerifyView`, `verifyRequests`, `isAbout`; a `verify` request pushes `'verify'` into `order`, an `answer` request keeps pushing `'complete'`; requests with `purpose: 'answer'` behave as today, so the existing suites stay green unchanged
- [x] 4.2 RED: create `tests/unit/verify/semantic.spec.ts` with test "Each distinct pair is verified once in order" (including the requests-in-flight check of design S10). See it fail
- [x] 4.3 GREEN: `packages/core/src/verify/semantic.ts` (`EntailmentPair`, `EntailmentVerdict`, `VerificationUsage`, `verifyEntailment`), exported from `verify/index.ts`; JSDoc on every export
- [x] 4.4 RED → GREEN: test "The verifier receives only the wrapped statement and excerpt" (if it passes at once because 3.3 already wrote the code, record it as a characterisation test in the step 10 report)
- [x] 4.5 RED → GREEN: test "Only a conforming output entails" (the 1 024 / 1 025-byte bound; only accepted outputs cached)
- [x] 4.6 RED → GREEN: test "An unavailable verifier degrades the remaining pairs" (`LlmUnavailable`, then `BudgetExhausted`; one request each; cached pair still `entailed`)
- [x] 4.7 RED → GREEN: test "Other verifier failures propagate"
- [x] 4.8 RED → GREEN: test "Evaluation mode verifies nothing" (a spy cache records no `get`/`set`)
- [x] 4.9 RED → GREEN: test "The usage counts only the verifier's resolved calls" (a cost table passed as the fourth argument)
- [x] 4.10 RED → GREEN: tests "A cached pair is not verified again" and "A changed statement or excerpt misses the cache" (characterisation tests if they pass at once, recorded in the step 10 report)
- [x] 4.11 RED → GREEN in `tests/unit/verify/verification-cache.spec.ts`: test "The cache holds no text" (a recording wrapper of the in-memory cache, design S3; characterisation test if it passes at once, recorded in the step 10 report)
- [x] 4.12 `npm run lint:architecture` green: `verify/` imports no I/O module and not `explain/index.js`

## 5. Core: entailment policy and `verifyAnswer` (TDD, design S5, S6) — `evidence-verification` → "Entailment policy over verified statements", "Output policy over typed statements"

- [x] 5.1 RED: in `tests/unit/verify/policy.spec.ts`, test "A fact needs every citation entailed". See it fail
- [x] 5.2 GREEN: `VerifiedStatement` in `packages/core/src/explain/claim-items.ts`; `applyEntailment` in `packages/core/src/verify/policy.ts` (calls `typeStatement` again, design S5); update the module comment of `policy.ts` (a `cited` citation now caps the type)
- [x] 5.3 RED → GREEN: tests "An entailed heuristic statement stays an inference" and "No statement is dropped for a cited citation"
- [x] 5.4 Re-run unchanged the three scenarios of "Output policy over typed statements" (their behaviour does not change; only the requirement's last paragraph does)
- [x] 5.5 RED → GREEN in `tests/unit/verify/verify-answer.spec.ts` (extra, design S6): pairs built in statement then citation order with the span's text and truncation mark; `entailment_unverified` events after the `evidence_broken` ones, with `statementIndex` the index among the kept statements; no model call and zero usage when every citation is broken. GREEN: `verifyAnswer({ source, llm, cache }, …)` returning `{ statements, events, usage }`; rewrite its module comment and JSDoc (no more "the seam where DIS-70 adds…"); update the call site in `explain.ts` to the new signature with a temporary `cache: createInMemoryVerificationCache()` until 6.3 wires `deps.verificationCache`, so the `explain` suites stay runnable and 6.2 fails for the right reason; and update the five existing tests of `tests/unit/verify/verify-answer.spec.ts` to the new signature and result, so the file is green at the end of this task (existing tests that assert on `verify`-sensitive counts, `order` or `cited` stay red until step 8, which edits them because the spec changed: in `tests/unit/explain`, `tests/unit/cli/ask-command.spec.ts`, `tests/integration/explain/explain.spec.ts` and `tests/integration/cli/ask-command.spec.ts`; from 6.3, `ask.ts` until 7.1 and the inline `explain` deps of the integration suite until 8.2d throw, because `verificationCache` is missing)

## 6. Core: `explain` wiring (TDD, design S7, S8) — `explain` → "Precedence and UNKNOWN answers", "Answer with typed statements", "Persistence failure", "Explain events and logging"

- [x] 6.1 Extend `tests/support/explain-doubles.ts` `doubles()` with `verificationCache` (fresh `createInMemoryVerificationCache()` by default) in `deps` and the `verify` / usage options forwarded to the scripted model (design S10)
- [x] 6.2 RED: in `tests/unit/explain/explain-verification.spec.ts`, test "Citations that support their statement are entailed and facts" (stored and `ClaimWriteFailed` runs). See it fail
- [x] 6.3 GREEN: `ExplainDependencies.verificationCache` (replaces the temporary cache of 5.5); `explain.ts` passes `{ source, llm, cache }` to `verifyAnswer`; `storedAnswer`/`unsavedAnswer` use `statement.verification` and set `usage`; `toClaimItems` writes `evidenceVerifications[j]`; `AnswerStatement.verification: 'cited' | 'entailed'`, `AnsweredCommon.usage` (JSDoc rewritten, the DIS-70 comments of `explain-answer.ts` and `claim-items.ts` removed)
- [x] 6.4 RED → GREEN: test "A valid but irrelevant citation is cited and never a fact" (including the provenance statement types `INFERENCE` and the prior claim of S1 shown `INFERENCE` on a second explain, design S13 Q4)
- [x] 6.5 RED → GREEN: test "A cached pair is not verified again by a second answer"
- [x] 6.6 RED → GREEN: test "An invalid verifier output degrades its pair to cited"
- [x] 6.7 RED → GREEN: test "An unavailable verifier degrades every uncached pair and the answer is stored" (`LlmUnavailable`, then `withDailyBudget` over a store whose `sumCostSince` reaches the ceiling after the `answer` call)
- [x] 6.8 RED → GREEN: test "A verifier failure other than unavailable or budget propagates without writing"
- [x] 6.9 RED → GREEN: test "An unsaved answer carries its verification, usage and unverified events"
- [x] 6.10 RED → GREEN: test "Entailment unverified events follow the evidence broken events and carry no content" (two sentinels; S0 dropped as broken, so `statementIndex` 0 names the model's second statement)
- [x] 6.11 Rewrite the JSDoc of `explain` (pipeline steps 11–13, the `verify` calls, which verifier errors propagate) and of `UnknownExplain` if it mentions verification

## 7. CLI: cache per run and event level (TDD, design S9) — `cli-ask` → "Ask answer output"

- [x] 7.1 RED → GREEN: in `tests/unit/cli/ask-command.spec.ts`, test "Explain receives a new verification cache per run"; `ask.ts` creates `createInMemoryVerificationCache()` per run and passes it to `explain`
- [x] 7.2 RED → GREEN: test "An unverified entailment is logged as information" (no code change expected beyond the JSDoc of the command; if it passes at once, record it as a characterisation test in the step 10 report)

## 8. Backend: Review and Update Existing Tests (MANDATORY)

- [x] 8.1 Identify the tests affected by the change: `grep -rn "verification\|'cited'\|requests).toHaveLength\|requests.length\|purpose\|ExplainDependencies\|verifyAnswer(\|toClaimItems(\|order).toEqual\|during).toHaveLength\|requests\[\|answered(\|llm: model.llm" tests/`
- [x] 8.2 Update, because the spec changed (not to make the suite pass), and without weakening any other assertion, one file per sub-task, each followed by its own `npx vitest run <file>`; list every edited existing test with the reason in the step 10 report:
  - [x] 8.2a `tests/unit/explain/explain.spec.ts`: the modified scenarios "An answer written after a re-index is stored stale", "A failed write still answers, unsaved and without leaking" (verification `cited` → `entailed`, rows `entailed`, `verify` request counts), "A discarded model output is unknown and carries its event", "An output without statements is unknown with no evidence" (no `verify` request), "Model failures propagate without writing" (the `answer` call), "Explaining writes nothing to the console" (plus an invalid verifier output); "The subject of a claim is the symbol of its first cited span" (the new `toClaimItems` parameter, per-span verification); "Prior claims show their displayed type and stale warning" (its `order` assertion gains the `'verify'` entries, design S10 — a test-double change, not a spec change); and the non-scenario tests "builds the pack with the hops and budget of the request" (`sentSpans` reads only the `purpose: 'answer'` requests, so its second request is the second `answer`) and "stores each statement as an L2 inference that keeps its statement type" (`'cited'` → `'entailed'`)
  - [x] 8.2b `tests/unit/explain/explain-verification.spec.ts`: "Cited spans are verified in one read at the pack's commit", "A broken citation is neither stored nor shown", "An unsaved answer keeps only its verified citations", "Every citation broken is unknown with broken evidence" (no `verify` request, no `usage`), "Evidence broken events follow the sanitisation events and carry no content"
  - [x] 8.2c `tests/unit/verify/verify-answer.spec.ts`: done in 5.5; re-run the file
  - [x] 8.2d `tests/integration/explain/explain.spec.ts`: "An answer with evidence is typed, stored and returned" (rows `entailed`, `verify` requests) and "A failed write over the database still answers without leaking" (its inline `explain` deps gain `verificationCache: createInMemoryVerificationCache()`; it then makes one `verify` request), and the shared helper `explainQ1` (its deps gain `verificationCache`; the purposes it asserts become `['answer', 'verify', 'verify']`), which "A fact is stored as an inferred claim that keeps its type" also goes through
  - [x] 8.2e `tests/integration/cli/ask-command.spec.ts`: "A typed answer is printed with its evidence and stored" (rows `entailed`, and its `result.model.requests` length 1 → 1 `answer` + 2 `verify`) and "answers through the default pool without holding a transaction while the model answers" (its `during` wrapper counts only `purpose: 'answer'` calls, design S10)
  - [x] 8.2f `tests/unit/cli/ask-command.spec.ts`: the helpers `answered()` (gains `usage: { verification: { calls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 } }`) and `statement()` (`verification: 'entailed'` for its `FACT`, the only combination D1 allows), which the printing scenarios share; and the non-scenario test "resolves a sample's relative root path against the repository root" (its `model.requests` count filtered to `purpose: 'answer'`)
- [x] 8.3 Re-run unchanged the existing tests of the other scenarios of the modified requirements ("A question without anchor…", "Evaluation mode answers llm-required…", "A pack where nothing fits…", "A failing prior-claims read…", "An unknown project or an unindexed one…", "A verification read failure propagates…", "No verification read without statements", "The question is anchored once", "A fact is stored as an inferred claim…", "The evidence of a stored answer lists every citation in order", "Other write errors propagate", "Sanitisation events come first…", "No sanitisation event without a prompt", both of `claims-and-typing` "Statement typing…", and the other scenarios of `cli-ask` "Ask answer output")
- [x] 8.4 Confirm that each `#### Scenario:` of the four delta specs maps 1:1 to a test with exactly the same name (grep each title in `tests/`)

## 9. Core: refactor

- [x] 9.1 With the suite green after step 8, refactor `verify/*.ts`, `explain.ts` and `scripted-llm.ts` for naming and duplication only (no behaviour change, no test edits); `npx vitest run tests/unit/verify tests/unit/explain tests/unit/cli` stays green

## 10. Backend: Run Tests and Verify Data State (MANDATORY)

- [x] 10.1 Capture the pre-test baseline: the 0.4 indicators; integration tests run in rolled-back transactions
- [x] 10.2 Run the targeted tests: `npx vitest run tests/unit/verify tests/unit/explain tests/unit/cli/ask-command.spec.ts tests/integration/explain tests/integration/cli/ask-command.spec.ts`
- [x] 10.3 Run the required broader suite and gates: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- [x] 10.4 Run `npm run test:mutation -- --mutate "packages/core/src/verify/**/*.ts"` (score ≥ 80, the CI break threshold); for each meaningful survivor, a RED → GREEN test
- [x] 10.5 Run `/privacy-ethics-check` over the diff (the statement and the excerpt reach only the verifier's prompt, wrapped; `entailment_unverified`, the cache and `usage` carry no text; no question is sent to the verifier); record the result in the report
- [x] 10.6 Verify the post-test state: same `project`/`claim`/`evidence` counts as 10.1; no `.stryker-tmp/` left. Restore and document if not
- [x] 10.7 Create `openspec/changes/evidence-verifier-semantic/reports/YYYY-MM-DD-10-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6, with the baseline, the edited existing tests (8.2), the Stryker score and survivors (10.4) and the privacy check (10.5)
- [x] 10.8 Mark complete only after the tests pass and the report exists

## 11. Backend: Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [x] 11.1 Preconditions: local database migrated with acme-shop loaded (`npx tsc --build` first, so `npm run cli` does not run stale code); record the 0.4 counts
- [x] 11.2 Live run: serve the local Ollama CPU-only (`docs/project-context.md`); ask the author at the start of this step which models to use for `LLM_MODEL` and `LLM_MODEL_VERIFY` (`llama3.2` is known to give `invalid-model-output` on the answer). Run `npm run cli -- ask acme-shop "¿Cómo se calcula el precio final de un pedido?"`; check exit `0`, and the new `evidence` rows' `verification` (`entailed`/`cited`) with `SELECT verification, count(*) FROM evidence … GROUP BY 1` before/after; record every `entailment_unverified` line of stderr. If Ollama cannot run, use a local OpenAI-compatible stub written outside the repository (session scratchpad) that answers a fixed valid output citing `E1` and `{"entails":true}` / `{"entails":false}` by purpose, removed in 11.6; record which one was used
- [x] 11.3 Degraded path: the same `ask` with the stub answering `yes` to every verification → exit `0`, every statement `[INFERENCE]`, one `{"level":"info","type":"entailment_unverified",…,"reason":"invalid-output"}` line per pair with no statement or excerpt text, rows `cited`; and with the stub refusing `verify` requests (HTTP 503) → `llm-unavailable` events and the answer still stored
- [x] 11.4 Evaluation mode: the same `ask` without `LLM_*` → `UNKNOWN (llm-required)`, no `entailment_unverified` line, no row added
- [x] 11.5 Document every command, exit code and output in `openspec/changes/evidence-verifier-semantic/reports/YYYY-MM-DD-11-manual-interface-testing.md` (mask the OS user name in paths); `usage.verification` is shown by running `explain` through a small script in the session scratchpad over the same database, since `ask` does not print it
- [x] 11.6 Restore: delete every `claim`/`evidence` row the runs created (by id from a before/after diff) and confirm the `project`, `claim`, `evidence` counts equal the 0.4 baseline; `git status` shows no stray file

## 12. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [x] 12.1 The change has no browser UI: the terminal is the client and step 11 drives it end to end; record "not applicable beyond step 11" in the step 10 report
- [x] 12.2 Record in the step 10 report that the CI evidence (new spec files ran and passed, mutation job ≥ 80) is collected in 15.3, once the PR exists (CI runs on `pull_request`; a push of this branch alone triggers no run)

## 13. Update Technical Documentation (MANDATORY)

- [x] 13.1 `readme.md`: the semantic half of the verifier in §2.1 (line ~445, the paragraph that says "La mitad semántica (`entailed`) llega con DIS-70"), the verifier row of the component table of §2.2 (line ~477), and the `verification` table of §3.2 (`entailed` / `cited` written by `explain`, `FACT` only with every citation `entailed`)
- [x] 13.2 `docs/project-context.md`: fix line ~586 (an `LlmUnavailable`/`BudgetExhausted` of a `verify` call no longer propagates), lines ~587-588 (the `ExplainEvent` union gains `entailment_unverified`) and lines ~597-598 (new `evidence` rows are `entailed` or `cited`); lines ~575-582 (the `explain(...)` signature gains `verificationCache`; the pipeline gains "→ syntactic check → output policy → semantic check (`verify` calls) → entailment policy →" before `saveClaims`); add the gotchas — the semantic check in `core/verify` (one `verify` call per distinct uncached pair, sequential; fail closed to `cited`); the in-memory cache is one per `ask` run; `scripted-llm` routes `purpose: 'verify'` to `options.verify`, whose default entails everything; `ENTAILMENT_UNVERIFIED_REASONS` lives in `explain-event.ts`
- [x] 13.3 No new ADR (design S12, author Q5). The Spanish comment on DIS-56 recording D1's override was posted on 2026-10-15 (comment d2e84bab); confirm it is there, do not post it again
- [x] 13.4 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts to `prompts.md` per `docs/project-context.md` → prompts.md rules, with its Índice entry in the same edit

## 14. Pull request preparation

- [x] 14.1 Prepare the PR description (`/pr-describe`, in Spanish) against `feature/entrega-2-CRN`, with the author's Why transcribed (DIS-70 `[enhanced]` D1–D8 and the answers Q1–Q6 of design S13) and the Stryker score

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [x] 15.1 Open the pull request against `feature/entrega-2-CRN` (after confirming with the author; `gh` on the DisTinta account, back to Cristina-JumpMath afterwards)
- [x] 15.2 Set DIS-70 to In Review in Linear with a comment in Spanish linking the PR and the change
- [x] 15.3 First confirm in the PR's CI run that the new spec files ran and passed and the mutation job is ≥ 80, and link the run in an addendum to the step 10 report; then run `/show-spec-working`, `/verify-against-spec` and `/adversarial-review`, in this order; one report each under `openspec/changes/evidence-verifier-semantic/reports/` (`YYYY-MM-DD-show-spec-working.md`, `YYYY-MM-DD-verify-against-spec.md`, `YYYY-MM-DD-adversarial-review.md`); `/show-spec-working` may reuse the step 11 evidence and must show `evidence` rows `entailed` and `cited` from a real `ask` over acme-shop and the `usage.verification` of that answer
- [x] 15.4 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [x] 15.5 Commit the fixes to the same pull request (push confirmed with the author); re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [x] 15.6 Before the archive, update the Purpose of `openspec/specs/evidence-verification/spec.md` (a delta cannot change it) to cover the semantic check, the verification cache and the entailment policy
- [x] 15.7 `/opsx:archive`, and commit the archive to the same pull request; the author merges afterwards (never before the archive commit)
