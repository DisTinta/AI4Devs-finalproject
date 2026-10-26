## Context

See `proposal.md` → Why. Linear DIS-104 has no parent ticket; its `[reality-map]` and `[enhanced]`
sections and the enrich comment of 2026-10-26 are the inputs of this design.

Current state (`packages/core/src/explain/`):

- `prompt.ts` → `buildPrompt(sanitized)` always sends `EXPLAIN_SYSTEM_PROMPT` (eight lines, the fifth
  `Answer in the language of the question.`) and hashes `JSON.stringify(messages)` as `promptHash`.
- `explain.ts` → `answerQuestion` builds the prompt, calls the model once (`answer`), quarantines the
  output, types and verifies the statements and builds a stored or an unsaved answer whose events are
  `[...sanitized.events, ...verified.events]` (`unsavedAnswer` appends `claims_not_persisted`;
  `finish` appends `answer_not_cached` and `query_not_logged`).
- The answer cache key is `normalizeQuestion(question)`, not `promptHash`, and a cached response is
  stored without its events (`packages/core/src/cache/response-cache.ts`): the golden answers Q1, Q3
  and Q4 keep being served whatever the prompt says, and a hit carries `events: []`.
- The transports already write every event with no change: `packages/api/src/routes/ask.ts` (request
  log, `info` for all but `evidence_broken`) and `packages/cli/src/commands/ask.ts` (JSON lines on
  stderr). `toPublicAnswer` does not expose events.

Layer order (`.claude/sdd-harness.env` → `LAYER_ORDER`): test → domain (`packages/core`). There is no
port, adapter, Zod schema or route in this change.

## Goals / Non-Goals

**Goals:**

- Make a Spanish question ask the model for Spanish explicitly, without touching the prompt of any
  other question.
- Detect, with codes only, a live answer in English to a Spanish question.
- Measure on the real local model whether the cause is the model, the prompt or both.

**Non-Goals:** those of `proposal.md` (no translation or retry, no other languages, no dependency,
no model change, no public exposure of the event). At design level also: no change to the `verify`
prompt of the semantic check, and no check of the statements' texts (D4).

## Decisions

### D1. A pure, closed language rule in core

New module `packages/core/src/explain/question-language.ts` exporting
`detectLanguage(text: string): 'es' | 'en' | null` (and the type `TextLanguage = 'es' | 'en'`),
exported through `packages/core/src/explain/index.ts`. It implements exactly the rule of the delta
spec (requirement "Question and answer language"): backtick spans ignored, whitespace tokens with
their edge punctuation stripped, code-like tokens skipped, the two closed word lists as
`ReadonlySet<string>`, `¿`/`¡` and accented/`ñ` tokens as Spanish signals, threshold of two signals
and a strict majority. No regular expression with nested quantifiers (linear in the text; the
question is already bounded by `parseExplainRequest`, and the answer by the model output limit of
`parseModelOutput`).

- *Alternative: a detection library* (franc, cld). Rejected: a new dependency (supply chain, size,
  `npm audit`) for two languages, and it is not deterministic enough on 3-word questions.
- *Alternative: ask the model which language the question is in.* Rejected: one more paid call per
  answer and a new failure mode.
- *Alternative: only look for `¿`/accents.* Rejected: `Como se calcula el precio` (no accents, typed
  fast) would get no decision; the word lists catch it.

### D2. The system message is chosen by the question's language; the generic one is untouched

`prompt.ts` keeps `EXPLAIN_SYSTEM_PROMPT` byte for byte and adds the exported constant
`EXPLAIN_SYSTEM_PROMPT_ES`, built from the same lines with the fifth replaced and the Spanish
reminder appended (the exact texts are in the delta spec). `buildPrompt` calls
`detectLanguage(sanitized.question)` (the sanitised question, before `neutralise`: sanitisation only
cuts and flags, and the zero-width spaces of `neutralise` would split words) and uses the Spanish
message only for `'es'`. `ExplainPrompt` gains `questionLanguage: TextLanguage | null`, so `explain`
reuses the decision instead of detecting twice.

