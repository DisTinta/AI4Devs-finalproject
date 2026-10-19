## Why

Screen 2 (DIS-65, `ask-page`) answers questions with typed and verified statements and expandable
evidence, but it hides the two things the product argues with: what an answer cost and how reliable it
is (the usage strip of the wireframe `images/pantalla-2-consulta.svg`: confidence, tokens, cost,
latency, savings against the raw context and the cache indicator), and it shows one provisional notice
for every outcome that is not an answer. A person cannot tell an honest `UNKNOWN` (no evidence) from an
API that only needs a language model configured (`llm-required`, evaluation mode), nor know that an
exhausted budget still serves the cached questions, nor how long a rate limit lasts. DIS-66
(CM-HU-15b.2, parent DIS-62) closes the parent's acceptance criteria now: its blockers DIS-21 (cache by
normalised question) and DIS-65 (Screen 2) are merged, and DIS-65 handed over the re-announcement of a
repeated invalid-question message to this ticket's screen-reader pass.

## What Changes

- **Usage panel** after the evidence, as the wireframe draws it: «Confianza 0.71 · 4 812 tokens ·
  $0.014 · 2.1 s», a savings badge («ahorro 88 % vs bruto», or «sin ahorro vs bruto» when the API's
  savings are zero or negative), a cache badge («caché ✓» or «sin caché»), and the line «41 200 tokens
  sin selección de contexto → 4 000 con CODEMIND». A level-2 heading «Uso» names it for assistive
  technology only.
- **`UNKNOWN` without evidence** (`no-anchor`, and `over-budget`, `invalid-model-output`, `no-evidence`,
  `broken-evidence`): a state with the heading «Sin respuesta verificada», one sentence per reason and
  «Motivo: <reason>», in the muted colours. Never an empty area, never a usage panel.
- **`UNKNOWN` `llm-required`** (evaluation mode): a configuration notice, distinct in title and colour
  (accent), «Hace falta un modelo de lenguaje», explaining that the API answers only cached questions and
  how to enable free-form questions (`LLM_*`), that the suggested questions still answer from the cache
  (only when the project has them), and the API's own message.
- **`429`**: `BUDGET_EXHAUSTED` says the daily budget is exhausted, that cached questions still answer at
  no cost, and when it resets (UTC); `RATE_LIMITED` says to wait the API's `retryAfterSeconds` and never
  claims the cache is available. **Other API errors** keep the generic line and the code, with a sentence
  of their own for `PROJECT_NOT_FOUND`, `LLM_UNAVAILABLE` and `SOURCE_UNAVAILABLE`; an **unavailable API**
  says so. All of them are alerts in the warning colours with no retry button.
- **Screen-reader and keyboard pass**: one persistent, visually hidden status region announces every
  outcome (searching, answer received, no verified answer, a language model is needed; empty after an
  error, which announces itself); the visible «Buscando evidencia…» is hidden from assistive technology
  so it is not read twice; a repeated invalid question re-announces its message (DIS-65 handover); no
  new state moves the focus or adds a tab stop; the focus is visible on every control (manual pass).
- **Accessibility gate**: the Screen 2 axe test covers the usage panel, the cache hit, every new state
  and the alerts.
- **BREAKING (spec)**: the requirement "Provisional notice for what is not an answer" is removed and its
  component `AskFallbackNotice` deleted; the frame scenario no longer expects "no element with role
  `status`" on open, and the answer scenario no longer forbids the confidence.
- Deviations from the wireframe (two token figures instead of one, the muted savings badge for a
  negative saving, the «sin caché» badge, the darker colour of the baseline line, the hidden «Uso»
  heading, and the states the wireframe does not draw) are recorded in `design.md` and in the Enhanced
  description of DIS-66.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ask-page`: MODIFIED "Screen 2 frame and project bar" (the status region exists, empty, on open; the
  result area lists the final states), "Question box" (a repeated invalid send re-announces the message;
  the API's other rules are reported by the error notices), "Pending question" (the status region holds
  the pending text; the visible text is hidden from assistive technology), "Answer with typed and verified
  statements" (the confidence and usage are no longer forbidden; the status region announces the answer)
  and "Accessibility of Screen 2" (the new states in the axe gate; no new tab stop; a manual focus pass);
  ADDED "Usage panel", "How usage figures and notice details are written", "UNKNOWN states", "Error,
  rate-limit and budget notices" and "Screen reader announcements of Screen 2"; REMOVED "Provisional
  notice for what is not an answer".

## Impact

- Code (`packages/web` only): `pages/AskPage.tsx` (result area chooses the answer + usage panel, the
  `UNKNOWN` state, the configuration notice or the error notice; persistent status region),
  `pages/useAsk.ts` (an `UNKNOWN` keeps its `message`; an API failure keeps its `details`),
  `components/QueryBox.tsx` (the alert is remounted on each invalid send), `components/AnswerView.tsx`
  (TSDoc only); new `components/{UsagePanel,UnknownState,LlmRequiredNotice,AskErrorNotice}.tsx`,
  `components/usage-display.ts` and `components/notice-display.ts`; `components/project-display.ts`
  exports its digit grouping; `components/AskFallbackNotice.tsx` is deleted. No change to the API client,
  the API, the backend packages, the theme tokens or `theme.test.ts`.
- Tests: new `packages/web/src/components/usage-display.test.ts` and `notice-display.test.ts`; new
  scenarios in `packages/web/src/pages/AskPage.test.tsx`; in that file the three tests of the removed
  requirement are deleted, and only the assertions of "Screen 2 opens on a sample project without any
  request" and "An answered question shows the answer, its statements and its evidence" that pin the
  changed behaviour are changed; `tests/a11y/ask-page.a11y.test.tsx` covers the new states (its
  provisional-state step changes with the spec). No other existing test is edited.
- Dependencies: none.
- Docs: `docs/project-context.md` (Screen 2), `docs/frontend-standards.md` («How test:a11y is wired»),
  `docs/DEMO.md` (Entrega 2 note on Screen 2), `prompts.md` (section + Índice, appended at the end).
- Privacy/security: no new request and no new data; the API's `message`, `code` and `details` are
  rendered as text (React escaping), `retryAfterSeconds` and `resetsAt` only when they have the expected
  type and form; no `dangerouslySetInnerHTML`, no `VITE_*`.
- Performance: render only; no new request, timer or dependency.

## Non-goals

- No Playwright suite (DIS-75) and no per-project hit rate in the panel (DIS-69).
- No retry button, no live countdown of `retry-after`, no `useCache` or `tokenBudget` switch.
- No breakdown of `generation` / `verification` in the panel: only the wireframe's totals.
- No usage or confidence for an `UNKNOWN` (the API sends neither).
- No Screen 3, history or browser persistence; no change to the API or its error format.
