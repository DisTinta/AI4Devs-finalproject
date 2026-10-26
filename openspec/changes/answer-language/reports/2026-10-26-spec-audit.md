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

## Resolution of run 1

Correction round 1 of an autonomous run (2026-10-26). *Agent's text: the questions were answered by the
agent as lead engineer, without the author; each decision is in `design.md` → Follow-ups (R1-R5) and
in a Spanish comment on DIS-104.* `openspec validate answer-language --strict` passes after the edits.

### Questions for the author

| Question | Resolution |
|---|---|
| Q1 All-uppercase questions | Decided by the agent (R1, destination A): a token whose letters are all uppercase is a word compared in lowercase. Added to the rule's second bullet, to the scenario (`COMO SE CALCULA EL PRECIO` gives `es`) and to D1. The existing tests with that question are cache hits and build no prompt (task 5.1 names them). |
| Q2 Caching an English answer | Decided by the agent (R2, destination D): it stays cacheable, as today; its repeats are served in English with `events: []`. Stated in D3, in Risks, in the proposal and pinned by the scenario "An English answer to a Spanish question is reported and still returned" (saved once in the answer cache). Not caching would change the cache rules, out of the ticket's scope. |
| Q3 Reseed against baseline | Decided by the agent (R3, destination A): acceptable; D5, tasks 1.4 and 8.4 say the reseed is deferred to 8.3 and that baseline rows it removes are listed in the step 8 report. |

### Findings and corrections

| Finding / correction | Resolution |
|---|---|
| B1 Tokenisation (correction 1) | Fixed: backtick pairs, unmatched last backtick as a plain character, the closed strip set (every leading and trailing character), `\p{L}` letters, all-caps exception. A second WHEN/THEN pair in the scenario covers quotes, repeated edge punctuation, all-caps, a backtick pair, an unmatched backtick and brackets. Two of the audit's proposed examples were corrected because they did not hold under the rule: `pedido?? el precio` has one Spanish signal (replaced by `el precio del pedido??`, `es`), and ``What is `the` price`` keeps two English signals (`what`, `is`; replaced by ``The `the` price``, no decision). |
| B2 Scenario "No language event…" (correction 2) | Fixed with the audit's text: seeded cache entry, explicit `useCache: false`, English `answer` in the no-statement output, five answers. |
| B3 Conclusion rule (correction 6) | Fixed: per-pair classification table, definition of "mixed", agent's reading decides, aggregate rule with "inconclusive", regression recorded as a finding (D5, task 7.3, proposal). |
| I1 `broken-evidence` path (corrections 2, 5, 16) | Fixed: fifth case in the scenario; D3 places the language events after the `broken-evidence` return and only on `storedAnswer` / `unsavedAnswer`; tasks 4.1 and 4.2. |
| I2 Loose "otherwise unchanged" (correction 3) | Fixed: `persisted: true` and saved once in the answer cache; task 4.1. |
| Correction 4 (nine lines joined by `\n`) | Fixed in the requirement and task 3.1. |
| Ambiguity "typed fast" (correction 9) | Fixed: "typed without accents". |
| I3 Task 5.1 note (correction 14) | Fixed. |
| I4 Call counts (corrections 7, 10) | Fixed in the proposal, D5 (duration and `usage.verification.calls` recorded) and Risks. |
| I5 Module name | Rejected (R4): `question-language.ts` is the name the ticket's reality-map gives, and its one public concept is the language rule. |
| I6 Spanish sentence in `docs/DEMO.md` (correction 8) | Fixed in D6 and task 10.1. |
| I7 Task size of 1.3 / 7.1 (correction 12) | Fixed: 1.3a-c and 7.1a-c, one question each, in the background with `Monitor`. |
| I8 Task 6.2 bundle (correction 13) | Fixed: 6.2 (vitest, lint, typecheck, lint:architecture, docs:coverage), 6.3 mutation, 6.4 verify; the following items renumbered to 6.5 and 6.6, and the references in 10.4 and 12.2 point to 6.6. |
| Step 0 order (correction 11) | Fixed: the branch is 0.1, the Linear status 0.2. |
| I9 Deferred restoration (correction 15) | Fixed in 1.4, 6.4, 8.4 and D5. |
| Correction 17 (Linear comment) | Replaced by this round's Spanish comment on DIS-104, which summarises the blocking points and the agent's decisions. |
| Correction 18 (edit AC5 of the ticket) | Rejected (R5): optional; D5 is the authority and the round's comment records the classification. |

