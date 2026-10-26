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
spec (requirement "Question and answer language"): backtick pairs ignored (an unmatched last
backtick is a plain character), whitespace tokens with every leading and trailing character of the
closed punctuation set stripped, code-like tokens skipped (any token with a non-`\p{L}` character; a
token made only of letters with an uppercase letter after the first, unless all its letters are
uppercase), the two closed word lists as
`ReadonlySet<string>`, `¿`/`¡` and accented/`ñ` tokens as Spanish signals, threshold of two signals
and a strict majority. No regular expression with nested quantifiers (linear in the text; the
question is already bounded by `parseExplainRequest`, and the answer by the model output limit of
`parseModelOutput`).

- *Alternative: a detection library* (franc, cld). Rejected: a new dependency (supply chain, size,
  `npm audit`) for two languages, and it is not deterministic enough on 3-word questions.
- *Alternative: ask the model which language the question is in.* Rejected: one more paid call per
  answer and a new failure mode.
- *Alternative: only look for `¿`/accents.* Rejected: `Como se calcula el precio` (typed without
  accents) would get no decision; the word lists catch it.
- *All-uppercase tokens* (`COMO SE CALCULA EL PRECIO FINAL DE UN PEDIDO`, used by existing cache
  tests) are words, compared in lowercase, not code: an all-caps Spanish question gets the Spanish
  prompt. Decided by the agent in correction round 1 (Follow-ups R1). An all-caps identifier
  (`API`, `SKU`) is in neither list, so it adds no signal.

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

In `answerQuestion`, after the `broken-evidence` return (`explain.ts:355`, which keeps returning
`events = [...sanitized.events, ...verified.events]`) and before the claim write, the language events
are `[{ type: 'answer_language_mismatch', expected: 'es' }]` when `prompt.questionLanguage === 'es'`
and `detectLanguage(parsed.output.answer) === 'en'`, else `[]`. Only the answered answer's events
become `[...events, ...languageEvents]`, passed to `storedAnswer` / `unsavedAnswer`
(`explain.ts:368, 371`), so the event lands after the `entailment_unverified` events and before
`claims_not_persisted`, `answer_not_cached` and `query_not_logged` (the order of the delta spec).
The `UNKNOWN` branches (`invalid-model-output`, `no-evidence`, `broken-evidence`) keep their events
as today.

