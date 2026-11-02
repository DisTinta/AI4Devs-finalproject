## Purpose

Backs the demonstration walkthrough of the web client with an end-to-end suite that drives a real
Chromium against the real API and web on the versioned seed, in evaluation mode, locally and in a CI job
of its own: the ask flow, the honest `UNKNOWN`, the impact report and the accessibility checks that need
a real layout.

## ADDED Requirements

### Requirement: The suite starts its own API and web on the seed in evaluation mode

`npm run test:e2e` SHALL run the end-to-end suite, whose specs live in `tests/e2e/`, in a single Chromium
browser. Before the first spec it SHALL start two processes of its own and wait until both answer: the
API from `packages/api/src/server.ts`, without file watching, until `http://127.0.0.1:3000/health`
answers; and the web development server, until `http://127.0.0.1:5173` answers. Every spec SHALL open
pages relative to `http://127.0.0.1:5173`. The API SHALL run in evaluation mode whatever `.env` says:
its environment SHALL define `LLM_BASE_URL` and `LLM_API_KEY` as empty strings, which win over `.env`, so
no answer calls a language model, and it SHALL also define `PORT` = `3000`, `HOST` = `127.0.0.1` and
`RATE_LIMIT_MAX` = `1000`, so no `.env` value moves the API off the address the web proxies to or
rate-limits the suite. `DATABASE_URL` SHALL come from the environment when set (CI) or from
`.env` otherwise. The suite SHALL NOT reuse an API or web server that is already running: when port
`3000` or `5173` is taken, the run SHALL fail before any spec runs. Each spec SHALL be retried once in CI
and never locally, and a failed spec SHALL leave its trace and screenshot in `test-results/` and the HTML
report in `playwright-report/`, without opening a browser to show it.

#### Scenario: The Playwright configuration starts both servers in evaluation mode