---

## Run 2 (2026-10-26)

CHANGES REQUIRED

# Spec audit: `answer-language` (Linear DIS-104), run 2

- Date: 2026-10-26
- Change: `openspec/changes/answer-language/`. Read: `proposal.md`, `design.md`, `specs/explain/spec.md`, `tasks.md`, and `reports/2026-10-26-spec-audit.md` (run 1 and its resolution).
- Ticket: DIS-104 and its 5 comments, loaded through the Linear MCP. DIS-104 has **no parent** (`parentId` empty; it is only `relatedTo` DIS-103). The reference is the ticket's own `[enhanced]` AC1-AC5.
- Project inputs: `docs/base-standards.md`, `docs/openspec-tasks-mandatory-steps.md`, `docs/project-context.md` (LLM mode, line 41), `docs/AUTONOMOUS-RUN.md` §5 and `docs/adr/20261020-kit-autonomous-mode.md` (merge gate), `openspec/specs/explain/spec.md:477-524, 894-997`.
- Real code checked: `packages/core/src/explain/prompt.ts`, `packages/core/src/explain/explain.ts:205-373`, `packages/core/src/cache/response-cache.ts:31-34`, `packages/adapters/store-postgres/src/postgres-store.ts:380-396`, `packages/cli/src/commands/ask.ts`, `scripts/load-env.mjs`, `scripts/env.mjs:102-104`, and the tests that use `COMO SE CALCULA…`.

The round-1 decisions R1-R5, marked as the agent's text, are accepted. None of them contradicts the ticket or the project.

## Questions for the author

None. The one blocking finding is a process defect that the agent can fix inside the change.

## 1. Scope against the ticket: clean

Everything traces to DIS-104:
- AC1: the Spanish prompt.
- AC2: the generic prompt stays unchanged.
- AC3: the detector.
- AC4: the event.
- AC5: the measurement.
- Contexto técnico: `docs/DEMO.md`.

The R1 all-caps rule and the R2/R3 decisions answer run-1 questions and stay within the ticket. Nothing to cut.

## 2. Inherited acceptance criteria: not applicable (no parent); the ticket's own ACs are covered