An answer that carries the event is still cacheable (`isCacheable` does not change): a later hit of
the same question serves the English answer with `events: []`, so the event is seen once, on the
call that reached the model. Decided by the agent in correction round 1 (Follow-ups R2): not caching
it would change the cache rules, which the ticket keeps out of scope, and the measurement uses
`useCache: false`.
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
  text (and the agent's reading of it), the events, the end-to-end request duration,
  `usage.verification.calls` (so durations with different numbers of `verify` calls can be compared),
  the model and the Ollama version.
- **Conclusion rule:** each pair is classified by the agent's reading of `answer` and of every
  statement `text`; the rule's decision is recorded beside the reading but does not decide the label.
  "Mixed" means the `answer` and the statements of one response are not all in the same language.

  | Before (current prompt) | After (new prompt) | Label |
  |---|---|---|
  | English | Spanish | prompt |
  | English | English | model |
  | English | mixed | both |
  | mixed | any | both |
  | Spanish | Spanish | not reproduced |
  | Spanish | English or mixed | regression |

  Aggregate: the label shared by at least two of the three pairs, or "inconclusive" otherwise. A
  "regression" label on any pair is reported in the PR as a finding with a Follow-ups destination.
  Three pairs are a small sample: the report says so and does not claim a rate.
- **State:** each live call writes `claim`, `evidence`, `cache_entry` and `query_log` rows for
  acme-shop (`useCache: false` still saves a cacheable answer). After the "after" run, `npm run
  db:seed` restores the sample project (it deletes by cascade the sample's rows and reloads the seed
  and the golden cache), and `npm run verify` must exit `0`. The reseed restores the seed state, not
  the 0.4 baseline: any acme-shop row of the baseline that it removes is listed in the step 8 report
  (decided by the agent in correction round 1, Follow-ups R3). A first reseed (task 7.0) clears the
  "before" rows ahead of the "after" run, so that the CLI capture of D6 reaches the model instead of
  the answer cache (the CLI has no `useCache` option, and `useCache: false` still saves); step 6 runs
  against a database that still holds the "before" rows; the final reseed is task 8.3 (Follow-ups
  R6). No integration test runs while a live
  `ask` is in flight (`docs/project-context.md`: the `query_log` insert locks the project row).
- **Fallback:** if Ollama does not answer in task 1 or 7, the measurement becomes destination **C**
  (explicit debt): a Spanish checklist comment on DIS-104 and a Follow-ups line here; the code and
  the unit tests still ship, and `docs/DEMO.md` keeps its output with a note that it predates the
  change.

### D6. `docs/DEMO.md` shows the measured output

The pasted CLI output of `Probar con un modelo real` is replaced by the "after" output of
`¿Qué hace DiscountService?` taken with the CLI (`npm run cli -- ask acme-shop "¿Qué hace DiscountService?"`
with the same `LLM_*` environment) as the first call after the reseed of task 7.0, so it is a cache
miss and a live `answer` call (a cache hit would carry no event and no model duration), whatever its
language, and one sentence in Spanish (the guide is
in Spanish) explains that an English
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
- [The live measurement takes long on CPU (seven `answer` calls of minutes each: 3 before, 3 after,
  1 CLI capture, live because it runs right after the reseed of task 7.0, plus their `verify` calls,
  up to 20 each)] → `LLM_TIMEOUT_MS=1200000`; one question
  per task, each run in the background with `Monitor`; fallback D5.
- [An English answer to a Spanish question is cached, and its repeats are served in English with no
  event] → Accepted (D3, Follow-ups R2): the event is on the call that reached the model, and the
  API request log keeps it.
- [The live run mutates the author's local database] → Restored with `npm run db:seed` (once before
  the "after" run, task 7.0, and once at the end, task 8.3), checked with
  `npm run verify` and the counts recorded in 0.4; baseline rows the reseed removes are listed in the
  step 8 report (Follow-ups R3).
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

Decisions of spec-audit correction round 1 (report `reports/2026-10-26-spec-audit.md`, "Resolution of
run 1"). *Agent's text: decided as lead engineer in an autonomous run, without the author.*

| Id | Decision or finding | Destination |
|---|---|---|
| R1 | Audit question 1: an all-uppercase token (`COMO`) is a word compared in lowercase, not code, so an all-caps Spanish question gets the Spanish prompt (D1, spec rule). It fulfils AC1 for a plausible way of typing; the existing tests that use such a question are cache hits and do not pin the prompt | **A** — this change |
| R2 | Audit question 2: an answer with `answer_language_mismatch` stays cacheable; its repeats are served in English with `events: []` (D3). Not caching it would change the answer-cache rules, which the ticket leaves out of scope; the event is in the request log of the call that reached the model | **D** — accepted |
| R3 | Audit question 3: restoring the author's local database with `npm run db:seed` after both live runs is acceptable (the project's documented restore); acme-shop rows of the 0.4 baseline that it removes are listed in the step 8 report (D5, tasks 1.4, 8.4) | **A** — this change |
| R4 | Audit I5: the module keeps the name `question-language.ts` (the ticket's reality-map names it; its one public concept is the language rule) | **D** — accepted, rename rejected |
| R5 | Audit correction 18 (adding the D5 classification to AC5 of the ticket's `[enhanced]` section): not applied; D5 is the authority and the round's Linear comment records it | **D** — accepted |

Decisions of spec-audit correction round 2 (report `reports/2026-10-26-spec-audit.md`, "Resolution of
run 2"). *Agent's text: decided as lead engineer in an autonomous run, without the author.* Run 2
asked no question for the author; these are the agent's choices in applying its findings.

| Id | Decision or finding | Destination |
|---|---|---|
| R6 | Audit run 2 B1: the CLI capture for `docs/DEMO.md` would be a cache hit. A reseed is added before the "after" run (task 7.0) and the CLI capture becomes its first call (task 7.1), rather than adding a `--no-cache` option to the CLI, which would widen the scope of the ticket | **A** — this change |
| R7 | Audit run 2 I1: evaluation mode in task 8.1 is reached with `LLM_BASE_URL=` and `LLM_API_KEY=` set empty in the command's environment, so the agent never reads `.env` | **A** — this change |
| R8 | Audit run 2 I2: the all-uppercase exception of the rule applies only to tokens made only of letters; a token with a non-letter character is always code (`AÑO-2024 PÁGINA_1` gives no decision; spec, task 2.1) | **A** — this change |
