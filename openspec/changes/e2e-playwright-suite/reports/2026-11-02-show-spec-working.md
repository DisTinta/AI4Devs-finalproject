# Show spec working — e2e-playwright-suite

- Date: 2026-11-02
- Change: e2e-playwright-suite (DIS-75), PR #99
- Step: 14.1b, 14.1c and 14.2 (agent's text, autonomous run, inline)

The interface of this change is the command `npm run test:e2e`, its configuration and the CI job `e2e`.
It was exercised for real: locally on the seeded Docker Postgres and in the CI run of the PR. The
negative and taken-port scenarios reuse the step 11 evidence (`./2026-11-02-11-manual-interface-testing.md`),
as task 14.2 allows.

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The Playwright configuration starts both servers in evaluation mode | `npx vitest run tests/unit/ci` | 4 files, 6 tests passed | yes | below |
| A taken port fails the run before any spec | step 11.2 (a) web on 5173, (b) API on 3000 | exit 1 before any spec, `webServer` error naming each URL | yes | step 11 report |
| The Vitest configuration excludes tests/e2e | `npx vitest run tests/unit/ci`; `npm run typecheck` | passed; typecheck green including `tests/e2e/tsconfig.json` | yes | below |
| Asking Q1 on acme-shop shows verified evidence and the usage panel | `npm run test:e2e` (Bash) | passed (1.8 s) | yes | below |
| Asking Q6 on acme-shop shows no verified answer | `npm run test:e2e` (Bash) | passed (1.1 s) | yes | below |
| Analysing a change to DiscountService reports high risk | `npm run test:e2e` (Bash) | passed (1.2 s) | yes | below |
| Every golden evidence expanded has no violation and no overflow | `npm run test:e2e` (Bash) | passed (9.0 s) | yes | below |
| A mocked answer with a long path does not overflow | `npm run test:e2e` (Bash) | passed (2.8 s) | yes | below |
| The CI workflow runs the end-to-end suite in a job of its own | `npx vitest run tests/unit/ci` | passed | yes | below |
| A failing spec fails the suite and leaves its evidence | step 11.3 negative copy; here also the mutant run below | exit 1, screenshot, `trace.zip`, `playwright-report/index.html` | yes | step 11 report, `./2026-11-02-11-negative-failure.png` |
| The suite passes locally | `npm run test:e2e` from Bash (today) and, in step 11.1, from `pwsh -NoProfile` and `powershell.exe -NoProfile` | 5 passed, exit 0 in every shell | yes | below, step 11 report |
| The e2e job is green on the pull request | CI run 41501938704 on commit d052631 | `e2e` success, 5 passed in 8.7 s; all seven checks green | yes | below |

## Evidence

Local run, Bash, Node v24.11.1, Playwright 1.64.1 (Chromium build 1248), ports 3000 and 5173 free
(`node scripts/dev-processes.mjs list` printed nothing):

```
> codemind@0.0.1 test:e2e
> playwright test

Running 5 tests using 1 worker

  ok 1 [chromium] › tests\e2e\ask-flow.spec.ts:8:5 › Asking Q1 on acme-shop shows verified evidence and the usage panel (1.8s)
  ok 2 [chromium] › tests\e2e\ask-page.a11y.spec.ts:57:5 › Every golden evidence expanded has no violation and no overflow (9.0s)
  ok 3 [chromium] › tests\e2e\ask-page.a11y.spec.ts:83:5 › A mocked answer with a long path does not overflow (2.8s)
  ok 4 [chromium] › tests\e2e\impact-flow.spec.ts:7:5 › Analysing a change to DiscountService reports high risk (1.2s)
  ok 5 [chromium] › tests\e2e\unknown.spec.ts:9:5 › Asking Q6 on acme-shop shows no verified answer (1.1s)

  5 passed (23.6s)
EXIT=0
```

Configuration and CI-job tests: `npx vitest run tests/unit/ci` → `Test Files 4 passed (4)`, `Tests 6 passed (6)`.
`npm run typecheck` → exit 0 (its last program is `tsc -p tests/e2e/tsconfig.json`).

CI (scenario "The e2e job is green on the pull request", tasks 14.1b and 14.1c): run
<https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41501938704>, commit d052631, every job
success: `scope`, `secrets`, `e2e` (18:35:56 → 18:37:04 UTC, 1 min 8 s;
<https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41501938704/job/125471877557>), `quality`,
`verify`, `mutation` (51 min 45 s, full pass) and `Frontend`. Log of the step `End-to-end suite`:

```
Running 5 tests using 1 worker
  ✓  1 [chromium] › tests/e2e/ask-flow.spec.ts:8:5 › Asking Q1 on acme-shop shows verified evidence and the usage panel (596ms)
  ✓  2 [chromium] › tests/e2e/ask-page.a11y.spec.ts:57:5 › Every golden evidence expanded has no violation and no overflow (3.9s)
  ✓  3 [chromium] › tests/e2e/ask-page.a11y.spec.ts:83:5 › A mocked answer with a long path does not overflow (987ms)
  ✓  4 [chromium] › tests/e2e/impact-flow.spec.ts:7:5 › Analysing a change to DiscountService reports high risk (477ms)
  ✓  5 [chromium] › tests/e2e/unknown.spec.ts:9:5 › Asking Q6 on acme-shop shows no verified answer (367ms)
  5 passed (8.7s)
```

The next run (41510292241, commit 7cbdb75, design-only) skipped `quality`, `mutation`, `verify` and `e2e`
by the `scope` rule, which logged `Previous e2e: success` — the new `e2e` entry of the `scope` loop at
work.

## Addendum — review fix R1 (ask-flow excerpt)

After the adversarial review (finding R1), `tests/e2e/ask-flow.spec.ts` checks the excerpt the expanded
button names with `aria-controls`, not the first `pre code` of the page. Re-run:
`npx playwright test tests/e2e/ask-flow.spec.ts` → 1 passed (9.6 s). Mutant: a temporary copy
`tests/e2e/zz-mutant.spec.ts` that points the expanded button's `aria-controls` at `missing` failed with
`expect(locator).toBeVisible() failed … Locator: locator('[id="missing"]') … element(s) not found` (the
previous assertion would have passed); the copy was deleted and `git status` shows no trace of it.

## State

- Before: `query_log` count 0 at 2026-11-02 19:36:18 UTC; no dev process running.
- After: 11 rows created by the local runs.
- Restored: yes — `delete from query_log where created_at > '2026-11-02 19:36:18+00'` (11 rows), count 0;
  `node scripts/dev-processes.mjs stop` → no process left. `playwright-report/` and `test-results/` are
  gitignored and not staged.

## Not demonstrated

Nothing. The PowerShell runs and the taken-port runs were not repeated today; their evidence is the
step 11 report of the same day, on the same code except the R1 assertion.

**Handoff:** the change is demonstrably working, locally and in CI. No screenshot was written at the
repository root.
