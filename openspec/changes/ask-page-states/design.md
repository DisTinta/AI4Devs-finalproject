## Context

See `proposal.md` → Why. Screen 2 exists since DIS-65 (`openspec/specs/ask-page/spec.md`):

- `packages/web/src/pages/AskPage.tsx` composes the page; its `ResultArea` shows a pending `p role="status"`
  mounted when needed, `AnswerView` for an answer, and `AskFallbackNotice` for an `UNKNOWN` (status) or a
  failure (alert).
- `packages/web/src/pages/useAsk.ts` keeps `idle | pending | answered | unknown | failed`; `unknown` keeps
  only `reason` (the `message` of `llm-required` is lost) and a failure is `{ kind: 'api'; code }` or
  `{ kind: 'unavailable' }` (the `details` of the API error are lost).
- `packages/web/src/components/QueryBox.tsx` mounts its invalid-question `p role="alert"` while `invalid`;
  a second invalid send with the same text changes no DOM, so it is not announced again (DIS-65 handover,
  comment on DIS-66).
- `packages/web/src/services/api-client.ts` already types `AskAnswered.confidence`, `AskUsage`,
  `AskUnknown.message`, and `ApiError` (`status`, `code`, `details`); `ask()` does not validate a `200`
  body, so an `UNKNOWN` reason outside the six known values reaches the page as it is.
- The API (`packages/api/src/routes/ask.ts`, `plugins/error-handler.ts`): `BUDGET_EXHAUSTED` `429` with
  `details: { spentUsd, dailyBudgetUsd, resetsAt (ISO, start of the next UTC day), cacheOnly: true }`;
  `RATE_LIMITED` `429` with `details: { retryAfterSeconds }` (whole seconds, at least 1) for every route,
  cached questions included; `PROJECT_NOT_FOUND` `404`, `LLM_UNAVAILABLE` `503`, `SOURCE_UNAVAILABLE`
  `503`, `INVALID_EXPLAIN_REQUEST`/`VALIDATION_ERROR` `400`, `INTERNAL` `500`.
- `packages/core`: a cache hit has `inputTokens 0`, `outputTokens 0`, `costUsd 0`, `savingsPct 100` (when
  `baselineTokens > 0`) and `cacheHit true`; `savingsPct` has one decimal, is computed from `inputTokens`
  only, and can be negative (the stored acme-shop golden answers carry −24.9, −13.4 and −8.7).
- Theme (`packages/web/src/index.css`, `theme.test.ts`): only the listed text pairs may be used; the
  wireframe's `#adb5bd` baseline line is not one of them.

The visual reference is `images/pantalla-2-consulta.svg` (readme §1.3): a light usage band after the
evidence with «Confianza **0.71** · 4 812 tokens · $0.014 · 2.1 s», a green badge «ahorro 88 % vs bruto»,
a blue badge «caché ✓» and the line «41 200 tokens sin selección de contexto → 4 812 con CODEMIND». It
does not draw `UNKNOWN`, `llm-required`, `429` nor errors.

## Goals / Non-Goals

**Goals:**

- The usage panel and every final state of Screen 2, each pinned by an RTL test named as its scenario,
  pure formatting tested in Node, and every state in the axe gate.
- One reliable announcement path for non-error outcomes (persistent status region) and a re-announced
  invalid-question message.
- Zero new dependencies, zero new theme pairs, no API change.

**Non-Goals:**

- See `proposal.md` → Non-goals. At design level also: no live-region library, no focus management on
  result arrival, no change to `api-client.ts` or its contract test.

## Decisions

Decisions D1–D16 were taken by the agent as lead engineer in the autonomous run (ADR
`20261016-autonomous-workflow-run-entrega-2`) and are recorded in Spanish in the Enhanced description of
DIS-66; they are repeated here in English. D17 onwards were taken while proposing.

### D1 — An OpenSpec change `ask-page-states`, a delta of `ask-page`

The ticket is an `/opsx:propose` candidate and the capability exists (DIS-65). MODIFIED: "Screen 2 frame
and project bar", "Question box", "Pending question", "Answer with typed and verified statements",
"Accessibility of Screen 2"; ADDED: "Usage panel", "How usage figures and notice details are written",
"UNKNOWN states", "Error, rate-limit and budget notices", "Screen reader announcements of Screen 2";
REMOVED: "Provisional notice for what is not an answer". Alternative rejected: a new capability
`usage-panel` — the panel only exists inside Screen 2 and would split one screen across two specs.

### D2 — Strip tokens = input + output; baseline line = `baselineTokens` → `inputTokens` (wireframe deviation)

