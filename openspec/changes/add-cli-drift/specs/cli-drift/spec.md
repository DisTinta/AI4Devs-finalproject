## Purpose

Lets a developer ask, from the command line and without HTTP, which statements of a stored project's
documents its code contradicts, with the citations of both sides; in evaluation mode the command
serves the versioned golden drift report, so the functionality can be checked without a model key.

## ADDED Requirements

### Requirement: Drift command arguments

The command SHALL be `drift <project>`, with exactly one positional argument, the option
`--doc <path>`, and `--help` (`-h`) and `--version` (`-V`), as the other `codemind` commands.
`--help`/`-h` and `--version`/`-V` SHALL print the help or the version to stdout, leave stderr empty
and exit with `0`, without reading the environment or opening a connection. The top-level
`codemind --help` SHALL list `drift` once. A missing argument, an extra argument, an unknown option
or `--doc` without a value SHALL fail with `USAGE` and exit `2`, with a message that names the kind of
error and SHALL NOT quote any argument the user typed; the argument parser SHALL NOT print an error
text of its own.

The request SHALL then be checked as the drift use case checks it (`docPath`, when `--doc` is given,
of 1 to 1,000 code points without U+0000) before the environment is read or a connection is opened.
An invalid request SHALL fail with `INVALID_DRIFT_REQUEST`, the message `invalid drift request`,
`details.field` = `docPath`, and exit `2`.

#### Scenario: Drift help and version print without reading the environment

- **GIVEN** `DATABASE_URL` and every `LLM_*` variable unset
- **WHEN** `drift --help` runs, then `drift -h`, then `drift --version`, then `drift -V`
- **THEN** each exits with `0`, prints the help or the version to stdout, leaves stderr empty, reads
  no environment variable and opens no connection

#### Scenario: The global help lists drift once

- **GIVEN** `DATABASE_URL` and every `LLM_*` variable unset
- **WHEN** `codemind --help` runs through the CLI entry point
- **THEN** it exits with `0` and its stdout lists `drift <project>` exactly once

#### Scenario: Drift usage errors never quote the arguments

- **GIVEN** a valid configuration
- **WHEN** `drift` runs with no argument, then `drift acme-shop extra`, then
  `drift acme-shop -SENTINEL-drift-7e3a`, then `drift acme-shop --doc`
- **THEN** each exits with `2`, stdout is empty, stderr holds exactly one line
  `{"error":{"code":"USAGE",…}}`, no connection is opened, and no stderr contains
  `SENTINEL-drift-7e3a`

#### Scenario: An invalid drift document path is rejected before any connection

- **GIVEN** `DATABASE_URL` unset
- **WHEN** `drift acme-shop --doc ""` runs, then `drift acme-shop --doc` with a value of 1,001 code
  points that holds `SNTL`, then `drift acme-shop --doc` with the value `docs/SNTL\u0000.md`
- **THEN** each exits with `2` with `INVALID_DRIFT_REQUEST`, the message `invalid drift request` and
  `details.field` = `docPath`; stdout is empty, stderr holds exactly one line, no connection is opened,
  and no stderr contains `SNTL`

### Requirement: Drift configuration and connection

After the request check, the command SHALL read `DATABASE_URL`, trimmed: unset, empty or only
whitespace SHALL fail with `MISSING_CONFIG`, `details.variable` = `DATABASE_URL`, exit `1`, before any
connection is opened. It SHALL then read the model configuration as the `ask` command reads it (an
invalid one fails with `LLM_CONFIG_INVALID` and the same message and details as `ask`, exit `1`,
before any connection); no `LLM_*` variable means the evaluation mode. When the model is `live` and
`DAILY_BUDGET_USD` is set, the model SHALL be wrapped by the daily ceiling (`withDailyBudget`) over the
same store, so a run whose spend of the day already reached the ceiling fails with
`BUDGET_EXHAUSTED` before the model is called.

