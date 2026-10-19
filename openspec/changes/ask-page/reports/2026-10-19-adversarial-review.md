# Adversarial Review — ask-page (DIS-65)

- Date: 2026-10-19
- Change: ask-page (DIS-65), task 15.4
- Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
  in its own context, after `/show-spec-working` and `/verify-against-spec` (branch at `d7703a2`). Read:
  `proposal.md`, `design.md`, `tasks.md`, the three delta specs, the step 11 and step 12 reports, and
  `git diff origin/feature/entrega-2-CRN...HEAD -- packages tests`. Hostile input was tried in the browser
  (Vite with the ask route answered by `page.route`, scratchpad script `adv65-long.mjs`, not committed)
  and in jsdom.

## Adversarial review

### Findings

| Severity | File:line | Finding | Why it matters |
|---|---|---|---|
| Major | `packages/web/src/pages/AskPage.tsx:111`, `components/PageFrame.tsx:11` | A long word with no break opportunity in the answer or in a statement (a path in back-quotes such as `packages/adapters/store-postgres/src/repositories/…Repository….ts`, or a long identifier) runs past the card at 320 px, and the frame's `overflow-hidden` **clips** it: the end of the path is not visible and cannot be scrolled to (`code` right edge at 564 and 604 px in a 320 px frame). Model answers routinely cite paths in back-quotes | Content lost on a narrow screen (WCAG 1.4.10 Reflow); the golden answers happen to fit, so neither the manual test nor `/show-spec-working` showed it. Screenshot `./2026-10-19-adv-long-tokens-320.png` |
| Minor | `packages/web/src/pages/AskPage.tsx:89-92` | The page's `if (pending) return` in `onSubmit` was not observed by any test (step 11 mutation survivor): without it, Enter with an invalid text while a question is pending shows the invalid mark and message, which «change nothing on the screen» forbids; "Sending again while a question is pending sends no request" only sends a valid text | A regression would pass the suite; the spec did not say explicitly that an invalid send while pending shows no message |
| Minor | `packages/web/src/components/QueryBox.tsx:60-68` | Sending the same invalid text twice leaves the `role="alert"` mounted with the same text: the second send changes no DOM, so a screen reader announces the message only once | A person who presses Enter again hears nothing. Belongs to the screen-reader pass of the states (design D25) |
| Minor | `packages/web/src/pages/useAsk.ts:57-59` | The hook's pending-ref guard is not observable through the page: React flushes each discrete event (click, Enter) synchronously, so the page's `pending` check always runs first. Same for the own-abort guard, visible only under `StrictMode` (as in DIS-60) | Defence in depth with no test; documented in the step 11 report |
| Question | — | Is the `security-reviewer` agent needed? The diff touches no server entry point, rate limit, secret or stored personal data: it is a same-origin client. Its one security surface is rendering untrusted model output, pinned by "Markup in an answer is shown as text"; there is no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or dynamic `href` in `packages/web/src` and a scan of the added lines for keys, tokens, storage and console logging found none | Recorded so the skip is a decision, not an omission |

What else was attacked and held:

- **Boundaries of the question:** 4 and 5 code points, 500 and 501, astral characters, whitespace only:
  `validQuestion` matches the API (`packages/api/src/schemas/ask.ts:43-49`; Zod 4 counts code points:
  300 × U+1F600 accepted, 4 rejected, checked with `node`). U+0000 reaches the API and comes back as
  «Código: VALIDATION_ERROR.» (spec: other rules are the API's).
- **Wrong-meaning ids:** `/p/constructor` (own-key read, D31), `/p/foo` (the API's `400` →
  `VALIDATION_ERROR` alert), a 404 id (live `PROJECT_NOT_FOUND`, `/show-spec-working`).
- **The same request twice / two at once:** four sends while pending → one request (test); a second
  project path remounts the page and aborts (D21).
- **Markup and injection:** `<img onerror>` in a statement, `<b>`/`<i>` in the answer → text (test; React
  string children only, `CodeText.tsx`).
- **Unexpected bodies:** a non-JSON `200` → «La API de CODEMIND no responde.»; an answered body without
  evidence is not reachable (`packages/core/src/explain/explain.ts:333`, `:355`).
- **Blast radius:** `PageFrame` keeps `AppHeader` by default (Screen 1, not-found, error screen unchanged,
  their tests green); `PendingScreen` had one importer, removed with it; no data is written by the web; no
  migration. The two existing tests edited (`router.test.tsx` removal, `ProjectPickerPage.test.tsx`
  assertions) follow MODIFIED/REMOVED scenarios of the delta (D12, D17) and are recorded in the step 11
  report.
- **Spec history:** the delta specs were last edited in `fd3d5ae` (spec audit), before the first code
  commit `78b70d5`; the only later edit is the scenario added in this review through `/opsx:update`
  (below), test first.
- **Evidence quality:** "A new question replaces what was shown" kills the mutant that skips
  `setState({ status: 'pending' })` in `useAsk.send` (the previous answer would stay on screen); the step 11
  targeted mutation run scored 84.29 % on the new web files.

### Fixes in this change

1. **Major → A.** Screen 2's content wraps long words (`overflow-wrap: break-word` on the `text-left`
   wrapper, design D38). Re-probed at 320 px with the same hostile answer: no element past the frame,
   document width 320 (`./2026-10-19-adv-long-tokens-320-fixed.png`). jsdom computes no layout, so the
   check is the browser probe; the automated version is routed with V1 to DIS-75.
2. **Minor (pending guard) → A.** `/opsx:update` added to "Pending question" the clause «whether or not the
   field holds a valid question: no invalid mark and no message either» and the scenario "An invalid send
   while a question is pending changes nothing" (addendum in `2026-10-19-spec-audit.md`); its test in
   `AskPage.test.tsx` failed with the guard removed locally (`expected 'true' to be null`, the field's
   `aria-invalid`) and passes with it.

### Verdict

PASS — after the two fixes above there is no Blocker and no Major; the remaining gaps have destinations.
Re-check after the fixes: `npm run lint`, `npm run typecheck`, `npm run test:a11y` (3 files, 5 tests) and
`npx vitest run packages/web tests/a11y tests/unit/seed tests/unit/web` (18 files, 71 tests) green; the
320 px browser probe clean.

### Recommended next steps before archiving

1. Destinations (also in `design.md` → Follow-ups):
   - long words clipped → **A**, fixed (D38);
   - pending guard → **A**, fixed (spec scenario + test);
   - alert not re-announced on a repeated invalid send → **B**, DIS-66 (screen-reader pass of the states,
     D25), Spanish comment on DIS-66;
   - unobservable hook guards → **D**, accepted (defence in depth; step 11 report);
   - `security-reviewer` not run → **D**, accepted with the reasons above.
2. Open the pull request (task 15.1) and keep CI green before `/opsx:archive`.
