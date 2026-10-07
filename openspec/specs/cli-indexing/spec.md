# cli-indexing Specification

## Purpose

Lets a developer index a repository from the command line: the `index` command validates its
arguments and environment, runs the repository indexing inside one database transaction it owns,
shows progress and a report, logs every redaction, and turns every failure into a stable error code
and exit code without revealing secrets, real paths or database credentials.

## Requirements

### Requirement: Command line contract

The command SHALL be `index <path> --name <name> --language <language> [--framework <framework>]
[--json]`.

- `--name` and `--language` SHALL be required. A `--name` that is empty or only whitespace SHALL be
  a usage error (`USAGE`).
- `--language` SHALL accept only `php`. `typescript` SHALL be rejected with `UNSUPPORTED_LANGUAGE`
  and the message `typescript: not available yet (CM-HU-18)`; any other value SHALL be rejected with
  `UNSUPPORTED_LANGUAGE`. `details.allowed` SHALL be `["php"]`.
- `--framework`, when given, SHALL be one of `laravel`, `fastify`, `none`, and SHALL be passed to the
  indexing as an explicit framework that wins over detection; any other value SHALL be rejected with
  `UNSUPPORTED_FRAMEWORK` and `details.allowed` = `["laravel","fastify","none"]`.
- Every other argument error (missing option, unknown option, missing `<path>`) SHALL be `USAGE`.
- Usage errors (`USAGE`, `UNSUPPORTED_LANGUAGE`, `UNSUPPORTED_FRAMEWORK`) SHALL exit with `2`, SHALL
  be detected before any other check, and SHALL be reported only in the project error format: the
  argument parser SHALL NOT print text of its own.
- `--help` and `--version` SHALL print the help or the version to stdout and exit with `0`.

Arguments are checked in this order, and the first failure is reported: argument parsing, `--name`,
`--language`, `--framework`.

#### Scenario: Help and version exit with zero

- **GIVEN** the command with `--help`, and then with `--version`
- **WHEN** it runs
- **THEN** each run exits with `0`, prints the help or the version to stdout and writes no error

#### Scenario: An unsupported language is a usage error

- **GIVEN** `--language cobol`, and then `--language typescript`, with every other argument valid
- **WHEN** the command runs
- **THEN** each run exits with `2` and writes `{"error":{"code":"UNSUPPORTED_LANGUAGE",…}}` to stderr
  with `details.allowed` = `["php"]`; the `typescript` message is
  `typescript: not available yet (CM-HU-18)`; no database transaction is opened

#### Scenario: An unsupported framework is a usage error

- **GIVEN** `--framework symfony` with every other argument valid
- **WHEN** the command runs
- **THEN** it exits with `2` and writes `UNSUPPORTED_FRAMEWORK` with `details.allowed` =
  `["laravel","fastify","none"]`; no database transaction is opened

#### Scenario: A missing or blank name is a usage error

- **GIVEN** no `--name`, and then `--name '   '`, with every other argument valid
- **WHEN** the command runs
- **THEN** each run exits with `2` and writes `{"error":{"code":"USAGE",…}}` to stderr, stderr holds
  no text of the argument parser's own, and no database transaction is opened

### Requirement: Checks before any database connection

After the arguments, the command SHALL check, in this order and before opening any database
connection:

1. `ALLOWED_REPOS_DIR`, trimmed: unset, empty or only whitespace SHALL fail with
   `INDEXING_DISABLED` (message `indexing disabled (fixtures-only mode)`).
2. `<path>` resolved lexically against that root: outside it SHALL fail with `FORBIDDEN_PATH`, naming
   `<path>` as typed.
3. `AUTHOR_HASH_SALT` and then `DATABASE_URL`, trimmed: unset, empty or only whitespace SHALL fail
   with `MISSING_CONFIG` and `details.variable` naming the variable (never its value).

Each of these failures SHALL exit with `1`.

#### Scenario: Indexing is disabled before connecting without an allowed root

- **GIVEN** `ALLOWED_REPOS_DIR` unset, then `''`, then `'   '`, and valid arguments
- **WHEN** the command runs
- **THEN** each run exits with `1`, writes `INDEXING_DISABLED` with the message
  `indexing disabled (fixtures-only mode)`, and opens no database transaction

#### Scenario: A path outside the allowed root is rejected before connecting

