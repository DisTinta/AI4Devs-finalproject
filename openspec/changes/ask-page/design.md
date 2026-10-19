## Context

See `proposal.md` → Why. The current state that shapes the approach (`origin/feature/entrega-2-CRN` at
`ab99ad3`, after DIS-60):

- `packages/web/src/router.tsx` exports `routes`: one pathless root route with `errorElement:
  <RouteErrorPage />` and the children `/` → `ProjectPickerPage`, `/p/:projectId` →
  `ProjectQueryPlaceholder` (a `PendingScreen` «Consulta del proyecto» + id) and `*` → `NotFoundPage`.
  No loader, no action (the `Request` workaround of `tests/support/jsdom-setup.ts` stays valid).
- `packages/web/src/components/PageFrame.tsx` always renders `AppHeader` (CODEMIND) as the banner and a
  centred `main`; `PendingScreen.tsx` is used only by the Screen 2 placeholder.
- `packages/web/src/services/api-client.ts`: `ask(projectId, body, { signal })` (no time limit, id
  encoded as one segment), `AskResponse = AskUnknown | AskAnswered`, `ApiError`, `ApiUnavailableError`;
  a call aborted by its caller rejects with the caller's `signal.reason`. Guarded by
  `tests/unit/web/api-contract.spec.ts`.
- `packages/web/src/pages/useApiHealth.ts`: the page-hook pattern of DIS-60 (`AbortController`, a ref
  that ignores repeated presses without `disabled`, an own-abort guard).
- `packages/web/src/data/sample-projects.ts` (`SAMPLE_PROJECTS`, acme-shop only) and
  `packages/web/src/components/project-display.ts` (`stackLabel`, `formatCount`).
- `seeds/cache/acme-shop.json`: the golden answers of Q1, Q3 and Q4 (`project: 'acme-shop'`), the
  questions the API answers from the cache in evaluation mode. Q1 has two `FACT`/`entailed` and two
  `INFERENCE`/`cited` statements and back-quoted code in its texts; Q4 cites the same range twice.
