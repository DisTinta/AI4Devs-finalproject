## Purpose

Lets a developer ask a question about one stored project from the command line, without HTTP, and
read the answer with each statement typed, its cited spans and the `stale` mark, or an honest
`UNKNOWN` with its reason.

## ADDED Requirements

### Requirement: Ask command arguments

The command SHALL be `ask <project> <question>`, with exactly two positional arguments and no
options besides `--help` (`-h`) and `--version` (`-V`), as the other `codemind` commands.
`--help`/`-h` and `--version`/`-V` SHALL print the help or the version to stdout, leave stderr
empty and exit with `0`, without reading the environment or opening a connection. The top-level
`codemind --help` SHALL list `ask` once. A missing argument, an extra argument or an unknown
option SHALL fail with `USAGE` and
exit `2`, with a message that names the kind of error and SHALL NOT quote any argument the user typed;
the argument parser SHALL NOT print an error text of its own. A question that starts with `-` MAY be passed
after `--`.

The question SHALL then be checked as `explain` checks it (1 to 1,000 code points, not only
whitespace) before the environment is read or a connection is opened; an invalid question SHALL fail
with `INVALID_EXPLAIN_REQUEST`, `details.field` = `question`, and exit `2`.

#### Scenario: Help and version print without reading the environment

- **GIVEN** `DATABASE_URL` and every `LLM_*` variable unset
- **WHEN** `ask --help` runs, then `ask -h`, then `ask --version`, then `ask -V`
- **THEN** each exits with `0`, prints the help or the version to stdout, leaves stderr empty, reads
  no environment variable and opens no connection

#### Scenario: Usage errors never quote the arguments

- **GIVEN** a valid configuration
- **WHEN** `ask acme-shop` runs (no question), then `ask acme-shop "q" extra`, then
  `ask acme-shop -SENTINEL-ask-7f3a`
- **THEN** each exits with `2`, stdout is empty, stderr holds exactly one line
  `{"error":{"code":"USAGE",…}}`, no connection is opened, and no stderr contains `SENTINEL-ask-7f3a`

#### Scenario: An invalid question is rejected before any connection

- **GIVEN** `DATABASE_URL` unset
- **WHEN** `ask acme-shop "   "` runs, then `ask acme-shop <1,001 code points>`
- **THEN** each exits with `2`, stdout is empty, stderr holds exactly one line with code
  `INVALID_EXPLAIN_REQUEST` and `details.field` = `question`, no connection is opened, and stderr
  does not contain the question

### Requirement: Ask configuration and connection

After the question check, the command SHALL read `DATABASE_URL`, trimmed: unset, empty or only
whitespace SHALL fail with `MISSING_CONFIG`, `details.variable` = `DATABASE_URL`. It SHALL then read
the `LLM_*` configuration (evaluation mode when neither `LLM_BASE_URL` nor `LLM_API_KEY` is set); an
invalid one SHALL fail with `LLM_CONFIG_INVALID`, `details.variable` naming the variable at fault (and
`details.modelVariable` when the configuration names it), never its value. Both checks SHALL happen
before any connection is opened. A live configuration with `DAILY_BUDGET_USD` SHALL apply the daily
spend ceiling to every model call, on the same clock as the rest of the run.

The command SHALL then open its own database connections, each write committing on its own (no
transaction held open while the model answers), check that the database accepts a connection, and
fail with `DATABASE_UNAVAILABLE` and the message `cannot connect to the database` when it does not.
Its sessions SHALL carry the `application_name` `codemind-ask` (unless `DATABASE_URL` sets its own),
so they can be observed. It SHALL close every connection before it returns, whatever happened; a
failure while closing SHALL NOT change the exit code or the output. No output SHALL contain the
database URL, its credentials or `LLM_API_KEY`.

#### Scenario: Configuration errors fail before any connection

- **GIVEN** `DATABASE_URL` unset, then `'   '`; then a valid `DATABASE_URL` and
  `LLM_BASE_URL=ftp://x`
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** the first two exit with `1` and `MISSING_CONFIG`, `details.variable` = `DATABASE_URL`; the
  third exits with `1` and `LLM_CONFIG_INVALID`, `details.variable` = `LLM_BASE_URL`, and stderr does
  not contain `ftp://x`; in each, stdout is empty, stderr holds exactly one error line and no
  connection is opened

#### Scenario: An unreachable database fails without leaking the URL

- **GIVEN** `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` and no `LLM_*` variable
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `1`, stdout is empty, stderr holds exactly one line with code
  `DATABASE_UNAVAILABLE` and message `cannot connect to the database`, and no output contains the
  URL, `s3cret` or `u:`