The command SHALL then open its own database connections, each write committing on its own, check
that the database accepts a connection, and fail with `DATABASE_UNAVAILABLE`, the message
`cannot connect to the database` and exit `1` when it does not. Its sessions SHALL carry the
`application_name` `codemind-drift` (unless `DATABASE_URL` sets its own). It SHALL close every
connection before it returns, whatever happened; a failure while closing SHALL NOT change the exit
code or the output. No output SHALL contain the database URL, its credentials or the API key.

#### Scenario: Drift configuration errors fail before any connection

- **GIVEN** `DATABASE_URL` unset; then `'   '`; then a valid `DATABASE_URL` with `LLM_BASE_URL=ftp://x`
- **WHEN** `drift acme-shop` runs
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `MISSING_CONFIG` and `details.variable` = `DATABASE_URL` for the first two and
  `LLM_CONFIG_INVALID` with `details.variable` = `LLM_BASE_URL` for the third, and no connection is
  opened

#### Scenario: An unreachable database fails without leaking the URL for drift

- **GIVEN** `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code
  `DATABASE_UNAVAILABLE` and message `cannot connect to the database`, and no output contains the
  URL, `s3cret` or `u:`

#### Scenario: The drift connections are closed after a run

- **GIVEN** a reachable database without a project named after a fresh unique name
- **WHEN** `drift` runs with that name through the default connections
- **THEN** it exits with `1` and `PROJECT_NOT_FOUND`, and once it returns the database holds no
  session whose `application_name` is `codemind-drift`

#### Scenario: A daily budget stops the drift model call

- **GIVEN** a store double holding acme-shop whose `query_log` spend of the day is `0.5`, a scripted
  `live` model priced in the cost table, `DAILY_BUDGET_USD=0.5` and `LLM_API_KEY=SENTINEL-key-5d2b`
- **WHEN** `drift acme-shop` runs with the real drift use case
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code
  `BUDGET_EXHAUSTED`, the model received no request, and no output contains `SENTINEL-key-5d2b`

### Requirement: Drift project resolution

`<project>` SHALL be a project name, matched against the stored projects by exact string equality:
no trimming and no case folding. A name that matches no project SHALL fail with `PROJECT_NOT_FOUND`
and exit `1`, before the drift use case is called; the message SHALL NOT contain the name. A project
id is not accepted in place of the name. The drift use case SHALL receive exactly the matched
project's id and, when `--doc` is given, its value as `docPath`, and no other field.

#### Scenario: Only the exact name resolves the drift project

- **GIVEN** a store holding acme-shop
- **WHEN** `drift no-existe` runs, then `drift ACME-SHOP`, then `drift " acme-shop"`, then
  `drift <the stored acme-shop project's id>`
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `PROJECT_NOT_FOUND`, its message contains none of the names typed, and the drift use case is never
  called

#### Scenario: Drift receives only the project id and the document path

- **GIVEN** a store holding acme-shop and a drift use case double
- **WHEN** `drift acme-shop` runs, and then `drift acme-shop --doc docs/pricing.md`
- **THEN** the double received `{ projectId: <acme-shop's id> }` and then
  `{ projectId: <acme-shop's id>, docPath: 'docs/pricing.md' }`, with a new verification cache each
  time and the repository root as the workspace root

### Requirement: Drift report output

For an answered report the command SHALL print to stdout, and exit with `0`, one block per document
entry in report order, the blocks separated by one empty line. A block SHALL start with the line
`<path>: <claimsChecked> claims checked, <omittedClaims> omitted, <droppedClaims> dropped,
<k> contradictions` (`<k>` the number of its contradictions), followed, for each contradiction
numbered from 1 within the document, by:

- `<i>. [INFERENCE] <first line of the statement>`, then each further line of the statement indented
  by 3 spaces;
- `   claim: <first line of the claim's text>`, then each further line indented by 3 spaces;
- `   doc: <claim path>:<startLine>-<endLine> (<claim verification>)`, then the lines of the claim's
  excerpt indented by 6 spaces;
- for each evidence in order, `   code: <path>:<startLine>-<endLine> (<verification>)`, then the lines
  of its excerpt indented by 6 spaces.

