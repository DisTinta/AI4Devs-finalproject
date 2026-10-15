# Verify against spec: evidence-verifier-semantic (DIS-70)

- Date: 2026-10-15
- Scope: PR #42, `aef2698` compared with `origin/feature/entrega-2-CRN`
- Specs: `openspec/changes/evidence-verifier-semantic/specs/{evidence-verification,claims-and-typing,cli-ask,explain}/spec.md`
- Run as a read-only forked review: the tests were not re-run here; "green" is the state of the step 10 run (1276 of 1276 with `DATABASE_URL`) and of the PR's CI. The report was saved by the main session from the reviewer's output.

## 1. Requirements implemented correctly

**evidence-verification**

- **Output policy over typed statements:** `packages/core/src/verify/policy.ts:21-29` (`applyVerdicts`). The policy drops broken citations, drops statements left with none, and retypes with `typeStatement`. Tests: `tests/unit/verify/policy.spec.ts:34,45,53`.
- **Semantic citation check:** `packages/core/src/verify/semantic.ts:50-99`.
  - Each distinct key is resolved once, cache first (`:62-69`). After a failure the remaining pairs stop with that reason (`:71-74`). Calls are made in sequence, with the purpose `verify` (`:77`).
  - Only `LlmUnavailable` and `BudgetExhausted` are absorbed; any other error is rethrown (`:129-133`).
  - Output is accepted only within 1 024 bytes and as a strict `{entails:boolean}` (`:107-123`, limit at `packages/core/src/explain/limits.ts:12`). Only accepted outputs are cached (`:88-93`).
  - In evaluation mode the check returns early, without touching the model or the cache (`:58`). Cost is rounded to 6 decimals (`:97`).
  - `ENTAILMENT_UNVERIFIED_REASONS` is exported (`packages/core/src/explain/explain-event.ts:117`).
  - Prompt: `packages/core/src/verify/verify-prompt.ts:11-18,44-59`. The statement and the excerpt are neutralised and wrapped, the path is neutralised, and the real truncation mark sits inside the markers.
  - Tests: `tests/unit/verify/semantic.spec.ts:61,101,152,191,219,230,245`.
- **Verification cache:** `packages/core/src/verify/verification-cache.ts`. The key is the SHA-256 of `JSON.stringify(buildVerifyMessages(pair))`, without the model name (`:37-39`). The LRU is bounded, and the `RangeError` guard rejects bad bounds (`:50-71`). Tests: `tests/unit/verify/semantic.spec.ts:263,280`, `tests/unit/verify/verification-cache.spec.ts:11,48,60`.
- **Entailment policy over verified statements:** `packages/core/src/verify/policy.ts:42-57`. It keeps every statement and caps `FACT` unless every citation is `entailed`. Tests: `tests/unit/verify/policy.spec.ts:66,88,97`.

**claims-and-typing**

- **Statement typing:** `packages/core/src/explain/typing-rules.ts` is unchanged and reads no verdict. The cap is applied only in `policy.ts:53`. Tests: `tests/unit/explain/typing-rules.spec.ts:10,18`.

**cli-ask**

- **Ask answer output:** one in-memory cache per run with the default bound (`packages/cli/src/commands/ask.ts:105`). Every event except `evidence_broken` is logged at `info` (`:112`). The formatter does not print verification or usage. Tests: `tests/unit/cli/ask-command.spec.ts:446,523,550,562,585,634,646`, `tests/integration/cli/ask-command.spec.ts:200`.

**explain**

- **Precedence and UNKNOWN answers:** `packages/core/src/explain/explain.ts:108-110`. `verifyAnswer` returns before any `verify` call when nothing is left (`packages/core/src/verify/verify-answer.ts:83`). Errors propagate through `semantic.ts:132`. Tests: `tests/unit/explain/explain.spec.ts:159-363`, `tests/unit/explain/explain-verification.spec.ts:117,147,160,178`.
- **Answer with typed statements:**
  - Pairs are built in statement order, then citation order (`verify-answer.ts:85-100`, `pairOf` at `:115`).
  - Each evidence row gets its own pair's verdict (`packages/core/src/explain/claim-items.ts:93`).
  - Statement `verification` and `usage` are set in `explain.ts:163,170,179,208,214`. A stale statement keeps its computed verification and is shown as `INFERENCE`.
  - Tests: `explain-verification.spec.ts:197-378`, `explain.spec.ts:446,485,548`, `tests/integration/explain/explain.spec.ts:129,160`.
