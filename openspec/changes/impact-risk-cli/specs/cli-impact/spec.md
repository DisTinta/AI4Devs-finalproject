## Purpose

Lets a developer ask, from the command line and without HTTP, what depends on a change to one stored
project, which tests cover it and how risky it is, from the deterministic graph only, with every
entry marked as coming from the graph.

## ADDED Requirements

### Requirement: Impact command arguments

The command SHALL be `impact <project> <change>`, with exactly two positional arguments, the option
`--max-hops <n>`, and `--help` (`-h`) and `--version` (`-V`), as the other `codemind` commands.
`--help`/`-h` and `--version`/`-V` SHALL print the help or the version to stdout, leave stderr empty
and exit with `0`, without reading the environment or opening a connection. The top-level
`codemind --help` SHALL list `impact` once. A missing argument, an extra argument, an unknown option
or `--max-hops` without a value SHALL fail with `USAGE` and exit `2`, with a message that names the
kind of error and SHALL NOT quote any argument the user typed; the argument parser SHALL NOT print
an error text of its own. A change that starts with `-` MAY be passed after `--`.

The request SHALL then be checked as the impact use case checks it (`change` of 5 to 500 code points,
not only whitespace, no U+0000; `maxHops` an integer from 1 to 3, 2 when the option is absent)
before the environment is read or a connection is opened. A `--max-hops` value that is not written
only with the digits 0 to 9 SHALL count as an invalid `maxHops`. An invalid request SHALL fail with
`INVALID_IMPACT_REQUEST`, `details.field` naming the field (`change` or `maxHops`), and exit `2`.

#### Scenario: Impact help and version print without reading the environment

- **GIVEN** `DATABASE_URL` and every `LLM_*` variable unset
- **WHEN** `impact --help` runs, then `impact -h`, then `impact --version`, then `impact -V`
- **THEN** each exits with `0`, prints the help or the version to stdout, leaves stderr empty, reads
  no environment variable and opens no connection

#### Scenario: Impact usage errors never quote the arguments

- **GIVEN** a valid configuration
- **WHEN** `impact acme-shop` runs (no change), then `impact acme-shop "cambiar algo" extra`, then
  `impact acme-shop -SENTINEL-impact-4b2c`, then `impact acme-shop "cambiar algo" --max-hops`
- **THEN** each exits with `2`, stdout is empty, stderr holds exactly one line
  `{"error":{"code":"USAGE",…}}`, no connection is opened, and no stderr contains
  `SENTINEL-impact-4b2c`

#### Scenario: An invalid impact request is rejected before any connection

- **GIVEN** `DATABASE_URL` unset
- **WHEN** `impact acme-shop "cambiar algo" --max-hops 4` runs, then `--max-hops 0`, then
  `--max-hops 2.5`, then `--max-hops x`, then `impact acme-shop "SNTL"` (4 code points), then
  `impact acme-shop "   "`
- **THEN** the first four exit with `2` and `INVALID_IMPACT_REQUEST`, `details.field` = `maxHops`; the
  last two exit with `2` and `INVALID_IMPACT_REQUEST`, `details.field` = `change`; in each, stdout is
  empty, stderr holds exactly one line, no connection is opened, and no stderr contains `SNTL`

### Requirement: Impact configuration and connection

After the request check, the command SHALL read `DATABASE_URL`, trimmed: unset, empty or only
whitespace SHALL fail with `MISSING_CONFIG`, `details.variable` = `DATABASE_URL`, exit `1`, before any
connection is opened. The command SHALL NOT read any `LLM_*` variable nor `DAILY_BUDGET_USD`: it calls
no model.

The command SHALL then open its own database connections, each write committing on its own, check
that the database accepts a connection, and fail with `DATABASE_UNAVAILABLE`, the message
`cannot connect to the database` and exit `1` when it does not. Its sessions SHALL carry the
`application_name` `codemind-impact` (unless `DATABASE_URL` sets its own). It SHALL close every
connection before it returns, whatever happened; a failure while closing SHALL NOT change the exit
code or the output. No output SHALL contain the database URL or its credentials.

