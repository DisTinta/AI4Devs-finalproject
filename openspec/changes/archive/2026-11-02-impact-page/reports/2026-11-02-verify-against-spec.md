# Verify against spec — impact-page (DIS-14)

*Agent's text (autonomous run, review step, 2026-11-02), `verify-against-spec` in its Inline mode.* Compared: the deltas
`specs/impact-page/spec.md`, `specs/ask-page/spec.md` and `specs/web-foundation/spec.md` against the branch
`feature/dis-14-impact-page` at `d9fc9d2` (PR #98). Test run for this report:
`npx vitest run packages/web tests/a11y tests/unit/web` → 18 files, 116 tests passed (the jsdom «HTMLCanvasElement.getContext» lines
are axe's known noise in jsdom, not failures).

## 1. Requirements implemented correctly

### impact-page

| Requirement | Code | Test |
|---|---|---|
| Screen 3 frame and navigation | `packages/web/src/router.tsx:24-27,44` (route and `key={projectId}`), `packages/web/src/pages/ImpactPage.tsx:105-125` (frame, bar, change box, result area, status, nav), `packages/web/src/components/PageFrame.tsx:28-36`, `packages/web/src/components/ProjectNav.tsx:20-31`, `packages/web/src/components/project-display.ts:100-109` | `packages/web/src/pages/ImpactPage.test.tsx:180`, `:217`, `:238` |
| Change box | `packages/web/src/components/ChangeBox.tsx:45-114`, `packages/web/src/pages/ImpactPage.tsx:86-103` | `ImpactPage.test.tsx:262`, `:304`, `:355` |
| Pending report | `packages/web/src/pages/ImpactPage.tsx:51-56,92-95`, `packages/web/src/pages/useImpact.ts:58-88` | `ImpactPage.test.tsx:377`, `:395`, `:416`, `:431` |
| Answered report | `packages/web/src/components/ImpactReport.tsx:72-87`, `packages/web/src/components/ImpactSection.tsx:32-64`, `packages/web/src/components/OriginTag.tsx:23-25` | `ImpactPage.test.tsx:450`, `:517`, `:548` |
| Risk | `packages/web/src/components/RiskBanner.tsx:21-35`, `packages/web/src/components/impact-display.ts:93-102` | `ImpactPage.test.tsx:576` |
| How a change and the entries of a report are written | `packages/web/src/components/impact-display.ts:25-85`, `packages/web/src/components/ImpactReport.tsx:14-61` | `packages/web/src/components/impact-display.test.ts:17`, `:28`; exact entry texts in `ImpactPage.test.tsx:471-504` |
| Unknown report | `packages/web/src/components/ImpactUnknownState.tsx:18-33` | `ImpactPage.test.tsx:602` |
| Error alerts | `packages/web/src/pages/ImpactPage.tsx:61-62` (reuses `AskErrorNotice`), `packages/web/src/pages/useImpact.ts:39-47` | `ImpactPage.test.tsx:629`, `:670` |
| Screen reader announcements of Screen 3 | `packages/web/src/pages/ImpactPage.tsx:30-42,121-123` | `ImpactPage.test.tsx:688` |
| Accessibility of Screen 3 | the components above; focus outlines in `ChangeBox.tsx:10-11,97` and `ProjectNav.tsx:25` | `tests/a11y/impact-page.a11y.test.tsx:104` (eight states), `ImpactPage.test.tsx:726`; real browser in `2026-11-02-11-manual-interface-testing.md` and `2026-11-02-show-spec-working.md` |

### ask-page

| Requirement | Code | Test |
|---|---|---|
| Link to the impact screen | `packages/web/src/pages/AskPage.tsx:139-142` | `packages/web/src/pages/AskPage.test.tsx:1289`, `:1314`; focus outline checked in the browser (step 11 report, Screen 2) |

### web-foundation

| Requirement | Code | Test |
|---|---|---|
| Paths of the web client and their screens (row `/p/{projectId}/impact`) | `packages/web/src/router.tsx:44` | `ImpactPage.test.tsx:180` (mounts `routes`); manual "The development server serves Screen 3" in both browser reports |
| Cancellation by the caller (every call) | `packages/web/src/services/api-client.ts:467-480` (shares `send`) | `packages/web/src/services/api-client.test.ts:492`; the existing cancellation tests unchanged |
| API types follow the API's schemas (impact body and response) | `packages/web/src/services/api-client.ts:128-209` | `tests/unit/web/api-contract.spec.ts:20` (two new comparisons and the second negative control) |
| Accessibility gate on the real routes (fourth path) | — | `tests/a11y/smoke.a11y.test.tsx:61` |
| Asking for the impact of a change through the API client | `packages/web/src/services/api-client.ts:450-480` | `api-client.test.ts:439`, `:457`, `:470`, `:492` |

## 2. Requirements missing or partial

None. Each requirement of the three deltas has code and a passing test, or a manual check in a real browser where the scenario
says so.

Assertions checked against the wording of their scenario (none is weaker in a way that matters):

- "Screen 3 of a project outside the sample constant is shown by its id and leads back" says «after it the path is
  `/p/0b5c7f2e-…`»; the test (`ImpactPage.test.tsx:227-234`) asserts the field «Pregunta» of Screen 2 and the level-1 heading
  equal to that id instead of reading the router location. In the route table only `/p/:projectId` renders «Pregunta» with
  that heading, so both checks together pin the path. No change.
- "An empty section, a stale document and a history entry without pull requests" uses «holds»; the test uses `toContain`
  (`ImpactPage.test.tsx:540-545`), which is what «holds» means.
- "Sending again while a report is pending sends no request": the requirement also covers a valid resend; the scenario sends
  an invalid one and then presses the button on it. A valid resend is stopped by two guards, the page's `pending` return
  (`ImpactPage.tsx:93-95`) and the hook's ref (`useImpact.ts:66-68`); the scenario's invalid resend would fail if the page's guard
  were removed (an alert would appear). Covered.

## 3. Unspecified behaviour

What the code does that the specs do not state, and the decision for each:

| Behaviour | Where | Decision |
|---|---|---|
| Presentational styling: symbols in bold `text-ink`, files and paths in a `font-mono` `<code>` span, the stale-document text inside a warning badge, the invalid-change alert in the warning pair, the navigation link underlined | `ImpactReport.tsx:14-21,43-52`, `ChangeBox.tsx:102-110`, `ProjectNav.tsx:25` | Keep. These are the colour pairs and spans of design D13 and D15; the specs require only that every text pair be a row of the theme table, which they are (contrast measured in both browser reports). No spec addition: presentation, not behaviour. |
| `impact()`'s third argument is optional (`= {}`) | `api-client.ts:469` | Keep. Same signature as `ask()`; the spec names `options.signal` as the caller's signal and every caller in the web passes it. |
| The «Navegación del proyecto» landmark is one shared component `ProjectNav` | `ProjectNav.tsx` | Keep. Implementation of design D3, recorded in Follow-ups P15. |
| The origin tag is chosen by section (`direct`, `indirect`, `tests` → «[grafo]», `history` → «[git]») and the `origin` field of each entry is not read | `ImpactReport.tsx:29-61` | Keep. It is what the requirement states, and the API types fix `origin` to `'graph'` / `'git'` per list, so the two cannot disagree while the contract test passes. |

Other checks:

- **Dependencies:** none added (`git diff origin/final-project-CRN...HEAD -- package.json packages/web/package.json package-lock.json`
  is empty).
- **Authorisation:** the specs require none; the web client has no authentication.
- **Response fields:** the page renders only the fields the spec lists; no field of the API is shown that the spec does not mention.
- **Weaker assertions:** see block 2; none found that would let a wrong implementation pass.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| Screen 3 opens on a sample project without any request | `ImpactPage.test.tsx:180` | green |
| Screen 3 of a project outside the sample constant is shown by its id and leads back | `ImpactPage.test.tsx:217` | green |
| Another project's Screen 3 starts empty | `ImpactPage.test.tsx:238` | green |
| A valid change is sent trimmed with the selected hops | `ImpactPage.test.tsx:262` | green |
| An invalid change is not sent | `ImpactPage.test.tsx:304` | green |
| Changing an invalid change clears the mark | `ImpactPage.test.tsx:355` | green |
| Sending again while a report is pending sends no request | `ImpactPage.test.tsx:377` | green |
| A pending report has no time limit of its own | `ImpactPage.test.tsx:395` | green |
| A new change replaces the report that was shown | `ImpactPage.test.tsx:416` | green |
| Leaving the page aborts the pending report | `ImpactPage.test.tsx:431` | green |
| The answered report shows its five sections, its origins and its risk | `ImpactPage.test.tsx:450` | green |
| An empty section, a stale document and a history entry without pull requests | `ImpactPage.test.tsx:517` | green |
| Texts of the API in the report are shown as text | `ImpactPage.test.tsx:548` | green |
| Every risk level is written in words | `ImpactPage.test.tsx:576` | green |
| Change length is counted in code points after trimming | `impact-display.test.ts:17` | green |
| Hops, resolution, document and history are written in Spanish | `impact-display.test.ts:28` | green |
| An unknown report says the change anchors nothing | `ImpactPage.test.tsx:602` | green |
| A rate limit, an API error and an unavailable API are alerted | `ImpactPage.test.tsx:629` | green |
| A failure removes the report that was shown | `ImpactPage.test.tsx:670` | green |
| The status region announces every outcome | `ImpactPage.test.tsx:688` | green |
| Screen 3 has no axe violations in any of its states | `tests/a11y/impact-page.a11y.test.tsx:104` | green |
| The tab order of Screen 3 skips the report | `ImpactPage.test.tsx:726` | green |
| The walkthrough step 4 runs in a real browser | manual: `2026-11-02-11-manual-interface-testing.md`, `2026-11-02-show-spec-working.md` | green (manual) |
| Screen 2 links to the impact screen of its project | `AskPage.test.tsx:1289` | green |
| Following the impact link aborts a pending question | `AskPage.test.tsx:1314` | green |
| The development server serves the three paths | manual: both browser reports | green (manual) |
| The development server serves Screen 3 | manual: both browser reports | green (manual) |
| An unknown path shows the not-found screen and leads back (unchanged) | `packages/web/src/router.test.tsx` | green |
| Aborting a pending question / health check, body read, already-aborted signal (unchanged) | `api-client.test.ts` (existing) | green |
| A drift between the client types and the API schemas fails the type check | `tests/unit/web/api-contract.spec.ts:20` | green (CI `quality` runs `npm run typecheck`) |
| The web does not import the API or the backend (unchanged) | `npm run lint:architecture` + one-off probe (step 10 report) | green |
| The three routes have no axe violations (unchanged) | `tests/a11y/smoke.a11y.test.tsx:41` | green |
| The impact route has no axe violations | `tests/a11y/smoke.a11y.test.tsx:61` | green |
| The negative control proves axe runs (unchanged) | `tests/a11y/smoke.a11y.test.tsx:30` | green |
| The gate runs in CI instead of warning (unchanged) | CI `frontend` job on PR #98 | green |
| An impact report is resolved as received | `api-client.test.ts:439` | green |
| An unknown impact is resolved as received | `api-client.test.ts:457` | green |
| Impact failures become API or unavailable-API errors | `api-client.test.ts:470` | green |
| Aborting a pending impact request cancels it, and it has no time limit | `api-client.test.ts:492` | green |

## Verdict

The implementation does what the three deltas say, no less. The unspecified behaviour is presentation from design D13/D15 and
two implementation details recorded in Follow-ups, each kept with its reason above. Nothing to fix from this check.