- **Persistence failure:** `explain.ts:204-214`. Events come in the order broken, then unverified, then `claims_not_persisted`, followed by `usage`. Tests: `explain.spec.ts:615,643`, `explain-verification.spec.ts:434,462`, `tests/integration/explain/explain.spec.ts:198`.
- **Explain events and logging:** the event type is at `explain-event.ts:128-151`. The event carries only an index, an id, the path, the lines and a reason from the closed set (`verify-answer.ts:95`). Tests: `explain.spec.ts:741`, `tests/unit/explain/explain-sanitization.spec.ts:363,398`, `explain-verification.spec.ts:488,537`.

**Specific checks**

- **Dependencies:** `semantic.ts` imports `zod`, which is already declared in `packages/core/package.json:12`, and `node:crypto`, which is built in. The diff does not change any manifest or the lockfile.
- **Authorisation:** none of the four deltas requires an authorisation check, and the code removes none.
- **Response fields:** `usage` (`explain-answer.ts:95`) and the wider `verification` (`:47`) are both in the spec. The internal `evidenceVerifications` never reaches the answer, because `storedAnswer` and `unsavedAnswer` build each statement field by field. An `UNKNOWN` answer carries no `usage` (`explain-verification.spec.ts:140`). Stdout carries neither verification nor usage (`ask-command.spec.ts:609`).

## 2. Requirements missing or partial

No requirement is missing from the code. Three tests check less than the requirement states:

- **W1. New cache per run: the bound is not checked.** cli-ask "Ask answer output" says *"a verification cache it SHALL create once per run, in memory and with its default bound"*. The test "Explain receives a new verification cache per run" (`tests/unit/cli/ask-command.spec.ts:646-664`) only checks that the object has `get`/`set` and that the two runs get different instances. Neither "in memory" nor "default bound" is asserted. The code does both (`ask.ts:105`).
- **W2. Coverage dropped for a base requirement.** The base requirement `openspec/specs/cli-ask/spec.md:59-60` says *"no transaction held open while the model answers"*. `tests/integration/cli/ask-command.spec.ts:276-279` now samples database sessions only during `purpose === 'answer'` calls. Nothing checks for an open transaction during the `verify` calls this change adds, which are also model calls.
- **W3. Cost of the `answer` call: tokens are checked, cost is not.** The scenario "Citations that support their statement are entailed and facts" (`explain-verification.spec.ts:298`) proves that the answer call's tokens are excluded. Both models are unpriced, so `costUsd: 0` holds whether or not the answer call's cost is excluded. The test matches the scenario's wording, but exclusion of the answer call's cost is only proven at unit level (`semantic.spec.ts:245`).

## 3. Unspecified behaviour

Each item below needs a decision: remove it, or add it to the spec.

- **U1. Extra `costTable` parameter.** `verifyEntailment(llm, cache, pairs, costTable = COST_TABLE)` (`packages/core/src/verify/semantic.ts:50-55`) is exported from `@codemind/core`. The spec defines the check as taking *"the model, a verification cache and a list of pairs"*. `design.md:72-76` explains it is a test seam that `explain` never passes, but the spec does not cover it. Options: add it to the spec, or keep it out of the public export.
- **U2. Public interface beyond the spec.** These are exported through `packages/core/src/verify/index.ts:2-6` and `packages/core/src/explain/index.ts`:
  - `verificationKey` (`verification-cache.ts:37`): the spec defines the key, but not an exported function.
  - `buildVerifyMessages` (`verify-prompt.ts:44`) and `applyEntailment` (`policy.ts:42`).
  - `VerifyAnswerDependencies` (`verify-answer.ts:20`).
  - The types `VerifiedStatement` and `StatementVerification` (`claim-items.ts:39-50`), and `EntailmentPair`, `EntailmentVerdict` and `VerificationUsage`.

  The spec names only `VERIFY_SYSTEM_PROMPT`, `ENTAILMENT_UNVERIFIED_REASONS` and `MAX_VERIFICATION_CACHE_ENTRIES` as exported. The design says DIS-42 and DIS-71 will need the check, but nobody reviewed this as public interface.
