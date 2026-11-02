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
web — rejected: the web does not depend on Zod and `ask()` trusts the contract test the same way. *Departure:* this departs
from `docs/frontend-standards.md` §2 "Service layer: one module per resource", with the precedent of
`ask()` and the reason above (the private `send`); recorded in Follow-ups P11.

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
`Math.round(rate * 100)` and a normal space (U+0020, not the U+00A0 of `project-display.ts`'s digit
groups) before «%» (as the CLI); «PR #a, #b» / «sin PR»; «Sin elementos» for an empty list; «Riesgo
alto/medio/bajo» (`riskHeading`). The symbol is left out when it equals the file (file-level components,
as the CLI's `named`). The parts of an entry are separated by « · » (U+00B7 with a normal space on each
side), origin tag last, written as text nodes between the spans, so the `li`'s `textContent` — what a
screen reader reads — is for example «PriceCalculator · app/Services/PriceCalculator.php · 1 salto ·
exacta · [grafo]». The pure writers live in `components/impact-display.ts` (no React), unit-tested in
`impact-display.test.ts`.

**D7 — No tokens or cost panel.** The wireframe draws «Uso de esta consulta» (tokens, coste, caché), but
`/impact` returns no `usage` and calls no model; `UsagePanel` is not reused and no figure is invented. The
report ends with «Informe determinista: sin llamada al modelo de lenguaje.». The wireframe image in
`readme.md` §1.3 is product imagery and is not edited; the difference is noted in `docs/DEMO.md`.

**D8 — Origin tags.** `OriginTag` renders the visible text «[grafo]» or «[git]» (the brackets are text)
with the blue badge pair `text-accent` on `bg-accent-soft` (`#1971c2` / `#e7f5ff`) for both; the text, not
the colour, tells them apart. No icon: DIS-14 AC 1 asks for the text only; the parent DIS-8's «texto +
icono» is a departure recorded in Follow-ups P9. Documents get no tag: the API's document entry has no `origin` field and the CLI
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
unavailable API. The alert's first line stays «No se ha podido obtener la respuesta.» and the rate-limit
line keeps «vuelve a preguntar»; both are accepted wording for Screen 3 (Follow-ups P3); changing them
would edit Screen 2's spec and tests. `INVALID_IMPACT_REQUEST`, `VALIDATION_ERROR` and `INTERNAL` get no
sentence of their own, only «Código: X.»: the UI cannot send an out-of-range `maxHops` (the list offers
1–3) nor an invalid change (local validation), and DIS-14 AC 4 accepts `alertLinesOf`; the parent DIS-8's
«`code` traducido a mensaje legible» is a departure recorded in Follow-ups P10. `ErrorBanner` is not used: it
is the health banner with a retry button of Screen 1.

**D12 — Hook `useImpact(projectId)`** copied from `useAsk`: states `idle | pending | answered | unknown |
failed`, an `AbortController` in a ref (two presses in one tick send one request), abort on unmount, a
settle that ignores an aborted controller, `AskFailure` from `notice-display.ts`. `send({ change, maxHops
})`.

**D13 — `ChangeBox`** follows `QueryBox`: a form, a visible `<label>` «Cambio» for a one-line
`<input type="text">` (Enter sends), a visible `<label>` «Saltos del grafo» for the `<select>`, a submit
button «Analizar» never disabled; `aria-invalid` and `aria-describedby` to the alert «Describe el cambio
en 5 a 500 caracteres.», keyed by an invalid-send counter so each invalid send inserts a new alert
(DIS-66 D12, D29). The field «Cambio» has no placeholder (the visible label names it). Visible labels instead of Screen 2's `sr-only` one, because the screen has two
controls whose purpose is not obvious from a placeholder.

**D14 — Project heading shared.** `projectHeading` moves from `AskPage.tsx` to
`components/project-display.ts` as an exported `projectHeadingOf(projectId)` returning `{ title, detail? }`
(TSDoc); `placeholder` leaves the shared shape. `AskPage` derives its placeholder from it: «Pregunta sobre
el código de <title>» when `detail !== undefined` (a sample project), «Pregunta sobre el código del
proyecto» otherwise — the same two texts as today. The module TSDoc of `project-display.ts`, which now
describes only "how a sample project is written on its card", is widened to "how a project is written on
its card and in the project bar of Screens 2 and 3", since the new function imports `SAMPLE_PROJECTS`.
Pure refactor: no Screen 2 test changes.

**D15 — Components:** `ImpactSection` (`<section aria-labelledby>` with `<h2>` and `<ul>` or `<p>` «Sin
elementos»), `ImpactReport` (the five sections, `RiskBanner`, legend, deterministic line), `OriginTag`,
`RiskBanner`, `ImpactUnknownState`, `ChangeBox`. Files and paths in `<code>`-styled spans; every API text
is a React text child. List keys are the index plus the text (lists may repeat an entry).