- **GIVEN** `ALLOWED_REPOS_DIR=/repos` and the path `../etc`, then `/tmp/otro`
- **WHEN** the command runs
- **THEN** each run exits with `1`, writes `FORBIDDEN_PATH` whose message names the path as typed,
  and opens no database transaction

#### Scenario: Missing configuration fails before connecting

- **GIVEN** a valid allowed root and path, and `AUTHOR_HASH_SALT` empty or only whitespace; then a
  valid salt and `DATABASE_URL` empty or only whitespace
- **WHEN** the command runs
- **THEN** each run exits with `1`, writes `MISSING_CONFIG` with `details.variable` =
  `AUTHOR_HASH_SALT` or `DATABASE_URL` respectively, and opens no database transaction

### Requirement: The command owns one transaction

When every check passes, the command SHALL open one database transaction, run the repository
indexing with the store bound to it, and then:

- commit it when the indexing returns a report;
- roll it back when the indexing or anything after opening fails, so nothing of a failed indexing is
  saved;
- always release the connection, whatever happened.

When the commit itself fails, or anything fails after a successful commit, the command cannot tell
whether the project was saved: it SHALL report `INTERNAL` with the message
`unexpected error; the project may have been saved`, never `nothing was saved`. A failure to
release the connection is the exception: it SHALL be ignored, since the outcome is already decided
and reporting it would hide the real one (after a commit, the report is still printed and the exit
is `0`; after a failure, that failure is reported).

A failure to connect SHALL be `DATABASE_UNAVAILABLE` (exit `1`) and its output SHALL NOT contain the
database URL, its user or its password. Failures detected by the indexing itself — including an
allowed root that is not blank but does not exist (`INDEXING_DISABLED`) and a symbolic link escaping
the root (`FORBIDDEN_PATH`) — SHALL be reported with their codes after rolling back.

#### Scenario: A successful indexing commits and releases

- **GIVEN** fake ports whose indexing succeeds and a fake transaction that records its calls
- **WHEN** the command runs
- **THEN** it exits with `0` and the transaction records `commit` then `release`, never `rollback`

#### Scenario: A failed indexing rolls back and releases

- **GIVEN** fake ports whose analysis throws, and a fake transaction that records its calls
- **WHEN** the command runs
- **THEN** it exits with `1` and the transaction records `rollback` then `release`, never `commit`

#### Scenario: A failure while or after committing says the project may have been saved

- **GIVEN** fake ports whose indexing succeeds and a fake transaction whose commit throws; then a
  fake transaction that commits and a stdout that throws when written
- **WHEN** the command runs
- **THEN** each run exits with `1` and writes `INTERNAL` with the message
  `unexpected error; the project may have been saved`, and the transaction records `release`

#### Scenario: A failed release after a commit is ignored

- **GIVEN** fake ports whose indexing succeeds and a fake transaction that commits and whose release
  throws
- **WHEN** the command runs
- **THEN** it exits with `0`, stdout holds the report, and stderr holds no `{"error":…}` line

#### Scenario: A taken name rolls back and keeps the first project

- **GIVEN** a copy of acme-shop with its history inside the allowed root `T`, and a transaction
  factory that opens a savepoint on the test's database client (commit releases it, rollback rolls
  back to it)
- **WHEN** the command indexes it with `--name x` (exit `0`) and then again with `--name x`
- **THEN** the second run exits with `1` and `PROJECT_NAME_TAKEN`, rolls back to the savepoint, and on
  the same client exactly one project is named `x` and the first project can still be read

#### Scenario: An allowed root that does not exist is detected inside the transaction

- **GIVEN** `ALLOWED_REPOS_DIR` set to a directory of `T` that does not exist, and the path
  `acme-shop`
- **WHEN** the command runs
- **THEN** the pre-check passes, a transaction is opened, and the run exits with `1` and
  `INDEXING_DISABLED` after rolling it back

#### Scenario: An unreachable database is reported without its URL

- **GIVEN** valid arguments and environment and `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`
  (closed port), with the default transaction factory
- **WHEN** the command runs
- **THEN** it exits with `1` and `DATABASE_UNAVAILABLE`, and neither stdout nor stderr contains the
  URL, `s3cret` or `u:`

### Requirement: Output streams and report

- stdout SHALL carry only the result: on success, the report as text, or with `--json` exactly one
  JSON document holding every field of the index report. On any error stdout SHALL be empty, with or
  without `--json`.