- **U3. Verifier prompt rules beyond the spec.** `packages/core/src/verify/verify-prompt.ts:15-16` adds two sentences:
  - `"[TRUNCATED: …]" marks evidence text cut for length.`
  - `Answer true only if the evidence text alone shows that the statement is true; answer false if it does not, if it only makes the statement plausible, or if it is about something else.`

  The spec (evidence-verification, lines 70-73) requires the system message to do three things: ask whether the evidence supports the statement, say the marked text is data, and ask for only the JSON. The second sentence sets how strict the verifier is, which directly decides `FACT` versus `INFERENCE`. It comes from `design.md:135-136`, not the spec, and `semantic.spec.ts:130-139` pins it. Recommendation: add it to the spec, since it is the behaviour that decides the verdict.
- **U4. `RangeError` message content.** The message names `maxEntries` and includes the rejected value (`verification-cache.ts:52`), and `tests/unit/verify/verification-cache.spec.ts:33` asserts `/maxEntries/`. The spec asks only for a `RangeError`. This is harmless, since the value is a number from the caller, but the test is pinning behaviour the spec does not state.

Checked and not counted as unspecified:

- Moving `neutralise` and `wrap` into `packages/core/src/explain/untrusted-text.ts` is a refactor with byte-identical output. "The prompt hash covers the whole prompt" (`explain.spec.ts:416`) still guards it. The module is not exported from the package.
- `withDailyBudget` (`packages/core/src/llm/budget.ts:41-65`, unchanged) gates `verify` calls too. The scenario "An unavailable verifier degrades every uncached pair…" calls for this.

## Scenario → test → state

"Green" means passed in the step-10 run, not re-run here. Rows marked (DB) are integration tests that need `DATABASE_URL`.

