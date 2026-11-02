## Purpose

Defines what the CI enforces about test quality and what it only reports: test coverage is published per
package as information and never fails a run, while the mutation score is the only hard gate.

## ADDED Requirements

### Requirement: Per-package coverage summary

The repository SHALL provide a command that reads a Vitest JSON coverage summary (the
`coverage-summary.json` written by the `json-summary` reporter; default path
`coverage/coverage-summary.json`, or the path given as its first argument) and writes to standard output
a Markdown section with the heading `## Cobertura por paquete (informativa)`, one sentence saying that
coverage does not block the pipeline and that the gate is the mutation score, and a table with the
columns `Paquete`, `Líneas`, `Sentencias`, `Funciones`, `Ramas` and `Objetivo (líneas)`.

Each file entry of the summary MUST be assigned to a package from the segment after the last
`packages/` of its path, with `/` or `\` as separator: `packages/<name>/…` belongs to `<name>`, and
`packages/adapters/<name>/…` and `packages/analyzers/<name>/…` belong to `adapters/<name>` and
`analyzers/<name>`. Entries outside `packages/`, and the summary's own `total` entry, MUST NOT produce
a row. The table MUST have one row per package, sorted by package name, followed by a last row `Total`
over every assigned file. Each percentage MUST be the sum of `covered` divided by the sum of `total` of
the package's files for that metric, times 100, written with one decimal and ` %` (for example
`85.3 %`); a metric whose `total` sum is 0 MUST be written `n/a`, never `NaN` or `Infinity`.

The `Objetivo (líneas)` cell MUST show the coverage targets of `readme.md` §2.6 as information: for
`core`, `✓ 80 %` when its line percentage is at least 80 and `✗ 80 %` otherwise; for every
`analyzers/<name>`, `✓ 70 %` or `✗ 70 %` against 70; for every other package and for `Total`, `—`. A
target whose line metric is `n/a` MUST be shown with `✗`. The command MUST exit with code 0 whatever the
percentages are.

When the summary file does not exist, the command MUST write one line saying there is no coverage
report and naming the path, and exit with code 0. When the file exists but is not valid JSON or has no
object of file entries, it MUST write one line saying the coverage report is unreadable and naming the
path, and exit with code 0.

#### Scenario: The summary has one row per package

- **WHEN** the command reads a summary whose file entries lie under `packages/core/src/`,
  `packages/api/src/`, `packages/adapters/llm/src/` and `packages/analyzers/php/src/` (absolute paths,
  some with `\` separators), plus the `total` entry and one file outside `packages/`
- **THEN** the output holds the heading, the sentence and the table with the six columns, exactly one
  row for each of `adapters/llm`, `analyzers/php`, `api` and `core`, in that order, followed by `Total`;
  each percentage is the package's summed `covered` over summed `total` with one decimal; the file
  outside `packages/` is counted in no row
- **AND** the exit code is 0

#### Scenario: A package with nothing to measure shows n/a

- **WHEN** the summary holds a package whose files have a `total` of 0 for branches, and another whose
  files have a `total` of 0 for every metric
- **THEN** those cells read `n/a`, the output contains neither `NaN` nor `Infinity`, and the exit code
  is 0

#### Scenario: Coverage targets are marked, never enforced

- **WHEN** the summary gives `core` 79.9 % of lines and `analyzers/typescript` 70.0 % of lines, and
  `api` any value
- **THEN** the `Objetivo (líneas)` cell of `core` is `✗ 80 %`, that of `analyzers/typescript` is
  `✓ 70 %`, and that of `api` and of `Total` is `—`
- **AND** the exit code is 0

#### Scenario: A missing coverage report is reported, not failed

- **WHEN** the command is given a path that does not exist (for example because the tests failed before
  writing coverage)
- **THEN** it writes one line saying there is no coverage report, naming that path, writes no table, and
  exits with code 0

#### Scenario: An unreadable coverage report is reported, not failed

- **WHEN** the command is given a file that is not valid JSON, and then a file whose JSON is an array
- **THEN** each time it writes one line saying the coverage report is unreadable, naming the path, writes
  no table, and exits with code 0

### Requirement: Coverage informs and never blocks

Test coverage SHALL be collected with the V8 provider and SHALL never fail a local run or a CI run. The
Vitest configuration MUST set the coverage provider to `v8`, MUST NOT enable coverage unless it is
requested (`enabled` is not `true`), and MUST NOT declare coverage `thresholds`; the coverage summary
MUST be written as `json-summary` to `coverage/`, also when a test fails. The root `package.json` MUST
have the script `test:coverage` = `vitest run --coverage`.

In `.github/workflows/ci.yml`, the `quality` job MUST collect coverage in its existing test step, whose
command is `npx vitest run --coverage` (the suite runs once), and MUST have, right after it, a step
named `Coverage summary (informative)` that runs `node scripts/coverage-summary.mjs
coverage/coverage-summary.json` appending to `$GITHUB_STEP_SUMMARY`, with `continue-on-error: true` and
an `if` that holds `always()` together with the job's gate condition `steps.gate.outputs.run == 'true'`.
No other job of `ci.yml` and no step of `.github/workflows/frontend.yml` collects coverage.

#### Scenario: Coverage is off by default and has no thresholds

- **WHEN** a test imports `vitest.config.ts` and reads the root `package.json`
- **THEN** `test.coverage.provider` is `v8`, `test.coverage.enabled` is not `true`, `test.coverage` has
  no `thresholds`, its reporters include `json-summary`, its `reportsDirectory` is `coverage`, its
  `reportOnFailure` is `true`, and the script `test:coverage` is `vitest run --coverage`

#### Scenario: The CI publishes coverage without blocking

- **WHEN** a test parses `.github/workflows/ci.yml` as YAML
- **THEN** the `quality` job has a step whose command is `npx vitest run --coverage`, immediately followed
  by the step `Coverage summary (informative)` whose command runs `node scripts/coverage-summary.mjs
  coverage/coverage-summary.json` and appends to `$GITHUB_STEP_SUMMARY`, whose `continue-on-error` is
  `true` and whose `if` contains `always()` and `steps.gate.outputs.run == 'true'`
- **AND** no other step of `ci.yml` or of `frontend.yml` passes `--coverage`

### Requirement: Mutation score is the only hard gate

The mutation score SHALL remain the only test-quality gate that fails the pipeline. `stryker.config.json`
MUST keep `thresholds.break` at 70 or more (the `MIN_MUTATION_SCORE` of the project) and MUST mutate
`packages/core/src/**/*.ts`. The `mutation` job of `.github/workflows/ci.yml` and its step that runs
Stryker MUST NOT have `continue-on-error`.

#### Scenario: The mutation gate stays hard

- **WHEN** a test reads `stryker.config.json` and parses `.github/workflows/ci.yml` as YAML
- **THEN** `thresholds.break` is a number of at least 70, `mutate` contains `packages/core/src/**/*.ts`,
  the `mutation` job has no `continue-on-error`, and its step whose command runs `npm run test:mutation`
  has no `continue-on-error`
