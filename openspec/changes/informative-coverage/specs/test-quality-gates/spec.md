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
`core`, `✓ 80 %` when its unrounded line percentage is at least 80 and `✗ 80 %` otherwise; for every
`analyzers/<name>`, `✓ 70 %` or `✗ 70 %` when its unrounded line percentage is at least 70 or not; for
every other package and for `Total`, `—`. A target whose line metric is `n/a` MUST be shown with `✗`.
The command MUST exit with code 0 whatever the percentages are.

When reading the file fails with `ENOENT`, the command MUST write one line saying there is no coverage
report and naming the path, and exit with code 0. When reading fails with any other error, or the file
is not valid JSON, or its JSON is not an object, or a file entry under `packages/` lacks one of the four
metrics (`lines`, `statements`, `functions`, `branches`) or has a non-numeric `covered` or `total`, it
MUST write one line saying the coverage report is unreadable and naming the path, and exit with code 0.
A JSON object with no file entry under `packages/` MUST produce the heading, the sentence and a table
holding only the `Total` row, with `n/a` in every metric and `—` as target.

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
- **AND** with `core` at 79.96 % of lines, the `Líneas` cell of `core` is `80.0 %` and its target cell
  is `✗ 80 %`
- **AND** the exit code is 0

#### Scenario: A missing coverage report is reported, not failed

- **WHEN** the command is given a path that does not exist (for example because the tests failed before
  writing coverage)
- **THEN** it writes one line saying there is no coverage report, naming that path, writes no table, and
  exits with code 0
- **AND** called with no argument while `coverage/coverage-summary.json` does not exist, the notice names
  `coverage/coverage-summary.json`

#### Scenario: An unreadable coverage report is reported, not failed

- **WHEN** the command is given, one at a time, a file that is not valid JSON, a file whose JSON is an
  array, a summary whose `packages/core/src/a.ts` entry has no `branches`, a summary whose
  `packages/core/src/a.ts` entry has a non-numeric `lines.covered`, and a path whose read fails with
  `EISDIR`
- **THEN** each time it writes one line saying the coverage report is unreadable, naming the path, writes
  no table, and exits with code 0

#### Scenario: An empty summary shows only the Total row

- **WHEN** the command reads a summary that holds only the `total` entry and no file entry under
  `packages/`
- **THEN** the output holds the heading, the sentence and a table whose only row is `Total`, with `n/a`
  in each of its four metric cells and `—` as target
- **AND** the exit code is 0

### Requirement: Coverage informs and never blocks

Test coverage SHALL be collected with the V8 provider, and no coverage figure SHALL fail a local run or
a CI run. The Vitest configuration MUST set the coverage provider to `v8`, MUST NOT enable coverage
unless it is requested (`enabled` is not `true`), and MUST NOT declare coverage `thresholds`; the
coverage summary MUST be written as `json-summary` to `coverage/`, also when a test fails. The
wall-clock specs (`*.linear.spec.ts` and `*.scaling.spec.ts`, which measure time against fixed budgets)
MUST NOT run under coverage. The root `package.json` MUST have the script `test:coverage` =
`vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"`.

In `.github/workflows/ci.yml`, the `quality` job MUST collect coverage in its existing test step, whose
command is `npx vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"`
(the suite runs once), and MUST have, right after it, a step named `Coverage summary (informative)` that
runs `node scripts/coverage-summary.mjs coverage/coverage-summary.json` appending to
`$GITHUB_STEP_SUMMARY`, with `continue-on-error: true` and an `if` that holds `!cancelled()` together
with the job's gate condition `steps.gate.outputs.run == 'true'`. Right after that step, a step named
`Timing budgets`, with the `if` `steps.gate.outputs.run == 'true'`, MUST run without `--coverage` the
four wall-clock specs `tests/unit/index/secret-scanner.linear.spec.ts`,
`tests/unit/index/secret-scanner.scaling.spec.ts`, `tests/unit/explain/sanitize.linear.spec.ts` and
`tests/unit/explain/sanitize.scaling.spec.ts`. No other job of `ci.yml` and no step of
`.github/workflows/frontend.yml` collects coverage.

#### Scenario: Coverage is off by default and has no thresholds

- **WHEN** a test imports `vitest.config.ts` and reads the root `package.json`
- **THEN** `test.coverage.provider` is `v8`, `test.coverage.enabled` is not `true`, `test.coverage` has
  no `thresholds`, its reporters include `json-summary`, its `reportsDirectory` is `coverage`, its
  `reportOnFailure` is `true`, and the script `test:coverage` is
  `vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"`

#### Scenario: The CI publishes coverage without blocking

- **WHEN** a test parses `.github/workflows/ci.yml` as YAML
- **THEN** the `quality` job has a step whose command is
  `npx vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts"`,
  immediately followed by the step `Coverage summary (informative)` whose command runs
  `node scripts/coverage-summary.mjs coverage/coverage-summary.json` and appends to
  `$GITHUB_STEP_SUMMARY`, whose `continue-on-error` is `true` and whose `if` contains `!cancelled()` and
  `steps.gate.outputs.run == 'true'`
- **AND** that step is immediately followed by the step `Timing budgets`, whose `if` is
  `steps.gate.outputs.run == 'true'` and whose command does not contain `--coverage` and names each of
  the four wall-clock spec files
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

### Requirement: The testing guide states the pyramid and the policy

`docs/TESTING.md` SHALL describe the real test pyramid and the coverage policy. Its levels table MUST
have a row whose first cell is `Cobertura`, naming `npm run test:coverage` and `CI` → `quality`. It MUST
have a section `## Pirámide de tests` with one row per level (`Unitario`, `Integración`,
`Hooks del kit`, `Accesibilidad`, `Extremo a extremo`) giving its number of test files, plus the command
used to count them, the date (`YYYY-MM-DD`) and the short commit of the count. It MUST have a section
`## Cobertura` saying that coverage is informative and never fails the pipeline and that the mutation
score (`thresholds.break` of `stryker.config.json`) is the only gate.

#### Scenario: The testing guide documents the pyramid and the coverage policy

- **WHEN** a test reads `docs/TESTING.md`
- **THEN** the levels table has a row whose first cell is `Cobertura` and that contains
  `npm run test:coverage` and `quality`
- **AND** a `## Pirámide de tests` section lists the five levels, each with an integer file count, and
  contains a date matching `\d{4}-\d{2}-\d{2}` and a commit matching `[0-9a-f]{7,}`
- **AND** a `## Cobertura` section contains `stryker.config.json` and `no bloquea`
