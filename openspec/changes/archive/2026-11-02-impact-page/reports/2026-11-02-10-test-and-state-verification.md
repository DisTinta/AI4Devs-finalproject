# Step 10 — test and state verification (impact-page, DIS-14)

*Agent's text (autonomous run, apply step, 2026-11-02).*

## Baseline and after

| | Before (task 0.4) | After (tasks 10.2, 10.3) |
|---|---|---|
| `npx vitest run --project dom --project seed-build --project node` | 174 files passed, 29 skipped; 1820 tests passed, 281 skipped; 77.86 s | 177 files passed, 29 skipped; 1849 tests passed, 281 skipped; 78.28 s |
| `packages/web/dist/assets/*.js` | 255 869 bytes (83.09 kB gzip) | 264 118 bytes (84.71 kB gzip), +8 249 bytes |
| `packages/web/dist/assets/*.css` | 12 787 bytes (3.53 kB gzip) | 12 938 bytes (3.56 kB gzip), +151 bytes |

The 29 new tests: 4 in `api-client.test.ts`, 2 in `impact-display.test.ts`, 19 in `ImpactPage.test.tsx`, 2 appended to
`AskPage.test.tsx`, 1 in `smoke.a11y.test.tsx` and 1 in `impact-page.a11y.test.tsx`. `npm run test:a11y` runs the four files (7
tests) and passes. Gates: `npm run lint` clean, `npm run typecheck` clean, `npm run lint:architecture` passes (its only warning is
the orphan `packages/web/dist` bundle of the build), `npm run docs:coverage` clean, `npm run build -w packages/web` builds.

Web-isolation probe (not committed): a file `packages/web/src/isolation-probe.ts` importing `packages/api/src/schemas/common.ts`
made `lint:architecture` fail with `web-no-backend`; the file was deleted.

## Changed existing tests and their RED evidence

Only the files named in tasks 1.1, 1.6, 3.5, 3.7 and 8.3 changed, and `git diff --stat` shows `router.test.tsx`, `theme.test.ts`,
`project-display.test.ts`, `answer-display.test.ts`, `notice-display.test.ts`, `ask-page.a11y.test.tsx` and
`project-picker.a11y.test.tsx` untouched.

- `api-client.test.ts`: tests appended, plus `impact` added to the import line. RED of 1.1: `TypeError: impact is not a function`.
- `api-contract.spec.ts` (1.6): two assertions and a second negative control added. RED: `risk.level` declared without `'LOW'` made
  `npm run typecheck` fail with TS2344 on the new `ClientImpactResponse` assertion; reverted.
- `AskPage.test.tsx` (3.5, 3.7): two tests appended. Both failed before the link existed (no link «Analizar el impacto de un cambio»);
  the 3.7 test did not pass at once. All existing tests of the file pass unchanged (including the tab-order and no-tab-stop ones).
- `smoke.a11y.test.tsx` (8.3): one `it` appended and the header comment updated. RED: with the route removed locally the wait for the
  field «Cambio» failed on the not-found screen; restored.
- `impact-page.a11y.test.tsx` (8.2) RED: the `<select>` rendered without its `<label>` made the scan fail with `select-name` in all
  eight states; restored.
- 2.1 RED: module missing. 3.2 and 3.4 RED: the path showed the not-found screen.

## May-pass-at-once observations (local mutations, none committed)

Hook, components and page were written before the tests of groups 4 to 8 (the layer order was kept, but not test-first for those
groups), so each test that guards a specific mechanism was checked by a local mutation and seen failing, then reverted:

| Task | Mutation | Failing test |
|---|---|---|
| 1.4 | `impact` swallows errors | "Impact failures become API or unavailable-API errors" |
| 1.5 | 30 s limit in `impact` | "Aborting a pending impact request cancels it, and it has no time limit" |
| 3.4b | `key={projectId}` removed from the route | "Another project's Screen 3 starts empty" |
| 4.3 | `key={invalidSends}` removed | "An invalid change is not sent" |
| 5.2 | unmount abort removed | "Leaving the page aborts the pending report" |
| 5.3 | 30 s abort timer in `useImpact` | "A pending report has no time limit of its own" |
| 6.5 | rationale through `dangerouslySetInnerHTML` | "Texts of the API in the report are shown as text" |
| 7.4 | `key` on the status paragraph | "The status region announces every outcome" |
| 8.1 | `tabIndex={0}` on a report section | "The tab order of Screen 3 skips the report" |

Also, `impact()` was appended to `api-client.ts` with a shell redirection by mistake (the contract asks for the edit tools); the
content is the intended one and every later change used the edit tools.

## Mutation testing (10.4)

`packages/web/**` is not in Stryker's `mutate` (DIS-58 D25; DIS-77 owns the gate). `npx stryker run` is not affected by this change
and is left to the CI `mutation` job.

## Privacy and ethics check (10.5)

Run over the diff: only the typed change and `maxHops` are sent, in the request body; no `localStorage`, `sessionStorage` or
`console` call in `packages/web/src`; every API text is a React text child and there is no `dangerouslySetInnerHTML`; no `VITE_*` in
`packages/web/dist/assets/*.js`; no dependency added (`package.json` and `package-lock.json` unchanged). Result: no finding.

## Post-test state (10.6)

No database touched by the unit and a11y tests; no `.stryker-tmp/`; `packages/web/dist` is gitignored and not staged;
`node scripts/dev-processes.mjs stop` run, and `list` shows no process left.