The wireframe paints the same number in both places, but the API's `savingsPct` compares only the input
with the raw context (`packages/core/src/explain/usage.ts`). The strip shows what was consumed (and paid);
the baseline line compares what entered the model with the raw context, so it agrees with the percentage.
Alternative rejected: input+output in both places — the line would then contradict the badge.

### D3 — Figures

A point as decimal separator, as the wireframe and the API: confidence with two decimals (it is ordinal,
`docs/CONFIDENCE.md`); cost with three decimals, «$0» for 0 and «< $0.001» for a positive amount that
rounds to zero; latency «N ms» under 1 000 ms and «X.Y s» from 1 000 ms (a cache hit takes milliseconds
and «0.0 s» would lie); savings as received, one decimal at most; token counts grouped with U+00A0 as
`formatCount`. No `Intl`: the output must not depend on the browser's locale or ICU.

### D4 — Zero or negative savings are not savings (wireframe deviation)

`savingsPct ≤ 0` → the muted badge «sin ahorro vs bruto», never a green «ahorro -24.9 %». The baseline
line below still shows both figures, so the overrun stays visible.

### D5 — Cache badge with text in both cases (wireframe deviation)

`cacheHit: true` → «caché ✓» (`accent` on `accent-soft`, as the wireframe; the ✓ hidden from assistive
technology); `false` → «sin caché» (`ink-muted` on `canvas`, with the `border` colour). Text tells the two
cases apart without colour. The wireframe only draws the hit.

### D6 — The «Uso» section (wireframe deviations)

A `section` labelled by a visually hidden `h2` «Uso» (the wireframe has no title; a named region lets a
screen-reader user jump to it), after «Evidencia», on `canvas`, figures separated by « · » hidden from
assistive technology, wrapping at 320 px. The baseline line is `ink-muted` on `canvas`: the wireframe's
`#adb5bd` is under 4.5:1. No new theme pair.

### D7 — `UNKNOWN` without evidence: one state for five reasons

`no-anchor` and every reason other than `llm-required` use `UnknownState`: `h2` «Sin respuesta
verificada», one sentence per reason (spec table) and «Motivo: <reason>» (the code, to cross it with the
CLI and the logs). Muted colours (`ink` / `ink-muted` on `canvas`, `border`), a decorative ○ hidden.

### D8 — `llm-required` is a configuration notice, not a failure of evidence (PH-08)

Derived from `reason`, never from an HTTP status. `LlmRequiredNotice` uses `accent` on `accent-soft` to
differ at a glance from the muted `UNKNOWN` (besides its own heading). It shows the API's `message` as it
comes, in English, after «Mensaje de la API:», because it is the source of truth and matches what the CLI
prints; the Spanish explanation comes first. No documentation link (no served URL exists).

### D9 — `429` is two cases

`BUDGET_EXHAUSTED` keeps the cache available (`cacheOnly: true` in `routes/ask.ts`): the notice says so.
`RATE_LIMITED` blocks every request, cached ones included: the notice never says the cache is available,
and gives the wait of `retryAfterSeconds`. The reset time is written in UTC from the ISO string
(«2026-10-20 a las 00:00 UTC»), with no `Intl` and no local time zone, so the test is deterministic and
the text does not depend on the browser.

### D10 — Errors: a sentence per known code, and always the code

`PROJECT_NOT_FOUND`, `LLM_UNAVAILABLE` and `SOURCE_UNAVAILABLE` have their own sentence; any other code
(`VALIDATION_ERROR`, `INVALID_EXPLAIN_REQUEST`, `INTERNAL`, …) only the generic line and «Código: X.». An
unavailable API → «La API de CODEMIND no responde.». All are `role="alert"` in the warning colours
(`warning-ink` on `warning-soft`, `warning-border`), with no retry button (sending again asks again, as in
DIS-65 D10).

### D11 — A persistent status region for what is not an error (DIS-65 handover, D25)

One visually hidden `role="status"` exists from the moment the page opens and changes its text on each
transition: empty → «Buscando evidencia…» → «Respuesta recibida.» / «Sin respuesta verificada.» / «Hace
falta un modelo de lenguaje.»; after an error it is empty because the alert announces itself. A region
that already exists is announced reliably when its text changes, which a `status` mounted with its text
inside does not guarantee. Since every send passes through «Buscando evidencia…», two equal results in a
row are announced again. The visible loading text is `aria-hidden` so it is not read twice. The visible
states (`UnknownState`, `LlmRequiredNotice`) have no live role. Alternative rejected: keep DIS-65's
mount-when-needed status — unreliable in NVDA/JAWS for content inserted with the region.

### D12 — Re-announcing the invalid-question message

Alerts are announced when inserted, so the message stays an `alert` and is mounted again (a new element)
on every invalid send, even with the same text. Observable in a test (the node changes) and it adds no
second live region to the form. Alternative rejected: clear and rewrite a persistent alert region — needs
a timer to be noticed by some screen readers and is harder to test.

