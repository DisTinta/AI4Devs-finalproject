## Context

See `proposal.md` → Why. The state the design starts from (`final-project-CRN` at `f9ad088`):

- `tests/e2e/` holds only `.gitkeep`; no Playwright package is installed. `.gitignore` already ignores
  `playwright-report/`, `test-results/`, `blob-report/` and `.playwright/`.
- `vitest.config.ts` has four projects (`dom`, `seed-build`, `harness`, `node`). The `node` project takes
  every `*.spec.ts` / `*.test.ts` it does not exclude, so today it would collect `tests/e2e/*.spec.ts` and
  fail on `@playwright/test`'s `test()`. `vitest.stryker.config.ts` inherits the config through
  `mergeConfig` and adds its own exclusions.
- `tests/tsconfig.json` type-checks `tests/**/*.ts` with the base `lib` (no DOM); `tests/a11y/tsconfig.json`
  is the precedent of a per-folder tsconfig added to the `typecheck` script.
- The API process is `packages/api/src/server.ts`; its `dev` script runs it with `node --watch` from
  `packages/api` with `--import ../../scripts/load-env.mjs --import ./dev-register.mjs`. The `.env`
  preload never overwrites a variable already present in the environment, even an empty one
  (`scripts/env.mjs`), and both `LLM_BASE_URL` and `LLM_API_KEY` empty is evaluation mode
  (`docs/project-context.md` → Closed product decisions, 2).
- The Vite dev server listens on `5173` and proxies `/api` and `/health` to the fixed
  `http://127.0.0.1:3000` (`packages/web/vite.config.ts`).
- `.github/workflows/ci.yml`: `scope` decides `code`, looping over `quality mutation verify`; `verify` is
  the template of a job with its own seeded database. The YAML contract of `verify` is tested by
  `tests/unit/ci/verify-job.spec.ts` (exact text of the `scope` loop) and the Node baseline of every job by
  `tests/unit/ci/node-baseline.spec.ts` (exact list of jobs that install Node).
- Stable selectors already exist: the button «Preguntar» (`QueryBox`), the heading «Sin respuesta
  verificada» and «Motivo: …» (`UnknownState`), evidence buttons with `aria-expanded` (`EvidenceItem`), the
  badge labels «verificado» / «sin verificar» (`StatementBadge`), the region «Uso» (`UsagePanel`), the link
  «Analizar el impacto de un cambio» (`AskPage`), the field «Cambio», the button «Analizar», the heading
  «Riesgo alto» and the section «Directo» (Screen 3).

## Goals / Non-Goals

**Goals:**

- A reproducible start of API + web on the seed in evaluation mode, the same locally and in CI.
- Four specs that read the screens the way a user does (roles and accessible names), so a later
  restyle does not break them.
- A CI job whose failure leaves traces and screenshots to diagnose it.

