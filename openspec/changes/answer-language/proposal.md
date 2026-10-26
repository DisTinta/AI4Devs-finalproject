## Why

In the live check of DIS-103 (Ollama on CPU, `qwen2.5-coder` 7B), the Spanish question
`¿Qué hace DiscountService?` got its answer and its statements in English, although the system
message of `explain` already says `Answer in the language of the question.` The project's audience
reads Spanish and the golden answers of the cache (Q1, Q3, Q4) are in Spanish, so a live answer in
English looks broken next to them, and nothing in the system notices it (Linear DIS-104, which has no
parent ticket).

## What Changes

- A Spanish question gets an explicit language instruction: the system message replaces the generic
  line with one that asks for `answer` and every statement `text` in Spanish, even when the code and
  the evidence are in English, and repeats the request in Spanish as its last line.
- English questions and questions with too little signal (`price`, `q`, an identifier alone) keep the
  current system message byte for byte, so their prompt and its hash are unchanged.
- The language of a text is decided by a deterministic rule with a closed list of signals, with no
  new dependency: `es`, `en` or no decision.
- New code-only event `answer_language_mismatch` (`{ type, expected: 'es' }`) on an answered answer
  from the model when the question is Spanish and the answer reads as English. The answer is still
  returned as it is: not discarded, not retried, not translated. Never on a cache hit nor on an
  `UNKNOWN`. The transport already writes every event (API request log at `info`, CLI JSON lines on
  stderr).
- A measured comparison on the local Ollama: three Spanish questions outside the cache, with the
  current prompt (before the change) and with the new one, through the API with `useCache: false`;
  a report in this change's `reports/` says, per pair, the language of the answer and statements,
  the duration, and whether the cause is the model, the prompt or both.
- `docs/DEMO.md` → `Probar con un modelo real`: the English output pasted there is replaced by the
  output measured with the new prompt, and one sentence explains the new event.

Out of scope (non-goals):

- Translating the answer or calling the model again when it answers in another language.
- Languages other than Spanish and English, and any language-detection dependency.
- Changing the default model, the golden answers or the answer cache (its key is the normalized
  question, not the prompt hash, so the golden answers keep being served).
- Showing the event in the public API response or in the web.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `explain`: the requirement "Prompt and evidence ids" gains the Spanish system message for a
  question detected as Spanish (the generic one stays for the rest); a new requirement "Question and
  answer language" fixes the detection rule and the `answer_language_mismatch` check; the requirement
  "Explain events and logging" adds that event to `ExplainEvent` and to the order of the events.

## Impact

- Code: `packages/core/src/explain/` only — a new pure module for the language rule, `prompt.ts`
  (choice of system message), `explain-event.ts` (new event type), `explain.ts` (the check). No port,
  adapter, Zod schema or route changes; no migration; no new dependency.
- Tests: new unit tests for the rule, the prompt and the event; existing tests are expected to stay as
  they are (named in `tasks.md`).
- Docs: `docs/DEMO.md` (`Probar con un modelo real`), `docs/project-context.md` (the event list of
  `explain`), `prompts.md`.
- Privacy: the event carries only its type and the expected language code, never any part of the
  question or the answer; the question and the answer stay out of every log, as the `explain` spec
  already requires. No personal data is added.
- Live measurement: about six model calls on CPU (minutes each), run by the agent with the `LLM_*`
  variables in the command's environment (never by editing `.env`).
