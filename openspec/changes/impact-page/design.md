## Context

See `proposal.md` → Why. The state the approach builds on:

- `POST /api/projects/{projectId}/impact` (DIS-95, `http-impact`) is closed: body `{ change, maxHops? }`
  (`impactBodySchema`: 5–500 code points, not only whitespace, no U+0000; `maxHops` 1–3, default 2), `200`
  `{ status: 'answered', direct, indirect, tests, docs, history, risk }` or `{ status: 'unknown', reason:
  'no-anchor' }`, errors `400 VALIDATION_ERROR`, `400 INVALID_IMPACT_REQUEST`, `404 PROJECT_NOT_FOUND`,
  `429 RATE_LIMITED`, `500 INTERNAL`. It sends no `usage`: the report makes no model call.
- The web client (DIS-58, DIS-60, DIS-65, DIS-66) has the typed client `services/api-client.ts` (private
  `send`, `ApiError`, `ApiUnavailableError`, `ask()`, types declared by hand and compared by
  `tests/unit/web/api-contract.spec.ts`), the routes table `router.tsx`, and Screen 2 (`AskPage.tsx`,
  `useAsk.ts`, `QueryBox`, `UnknownState`, `AskErrorNotice`, `notice-display.ts`, a persistent
  `role="status"` region). `packages/web` is outside Stryker's `mutate` (DIS-58 D25) and outside
  `docs:coverage`.
- The CLI's `formatReport` (`packages/cli/src/commands/impact.ts`) is the reference wording of a report
  (`DIRECTO`…`HISTORIAL`, `N salto(s)`, `desactualizado desde <7>`, `co-cambia N %`, `sin PR`, `[grafo]`,
  `[git]`). The web writes the same data in Spanish words for a reader, not the terminal codes.
- Layer order of the web (frontend-standards): test → types and service → pure functions → components →
  hook → page → route.

## Goals / Non-Goals

**Goals:**

- Reuse every pattern of Screen 2 that already passed review (hook with abort ref, status region, alert,
  invalid-message re-announcement, project bar), so Screen 3 adds rendering, not new mechanisms.
- Leave every existing requirement and test of Screen 2 unchanged except where the routes table and the
  accessibility gate list the paths.

**Non-Goals:**

- No shared abstraction between `useAsk` and `useImpact` (two ~60-line hooks; a generic hook would change
  `useAsk` and its tests for no behaviour gain).
- No change to `alertLinesOf`'s wording (see D11).

## Decisions

