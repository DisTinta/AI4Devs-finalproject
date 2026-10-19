# Verify Against Spec — ask-page-states (DIS-66)

- Date: 2026-10-19
- Task: 15.3 (pre-merge review, autonomous run of Entrega 2, ADR `20261016-autonomous-workflow-run-entrega-2`)
- Run by the agent in its own context, after `/show-spec-working`, over the branch at `49f96f4`. Read:
  `specs/ask-page/spec.md` (delta), `design.md`, `tasks.md`, the step 11 and step 12 reports, and
  `git diff origin/feature/entrega-2-CRN...HEAD -- packages tests`. Every claim below cites the file it
  was checked in; tests were run (`npx vitest run packages/web tests/a11y tests/unit/web`: 15 files, 87
  tests, green).

## 1. Requirements implemented correctly

| Requirement | Code | Test |
|---|---|---|
| Screen 2 frame and project bar (status region from the first paint) | `packages/web/src/pages/AskPage.tsx:152-170` (one `p role="status"` after `ResultArea`) | `AskPage.test.tsx:158-218` |
| Question box (a new alert element per invalid send) | `pages/AskPage.tsx:121,134-141`, `components/QueryBox.tsx:67-76` (`key={invalidSends}`) | `AskPage.test.tsx:220-355` |
| Pending question (visible text hidden, status holds it) | `pages/AskPage.tsx:77-84`, `pages/useAsk.ts` | `AskPage.test.tsx:379-490` |
| Answer with typed and verified statements (+ «Respuesta recibida.») | `pages/AskPage.tsx:61-62,85-91`, `components/AnswerView.tsx` | `AskPage.test.tsx:492-599` |
| Accessibility of Screen 2 (ten axe states, tab order, no new tab stop) | no new control in `UsagePanel`, `UnknownState`, `LlmRequiredNotice`, `AskErrorNotice` | `tests/a11y/ask-page.a11y.test.tsx:103-210`, `AskPage.test.tsx:697-774` |
| Usage panel | `components/UsagePanel.tsx` | `AskPage.test.tsx:882-975` |
| How usage figures and notice details are written | `components/usage-display.ts`, `components/notice-display.ts:27-61` | `usage-display.test.ts`, `notice-display.test.ts` |
| UNKNOWN states | `components/UnknownState.tsx`, `components/LlmRequiredNotice.tsx`, `notice-display.ts:63-87`, `pages/AskPage.tsx:93-99` | `AskPage.test.tsx:1026-1147` |
| Error, rate-limit and budget notices | `components/AskErrorNotice.tsx`, `notice-display.ts:89-140`, `pages/useAsk.ts:36-44` | `AskPage.test.tsx:1182-1285` |
| Screen reader announcements of Screen 2 | `pages/AskPage.tsx:57-69` (`announcementOf`), `:165-167` | `AskPage.test.tsx:776-858` |
| REMOVED: Provisional notice | `AskFallbackNotice.tsx` deleted; no importer left (`grep -rn AskFallbackNotice packages` empty) | its three tests deleted (D24, step 11 report) |

## 2. Requirements missing or partial