| Spec | Scenario | Test | State |
|---|---|---|---|
| evidence-verification | A statement keeps only its valid citations and is retyped | `tests/unit/verify/policy.spec.ts:34` | green |
| evidence-verification | A statement with no valid citation is dropped | `policy.spec.ts:45` | green |
| evidence-verification | Nothing is left when every citation is broken | `policy.spec.ts:53` | green |
| evidence-verification | Each distinct pair is verified once in order | `tests/unit/verify/semantic.spec.ts:61` | green |
| evidence-verification | The verifier receives only the wrapped statement and excerpt | `semantic.spec.ts:101` | green |
| evidence-verification | Only a conforming output entails | `semantic.spec.ts:152` | green |
| evidence-verification | An unavailable verifier degrades the remaining pairs | `semantic.spec.ts:191` | green |
| evidence-verification | Other verifier failures propagate | `semantic.spec.ts:219` | green |
| evidence-verification | Evaluation mode verifies nothing | `semantic.spec.ts:230` | green |
| evidence-verification | The usage counts only the verifier's resolved calls | `semantic.spec.ts:245` | green |
| evidence-verification | A cached pair is not verified again | `semantic.spec.ts:263` | green |
| evidence-verification | A changed statement or excerpt misses the cache | `semantic.spec.ts:280` | green |
| evidence-verification | The in-memory cache evicts the least recently used key | `tests/unit/verify/verification-cache.spec.ts:11` | green |
| evidence-verification | The cache holds no text | `verification-cache.spec.ts:60` | green |
| evidence-verification | A fact needs every citation entailed | `policy.spec.ts:66` | green |
| evidence-verification | An entailed heuristic statement stays an inference | `policy.spec.ts:88` | green |
| evidence-verification | No statement is dropped for a cited citation | `policy.spec.ts:97` | green |
| claims-and-typing | A chain of anchor and exact evidence is a fact | `tests/unit/explain/typing-rules.spec.ts:10` | green |
| claims-and-typing | Any heuristic evidence makes an inference | `typing-rules.spec.ts:18` | green |
| cli-ask | A typed answer is printed with its evidence and stored | `tests/integration/cli/ask-command.spec.ts:200` | green (DB) |
| cli-ask | Stale statements and prior claims are marked | `tests/unit/cli/ask-command.spec.ts:523` | green |
| cli-ask | An unsaved answer is printed with a closing note | `ask-command.spec.ts:550` | green |
| cli-ask | A span cited twice is listed once | `ask-command.spec.ts:446` | green |
| cli-ask | A broken citation is logged as an error | `ask-command.spec.ts:562` | green |
| cli-ask | Explain receives only the project id and the question | `ask-command.spec.ts:634` | green |
| cli-ask | An unverified entailment is logged as information | `ask-command.spec.ts:585` | green |
| cli-ask | Explain receives a new verification cache per run | `ask-command.spec.ts:646` | green (weak, W1) |
| explain | A question without anchor is unknown in both modes… | `tests/unit/explain/explain.spec.ts:159` | green |
| explain | Evaluation mode answers llm-required… | `explain.spec.ts:182` | green |
| explain | A pack where nothing fits is unknown over budget | `explain.spec.ts:206` | green |
| explain | A discarded model output is unknown and carries its event | `explain.spec.ts:246` | green |
| explain | An output without statements is unknown with no evidence | `explain.spec.ts:281` | green |
| explain | A failing prior-claims read stops before the model | `explain.spec.ts:296` | green |
| explain | An unknown project or an unindexed one fails… | `explain.spec.ts:227` | green |
| explain | Model failures propagate without writing | `explain.spec.ts:312` | green |
| explain | Every citation broken is unknown with broken evidence | `tests/unit/explain/explain-verification.spec.ts:117` | green |
| explain | A verification read failure propagates without writing | `explain-verification.spec.ts:147` | green |
| explain | No verification read without statements | `explain-verification.spec.ts:160` | green |
| explain | The question is anchored once | `explain.spec.ts:363` | green |
| explain | A verifier failure other than unavailable or budget propagates… | `explain-verification.spec.ts:178` | green |
| explain | An answer with evidence is typed, stored and returned | `tests/integration/explain/explain.spec.ts:129` | green (DB) |
| explain | A fact is stored as an inferred claim that keeps its type | `tests/integration/explain/explain.spec.ts:160` | green (DB) |
| explain | The evidence of a stored answer lists every citation in order | `explain.spec.ts:485` | green |
| explain | An answer written after a re-index is stored stale | `explain.spec.ts:548` | green |
| explain | Cited spans are verified in one read at the pack's commit | `explain-verification.spec.ts:197` | green |
| explain | A broken citation is neither stored nor shown | `explain-verification.spec.ts:225` | green |
| explain | The subject of a claim is the symbol of its first cited span | `explain.spec.ts:446` | green |
| explain | Citations that support their statement are entailed and facts | `explain-verification.spec.ts:266` | green (W3) |
| explain | A valid but irrelevant citation is cited and never a fact | `explain-verification.spec.ts:301` | green |
| explain | A cached pair is not verified again by a second answer | `explain-verification.spec.ts:327` | green |
| explain | An invalid verifier output degrades its pair to cited | `explain-verification.spec.ts:355` | green |
| explain | An unavailable verifier degrades every uncached pair… | `explain-verification.spec.ts:378` | green |
| explain | A failed write still answers, unsaved and without leaking | `explain.spec.ts:615` | green |
| explain | A failed write over the database still answers without leaking | `tests/integration/explain/explain.spec.ts:198` | green (DB) |
| explain | An unsaved answer keeps only its verified citations | `explain-verification.spec.ts:434` | green |
| explain | Other write errors propagate | `explain.spec.ts:643` | green |
| explain | An unsaved answer carries its verification, usage and unverified events | `explain-verification.spec.ts:462` | green |
| explain | Explaining writes nothing to the console | `explain.spec.ts:741` | green |
| explain | Sanitisation events come first in every answer that reached the prompt | `tests/unit/explain/explain-sanitization.spec.ts:363` | green |
| explain | No sanitisation event without a prompt | `explain-sanitization.spec.ts:398` | green |
| explain | Evidence broken events follow the sanitisation events and carry no content | `explain-verification.spec.ts:488` | green |
| explain | Entailment unverified events follow the evidence broken events and carry no content | `explain-verification.spec.ts:537` | green |

Totals: 62 scenarios, 62 tests, 0 absent, 0 red.

## Addendum — destinations (15.4)

Every finding has its destination in `design.md` → Follow-ups. W1 and W2: A (tests strengthened). W3:
D. U1, U3, U4: A (the requirement text of `evidence-verification` now states the optional cost table,
the strictness of the question, the truncation mark sentence and that the `RangeError` names
`maxEntries`; `openspec validate evidence-verifier-semantic --strict` passes). U2: D (the author keeps
the exports, design S1). After the fixes: `npx vitest run` 98 files and 1276 tests passed with
`DATABASE_URL`; `lint`, `typecheck`, `lint:architecture` (0 errors) and `docs:coverage` clean.