An excerpt SHALL be printed as `ask` prints one: at most its first 5 lines, then `… (+k lines)` when
`k` lines were left out. When the report's `cacheHit` is `true`, stdout SHALL end with an empty line
and the line `note: golden report (answer cache)`; otherwise it SHALL have no note. An empty line SHALL
be printed without indentation, and stdout SHALL end with one line feed. The command SHALL print
neither the usage nor the provenance.

#### Scenario: A drift report is printed by document with both citations

- **GIVEN** a store double holding acme-shop and a drift use case double that answers a report with
  `cacheHit` `false` and two documents: `README.md` with 2 claims checked and no contradiction, and
  `docs/pricing.md` with 3 claims checked, 1 omitted, 0 dropped and one contradiction whose statement
  is `El código aplica el descuento antes del impuesto`, whose claim is lines 11–17 with a 7-line
  excerpt and whose only evidence is `app/Services/PriceCalculator.php` lines 25–27, `entailed`, with
  a 3-line excerpt
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `0` and stdout is exactly: `README.md: 2 claims checked, 0 omitted, 0 dropped,
  0 contradictions`, an empty line, `docs/pricing.md: 3 claims checked, 1 omitted, 0 dropped,
  1 contradictions`, `1. [INFERENCE] El código aplica el descuento antes del impuesto`, the claim line,
  `   doc: docs/pricing.md:11-17 (cited)`, the first 5 excerpt lines indented by 6 spaces,
  `      … (+2 lines)`, `   code: app/Services/PriceCalculator.php:25-27 (entailed)` and its 3 excerpt
  lines indented by 6 spaces, with no note

#### Scenario: Q5 is printed from the golden report in evaluation mode

- **GIVEN** the versioned seed loaded with `loadSeed` in the harness transaction, the entry of the
  versioned `seeds/drift/acme-shop.json` saved under `drift:` through the real store on that
  transaction (as `db:seed` saves it), and no `LLM_*` variable (evaluation mode)
- **WHEN** `drift acme-shop` runs over a store on that transaction
- **THEN** it exits with `0`; stdout is the golden report of `seeds/drift/acme-shop.json` printed as
  above, one block per document of its response, and ends with the line
  `note: golden report (answer cache)`; no request reaches a model; the `hit_count` of acme-shop's
  `cache_entry` keyed `drift:` grew by 1; and `query_log` holds one more acme-shop row with
  `capability` `drift`, `question` `drift:`, `cache_hit` `true` and every token, cost and verification
  counter 0

#### Scenario: A live run over the indexed acme-shop prints the planted contradictions

