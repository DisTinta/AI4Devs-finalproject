CHANGES REQUIRED

# Spec audit: `answer-language` (Linear DIS-104)

- Date: 2026-10-26
- Change: `openspec/changes/answer-language/` (proposal.md, design.md, specs/explain/spec.md, tasks.md)
- Ticket: DIS-104 and its 2 comments (enrich 2026-10-26, propose 2026-10-26), loaded through Linear MCP. DIS-104 has **no parent** (`parentId` empty; only `relatedTo` DIS-103). The ticket's own `[enhanced]` acceptance criteria 1-5 are the reference.
- Project inputs read: `docs/base-standards.md`, `docs/project-context.md` (branch rules, tracking deferred findings, explain gotchas around lines 518-552 and 840-889), `docs/backend-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `openspec/specs/explain/spec.md`, `docs/adr/` (none bears on this change), plus the real code and tests named below.

## Questions for the author

1. **All-uppercase questions.** Under the delta rule, a token with "an uppercase letter after its first character" is code, so `COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO` (used in `tests/integration/api/ask.spec.ts:253` and `tests/unit/explain/explain-cache.spec.ts:74`) gets **no decision** and keeps the generic prompt. Is that acceptable, or should a token made only of letters, all of them uppercase, count as a word compared in lowercase?
2. **Caching an English answer.** An answer that raises `answer_language_mismatch` is still cacheable (`isCacheable`, `packages/core/src/explain/explain.ts:213`). From then on, every repeat of that Spanish question is served in English from the cache with `events: []`, so the event shows up only once. The ticket's AC4 says the event does not appear on a cache hit, but it does not say whether the English answer should be cached in the first place. Is that the intended behaviour? (It is a product decision. Do not settle it in the change without the author.)
3. **Reseed against baseline.** `npm run db:seed` (tasks 8.3, design D5) deletes **all** acme-shop rows by cascade and reloads the seed. Any `claim`, `query_log` or `cache_entry` rows in the author's local database before task 0.4 are lost rather than restored. Is that acceptable for the author's database?

## 1. Scope against the ticket — clean

Every element follows from DIS-104: the explicit Spanish prompt (AC1), the unchanged generic prompt (AC2), the detector (AC3), the runtime event (AC4), the measured comparison (AC5), and `docs/DEMO.md` (technical context). The third question (`¿Qué hace TaxService?`) was left to the change by AC5. `TaxService` and `ShippingService` are in `seeds/graph-dump.sql` and are not golden questions (`packages/cli/src/cache/demo-questions.ts:18-20`). The updates to `docs/project-context.md` and `prompts.md`, the mutation testing and the error cases in 8.2 come from project standards, not invented scope. Nothing to cut.

## 2. Inherited acceptance criteria — not applicable (no parent); the sub-issue's own ACs are covered

DIS-104 has no parent, so no criterion is inherited. Coverage of the ticket's own ACs:

| AC | Requirement | Scenario |
|---|---|---|
| AC1 Spanish → explicit prompt | Prompt and evidence ids | A Spanish question gets the explicit Spanish instruction |
| AC2 English/no signal → unchanged | Prompt and evidence ids | An English or undecided question keeps the generic system message |
| AC3 Detector | Question and answer language | The language rule decides Spanish, English or nothing (a superset of the AC's examples) |
| AC4 Runtime check | Question and answer language; Explain events and logging | An English answer to a Spanish question is reported and still returned; No language event for…; The language event follows… |
| AC5 Live measurement | none (process deliverable) | none; covered by design D5 and tasks 1.x and 7.x |

AC5 is a process deliverable rather than system behaviour, so having no requirement for it is acceptable. Its conclusion rule has a gap, though (see 5-B3).

## 3. Missing scenarios

- **I1 (improvable): the `broken-evidence` UNKNOWN path is not covered.** The MUST says "An `UNKNOWN` answer … SHALL NOT carry it", and the only UNKNOWN case in a scenario is `no-evidence`. The risky branch is `broken-evidence`: in `packages/core/src/explain/explain.ts:354-355` it returns the same `events` array that D3 says "become `[...sanitized.events, ...verified.events, ...languageEvents]`". An implementer who appends at line 354 would leak the event into that UNKNOWN answer, and no test would catch it. Correction: add the case to the scenario "No language event…", and fix the placement in D3 (see 8).
- **I2 (improvable): "otherwise unchanged … persistence, cache save and usage" is only asserted loosely.** The scenario "An English answer to a Spanish question is reported and still returned" says "as it would be without the check", which a test cannot observe directly. Correction: assert explicitly that the answer is `persisted: true` and is saved once in the answer cache.

## 4. Ambiguity

- `design.md` D1, line 56: "(no accents, typed **fast**)". This is a rationale, not a requirement, but the word is on the list. Improvable. Replace it with "(typed without accents)".
- `specs/explain/spec.md` line 153: "however many statements cite it". This is text copied unchanged from the main spec, and it means "regardless of the count", so it is not vague. No action.
- No other occurrences of fast/easy/secure/efficient/many/appropriate/robust.

## 5. Open decisions

- **B1 (blocking): the tokenisation of the language rule is underdetermined** (spec "Question and answer language", first two bullets). Four choices are left to the implementer, and each will be pinned by the 2.1 table test:
  a. "quotes" is not a closed set: does it include `"`, `'`, `«`, `»`, `“`, `”`, `‘`, `’`? Do brackets `[` `]` count like parentheses?
  b. Does "lose the punctuation at its start and end" strip one character or every leading and trailing one? Existing tests use `pedido??` (`tests/unit/explain/explain-cache.spec.ts:78`).
  c. "a character other than a letter": is a letter any Unicode letter (`\p{L}`), or only ASCII plus `ñ` and the accented vowels?
  d. What happens with an unmatched backtick (an odd count)? Is the rest of the text ignored, or is the backtick treated as a plain character?

  Fix all four in the requirement and add one example of each to the rule's scenario.
