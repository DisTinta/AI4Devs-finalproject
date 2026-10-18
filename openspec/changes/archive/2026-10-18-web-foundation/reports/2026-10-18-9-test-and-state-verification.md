# Test and State Verification Report

- Date: 2026-10-18
- Change: web-foundation (DIS-58)
- Step: 9 — Run Tests and Verify Data State

Run by the agent in the autonomous run of Entrega 2 (ADR `20261016-autonomous-workflow-run-entrega-2`),
on Windows 11 with Node v24.11.1, branch `feature/DIS-58-web-scaffolding`. `DATABASE_URL` was not
exported, so the database integration specs were skipped locally in every full run (before and after);
CI runs them in `quality`.

## Commands executed

- `npx vitest run` (baseline, task 0.4; after the setup, task 1.5; final, task 9.3)
- `npm run build -w packages/web` (baseline and final)
- `npx vitest run packages/web tests/a11y tests/unit/web`
- `npm run test:a11y`
- `CI=true npx vitest run --exclude 'tests/integration/**'` (the `Frontend` job's step)
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npm run test:mutation:full`
- Privacy check of the diff and of `packages/web/dist` (task 9.5, below)

## Test results

| Run | Test files | Tests | Duration |
|---|---|---|---|
| Baseline `npx vitest run` (0.4) | 117 passed, 20 skipped (137) | 1327 passed, 221 skipped (1600) | 67.09 s |
| After the jsdom setup file and config (1.5) | 117 passed, 20 skipped (137) | 1327 passed, 221 skipped (1600) | 68.58 s |
| Final `npx vitest run` (9.3) | 123 passed, 20 skipped (143) | 1353 passed, 221 skipped (1626) | 66.08 s |
| Targeted `npx vitest run packages/web tests/a11y tests/unit/web` | 6 passed (6) | 26 passed (26) | 4.86 s |
| `npm run test:a11y` | 1 passed (1) | 2 passed (2) | 5.12 s |
| `CI=true npx vitest run --exclude 'tests/integration/**'` | 111 passed (111) | 1262 passed (1262) | 22.23 s |

- 1.5: the setup file and `environmentMatchGlobs` changed no Node test: same files, same tests, same
  skips as the baseline. The six new files add 26 tests (1327 + 26 = 1353); the duration did not grow
  (66.08 s against 67.09 s; jsdom adds about 3 s of `environment` time, spread over the workers).
- `npm run lint`: exit 0. `npm run typecheck`: exit 0 (now also `tsc -p tests/a11y/tsconfig.json`).
- `npm run lint:architecture`: 0 errors, 4 warnings (`no-orphans` on `packages/web/src/data/sample-projects.ts`,
  the built `packages/web/dist/assets/*.js`, and the TypeScript analyzer's `src`/`dist`); the same
  warnings as before, none from this change's sources.
- `npm run docs:coverage`: exit 0, no warning. It does not cover `packages/web` (`typedoc.json` entry
  points); every export of the web carries TSDoc and is checked in the pre-merge reviews.

### Bundle size (frontend-standards §5)

| Build | `index.html` | JS | CSS |
|---|---|---|---|
| Baseline (placeholder `App.tsx`, inline styles) | 0.32 kB | 142.78 kB (gzip 45.86 kB) | none |
| Final (router, Tailwind theme) | 0.39 kB | 236.69 kB (gzip 77.34 kB) | 7.50 kB (gzip 2.35 kB) |

`react-router` adds about 94 kB (31.5 kB gzip) of JavaScript; Tailwind emits 7.5 kB of CSS (only the
utilities and tokens used). No image and no web font (system font stack), so the LCP element stays the
header text. The emitted CSS contains `--color-accent:#1971c2` (task 2.6).

### RED evidence

- **2.5 "Wireframe accent colours are never text":** a probe file `packages/web/src/probe-accent.ts`
  with `'text-stripe'` (created locally, moved out, never committed) made the test fail with
  `expected [ 'probe-accent.ts: text-stripe' ] to deeply equal []`; without it, green.
- **4.8 "A drift between the client types and the API schemas fails the type check":** the contract
  test passed at once. Renaming `evidenceIds` to `evidenceRefs` in the client's `AskStatement`
  (locally, restored) made `tsc -p tests/tsconfig.json` fail with
  `tests/unit/web/api-contract.spec.ts(24,53): error TS2344: Type '{ answer: string; statements: … }' does not satisfy the constraint …`;
  restored, green. The `// @ts-expect-error` negative control is inside the committed test.
- **4.9 "The web does not import the API or the backend":** a probe `packages/web/src/probe-backend.ts`
  importing `../../api/src/schemas/common` (never committed) made `npm run lint:architecture` fail with
  `error web-no-backend: packages/web/src/probe-backend.ts → packages/api/src/schemas/common.ts`
  (`1 errors, 4 warnings`); without it, `0 errors, 4 warnings`, exit 0.
- **6.2 "The three routes have no axe violations":** replacing the `main` landmark of the placeholder
  with a `div` (locally, restored) made the gate fail on `/` and `/p/a794456d-…` with
  `region: All page content should be contained by landmarks`; restored, green.
- **D26 (`Request` without signal):** commenting out `globalThis.Request = RequestWithoutSignal` (locally,
  restored) made "An unknown path shows the not-found screen and leads back" fail with
  `TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal.`
  (task 5.4).

### Characterisation tests (passed at once)

- "An UNKNOWN is resolved as received": passed as soon as `ask` returned the `2xx` body unchanged
  ("An answered question is resolved as received" was its RED).
- "A question has no time limit of its own": `ask` never had a timer; it guards against one being
  added.
- "Rendered output does not leak between tests" (5.5): the D18 cleanup was already in the setup file
  (task 1.2). The guard was proved once by commenting `cleanup()` out locally (restored): four tests of
  `router.test.tsx` failed, the leak test among them; restored, green.

### Existing tests edited (7.2)

None. The kit scaffold `tests/a11y/smoke.example.tsx` was not a test (Vitest never discovered it); it
was renamed to `smoke.a11y.test.tsx` and replaced, as the spec requires. No other existing test was
touched.

### Mutation testing (9.4)

`packages/web` is not in Stryker's `mutate`, and `vitest.stryker.config.ts` now excludes
`packages/web/**`, `tests/a11y/**` and `tests/unit/web/**` (D25). Because the change touched the
dependencies and the Vitest/Stryker config, `npm run test:mutation:full` ran (1 333 s, 15 runners):
5 837 mutants, **final score 96.01** (≥ 80 break threshold; 5 549 killed, 55 timeout, 172 survived,
61 no coverage, 0 errors), exit 0. No `.stryker-tmp/` was left behind.

### Privacy and ethics check (9.5)

Verdict: **PASS**. Surfaces: dependencies and delivery only (no personal data, no auth, no logging).

- No personal data or secret in the diff: a grep of the added lines for e-mail shapes,
  `Authorization:`, keys and passwords found only the `inputTokens`/`tokenBudget` fields of the API
  types and the synthetic answer of the client test.
- `packages/web/dist`: 0 matches of `VITE_` and of `127.0.0.1:3000` (the proxy target lives only in
  `vite.config.ts`, never in the bundle). No `import.meta.env`, `localStorage`, `console.*` nor
  `dangerouslySetInnerHTML` in `packages/web/src`.
- New dependencies, exactly those of D14, resolved by `npm install` from the npm registry:
  `react-router` 7.18.4; `tailwindcss` 4.3.3 and `@tailwindcss/vite` 4.3.3; `jsdom` 26.1.0,
  `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.8,
  `axe-core` 4.14.0. `package-lock.json` lists the `linux-x64-gnu` optional packages of
  `@tailwindcss/oxide` and `lightningcss`; comparing it with the previous lock, no package was removed
  and no version changed (78 entries added).

## Data state verification

- Pre-test baseline: no database is used by the code tasks; `DATABASE_URL` not exported.
- Post-test validation: no database touched; no `.stryker-tmp/` left; `packages/web/dist` is gitignored
  and not staged.
- State restored: Yes (nothing to restore).
- Restoration actions: none. The probe files of 2.5 and 4.9 were moved to the session scratchpad,
  outside the repository.

## Implementation notes (agent decisions)

- **Tailwind does not scan the tests.** Tailwind 4 detects sources automatically, so the class names the
  theme test holds on purpose (`text-stripe`, `text-stripe-soft`) generated those utilities in the
  bundle. `index.css` adds `@source not "./**/*.test.ts"` and `@source not "./**/*.test.tsx"`; after it,
  the built CSS holds neither utility nor the two decorative tokens.
- **`PageFrame`.** The placeholder and the not-found page share the white container, the header and
  the main landmark through `components/PageFrame.tsx` (refactor 8.1), so DIS-60/65/66 reuse one frame.

## UI evidence

See the step 10 report (`./2026-10-18-10-manual-interface-testing.md`).

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum: CI run of the pull request (2026-10-18, task 15.3)

PR #53 (`feature/DIS-58-web-scaffolding` → `feature/entrega-2-CRN`):
https://github.com/DisTinta/AI4Devs-finalproject/pull/53

- `Frontend` workflow run: https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39135036414
  - "Unit / component tests" step: `Test Files 111 passed (111)`, `packages/web` and `tests/unit/web`
    included (`frontend.yml`'s paths filter, D27).
  - "Accessibility (test:a11y)" step: ran `npm run test:a11y` directly (no "not defined" warning, D32),
    `Test Files 1 passed (1)` over `tests/a11y/smoke.a11y.test.tsx`. The `HTMLCanvasElement.getContext`
    messages in its stderr are axe-core's known jsdom limitation (no `canvas` package), not a failure.
- `CI` workflow run: https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39135036340
  - `scope`, `secrets`, `verify`: pass on the first attempt.
  - `mutation`: pass on the first attempt (`npm run test:mutation:full`, ≥ 80, 32m11s).
  - `quality`: failed on the first attempt with
    `tests/integration/cli/seed-build.spec.ts:345` — `AssertionError: expected [] to deeply equal [ Array(1) ]`
    in "The database is unchanged after a build". This spec and its failure mode are outside this PR's
    diff (`git diff --stat origin/feature/entrega-2-CRN...HEAD -- tests/integration/` is empty) and match
    the known DB-integration race documented in `docs/TESTING.md` → Known races: a parallel integration
    spec commits a project outside the harness transaction for a moment, and a spec that reads every
    project in that moment (here, `projectIds(observer)` in "seed build on its own connection") sees one
    extra row. Per the hard rule against editing existing tests and the project's own documented
    mitigation (`npm test -- --no-file-parallelism`, not applicable to a parallel CI job), the job was
    re-run instead of modifying code or tests:
    `gh run rerun 39135036340 --repo DisTinta/AI4Devs-finalproject --job 117697733266`. The re-run
    (job https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/39135036340/job/117704870511)
    passed: "Tests" step shows `Test Files 143 passed (143)`, including
    `packages/web/src/services/api-client.test.ts` (14 tests), `packages/web/src/theme.test.ts` (3 tests)
    and `packages/web/src/router.test.tsx` (5 tests).
- Final state of `gh pr checks 53`: `frontend`, `mutation`, `quality`, `scope`, `secrets`, `verify` all
  `pass`.
- This counts as 0 fix attempts against the task's budget of 2: no code or test was changed, only a CI
  job was re-run against a documented, pre-existing flake unrelated to this change's diff.
