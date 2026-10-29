## MODIFIED Requirements

### Requirement: Configuration from the environment

The API SHALL read its configuration once, at start-up, from these variables, then the LLM variables
and the indexing variables below, each trimmed; a
variable that is unset or empty after trimming takes its default:

| Variable | Rule | Default |
|---|---|---|
| `DATABASE_URL` | required, non-empty | — |
| `PORT` | decimal digits only, 1–65 535 | `3000` |
| `HOST` | any non-empty string | `127.0.0.1` |
| `RATE_LIMIT_MAX` | decimal digits only, 1–1 000 000 | `30` |
| `RATE_LIMIT_WINDOW_MS` | decimal digits only, 1–86 400 000 | `60000` |

It SHALL check them in that order and fail on the first invalid one with an error whose `code` is
`INVALID_CONFIG` (one code for missing and invalid, as `LLM_CONFIG_INVALID` does), whose `variable`
names it and whose message is `<VARIABLE> is missing or invalid; see .env.example`, never holding its
value; the start-up line carries that name as `details.variable` (requirement "Start-up failure"). It
SHALL then read the LLM configuration (`LLM_*`, `DAILY_BUDGET_USD`) with the rules of the
`llm-adapter` capability, failing with `LLM_CONFIG_INVALID`. Every check SHALL happen before any
connection is opened.

It SHALL also read the two indexing variables, each trimmed, which are **optional** and SHALL never
fail start-up: `ALLOWED_REPOS_DIR` (the allowed repositories root) and `AUTHOR_HASH_SALT` (the salt of
the author hashes of the history). When either is unset or empty after trimming, indexing is disabled
(requirement "Composition from the environment"). A relative `ALLOWED_REPOS_DIR` is resolved against
the process working directory, as the CLI does.

#### Scenario: Defaults apply to unset and empty variables

- **GIVEN** an environment with only `DATABASE_URL` set, then the same with `PORT`, `HOST`,
  `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` set to `'  '`
- **WHEN** the configuration is read
- **THEN** both give port 3000, host `127.0.0.1`, a limit of 30 and a window of 60 000 ms

#### Scenario: An invalid variable fails with its name and without its value

- **GIVEN** an otherwise valid environment with, in turn, `DATABASE_URL` unset, `DATABASE_URL` = `'  '`,
  `PORT` = `70000`, `PORT` = `0`, `PORT` = `3e3`, `RATE_LIMIT_MAX` = `0`, `RATE_LIMIT_MAX` = `abc`,
  `RATE_LIMIT_MAX` = `1000001`, `RATE_LIMIT_WINDOW_MS` = `0`, `RATE_LIMIT_WINDOW_MS` = `1m`,
  `RATE_LIMIT_WINDOW_MS` = `86400001`
- **WHEN** the configuration is read
- **THEN** each fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is that
  variable, and its message does not contain the value

#### Scenario: Missing indexing variables do not stop the API

- **GIVEN** a valid `DATABASE_URL`, no `LLM_*` variable, an `openStore` seam returning a store double,
  and, in turn, neither indexing variable, only `ALLOWED_REPOS_DIR`, only `AUTHOR_HASH_SALT`, and both
  set to `'   '`
- **WHEN** the dependencies are composed
- **THEN** each composition resolves and its dependencies hold no indexing dependencies

### Requirement: Composition from the environment

The composition SHALL build, from a valid configuration, the API's dependencies: the store on
`DATABASE_URL` (through "Opening a pooled store from a URL" of `graph-store`, with the application
name `codemind-api`), the model for the configured mode, the source tree reader, the clock and the
repository root. In live mode with `DAILY_BUDGET_USD` set, every model call SHALL go through the daily
spend ceiling over that store and clock; in evaluation mode, or without a ceiling, the model SHALL be
used as built. A configuration or LLM configuration error SHALL be raised before the store is opened.
Closing the API SHALL close the store's connections.

When both `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` are set, the composition SHALL also build the
indexing dependencies: the trimmed allowed root; the Git history reader with that salt; for each
project language its analyzer (PHP or TypeScript) and its extractor name; and the
runner of work in one transaction of the opened store (`graph-store`, "Running work in one transaction
on a pooled store"). When either is missing, the dependencies SHALL hold no indexing dependencies, and
`POST /api/projects/{projectId}/index` answers `INDEXING_DISABLED` (`http-index`).

#### Scenario: Configuration errors are raised before the store is opened

- **GIVEN** `DATABASE_URL` unset; then a valid `DATABASE_URL` with `LLM_API_KEY` set and
  `LLM_BASE_URL` unset
- **WHEN** the dependencies are composed with an `openStore` seam that records its calls
- **THEN** the first fails with an error whose `code` is `INVALID_CONFIG` and whose `variable` is
  `DATABASE_URL`, the second with an `LlmConfigError` (`code` `LLM_CONFIG_INVALID`) whose `variable`
  is `LLM_BASE_URL`, and `openStore` was never called

#### Scenario: Evaluation mode uses the model as built

- **GIVEN** a valid `DATABASE_URL` and no `LLM_*` variable
- **WHEN** the dependencies are composed with a `createLlm` seam returning a given model double
- **THEN** `createLlm` received a configuration in evaluation mode and the composed model is that
  same double

#### Scenario: A daily budget stops the model call

- **GIVEN** a live configuration (`LLM_BASE_URL` http, every model variable priced in the cost table)
  with `DAILY_BUDGET_USD=1`, and an `openStore` seam whose store reports a spend of 1 USD since
  00:00 UTC
- **WHEN** the composed model is asked to complete a prompt
- **THEN** it rejects with `BudgetExhausted` and the model double built by `createLlm` was not called;
  and with the same configuration without `DAILY_BUDGET_USD`, the model double is called once

#### Scenario: The API answers on its address and closes its connections

- **GIVEN** a reachable, migrated database, `DATABASE_URL` pointing to it, `HOST` = `127.0.0.1` and a
  free `PORT`
- **WHEN** the API is started from that environment, `GET /health` is sent over HTTP to that address,
  and the API is closed
- **THEN** the request answers `200` `{ "status": "ok" }` and, once closed, the database holds no
  session with the application name `codemind-api` (polled for up to 2 s)

#### Scenario: The composed repository root is the repository's top directory

- **GIVEN** a valid `DATABASE_URL`, no `LLM_*` variable and an `openStore` seam returning a store
  double
- **WHEN** the dependencies are composed
- **THEN** `workspaceRoot` is an absolute path and `packages/api/package.json` exists under it

#### Scenario: Both indexing variables compose the indexing dependencies

- **GIVEN** a valid `DATABASE_URL`, no `LLM_*` variable, `ALLOWED_REPOS_DIR` = `'  /repos  '`,
  `AUTHOR_HASH_SALT` set, and an `openStore` seam returning a store double with a transaction runner
- **WHEN** the dependencies are composed
- **THEN** the indexing dependencies hold the allowed root `/repos`, the PHP analyzer for `php`, the
  TypeScript analyzer for `typescript`, the extractor names `php-treesitter-laravel` for `php` and
  `ts-compiler` for `typescript`, and the transaction runner of the opened store