- **B2 (blocking): the scenario "No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN" contradicts itself and is underdetermined.**
  - Step 1 explains `¿Qué hace DiscountService?` with a Spanish answer, which `finish` saves in the cache under that question's key. Step 3 then says the same question is "answered from the answer cache after an English answer was saved for it". No step saves an English answer under that key: step 2 saves under the key of `What does DiscountService do?`. The implementer has to invent how the English entry got there.
  - Step 4 ("then with a model whose output has no statement") names neither the question, nor `useCache: false`, nor the `answer` text. With the same doubles, the Spanish question would hit the cache. If the output's `answer` is not English, the case passes vacuously.

  Correction: rewrite the scenario with a GIVEN that seeds the cache entry, explicit `useCache: false`, and an English `answer` text in the no-statement output (exact text under "Corrections to apply").
- **B3 (blocking): the conclusion rule of the measurement (design D5) is incomplete.** It covers before English → after Spanish (prompt), English → English (model), and "mixed" (both). It leaves three things undecided:
  - (a) before **already Spanish**: the bug is not reproduced, and the outcome has no label;
  - (b) before Spanish → after English (a regression);
  - (c) whether "mixed" means across the three pairs, or inside one answer (`answer` in Spanish and statements in English), and whether the classification uses the rule's decision or the agent's reading.

  This is the output AC5 asks for. Correction: write a per-pair classification table plus an aggregate rule in D5.

## 6. Contradictions inside the change

- **I3 (improvable): tasks 5.1.** The note on `tests/unit/api/ask.spec.ts` ("answer `The final price.`, which now gets the event but asserts no events") contradicts the same task's "Expected: none changes". It is also false under the rule: `The final price.` has one English signal (`the`), below the threshold of two, so there is no decision and no event. Correction: "(answer `The final price.`: one English signal, no decision, so no event)".
- **I4 (improvable): call counts.** `proposal.md` → Impact says "about six model calls". Design D5 and tasks 1.3, 7.1 and 7.2 make seven `answer` calls (3 + 3 + the CLI capture), and each answered call also triggers `verify` calls, up to `MAX_VERIFY_CALLS_PER_ANSWER` = 20 (`docs/project-context.md` around line 887). Correction: in the proposal, write "seven `answer` calls (3 before, 3 after, 1 CLI capture) plus their `verify` calls". In D5, say that the recorded duration is the end-to-end request time and that `usage.verification.calls` is recorded per pair, so the durations can be compared.

## 7. Contradictions with the project