**D1 — The service is `impact()` in `api-client.ts`, not a new `services/impact.ts`.** `send`, `ApiError`,
`ApiUnavailableError` and the contract test live there and `ask()` follows the same shape; a separate file
would have to export `send`. Types `ImpactRequest`, `ImpactEntry`, `ImpactTest`, `ImpactDoc`,
`ImpactHistory`, `ImpactRisk`, `ImpactAnswered`, `ImpactUnknown`, `ImpactResponse` declared by hand,
compared in `api-contract.spec.ts` with `ImpactBody` and `ImpactResponse` of
`packages/api/src/schemas/impact.ts`, with a second negative control (`change` renamed). `send`'s
`accept` callback is `() => true`, as `ask()`: the body is returned unchanged (`web-foundation` → "Asking
for the impact of a change through the API client"). *Alternative:* runtime validation with Zod in the
web — rejected: the web does not depend on Zod and `ask()` trusts the contract test the same way.

**D2 — Route `/p/:projectId/impact`, rendered as `<ImpactPage key={projectId} …/>`** by a
`ProjectImpactRoute` in `router.tsx`, same pattern as `ProjectQueryRoute` (another project remounts, so
nothing of the previous project survives and its pending request is aborted).

**D3 — Navigation between Screen 2 and Screen 3 is a `<nav aria-label="Navegación del proyecto">` after
the main landmark,** passed to `PageFrame` through a new optional `nav` prop rendered after `<main>`
inside the frame. Screen 2's link «Analizar el impacto de un cambio» and Screen 3's link «Volver a las
preguntas». *Why there:* in the banner it would change `AskPage.test.tsx` → "A project outside the sample
constant is shown by its id" (`banner.textContent` is exactly `←<id>`) and the tab-order scenario; inside
the main landmark it would break "The result states add no tab stop" (it filters every tab stop after the
«Prueba:» group). After `<main>` it is the last tab stop, so every existing Screen 2 scenario holds
unedited. *Trade-off:* the link sits below the result, less visible than in the bar; accepted, it is a
labelled landmark that screen-reader users reach directly. *Alternative:* a link inside `ProjectBar`
(rejected for the two edits above).

**D4 — `maxHops` is a native `<select>` 1/2/3 with 2 selected, and is always sent.** A native select is
keyboard-operable and named by its `<label>` without ARIA; 2 is the API's default, so sending it always
makes the body explicit and testable (`{"change":…,"maxHops":2}`). The value is a number in the body
(`Number(select.value)`).

**D5 — Local validation of the change in `impact-display.ts` → `validChange(text)`:** trim, 5–500 code
points (`[...text].length`), no U+0000 — the rules of `impactBodySchema`; the API keeps them as the last
word. `validQuestion` of `answer-display.ts` is not touched (it checks only the length; a question with
U+0000 is reported by the API, `ask-page` → "Question box"). The trimmed text is what is sent.

**D6 — Wording (Spanish for a reader):** headings «Directo», «Indirecto», «Tests», «Documentación»,
«Historial» (wireframe `images/pantalla-3-impacto.svg` order); «exacta» / «heurística»; «N salto(s)»;
«al día» / «⚠ desactualizada desde el commit <sha7>» (⚠ `aria-hidden`); «co-cambia N %» with
`Math.round(rate * 100)` and a normal space before «%» (as the CLI); «PR #a, #b» / «sin PR»; «Sin
elementos» for an empty list; «Riesgo alto/medio/bajo». The symbol is left out when it equals the file
(file-level components, as the CLI's `named`). The pure writers live in `components/impact-display.ts`
(no React), unit-tested in `impact-display.test.ts`.

**D7 — No tokens or cost panel.** The wireframe draws «Uso de esta consulta» (tokens, coste, caché), but
`/impact` returns no `usage` and calls no model; `UsagePanel` is not reused and no figure is invented. The
report ends with «Informe determinista: sin llamada al modelo de lenguaje.». The wireframe image in
`readme.md` §1.3 is product imagery and is not edited; the difference is noted in `docs/DEMO.md`.

**D8 — Origin tags.** `OriginTag` renders the visible text «[grafo]» or «[git]» (the brackets are text),
using theme pairs only. Documents get no tag: the API's document entry has no `origin` field and the CLI
prints none; inventing «[grafo]» in the web would claim more than the contract says. The legend «Origen:
[grafo] análisis estático determinista · [git] señal histórica de co-cambio» follows the wireframe's
«Origen de cada elemento» box and `readme.md` §1.3 (why origins are declared).

**D9 — Risk block.** `RiskBanner` is a `<section aria-labelledby>` whose `<h2>` is «Riesgo alto» /
«Riesgo medio» / «Riesgo bajo» and a `<p>` with the rationale. Colours: `HIGH` uses the warning pair
(`bg-warning-soft`, `text-warning-ink`, `border-warning-border`), `MEDIUM` and `LOW` the neutral canvas
pair (`bg-canvas`, `text-ink`); all already declared in the `@theme` and covered by `theme.test.ts`, so no
token is added. The level is always in the heading text.

**D10 — Unknown state.** A new `ImpactUnknownState` with the structure of `UnknownState` (decorative ○,
`<h2>`, sentence, «Motivo: <reason>») and its own title and sentence; `UnknownState` is not reused because
its title «Sin respuesta verificada» and its sentence table are Screen 2's.

**D11 — Errors reuse `AskErrorNotice` and `alertLinesOf` unchanged.** They already cover
`RATE_LIMITED` (with `retryAfterSeconds`), `PROJECT_NOT_FOUND`, any other code as «Código: X.» and an
unavailable API. Their first line, «No se ha podido obtener la respuesta.», and «vuelve a preguntar» read
acceptably for a report; changing them would edit Screen 2's spec and tests. `ErrorBanner` is not used: it
is the health banner with a retry button of Screen 1.

**D12 — Hook `useImpact(projectId)`** copied from `useAsk`: states `idle | pending | answered | unknown |
failed`, an `AbortController` in a ref (two presses in one tick send one request), abort on unmount, a
settle that ignores an aborted controller, `AskFailure` from `notice-display.ts`. `send({ change, maxHops
})`.

**D13 — `ChangeBox`** follows `QueryBox`: a form, a visible `<label>` «Cambio» for a one-line
`<input type="text">` (Enter sends), a visible `<label>` «Saltos del grafo» for the `<select>`, a submit
button «Analizar» never disabled; `aria-invalid` and `aria-describedby` to the alert «Describe el cambio
en 5 a 500 caracteres.», keyed by an invalid-send counter so each invalid send inserts a new alert
(DIS-66 D12, D29). Visible labels instead of Screen 2's `sr-only` one, because the screen has two
controls whose purpose is not obvious from a placeholder.

**D14 — Project heading shared.** `projectHeading` moves from `AskPage.tsx` to
`components/project-display.ts` as an exported `projectHeadingOf(projectId)` returning `{ title, detail? }`
(TSDoc); `AskPage` keeps its placeholder text. Pure refactor: no Screen 2 test changes.

**D15 — Components:** `ImpactSection` (`<section aria-labelledby>` with `<h2>` and `<ul>` or `<p>` «Sin
elementos»), `ImpactReport` (the five sections, `RiskBanner`, legend, deterministic line), `OriginTag`,
`RiskBanner`, `ImpactUnknownState`, `ChangeBox`. Files and paths in `<code>`-styled spans; every API text
is a React text child. List keys are the index plus the text (lists may repeat an entry).

**D16 — Tests.** RTL in `pages/ImpactPage.test.tsx` mounting `routes` in a memory router with `fetch`
doubled at the network edge (template `AskPage.test.tsx`), each test named exactly as its scenario and
written Arrange-Act-Assert; unit tests in `impact-display.test.ts`; client tests appended to
`api-client.test.ts`; the Screen 2 link test appended to `AskPage.test.tsx`; axe in
`tests/a11y/impact-page.a11y.test.tsx` (template `ask-page.a11y.test.tsx`), which also holds the
gate's new scenario "The impact route has no axe violations". The gate's own test
`tests/a11y/smoke.a11y.test.tsx` is not edited: OpenSpec cannot rename a scenario inside a MODIFIED
requirement, so "The three routes have no axe violations" keeps its three paths and a new scenario covers
the fourth (the same for "The development server serves the three paths" and the new manual scenario
"The development server serves Screen 3").
The Q2 report fixture is written once in the test files from `docs/DEMO.md` «Paso 4».

**D17 — Status region** as Screen 2: one `<p role="status" className="sr-only">` always rendered after the
result area, text from a pure `announcementOf(state)` in `ImpactPage.tsx`.

**D18 — Core Web Vitals.** One more route in the same bundle, no image, font or lazy chunk; the page paints
without waiting for the network (no request on open), so LCP and CLS are those of Screen 2; the result
area grows below the form only after a send. The bundle size before and after is recorded in the step
report.

## Risks / Trade-offs

- [The navigation link after the main landmark is less visible than a link in the bar] → it is the last
  tab stop and a named landmark; the manual step checks it is visible without scrolling on the initial
  screen of a 1280×800 window.
- [The alert's first line says «la respuesta», not «el informe»] → accepted (D11); a later change can
  parametrise it with Screen 2's tests.
- [Q2 fixture drifts from the real API output] → the manual step runs the real `npm run up` and compares
  the screen with `docs/DEMO.md` «Paso 4»; the contract test catches shape drift.
- [Screen readers announce the status text and the visible pending text twice] → the visible pending text
  is `aria-hidden`, as Screen 2 (DIS-66 D22).
- [`packages/web` is not mutation-tested] → known since DIS-58 D25; DIS-77 owns the mutation and coverage
  gate.

## Migration Plan

No data or API migration. Rollback is reverting the web commit: the API and the CLI do not depend on
Screen 3.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E8 are the DIS-14 enrich decisions D1–D8 (comment of
2026-11-02 in the ticket); P1–P7 are design decisions of this proposal. Destinations: A = this change; B =
another existing ticket; C = the author (none in this change, by the author's instruction); D = accepted
and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | (D1) `impact()` in `api-client.ts`, no `services/impact.ts` (design D1). | A |
| E2 | (D2) Route `/p/:projectId/impact` with a link from Screen 2 and back to `/p/<id>` (design D2, D3). | A |
| E3 | (D3) `maxHops` as a `<select>` 1/2/3, 2 selected, always sent (design D4). | A |
| E4 | (D4) Local change validation with the body rules in `impact-display.ts`; `validQuestion` untouched (design D5). | A |
| E5 | (D5) Spanish wording of sections, levels, resolutions, documents and history (design D6). | A |
| E6 | (D6) No tokens or cost panel; deterministic-report line; wireframe image not edited, difference noted in `docs/DEMO.md` (design D7). The parent DIS-8 lists `UsagePanel` and «tokens y coste»: departure recorded here and in the PR. | A |
| E7 | (D7) Errors with `AskErrorNotice` / `alertLinesOf`, not `ErrorBanner` (design D11). The parent DIS-8 lists `ErrorBanner`: departure recorded. | A |
| E8 | (D8) The real-browser walkthrough is run by the agent with `/show-spec-working` against `npm run up`, screenshots next to its report; nothing is left for the author. If a `docs/DEMO.md` command is added or recaptured, the agent runs it from Bash with `pwsh -NoProfile -Command '…'` and `powershell.exe -NoProfile -Command '…'`, never setting `$env:` variables, and records versions and result. | A |
| P1 | The navigation link sits in a `nav` after the main landmark so no Screen 2 scenario or test changes (design D3). | A |
| P2 | Documents carry no origin tag (the API sends none); the legend explains the two tags (design D8). | D — accepted |
| P3 | The alert's first line stays «No se ha podido obtener la respuesta.» on Screen 3 (design D11). | D — accepted |
| P4 | Risk colours: warning pair for `HIGH`, neutral pair otherwise; no new theme token (design D9). | A |
| P5 | `projectHeading` moves to `project-display.ts` and is shared (design D14). | A |
| P6 | E2E with Playwright is out of scope; DIS-75 owns the suite and can add Screen 3 to it. | B — DIS-75 |
| P7 | `packages/web` stays outside Stryker's `mutate`; DIS-77 owns the mutation and coverage gate. | B — DIS-77 |
