## Why

Screen 1 (DIS-60, `project-picker`) leads to `/p/{projectId}`, but that path still shows the placeholder
«Esta pantalla está en construcción.»: a person who opens acme-shop from the web cannot ask anything, so
the main flow of the product (question → answer → cited evidence, readme §1.3, wireframe
`images/pantalla-2-consulta.svg`) only exists in the CLI and the HTTP API. DIS-65 (CM-HU-15b.1, parent
DIS-62) builds that flow now: its blockers are closed (DIS-60 merged, `POST /api/projects/{id}/ask` of
DIS-78 and the golden answers of DIS-26/DIS-34 answer the three demo questions without a model), and
DIS-66 (usage panel and the final `UNKNOWN`/`429`/error states) builds on the page this change adds.

## What Changes

- **Screen 2 on `/p/{projectId}`** (replaces the placeholder): a dark project bar instead of the
  CODEMIND header, as the wireframe draws it — a back link «←» (accessible name «Volver a la selección
  de proyecto»), the project name as the level-1 heading, «PHP / Laravel» and «170 aristas» (the seed's
  figures) for a sample project; only the id for any other project.
- **Question box**: a one-line field labelled «Pregunta» and a button «→» named «Preguntar»; Enter
  sends. The question is trimmed and checked locally (5 to 500 code points, as the API) before any
  request; an invalid one is marked on the field with the message «Escribe una pregunta de 5 a 500
  caracteres.» and nothing is sent.
- **Suggested questions**: «Prueba:» and one button per golden question of the project, in golden order
  (Q1, Q3, Q4 of acme-shop), from a new hand-written constant per sample project; pressing one fills the
  field and sends it at once.
- **Pending state**: «Buscando evidencia…» in a status region where the answer goes; repeated sends are
  ignored while a question is pending; leaving the page aborts it.
- **Answer**: the heading «Respuesta», the answer text (inline `code` for back-quoted fragments, no
  Markdown) and an ordered list of statements, each with two badges — type («● HECHO» / «⚠ INFERIDO»)
  and verification («✓ verificado» / «○ sin verificar») — always icon + text + colour, and the ids of the
  evidence it cites.
- **Evidence**: the heading «Evidencia» and one collapsed item per evidence («ev-1 ·
  app/Services/PriceCalculator.php:16-44»), a button with `aria-expanded` that shows and hides the exact
  `excerpt` of the API in a `pre` block, independently per item, by mouse or keyboard.
- **Provisional notice until DIS-66**: an `UNKNOWN` shows «Sin respuesta verificada (motivo: <reason>).»
  as a status; an API error or an unavailable API shows the alert «No se ha podido obtener la
  respuesta.» with the error code or «La API de CODEMIND no responde.». Never an empty screen.
- **Accessibility**: a new axe test scans Screen 2 pending, answered with one evidence expanded, and
  with the provisional notice; the existing gate keeps scanning `/p/<acme-shop id>` unedited.
- **Coherence suggested questions ↔ golden answers**: a new unit test fails when the acme-shop
  suggestions stop being exactly the questions of `seeds/cache/acme-shop.json`, in order, or when a key
  of the constant is not a sample project id.
- Deviations from the wireframe (project bar without ⟳, real counts, golden question texts and no
  «legacy_ref» suggestion, the «HECHO» label, inferences in place instead of a box at the end, no
  per-evidence «entailed» badge, no PR evidence, no usage strip) are recorded as decisions in `design.md`
  and in the Enhanced description of DIS-65.

## Capabilities

### New Capabilities

- `ask-page`: Screen 2 of the web client — the project bar, the question box with its local validation,
  the suggested questions and their coherence with the golden answers, the pending state, the answer
  with its typed and verified statements, the expandable evidence list, the provisional notice for what
  is not an answer, and their accessibility checks.

### Modified Capabilities

- `web-foundation`: requirement "Routes and screens of the web client" is replaced (REMOVED + ADDED,
  design D15) by "Paths of the web client and their screens": `/p/{projectId}` now shows Screen 2 (the
  `ask-page` capability) with the project bar as its banner instead of a placeholder; the scenario "A
  project path shows the Screen 2 placeholder with its id" is retired, and the other scenarios are kept
  unchanged.

## Impact

- Code: `packages/web/src/router.tsx` (`/p/:projectId` → `AskPage`); `packages/web/src/components/PageFrame.tsx`
  (optional banner, `AppHeader` by default); new `packages/web/src/pages/{AskPage.tsx,useAsk.ts}`,
  `packages/web/src/components/{ProjectBar,QueryBox,SuggestedQuestions,AnswerView,StatementBadge,EvidenceList,EvidenceItem,AskFallbackNotice}.tsx`,
  `packages/web/src/components/answer-display.ts`, `packages/web/src/data/suggested-questions.ts`;
  `packages/web/src/components/PendingScreen.tsx` is removed (no route uses it any more, design D16). No
  change to the API client, the theme tokens, `SAMPLE_PROJECTS`, the API or the backend packages.
- Tests: new `packages/web/src/pages/AskPage.test.tsx`, `packages/web/src/components/answer-display.test.ts`,
  `tests/unit/seed/suggested-questions-coherence.spec.ts`, `tests/a11y/ask-page.a11y.test.tsx`. In
  `packages/web/src/router.test.tsx` only the test of the retired scenario is removed (design D12); no
  other existing test is edited.
- Dependencies: none (react-router 7, Tailwind 4, RTL, user-event, axe-core and jsdom are installed).
- Docs: `docs/project-context.md` (web section), `docs/frontend-standards.md` («How test:a11y is
  wired»: the new a11y file), `docs/DEMO.md` if it describes the web, `prompts.md` (section + Índice,
  appended at the end of the file).
- Privacy/security: the page sends only the question the person types to the same-origin API (no
  personal data stored, nothing kept in the browser); the answer, the statements and the excerpts are
  rendered as text (React escaping), with no `dangerouslySetInnerHTML`, no Markdown library and no
  `VITE_*` variable.
- Performance: the page paints without waiting for the network; the pending state takes the place of
  the answer, so the layout below the suggestions only grows when the answer arrives.

## Non-goals

- No usage panel, `confidence`, tokens, cost, latency, savings or cache indicator (DIS-66).
- No final `UNKNOWN` (`no-anchor`, `llm-required`), `429` or error states, nor the full keyboard pass of
  DIS-62: only the provisional notice (DIS-66 replaces it).
- No history, no persistence in the browser, no streaming, no cancel button, no `useCache` or
  `tokenBudget` in the interface.
- No link to a remote repository nor line numbers next to the excerpt: the excerpt is the API's.
- No ⟳ re-index button (there is no indexing from the web).
- No Playwright suite (DIS-75): the browser checks are the manual and end-to-end steps.