The Spanish instruction is in English (like the rest of the system message, which a 7B code model
follows best in English) and names the two fields the reader sees; the last line repeats it in
Spanish because the end of the system message is the instruction nearest to the user message
(recency), and the user message is mostly English code.

- *Alternative: change the instruction for every question.* Rejected: it changes every prompt hash
  and the existing tests that pin `EXPLAIN_SYSTEM_PROMPT`, for no observed problem in English.
- *Alternative: put the instruction in the user message.* Rejected: the user message is JSON data
  between untrusted markers by design (DIS-41); instructions belong to the system message.

### D3. The check is an event on answered answers from the model, placed after verification

In `answerQuestion`, once the statements are verified and before the claim write, the language event
is `[{ type: 'answer_language_mismatch', expected: 'es' }]` when `prompt.questionLanguage === 'es'`
and `detectLanguage(parsed.output.answer) === 'en'`, else `[]`. The answer's events become
`[...sanitized.events, ...verified.events, ...languageEvents]`, so it lands after the
`entailment_unverified` events and before `claims_not_persisted`, `answer_not_cached` and
`query_not_logged` (the order of the delta spec). The `UNKNOWN` branches keep their events as today.
New interface `AnswerLanguageMismatchEvent { type: 'answer_language_mismatch'; expected: 'es' }` in
`explain-event.ts`, added to the `ExplainEvent` union. A cache hit never reaches this code.

The event is information, not a failure: the transports log it at `info` with no change (the API's
level rule only singles out `evidence_broken`).

- *Alternative: discard the answer or answer `UNKNOWN`.* Rejected (ticket non-goal): the content can
  be right and cited; only its language is wrong.
- *Alternative: retry with a stronger prompt.* Rejected (ticket non-goal): doubles the CPU time
  (minutes per call) for an uncertain gain.
- *Alternative: carry the detected signals in the event.* Rejected: counts of words are a fingerprint
  of the text; the event carries codes only, like every other `explain` event.

### D4. Only the `answer` text is checked

The statements are short and full of identifiers (`PriceCalculator::compute applies the discount`),
so the rule often gives no decision on them, while the `answer` paragraph is what the reader sees
first. One event per answer is enough to notice the problem. Checking each statement is destination
**D** (accepted): it would add events without adding a decision.

### D5. The measurement: same questions, current prompt then new prompt, through the API

- **Questions** (outside the golden cache, each anchors in acme-shop): `¿Qué hace DiscountService?`,
  `¿Qué hace ShippingService?` and `¿Qué hace TaxService?`.
- **Before** (current prompt): task 1, before any source change of this branch, so the running code
  is the base's.
- **After** (new prompt): task 7, once the implementation is green.
- **How:** the author's local database (seeded, `npm run verify` exit `0` first); the local Ollama at
  `http://localhost:11434` with `qwen2.5-coder` (`ollama list`); the API started with `npm run dev`
  with the `LLM_*` variables given in that command's environment (`LLM_BASE_URL=http://localhost:11434/v1`,
  `LLM_MODEL=qwen2.5-coder`, `LLM_API_KEY=` empty, `LLM_TIMEOUT_MS=1200000`): `scripts/load-env.mjs`
  keeps a variable already set, and `.env` is never read or edited by the agent. Each question is
  sent once per prompt with `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask` and body
  `{"question": "…", "useCache": false}`, timed; the API's request log gives the events.
