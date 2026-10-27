# Verify against spec: answer-language (DIS-104, PR #68)

- Date: 2026-10-27
- Branch: `feature/dis-104-answer-language` at `b287a78`, against `origin/final-project-CRN`
- Mode: inline (the skill's *Inline mode*, autonomous run). Text written by the agent, no author present.
- Spec: `openspec/changes/answer-language/specs/explain/spec.md` (ADDED "Question and answer language";
  MODIFIED "Prompt and evidence ids" and "Explain events and logging").

## 1. Requirements implemented correctly

| Requirement / clause | Code | Proof |
|---|---|---|
| Language rule: backtick pairs ignored, an unmatched last backtick a plain character | `packages/core/src/explain/question-language.ts:40-51` (`withoutBacktickSpans`) | `tests/unit/explain/question-language.spec.ts:30-31, 91-103` |
| Whitespace tokens, the closed edge-punctuation set stripped at both ends | `question-language.ts:10, 54-61, 86-87` (the set is exactly `¿ ¡ ? ! . , ; : " ' « » “ ” ‘ ’ ( ) [ ]`) | `question-language.spec.ts:27-28, 32, 84-89, 113-116` |
| Code tokens: any non-`\p{L}` character; letters-only with an uppercase after the first unless all uppercase | `question-language.ts:31, 34, 64-68` | `question-language.spec.ts:33, 64-73, 105-111, 118-120` |
| Closed Spanish and English lists, `¿`/`¡`, `ñ` and accented vowels as Spanish signals, lowercase comparison | `question-language.ts:13-28, 83-91` (lists equal to the spec's, letter for letter) | table tests `question-language.spec.ts:36-48`, `56-62` |
| Threshold of two and strict majority; no decision otherwise, empty text included; never throws | `question-language.ts:92-94` | `question-language.spec.ts:17-34, 75-82` |
| No dependency beyond the platform | `question-language.ts` imports nothing; `package.json` unchanged on the branch | `git diff --stat` (no manifest) |
| System message by question language; generic `EXPLAIN_SYSTEM_PROMPT` byte for byte; `EXPLAIN_SYSTEM_PROMPT_ES` = generic with line 5 replaced and the Spanish line last, 9 lines joined by `\n` | `packages/core/src/explain/prompt.ts:20-48, 74, 92` | `tests/unit/explain/prompt-language.spec.ts:130-182` (literal lines); `tests/unit/explain/prompt.spec.ts` unchanged and green |
| Prompt hash = SHA-256 of `JSON.stringify(messages)` | `prompt.ts:95` (unchanged) | `prompt-language.spec.ts:169, 178` |
| `answer_language_mismatch` only for an answered model answer, question `es`, `answer` `en`; statements not checked; answer, persistence, cache save and usage unchanged | `packages/core/src/explain/explain.ts:368-381` (after the `broken-evidence` return at :355; `isCacheable` untouched in `packages/core/src/cache/response-cache.ts:31-34`) | `tests/unit/explain/explain-language.spec.ts:46-105` |
| Never on a cache hit or an `UNKNOWN` | the hit returns at `explain.ts:306-312`; `UNKNOWN` returns at `:340-341, :355` keep their events | `explain-language.spec.ts:69-105` |
| `ExplainEvent` gains `AnswerLanguageMismatchEvent { type; expected: 'es' }`, codes only | `packages/core/src/explain/explain-event.ts:191-212` | `explain-language.spec.ts:62-66` (exact keys, no question or answer text) |
| Order: after `entailment_unverified`, before `claims_not_persisted`, `answer_not_cached`, `query_not_logged` | `explain.ts:373` (`[...events, ...languageEvents]` passed to `storedAnswer`/`unsavedAnswer`; `finish` appends the write events afterwards) | `explain-language.spec.ts:108-135` |
| Transports log every event, `info` for this one | unchanged: `packages/api/src/routes/ask.ts:152`, `packages/cli/src/commands/ask.ts:112` | live: `reports/2026-10-27-show-spec-working.md` E1, E7 |

## 2. Requirements missing or partial

None against the spec. Every SHALL of the three requirements has code and a test, and the live run of
`reports/2026-10-27-show-spec-working.md` shows the event through both transports.

## 3. Unspecified behaviour

| # | What | Where | Outcome to decide |
|---|---|---|---|
| U1 | The golden answers were regenerated (`seeds/cache/acme-shop.json`: Q1 now 4 statements / 9 evidence entries / confidence 0.82, Q3 2 statements, Q4 3 statements), while `proposal.md` → non-goals says the golden answers are not changed and `design.md` → E4 ("not touched", **D**) and Risks ("no golden answer moves") still say so | `seeds/cache/acme-shop.json`; `docs/golden-review/2026-10-acme-shop-golden-review-dis-104.md` | Wanted and forced (finding A1: `prompt.ts` is a fingerprint input, so `verify` fails otherwise). Keep it and reconcile `proposal.md`, design E4 and Risks with A1 |
| U2 | Guides that paste the evaluation-mode output of the old golden Q1 are now out of date: `docs/DEMO.md` Paso 1 (the CLI answer and its four `PriceCalculator.php:16-44` statements), Paso 1 and Paso 5 `demo:ask` (`"evidence": 4`, now 9), Paso 2 ("Todas las afirmaciones de arriba citan `app/Services/PriceCalculator.php:16-44`"), the web walkthrough items 8 and 9 («ev-1 · app/Services/PriceCalculator.php:16-44», «0.78»); `fixtures/README.md` points only to the DIS-34 golden review | `docs/DEMO.md:237-300, 311, 412-476, 557-562`; `fixtures/README.md:210-214` | Consequence of U1, not of the spec: recapture those outputs and link the DIS-104 review |
| U3 | `docs/DEMO.md` → `Probar con un modelo real` mixes two captures: the CLI output is the DIS-104 one (598 s, 6 statements) but the text below it still says it took 8 min 28 s, and the `demo:ask` cache hit below ("la API la sirve desde la caché", `"statements": 2`, `"evidence": 2`) is the DIS-103 one, which cannot be the cached copy of the 6-statement answer above | `docs/DEMO.md:738, 749-787` | Fix the duration and say which capture the API block is from |
| U4 | `detectLanguage`, `TextLanguage`, `EXPLAIN_SYSTEM_PROMPT_ES` exported from `@codemind/core`; `ExplainPrompt.questionLanguage` | `packages/core/src/explain/index.ts:10`, `prompt.ts:58-59` | Specified by design D1 and D2 (not by the spec, which needs no public surface): accepted as designed |
| U5 | `tests/integration/cli/verify.spec.ts` now flips whatever type the golden Q3's first statement has | `tests/integration/cli/verify.spec.ts:143-159` | Recorded in tasks 5.1 and the step 6 report; same exit code, lines and count: accepted |

No other unrequested code: the diff of `packages/` is the four files the design names plus one export
line; no route, schema, adapter, port or migration.

## Specific checks

- **Dependency not in the manifest:** none (no import outside the platform and the package).
- **Authorisation required by the spec and not performed:** the spec requires none.
- **Response field not in the spec:** none; the public API response is unchanged (`toPublicAnswer`
  keeps events out; show-spec-working E1).
- **Scenario whose test asserts less than the scenario:** none weaker. One noise assertion:
  `tests/unit/explain/explain-language.spec.ts:123` (`expect(ClaimWriteFailed).toBeDefined()`) checks
  nothing about the scenario; it only keeps an import used (the failure is configured through
  `failClaimWrite`). Minor.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| The language rule decides Spanish, English or nothing | `tests/unit/explain/question-language.spec.ts` › same name | green |
| An English answer to a Spanish question is reported and still returned | `tests/unit/explain/explain-language.spec.ts` › same name | green |
| No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN | `tests/unit/explain/explain-language.spec.ts` › same name | green |
| Each span of the pack gets one evidence id in rank order | `tests/unit/explain/explain.spec.ts` (unchanged) | green |
| The prompt hash covers the whole prompt | `tests/unit/explain/explain-sanitization.spec.ts` (unchanged) | green |
| A change only in the omitted lines keeps the prompt hash | `tests/unit/explain/explain-sanitization.spec.ts` (unchanged) | green |
| A Spanish question gets the explicit Spanish instruction | `tests/unit/explain/prompt-language.spec.ts` › same name | green |
| An English or undecided question keeps the generic system message | `tests/unit/explain/prompt-language.spec.ts` › same name | green |
| Explaining writes nothing to the console | `tests/unit/explain/explain-sanitization.spec.ts` (unchanged) | green |
| Sanitisation events come first in every answer that reached the prompt | `tests/unit/explain/explain-sanitization.spec.ts` (unchanged) | green |
| No sanitisation event without a prompt | `tests/unit/explain/explain-sanitization.spec.ts` (unchanged) | green |
| Evidence broken events follow the sanitisation events and carry no content | `tests/unit/explain/explain-verification.spec.ts` (unchanged) | green |
| Entailment unverified events follow the evidence broken events and carry no content | `tests/unit/explain/explain-verification.spec.ts` (unchanged) | green |
| The language event follows the verification events and precedes the write events | `tests/unit/explain/explain-language.spec.ts` › same name | green |

Run: `npx vitest run tests/unit/explain tests/unit/api/ask.spec.ts tests/unit/cli` → 30 files, 450 tests
passed (2026-10-27).

## Verdict

The implementation does what the spec says, no less and no more in `packages/`. The open items are
outside the code: U1 (artifacts that still deny the golden regeneration), U2 and U3 (guides out of
date after it), and the noise assertion. None blocks; all are fixed in this PR (see
`design.md` → Follow-ups, review findings).