- The two MODIFIED requirements copy the main spec faithfully (`openspec/specs/explain/spec.md:477-524` and `:894-997`). All existing scenarios are kept, and the additions are confined to the new paragraph, the new event bullet, the ordering sentence and the privacy sentence. Clean.
- The base branch `final-project-CRN` in tasks 0.2, 11.1 and 12.1 matches `docs/project-context.md:518`. The `feature/dis-104-answer-language` naming matches. Clean.
- `docs/project-context.md:870-871` (the `ExplainEvent` gotcha) is updated by task 10.2. Clean.
- **I5 (improvable): `docs/backend-standards.md` §3** ("one public concept per file", kebab-case names). The new module is called `question-language.ts`, but its rule is applied to answers too, and the type is `TextLanguage`. Optional rename: `text-language.ts`. If it is renamed, update D1, D2 and tasks 2.1-2.2 together.
- **I6 (improvable): D6 / task 10.1.** `docs/DEMO.md` is a Spanish evaluator guide (`docs/project-context.md:533-536`). State that the new sentence about `answer_language_mismatch` is written in Spanish.

## 8. Contrast with the real code

- D2 is consistent with `packages/core/src/explain/prompt.ts:15-24, 46-69`. `EXPLAIN_SYSTEM_PROMPT` has eight lines and the fifth is `Answer in the language of the question.` `sanitizeForPrompt` returns the question unchanged (`packages/core/src/explain/sanitize.ts:48, 74`), so detecting on `sanitized.question` is the same as detecting on the validated question. `ExplainPrompt` is built only in `prompt.ts` and is used only in `explain.ts:329`, so adding `questionLanguage` breaks no caller. `tests/unit/explain/prompt.spec.ts:67-82` pins the generic message for `q`, which stays undecided. Clean.
- D1's bound on the answer is real: `MAX_ANSWER_CHARS` and `MAX_MODEL_OUTPUT_BYTES` in `packages/core/src/explain/statement-schema.ts:31, 57`.
- D3 / transports: `packages/api/src/routes/ask.ts:152` logs every event at `info` except `evidence_broken`, so no transport change is needed. Clean.
- **I1 (design side, improvable): where the event goes.** D3 says "once the statements are verified and before the claim write, … the answer's events become `[...sanitized.events, ...verified.events, ...languageEvents]`". In the code, `events` is built at `explain.ts:354` and returned by the `broken-evidence` UNKNOWN at `:355`. Correction: compute the language events **after** the `broken-evidence` return (after `explain.ts:355`) and pass `[...events, ...languageEvents]` only to `storedAnswer` / `unsavedAnswer` (`explain.ts:368, 371`).
- Existing tests with Spanish questions were checked against the rule:
  - `explain-sanitization.spec.ts:64` and `:108`: the Spanish system message is now sent, but these tests do not pin it (`:94` matches only a line common to both messages), and the fake answer `ok` gives no decision.
  - `usage.spec.ts:89`: same pattern.
  - `ask.spec.ts:557`: see I3.

  Task 5.1's expectation that nothing changes holds.

## 9. Task size

- **I7 (improvable): tasks 1.3 and 7.1 can exceed one agent turn.** Each makes three sequential live calls on CPU, at 4-9 min per `answer` call according to the ticket, plus the `verify` calls. Correction: split each into one sub-task per question (1.3a/b/c, 7.1a/b/c), each run in the background with `Monitor`.
- **I8 (improvable): task 6.2 bundles seven commands,** including `test:mutation` and the full `vitest run`. Correction: split it into 6.2 (vitest, lint, typecheck, lint:architecture, docs:coverage), 6.3 (`test:mutation`) and 6.4 (`npm run verify`), and renumber the rest.

## 10. Mandatory steps

