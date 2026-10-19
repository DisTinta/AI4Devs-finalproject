# Verify Against Spec — ask-page (DIS-65)

- Date: 2026-10-19
- Change: ask-page (DIS-65), task 15.3
- Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
  in its own context, after `/show-spec-working` (branch at `5f1a6e0`).
- Specs: `specs/ask-page/spec.md` (ADDED), `specs/project-picker/spec.md` (MODIFIED, two scenarios),
  `specs/web-foundation/spec.md` (REMOVED + ADDED). Code: `git diff origin/feature/entrega-2-CRN...HEAD --
  packages tests` (22 files: `packages/web/src/**`, `tests/a11y/ask-page.a11y.test.tsx`,
  `tests/unit/seed/suggested-questions-coherence.spec.ts`).

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Screen 2 frame and project bar | `packages/web/src/router.tsx:8-18` (route → `AskPage` keyed by id, D21); `components/PageFrame.tsx:9-15` (optional `banner`); `components/ProjectBar.tsx:9-24` (back link with `aria-label`, «←», `h1`, detail); `pages/AskPage.tsx:31-41` (name and detail for a sample project, id otherwise), `:109-116` (box → suggestions → result area; `useAsk` sends nothing on mount) | `pages/AskPage.test.tsx:170` and `:206` |
| Question box | `components/QueryBox.tsx:29-70` (form, hidden label «Pregunta», «→» `aria-hidden`, name «Preguntar», `aria-invalid` + `aria-describedby` → `p role="alert"`); `pages/AskPage.tsx:83-98` (trim and length check before sending, invalid mark cleared on change); `components/answer-display.ts` `validQuestion` (5–500 code points); body `{ question }` only through `services/api-client.ts` `ask` (`pages/useAsk.ts:70`) | `AskPage.test.tsx:232`, `:267`, `:307` |
| Suggested questions | `data/suggested-questions.ts:14-23` (keyed by the `SAMPLE_PROJECTS` id, own-key read, D31); `components/SuggestedQuestions.tsx:8-28` (group labelled by «Prueba:»); `pages/AskPage.tsx:100-107` (fills the field and sends) | `AskPage.test.tsx:344`; `tests/unit/seed/suggested-questions-coherence.spec.ts:31` |
| Pending question | `pages/useAsk.ts:49-80` (ref guard, no timer, abort on unmount, own-abort guard); `pages/AskPage.tsx:47-54` (status replaces the result), `:89-107` (sends ignored while pending) | `AskPage.test.tsx:366`, `:386`, `:419`, `:437` |
| Answer with typed and verified statements | `components/AnswerView.tsx` (heading, paragraph, `ol` in API order, badges, «Evidencia: …», no confidence or usage); `components/StatementBadge.tsx` (icon `aria-hidden` + text + colours of the table); `components/CodeText.tsx` (code fragments, plain text as React string children) | `AskPage.test.tsx:456`, `:503`, `:541`; colours: step 12 report and `/show-spec-working` |
| Expandable evidence | `components/EvidenceList.tsx` (`h2`, `ul`, keys = evidence ids); `components/EvidenceItem.tsx` (button with `aria-expanded`, ▸/▾ `aria-hidden`, `pre` only while expanded, `aria-controls` only then) | `AskPage.test.tsx:567`, `:595`, `:625` |
| How a question, an answer and an evidence location are written | `components/answer-display.ts` (`validQuestion`, `splitCode`, `evidenceLocation`) | `components/answer-display.test.ts` (three scenarios) |
| Provisional notice for what is not an answer | `components/AskFallbackNotice.tsx` (status for `UNKNOWN`, alert with code or «La API de CODEMIND no responde.», no button); `pages/useAsk.ts:32-37` (`ApiError` → code, anything else → unavailable; own abort paints nothing) | `AskPage.test.tsx:663`, `:682`, `:703` |
| Accessibility of Screen 2 | DOM order = tab order; no positive `tabindex` | `AskPage.test.tsx:735`; `tests/a11y/ask-page.a11y.test.tsx` (five states) |
| `web-foundation` → Paths of the web client and their screens | `router.tsx`; `AppHeader` kept for `/` and `*` | `router.test.tsx` ("An unknown path shows the not-found screen and leads back"); dev server: step 12 and `/show-spec-working` |
| `project-picker` → the two MODIFIED scenarios | (Screen 2's `h1` and field) | `ProjectPickerPage.test.tsx` ("The project link is reached and followed with the keyboard", "Leaving Screen 1 cancels a pending check") |

No dependency is imported that the manifests lack (`git diff` touches no `package.json` nor lock file; the
imports are `react`, `react-router`, `axe-core`, `@testing-library/*`, `vitest`, `node:*`, all present since
DIS-58). The page is a client: there is no authorisation check to make and no response field to add; the
API strips `status`/`warning` of statements and `AskStatement` (`services/api-client.ts:29-38`) has only
the four fields the spec renders.

## 2. Requirements missing or partial

| # | Requirement | What is partial | Severity |
|---|---|---|---|
| V1 | Accessibility of Screen 2: «Screen 2 SHALL have no `axe-core` violation in any of its states» | The scenario runs axe in jsdom, which computes no layout: rules that depend on it (`scrollable-region-focusable`, overflow, real colour contrast) are never evaluated there. `/show-spec-working` found exactly such a violation (S1, fixed in `5f1a6e0`). The requirement now holds (axe in Chromium: 0 violations at 320 and 960 px, every evidence expanded), but the automated gate cannot keep it | Minor |

Nothing else is missing: every requirement has code and every `#### Scenario:` a test of exactly the same
name, except the two the spec routes to the manual test and `/show-spec-working` ("Statement colours follow
the wireframe", "The development server serves the three paths"), both demonstrated live.

## 3. Unspecified behaviour

| # | Code | What it does | Decision |
|---|---|---|---|
| U1 | `pages/AskPage.tsx:34`, `:39` | Placeholder «Pregunta sobre el código de <name>» / «… del proyecto» | Design D4, D24: presentational (the label is the accessible name). Keep, not specified on purpose |
| U2 | `components/EvidenceItem.tsx:31` | `aria-controls` on the button only while expanded | Design D26: ARIA wiring of the spec's `pre`. Keep |
| U3 | `components/AnswerView.tsx:39`, `CodeText.tsx` | Code in the answer paragraph in `accent`, in a statement inherited | Design D19: colour pairs of the theme. Keep |
| U4 | `components/EvidenceItem.tsx:40` | Excerpts wrap instead of scrolling | Design D37 (S1): makes the accessibility requirement hold in a real browser; the `pre` text content is unchanged. Keep |
| U5 | `components/ProjectBar.tsx:21` | A thin divider before the detail | The wireframe's «│». Keep |
| U6 | `data/suggested-questions.ts:22` | Own-key read of the constant | Design D31: implements «a project without golden answers has none» for ids such as `constructor`. Keep |

Block 3 holds only presentational or wiring details recorded in the design; none is a behaviour a person
could rely on beyond the spec, so none needs a scenario.

Also checked:

- **A test weaker than its scenario:** "A project outside the sample constant is shown by its id" asserted
  «no language label» only as «no text matching `PHP`». Strengthened in this change: the banner's text is
  exactly «←» plus the id (`AskPage.test.tsx:219-220`), so no label of any language can pass. Every other
  test asserts at least what its `THEN` states (requests with URL, method, header and body; focus; exact
  texts; `aria-*` values; document order).
- **An answered body without evidence** would show «Evidencia» over an empty list. Not reachable: the API
  answers `UNKNOWN` `no-evidence` or `broken-evidence` when no statement keeps a citation
  (`packages/core/src/explain/explain.ts:333`, `:355`), and every kept statement cites at least one span
  (`:379-380`).

## Scenario → test → state

`npx vitest run packages/web tests/a11y tests/unit/seed` after the fixes of this review: 16 files, 68 tests,
all green.

| Scenario | Test | State |
|---|---|---|
| Screen 2 opens on a sample project without any request | `packages/web/src/pages/AskPage.test.tsx` | green |
| A project outside the sample constant is shown by its id | `AskPage.test.tsx` (strengthened) | green |
| A written question is sent trimmed | `AskPage.test.tsx` | green |
| An invalid question is not sent | `AskPage.test.tsx` | green |
| Changing an invalid question clears the mark | `AskPage.test.tsx` | green |
| A suggested question is sent at once | `AskPage.test.tsx` | green |
| The suggested questions are the golden questions | `tests/unit/seed/suggested-questions-coherence.spec.ts` | green |
| Sending again while a question is pending sends no request | `AskPage.test.tsx` | green |
| A new question replaces what was shown | `AskPage.test.tsx` | green |
| A pending question has no time limit of its own | `AskPage.test.tsx` | green |
| Leaving the page aborts the pending question | `AskPage.test.tsx` | green |
| An answered question shows the answer, its statements and its evidence | `AskPage.test.tsx` | green |
| Every combination of type and verification is labelled | `AskPage.test.tsx` | green |
| Markup in an answer is shown as text | `AskPage.test.tsx` | green |
| Statement colours follow the wireframe | manual: step 12 report, `2026-10-19-show-spec-working.md` | green (live) |
| Evidence expands and collapses with a pointer | `AskPage.test.tsx` | green |
| Evidence expands with the keyboard, one item at a time | `AskPage.test.tsx` | green |
| Repeated evidence is listed as received | `AskPage.test.tsx` | green |
| Question length is counted in code points after trimming | `packages/web/src/components/answer-display.test.ts` | green |
| Back-quoted fragments are shown as code | `answer-display.test.ts` | green |
| Evidence locations name the file and its lines | `answer-display.test.ts` | green |
| An UNKNOWN shows the provisional status | `AskPage.test.tsx` | green |
| An API error shows the provisional alert with its code | `AskPage.test.tsx` | green |
| An unavailable API shows the provisional alert | `AskPage.test.tsx` | green |
| Screen 2 has no axe violations in any of its states | `tests/a11y/ask-page.a11y.test.tsx` | green (jsdom; V1) |
| The tab order follows question, suggestions and evidence | `AskPage.test.tsx` | green |
| The project link is reached and followed with the keyboard (`project-picker`) | `packages/web/src/pages/ProjectPickerPage.test.tsx` | green |
| Leaving Screen 1 cancels a pending check (`project-picker`) | `ProjectPickerPage.test.tsx` | green |
| The other nine `project-picker` scenarios (unchanged text) | `ProjectPickerPage.test.tsx` | green |
| An unknown path shows the not-found screen and leads back (`web-foundation`) | `packages/web/src/router.test.tsx` | green |
| The development server serves the three paths (`web-foundation`) | manual: step 12 report, `2026-10-19-show-spec-working.md` | green (live) |

## Destinations

- V1 → **B**, DIS-75 (Playwright suite): run axe in the real browser on Screen 2 at a narrow and a desktop
  width with every evidence expanded; Spanish comment on DIS-75 and a line in `design.md` → Follow-ups.
- The weak assertion → **A**, fixed in this change (test strengthened, green).
- U1–U6 → **D**, accepted and documented in the decisions named.

Verdict: the implementation does what the specification says, with V1 routed to DIS-75. No Blocker or
Major is open.