*Colour pairs* (only rows of `web-foundation` → "Theme colours and minimum contrast"; the report sits on
the frame's white `bg-surface`, `PageFrame`; never `text-ink-subtle` on `bg-canvas`):

| Element | Text / background utilities | Table row |
|---|---|---|
| Section headings, entry symbols | `text-ink` on `bg-surface` | `#212529` / `#ffffff` |
| File and path `<code>` spans, hops, resolution, « · » separators | `text-ink-muted` on `bg-surface` | `#495057` / `#ffffff` |
| `OriginTag` «[grafo]» / «[git]» | `text-accent` on `bg-accent-soft` | `#1971c2` / `#e7f5ff` |
| «Sin elementos» | `text-ink-muted` on `bg-surface` | `#495057` / `#ffffff` |
| Document line «al día», history line (rate, PR list) | `text-ink-muted` on `bg-surface` | `#495057` / `#ffffff` |
| Stale document «⚠ desactualizada desde el commit …» | `text-warning-ink` on `bg-warning-soft` | `#5c3d00` / `#fff9db` |
| Risk block `HIGH`: heading and rationale | `text-warning-ink` on `bg-warning-soft` | `#5c3d00` / `#fff9db` |
| Risk block `MEDIUM` / `LOW`: heading | `text-ink` on `bg-canvas` | `#212529` / `#f8f9fa` |
| Risk block `MEDIUM` / `LOW`: rationale | `text-ink-muted` on `bg-canvas` | `#495057` / `#f8f9fa` |
| Legend and deterministic line | `text-ink-muted` on `bg-surface` | `#495057` / `#ffffff` |
| `ImpactUnknownState` (as `UnknownState`) | `text-ink` heading, `text-ink-muted` text on `bg-canvas` | `#212529` and `#495057` / `#f8f9fa` |
| Navigation links | `text-accent` on `bg-surface` | `#1971c2` / `#ffffff` |

axe in jsdom cannot judge contrast (`docs/frontend-standards.md` → «How `test:a11y` is wired»), so the
pairs are fixed here, kept by `theme.test.ts` for the tokens, and checked by hand with the browser's
contrast inspector in task 11.4.

**D16 — Tests.** RTL in `pages/ImpactPage.test.tsx` mounting `routes` in a memory router with `fetch`
doubled at the network edge (template `AskPage.test.tsx`), each test named exactly as its scenario and
written Arrange-Act-Assert; unit tests in `impact-display.test.ts`; client tests appended to
`api-client.test.ts`; the Screen 2 link test appended to `AskPage.test.tsx`; axe in
`tests/a11y/impact-page.a11y.test.tsx` (template `ask-page.a11y.test.tsx`) for the eight states of
Screen 3. The gate's new scenario "The impact route has no axe violations" is a new `it` appended to the
gate's own test `tests/a11y/smoke.a11y.test.tsx` (no existing test of that file is edited), so the gate
file scans the four routes. `SCANNED_PATHS` keeps its three paths: OpenSpec refuses to drop or rename a
scenario of a MODIFIED requirement — verified in spec-audit round 1 with `openspec validate impact-page
--strict` on a draft renaming it to "The four routes have no axe violations" ("MODIFIED … omits
scenario(s) the current spec still has … archive refuses to drop them") — so "The three routes have no
axe violations" keeps its name and its three paths (the same for "The development server serves the three
paths" and the new manual scenario "The development server serves Screen 3"). The route itself is covered
by `ImpactPage.test.tsx`, which mounts `routes` in a memory router as `AskPage.test.tsx` does;
`router.test.tsx` is not edited. Both are departures from the DIS-14 technical context and from the
frontend-standards sentence "a new route needs its path added", recorded in Follow-ups P8; task 13.3
rewrites that sentence.
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
2026-11-02 in the ticket); P1–P7 are design decisions of this proposal; P8–P13 are the agent's decisions
on spec-audit run 1 (its questions Q1 and Q2 included); P14 comes from spec-audit run 2, P15–P16 from the
apply step and P17–P20 from the pre-merge review (`reports/2026-11-02-adversarial-review.md`). Destinations: A = this change; B =
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
| P8 | (Spec audit 1, I1/I10) The gate's scenario "The three routes have no axe violations" and `SCANNED_PATHS` keep three paths, because OpenSpec refuses to rename or drop a scenario of a MODIFIED requirement (verified with `openspec validate --strict`); the impact path gets its own `it` "The impact route has no axe violations" appended to `tests/a11y/smoke.a11y.test.tsx`, so the gate file still scans every route. `router.test.tsx` is not edited: the route is covered by `ImpactPage.test.tsx`, which mounts `routes`. Departure from the DIS-14 technical context and from the frontend-standards sentence "a new route needs its path added"; task 13.3 rewrites that sentence (design D16). | D — accepted |
| P9 | (Spec audit 1, Q1) Origin tag as text only, «[grafo]» / «[git]», no icon: DIS-14 AC 1 asks for the text; the text already avoids colour alone (WCAG 1.4.1); an `aria-hidden` icon would widen the scope with no accessibility gain. Departure from the parent DIS-8 AC 1 «texto + icono», recorded here and in the PR, like E6 and E7 (design D8). | D — accepted |
| P10 | (Spec audit 1, Q2) `INVALID_IMPACT_REQUEST`, `VALIDATION_ERROR` and `INTERNAL` show the generic alert «No se ha podido obtener la respuesta.» + «Código: X.» through `alertLinesOf` unchanged: the UI cannot produce an out-of-range `maxHops` or an invalid change, DIS-14 AC 4 accepts `alertLinesOf`, and a new line would edit Screen 2's `notice-display.ts` and spec. Departure from the parent DIS-8 «`code` traducido a mensaje legible», recorded here and in the PR (design D11). | D — accepted |
| P11 | (Spec audit 1, I12) `impact()` stays in `api-client.ts`, a departure from `docs/frontend-standards.md` §2 "one module per resource", with the precedent of `ask()` and the private `send` (design D1). | D — accepted |
| P12 | (Spec audit 1, B1) axe in jsdom cannot report `color-contrast`; the contrast of every new text is fixed per element in design D15 and checked by hand in 11.4, and the RED of the axe scan uses a rule jsdom detects (`<select>` without its `<label>`). | A |
| P14 | (Spec audit 2, I1–I6) The six non-blocking improvements were applied before the code: the scenario "A pending report has no time limit of its own", a third run (unknown state) in the tab-order scenario, the focus element named per run in "A valid change is sent trimmed…", no placeholder in the field «Cambio» (D13), `unknown` also writes a `query_log` row (11.1) and a change with search terms for `PROJECT_NOT_FOUND` (11.3a). | A |
| P15 | (Apply) The report components, the hook and the page were written before the tests of task groups 4 to 8; each guarding test was then checked with a local mutation, seen failing and reverted (step 10 report). The two small helper components that the tasks did not name, `ProjectNav` (the «Navegación del proyecto» landmark shared by Screens 2 and 3), are an implementation detail of design D3. | D — accepted |
| P16 | (Apply) The real-browser walkthrough of step 11 was driven by a `playwright-core` script installed in the session scratchpad (no repository dependency), because the Playwright MCP server was not available to the step; contrast was computed from the rendered colours with the WCAG formula. The screen was also exercised with the API stopped (only the web started). | D — accepted |
| P13 | (Spec audit 1, B2) Keyboard operation of «Saltos del grafo» is not claimed by an RTL test (jsdom does not move a native `<select>` on arrow keys); it is checked in the real-browser scenario "The walkthrough step 4 runs in a real browser" (task 11.4). | A |
| P17 | (Review, adversarial Minor) `readme.md` §1.3 still said `docs/DEMO.md` walks «las dos pantallas»; fixed to «las tres pantallas» in this PR. | A |
| P18 | (Review, adversarial Minor) The `controller.signal.aborted` guard of `useImpact`'s `settle` survives its removal (20 tests green): an equivalent mutant, since the controller aborts only on unmount and React ignores updates on an unmounted component; same pattern as `useAsk`. Handed to DIS-77, which brings `packages/web` into the mutation gate. | B — DIS-77 |
| P19 | (Review, adversarial Minor) The colour pair of the risk block per level is not asserted by an automated test; the level is always in the heading text (tested) and the pairs were measured in a real browser for the three levels (`reports/2026-11-02-show-spec-working.md`). | D — accepted |
| P20 | (Review, adversarial Minor and Question) Tests after code in groups 4–8 (P15) and the delta tightened in the implementation commit with the spec-audit run 2 improvements (P14): process record, no further action. | D — accepted |
| P21 | (Archive, agent's text) Task 14.7: the `## Purpose` of `openspec/specs/web-foundation/spec.md` says «its routes and the screens shown before the real ones exist, … an accessibility gate that fails CI on the real routes»; it names no route and no count, so it stays true with the fourth route and needs no wording change. The `## Purpose` of `ask-page` describes Screen 2 only and is unchanged; the link to Screen 3 is a requirement, not its purpose. No main spec is edited by hand; the sync creates `impact-page` with the `## Purpose` of its delta. | D — accepted |
