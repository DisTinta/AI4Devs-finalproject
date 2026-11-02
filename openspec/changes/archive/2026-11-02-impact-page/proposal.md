## Why

The impact report (F3, `readme.md` §1.3 step 4) already works through the CLI `impact` (DIS-90, DIS-94)
and through `POST /api/projects/{projectId}/impact` (DIS-95), but the web client has no Screen 3: a person
who explores acme-shop in the browser cannot ask what a change would affect, and step 4 of the
demonstration walkthrough can only be shown in a terminal. DIS-14 (CM-HU-17.1, parent DIS-8 / CM-HU-17)
builds that screen now: its blockers are closed (DIS-95 and DIS-66 are Done), the API contract is fixed,
and Screen 2 (DIS-65, DIS-66) already proved every pattern the screen needs (page hook with abort, alerts,
status region, accessibility gate).

## What Changes

- **Screen 3 on `/p/{projectId}/impact`** (new route, keyed by the project id): the project bar of
  Screen 2 as its banner (back link «←» to `/`, the project's name or its id, the sample project's label
  and edge count), a change box and the result area, and after the main landmark a navigation link
  «Volver a las preguntas» to `/p/{projectId}`.
- **Change box**: a labelled one-line field «Cambio», a labelled `<select>` «Saltos del grafo» with the
  options 1, 2 and 3 (2 selected at first) and a button «Analizar» that is never disabled; Enter in the
  field also sends. The change is trimmed and checked locally with the rules of the API body (5 to 500
  code points, not only whitespace, no U+0000); an invalid change is marked on the field with the alert
  «Describe el cambio en 5 a 500 caracteres.» and nothing is sent. A valid one sends exactly
  `{"change":"<trimmed>","maxHops":<selected>}`.
- **Pending state**: «Calculando impacto…» takes the place of whatever was shown; further sends are
  ignored while one is pending; leaving the page aborts it; no time limit of its own.
- **Answered report**: five level-2 sections in this order — «Directo», «Indirecto», «Tests»,
  «Documentación», «Historial» — each with its entries in the API's order, or «Sin elementos» when empty
  (never hidden). Every entry of `direct`, `indirect` and `tests` carries the origin tag «[grafo]» and
  every history entry «[git]», as visible text, not colour alone; dependants show their hops («1 salto»,
  «2 saltos») and resolution («exacta» / «heurística»); documents say «al día» or «⚠ desactualizada desde
  el commit <7 characters>»; history entries say «co-cambia N %» and «PR #24, #33» or «sin PR». Then the
  risk block, headed «Riesgo alto» / «Riesgo medio» / «Riesgo bajo», with the API's `rationale` verbatim;
  then the origin legend and the line «Informe determinista: sin llamada al modelo de lenguaje.».
- **Unknown**: «Sin ancla en el grafo», a sentence that suggests naming a class or file (for example
  `DiscountService`) and «Motivo: no-anchor»; no section and no risk.
- **Errors**: the existing alert of Screen 2 (`alertLinesOf`) for `429`, `404`, `400`, `500` and an
  unavailable API; no previous report stays on screen.
- **Status region**: one visually hidden `status` element announcing «Calculando impacto…», «Informe de
  impacto recibido.» or «Sin ancla en el grafo.» (empty before the first send and on a failure).
- **Screen 2 link**: after Screen 2's main landmark, a navigation link «Analizar el impacto de un cambio»
  to `/p/{projectId}/impact`, so step 4 is reachable in the browser.
- **API client**: `impact(projectId, body, options)` (`options.signal` the caller's signal) in the existing typed client, with its request
  and response types declared by hand and checked against the API's schemas by the contract test.
- **Accessibility**: a new axe test scans Screen 3 in every state, and the gate of `web-foundation` gains
  the path `/p/<acme-shop id>/impact` as a new test appended to its own file.

## Capabilities

### New Capabilities

- `impact-page`: Screen 3 of the web client — its frame and navigation, the change box with its local
  validation and hop selector, the pending state, the answered report with its five sections, origin
  tags, documents, history and risk, how each entry is written, the honest `unknown`, the error alerts,
  the screen-reader announcements and the accessibility checks.

### Modified Capabilities

- `web-foundation`: "Paths of the web client and their screens" adds the row `/p/{projectId}/impact`
  (Screen 3, `impact-page`) and a scenario "The development server serves Screen 3"; "Cancellation by the
  caller" covers every client call, not "both"; "API types follow the API's schemas" adds the impact body
  and response; "Accessibility gate on the real routes" scans four paths, with a new scenario "The impact
  route has no axe violations" (the existing three-route scenario is kept as is); a new requirement "Asking for
  the impact of a change through the API client" specifies `impact()`.
- `ask-page`: a new requirement "Link to the impact screen" adds the navigation link after Screen 2's main
  landmark. No existing requirement of Screen 2 changes (the link is outside the main landmark and after
  every tab stop the existing scenarios list).

## Impact

- Code (web only): `packages/web/src/router.tsx` (new route); `packages/web/src/services/api-client.ts`
  (`impact()` and its types); `packages/web/src/components/PageFrame.tsx` (optional navigation after
  the main landmark); `packages/web/src/pages/AskPage.tsx` (the link; the project heading helper moves to
  `components/project-display.ts` so both screens share it); new `pages/{ImpactPage.tsx,useImpact.ts}`,
  `components/{ChangeBox,ImpactReport,ImpactSection,OriginTag,RiskBanner,ImpactUnknownState}.tsx`,
  `components/impact-display.ts`. No change to `packages/api`, `packages/core`, the adapters, the theme
  tokens or the database.
- Tests: new `packages/web/src/pages/ImpactPage.test.tsx`, `packages/web/src/components/impact-display.test.ts`,
  `tests/a11y/impact-page.a11y.test.tsx`; new tests added to the existing
  `packages/web/src/services/api-client.test.ts` and `packages/web/src/pages/AskPage.test.tsx`; the
  existing `tests/unit/web/api-contract.spec.ts` gains the impact comparisons; the existing
  `tests/a11y/smoke.a11y.test.tsx` gains one appended test, "The impact route has no axe violations" (no
  existing test of it is edited).
- Dependencies: none.
- Docs: `readme.md` §1.3 (status row of Screen 3 and the browser-steps sentence), `docs/DEMO.md`
  («Recorrido por la web» with Screen 3, note in «Paso 4»), `docs/frontend-standards.md` («How
  `test:a11y` is wired»), `docs/project-context.md` (web screens), `prompts.md`.
- Privacy/security: the page sends only the change the person types to the same-origin API; the change is
  not logged nor stored in the browser; every text of the API (symbols, paths, rationale, codes) is
  rendered as text (React escaping), with no `dangerouslySetInnerHTML` and no `VITE_*` variable.
- Performance: one more route in the same bundle, with no LCP-critical resource (no image, font or lazy chunk); the page paints without waiting for
  the network.

## Non-goals

- No E2E suite (Playwright is DIS-75); the browser checks are the manual and end-to-end steps.
- No change to `/impact`, its use case or its schema (no `usage`): no tokens or cost panel, because the
  report makes no model call.
- No graph visualisation, no links to pull requests or a remote repository, no applying or editing the
  change.
- No history of reports, no persistence in the browser, no comparison between reports.