#### Scenario: The connections are closed after a run

- **GIVEN** a reachable database without a project named after a fresh unique name
- **WHEN** `ask` runs with that name and any valid question through the default connections
- **THEN** it exits with `1` and `PROJECT_NOT_FOUND`, and once it returns the database holds no session
  opened by the command

#### Scenario: A daily budget stops the model call

- **GIVEN** acme-shop stored, a live configuration with `DAILY_BUDGET_USD=1` and an `LLM_MODEL` that
  has a price, and a store whose spend since 00:00 UTC is `2` USD
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `1`, stdout is empty, stderr is one line with code `BUDGET_EXHAUSTED`,
  `details.spentUsd` = 2 and `details.dailyBudgetUsd` = 1, and the model is never called

#### Scenario: The API key never reaches an output

- **GIVEN** a valid `DATABASE_URL` and acme-shop stored; `LLM_API_KEY=SENTINEL-key-5d1e` with
  `LLM_BASE_URL=ftp://x`; then the same key with a valid live configuration (`LLM_BASE_URL` http,
  `LLM_MODEL` set) whose model fails with `LlmUnavailable('http-status', { status: 401 })`
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** the first exits with `1` and `LLM_CONFIG_INVALID`, the second with `1` and
  `LLM_UNAVAILABLE`; and no stdout or stderr of either contains `SENTINEL-key-5d1e`

### Requirement: Ask project resolution

