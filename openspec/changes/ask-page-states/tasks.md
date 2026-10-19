## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 First action of the apply: confirm DIS-66 is In Progress in Linear (set it if not), with a short comment in Spanish naming the change `ask-page-states` and the branch `feature/DIS-66-usage-panel-states`
- [ ] 0.2 Feature branch `feature/DIS-66-usage-panel-states` (`BRANCH_PREFIX=feature/`, `docs/project-context.md` → Branch and ticket conventions), created from `feature/entrega-2-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/feature/entrega-2-CRN HEAD` and that `openspec/changes/ask-page-states/` is on it. `git fetch`; if `origin/feature/entrega-2-CRN` moved, rebase before any code (never force-push a published branch)
- [ ] 0.3 Verify the current branch (`git branch --show-current`) and `git status`; the local changes under `.claude/` are never staged
- [ ] 0.4 Baseline for the step 11 report: run `npx vitest run` once, green, and record files, tests and duration; run `npm run build -w packages/web` and record the size of `packages/web/dist/assets/*`; record that the code tasks touch no database (step 12 captures its own state)

## 1. How usage figures are written (TDD, design D2, D3, D4, D20, D25, D28) — `ask-page` → "How usage figures and notice details are written"

Every test of this change follows Arrange-Act-Assert with the three blocks commented (frontend-standards §4) and is named exactly as its scenario.

- [ ] 1.1 RED: create `packages/web/src/components/usage-display.test.ts` (Node environment) with "Confidence is written with two decimals" (the five inputs and outputs of the scenario). See it fail (module missing)
- [ ] 1.2 GREEN: `packages/web/src/components/usage-display.ts` with the confidence writer (module and export TSDoc, pattern of `answer-display.ts`)
- [ ] 1.3 RED → GREEN: "Tokens are counted with grouped digits" (token total via `formatCount(input + output, 'token', 'tokens')`; the baseline line; U+00A0 written by code point in the test). Export `groupDigits` from `project-display.ts` with TSDoc (D20); `project-display.test.ts` stays untouched and green
- [ ] 1.4 RED → GREEN: "Cost is written in dollars"
- [ ] 1.5 RED → GREEN: "Latency is written in milliseconds or seconds"
- [ ] 1.6 RED → GREEN: "Savings are written only when there are savings" (the writer returns the whole badge text and whether it is a saving, so the panel picks the colours)

## 2. How notice details are read (TDD, design D9, D19, D26, D27) — `ask-page` → "How usage figures and notice details are written"

- [ ] 2.1 RED: create `packages/web/src/components/notice-display.test.ts` (Node environment) with "The budget reset time is written in UTC" (the seven inputs; `details` given as `Record<string, unknown>`). See it fail (module missing)
- [ ] 2.2 GREEN: `packages/web/src/components/notice-display.ts` with the strict reset-time reader and its UTC writer (`getUTC*`, no `Intl`, D27)
- [ ] 2.3 RED → GREEN: "The wait of a rate limit is read only when it is a whole number of seconds" (`Number.isInteger(value) && value >= 1`, D26)

## 3. Status region and pending text (TDD, design D11, D22, D24, D32) — `ask-page` → "Screen 2 frame and project bar", "Pending question", "Answer with typed and verified statements", "Screen reader announcements of Screen 2"; REMOVED "Provisional notice for what is not an answer"

- [ ] 3.1 Retire the tests of the removed requirement first (D24): in `packages/web/src/pages/AskPage.test.tsx` delete only the `describe('Provisional notice for what is not an answer')` block (three tests) and the constants only it used (check each with `grep`; constants that step 6 needs again are added back there); `npm run lint` clean. `AskFallbackNotice.tsx` stays in use until 6.6. Record the three deleted tests with their reason in the step 11 report
- [ ] 3.2 RED (changed scenarios, D24): in `AskPage.test.tsx` → "Screen 2 opens on a sample project without any request", replace only `expect(screen.queryByRole('status')).toBeNull()` with "exactly one `status` element whose text is empty" (`getAllByRole('status')` length 1, `textContent` `''`); in "An answered question shows the answer, its statements and its evidence", replace only `expect(screen.queryByRole('status')).toBeNull()` with "the only `status` element holds «Respuesta recibida.»". See both fail against the current code (no status element) and record them for the step 11 report
- [ ] 3.3 RED: "The pending text is not read twice" (never-answering double; press Q1; `getAllByRole('status')` length 1 with text exactly «Buscando evidencia…»; `textNodesWith(document.body, SEARCHING)` has two nodes, one inside the status and one whose parent has `closest('[aria-hidden="true"]')`). See it fail
- [ ] 3.4 GREEN: in `AskPage.tsx`, a local pure function `announcementOf(state: AskState): string` (empty for `idle` and `failed`, the texts of the spec otherwise; D32) and one `p role="status" className="sr-only"` after `ResultArea`, always rendered, holding it; `ResultArea`'s pending text becomes `p aria-hidden="true"` (D22). 3.2, 3.3 and every existing test of "Suggested questions" and "Pending question" pass unchanged