- **What is recorded per pair:** the language the rule gives for `answer` and for each statement
  text (and the agent's reading of it), the events, the duration, the model and the Ollama version.
- **Conclusion rule:** new prompt Spanish where the old was English → the prompt was the cause (the
  model can answer in Spanish when told plainly); English with both prompts → the model (7B does not
  follow it); mixed → both. Three pairs are a small sample: the report says so and does not claim a
  rate.
- **State:** each live call writes `claim`, `evidence`, `cache_entry` and `query_log` rows for
  acme-shop (`useCache: false` still saves a cacheable answer). After the "after" run, `npm run
  db:seed` restores the sample project (it deletes by cascade the sample's rows and reloads the seed
  and the golden cache), and `npm run verify` must exit `0`. No integration test runs while a live
  `ask` is in flight (`docs/project-context.md`: the `query_log` insert locks the project row).
- **Fallback:** if Ollama does not answer in task 1 or 7, the measurement becomes destination **C**
  (explicit debt): a Spanish checklist comment on DIS-104 and a Follow-ups line here; the code and
  the unit tests still ship, and `docs/DEMO.md` keeps its output with a note that it predates the
  change.

### D6. `docs/DEMO.md` shows the measured output

The pasted CLI output of `Probar con un modelo real` is replaced by the "after" output of
`¿Qué hace DiscountService?` taken with the CLI (`npm run cli -- ask acme-shop "¿Qué hace DiscountService?"`
with the same `LLM_*` environment), whatever its language, and one sentence explains that an English
answer to a Spanish question adds the `answer_language_mismatch` line. `Cómo se capturó` gains the date,
model and duration of that capture. `tests/unit/docs/guides.spec.ts` keeps passing (it pins commands
and settings of the section, not the answer).

### D7. No ADR

The change is local to `explain` in core, reversible by reverting one module and two call sites, and
adds no dependency or cross-module contract beyond one event type. A design decision, not an ADR
(`docs/base-standards.md`).

## Risks / Trade-offs

- [The rule misreads a mixed question, e.g. `¿What does PriceCalculator do?`] → It gives a decision
  only with two signals and a strict majority; a wrong `es` only adds an instruction to answer in
  Spanish, and a wrong `null` keeps today's prompt. Neither breaks an answer.
- [The 7B model ignores even the explicit instruction] → The event makes it visible in the logs and
  the report says the cause is the model; changing the model is out of scope (D).
- [Prompt hashes of Spanish questions change] → Expected and covered by the spec (the hash is over
  what is sent). The golden cache is keyed by the normalized question, so no golden answer moves.
  Claims stored before keep their old hash in their provenance, which is correct (it is what was sent
  then).
- [The live measurement takes long on CPU (about six calls of minutes each, plus `verify` calls)] →
  `LLM_TIMEOUT_MS=1200000`; runs in the background with `Monitor`; fallback D5.
- [The live run mutates the author's local database] → Restored with `npm run db:seed`, checked with
  `npm run verify` and the counts recorded before (task 1).
- [Mutation testing of the word lists] → Each list entry is a string literal Stryker can mutate; the
  rule's unit tests cover every list entry through a table test, so a removed entry is killed.

## Migration Plan

None: no schema, no data migration, no configuration. Rollback is reverting the PR; claims stored
with the Spanish prompt keep a valid provenance.

## Follow-ups

Decisions of the enrich step (Linear DIS-104, comment of 2026-10-26) and of this proposal, with their
destination (`docs/project-context.md` → Tracking deferred findings). The pre-merge reviews add their
findings here.

| Id | Decision or finding | Destination |
|---|---|---|
| E1 | Explicit Spanish instruction only for questions detected as Spanish; English and undecided questions keep the prompt byte for byte (D1, D2) | **A** — this change |
| E2 | Code-only event `answer_language_mismatch`; the answer is still returned (D3) | **A** — this change |
| E3 | Measured comparison on the local Ollama, 3 Spanish questions × current/new prompt, report in `reports/` (D5) | **A** — this change; **C** only if Ollama does not answer (D5 fallback) |
| E4 | Golden answers and the answer cache are not touched: the cache key is the normalized question | **D** — accepted, no work needed |
| E5 | Translating or retrying the answer, other languages, changing the default model, showing the event in the public API or the web | **D** — ticket non-goals |
| E6 | `docs/DEMO.md` output replaced by the measured one (D6) | **A** — this change |
| P1 | The statements' texts are not checked for language (D4) | **D** — accepted |
| P2 | The `verify` prompt of the semantic check is not changed | **D** — accepted: its output is `{"entails": boolean}`, with no language |