None. Every requirement of the delta has code and every automatable scenario a test of the same name
(table below). The three manual scenarios ("Statement colours follow the wireframe", "The focus is
visible on every control", "The usage panel and the states follow the wireframe") were validated in the
browser in step 12 and again in `/show-spec-working` (`2026-10-19-show-spec-working.md`).

## 3. Unspecified behaviour

| Id | Severity | Where | Behaviour the spec did not state | Decision |
|---|---|---|---|---|
| V1 | Minor | `components/usage-display.ts:95-98` | The savings badge decides on the value **rounded** to one decimal (design D33): 0.04 reads «sin ahorro vs bruto». Both savings tables of the spec said «greater than 0», which read literally gives «ahorro 0 % vs bruto» for 0.04 — and «ahorro 0» is what "No saving is not shown as a saving" forbids. No test pinned a value in (−0.05, 0.05) other than 0 | Wanted → **added to the spec** (`/opsx:update`, design D37): the two tables say «rounded to one decimal», the scenario "Savings are written only when there are savings" gains `0.04` and `-0.04`. Destination **A** |
| V2 | Minor | `components/AskErrorNotice.tsx:25` | Every failure alert draws a decorative ⚠ hidden from assistive technology (task 6.2); the requirement did not mention it, while the ○ of the state without evidence is in the spec, and no test pinned that the ⚠ is hidden (a visible ⚠ would be read at the start of every alert) | Wanted → **added to the spec** (D37): the requirement names the hidden ⚠ and "An exhausted budget says the cached questions still answer" asserts it. Destination **A** |

Checked and not unspecified:

- The extra Node test "A reset time is read only from a whole ISO date-time that exists on the calendar"
  (`notice-display.test.ts:37`) pins the spec's own words «that denotes a real instant» (design D34); it
  adds no behaviour.
- The `border-t` rule above the usage band and the `text-xs` of «Motivo:» and «Mensaje de la API:» are
  presentation that the wireframe and design D6/D30 describe.
- A malformed `200` body (a non-string `reason` or `message`) is rendered through template strings as
  text (`UnknownState.tsx:26`, `LlmRequiredNotice.tsx:31`); an answered body without `usage` throws
  during render and reaches the route's `errorElement` (`router.tsx:28`). Both are outside the API's
  contract (`packages/api/src/schemas/ask.ts:65-113`) and `ask()` does not validate a `200` body by
  DIS-65's decision; no new behaviour.

Specific checks:

- **Dependencies:** no import outside the manifest; `package.json` and `package-lock.json` are not in the
  diff (design D16).
- **Authorisation:** the spec requires none (a same-origin client).
- **Response fields:** the page reads `confidence`, `usage.{inputTokens, outputTokens, baselineTokens,
  savingsPct, costUsd, latencyMs, cacheHit}`, `reason`, `message`, `error.{code, details}` — all named by
  the spec; `usage.generation`/`verification` are not shown.
- **Weaker assertions:** the RTL usage scenarios find «$0» and «0 tokens» with `indexOf`, so «$0.000»
  would also match; the exact forms are pinned by the Node scenarios "Cost is written in dollars" and
  "Tokens are counted with grouped digits" (accepted, design Follow-ups AR2). No other scenario's test
  asserts less than its `THEN`.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Screen 2 opens on a sample project without any request | `AskPage.test.tsx` | green |
| A project outside the sample constant is shown by its id | `AskPage.test.tsx` | green |
| A written question is sent trimmed | `AskPage.test.tsx` | green |
| An invalid question is not sent | `AskPage.test.tsx` | green |
| Changing an invalid question clears the mark | `AskPage.test.tsx` | green |
| Sending the same invalid question again announces the message again | `AskPage.test.tsx` | green |
| Sending again while a question is pending sends no request | `AskPage.test.tsx` | green |
| An invalid send while a question is pending changes nothing | `AskPage.test.tsx` | green |
| A new question replaces what was shown | `AskPage.test.tsx` | green |
| A pending question has no time limit of its own | `AskPage.test.tsx` | green |
| Leaving the page aborts the pending question | `AskPage.test.tsx` | green |
| An answered question shows the answer, its statements and its evidence | `AskPage.test.tsx` | green |
| Every combination of type and verification is labelled | `AskPage.test.tsx` | green |
| Markup in an answer is shown as text | `AskPage.test.tsx` | green |
| Statement colours follow the wireframe | manual (step 12, `/show-spec-working`) | green (manual) |
| Screen 2 has no axe violations in any of its states | `tests/a11y/ask-page.a11y.test.tsx` | green |
| The tab order follows question, suggestions and evidence | `AskPage.test.tsx` | green |
| The result states add no tab stop | `AskPage.test.tsx` | green |
| The focus is visible on every control | manual (step 12, `/show-spec-working`) | green (manual) |
| An answer from the model shows its usage panel | `AskPage.test.tsx` | green |
| A cache hit shows its usage panel | `AskPage.test.tsx` | green |
| No saving is not shown as a saving | `AskPage.test.tsx` | green |
| The usage panel and the states follow the wireframe | manual (step 12, `/show-spec-working`) | green (manual) |
| Confidence is written with two decimals | `usage-display.test.ts` | green |
| Tokens are counted with grouped digits | `usage-display.test.ts` | green |
| Cost is written in dollars | `usage-display.test.ts` | green |
| Latency is written in milliseconds or seconds | `usage-display.test.ts` | green |
| Savings are written only when there are savings | `usage-display.test.ts` | green |
| The budget reset time is written in UTC | `notice-display.test.ts` | green |
| The wait of a rate limit is read only when it is a whole number of seconds | `notice-display.test.ts` | green |
| An UNKNOWN without anchors explains that there is no evidence | `AskPage.test.tsx` | green |
| Every other reason without evidence has its own sentence | `AskPage.test.tsx` | green |
| An UNKNOWN that needs a language model shows the configuration notice | `AskPage.test.tsx` | green |
| Texts of the API in a state are shown as text | `AskPage.test.tsx` | green |
| The configuration notice of a project without suggested questions | `AskPage.test.tsx` | green |
| An exhausted budget says the cached questions still answer | `AskPage.test.tsx` | green |
| A rate limit says how long to wait | `AskPage.test.tsx` | green |
| An API error names its code | `AskPage.test.tsx` | green |
| An unavailable API says so | `AskPage.test.tsx` | green |
| The status region announces every outcome | `AskPage.test.tsx` | green |
| The pending text is not read twice | `AskPage.test.tsx` | green |

## Addendum — after the fixes (2026-10-19)

- V1: `specs/ask-page/spec.md` revised by `/opsx:update` (design D37, addendum in
  `2026-10-19-spec-audit.md`); `usage-display.test.ts` → "Savings are written only when there are
  savings" now feeds `0.04` and `-0.04`. RED observed with the badge deciding on the raw value locally
  (`+ "text": "ahorro 0 % vs bruto"`), reverted; green with the committed code.
- V2: same spec revision; `AskPage.test.tsx` → "An exhausted budget says the cached questions still
  answer" asserts that every ⚠ text node of the alert is inside an `aria-hidden="true"` element. RED
  observed with the icon's `aria-hidden` removed locally (`warningIconHidden` `[false]`), reverted; green.
- Re-check: every `#### Scenario:` still maps 1:1 to a test of the same name (grep of the 41 titles);
  `npx vitest run packages/web tests/a11y tests/unit/web` green; no new unspecified behaviour (the D38
  layout change of the adversarial review keeps the region's text, order and hidden separators). No
  Blocker or Major remains.
- Gates after the fixes: `npx vitest run --exclude 'tests/integration/**'` 121 files, 1 324 tests green;
  `npm run test:a11y` 3 files green; `npm run lint`, `npm run typecheck`, `npm run docs:coverage` clean.
  The full `npx vitest run` with the local `.env` loaded ran the integration suites against the seeded
  development database: 151 files green, and two tests that need an empty database ("An empty database
  lists no projects", "A failed golden save leaves the database unchanged") fail there because acme-shop is
  loaded. Neither the CLI, the seed nor `tests/integration` is in this change's diff; CI runs them on a
  fresh database service. The development database indicators were unchanged afterwards (`query_log` 3,
  `claim` 0, `hit_count` 0 / 0 / 0).