**Non-Goals (design level, on top of the proposal's):**

- No production code change: if a spec exposes a defect in `packages/web` or `packages/api`, it is fixed
  in this change only when it is the cause of a failing scenario (TDD), otherwise it is a Follow-up.
- No configurable API port and no change to the Vite proxy (fixed `3000`).
- No coverage or mutation gate (DIS-77), no browsers other than Chromium, no live-model E2E, no E2E of
  indexing (`POST /index`) or of `task-api`.
- No GitHub branch-protection settings (repository setting, not code).

## Decisions

**D1 — `@playwright/test@1.64.1`, exact, root devDependency.** It is the E2E tool named by
`docs/frontend-standards.md` §1 and `docs/backend-standards.md` §1; the Playwright MCP used by
`/show-spec-working` is an agent tool, not a CI contract (`docs/base-standards.md`). `1.64.1` is the latest
stable release published more than two weeks ago (2026-10-14; `1.65` is still alpha). Exact version, not a
caret, so the browser build installed by `npx playwright install` matches the lock. After `npm install`,
`npm audit --audit-level=high` must report no new high or critical advisory, or the ticket stops.
*Alternative:* `playwright-core` with a hand-written runner (as the DIS-14 session script) — rejected: no
retries, traces, reporters or `webServer`.

**D2 — axe-core injected from `node_modules/axe-core/axe.min.js` with `page.addScriptTag({ path })`, then
`page.evaluate(() => axe.run(document))`.** No `@axe-core/playwright`: one dependency less (enrich E5). The
whole document is scanned, without disabling any rule; the result's `violations` must be empty, and on a
failure the test message lists each violation's id and targets.

**D3 — `playwright.config.ts` at the root.** `testDir: 'tests/e2e'`; one project `chromium`
(`devices['Desktop Chrome']`); `retries: process.env.CI ? 1 : 0`; `workers: 1` (the specs share one API
and one seeded database, and the impact and ask flows write `query_log` rows; serial keeps them
independent of order); `use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
screenshot: 'only-on-failure' }`; `reporter: [['list'], ['html', { open: 'never' }]]`. Two `webServer`
entries:

- API: `cwd: 'packages/api'`, `command: 'node --import ../../scripts/load-env.mjs --import
  ./dev-register.mjs src/server.ts'` (the `dev` command without `--watch`, so a file saved during a run
  does not restart it), `url: 'http://127.0.0.1:3000/health'`, `env: { LLM_BASE_URL: '', LLM_API_KEY: ''
  }`, `reuseExistingServer: false`, `timeout: 60_000`.
- Web: `command: 'npm -w packages/web run dev -- --host 127.0.0.1 --port 5173 --strictPort'`,
  `url: 'http://127.0.0.1:5173'`, `reuseExistingServer: false`, `timeout: 60_000`. `--strictPort` makes
  a taken `5173` fail instead of moving to `5174`, where the specs would not look.

Playwright passes `process.env` to each server merged with `env`, so `DATABASE_URL` from the CI step
reaches the API, and locally the API reads it from `.env`. With `reuseExistingServer: false`, a server
already listening on the URL makes Playwright fail before any spec ("… is already used"), which is the
behaviour the spec requires (E3). *Alternative:* reuse a running `npm run dev` locally — rejected: a
`.env` in live mode would make answers non-deterministic and the specs flaky.

**D4 — Specs read the screens by role and accessible name** (`getByRole('button', { name: 'Preguntar' })`,
`getByRole('heading', { name: 'Sin respuesta verificada' })`, `getByRole('region', { name: 'Uso' })`,
`getByRole('link', { name: 'Analizar el impacto de un cambio' })`), as the RTL tests of
`packages/web/src/pages/*.test.tsx` do. The question field is reached by its label, as in those tests.
The acme-shop card is chosen by its accessible name from `ProjectCard`. The acme-shop id
`a794456d-6d1b-5b55-a360-13fec83dc7bc`, Q1 and Q6 are restated in the specs as constants with a comment
naming their source (`packages/web/src/data/sample-projects.ts`, `suggested-questions.ts`,
`fixtures/README.md`): the specs import no runtime module of the web package, so the Playwright process
never loads the web's module graph, and a changed golden question fails the spec visibly instead of
following the change silently. The a11y spec clicks the suggestion buttons themselves, so it needs no
restated text. Only types are imported from the web package (`import type`, D5).

**D5 — The a11y spec (`ask-page.a11y.spec.ts`).** Two tests, one per scenario, each looping over the
widths `[320, 1280]` with `page.setViewportSize({ width, height: 900 })`:

1. For each suggestion button of the group «Prueba:» on Screen 2 of acme-shop: click it, wait for the
   answer, click every evidence button whose `aria-expanded` is `false`, run axe, then assert
   `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
2. `page.route('**/api/projects/*/ask', …)` fulfils with a valid `answer` body (built in the spec, with
   the shape of the API's `askResponseSchema`: one `entailed` statement whose text and evidence location
   contain a 96-character path without spaces, one evidence with an excerpt holding the same path, a
   `usage` block); send any valid question, expand the evidence, run axe, check the overflow.

The mocked body is checked against the contract by a type annotation with the web client's response
type (`import type { AskAnswered } from '../../packages/web/src/services/api-client'`, erased at run
time; the web client's types are themselves checked against the API's schemas by the contract test of
`web-foundation`). *Why a mock:* no golden answer has a path long
enough to reproduce the defect DIS-65 fixed (design D38 of `ask-page`).

**D6 — Vitest isolation by exclusion.** `'tests/e2e/**'` is appended to the root `test.exclude` and to the
`node` project's `exclude` of `vitest.config.ts` (the `node` project restates the root globs, so both
places get it). `vitest.stryker.config.ts` inherits it through `mergeConfig`; it is not edited. The specs
keep the `.spec.ts` suffix the ticket names (enrich E2). *Alternative:* a `.e2e.ts` suffix that Vitest
never matches — rejected: it departs from the ticket and from Playwright's default `testMatch`.

**D7 — Type-checking: `tests/e2e/tsconfig.json`.** It extends `../tsconfig.json` and adds `"lib":
["ES2022", "DOM", "DOM.Iterable"]` (the `page.evaluate` callbacks use `document`; `ES2022` is the
`target` of `tsconfig.base.json`), and includes `**/*.ts` plus `../../playwright.config.ts`. `tests/tsconfig.json` gains `"exclude": ["e2e/**"]`
so no file is checked twice with different `lib`s. The `typecheck` script appends `&& tsc -p
tests/e2e/tsconfig.json`. The type-only import of D5 pulls `api-client.ts` into the program; if its
compiler options clash with the tests' (it compiles under the web's tsconfig), the mocked body is typed
with a local interface that restates the fields it uses, and the clash is recorded as a Follow-up.

**D8 — Lint.** `eslint.config.mjs` adds `playwright-report/**`, `test-results/**` and `blob-report/**` to
`ignores` (generated output on disk, already gitignored). The specs and the config are linted as any other
TypeScript file.

**D9 — CI job `e2e`** in `.github/workflows/ci.yml`, after `verify`: `needs: scope`, `if:
needs.scope.outputs.code == 'true'`, `timeout-minutes: 15`, service `pgvector/pgvector:pg16` with
`POSTGRES_DB: e2e` (the `verify` service options), steps `actions/checkout@v4`, `actions/setup-node@v4`
(Node `'22'`, npm cache), `npm ci`, `npx playwright install --with-deps chromium`, `npm run db:migrate`,
`npm run db:seed`, `npm run test:e2e` (the last three with `DATABASE_URL:
postgres://postgres:postgres@localhost:5432/e2e`), then `actions/upload-artifact@v4` with `if: failure()`,
`name: playwright-report`, `path: |` `playwright-report/` `test-results/`, `retention-days: 7`. No
`LLM_*` anywhere, no `continue-on-error`. `scope`'s loop becomes `for job in quality mutation verify e2e;
do` and its comment names the four jobs. *Why its own database:* `quality`'s integration tests assume an
unseeded `test` database (PH-23) and `verify` owns `verify` (enrich E4). No browser cache step: the
Chromium download (~1 min) is cheaper than the cache-key maintenance for one job.

**D10 — Tests of the configuration (Vitest, `tests/unit/ci/`).**

- `e2e-job.spec.ts` — scenario "The CI workflow runs the end-to-end suite in a job of its own"; parses
  `ci.yml` as YAML, the pattern of `verify-job.spec.ts`.
- `e2e-config.spec.ts` — scenario "The Playwright configuration starts both servers in evaluation mode"
  (imports `playwright.config.ts`; `defineConfig` returns the plain object, and importing
  `@playwright/test` outside its runner only fails when `test()` is called) and scenario "The Vitest
  configuration excludes tests/e2e" (imports `vitest.config.ts` and `vitest.stryker.config.ts`, matches
  the globs with `node:path`'s `matchesGlob` or Vitest's own `picomatch`-compatible check, and reads
  `package.json`). If importing `@playwright/test` from Vitest fails in practice, the config's literal
  options move to `tests/e2e/support/config-options.ts` (no Playwright import), which both the config and
  the test import; recorded as a Follow-up if it happens.

Both live in the `node` project and touch no mutated source; Stryker's dry run runs them as it runs
`verify-job.spec.ts`.

**D11 — Existing tests that change (named for the protection hook).**

- `tests/unit/ci/verify-job.spec.ts` → test "The CI workflow runs verify in a job of its own": the exact
  regex `/for job in quality mutation verify; do/` becomes a check that the `for job in …; do` list of the
  `scope` script contains `quality`, `mutation` and `verify` (still asserted, not weakened); `e2e` is
  asserted by the new `e2e-job.spec.ts`.
- `tests/unit/ci/node-baseline.spec.ts` → test "Every CI job installs Node 22": the expected list gains
  `'.github/workflows/ci.yml:e2e'` and its comment says five jobs.

**D12 — Scenarios verified by evidence, not by a Vitest test.** "A failing spec fails the suite and leaves
its evidence" is checked once during the apply, locally: a temporary copy of `unknown.spec.ts` with a
wrong expected text is run with `npx playwright test <copy>`, the non-zero exit code and the files in
`test-results/` are recorded in the step report, and the copy is deleted (never committed). "The e2e job is
green on the pull request" is checked on the PR's CI run. The four walkthrough scenarios are the four
Playwright specs themselves.

**D13 — Local run.** Prerequisites: Docker Postgres up and seeded (`npm run up`, then stop its `npm run
dev` so `3000` and `5173` are free) and `npx playwright install chromium` once. Then `npm run test:e2e`.
Documented in `docs/TESTING.md` and `docs/project-context.md` → Testing, in Bash and PowerShell (the
command is the same; no `$env:` variable is needed because the config empties `LLM_*` itself). The agent
runs it from Bash and from `pwsh -NoProfile -Command 'npm run test:e2e'` and `powershell.exe -NoProfile
-Command 'npm run test:e2e'`, records versions and results, and ends with `node scripts/dev-processes.mjs
stop`.

## Risks / Trade-offs

- [The lock and `vitest.config.ts` change the Stryker cache key] → the PR's `mutation` job runs a full
  pass (30-60 min, within its 60-minute limit); accepted (enrich E2). The waiting step uses
  `gh pr checks --watch` in the foreground.
- [Flaky first load of the Vite dev server in CI (dependency pre-bundling on first request)] → retries 1 in
  CI, `webServer.timeout` 60 s, and the specs wait on visible elements, never on fixed sleeps.
- [A `.env` with other `LLM_*` values (`LLM_MODEL`) while `LLM_BASE_URL` is empty] → evaluation mode
  ignores them (`docs/project-context.md` → Closed product decisions, 2); if the API refuses to start, the
  failure shows in the `webServer` output and the config also empties the offending variable (Follow-up).
- [A golden answer changes after `cache:build`] → the specs assert the presence of a badge, an evidence and
  the usage region, not exact texts of answers; the impact assertion uses the risk level and the
  `DiscountService` entry, both fixed by the seed (DIS-14 manual report).
- [Ports `3000`/`5173` taken locally by an open `npm run dev`] → the run fails fast with Playwright's
  message; `docs/TESTING.md` says to stop `npm run dev` first.
- [The a11y spec's mocked body drifts from the API schema] → typed with the web client's response type
  (D5), so `npm run typecheck` catches a drift.

## Migration Plan

No data or API migration. Rollback is reverting the commits: nothing in `packages/` depends on the suite.

## Follow-ups

*Agent's text: decisions taken by the agent as lead engineer in the autonomous run
(`docs/AUTONOMOUS-RUN.md` §6), without the author. E1–E7 are the DIS-75 enrich decisions (comment of
2026-11-02 in the ticket); P1–P6 are design decisions of this proposal. Destinations: A = this change;
B = another existing ticket; C = the author (none in this change, by the author's instruction); D =
accepted and recorded.*

| Id | Decision | Destination |
|---|---|---|
| E1 | The change also takes the two inbound hand-offs: `impact-flow.spec.ts` (DIS-14, its Follow-up P6) and `ask-page.a11y.spec.ts`, axe in a real browser at 320 px and 1280 px (DIS-65), limited to acme-shop. | A |
| E2 | Specs keep the `.spec.ts` suffix and `tests/e2e/**` is excluded from Vitest (D6); the full Stryker pass caused by the lock and config change is accepted. | A |
| E3 | Playwright starts its own API without `--watch` in evaluation mode and the web on `5173`, never reusing a running server (D3). | A |
| E4 | Job `e2e` with its own database `e2e`, Chromium only, failure artifacts, and `e2e` added to the `scope` loop (D9). | A |
| E5 | axe-core injected from `node_modules`, no `@axe-core/playwright` (D2). | A |
| E6 | A new OpenSpec capability `e2e-suite` holds the suite's contract, although the original ticket note said "no spec": the autonomous run audits specs, and the CI job and the walkthroughs are observable behaviour. | A |
| E7 | Only the E2E row of `docs/TESTING.md` is updated here; the test pyramid and the coverage and mutation policy belong to DIS-77. | B — DIS-77 |
| P1 | `@playwright/test` pinned to `1.64.1`, the latest stable release older than two weeks (D1). | A |
| P2 | `workers: 1`: the specs share one API and one seeded database (D3). | D — accepted |
| P3 | `--strictPort` on the web server so a taken `5173` fails instead of moving the port (D3). | A |
| P4 | Q1, Q6 and the acme-shop id are restated in the specs with their source named; the specs import no runtime module of the web package (D4). | D — accepted |
| P5 | `verify-job.spec.ts` keeps asserting `quality`, `mutation` and `verify` in the `scope` loop by list membership instead of exact text, so adding `e2e` does not weaken it (D11); the `verify-smoke` requirement is unchanged. | A |
| P6 | The two scenarios that cannot be a Vitest test ("A failing spec fails the suite…", "The e2e job is green…") are verified by recorded evidence: a local negative run and the PR's CI run (D12). | A |