- stderr SHALL carry the progress, one line per indexing phase when it starts, as `[n/6] <phase>` in
  the order `confine`, `read`, `redact`, `analyze`, `history`, `save`; the structured log; and the
  error.
- The text report SHALL show the project id, the indexed commit, the framework with whether it was
  `detected` or `explicit`, the numbers of files, symbols and commits, the edges as
  `total / exact / heuristic`, and the number and entries of `skipped` and `diagnostics`.
- Exit codes SHALL be `0` on success, `1` on a domain, configuration or runtime error, `2` on a usage
  error.

#### Scenario: acme-shop is indexed and its report printed

- **GIVEN** a copy of `fixtures/acme-shop` with its history inside the allowed root `T`,
  `AUTHOR_HASH_SALT=test-salt` and the savepoint transaction factory on the test's database client
- **WHEN** the command runs `index acme-shop --name <unique> --language php`
- **THEN** it exits with `0`; stderr holds the six phase lines in order; stdout shows the project id,
  `indexedCommit` equal to `git rev-parse HEAD` of the copy, `laravel (detected)`, the files, symbols,
  commits and edges `total / exact / heuristic` of the report; stderr holds the line
  `{"level":"info","event":"secret_redacted","source":"file","file":"config/services.php","line":21,…,"rule":"aws-access-key-id"}`;
  the number of stderr lines with `"source":"commit"` equals the number of commit redaction events of
  the report; and neither stdout nor stderr matches `/AKIA[A-Z0-9]{16}/`

#### Scenario: An explicit framework wins and --json prints the full report

- **GIVEN** the same environment
- **WHEN** the command runs with `--framework none --json`
- **THEN** it exits with `0`; stdout is exactly one JSON document that parses, with
  `framework: "none"`, `frameworkSource: "explicit"` and every field of the index report; and the
  stored project's framework is `none`

#### Scenario: On error stdout stays empty

- **GIVEN** `ALLOWED_REPOS_DIR` empty and `--json`
- **WHEN** the command runs
- **THEN** it exits with `1`, stdout is `''`, and the error appears only on stderr

### Requirement: Structured log of redactions and failures

The command SHALL write one JSON object per line to stderr:

- one `{"level":"info","event":"secret_redacted","source":"file","file","line","column","rule"}` per
  redaction event of a file;
- one `{"level":"info","event":"secret_redacted","source":"commit","commit","line","column","rule"}`
  per redaction event of a commit message;
- on any failure, one `{"level":"error","event":"index_failed","code","exit"}` line besides the
  error line.

The redaction lines describe what was stored redacted, so they SHALL be written only after the
transaction commits; a failed indexing writes none. No log line SHALL contain the redacted value.

#### Scenario: Every redaction is logged without the secret

- **GIVEN** fake ports where one file and one commit message hold a synthetic AWS access key id built
  by concatenation in the test
- **WHEN** the command runs and succeeds
- **THEN** stderr holds exactly one `secret_redacted` line with `"source":"file"` naming that file and
  exactly one with `"source":"commit"` naming that commit, each with `line`, `column` and
  `"rule":"aws-access-key-id"`, and no line of stdout or stderr contains the key

#### Scenario: A failure is logged with its code and exit

- **GIVEN** `ALLOWED_REPOS_DIR` empty
- **WHEN** the command runs
- **THEN** stderr holds `{"level":"error","event":"index_failed","code":"INDEXING_DISABLED","exit":1}`
  besides the `{"error":{…}}` line

#### Scenario: A failed indexing logs no redaction

- **GIVEN** fake ports where one file holds a synthetic AWS access key id built by concatenation in
  the test, and a store whose project creation fails with `PROJECT_NAME_TAKEN`
- **WHEN** the command runs
- **THEN** it exits with `1`, stderr holds no `secret_redacted` line, and no line of stdout or stderr
  contains the key

### Requirement: Errors in the project format without real paths

Every failure SHALL be written to stderr as one line `{"error":{"code","message","details"}}` with a
stable code. The message SHALL be built from the code and the path or name **as typed**; it SHALL
NOT contain the resolved real path of the repository or of the allowed root, the database URL or any
credential. The codes and exits SHALL be:

| code | exit | message |
|---|---|---|
| `INDEXING_DISABLED` | 1 | `indexing disabled (fixtures-only mode)` |
| `FORBIDDEN_PATH` | 1 | `"<path>" is outside the allowed repositories directory` |
| `NOT_A_GIT_REPOSITORY` | 1 | `"<path>" is not the root of a git repository` |
| `EMPTY_REPOSITORY` | 1 | `"<path>" has no commits` |
| `INVALID_GRAPH` | 1 | `the analysis produced an invalid graph; nothing was saved` (`details.violations`) |
| `PROJECT_NAME_TAKEN` | 1 | `project name "<name>" is already taken` |
| `MISSING_CONFIG` | 1 | `<VARIABLE> is not set` (`details.variable`) |
| `DATABASE_UNAVAILABLE` | 1 | `cannot connect to the database` |
| `INTERNAL` | 1 | `unexpected error; nothing was saved`, or `unexpected error; the project may have been saved` when the commit or anything after it fails |
| `USAGE` | 2 | the reason of the usage error |
| `UNSUPPORTED_LANGUAGE` | 2 | `<language>: not supported`, or `typescript: not available yet (CM-HU-18)` (`details.allowed`) |
| `UNSUPPORTED_FRAMEWORK` | 2 | `<framework>: not supported` (`details.allowed`) |

`<path>` and `<name>` SHALL be written as JSON string literals. Any error that is not one of the
domain errors above SHALL be `INTERNAL`, whose message SHALL NOT include the original error's text.

#### Scenario: A directory that is not a repository is reported by the path as typed

- **GIVEN** `no-repo`, a directory inside the allowed root `T` without `.git`
- **WHEN** the command indexes `no-repo`
- **THEN** it exits with `1` and `NOT_A_GIT_REPOSITORY`, the message names `"no-repo"`, and neither
  stdout nor stderr contains the real path of `T`

#### Scenario: A repository without commits is reported by the path as typed

- **GIVEN** `vacio`, a directory inside `T` where `git init` ran and nothing was committed
- **WHEN** the command indexes `vacio`
- **THEN** it exits with `1` and `EMPTY_REPOSITORY`, the message names `"vacio"`, and neither stdout
  nor stderr contains the real path of `T`

#### Scenario: An unexpected error is reported as INTERNAL

- **GIVEN** fake ports whose history read throws a plain `Error` whose message holds an absolute path
- **WHEN** the command runs
- **THEN** it exits with `1` and `INTERNAL` with the message `unexpected error; nothing was saved`,
  and that absolute path appears on neither stdout nor stderr

### Requirement: Untrusted strings are printed escaped

Analyzer diagnostics, skipped paths, the file paths of redaction events and the messages of graph
violations come from the analysed repository and are untrusted. No control character — C0
(`\u0000`–`\u001f`, including newlines and ESC), DEL (`\u007f`) or C1 (`\u0080`–`\u009f`) — SHALL
reach stdout or stderr raw, in any output:

- the text report SHALL print each diagnostic message and each skipped path as a JSON string
  literal, so quotes are escaped and controls appear as `\uXXXX` or `\n`;
- the `--json` report, every log line and the `{"error":…}` line SHALL be JSON whose strings escape
  those controls the same way, so they still parse to the original values.

#### Scenario: Diagnostics and skipped paths are escaped

- **GIVEN** a report with the diagnostic `duplicate path "a\"b\u001b[31m.php"; kept the first` and
  skipped entries with paths `x\ny.php` and `c\u009b2Jd.php` (a C1 control, the one-byte CSI)
- **WHEN** it is rendered as text
- **THEN** the output contains no ESC character (`\u001b`), no C1 control character
  (`\u0080`–`\u009f`) and no newline inside an entry, and each message and path appears as a quoted,
  escaped literal (quotes as `\"`, controls as `\uXXXX` or `\n`)

#### Scenario: Control characters are escaped in the log, the JSON report and the error

- **GIVEN** fake ports where a file named `k\u009b2J.php` (core keeps a path with C1) holds a
  synthetic AWS access key id,
  a skipped path is `s\u009b.php` and the analyzer reports a diagnostic `bad\u009b`; then an analyzer
  that adds a file `g\u009b.php` that is not in the source tree, so the graph is invalid
- **WHEN** the command runs with `--json`, and then the second case without it
- **THEN** neither stdout nor stderr of either run contains a raw DEL or C1 character; the
  `secret_redacted` line parses to `file` = `k\u009b2J.php`; the JSON report parses to the
  skipped path `s\u009b.php` and the diagnostic `bad\u009b`; and the `INVALID_GRAPH` error line parses
  to a violation whose message holds `g\u009b.php`