#### Scenario: A missing database URL fails before any connection

- **GIVEN** `DATABASE_URL` unset, then `'   '`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `MISSING_CONFIG` and `details.variable` = `DATABASE_URL`, and no connection is opened

#### Scenario: The model configuration is not read

- **GIVEN** a valid `DATABASE_URL`, a store double holding acme-shop, and `LLM_BASE_URL=ftp://x`
  with `LLM_API_KEY=SENTINEL-key-9a1f`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0` and no stdout or stderr contains `ftp://x` or `SENTINEL-key-9a1f`

#### Scenario: An unreachable database fails without leaking the URL for impact

- **GIVEN** `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code
  `DATABASE_UNAVAILABLE` and message `cannot connect to the database`, and no output contains the
  URL, `s3cret` or `u:`

#### Scenario: The impact connections are closed after a run

- **GIVEN** a reachable database without a project named after a fresh unique name
- **WHEN** `impact` runs with that name and a valid change through the default connections
- **THEN** it exits with `1` and `PROJECT_NOT_FOUND`, and once it returns the database holds no
  session whose `application_name` is `codemind-impact`

### Requirement: Impact project resolution

`<project>` SHALL be a project name, matched against the stored projects by exact string equality:
no trimming and no case folding. A name that matches no project SHALL fail with `PROJECT_NOT_FOUND`
and exit `1`, before the impact use case is called; the message SHALL NOT contain the name. A project
id is not accepted in place of the name. The matched project's id SHALL be the one the impact use
case receives.

#### Scenario: Only the exact name resolves the impact project

- **GIVEN** a store holding acme-shop
- **WHEN** `impact no-existe "cambiar algo"` runs, then `impact ACME-SHOP "cambiar algo"`, then
  `impact " acme-shop" "cambiar algo"`, then `impact <the stored acme-shop project's id> "cambiar algo"`
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `PROJECT_NOT_FOUND`, its message contains none of the names typed, and the impact use case is never
  called

### Requirement: Impact report output

The command SHALL call the impact use case once, with exactly the resolved project id, the change as
typed and, only when `--max-hops` was given, its value as `maxHops`. For an answered report it SHALL
exit with `0` and print to stdout, in this order and nothing else:

1. `DIRECTO`, then one line per entry of `direct`, in the report's order;
2. an empty line, `INDIRECTO`, then one line per entry of `indirect`, in the report's order;
3. an empty line, `TESTS`, then one line per entry of `tests`, in the report's order;
4. an empty line, `RIESGO <level>` (`HIGH`, `MEDIUM` or `LOW`, as the report gives it), then the
   rationale on its own line.

A list without entries SHALL print the single line `  (ninguno)`. An entry of `direct` or
`indirect` SHALL be printed as `  <symbol>  <file>  <hops> <saltos>  <resolution>  [grafo]`, where
`<saltos>` is `salto` when `hops` is 1 and `saltos` otherwise; when `symbol` equals `file` (a file
component), `<symbol>  ` SHALL be left out, so the path is printed once. An entry of `tests` SHALL be
printed as `  <symbol>  <file>  [grafo]`, with the same rule for a file component. The output SHALL
end with a line feed. The command SHALL not print the change.

#### Scenario: An impact report is printed by section with its risk