| AC | Requirement | Scenario |
|---|---|---|
| AC1 | Prompt and evidence ids | A Spanish question gets the explicit Spanish instruction |
| AC2 | Prompt and evidence ids | An English or undecided question keeps the generic system message |
| AC3 | Question and answer language | The language rule decides Spanish, English or nothing (superset of the AC's examples) |
| AC4 | Question and answer language; Explain events and logging | An English answer…  is reported and still returned; No language event…; The language event follows… |
| AC5 | none (process deliverable) | design D5, tasks 1.x and 7.x; see blocking finding B1 |

## 3. Missing scenarios: clean

Every MUST clause has a scenario:
- the rule, both WHEN/THEN pairs;
- the event, both the positive case and the five negative cases (Spanish answer, English question, cache hit, `no-evidence`, `broken-evidence`);
- "otherwise unchanged": `persisted: true` and one cache save;
- the codes-only payload;
- the position of the event in the ordering;
- the Spanish and the generic system message.

I checked every example of the rule's scenario by hand against the rule, and all the stated results hold. Some examples:
- `«¿Dónde se aplica el cupón?»` gives 5 Spanish signals.
- `` the price `of `` leaves one English signal: `` `of `` holds a backtick, so it is code.
- `[the] (of)` gives 2 English signals.

## 4. Ambiguity: clean

The only listed word left in the change is "however many statements cite it" (`specs/explain/spec.md:165`). It is copied unchanged from the main spec and is not vague. The "typed fast" of run 1 is gone.

## 5. Open decisions

- **B1 (blocking): the CLI capture in task 7.2 / design D6 is served from the answer cache, not from the model.**
  - `npm run cli -- ask` calls `explain` without `useCache` (`packages/cli/src/commands/ask.ts:107`), and the CLI has no option to turn the cache off. So the cache is on.
  - `useCache: false` still saves a cacheable answer (design D5 → State, `explain.ts:213-215`), and `saveCacheEntry` replaces the entry of its key (`postgres-store.ts:389-391`).
  - So by task 7.2 the key of `¿Qué hace DiscountService?` holds the answer of 1.3a, replaced by the answer of 7.1a. The reseed is deferred to 8.3, so nothing clears it.
  - The CLI "capture" is therefore a cache hit:
    - `events: []`, so no `answer_language_mismatch` line;
    - near-zero duration;
    - no model call.
  - This contradicts:
    - D6, "the 'after' output … whatever its language", with the duration of that capture in `Cómo se capturó` (a live-model section of `docs/DEMO.md`);
    - the call counts ("seven `answer` calls … 1 CLI capture") in `proposal.md` → Impact and in design Risks;
    - task 10.1.

  The implementer would have to decide alone whether a cache hit is acceptable, or how to force a live call.

  **Correction:** clear the live rows before the "after" run, and make the CLI capture the first call of step 7:
  1. add task 7.0: `npm run db:seed` and `npm run verify` exit `0`;
  2. run the CLI capture (today's 7.2) before starting the API;
  3. then run 7.1a-c, which use `useCache: false`, so the CLI's entry does not affect them.

  Update D5 → State, D6 and tasks 1.4 / 6.4 to match: one reseed before step 7 and one in 8.3.

## 6. Contradictions inside the change: one, part of B1

The call count "seven `answer` calls (3 before, 3 after, 1 CLI capture)" (`proposal.md` → Impact, design Risks) is false today, because the CLI capture is a cache hit. It becomes true once B1 is applied. No other contradiction:
- the proposal, D2/D3 and the delta agree on the message texts, the event placement, the cacheability (R2) and the ordering;
- task 3.1 agrees with the delta's nine lines.

## 7. Contradictions with the project: clean

- The two MODIFIED requirements match `openspec/specs/explain/spec.md:477-524` and `:894-997` word for word, except for the added paragraph, the new event bullet, the order clause and the privacy sentence.
- Task 12.7, where the agent merges through `gh pr merge <n> --merge`, is sanctioned for autonomous runs by `docs/AUTONOMOUS-RUN.md` §5 and `docs/adr/20261020-kit-autonomous-mode.md` (D4).
- The base branch `final-project-CRN` and the branch name follow `docs/project-context.md`.

## 8. Contrast with the real code

- **D2 is consistent.** `EXPLAIN_SYSTEM_PROMPT` has eight lines and the fifth is `Answer in the language of the question.` (`prompt.ts:15-24`). `ExplainPrompt` is built only by `buildPrompt` (`prompt.ts:46-69`).
- **D3 is consistent.** `events` is built at `explain.ts:354` and returned by `broken-evidence` at `:355`. `storedAnswer` and `unsavedAnswer` receive it at `:368` and `:371`. `unsavedAnswer` appends `claims_not_persisted` (`:464`). `finish` appends `answer_not_cached` and `query_not_logged` (`:221, 276-280`). The order in the delta holds.
- **The cache claims hold.** `isCacheable` (`response-cache.ts:31-34`) makes an unsaved answer not cacheable, which matches the last scenario ("so no `answer_not_cached`"). It makes the `no-evidence` `UNKNOWN` cacheable, which is harmless to the scenario "No language event…" because its later steps use `useCache: false`.
- **B1 (above)** concerns the CLI path: `packages/cli/src/commands/ask.ts:107` and `postgres-store.ts:389-391`.
- **I1 (improvable): evaluation mode in task 8.1.**
  - 8.1 says to start the API "in evaluation mode (no `LLM_*` variables)".
  - `scripts/env.mjs:103` fills from `.env` every variable that is not already set, so a `LLM_BASE_URL` in the author's `.env` would put the API in live mode.
  - In live mode, `¿Qué hace DiscountService?` would reach Ollama instead of answering `llm-required`.
  - The agent may not read `.env`.
  - Correction: "with `LLM_BASE_URL=` and `LLM_API_KEY=` set empty in the command's environment (an empty variable is kept over `.env`; both empty is evaluation mode, `docs/project-context.md:41`)".
- **I2 (improvable): the code-token clause of the rule.** The sentence "A token that still holds a non-`\p{L}` character … or an uppercase letter after its first character … is code … unless every letter of the token is uppercase" can be read as applying the exception to both conditions. Under that reading:
  - `PÁGINA_1` or `AÑO-2024` would count as Spanish signals;
  - a token with no letter at all (`123`) would be vacuously "all uppercase".

  D1 attaches the exception only to the uppercase condition. Write the spec the same way (see corrections).

## 9. Task size: clean

The live calls are one per task (1.3a-c, 7.1a-c) and run in the background with `Monitor`. Mutation testing has its own task (6.3). Tasks 4.1 (three scenario tests) and 5.1 (reading nine test files) fit in one turn.

## 10. Mandatory steps

- Step 0 is first and 0.1 is the branch. The required sections are present, labelled and in order:
  - 5, review existing tests;
  - 6, run tests and verify data state, with its report path;
  - 8, manual interface testing, AGENT MUST EXECUTE, with error cases;
  - 9, end-to-end, not applicable with a reason;
  - 10, documentation;
  - 12, pre-merge review, last, with the archive commit before the merge.
- Mutating tasks restore state: one reseed in 8.3, re-checked against 0.4 in 8.4. B1 adds one reseed before step 7.
- **I3 (improvable):** task 5.1 does not name `tests/integration/cli/seed-load.spec.ts:350`. That test sends the all-caps question, which is now `es` under R1. It is a cache hit in evaluation mode, so no prompt is built and nothing changes. Add it to the list for completeness.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Question and answer language (ADDED) | The language rule decides Spanish, English or nothing | 2.1, 2.2, 2.3 |
| Question and answer language | An English answer to a Spanish question is reported and still returned | 4.1, 4.2 |
| Question and answer language | No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN | 4.1, 4.2 |
| Prompt and evidence ids (MODIFIED) | Each span of the pack gets one evidence id in rank order | existing test (`tests/unit/explain/explain.spec.ts`); 5.1, 5.2 |
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
| (AC5, process) | none (not system behaviour) | 1.1-1.4, 7.1-7.3 (B1 affects 7.2) |
| (Ticket: `docs/DEMO.md`) | none | 7.2, 10.1 (B1) |

No empty row.

## Corrections to apply

### `openspec/changes/answer-language/tasks.md`

1. **(B1)** Section 7. Add as the first item:

   `- [ ] 7.0 Clear the live rows of step 1 before the "after" run: \`npm run db:seed\` (API stopped), then \`npm run verify\` exits \`0\`; the 1.3 results are already in the 1.4 report`

   Then move today's 7.2 (CLI capture) before 7.1, with this wording:

   `- [ ] 7.1 \`npm run cli -- ask acme-shop "¿Qué hace DiscountService?"\` with the \`LLM_*\` variables of 1.2 in the command's environment, in the background with \`Monitor\`, timed; it is the first call after the reseed, so a cache miss and a live \`answer\` call (check that the output is not a cache hit); keep the full output and the \`explain event\` lines for \`docs/DEMO.md\` (design D6)`

   Then start the API (today's 7.1), run 7.1a-c with `useCache: false` as they are, and stop the API. Renumber the items and update the references in 7.3, 8.1, 9.1, 10.1 and 12.3.
2. **(B1)** 1.4: replace "Restoration deferred to 8.3 (one reseed after both runs); step 6 runs against a database that still holds the 1.3 rows" with "The 1.3 rows are cleared by the reseed of 7.0 and the final state is restored in 8.3; step 6 runs against a database that still holds the 1.3 rows".
3. **(I1)** 8.1: replace "with the API in evaluation mode (no `LLM_*` variables)" with "with the API in evaluation mode (`LLM_BASE_URL=` and `LLM_API_KEY=` set empty in the `npm run dev` command's environment: an empty variable is kept over `.env`, and both empty is evaluation mode)".
4. **(I3)** 5.1: add `tests/integration/cli/seed-load.spec.ts` ("COMO SE CALCULA…", an evaluation-mode cache hit, no prompt built).

### `openspec/changes/answer-language/design.md`

5. **(B1)** D5 → State: replace "The reseed is deferred to after both runs, so step 6 runs against a database that still holds the "before" rows." with "A first reseed (task 7.0) clears the "before" rows ahead of the "after" run, so that the CLI capture of D6 reaches the model instead of the answer cache (the CLI has no `useCache` option, and `useCache: false` still saves); step 6 runs against a database that still holds the "before" rows; the final reseed is task 8.3."
6. **(B1)** D6: after "taken with the CLI", add "as the first call after the reseed of task 7.0, so it is a cache miss and a live `answer` call (a cache hit would carry no event and no model duration)".
7. **(B1)** Risks → "The live run mutates the author's local database": "Restored with `npm run db:seed` (once before the "after" run, task 7.0, and once at the end, 8.3)…".

### `openspec/changes/answer-language/specs/explain/spec.md`

8. **(I2)** Requirement "Question and answer language", second bullet. Replace it with: "A token that still holds a character that is not a Unicode letter (`\p{L}`) (`::`, `_`, `.`, `/`, `-`, a digit, a backtick) is code and SHALL NOT count. A token made only of letters is code and SHALL NOT count when it has an uppercase letter after its first character (`DiscountService`), unless every one of its letters is uppercase (`COMO`), in which case it is a word. Every token that counts SHALL be compared in lowercase." Optionally, add `AÑO-2024` → no decision to the second WHEN/THEN pair of the rule's scenario, and to task 2.1.

### `openspec/changes/answer-language/proposal.md`

9. **(B1)** What Changes → measured comparison and Impact → Live measurement: add "the CLI capture of `docs/DEMO.md` runs right after a reseed, so it is a live call and not a cache hit".

### Linear DIS-104 (Spanish; never edit the `[original]` block)

10. Comment:
    > **Auditoría de la spec, ronda 2 (spec-auditor, 2026-10-26): CHANGES REQUIRED, 1 punto bloqueante.** La captura de la CLI para `docs/DEMO.md` (tarea 7.2, design D6) saldría de la caché de respuestas y no del modelo: la CLI no tiene `useCache: false` y las llamadas 1.3a y 7.1a ya guardan la respuesta de `¿Qué hace DiscountService?`. Así no tendría el evento `answer_language_mismatch` ni la duración real. Se corrige en el propio change con un `npm run db:seed` antes de la tanda «después» (tarea 7.0) y con la captura de la CLI como primera llamada tras el reseed. Mejoras menores: modo evaluación de la tarea 8.1 con `LLM_BASE_URL=` y `LLM_API_KEY=` vacías en el entorno, redacción de la excepción de mayúsculas en la regla de idioma y un test más en la lista de la 5.1. Las decisiones R1-R5 de la ronda 1 se aceptan.

## Resolution of run 2

Correction round 2 of an autonomous run (2026-10-26). *Agent's text: run 2 asked no question for the
author; the agent's choices in applying its findings are in `design.md` → Follow-ups (R6-R8) and in a
Spanish comment on DIS-104.* Every claim of B1 and I1 was checked against the code:
`packages/cli/src/commands/ask.ts:97-108` calls `explain` with no `useCache`, and `scripts/env.mjs:103`
fills only variables that are not already set. `openspec validate answer-language --strict` passes
after the edits.

### Questions for the author

None in run 2.

### Findings and corrections

| Finding / correction | Resolution |
|---|---|
| B1 CLI capture served from the cache (corrections 1, 2, 5, 6, 7, 9) | Fixed, decided by the agent (R6, destination A): new task 7.0 reseeds and runs `npm run verify` before the "after" run; the CLI capture is task 7.1, the first call after the reseed, with a check that it is not a cache hit; the API run follows as 7.2 (start), 7.2a-c (`useCache: false`), 7.3 (stop); the report is 7.4. References updated in 1.1 (skip 7.0-7.4), 8.1 and 9.1 (7.1 and 7.2a-c) and 10.1 (the 7.1 CLI output); 12.3 refers to step 7 as a whole and needs no change. 1.4, D5 → State, D6, Risks (call count and database restoration) and the proposal (What Changes and Impact) say the capture is live because it follows the reseed. Adding a cache option to the CLI was not chosen: it widens the ticket's scope. |
| I1 Evaluation mode in task 8.1 (correction 3) | Fixed (R7, destination A): `LLM_BASE_URL=` and `LLM_API_KEY=` set empty in the `npm run dev` command's environment. |
| I2 Code-token clause of the rule (correction 8) | Fixed (R8, destination A): the spec's second bullet separates the two conditions, so the all-uppercase exception applies only to tokens made only of letters; D1 says the same. The optional example was added as `AÑO-2024 PÁGINA_1` (no decision) rather than `AÑO-2024` alone, because a single token is below the two-signal threshold under either reading and would not tell them apart; it is also in task 2.1. |
| I3 `tests/integration/cli/seed-load.spec.ts` (correction 4) | Fixed: named in task 5.1 (an evaluation-mode cache hit, no prompt built). |
| Contradiction in the call count (section 6) | Fixed by B1: the seventh `answer` call (the CLI capture) is now live. |
| Correction 10 (Linear comment) | Replaced by this round's Spanish comment on DIS-104, which summarises the finding and the agent's decisions. |

---

## Run 3 (2026-10-26)

APPROVED

# Spec audit: `answer-language` (Linear DIS-104), run 3

- Date: 2026-10-26
- Change: `openspec/changes/answer-language/`. I read `proposal.md`, `design.md`, `specs/explain/spec.md`, `tasks.md`, and `reports/2026-10-26-spec-audit.md` (runs 1 and 2 and their resolutions) for context.
- Ticket: DIS-104 and its 6 comments, loaded through the Linear MCP. DIS-104 has **no parent** (`parentId` is empty; the ticket is only `relatedTo` DIS-103). The reference is the ticket's own `[enhanced]` AC1-AC5.
- Project inputs: `docs/base-standards.md` (§7.1), `docs/openspec-tasks-mandatory-steps.md` and `openspec/specs/explain/spec.md:490-494, 929-934`.
- Real code checked: `packages/core/src/explain/prompt.ts`, `packages/core/src/explain/explain.ts:205-467`, `packages/cli/src/commands/ask.ts:79-122`, `tests/support/explain-doubles.ts`, and the use of `normalize(` in `packages/core/src`.

The decisions the agent took in correction rounds 1 and 2 are accepted. Each is marked as the agent's text (R1-R8 in `design.md` → Follow-ups), and none contradicts the ticket or the project.

## Questions for the author

None.

## 1. Scope against the ticket: clean

Every part of the change traces to DIS-104:

| Part of the change | Source in DIS-104 |
|---|---|
| Spanish system message | AC1 |
| Generic message kept byte for byte | AC2 |
| `detectLanguage` | AC3 |
| `answer_language_mismatch` | AC4 |
| Measured comparison | AC5 |
| `docs/DEMO.md` | Contexto técnico |

The reseed in task 7.0 and the CLI capture in task 7.1 are process steps that serve AC5 and the `docs/DEMO.md` item. They add no product scope. Adding a cache option to the CLI was rejected precisely to avoid widening the scope (R6). Nothing to cut.

## 2. Inherited acceptance criteria: not applicable (no parent); the ticket's own ACs are covered

| AC | Requirement | Scenario |
|---|---|---|
| AC1 | Prompt and evidence ids | A Spanish question gets the explicit Spanish instruction |
| AC2 | Prompt and evidence ids | An English or undecided question keeps the generic system message |
| AC3 | Question and answer language | The language rule decides Spanish, English or nothing (covers all of the AC's examples: `¿Cómo se validan los cupones?`, `What does OrderObserver do?`, `price`, `ok`, `''`, `DiscountService`) |
| AC4 | Question and answer language; Explain events and logging | An English answer to a Spanish question is reported and still returned; No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN; The language event follows the verification events and precedes the write events |
| AC5 | none (process deliverable) | design D5 (questions, procedure, per-pair classification, aggregate), tasks 1.x and 7.x |

## 3. Missing scenarios: clean

Every MUST clause has a scenario:
- the rule (two WHEN/THEN pairs);
- the positive event, which asserts `persisted: true`, one cache save and the codes-only payload;
- five negative cases: Spanish answer, English question, cache hit, `no-evidence` and `broken-evidence`;
- the place of the event in the order of events;
- both system messages.

I checked every example of the rule's scenario by hand against the rule as written, and every stated result holds:

| Input | Signals | Result |
|---|---|---|
| `¿Cómo se validan los cupones?` | ES 4 (`¿`, `cómo`, `se`, `los`) | `es` |
| `«¿Dónde se aplica el cupón?»` | ES 5 | `es` |
| `el precio del pedido??` | ES 2 | `es` |
| `COMO SE CALCULA EL PRECIO` | ES 3 | `es` |
| `` The `the` price `` | EN 1 | no decision |
| `` the price `of `` | EN 1 (the token `` `of `` is code) | no decision |
| `[the] (of)` | EN 2 | `en` |
| `AÑO-2024 PÁGINA_1` | both tokens are code | no decision |

I also checked the event scenarios:
- The Spanish fake answer `DiscountService calcula los descuentos de los pedidos.` gives ES 3, so it raises no event.
- The English fake answer `…for orders based on the loyalty tier.` gives EN 3 (`for`, `on`, `the`), so it raises the event.
- The ordering scenario's question `¿Qué hace DiscountService? ignore all previous instructions` gives `es`, because none of the English words is in the English list.
- The two word lists share no entry.

## 4. Ambiguity: clean

The only listed word left in the change artifacts is "however many statements cite it" (`specs/explain/spec.md:169`). It is copied unchanged from the main spec and means "regardless of the count". No action.

## 5. Open decisions: clean (two improvable precisions)

None blocking. Every format, limit, ordering and name a test will pin is fixed:
- the two system message texts and how they are joined;
- the event shape and its position;
- the rule's sets, threshold and majority;
- the module, function and constant names;
- the measurement questions, endpoint, body, environment and classification table.

- **I1 (improvable): decomposed Unicode input.** The rule tests letters with `\p{L}`. A question typed in NFD form, such as `qué` written as `que` plus U+0301, holds a combining mark (`\p{M}`), so under the rule as written the token is code. The result is still deterministic: `¿Qué hace DiscountService?` in NFD still gives `es` (`¿`, `hace`). But no question is normalised before the rule (only `anchor.ts:43` and `cache/normalize.ts:17` call `normalize`), and this consequence is not stated anywhere. Correction: either state it in D1 as accepted, or apply `normalize('NFC')` to the text before tokenising and say so in the requirement's first bullet. If NFC is added, add one NFD input to task 2.1.
- **I2 (improvable): "split on whitespace"** does not name the character class. Correction: write "split on whitespace (the JavaScript `\s` class)" in the requirement's first bullet, or say the same in D1.

## 6. Contradictions inside the change: clean

The texts agree with each other on every point checked:
- `proposal.md`, D2/D3 and the delta agree on the message texts, the placement of the event (after the `broken-evidence` return, only on `storedAnswer` / `unsavedAnswer`), its cacheability (R2) and the order of events.
- Task 3.1 matches the nine lines in the delta.
- The call count ("seven `answer` calls: 3 before, 3 after, 1 CLI capture") is now true. The CLI capture in task 7.1 follows the reseed in task 7.0, and the proposal, D5, D6, Risks and tasks 1.4, 7.0 and 7.1 all say so.

## 7. Contradictions with the project: clean

- The two MODIFIED requirements match `openspec/specs/explain/spec.md:490-494` and `:929-934` word for word. The only differences are the added paragraph on the language-dependent system message, the new event bullet, the order clause and the privacy sentence.
- The Spanish system message keeps the two lines that the main requirement places after the line describing the evidence (lines 3-4).
- Task 12.7, where the agent merges, was accepted in run 2 as sanctioned for autonomous runs (`docs/AUTONOMOUS-RUN.md` §5, `docs/adr/20261020-kit-autonomous-mode.md`).

## 8. Contrast with the real code: clean

- **D2.** `EXPLAIN_SYSTEM_PROMPT` has eight lines and the fifth is `Answer in the language of the question.` (`packages/core/src/explain/prompt.ts:15-24`). `buildPrompt` (`:46-69`) is the only producer of `ExplainPrompt`, so adding `questionLanguage` breaks no caller.
- **D3.**
  - `events` is built at `explain.ts:354` and returned by `broken-evidence` at `:355`.
  - `storedAnswer` / `unsavedAnswer` receive it at `:368` and `:371`.
  - `unsavedAnswer` appends `claims_not_persisted` at `:464`.
  - `finish` / `withEvents` append `answer_not_cached` and `query_not_logged` at `:213-221` and `:276-280`.
  - `no-evidence` returns at `:333` with only `sanitized.events`.

  The delta's order and its five negative cases follow from this code.
- **CLI.** `packages/cli/src/commands/ask.ts:107` calls `explain` with no `useCache`. `:112` logs every event at `info` except `evidence_broken`. So the check in task 7.1 (no cache hit; the `answer_language_mismatch` line appears when the answer is English) is observable.
- The test doubles (`tests/support/explain-doubles.ts`) expose `findCacheEntry` / `saveCacheEntry` and `ownGraph`, which is enough to seed the cache entry and anchor `DiscountService` / `OrderObserver` as the scenarios require.
- The change duplicates no existing abstraction. The new pure module follows the pattern of the other modules of `explain/`.

## 9. Task size: clean

Each live call is its own task and runs in the background with `Monitor` (1.3a-c, 7.1, 7.2a-c). Mutation testing is its own task (6.3). Task 4.1 (three scenario tests) and task 5.1 (reviewing the listed test files) each fit in one turn.

## 10. Mandatory steps: clean

- Step 0 comes first, and 0.1 is the branch (`feature/dis-104-answer-language`, from `final-project-CRN`).
- Every required section is present, labelled and in order:
  - 5: Review and Update Existing Tests;
  - 6: Run Tests and Verify Data State, with its report path and the §6 template;
  - 8: Manual Interface Testing, AGENT MUST EXECUTE, with the error cases 400 and 404;
  - 9: End-to-End, marked not applicable with a reason;
  - 10: Update Technical Documentation;
  - 12: Pre-merge Review, last, with the three checks in order and the archive commit before the merge.
- Mutating tasks restore state:
  - 0.4 records the baseline;
  - 7.0 reseeds before the "after" run;
  - 8.3 runs the final reseed and `npm run verify`;
  - 8.4 re-checks the 0.4 counts and lists any baseline rows removed.

## 11. Traceability

| Requirement | Scenario | Task(s) |
|---|---|---|
| Question and answer language (ADDED) | The language rule decides Spanish, English or nothing | 2.1, 2.2, 2.3 |
| Question and answer language | An English answer to a Spanish question is reported and still returned | 4.1, 4.2 |
| Question and answer language | No language event for a Spanish answer, an English question, a cache hit or an UNKNOWN | 4.1, 4.2 |
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
| (AC5, process) | none (not system behaviour) | 1.1-1.4, 7.0-7.4 |
| (Ticket: `docs/DEMO.md`) | none | 7.1, 10.1 |

No empty row.

## Corrections to apply

All of these are improvable and optional. None blocks the apply step.

### `openspec/changes/answer-language/specs/explain/spec.md`

1. **(I1, I2)** Requirement "Question and answer language", first bullet. Replace "The rest SHALL be split on whitespace into tokens" with:

   "The rest SHALL be split on whitespace (the JavaScript `\s` class) into tokens"

   If the NFC option of I1 is chosen, prefix the bullet with:

   "The text SHALL first be normalised to Unicode NFC."

### `openspec/changes/answer-language/design.md`

2. **(I1)** D1: add one sentence. Either:
   - "Input is normalised to NFC before tokenising, so a decomposed accent counts as a letter", or
   - "Input is not normalised: a decomposed accent (combining mark) makes its token code; accepted, since `¿` and the unaccented list words still decide typical questions."

### `openspec/changes/answer-language/tasks.md`

3. **(I1)** Do this only if NFC normalisation is chosen. In task 2.1, add a case: the NFD form of `¿Qué hace DiscountService?` gives `es`, and a single NFD accented word counts as a Spanish signal.

### Linear DIS-104 (Spanish; never edit the `[original]` block)

4. Comment:
   > **Auditoría de la spec, ronda 3 (spec-auditor, 2026-10-26): APPROVED, 0 puntos bloqueantes.** Las correcciones de las rondas 1 y 2 (R1-R8) se aceptan. Mejoras opcionales: indicar en la regla de idioma qué cuenta como espacio (`\s`) y decidir si el texto se normaliza a NFC antes de separar los tokens (un acento descompuesto hoy convierte la palabra en código). El change puede pasar a apply.