### D13 — Focus and keyboard

No new state moves the focus or adds a tab stop (there are no new controls); the order stays DIS-65's. The
keyboard and visible-focus pass is done by hand in the browser (frontend-standards §4), with screenshots.

### D14 — No usage for an `UNKNOWN`

The API sends neither `usage` nor `confidence` with an `UNKNOWN`; no empty panel is invented.

### D15 — Readme §1.3 walkthrough in the browser

Against the real API with the seed in evaluation mode: step 1 Q1 (answer, evidence, usage panel; in
evaluation mode it is already a cache hit, «caché ✓», «$0»), step 2 expand an evidence, step 3 a question
with no anchor (chosen during the test so that it gives `no-anchor`), step 5 Q1 again, literally («caché
✓», cost 0). Plus a free question with anchors for `llm-required`. The `429`s and errors are covered by
RTL/axe doubles and by screenshots with the API stopped or the route intercepted in the browser; the
screenshots go next to the wireframe in the report.

### D16 — No new dependency

Everything needed is installed (DIS-58); no `npm install` runs.

### D17 — Every alert starts with the generic line; API errors always carry their code (taken while proposing)

Refines D9 and D10. Every failure alert starts with «No se ha podido obtener la respuesta.», then its own
lines, and for any API error ends with «Código: <code>.» — `429`s included. One shape for every alert lets
a screen-reader user recognise the failure from its first words, and the code always allows crossing the
screen with the API logs. The case is chosen by `code`, never by HTTP status, because the code is the
API's stable contract (a `BUDGET_EXHAUSTED` under another status would still be the budget).

### D18 — The hook keeps `code` and `details`, not `status` (taken while proposing)

The Enhanced technical context suggested keeping `status` too; no copy depends on it (D17 chooses by
code), so `AskFailure` of kind `api` is `{ kind: 'api'; code: string; details: Record<string, unknown> }`
and an `unknown` state adds `message?: string`. Adding an unused field would only widen the type.

### D19 — Two pure modules: `usage-display.ts` and `notice-display.ts` (taken while proposing)

The reality map listed one `usage-display.ts` holding the reset date too. The usage figures (confidence,
tokens, cost, latency, savings, baseline line) and the notice contents (reason sentence, reset time, wait,
alert lines per code) change for different reasons, so they live in two modules, each with its Node test
(`usage-display.test.ts`, `notice-display.test.ts`), as `answer-display.ts` does. Components only render
what they return (frontend-standards §3).

### D20 — `groupDigits` is exported from `project-display.ts` (taken while proposing)

The baseline line writes the input tokens as a bare number with groups; `formatCount` always appends a
noun. Exporting the existing private `groupDigits` (with TSDoc) avoids a second grouping function.

### D21 — The usage panel is a sibling of `AnswerView` (taken while proposing)

`ResultArea` renders `<AnswerView answer/>` then `<UsagePanel confidence usage/>`. `AnswerView` keeps one
job (statements and evidence) and only its TSDoc changes (the "no confidence nor usage" note goes). The
panel then follows the evidence list in document order, as the wireframe.

### D22 — Status region: one element owned by the page (taken while proposing)

`AskPage` always renders one `p role="status" className="sr-only"` at the end of the main column, outside
`ResultArea` (which mounts and unmounts its children per state), so the element survives every state. Its
text comes from a pure function of the `AskState` in `notice-display.ts` (`announcementOf`). The visible
«Buscando evidencia…» is a `p aria-hidden="true"` inside `ResultArea`. An invalid send does not touch
`AskState`, so the region does not change.

### D23 — A general sentence for a reason the page does not know (taken while proposing)

`ask()` does not validate a `200` body, so a future reason added to the API reaches the page. The state
without evidence then shows «CODEMIND no ha encontrado evidencia suficiente para dar una respuesta
verificada.» with its «Motivo: <reason>», instead of an empty sentence or a crash.

### D24 — Existing tests that change with the spec (taken while proposing)

Following DIS-65's precedent (its D12, D17), only tests whose scenarios this delta changes are edited.
Each edit is written first, from the text of the changed scenario, and seen failing against the current
code for the expected reason (RED) before the production code changes:

- `AskPage.test.tsx` → "Screen 2 opens on a sample project without any request": the assertion
  `queryByRole('status')` is null becomes "one status element, empty".
- `AskPage.test.tsx` → "An answered question shows the answer, its statements and its evidence": the
  assertion "no status" becomes "status holds «Respuesta recibida.»", and the two assertions "no 0.71 / no
  Confianza" are removed (the usage panel now shows them; "An answer from the model shows its usage
  panel" pins them).