- Step 0 is section 0 and its title is right, but **its first item is the Linear status (0.1), not the branch (0.2)**. Improvable: swap 0.1 and 0.2, so that confirming the branch comes first.
- All required sections are present and labelled: Review and Update Existing Tests (5), Run Tests and Verify Data State (6, with its report path), Manual Interface Testing (8, AGENT MUST EXECUTE, with error cases), End-to-End (9, stated as not applicable with a reason), Update Technical Documentation (10), and Pre-merge Review last (12, in the right order, with the archive commit before the merge).
- Mutating tasks: tasks 1.3 and 7.1 write `claim`, `evidence`, `cache_entry` and `query_log` rows. Restoration is in 8.3 and the re-check in 8.4. **I9 (improvable):**
  - 1.4 does not say that the restoration is deliberately deferred to 8.3.
  - 6.2 runs `npm run verify` on a database that still holds the "before" rows.
  - The reseed restores the seed state, not the 0.4 baseline (question 3).

  Correction: add to 1.4 "Restoration deferred to 8.3 (one reseed after both runs); 6.x runs against a database holding the 1.3 rows". Add to 8.4 "any acme-shop rows present in the 0.4 baseline that the reseed removed are listed in the report".

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Question and answer language (ADDED) | The language rule decides Spanish, English or nothing | 2.1, 2.2 |
| Question and answer language | An English answer to a Spanish question is reported and still returned | 4.1, 4.2 |
| Question and answer language | No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN | 4.1, 4.2 (scenario must be fixed, B2) |
| Prompt and evidence ids (MODIFIED) | Each span of the pack gets one evidence id in rank order | existing `tests/unit/explain/explain.spec.ts`; 5.1, 5.2 |
| Prompt and evidence ids | The prompt hash covers the whole prompt | existing tests; 5.1, 5.2 |
| Prompt and evidence ids | A change only in the omitted lines keeps the prompt hash | existing tests; 5.2 |
| Prompt and evidence ids | A Spanish question gets the explicit Spanish instruction | 3.1, 3.2 |
| Prompt and evidence ids | An English or undecided question keeps the generic system message | 3.1, 3.2 |
| Explain events and logging (MODIFIED) | Explaining writes nothing to the console | existing tests; 5.2 |
| Explain events and logging | Sanitisation events come first in every answer that reached the prompt | existing tests; 5.2 |
| Explain events and logging | No sanitisation event without a prompt | existing tests; 5.2 |
| Explain events and logging | Evidence broken events follow the sanitisation events and carry no content | existing tests; 5.2 |
| Explain events and logging | Entailment unverified events follow the evidence broken events and carry no content | existing tests; 5.2 |
| Explain events and logging | The language event follows the verification events and precedes the write events | 4.1, 4.2 |
| (AC5, process) | none (not system behaviour) | 1.1-1.4, 7.1-7.3 |
| (Ticket: DEMO.md) | none | 7.2, 10.1 |

No empty row.

## Corrections to apply

### `openspec/changes/answer-language/specs/explain/spec.md`

1. **(B1)** Requirement "Question and answer language". Replace the first two bullets with:
   - "The text between a backtick and the next backtick SHALL be ignored; an unmatched last backtick SHALL be treated as a plain character. The rest SHALL be split on whitespace into tokens, and each token SHALL lose **every** leading and trailing character of the set `¿ ¡ ? ! . , ; : " ' « » “ ” ‘ ’ ( ) [ ]`."
   - "A token that still holds a character that is not a Unicode letter (`\p{L}`) (`::`, `_`, `.`, `/`, `-`, a digit), or an uppercase letter after its first character (`DiscountService`), is code and SHALL NOT count. Every other token SHALL be compared in lowercase."

   If the author answers question 1 in favour of all-caps words, add: "…unless every letter of the token is uppercase, in which case it is compared in lowercase as a word."

   In the scenario "The language rule decides Spanish, English or nothing", add these inputs and results:
   - `«¿Dónde se aplica el cupón?»` → `es`
   - `pedido?? el precio` → `es`
   - `What is ``the`` price` → no decision (one English signal left)
   - `COMO SE CALCULA EL PRECIO` → no decision, or `es` per the author's answer to question 1
2. **(B2, I1)** Replace the scenario "No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN" with:

   ```
   #### Scenario: No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN

   - **GIVEN** the answer cache of the project holds, under the key of `¿Qué hace OrderObserver?`, a stored
     answered response whose `answer` is `OrderObserver sends an email to the customer.`
   - **WHEN** `¿Qué hace DiscountService?` is explained with `useCache: false` and a live model whose answer is
     `DiscountService calcula los descuentos de los pedidos.`, then `What does DiscountService do?` with
     `useCache: false` and a model whose answer is `DiscountService calculates discounts for orders.`, then
     `¿Qué hace OrderObserver?` with the cache on, then `¿Qué hace DiscountService?` with `useCache: false`
     and a model whose output is `{"answer": "DiscountService calculates discounts for orders based on the loyalty tier.", "statements": []}`,
     then `¿Qué hace DiscountService?` with `useCache: false` and a model whose answer is
     `DiscountService calculates discounts for orders based on the loyalty tier.` with every citation broken
   - **THEN** none of the five answers carries an `answer_language_mismatch` event; the third is a cache hit,
     the fourth is `UNKNOWN` `no-evidence` and the fifth is `UNKNOWN` `broken-evidence`
   ```
