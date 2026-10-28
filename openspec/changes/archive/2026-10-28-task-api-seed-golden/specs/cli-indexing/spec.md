## MODIFIED Requirements

### Requirement: Command line contract

The command SHALL be `index <path> --name <name> --language <language> [--framework <framework>]
[--json]`.

- `--name` and `--language` SHALL be required. A `--name` that is empty or only whitespace SHALL be
  a usage error (`USAGE`).
- `--language` SHALL accept only `php` and `typescript`. `php` SHALL index the repository with the PHP
  analyzer and `typescript` with the TypeScript analyzer (`code-analysis`), through the same indexing,
  store and report as `php`. Any other value SHALL be rejected with `UNSUPPORTED_LANGUAGE`, the message
  `<language>: not supported` and `details.allowed` = `["php","typescript"]`.
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

- **GIVEN** `--language cobol`, and then `--language TypeScript`, with every other argument valid
- **WHEN** the command runs
- **THEN** each run exits with `2` and writes `{"error":{"code":"UNSUPPORTED_LANGUAGE",…}}` to stderr
  with the message `cobol: not supported`, then `TypeScript: not supported`, and `details.allowed` =
  `["php","typescript"]`; no output contains `not available yet`; no database transaction is opened

#### Scenario: A TypeScript repository is indexed with the TypeScript analyzer

- **GIVEN** a copy of `fixtures/task-api` with its history rebuilt inside the allowed root `T`, a
  valid configuration and a transaction that is rolled back after the run
- **WHEN** the command runs `index task-api --name <unique> --language typescript`
- **THEN** it exits with `0`; the stored project has `language` `typescript` and `framework`
  `fastify`; its symbols include `function taskRoutes` and `class TaskService`; and every stored
  `calls` edge has `resolution` `exact` and `extractor` `ts-compiler`

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
| `UNSUPPORTED_LANGUAGE` | 2 | `<language>: not supported` (`details.allowed`) |
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