- **GIVEN** acme-shop indexed in the database without any `cache_entry` row, and a scripted `live`
  model (the command's model seam) that reproduces case A of `fixtures/README.md` as in
  `drift-detection` → "Drift over the indexed acme-shop", with `DAILY_BUDGET_USD` set above the spend
  of the day
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `0`; the block of `docs/pricing.md` holds exactly two contradictions, the
  first with its `doc:` line inside lines 11–17 and the second with `doc: docs/pricing.md:31-31`;
  stdout has no note; and `query_log` holds one more acme-shop row with `capability` `drift`,
  `cache_hit` `false` and `input_tokens`, `output_tokens` and `cost_usd` equal to the totals the
  scripted model reported

### Requirement: Drift UNKNOWN output

When the drift use case answers `unknown`, the command SHALL print `UNKNOWN (<reason>)` to stdout and,
for the reason `llm-required` only, the line
`evaluation mode (cache-only): set LLM_* to enable drift` after it, each line ending with a line feed,
and exit with `0`.

#### Scenario: Evaluation mode without a golden report answers llm-required on the command line

- **GIVEN** task-api and acme-shop loaded from the versioned seed and golden files, and no `LLM_*`
  variable (evaluation mode)
- **WHEN** `drift task-api` runs, and then `drift acme-shop --doc docs/pricing.md`
- **THEN** each exits with `0`, stdout is exactly `UNKNOWN (llm-required)` and
  `evaluation mode (cache-only): set LLM_* to enable drift`, each followed by a line feed; stderr is
  empty; and `query_log` holds one more row of each project with `capability` `drift`, `cache_hit`
  `false` and every counter 0, with `question` `drift:` and `drift:docs/pricing.md` respectively

#### Scenario: A project without documents answers no-docs on the command line

- **GIVEN** a store double holding acme-shop and a drift use case double that answers
  `{ status: 'unknown', reason: 'no-docs' }`
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (no-docs)` and a line feed, and stderr is
  empty

### Requirement: Drift events and failures

After the report is printed, every event of an answered report SHALL be written to stderr as one JSON
line, rendered terminal-safe as the error line is (`toTerminalSafeJson`), with the event's fields and a `level` (`{"level":…,"type":…,…}`), in report order: `error` for a
`drift_check_event` whose inner event is `evidence_broken`, and `info` for every other event; the
events SHALL NOT change the exit code. On error stdout SHALL stay empty and stderr SHALL hold one
`{"error":{"code","message","details"}}` line, whose message is built by the command, never taken from
the error, and never holds the document path given or any text of a document: `ProjectNotFound` SHALL
be `PROJECT_NOT_FOUND`; `SourceUnavailable`, `LlmUnavailable` and `BudgetExhausted` SHALL keep their
code, with the message and details the `ask` command gives them; any other unexpected failure SHALL be
`INTERNAL`, message `unexpected error`; each with exit `1`.

#### Scenario: Drift events go to stderr with their level

- **GIVEN** a store double holding acme-shop and a drift use case double that answers an answered
  report whose events are a `drift_check_event` of `docs/pricing.md` claim 0 wrapping an
  `evidence_broken` event, then a `drift_doc_skipped` event of `README.md` with reason
  `invalid-model-output`, then `{ type: 'query_not_logged', code: 'store-write-failed' }`
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `0`, stdout holds the report, and stderr is exactly three lines: the first
  with `"level":"error"` and `"type":"drift_check_event"`, the second with `"level":"info"` and
  `"type":"drift_doc_skipped"`, and `{"level":"info","type":"query_not_logged","code":"store-write-failed"}`

#### Scenario: Model, budget and source failures keep their code on the command line

- **GIVEN** a store double holding acme-shop and a drift use case double that throws, one at a time,
  `LlmUnavailable` with reason `timeout`, `BudgetExhausted`, `SourceUnavailable` with reason
  `not-indexed`, and `ProjectNotFound`
- **WHEN** `drift acme-shop --doc docs/SENTINEL-doc-8f1e.md` runs
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `LLM_UNAVAILABLE` and `details.reason` `timeout`, then `BUDGET_EXHAUSTED`, then
  `SOURCE_UNAVAILABLE` with `details.reason` `not-indexed`, then `PROJECT_NOT_FOUND`; and no stderr
  contains `SENTINEL-doc-8f1e`

#### Scenario: An unexpected drift failure is internal

- **GIVEN** a store double holding acme-shop and a drift use case double that throws an `Error` whose
  message holds `SENTINEL-drift-2c9b`
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code `INTERNAL` and
  message `unexpected error`, and stderr does not contain `SENTINEL-drift-2c9b`

### Requirement: Drift terminal safety

Every text of a report that is printed (each path, statement, claim text and excerpt line) SHALL go
through the CLI's terminal-safe rendering, line by line, as `ask` prints its texts: tabs expanded to
two spaces and a line holding a control or terminal-unsafe character printed as its escaped literal,
so no output line holds a raw control character.

#### Scenario: Control characters in a drift report are escaped

- **GIVEN** a store double holding acme-shop and a drift use case double that answers a report whose
  document path is `docs/evil\u001b[2J.md`, whose contradiction statement holds `\u0007`, whose claim
  text holds `\u0008` and whose evidence excerpt holds `\u001b[31m` and a tab, and one
  `drift_doc_skipped` event of that path
- **WHEN** `drift acme-shop` runs
- **THEN** it exits with `0`; stdout holds no character U+0000 to U+001F other than the line feed, nor
  U+007F; and stderr holds no character U+0000 to U+001F other than the line feed, nor U+007F