3. **(I2)** In the scenario "An English answer to a Spanish question is reported and still returned", replace "as it would be without the check" with: "`persisted: true`, and saved once in the answer cache under the question's key".
4. **(improvable)** Requirement "Prompt and evidence ids": after "added as its last line", add ", the nine lines joined by `\n` as in the generic message".

### `openspec/changes/answer-language/design.md`

5. **(I1)** D3: replace "once the statements are verified and before the claim write, the language event is … The answer's events become `[...sanitized.events, ...verified.events, ...languageEvents]`" with: "after the `broken-evidence` return (`explain.ts:355`) and before the claim write, the language events are … and only the answered answer's events become `[...events, ...languageEvents]`, passed to `storedAnswer` / `unsavedAnswer`; the `events` of the `broken-evidence` UNKNOWN stay `[...sanitized.events, ...verified.events]`."
6. **(B3)** D5 → "Conclusion rule": replace it with a classification per pair, based on the agent's reading of `answer` and of every statement `text`:
   - EN→ES: "prompt"
   - EN→EN: "model"
   - EN→mixed, or mixed→anything: "both"
   - ES→ES: "not reproduced"
   - ES→EN or ES→mixed: "regression"

   "Mixed" means the `answer` and the statements are not all in the same language. The rule's decision is recorded beside the reading but does not decide the label. Aggregate: the label shared by at least two of the three pairs, or "inconclusive" otherwise. A "regression" label on any pair is reported in the PR as a finding with a Follow-ups destination.
7. **(I4)** D5 → "What is recorded per pair": add "the end-to-end request duration and `usage.verification.calls`". Risks: replace "about six calls" with "seven `answer` calls plus their `verify` calls (up to 20 each)".
8. **(I6)** D6: "one sentence **in Spanish** explains…".
9. D1: replace "typed fast" with "typed without accents". If I5 is applied, rename `question-language.ts` to `text-language.ts` in D1 and D2.

### `openspec/changes/answer-language/proposal.md`

10. **(I4)** Impact → "Live measurement": replace "about six model calls on CPU" with "seven `answer` calls on CPU (3 before, 3 after, 1 CLI capture) plus their `verify` calls".

### `openspec/changes/answer-language/tasks.md`

11. Swap 0.1 and 0.2, so that confirming the branch is the first item of Step 0.
12. **(I7)** Split 1.3 into 1.3a/1.3b/1.3c and 7.1 into 7.1a/7.1b/7.1c (one question each, in the background with `Monitor`).
13. **(I8)** Split 6.2 into 6.2 (vitest, lint, typecheck, lint:architecture, docs:coverage), 6.3 (`npm run test:mutation`) and 6.4 (`npm run verify`). Renumber the following items and update the cross-references in 10.4 and 12.2.
14. **(I3)** 5.1: replace "(… answer `The final price.`, which now gets the event but asserts no events)" with "(… answer `The final price.`: one English signal, no decision, so no event)".
15. **(I9)** 1.4: add "Restoration deferred to 8.3 (one reseed after both runs); step 6 runs against a database that still holds the 1.3 rows." 8.4: add "list any acme-shop rows of the 0.4 baseline that the reseed removed."
16. 4.1: add the `broken-evidence` case of correction 2 to the test of the scenario "No language event…".

### Linear DIS-104 (Spanish; never edit the `[original]` block)

17. Comment on DIS-104:
    > **Auditoría de la spec (spec-auditor, 2026-10-26): CHANGES REQUIRED.** Puntos bloqueantes que se corrigen en el propio change `answer-language`: (1) la regla de idioma fija el conjunto exacto de comillas y signos que se quitan, si se quitan todos los de los extremos, qué es una letra (`\p{L}`) y qué pasa con una comilla invertida sin cerrar; (2) el escenario «No language event…» se reescribe con la entrada de caché sembrada, `useCache: false` explícito y un caso `broken-evidence`; (3) la regla de conclusión de la medición clasifica cada pareja (prompt, modelo, ambos, no reproducido, regresión) y da una conclusión global. Preguntas para la autora: ¿las preguntas en mayúsculas (`COMO SE CALCULA…`) deben contar como español?; ¿una respuesta en inglés con `answer_language_mismatch` debe guardarse en la caché (las repeticiones se servirían en inglés sin evento)?; ¿es aceptable que `npm run db:seed` borre las filas previas de acme-shop de la base local?
18. Optional, in the `[enhanced]` section → "Criterios de aceptación", AC5: add "la conclusión sigue la clasificación por pareja del design D5 (prompt, modelo, ambos, no reproducido, regresión)".