`<project>` SHALL be a project name, matched against the stored projects by exact string equality:
no trimming and no case folding. A name that matches no project SHALL fail with `PROJECT_NOT_FOUND`
and exit `1`, before the model or the source is read; the message SHALL NOT contain the name. The
matched project's id SHALL be the one `explain` receives. A project id is not accepted in place of
the name. A relative `root_path` (the samples') SHALL resolve against the repository root of the
installation, not against the working directory.

#### Scenario: Only the exact name resolves the project

- **GIVEN** the acme-shop sample is stored
- **WHEN** `ask no-existe "q"` runs, then `ask ACME-SHOP "q"`, then `ask " acme-shop" "q"`, then
  `ask <the stored acme-shop project's id> "q"`
- **THEN** each exits with `1`, stdout is empty, stderr holds exactly one line with code
  `PROJECT_NOT_FOUND`, its message contains none of the names typed, and the model is never called

### Requirement: Ask answer output

The command SHALL call `explain` once with the resolved project id, the question and `explain`'s
default budget and hops. For an answered question it SHALL exit with `0` and print to stdout, in this
order and nothing else:

1. the answer, one output line per line of the answer; one trailing line break of the answer or of
   a statement text SHALL NOT produce an empty line, and inner empty lines SHALL be printed as empty
   lines;
2. an empty line and `statements:`, then each statement numbered from `1`, in the answer's order:
   `<n>. [<type>]` (`FACT` or `INFERENCE`), followed by ` [stale]` when its status is `stale`, a
   space and the first line of its text; each further line of the text indented by 3 spaces; the line
   `   warning: stale-evidence` when it carries that warning; and the line
   `   evidence: <path>:<startLine>-<endLine>` listing the spans of its evidence ids in citation
   order, separated by `, ` (an id absent from the answer's evidence is skipped, and a statement
   with no span left has no `evidence:` line);
3. an empty line and `evidence:`, then each distinct cited span (same file and lines counted once),
   in first-citation order: the line `<path>:<startLine>-<endLine>` followed by its excerpt, each
   excerpt line indented by 4 spaces; an excerpt of more than 5 lines SHALL show its first 5 lines
   and then the line `    … (+<k> lines)`, `k` being the lines left out; one trailing line break of
   an excerpt SHALL NOT count as a line; a `null` excerpt SHALL print the span line only;
4. only when there are prior claims: an empty line and `prior claims:`, then each prior claim
   numbered from `1`, newest first, as a statement is printed, with its displayed type (`FACT`,
   `INFERENCE` or `UNKNOWN`), `(no text)` in place of a `null` text, and its evidence spans;
5. only when the claims were not stored: an empty line and `note: claims not saved` as the last line.

An empty line inside a statement text, a prior-claim text or an excerpt SHALL be printed as an empty
line, without indentation.

Every event the answer carries SHALL be written to stderr as one JSON line `{"level":"info",…event}`;
with no events stderr SHALL stay empty. The command SHALL NOT print the question itself, and stderr
SHALL NOT contain it.

#### Scenario: A typed answer is printed with its evidence and stored

- **GIVEN** acme-shop seeded, a valid `DATABASE_URL`, and a live model that answers one statement
  citing only `anchor`/`exact` spans of `PriceCalculator.php` and one statement citing a `heuristic`
  span
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`; stdout starts with the model's answer and holds `1. [FACT] …` followed
  by `   evidence: app/Services/PriceCalculator.php:16-44`, and `2. [INFERENCE] …` followed by an
  `evidence:` line naming the cited heuristic span's own `<path>:<startLine>-<endLine>` (on acme-shop,
  `app/Http/Controllers/CheckoutController.php:19-33`), and the evidence section with each cited
  span's excerpt; stdout has no `prior claims:` section and no `note:` line; stderr is empty; and
  two new `claim` rows are stored

#### Scenario: Stale statements and prior claims are marked

- **GIVEN** an answer, stored, with one `INFERENCE` statement of status `stale` and warning
  `stale-evidence`, and two prior claims, one `stale` with warning `stale-evidence` and one `current`
  `FACT` with a `null` text
- **WHEN** `ask` prints it
- **THEN** it exits with `0`; the statement line starts with `1. [INFERENCE] [stale] ` and is
  followed by `   warning: stale-evidence`; the `prior claims:` section lists both, the first as
  `1. [INFERENCE] [stale] …` with its warning line and the second as `2. [FACT] (no text)` with no
  `[stale]` and no warning line

#### Scenario: An unsaved answer is printed with a closing note

- **GIVEN** a live model that answers one statement and a store whose claim write fails
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`; stdout prints the answer, its statements and evidence, and its last
  line is `note: claims not saved`, after the evidence and prior-claims sections; stderr is exactly
  `{"level":"info","type":"claims_not_persisted","code":"store-write-failed"}` and one line feed

#### Scenario: A span cited twice is listed once

- **GIVEN** an answer whose first statement cites span `B` then span `A`, and whose second statement
  cites span `A`
- **WHEN** `ask` prints it
- **THEN** the first statement's line is `   evidence: <B>, <A>` and the second's
  `   evidence: <A>`; the evidence section lists `B` then `A`, each exactly once

#### Scenario: Explain receives only the project id and the question

- **GIVEN** acme-shop stored and a recording `explain`
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** `explain` is called exactly once, with the request `{ projectId: <acme-shop's id>,
  question: "¿Cómo se calcula el precio final de un pedido?" }` and no `tokenBudget` or `hops`

### Requirement: Ask terminal safety

Every untrusted multi-line text printed to stdout (the answer, statement texts, prior-claim texts and
excerpts) SHALL be split into lines at each line feed (with an optional preceding carriage return);
in each line every tab SHALL be replaced by two spaces; and each resulting line SHALL then be
printed as it is when it is printable, or as its terminal-safe JSON string literal (quotes included,
the `projects` command's escaping) when it holds a control character (U+0000–U+001F, U+007F–U+009F)
or a bidirectional or line-separator character. A path is a single field: it SHALL be printed as it is
when it is printable, or as its escaped literal as a whole. An excerpt SHALL be cut to its 5 lines
before it is escaped. Besides the line feeds the format writes between lines, no control character
(U+0000–U+001F, U+007F–U+009F), bidirectional formatting character or line or paragraph separator
SHALL reach stdout raw; stderr lines are JSON with the same terminal-safe escaping.

#### Scenario: Control characters are escaped line by line

- **GIVEN** a live model whose answer is two paragraphs, the second holding `\u001b[2J`, and whose
  statement text holds `\u001b[2J`, citing a span whose path and excerpt hold `\u001b[2J`
- **WHEN** `ask` prints the answer
- **THEN** stdout holds no U+001B; the answer's first paragraph is printed as it is and its second as
  the escaped literal; the statement text, the path and the excerpt line holding the escape are
  printed as escaped literals; and the other excerpt lines are printed as they are, without quotes

#### Scenario: Excerpts are cut, tabs expanded and missing values shown

- **GIVEN** an answer citing a span whose excerpt has 8 clean lines ending with a line feed, a span
  whose excerpt has 2 lines starting with a tab, a span whose excerpt is `null`, and a prior claim with
  a `null` text
- **WHEN** `ask` prints it
- **THEN** the first excerpt prints its first 5 lines, unquoted, then `    … (+3 lines)`; the second
  prints both lines with the tab replaced by two spaces and no quotes; the third prints only its
  `<path>:<startLine>-<endLine>` line; and the prior claim prints `(no text)`

### Requirement: Ask UNKNOWN output

When `explain` answers `UNKNOWN`, the command SHALL exit with `0` and print to stdout exactly
`UNKNOWN (<reason>)` and, for `llm-required`, the line
`evaluation mode (cache-only): set LLM_* to enable free-form asks` (escaped as any other text);
nothing else, whatever other field the answer carries. Its events SHALL go
to stderr as in an answer. No claim SHALL be stored.

#### Scenario: Evaluation mode answers llm-required

- **GIVEN** acme-shop seeded and neither `LLM_BASE_URL` nor `LLM_API_KEY` set
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (llm-required)` and
  `evaluation mode (cache-only): set LLM_* to enable free-form asks`, each followed by a line feed,
  stderr is empty, the model is never called and no `claim` row is added

#### Scenario: A question without anchor answers no-anchor

- **GIVEN** acme-shop seeded and a live model
- **WHEN** `ask acme-shop "¿Dónde vive el ornitorrinco?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (no-anchor)` and a line feed, stderr is
  empty, the model is never called and no `claim` row is added

#### Scenario: A discarded model output answers invalid-model-output

- **GIVEN** acme-shop seeded and a live model whose output is not valid JSON and holds a sentinel
- **WHEN** `ask acme-shop "¿Cómo se calcula el precio final de un pedido?"` runs
- **THEN** it exits with `0`, stdout is exactly `UNKNOWN (invalid-model-output)` and a line feed,
  stderr is one line starting `{"level":"info","type":"schema_violation",` that does not contain the
  sentinel, and no `claim` row is added

### Requirement: Ask failures

On any failure stdout SHALL stay empty and stderr SHALL hold exactly one line,
`{"error":{"code","message","details"}}`, serialised with the terminal-safe escaping. The command
SHALL build every message itself and SHALL NOT copy the message of an error it does not know. Domain
failures SHALL keep their code and exit with `1`: `PROJECT_NOT_FOUND`, `SOURCE_UNAVAILABLE`
(`details.reason`, and `details.path` when the error names one), `LLM_UNAVAILABLE`
(`details.reason`, and the numeric or system-code details the error carries) and `BUDGET_EXHAUSTED`
(`details.spentUsd`, `details.dailyBudgetUsd`, `details.resetsAt` as ISO-8601). Any other failure,
including a database error after the connection check, SHALL be `INTERNAL`, exit `1`, with the
message `unexpected error`, which SHALL NOT claim that nothing was saved. The question SHALL NOT
appear in any error line. `details` SHALL always be present (`{}` when there
is none). The messages are fixed: `USAGE` `missing argument`, `too many arguments`, `unknown
option` or `invalid usage`; `INVALID_EXPLAIN_REQUEST` `invalid question`; `MISSING_CONFIG`
`DATABASE_URL is not set`; `LLM_CONFIG_INVALID` `<variable> is missing or invalid; see .env.example`,
or `<variable> is set but <modelVariable> has no price in COST_TABLE; see .env.example`;
`DATABASE_UNAVAILABLE` `cannot connect to the database`; `PROJECT_NOT_FOUND` `project not found`;
`SOURCE_UNAVAILABLE` `the project's source cannot be read`; `LLM_UNAVAILABLE` `the language model
is unavailable`; `BUDGET_EXHAUSTED` `the daily LLM budget is exhausted`; `INTERNAL` `unexpected
error`.

#### Scenario: Model, budget and source failures keep their code

- **GIVEN** acme-shop resolved, and `explain` failing with `LlmUnavailable('timeout')`, then
  `BudgetExhausted(2, 1, 2026-10-14T00:00:00.000Z)`, then `SourceUnavailable('missing', 'app/x.php')`
- **WHEN** `ask acme-shop` runs with a sentinel question
- **THEN** each exits with `1`, stdout is empty, and stderr is one line with code `LLM_UNAVAILABLE`
  and `details.reason` = `timeout`; `BUDGET_EXHAUSTED` with `details.spentUsd` = 2,
  `details.dailyBudgetUsd` = 1 and `details.resetsAt` = `2026-10-14T00:00:00.000Z`;
  `SOURCE_UNAVAILABLE` with `details.reason` = `missing` and `details.path` = `app/x.php`; and no
  stderr contains the sentinel

#### Scenario: An unexpected failure is internal and does not deny a write

- **GIVEN** acme-shop resolved and `explain` failing with an `Error` whose message holds the
  sentinel question
- **WHEN** `ask acme-shop` runs with that sentinel question
- **THEN** it exits with `1`, stdout is empty, stderr is one line with code `INTERNAL` and message
  `unexpected error`, it contains neither the sentinel nor `nothing was saved`, and every connection is
  closed
