# Adversarial review: answer-language (DIS-104, PR #68)

- Date: 2026-10-27
- Branch: `feature/dis-104-answer-language` at `b287a78`, diff against `origin/final-project-CRN`
- Mode: inline (the skill's *Inline mode*, autonomous run). Text written by the agent, no author present.
  The same agent session did not implement the change (a fresh review step), but it is the same model:
  its blind spots are partly shared, which is why every finding below was checked in the code.

## What was checked

- **Spec and tasks.** Every requirement of the delta has scenarios and every scenario a test of the
  same name (`reports/2026-10-27-verify-against-spec.md`, final table). The delta spec was last changed
  in `cebfbff` (audit round 2), before the first code commit `7e80ed3`: it was not edited to match the
  code. Tasks 0-12.1 marked `[x]` have their evidence in the step 6 and step 8 reports and in the
  measurement report; 12.2-12.7 are open (this step).
- **Hostile input** on `detectLanguage` (the question, bounded by `parseExplainRequest`; the answer,
  bounded by `MAX_ANSWER_CHARS`): the empty text, punctuation only (`¿¡¿¡?` passes the 5-character
  minimum and is `es`: two signals; it only selects the Spanish system message), an unmatched backtick,
  NFD accents, all-caps, mixed `¿What does PriceCalculator do?` (`en`), a Spanish answer quoting an
  English sentence (it can read `en` and log a false event: information only, the answer is untouched),
  a short English answer with one list word (no decision, no event: the threshold). The rule is pure:
  the same request twice or two at once give the same result. Linear time: `withoutBacktickSpans`
  advances `from` past each closing backtick, `stripEdges` moves two indexes inward.
- **Blast radius.** `buildPrompt` has one caller (`explain.ts:332`); `promptHash` is only written to the
  claim provenance (`claim-items.ts:110`), never compared, so a Spanish question's new hash breaks no
  lookup. Events are read only by the two transports (`api/src/routes/ask.ts:152`,
  `cli/src/commands/ask.ts:112`), which log them as they are; `toStoredResponse` drops them, so the
  cache never stores one. No migration. The golden file and the guides that paste its output are the
  data this change rewrote (A1): see findings 2 and 3.
- **Evidence quality.** The most important test, "An English answer to a Spanish question is reported and
  still returned", kills: dropping `prompt.questionLanguage === 'es'` (the English-question case of the
  next test then gets an event), testing `!== 'es'` instead of `=== 'en'` (the `UNKNOWN` and Spanish
  cases differ), putting the event in `finish` after the write events (the order test), and adding any
  field to the event (`Object.keys` check). One existing test changed (`tests/integration/cli/verify.spec.ts`),
  justified in tasks 5.1: the flip still asserts the same exit code, lines and count.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/cli/src/cache/answer-fingerprint.ts:12-24` | `packages/core/src/explain/question-language.ts` decides which system message a question gets (`prompt.ts:75, 92`), so it is now an input of every golden answer's prompt, but it is not in `ANSWER_FINGERPRINT_FILES` (and the golden-answers spec, "Golden answer fingerprint", lists exactly eleven files). | A later edit of the word lists or of the threshold changes the prompt of the Spanish golden questions (all three are Spanish) while `npm run verify` and the CI `verify` job keep passing on golden answers produced by another prompt: the exact staleness the fingerprint exists to catch (ADR `20261017-stale-fingerprint-fails-verify`). |
| Major | `docs/DEMO.md:237-300, 311, 412-476, 557-562` | The evaluation-mode walkthrough still pastes the pre-DIS-104 golden Q1: the CLI answer and its four statements all citing `app/Services/PriceCalculator.php:16-44`, `"evidence": 4` in `demo:ask` (Paso 1 and Paso 5), Paso 2 «Todas las afirmaciones de arriba citan `app/Services/PriceCalculator.php:16-44`», the web items «ev-1 · app/Services/PriceCalculator.php:16-44» and «0.78». The regenerated Q1 has 9 evidence entries over six files and confidence 0.82. | The demo guide is what the evaluators run step by step; its first answer no longer matches what they see. |
| Minor | `docs/DEMO.md:738, 749-787` | The pasted live CLI output is the DIS-104 capture (598 s, 6 statements), but the text still says it took 8 min 28 s, and the `demo:ask` block that "serves that answer from the cache" shows `"statements": 2`, `"evidence": 2` (the DIS-103 capture). | Two captures read as one; the API block contradicts the CLI block above it. |
| Minor | `openspec/changes/answer-language/proposal.md:38-39`, `design.md:267-270, 301` | The proposal's non-goals, design E4 ("not touched", **D**) and the Risks entry ("no golden answer moves") still deny the golden regeneration that A1 made. | The artifacts that archive into the change history contradict the diff. |
| Minor | `fixtures/README.md:210-214` | "Golden review (DIS-34)" names only the DIS-34 report, whose answers no longer exist. | The pointer to the review of the current golden answers is missing. |
| Minor | `tests/unit/explain/explain-language.spec.ts:2, 123` | `expect(ClaimWriteFailed).toBeDefined()` asserts nothing about the scenario; it only keeps an import used. | Noise in a scenario test; the failure is configured by `failClaimWrite`. |
| Question | `design.md:334` (Follow-up A1) | A1 says the author signs a sample of the regenerated golden answers "later", under destination **A** (this change), but the signature is not work this PR can do. | A pending human action filed as done in this change gets lost at archive. |

### Verdict

PASS WITH GAPS — no Blockers; two Majors and four Minors are fixed in this PR (see below), and the
Question gets an explicit destination.

### Recommended next steps before archiving

1. Finding 1 (A): add `packages/core/src/explain/question-language.ts` to `ANSWER_FINGERPRINT_FILES`
   through a delta of the `golden-answers` spec in this change (MODIFIED "Golden answer fingerprint",
   twelve files), with the existing `tests/unit/cache/answer-fingerprint.spec.ts` updated (named in
   `tasks.md`), then `npm run cache:build` on the local Ollama, the agent's review of the new golden
   answers and `npm run verify` exit `0`.
2. Finding 2 (A): recapture the evaluation-mode outputs of `docs/DEMO.md` that depend on the golden Q1,
   after step 1, and say so in `Cómo se capturó`.
3. Findings 3-6 (A): fix the duration and label the API block of `Probar con un modelo real`; reconcile
   the proposal and design with A1; link the DIS-104 golden review from `fixtures/README.md`; drop the
   noise assertion.
4. Question 7: the author's signature of the regenerated golden answers is **B**, a hand-off comment on
   DIS-104 when it moves to its final state, plus the existing "needs the author's" line of the review
   report; it is not a Linear issue of its own (one human check of three entries).
5. Re-run what each fix invalidates (unit tests, `npm run verify`, `npm run test:mutation` is not needed:
   no core logic changes), commit to PR #68 and wait for green CI.

## Resolution (2026-10-27)

| Finding | Follow-up | How it was resolved |
|---|---|---|
| 1 (Major) fingerprint | V1 | Fixed. Delta `specs/golden-answers/spec.md` (MODIFIED "Golden answer fingerprint", twelve files); RED seen in `tests/unit/cache/answer-fingerprint.spec.ts` (3 of 4 failing), GREEN with the file in `ANSWER_FINGERPRINT_FILES`; `docs/project-context.md` names it. `npm run cache:build` on the CPU Ollama (Q1 678 s, Q3 251 s, Q4 530 s, first attempts); new `answerFingerprint` `sha256:9a2246d6…`; `npm run db:seed` and `npm run verify` 3/3. A second build of Q1 alone was discarded (it called the discount «reembolsación»). The agent reviewed the three entries (`docs/golden-review/2026-10-acme-shop-golden-review-dis-104.md`: Q1 doubtful, Q3 correct, Q4 correct with loose wording) and added its review to each entry's `reviews`. |
| 2 (Major) DEMO golden outputs | V2 | Fixed. Paso 1 CLI output, the three `demo:ask` blocks of pasos 1 and 5 (7 statements, 9 evidence entries), the Paso 2 sentence and the web confidence (0.71) recaptured in evaluation mode on a freshly seeded database; `Cómo se capturó` gains the row of the recapture; a sentence after Paso 1 says the golden answer's `INFERENCE` statements and statement 5 are shown as such. |
| 3 (Minor) live capture mix | V3 | Fixed: 598 s, and the `demo:ask` block is labelled as the DIS-103 capture. |
| 4 (Minor) artifacts deny the regeneration | V4 | Fixed: proposal non-goals, Capabilities and Impact; design E4, Risks and A1. |
| 5 (Minor) fixtures README | V5 | Fixed: it links the DIS-104 review and keeps the DIS-34 one as history. |
| 6 (Minor) noise assertion | V6 | Fixed: the assertion and its import removed. |
| 7 (Question) author signature | V7 | Decided by the agent: **B**, hand-off comment on DIS-104 (2026-10-27). |

Incident during the fixes, recorded so it is not repeated: a retry of `npm run cache:build -- Q1` was
stopped by a 20 s `timeout` while `fixtures/build-history.mjs` was replaying the fixture history, which
left four `fixtures/acme-shop` files at an older revision (its in-memory restore does not run when the
process is killed). They were restored from the branch head (`git restore --source=HEAD` on the four
paths) and the history rebuilt (`node fixtures/build-history.mjs acme-shop`); `git status` showed no
fixture change afterwards and `npm run verify` passed. Nothing of it was committed.

Re-run after the fixes: `npx vitest run` with the test database, 196 files and 2037 tests passed; `npm run
lint`, `npm run typecheck`, `npm run docs:coverage` exit 0; `npm run lint:architecture` 0 errors;
`openspec validate answer-language` valid; `npm run verify` 3/3 on the author's database, left freshly
seeded (acme-shop: claims 0, query_log 0, cache entries 3).

After the fixes no Blocker or Major is left: the verdict of this review becomes PASS.