- `AskPage.test.tsx` → the `describe('Provisional notice for what is not an answer')` block (three tests)
  is deleted, with the constants only it uses (`UNKNOWN_NOTICE`, `BUDGET_EXHAUSTED` if unused elsewhere),
  so `npm run lint` stays clean.
- `tests/a11y/ask-page.a11y.test.tsx` → "Screen 2 has no axe violations in any of its states": the step
  that waits for the provisional text becomes the wait for the `no-anchor` state, the pending step waits
  for the visible text instead of `findByRole('status')` (the region now exists before), and the new
  states are added to the expected object.

No other line of any existing test changes; every other existing test must pass unchanged. Each change is
recorded with its reason in the step 11 report.

### D25 — Units with a plain space, digit groups with U+00A0 (taken while proposing)

«2.1 s», «12 ms», «88 %» use a plain space, as `formatCount` («170 aristas») and the wireframe; only digit
groups use U+00A0. The badges are `whitespace-nowrap`, so «88 %» never breaks inside a badge.

### D26 — A rate-limit wait is a whole number of 1 or more (taken while proposing)

The Enhanced said "integer ≥ 0"; the API's `RateLimited` documents "whole seconds until the window
resets, at least 1" (`plugins/rate-limit.ts`), and «Espera 0 s» would be a contradiction. Any other value
(0, negative, fraction, string, absent) gives «Espera un momento y vuelve a preguntar.».

### D27 — A reset time is a strict ISO date-time (taken while proposing)

`Date.parse` accepts forms such as «2026-10-20» and interprets them in local or UTC time depending on the
form. The reader accepts only `YYYY-MM-DDTHH:MM[:SS[.fff]](Z|±HH:MM)` that gives a valid `Date`, and
writes it with `getUTC*` getters; anything else is treated as absent (no line). A number (epoch) is not
accepted: the API sends `toISOString()`.

### D28 — Savings rounded to one decimal, no trailing «.0» (taken while proposing)

The API rounds to one decimal already; the writer rounds again (`Math.round(x * 10) / 10`) to absorb any
binary residue and writes it with `String`, so 88 → «88», 88.3 → «88.3».

### D29 — The invalid-message alert is keyed by a send counter (taken while proposing)

`AskPage` counts invalid sends and passes the count to `QueryBox`, which uses it as the `key` of the
alert; React then inserts a new element per invalid send. The field's `aria-describedby` keeps pointing at
the same id, which the new element carries.

### D30 — Colours of the new elements stay within the theme pairs (taken while proposing)

`LlmRequiredNotice`: every text, the heading and the `code` element in `accent` on `accent-soft` (the only
pair on that background). `UnknownState`: heading `ink` on `canvas`, text `ink-muted` on `canvas`, border
`border`. Usage panel: labels and figures `ink-muted` / `ink` on `canvas`; savings badge `success` on
`success-soft`; cache-hit badge `accent` on `accent-soft`; muted badges `ink-muted` on `canvas` with
`border`. Alerts: `warning-ink` on `warning-soft`. `theme.test.ts` is not edited.

### D31 — The tab-stop check is automated; the visible focus is manual (taken while proposing)

"The result states add no tab stop" lists every link, button, field and `[tabindex]` of `main` after the
«Prueba:» group (`compareDocumentPosition`), so a new control in any state fails it. jsdom has no layout,
so the visible outline is checked in the browser ("The focus is visible on every control").

## Risks / Trade-offs

- [Screen readers differ in how they announce a persistent status region] → the region exists from the
  first paint and only its text changes (the most widely supported pattern); NVDA/JAWS are not available
  in this run, so the announcement is pinned by DOM tests (same element, text sequence) and the manual pass
  inspects the accessibility tree in Chromium. Recorded as a limit in the step 12 report.
- [Editing existing tests could hide a regression] → D24 restricts the edits to the assertions of the
  changed scenarios, each seen failing for the expected reason first, listed in the step 11 report.
- [The golden answers carry negative savings with a local model] → in evaluation mode the page shows a
  cache hit (`savingsPct 100`); a negative live saving shows «sin ahorro vs bruto» (D4), never a green
  negative.
- [The manual `no-anchor` question may have anchors in acme-shop] → the step 12 run tries «¿Por qué existe
  legacy_ref?» first and records the question that actually gave `no-anchor` (D15).
- [More text in the result area at 320 px] → badges wrap as whole units; checked at 320 px in step 12.

## Migration Plan

Front-end only, no data or API change. Rollback is reverting the merge commit; the spec delta is archived
with the change.

## Follow-ups

None yet. Findings of the pre-merge review get an A/B/C/D destination here
(`docs/project-context.md` → Tracking deferred findings).
