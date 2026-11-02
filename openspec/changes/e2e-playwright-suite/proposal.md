## Why

The demonstration walkthrough of CODEMIND (`readme.md` §1.3: pick a project → ask → verified evidence and
cost, the honest `UNKNOWN`, and step 4, the impact report) is only backed today by component tests in
jsdom and by manual browser captures. `readme.md` §2.6 and §2.4 promise an end-to-end suite with
Playwright that CI runs, and `docs/frontend-standards.md` §1 and `docs/backend-standards.md` §1 still mark
Playwright as a *target*. DIS-75 (CM-HU-21.1, parent DIS-50 / CM-HU-21) builds that suite now: its
blockers are closed (DIS-66 and DIS-44 are Done), Screens 1, 2 and 3 exist, and two earlier changes handed
work to it with destination B — DIS-65 (axe in a real browser, where layout exists) and DIS-14 (the
Screen 3 walkthrough).

## What Changes

- **Dependency**: `@playwright/test` as an exact-version root devDependency (`1.64.1`), justified in the
  design; only Chromium is installed.
- **`playwright.config.ts`** at the root: tests in `tests/e2e/`, a single Chromium project, retries only in
  CI, trace and screenshot kept on failure, and two web servers it starts itself — the API without
  `--watch` in evaluation mode (`LLM_BASE_URL` and `LLM_API_KEY` empty, which win over `.env`) and the Vite
  dev server on `5173` — never reusing a server that is already running.
- **Four specs over the seed (acme-shop)**:
  - `tests/e2e/ask-flow.spec.ts` — Screen 1 → acme-shop → golden Q1 → at least one verified statement,
    one evidence expanded with its excerpt, the usage panel with tokens, cost and savings.
  - `tests/e2e/unknown.spec.ts` — Q6 (refunds) → «Sin respuesta verificada», «Motivo: no-anchor», no
    statement and no evidence.
  - `tests/e2e/impact-flow.spec.ts` (from DIS-14) — Screen 2 → «Analizar el impacto de un cambio» →
    «cambiar los descuentos de DiscountService» → «Riesgo alto» and `DiscountService` among the direct
    dependants.
  - `tests/e2e/ask-page.a11y.spec.ts` (from DIS-65) — axe-core injected from `node_modules` on Screen 2 at
    320 px and 1280 px with every evidence of the three acme-shop golden questions expanded, and with a
    mocked answer holding a long path without spaces: zero violations and no horizontal overflow.
- **Isolation from Vitest**: `tests/e2e/**` is excluded from `vitest.config.ts` (root and `node` project;
  `vitest.stryker.config.ts` inherits it), so Vitest never loads a Playwright spec; `tests/e2e/` gets its
  own `tsconfig.json` (DOM types) checked by `npm run typecheck`.
- **Script** `npm run test:e2e` (`playwright test`).
- **CI**: a new job `e2e` in `.github/workflows/ci.yml`, under the condition of `quality`, with its own
  Postgres database `e2e` (migrate, seed), Chromium only, `npm run test:e2e`, the Playwright report and
  test results uploaded as an artifact on failure; `scope` checks `e2e` together with `quality`,
  `mutation` and `verify`.
- **Docs**: the *target* notes for Playwright are removed from `docs/frontend-standards.md` §1 and
  `docs/backend-standards.md` §1; `docs/TESTING.md` (row «Extremo a extremo»), `readme.md` (tree, CI
  paragraph, tool table), `docs/DEPLOYMENT.md` (CI jobs) and `docs/project-context.md` (how to run the
  suite locally) describe the suite.

## Capabilities

### New Capabilities

- `e2e-suite`: the end-to-end suite of the web client — how it starts the API and the web on the seed in
  evaluation mode, the four walkthroughs it checks in a real Chromium (ask flow, unknown, impact flow,
  accessibility with layout), its isolation from Vitest, the `test:e2e` script and the CI job `e2e` with
  its own database and failure artifacts.

### Modified Capabilities

None. The `verify-smoke` requirement "Verify runs in a CI job of its own" still holds with `e2e` added to
the `scope` loop (it requires that `verify` is checked together with `quality` and `mutation`, which stays
true); only its test's exact-text match of the loop is loosened, without weakening what it asserts.

## Impact

- **Dependencies**: `@playwright/test@1.64.1` (devDependency; `package-lock.json` changes). The lock and
  `vitest.config.ts` changes invalidate the incremental Stryker cache: the `mutation` job of the PR runs a
  full pass (within its 60-minute limit).
- **Code**: no production code changes (`packages/**` untouched). New: `playwright.config.ts`,
  `tests/e2e/*.spec.ts`, `tests/e2e/tsconfig.json`, `tests/unit/ci/e2e-job.spec.ts`,
  `tests/unit/ci/e2e-config.spec.ts`. Changed: `vitest.config.ts`, `tests/tsconfig.json`, `package.json`
  (script, typecheck, devDependency), `eslint.config.mjs` (ignore the Playwright output folders),
  `.github/workflows/ci.yml`, and the existing tests `tests/unit/ci/verify-job.spec.ts` and
  `tests/unit/ci/node-baseline.spec.ts`.
- **CI time**: one more parallel job (~5-10 min); no change to the other jobs' duration.
- **Privacy**: none. The suite runs on the versioned sample seed (acme-shop), with no model call and no
  personal data; failure artifacts hold screenshots and traces of that sample only.