## 4. Answer and usage panel (TDD, design D2–D6, D14, D21, D24, D30) — `ask-page` → "Answer with typed and verified statements", "Usage panel"

- [ ] 4.1 RED: "An answer from the model shows its usage panel" (`getByRole('region', { name: 'Uso' })`; its `h2`; after the `Evidencia` heading and both evidence buttons by `compareDocumentPosition`; the eight texts in order by their index in the region's `textContent`; U+00A0 groups; every text node « · » under `aria-hidden`; no `a`, `button`, `input` in the region). See it fail
- [ ] 4.2 GREEN: `packages/web/src/components/UsagePanel.tsx` (props interface `{ confidence: number; usage: AskUsage }`, TSDoc, `section aria-labelledby` + `h2 className="sr-only"`, figures from `usage-display.ts`, theme pairs of D30, `flex-wrap`, badges `whitespace-nowrap`); `ResultArea` renders it after `AnswerView` (D21); update `AnswerView`'s TSDoc (drop "Neither the confidence nor the usage is shown")
- [ ] 4.3 Changed scenario (D24): run "An answered question shows the answer, its statements and its evidence" and see it fail on `not.toContain('0.71')` (the panel now shows the confidence: its RED evidence, recorded for the step 11 report); then delete only the two assertions `not.toContain('0.71')` and `not.toContain('Confianza')`; it passes
- [ ] 4.4 RED → GREEN: "A cache hit shows its usage panel" (the ✓ text node under `aria-hidden`; no «sin caché»)
- [ ] 4.5 RED → GREEN: "No saving is not shown as a saving" (two runs, `unmount()` between them; region text has «sin ahorro vs bruto» and no «ahorro -», «ahorro 0» nor «%»)

## 5. UNKNOWN states (TDD, design D7, D8, D18, D23, D30) — `ask-page` → "UNKNOWN states"

- [ ] 5.1 RED: "An UNKNOWN without anchors explains that there is no evidence" (type «¿Por qué existe legacy_ref?» + Enter; `h2` «Sin respuesta verificada»; the `no-anchor` sentence and «Motivo: no-anchor» after it; ○ under `aria-hidden`; no «Respuesta», «Evidencia», `ol`, region «Uso», `alert`; no button after the «Prueba:» group; focus on the field). See it fail (the provisional status is shown instead)
- [ ] 5.2 GREEN: `useAsk.ts` keeps `message` in the `unknown` state (D18); `notice-display.ts` → `reasonSentence(reason: string)` with the spec table and the general sentence (D23); `packages/web/src/components/UnknownState.tsx` (props interface, TSDoc, muted pair of D30); `ResultArea` renders it for every reason except `llm-required`
- [ ] 5.3 RED → GREEN: "Every other reason without evidence has its own sentence" (five runs including `a-future-reason`, cast at the `fetch` boundary; `unmount()` between runs)
- [ ] 5.4 RED → GREEN: "An UNKNOWN that needs a language model shows the configuration notice" (`h2`; paragraph `textContent` and its `code` child «LLM_*»; the suggestions line; «Mensaje de la API: …» as text; no «Sin respuesta verificada», «Motivo:», «Respuesta», region «Uso», `alert`; focus on the field). Create `packages/web/src/components/LlmRequiredNotice.tsx` (props `{ message?: string; hasSuggestions: boolean }`, accent pair of D30); `ResultArea` passes `suggestions.length > 0`
- [ ] 5.5 RED → GREEN: "The configuration notice of a project without suggested questions" (`/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f`; no suggestions line; no «Mensaje de la API:»)
- [ ] 5.6 RED → GREEN: "Texts of the API in a state are shown as text" (the `message` «<img src=x onerror=alert(1)>»; the paragraph's text «Mensaje de la API: <img src=x onerror=alert(1)>»; `main.querySelectorAll('img')` empty). Observe it fail once by rendering the message through `dangerouslySetInnerHTML` locally (not committed) and record it in the step 11 report

## 6. Error, rate-limit and budget notices (TDD, design D9, D10, D17, D18, D24) — `ask-page` → "Error, rate-limit and budget notices"

- [ ] 6.1 RED: "An exhausted budget says the cached questions still answer" (two runs; the alert's `p` texts in order, exactly; no button; no «Respuesta»; the `status` element empty; focus on the pressed button). See it fail
- [ ] 6.2 GREEN: `notice-display.ts` declares and exports `AskFailure` (`{ kind: 'api'; code: string; details: Record<string, unknown> } | { kind: 'unavailable' }`, D18, D32) and `useAsk.ts` imports it from there (no component imports from `pages/`); `notice-display.ts` → `alertLinesOf(failure: AskFailure): string[]` (the generic line, the case lines of the spec table, the code line; D17); `packages/web/src/components/AskErrorNotice.tsx` (props `{ failure: AskFailure }`, `role="alert"`, one `p` per line, ⚠ under `aria-hidden`, warning pair); `ResultArea` renders it for `failed`
- [ ] 6.3 RED → GREEN: "A rate limit says how long to wait" (two runs; no text «caché»)
- [ ] 6.4 RED → GREEN: "An API error names its code" (five runs with their statuses; the fifth, code «<i>X</i>», shows «Código: <i>X</i>.» as text and `main.querySelectorAll('i')` is empty)
- [ ] 6.5 RED → GREEN: "An unavailable API says so" (`TypeError` and empty `500`; exactly two `p`; no «Código:»)
- [ ] 6.6 Remove the provisional component (D24): delete `packages/web/src/components/AskFallbackNotice.tsx` and its import (its tests left in 3.1); `npm run lint` and `npm run lint:architecture` clean (no `no-orphans` warning)

## 7. Screen reader announcements (TDD, design D11, D22) — `ask-page` → "Screen reader announcements of Screen 2"

- [ ] 7.1 RED → GREEN: "The status region announces every outcome" (one `fetch` double answering the four bodies in turn; keep a reference to the status element on open and assert `toBe` the same element after each step; the six texts of the scenario, waiting for each visible state before reading the region; «hola» sent with `user.clear` + `user.type` + `{Enter}`)

## 8. Question box re-announcement (TDD, design D12, D29) — `ask-page` → "Question box"

- [ ] 8.1 RED: "Sending the same invalid question again announces the message again" (type «hola» + Enter; keep the alert element; Enter again; one `alert`, `not.toBe` the kept element, same text; the field's `aria-describedby` resolves to the new element; focus on the field; no request). See it fail (same node)
- [ ] 8.2 GREEN: `AskPage` counts invalid sends and passes the count to `QueryBox`; `QueryBox` uses it as the `key` of the alert `p` (props interface and TSDoc updated, D29). Every existing "Question box" test passes unchanged

## 9. Accessibility (TDD, design D13, D24, D31) — `ask-page` → "Accessibility of Screen 2"

- [ ] 9.1 RED → GREEN: in `AskPage.test.tsx`, "The result states add no tab stop" (five runs; focus on the pressed button; `main.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')` filtered to those after the «Prueba:» group equals the evidence buttons in the first run and is empty in the others)
- [ ] 9.2 RED (changed scenario, D24): once 5.2 replaces the provisional status, run `npm run test:a11y` and record its failure on the `UNKNOWN` step of "Screen 2 has no axe violations in any of its states" (it waits for the provisional text) as the RED of this changed scenario; do not commit while that file is red. Then, in `tests/a11y/ask-page.a11y.test.tsx`, change only the pending step's wait (from `findByRole('status')` to the visible text), the `UNKNOWN` step's wait (from the provisional text to the heading «Sin respuesta verificada»), the answered step's wait (also the region «Uso»), and add the five new states (cache hit, `llm-required`, `RATE_LIMITED`, `LLM_UNAVAILABLE`, `TypeError`) to the scans and to the expected object. GREEN
- [ ] 9.3 Negative control: remove locally the `aria-labelledby` of the usage `section` or give a muted badge a non-theme light colour, run `npm run test:a11y`, see axe fail (`region`/`color-contrast` or the named-region check of 4.2), revert (not committed); record it in the step 12 report
- [ ] 9.4 `npm run test:a11y` runs the three files (the gate unedited, Screen 1's, Screen 2's) and passes; `npm run typecheck` green

## 10. Review and Update Existing Tests (MANDATORY)

- [ ] 10.1 Identify the tests affected (`grep -rn "AskFallbackNotice\|Sin respuesta verificada (motivo\|queryByRole('status')\|Confianza" packages/web/src tests`, every type error of `npm run typecheck`); edit none except those of D24 (3.1, 3.2, 4.3, 9.2); confirm `tests/a11y/smoke.a11y.test.tsx`, `tests/a11y/project-picker.a11y.test.tsx`, `theme.test.ts`, `project-display.test.ts`, `answer-display.test.ts`, `api-client.test.ts`, `tests/unit/web/api-contract.spec.ts` and `tests/unit/seed/*` are untouched (`git diff --stat` empty for them) and pass. If any other existing test fails, the fix goes in the production code, never in the test
- [ ] 10.2 Confirm each `#### Scenario:` of `specs/ask-page/spec.md` maps 1:1 to a test with exactly the same name (grep each title in `packages/web/src/` and `tests/`), except the manual ones: "Statement colours follow the wireframe", "The focus is visible on every control" and "The usage panel and the states follow the wireframe" (validated in 12.2–12.5 and 15.2)
- [ ] 10.3 Refactor with the suite green: `packages/web/src/**` and the new test files, for naming and duplication only (no behaviour change, no test edits); `theme.test.ts` still passes (no `text-stripe*`, `#4dabf7`, `#74c0fc` outside `index.css`)

## 11. Run Tests and Verify Data State (MANDATORY)

- [ ] 11.1 Capture the pre-test baseline: the 0.4 totals, duration and bundle size
- [ ] 11.2 Run the targeted tests: `npx vitest run packages/web tests/a11y tests/unit/web` and `npm run test:a11y`
- [ ] 11.3 Run the required broader suite and gates: `npx vitest run` (duration against 0.4), `npx vitest run --exclude 'tests/integration/**'` (the `frontend.yml` step), `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run build -w packages/web` (bundle size against 0.4)
- [ ] 11.4 Mutation testing: `packages/web/**` is not in Stryker's `mutate` and its tests are excluded (DIS-58 D25); no dependency or Vitest/Stryker config changes (D16). Record that `npm run test:mutation` is not affected and is left to the CI `mutation` job (its `business` filter matches `tests/**` through the a11y file)
- [ ] 11.5 Run `/privacy-ethics-check` over the diff (no new request or data; the API's `message`, `code` and `details` rendered as text; no `dangerouslySetInnerHTML`; no `VITE_*` in `dist`; no new dependency, D16) and record the result
- [ ] 11.6 Verify the post-test state: no database touched by the unit and a11y tests; no `.stryker-tmp/`; `packages/web/dist` not staged (gitignored); restore and document if not
- [ ] 11.7 Create `openspec/changes/ask-page-states/reports/YYYY-MM-DD-11-test-and-state-verification.md` from the template of `docs/openspec-tasks-mandatory-steps.md` §6: baseline and after (totals, duration, bundle size), the changed and deleted tests of D24 with their RED evidence, the mutation note (11.4) and the privacy check (11.5); mark complete only after the tests pass and the report exists

## 12. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Preconditions: local Postgres up (`docker compose up -d`), `DATABASE_URL` exported, acme-shop and its golden answers loaded (`npm run cli -- projects`; `npm run db:seed` only if it is missing, recorded), no `LLM_*` exported (evaluation mode). Record `count(*)` of `query_log` and of `claim`, and the `hit_count` of acme-shop's cache entries: every `/ask` writes a `query_log` row and a cache hit bumps `hit_count`, so 12.6 restores them
- [ ] 12.2 Start the API and the web as two separate processes (`npm -w packages/api run dev`, `npm -w packages/web run dev`). With the browser-automation skill, the readme §1.3 walkthrough (D15) on `http://localhost:5173/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`: step 1 press Q1 → answer, evidence and the usage panel («caché ✓», «$0», the baseline line); step 2 expand `ev-1` with the keyboard; screenshot `reports/YYYY-MM-DD-12-answer-usage.png`; check the colours of D5, D6 and D30 against the wireframe
- [ ] 12.3 Step 3: send «¿Por qué existe legacy_ref?» (or, if it has anchors, another question that gives `no-anchor`, recorded) → «Sin respuesta verificada», screenshot `…-12-no-anchor.png`; send «¿Qué hace OrderService?» → the configuration notice with the API's message, screenshot `…-12-llm-required.png`; step 5: press Q1 again, literally → «caché ✓», «$0», screenshot `…-12-q1-repeated.png`; send «hola» twice and inspect the accessibility tree (a new alert node each time)
- [ ] 12.4 The alerts: intercept `POST …/ask` in the browser with the `429` `BUDGET_EXHAUSTED` and `RATE_LIMITED` bodies of the spec (screenshots `…-12-budget.png`, `…-12-rate-limit.png`); stop only the API and press Q3 → «La API de CODEMIND no responde.», screenshot `…-12-api-down.png`; open `/p/0b5c7f2e-1d3a-4e6b-8f90-1a2b3c4d5e6f` with the API up and send a question → `Código: PROJECT_NOT_FOUND.`
- [ ] 12.5 Keyboard and focus pass (D13, "The focus is visible on every control"): Tab and Shift+Tab through Screen 2 with an answer shown; every control shows its outline, the usage panel and the states take no focus; screenshot `…-12-focus.png`; repeat the answer view at 320 px wide, screenshot `…-12-narrow-320.png` (badges wrap as whole units, nothing clipped); the status region's text after each outcome read from the accessibility tree
- [ ] 12.6 Restore the state: stop both processes; delete the `query_log` rows created during 12.2–12.5 (by `created_at` after the 12.1 timestamp) and reset the `hit_count` of the touched cache entries to their 12.1 values; re-check that `query_log`, `claim` (expected untouched in evaluation mode) and `hit_count` equal 12.1; remove what `db:seed` added in 12.1 if it ran
- [ ] 12.7 Document every command, observation and screenshot in `openspec/changes/ask-page-states/reports/YYYY-MM-DD-12-manual-interface-testing.md` (screenshots next to it; OS user name masked in paths), including the a11y negative control of 9.3 and the screen-reader limit of design → Risks

## 13. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 13.1 There is no Playwright suite yet (DIS-75): the browser runs of 12.2–12.5 are the end-to-end evidence of the workflow "open Screen 2 → press a suggestion → read the answer and its usage → expand an evidence → ask without anchors → ask a free question → repeat Q1 → API down"; record "covered by steps 12.2–12.5; no Playwright suite in this change" in the step 12 report

## 14. Update Technical Documentation (MANDATORY)

- [ ] 14.1 `docs/project-context.md` → Screen 2 paragraph: the usage panel, the final states (`UnknownState`, `LlmRequiredNotice`, `AskErrorNotice`), the persistent status region, the two pure modules; remove "until DIS-66 adds the usage panel and the final states"
- [ ] 14.2 `docs/frontend-standards.md` → «How test:a11y is wired»: the states now scanned by `tests/a11y/ask-page.a11y.test.tsx`; `docs/DEMO.md`: the Entrega 2 note on Screen 2 (usage panel, cache hit «caché ✓», `llm-required` for free questions in evaluation mode)
- [ ] 14.3 Run `/update-docs` and confirm the docs gate passes. Add the relevant AI prompts of this change to `prompts.md` per `docs/project-context.md` → prompts.md rules, as a new section appended at the end of the file with its Índice entry in the same edit (DIS-101 edits the start of the file)
- [ ] 14.4 The `[enhanced]` description of DIS-66 in Linear holds D1–D16 and the decisions of the propose and the spec audit; add there, in Spanish and never inside `[original]`, every decision taken during the apply (design "taken while implementing")

## 15. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 15.1 Open the pull request against `feature/entrega-2-CRN` (title and body in Spanish via `/pr-describe`, the Why marked as the agent's decision, the wireframe deviations D2, D4, D5, D6 and the bundle size before and after); commit by explicit paths only (nothing under `.claude/`), English messages ending with the co-author line; push with `git -c credential.helper='!gh auth git-credential' push` on the DisTinta account; set DIS-66 to In Review with a Spanish comment linking the PR; confirm CI green (`quality`, `frontend` with `test:a11y`, `mutation`, `secrets`, `verify`)
- [ ] 15.2 Run `/show-spec-working`: screenshots of the running Screen 2 (answer with usage panel, cache hit, `no-anchor`, `llm-required`, `429`, API down, focus) next to `images/pantalla-2-consulta.svg` rendered as an image; may reuse step 12 evidence. Report `openspec/changes/ask-page-states/reports/YYYY-MM-DD-show-spec-working.md`, screenshots next to it
- [ ] 15.3 Run `/verify-against-spec`; report `openspec/changes/ask-page-states/reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 15.4 Run `/adversarial-review`; report `openspec/changes/ask-page-states/reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 15.5 Fix every finding in this change (behaviour changes via TDD) and give each one an A/B/C/D destination in `design.md` → Follow-ups; re-run the verification each fix invalidates and add an addendum to the affected report
- [ ] 15.6 Commit the fixes to the same pull request; re-run a check whose findings led to non-trivial fixes until it returns no Blocker or Major
- [ ] 15.7 `/opsx:archive`, and commit the archive to the same pull request (no test-file edits in that commit); merge only after the archive commit and with CI green (autonomous-run ADR)