- **GIVEN** the options module `tests/e2e/support/config-options.ts` and the root `playwright.config.ts`
- **WHEN** both are loaded (the options module) and read (the configuration's source)
- **THEN** the root `playwright.config.ts` default-exports `defineConfig` applied to that options object
  unchanged, with no other option added or overridden
- **AND** the options' test directory is `tests/e2e`, they have exactly one project and that project uses
  Chromium, and their base URL is `http://127.0.0.1:5173`
- **AND** they have exactly two web servers: one whose command starts `packages/api/src/server.ts` without
  `--watch` and waits for `http://127.0.0.1:3000/health`, whose environment is exactly
  `LLM_BASE_URL` = `''`, `LLM_API_KEY` = `''`, `PORT` = `3000`, `HOST` = `127.0.0.1` and
  `RATE_LIMIT_MAX` = `1000`; and one whose command starts the web development server with
  `--strictPort` and waits for `http://127.0.0.1:5173`
- **AND** neither web server reuses an existing server
- **AND** retries are `1` when `CI` is set and `0` otherwise, traces are retained on failure, screenshots
  are taken only on failure, and the HTML reporter never opens

#### Scenario: A taken port fails the run before any spec

- **GIVEN** a process already answering on `http://127.0.0.1:5173` (and, in a separate run, a process
  already answering on `http://127.0.0.1:3000/health`)
- **WHEN** `npm run test:e2e` runs
- **THEN** it exits with a non-zero code before any spec starts, with Playwright's `webServer` error
  naming the taken URL

### Requirement: Vitest never runs the end-to-end specs

The Vitest runs of the project (`npx vitest run`, every Vitest project, and the Vitest configuration
Stryker uses) SHALL NOT collect any file under `tests/e2e/`. The end-to-end specs and the Playwright
configuration SHALL be type-checked by `npm run typecheck`. The root `package.json` SHALL define the
script `test:e2e` as `playwright test`.

#### Scenario: The Vitest configuration excludes tests/e2e

- **GIVEN** the root `vitest.config.ts` and `vitest.stryker.config.ts`
- **WHEN** they are loaded
- **THEN** the root `exclude` and the `exclude` of the `node` project contain a glob that matches
  `tests/e2e/ask-flow.spec.ts`; the `include` of the `dom`, `seed-build` and `harness` projects does not
  match it; the `node` project, which declares no `include` of its own, is kept off it by its `exclude`;
  and the merged `exclude` of `vitest.stryker.config.ts` still matches it
- **AND** the root `package.json` has the script `test:e2e` equal to `playwright test`, and its
  `typecheck` script checks `tests/e2e/tsconfig.json`
- **AND** `tests/e2e/tsconfig.json` includes `playwright.config.ts` and the specs of `tests/e2e/`, and
  `tests/tsconfig.json` excludes `e2e/**`

### Requirement: Ask flow on the seed

On the seed, with the API in evaluation mode, the suite SHALL check the main walkthrough: from Screen 1,
choosing the acme-shop card leads to Screen 2 of acme-shop; sending the golden question Q1 «¿Cómo se
calcula el precio final de un pedido?» with the button «Preguntar» shows at least one statement with its
verification badge; expanding one evidence turns its button to `aria-expanded="true"` and shows its
excerpt; and the usage panel «Uso» shows the tokens, the cost and the savings badge.

#### Scenario: Asking Q1 on acme-shop shows verified evidence and the usage panel

- **GIVEN** the API and the web started by the suite on the seed, in evaluation mode
- **WHEN** the browser opens `/`, chooses the acme-shop card, and sends Q1 with the button «Preguntar»
- **THEN** the URL is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`
- **AND** at least one statement shows a verification badge («verificado» or «sin verificar»)
- **AND** after activating the first evidence button, that button has `aria-expanded="true"` and its
  excerpt is visible
- **AND** the region named «Uso» is visible and contains a text matching `/\d[\d\s]* tokens?\b/` (the
  digits grouped with a no-break space), a cost matching `/(\$0|< \$0\.001|\$\d+\.\d{3})/` and the
  savings badge matching `/(ahorro \d+(\.\d)? % vs bruto|sin ahorro vs bruto)/` (the formats of
  `packages/web/src/components/usage-display.ts`)

### Requirement: Honest unknown on the seed

On the seed, with the API in evaluation mode, the suite SHALL check that a question without anchor in the
graph shows the honest unknown and nothing that looks like an answer.

#### Scenario: Asking Q6 on acme-shop shows no verified answer

- **GIVEN** the API and the web started by the suite on the seed, in evaluation mode, and Screen 2 of
  acme-shop open
- **WHEN** the question Q6 «¿Cómo se gestionan los reembolsos de un pedido?» is sent
- **THEN** the heading «Sin respuesta verificada» and the text «Motivo: no-anchor» are visible
- **AND** no statement badge and no evidence button is on the page

### Requirement: Impact flow on the seed

On the seed, with the API in evaluation mode, the suite SHALL check step 4 of the walkthrough: from
Screen 2 of acme-shop, the link «Analizar el impacto de un cambio» leads to Screen 3, and analysing the
change «cambiar los descuentos de DiscountService» shows a high-risk report naming `DiscountService` among
the direct dependants.

#### Scenario: Analysing a change to DiscountService reports high risk

- **GIVEN** the API and the web started by the suite on the seed, in evaluation mode, and Screen 2 of
  acme-shop open
- **WHEN** the link «Analizar el impacto de un cambio» is followed and «cambiar los descuentos de
  DiscountService» is sent with the button «Analizar»
- **THEN** the URL is `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`
- **AND** the risk heading «Riesgo alto» is visible
- **AND** the section «Directo» contains an entry with the text `DiscountService`

### Requirement: Accessibility of Screen 2 in a real browser

The suite SHALL run axe-core inside the browser on Screen 2 of acme-shop, where the layout exists, at a
narrow width of 320 px and a desktop width of 1280 px. At both widths it SHALL find zero violations and
no horizontal overflow (the document's scroll width SHALL NOT exceed its client width) in two states:
with every evidence of each of the three acme-shop golden questions of the suggestions expanded; and with
an answer served by a mocked API response whose statement and evidence hold a path of at least 80
characters without spaces, with its evidence expanded.

#### Scenario: Every golden evidence expanded has no violation and no overflow

- **GIVEN** the API and the web started by the suite on the seed, in evaluation mode
- **WHEN** at 320 px and then at 1280 px, each of the three suggested golden questions of acme-shop is
  sent on Screen 2 and every evidence button of its answer is expanded
- **THEN** axe-core reports zero violations for each answer at each width
- **AND** the document's scroll width does not exceed its client width for each answer at each width

#### Scenario: A mocked answer with a long path does not overflow

- **GIVEN** Screen 2 of acme-shop, with the ask request answered by a mocked response whose statement
  text and evidence hold a path of at least 80 characters without spaces
- **WHEN** at 320 px and then at 1280 px the question is sent and its evidence is expanded
- **THEN** axe-core reports zero violations at each width
- **AND** the document's scroll width does not exceed its client width at each width

### Requirement: The end-to-end suite runs in a CI job of its own

`.github/workflows/ci.yml` SHALL have a job `e2e` that depends on `scope` and runs under the same
condition as `quality`, with its own Postgres service (`pgvector/pgvector:pg16`) whose database is `e2e`,
and that runs, in this order, `npm ci`, the installation of Chromium only with its system dependencies,
`npm run db:migrate`, `npm run db:seed` and `npm run test:e2e`, each step that needs the database with
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/e2e`. No step or job of it SHALL define an
`LLM_*` variable or set `continue-on-error`. No other job SHALL use the database `e2e`. When a step
fails, the job SHALL upload `playwright-report/` and `test-results/` as an artifact. The `scope` job
SHALL treat a previous `e2e` result that is neither success nor skipped as it treats `quality`,
`mutation` and `verify`. A failing `e2e` job SHALL fail the run. The same suite SHALL also pass when run
locally on the seeded local database, from Bash and from PowerShell.

#### Scenario: The CI workflow runs the end-to-end suite in a job of its own

- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** it is parsed as YAML
- **THEN** it has a job `e2e` with `needs` including `scope` and the `if` of `quality`; its only service
  is `pgvector/pgvector:pg16` with `POSTGRES_DB` = `e2e`; its steps run `npm ci`,
  `npx playwright install --with-deps chromium`, `npm run db:migrate`, `npm run db:seed` and
  `npm run test:e2e` in that order, each of the last three with `DATABASE_URL` =
  `postgres://postgres:postgres@localhost:5432/e2e`
- **AND** no step or job of it defines an `LLM_*` variable, and neither the job nor any of its steps sets
  `continue-on-error`
- **AND** a step after `npm run test:e2e` uses `actions/upload-artifact` with `if: failure()` and a path
  that includes `playwright-report/` and `test-results/`
- **AND** no other job has a service with `POSTGRES_DB` = `e2e`
- **AND** the `scope` script checks `e2e` together with `quality`, `mutation` and `verify`

#### Scenario: A failing spec fails the suite and leaves its evidence

- **GIVEN** the suite with one spec whose expected text is deliberately wrong
- **WHEN** the suite runs that spec (`npx playwright test <file>`, the runner behind `npm run test:e2e`)
- **THEN** it exits with a non-zero code
- **AND** `test-results/` holds a screenshot and a trace of the failed spec
- **AND** `playwright-report/index.html` exists and no browser window was opened

Because the `e2e` job runs `npm run test:e2e` with no `continue-on-error`, a non-zero exit code fails the
job and the run; no deliberately broken spec is pushed to CI.

#### Scenario: The suite passes locally

- **GIVEN** the local Docker Postgres seeded and ports `3000` and `5173` free
- **WHEN** `npm run test:e2e` runs from Bash, from `pwsh -NoProfile` and from `powershell.exe -NoProfile`
- **THEN** the four specs pass and the command exits `0` in each shell

#### Scenario: The e2e job is green on the pull request

- **GIVEN** the pull request of this change
- **WHEN** the `CI` workflow runs on it
- **THEN** the `e2e` job runs the four specs and finishes with success