- `packages/web/src/index.css` tokens and the pair table of `theme.test.ts` (no pair is added).
- Tests that name the Screen 2 placeholder: `router.test.tsx` ("A project path shows the Screen 2
  placeholder with its id") and `ProjectPickerPage.test.tsx` ("The project link is reached and followed
  with the keyboard", "Leaving Screen 1 cancels a pending check"). `tests/a11y/smoke.a11y.test.tsx`
  scans `/p/<acme-shop id>` and waits for any level-1 heading.
- Wireframe `images/pantalla-2-consulta.svg` (readme §1.3) — the visual reference of this screen.

## Goals / Non-Goals

**Goals:**

- Screen 2 as the wireframe draws it, minus the usage strip (DIS-66), with every deviation written down
  (D3, D5, D8, D11, D13).
- The page never paints an empty or silent result: every outcome of `ask()` has a state (D7, D10).
- The demo questions answer without a model: the suggestions are the golden questions, guarded by a
  coherence test (D5).

**Non-Goals (design level, besides the proposal's):**

- No data layer (no React Router loader or action, no React Query, no context): one page-local hook.
- No change to the API client, the theme tokens, `SAMPLE_PROJECTS`, `AppHeader`, `NotFoundPage`,
  `RouteErrorPage` or the `jsdom-setup.ts` workarounds.
- No Markdown rendering: only back-quoted code fragments (D13).

## Decisions

D1–D14 come from the `[enhanced]` description of DIS-65 (agent as lead engineer, ADR
`20261016-autonomous-workflow-run-entrega-2`, reviewable by the author). D15–D28 were taken while
proposing, and D29–D30 while resolving the spec audit (run 1, `reports/2026-10-19-spec-audit.md`), which
also refined D19; all of them are added to the same description.

### D1 — An OpenSpec change with the new capability `ask-page`

The ticket marks it as an OpenSpec candidate. DIS-66 will extend the capability with the usage panel and
the final `UNKNOWN`/`429`/error states, modifying the provisional-notice requirement.

### D2 — No `services/ask.ts`

The parent listed it, but `ask()` and its types already live in `services/api-client.ts` with a
type-level contract test (DIS-58). A second module would be a second source of truth for the same
endpoint. Alternative rejected: re-exporting from a new file (indirection with no gain).

### D3 — The project bar replaces the CODEMIND header (as the wireframe)

`PageFrame` gains an optional `banner` prop; without it, it keeps rendering `AppHeader`, so Screen 1,
the not-found screen and the error screen do not change. `ProjectBar` is a `header` (banner landmark):
the back link «←» (accessible name «Volver a la selección de proyecto», `on-header` text), the `h1` with
the project's name (`on-header`) and «PHP / Laravel · 170 aristas» (`on-header-muted`, built with
`stackLabel` and `formatCount` of `project-display.ts`, the same writing as the card). The figure is the
seed's 170, not the illustrative 1 840. No ⟳ (there is no indexing from the web). For an id that is not
in `SAMPLE_PROJECTS` (a project indexed with the CLI and opened by URL) the page works the same: the `h1`
is the id, and there is no label, no count and no suggestion; if the API answers `PROJECT_NOT_FOUND` the
provisional alert says so (D10). Alternative rejected: keeping the CODEMIND header and putting the
project in `main` (two dark bars, or a page that does not look like the wireframe).

### D4 — Question box

A `form` with a one-line `input` (as the wireframe), a visually hidden `label` «Pregunta», placeholder
«Pregunta sobre el código de <name>» («… del proyecto» for a project outside the constant, D24) and a
submit button «→» (`aria-hidden`) with accessible name «Preguntar», `accent` background with `on-accent`
text (not the wireframe's `#4dabf7`, under 4.5:1). Enter submits through the form. The body is
`{ question: trimmed }` only: no `useCache`, no `tokenBudget` (the API's defaults). The length is checked
locally (5 to 500 code points after trimming, `[...text].length`) so a predictable `400` costs no round
trip; the message is linked with `aria-describedby` and the field gets `aria-invalid` (D18). No
`maxLength` attribute: it counts UTF-16 units and would cut silently.

### D5 — Suggestions = the golden questions of CM-HU-13 (PH-26; deviation of texts)

`data/suggested-questions.ts` is a hand-written map `project id → readonly string[]` with the three
golden questions of acme-shop in golden order: Q1 «¿Cómo se calcula el precio final de un pedido?», Q3
«¿Cómo se validan los cupones?», Q4 «¿Qué hace OrderObserver al crear un pedido?». The exact golden texts
are used (not the wireframe's «¿Qué hace OrderObserver?») because the cache matches by normalised text
and the demo must answer without a model; «¿Por qué existe legacy_ref?» is left out (it does not exist in
the fixture). Q1 is also a suggestion because the wireframe shows it in the box as the example and it is
step 1 of the demo. `tests/unit/seed/suggested-questions-coherence.spec.ts` fails if the golden files
are regenerated without updating the constant (same pattern as `sample-projects-coherence.spec.ts`; the
web does not import the CLI). Alternative rejected: generating the constant from the golden file in
`cache:build` (a second generated file and a build-step change for three strings).

### D6 — Pressing a suggestion sends at once

It fills the field with its text and sends it (parent AC «cuando envío una pregunta sugerida»); the focus
does not move. The suggestions are a `div role="group"` with `aria-labelledby` pointing at the «Prueba:»
text, holding one `type="button"` per question.

### D7 — Pending state

While a question is pending: a `role="status"` element «Buscando evidencia…» in the place of the answer;
the previous answer or notice is removed when sending (an answer to another question is never shown);
sends and suggestions are ignored without `disabled` (the focus is not lost, as DIS-60 D9). No client
time limit (`ask()` has none; a local model takes tens of seconds). Unmounting aborts; the page's own
abort paints nothing. When the answer arrives the focus does not move: the tab order is already question
→ suggestions → answer → evidence.

### D8 — Badges per statement: type and verification, always icon + text + colour

Each statement (ordered list, API order) carries two `StatementBadge`s: `FACT` → «● HECHO» (`success` on
`success-soft`), `INFERENCE` → «⚠ INFERIDO» (`warning-ink` on `warning-soft`); `entailed` → «✓
verificado» (`success` on `success-soft`), `cited` → «○ sin verificar» (`ink-muted` on `canvas`). Icons
`aria-hidden`. Deviations: the wireframe labels only facts with «✓ verificado» and moves the inference to
a separate box at the end; here every statement stays in place (the API's order is the reasoning's
order) and an `INFERENCE` item is drawn with the box's `warning-soft` background and `warning-border`
border; facts carry the decorative green stripe (`border-success`, a border, not text). «HECHO» is added
because the type cannot be told by colour alone (parent AC). The API produces `FACT`+`entailed`,
`INFERENCE`+`entailed` and `INFERENCE`+`cited`; all four combinations render. Each statement ends with
«Evidencia: ev-1, ev-2» (text, no link).

### D9 — Confidence and usage belong to DIS-66

The wireframe puts «Confianza» in the usage strip, which is `UsagePanel` (DIS-66). DIS-65 paints neither
`confidence` nor `usage`; AC 1 of the parent is split between the two children.

### D10 — A provisional notice for what is not an answer

The ticket says «Fuera de alcance: estados de error», but frontend-standards §2 forbids silent states.
`AskFallbackNotice` covers everything until DIS-66: `UNKNOWN` → `role="status"` «Sin respuesta
verificada (motivo: <reason>).»; `ApiError` → `role="alert"` «No se ha podido obtener la respuesta.» +
«Código: <code>.»; `ApiUnavailableError` or any other non-abort failure → the same `alert` + «La API de
CODEMIND no responde.». No retry button (the person retries by sending again). The `alert` uses the
`warning-*` colours of `ErrorBanner`; the `status` uses `ink-muted` on `canvas`. DIS-66 replaces it with
`UnknownState`, `LlmRequiredNotice`, the `429` notice and the error state, modifying the requirement.

### D11 — Expandable evidence

`EvidenceList` (`h2` «Evidencia», `ul`) with one `EvidenceItem` per evidence in API order: a
`type="button"` with `aria-expanded`, «▸»/«▾» `aria-hidden`, «ev-1 · app/Services/PriceCalculator.php:16-44»
(`accent` on `canvas`, visible focus outline); when expanded, a `pre` > `code` with the exact `excerpt`
(`ink` on `canvas`, `overflow-x-auto`, no line numbers, no highlighting). All collapsed when the answer
arrives; each toggles on its own (local `useState` per item, keyed by the evidence id). Deviations: no
«entailed» badge per evidence (the API gives verification per statement, not per evidence, and deriving
it would invent data); no PR evidence (the API cites only file ranges). Repeated evidence is shown as
received (Q4 cites the same range twice, under two ids).

### D12 — `web-foundation` delta and the placeholder test

The scenario "A project path shows the Screen 2 placeholder with its id" stops being true, so its
requirement is retired and re-added under another name (D15), and its test in `router.test.tsx` is
removed: a specified change of behaviour, not a fix to make the suite green. The gate
`tests/a11y/smoke.a11y.test.tsx` is not touched: it already scans the real Screen 2 at `/p/<id>`.

### D13 — Inline code without Markdown

The golden answers use back-quotes (`` `compute()` ``). `answer-display.ts` splits a text at pairs of
back-quotes into plain and code fragments; a back-quote without a pair, and an empty pair, stay as text.
It applies to the answer and to the statements. No Markdown library: a new dependency and an injection
surface for one feature the answers use.

### D14 — No new dependency

Everything needed was installed in DIS-58; no `npm install` runs. The `/show-spec-working` screenshot is
taken with the `browser-automation` skill against the real API with the seed and the golden cache
(evaluation mode: Q1, Q3 and Q4 answer without a model).

### D15 — REMOVED + ADDED under a new name for the route requirement (taken while proposing)

OpenSpec refuses a MODIFIED block that drops a scenario of the current spec (DIS-60 D15). The delta
removes "Routes and screens of the web client" and adds "Paths of the web client and their screens",
with a new name so that the same requirement is not both removed and added in one delta. The new text
keeps the not-found and development-server scenarios word for word; the retired scenario's checks move
to `ask-page` → "Screen 2 opens on a sample project without any request".

### D16 — `PendingScreen` is removed (taken while proposing)

After this change no route renders a placeholder, and `PendingScreen` would be dead code (the
`no-orphans` rule of `npm run lint:architecture` would flag it). It is deleted with its import in
`router.tsx`.

### D17 — Two `project-picker` scenarios follow the link to the real Screen 2 (taken while proposing)

"The project link is reached and followed with the keyboard" and "Leaving Screen 1 cancels a pending
check" assert the placeholder's heading «Consulta del proyecto» after following the link. The delta
MODIFIES their two requirements (full blocks, only those two THEN lines change) to assert Screen 2's
`h1` «acme-shop» (and the field «Pregunta» in the first). Their tests in `ProjectPickerPage.test.tsx`
change only those assertions (and drop the id-text check of the first, which Screen 2 no longer shows for
a sample project); recorded in the step 11 report as specified changes, never as fixes to make the suite
pass.

### D18 — The invalid-question message is an `alert` (taken while proposing; refines D4)

The focus stays in the field, and a change of `aria-describedby` alone is not announced by screen
readers. The message is a `p role="alert"` with an `id`, referenced by the field's `aria-describedby`
only while it is shown. It goes away when the field's text changes or a valid question is sent. An
invalid send changes nothing else (the previous answer stays).

### D19 — Colours inside statements stay within the theme pairs (taken while proposing)

`theme.test.ts` checks only listed pairs, and none is added. So an `INFERENCE` item's text is
`warning-ink` (on `warning-soft`); a `FACT` item's text is `ink` on `surface`; code fragments take the
`accent` colour only in the answer paragraph (`accent` on `surface`) and inherit the colour of the
statement they are in (`accent` on `warning-soft` is not a checked pair). The badges carry their own
background. The exact tokens, checked by eye in the manual test and `/show-spec-working` (spec
"Statement colours follow the wireframe"; jsdom computes no styles):

| Element | Text | Background | Border |
|---|---|---|---|
| `FACT` item | `ink` | `surface` | left `border-success` (stripe) |
| `INFERENCE` item | `warning-ink` | `warning-soft` | `warning-border` |
| «● HECHO», «✓ verificado» | `success` | `success-soft` | — |
| «⚠ INFERIDO» | `warning-ink` | `warning-soft` | — |
| «○ sin verificar» | `ink-muted` | `canvas` | — |
| code in the answer paragraph | `accent` | `surface` | — |
| code in a statement | inherited | inherited | — |

### D20 — The back link's focus outline is white (taken while proposing)

The web client's links use an `accent` outline, which has about 3.1:1 against `header` (`#212529`):
barely at the 3:1 of non-text contrast. On the dark bar the outline is `on-header` (white, about
15:1).

### D21 — One page instance per project (taken while proposing)

`router.tsx` renders `<AskPage key={projectId} … />` through a small route component that reads the
param: if the history ever goes from one `/p/{id}` to another, the page remounts and no answer of the
other project survives (the pending request is aborted by the unmount).

### D22 — The hook's states (taken while proposing)

`useAsk(projectId)` returns `{ state, send(question) }` with `state` one of `idle`, `pending`,
`answered` (the body), `unknown` (the reason), `failed` (`{ kind: 'api', code }` or `{ kind:
'unavailable' }`). `send` is ignored while a request is pending (a ref holding the `AbortController`,
so two presses in one tick send one request). Settling checks the controller's own `signal.aborted`
first (the DIS-60 D33 guard). Validation lives in `QueryBox`/`AskPage` with the pure check of
`answer-display.ts`, not in the hook. `AskPage` composes; it implements nothing (frontend-standards §3).

### D23 — File layout and scenario-to-test mapping (taken while proposing)

- `packages/web/src/components/answer-display.test.ts` (Node): the three scenarios of "How a question,
  an answer and an evidence location are written".
- `packages/web/src/pages/AskPage.test.tsx` (jsdom, real `routes` in `createMemoryRouter`,
  `vi.stubGlobal('fetch', …)`): every other `ask-page` scenario except the coherence and axe ones.
- `tests/unit/seed/suggested-questions-coherence.spec.ts` (Node): "The suggested questions are the
  golden questions"; it reads every `seeds/cache/*.json` with `JSON.parse` and compares with
  `SAMPLE_PROJECTS` and the constant (no CLI import needed).
- `tests/a11y/ask-page.a11y.test.tsx`: "Screen 2 has no axe violations in any of its states".
- Test names equal scenario names; AAA with commented blocks; `getByRole` queries.

### D24 — Placeholder for a project outside the constant (taken while proposing)

«Pregunta sobre el código del proyecto». The placeholder is not the accessible name (the label is), so
no test depends on it beyond the screenshot.

### D25 — Status and alert elements are rendered when needed (taken while proposing)

The pending status, the provisional status and the alert are conditional elements, as `ErrorBanner` on
Screen 1. Screen 2 before any question has no `status` or `alert` element (asserted). A persistent empty
live region would be announced more reliably by some screen readers; that refinement belongs to DIS-66's
screen-reader pass, which reworks these states.

### D26 — `aria-controls` only while expanded (taken while proposing)

The collapsed `pre` is not in the document (spec), so `aria-controls` would point to a missing id.
The button carries `aria-controls` only while expanded.

### D27 — Left-aligned content inside the frame (taken while proposing)

`PageFrame`'s `main` is `text-center` (Screen 1). Screen 2 wraps its content in a `text-left` block,
as the wireframe draws it; `PageFrame` keeps its classes.

### D28 — The coherence test reads every golden file (taken while proposing)

Instead of hard-coding `acme-shop.json`, it lists `seeds/cache/*.json`, so task-api (CM-HU-18) or any
future sample project with golden answers is covered without editing the test.

### D29 — Markup is text, proven by a scenario (spec audit run 1, F3)

The answer and the statements come from a model: an `<img onerror>` in them must stay text. React
escapes every string child; the scenario "Markup in an answer is shown as text" pins it so a later
renderer (DIS-66, a Markdown temptation) cannot drop it unnoticed.

### D30 — The time-limit check under fake timers (spec audit run 1, F2)

"A pending question has no time limit of its own" uses `vi.useFakeTimers({ toFake: ['setTimeout',
'clearTimeout'] })` before rendering and `act(() => vi.advanceTimersByTimeAsync(120_000))`, as DIS-60
D18 did for the health check; `vi.useRealTimers()` in `afterEach`. 120 000 ms is over any timer the page
could plausibly set by mistake (the health check's default is 5 000 ms).

## Risks / Trade-offs

- [The API answers an unexpected `2xx` shape (e.g. an answered body without `statements`)] → the client
  passes any JSON object through; the page would throw while rendering and the app's error screen
  (`RouteErrorPage`) shows «Algo ha fallado». Accepted: the shape is guarded by the type contract test
  and the API's own response schema.
- [A free-form question in evaluation mode answers `UNKNOWN` `llm-required`] → shown by the provisional
  status with its reason; DIS-66 adds the «configure `LLM_*`» notice.
- [Status elements inserted with their text may not be announced by every screen reader] → D25; axe
  passes; DIS-66 owns the screen-reader pass.
- [The coherence test ties the web constant to the golden file] → intended: regenerating the golden
  answers without the suggestions fails CI instead of shipping suggestions that miss the cache.
- [The `h1` lives in the banner, not in `main`] → allowed by WCAG and axe (`page-has-heading-one`,
  `landmark-one-main` pass); the web-foundation requirement now states it for Screen 2.

## Migration Plan

Additive in `packages/web` except `router.tsx` (`/p/:projectId` → `AskPage`), `PageFrame.tsx` (optional
banner), the removed `PendingScreen.tsx`, the removed placeholder test and the two assertions of D17.
Rollback = revert the PR; no data, no API, no dependency change.

## Follow-ups

Filled in during the pre-merge review (task 15): each finding with its A/B/C/D destination
(`docs/project-context.md` → Tracking deferred findings).