- **GIVEN** a store double holding acme-shop, and an impact use case double that answers a report
  whose `direct` is `DiscountService` (`app/Services/DiscountService.php`, `hops` 0, `exact`) and the
  file component `app/Providers/AppServiceProvider.php` (`hops` 1, `exact`), whose `indirect` is
  empty, whose `tests` is `DiscountServiceTest` (`tests/Unit/DiscountServiceTest.php`), and whose
  `risk` is `HIGH` with the rationale `2 ficheros afectados, 1 test que cubre el cambio, 1 elemento
  directo sin test, 0 elementos directos con cadena solo heurística.`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0`, stderr is empty, and stdout is exactly the lines `DIRECTO`,
  `  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]`,
  `  app/Providers/AppServiceProvider.php  1 salto  exact  [grafo]`, an empty line, `INDIRECTO`,
  `  (ninguno)`, an empty line, `TESTS`,
  `  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]`, an empty line,
  `RIESGO HIGH` and the rationale, each ended by a line feed

#### Scenario: Impact receives only the project id, the change and the hop count

- **GIVEN** a store double holding acme-shop and an impact use case double that records its request
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs, then the same with
  `--max-hops 3`
- **THEN** the first request is exactly `{ projectId: <acme-shop's id>, change: 'cambiar los
  descuentos de DiscountService' }` and the second the same with `maxHops: 3`

#### Scenario: Q2 over the seed is printed with its risk

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into the database
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0`, stderr is empty, and stdout holds the line
  `  DiscountService  app/Services/DiscountService.php  0 saltos  exact  [grafo]`, the line
  `  PriceCalculator  app/Services/PriceCalculator.php  1 salto  exact  [grafo]`, under `INDIRECTO`
  the line
  `  CheckoutController  app/Http/Controllers/CheckoutController.php  2 saltos  heuristic  [grafo]`,
  under `TESTS` the line `  DiscountServiceTest  tests/Unit/DiscountServiceTest.php  [grafo]`, and
  the line `RIESGO HIGH` followed by the rationale of the scenario "Q2 over the seed is high risk" of
  the `impact` capability
- **AND** the `query_log` table holds one more row of acme-shop with `capability` `impact`

### Requirement: Impact UNKNOWN output

When the impact use case answers `unknown`, the command SHALL print `UNKNOWN (<reason>)` and a line
feed to stdout, and exit with `0`.

#### Scenario: A change without anchor answers no-anchor on the command line

- **GIVEN** acme-shop loaded from `seeds/graph-dump.sql` into the database
- **WHEN** `impact acme-shop "cómo se gestionan los reembolsos"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (no-anchor)` and a line feed, and stderr is
  empty

### Requirement: Impact events and failures

Every event of the report SHALL be written to stderr as one JSON line at level `info`, with the
event's fields (`{"level":"info","type":"query_not_logged","code":…}`), after the report was printed
and without changing the exit code. On error stdout SHALL stay empty and stderr SHALL hold one
`{"error":{"code","message","details"}}` line, whose message is built by the command, never taken from
the error, and never holds the change: `ProjectNotFound` from the use case SHALL be
`PROJECT_NOT_FOUND`, exit `1`; any other unexpected failure SHALL be `INTERNAL`, message
`unexpected error`, exit `1`.

#### Scenario: A row that was not logged is reported on stderr

- **GIVEN** a store double holding acme-shop and an impact use case double that answers an answered
  report with `events: [{ type: 'query_not_logged', code: 'store-write-failed' }]`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0`, stdout holds the report, and stderr is exactly the line
  `{"level":"info","type":"query_not_logged","code":"store-write-failed"}`

#### Scenario: An unexpected impact failure is internal

- **GIVEN** a store double holding acme-shop and an impact use case double that throws an `Error`
  whose message holds `SENTINEL-change-1c8d`
- **WHEN** `impact acme-shop "cambiar SENTINEL-change-1c8d"` runs
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code `INTERNAL` and
  message `unexpected error`, and stderr does not contain `SENTINEL-change-1c8d`

#### Scenario: A project removed during the run is not found

- **GIVEN** a store double holding acme-shop and an impact use case double that throws
  `ProjectNotFound`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `1`, stdout is empty and stderr holds exactly one line with code
  `PROJECT_NOT_FOUND`

### Requirement: Impact terminal safety

Every `symbol` and `file` printed SHALL go through the CLI's terminal-safe rendering: a value with a
control or terminal-unsafe character SHALL be printed as its escaped literal, so no output line of the
report holds a raw control character.

#### Scenario: Control characters in a report are escaped

- **GIVEN** a store double holding acme-shop and an impact use case double that answers a report whose
  only `direct` entry has the `symbol` `Evil\u001b[31m` and the `file` `src/evil\u0007.ts`
- **WHEN** `impact acme-shop "cambiar los descuentos de DiscountService"` runs
- **THEN** it exits with `0` and stdout holds no character U+0000 to U+001F other than the line feed,
  nor U+007F
