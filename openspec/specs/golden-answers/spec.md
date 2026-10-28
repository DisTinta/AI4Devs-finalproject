# golden-answers Specification

## Purpose

Lets the author generate, with a live model, the versioned golden answers of the demo questions of
the sample projects (`npm run cache:build`), in a reproducible file format with a fingerprint that
tells when they no longer match the code, so the demo and `verify` work without a model.

## Requirements

### Requirement: Cache build command contract and configuration

`npm run cache:build` SHALL take the arguments `[--project <name>] [<id>...]`, in any order: the
ids and the option with its value may come before or after one another (`Q3 --project acme-shop`
is the same as `--project acme-shop Q3`), and the value is always the next argument
(`--project=<name>` is an unknown option). The
**golden projects** SHALL be the sample projects that have golden questions, `acme-shop` and
`task-api`, in name order. Without arguments the build SHALL regenerate every golden question of
every golden project, project by project in that order; with `--project <name>` alone, every golden
question of that project; with `--project <name>` and question ids, only those questions of that
project (see "Partial regeneration"). The arguments SHALL be checked before anything else is read,
and the first failure SHALL be reported, in this order:

- an unknown option, a `--project` without a value, or `--project` given twice SHALL fail with
  `USAGE`, the message `usage: npm run cache:build [-- --project <name> [<id>...]]` and `details` =
  `{}`;
- a `--project` value that is not a golden project SHALL fail with `USAGE`, the message
  `unknown golden project` and `details.allowed` = `["acme-shop","task-api"]`;
- question ids without `--project` SHALL fail with `USAGE`, the message
  `golden question ids need --project <name>` and `details.allowed` = `["acme-shop","task-api"]`;
- an id that is not a golden question id of the named project, or an id given twice, SHALL fail with
  `USAGE`, the message `unknown or repeated golden question id` and `details.allowed` = that
  project's golden ids in their order.

It SHALL then read from the environment, trimmed, and in this order:

- `DATABASE_URL`: unset, empty or only whitespace fails with `MISSING_CONFIG` and
  `details.variable` = `DATABASE_URL`;
- the model configuration, read as the `ask` command reads it: an invalid one fails with
  `LLM_CONFIG_INVALID` and `details.variable` as `ask` reports it; the evaluation mode (no
  `LLM_BASE_URL` nor `LLM_API_KEY`) fails with `MISSING_CONFIG` and `details.variable` =
  `LLM_BASE_URL`;
- `CACHE_BUILD_TIMEOUT_MS`, the time limit of each request to the model in milliseconds: unset or
  blank means `1200000`; any other value that is not only decimal digits naming an integer from `1`
  to `3600000` fails with `INVALID_CONFIG`, the message `CACHE_BUILD_TIMEOUT_MS is invalid; see
  .env.example` and `details.variable` = `CACHE_BUILD_TIMEOUT_MS`. `LLM_TIMEOUT_MS` SHALL NOT limit
  the build's requests, and a request SHALL NOT be ended by any limit of the runtime shorter than
  `CACHE_BUILD_TIMEOUT_MS`.

Every one of these checks SHALL happen before any history is rebuilt, before any database connection
and before any golden file is read or written. The daily ceiling `DAILY_BUDGET_USD` SHALL NOT be
applied by the build.

The golden file of a project SHALL be `seeds/cache/<project>.json`. The exit code SHALL be `0` on
success and `1` on any failure. stdout SHALL receive, as the build advances, one line per attempt
that ends with an answer or with a failed model request: `<id>: answered in <s> s (attempt <n>/3)`
for a kept answer, with `<s>` the attempt's duration in whole seconds, rounded half up;
`<id>: attempt <n>/3 not cacheable (<reason>)` for any other such attempt, whether it is retried or
not, with `<reason>` the reason of "Retries and failures of a golden answer" or the model failure's
reason (`timeout`, `network`, `http-status`, …). A failure that is not the outcome of an attempt's
answer or model request (configuration, seed, database, source) prints no line. Right after a
project's golden file is written, stdout SHALL receive the line
`<project>: <count> golden answers -> <output>`, `<count>` being the number of entries of the written
file and `<output>` its path displayed as `seed:build` displays its output. On success stdout SHALL
end with the line of the last project built and stderr SHALL be empty. On failure stdout SHALL hold
only the lines already printed (the attempt lines, and the final line of each project whose file was
written earlier in the run), and stderr exactly one line, `{"error":{"code","message","details"}}`,
with one of the codes `USAGE`, `MISSING_CONFIG`, `INVALID_CONFIG`, `LLM_CONFIG_INVALID`,
`INVALID_SEED`, `GOLDEN_STALE`, `GOLDEN_NOT_CACHEABLE`, `DATABASE_UNAVAILABLE`, `PROJECT_NAME_TAKEN`,
`LLM_UNAVAILABLE`, `SOURCE_UNAVAILABLE` or `INTERNAL`. `INVALID_SEED` SHALL use the reasons and
message of `db:seed` for the versioned seed; `LLM_UNAVAILABLE` and `SOURCE_UNAVAILABLE` SHALL carry
the message and details the `ask` command gives them. An `INTERNAL` failure SHALL have the message
`cache build failed; nothing was written` when no golden file was written in the run, and otherwise
`cache build failed after writing <written>; <file> was not written — run npm run cache:build -- --project <name>`,
`<written>` being the displayed paths of the files written in the run joined by `, `, `<file>` the
displayed path of the failing project's golden file and `<name>` that project. No output SHALL
contain an absolute path, the database URL or its credentials, the model's base URL or its API key,
or a question's answer text.

#### Scenario: Missing or invalid cache build configuration fails before anything else

- **GIVEN** a previous golden file with known content, and then, one at a time: `DATABASE_URL`
  unset; `DATABASE_URL` set and `LLM_BASE_URL` and `LLM_API_KEY` empty; a valid model configuration
  with `CACHE_BUILD_TIMEOUT_MS` = `0`, then `3600001`, then `12.5`, then `abc`; and `LLM_BASE_URL` =
  `ftp://x`
- **WHEN** the cache build runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `MISSING_CONFIG` and `details.variable` = `DATABASE_URL`, then `MISSING_CONFIG` and `LLM_BASE_URL`,
  then four times `INVALID_CONFIG` and `CACHE_BUILD_TIMEOUT_MS`, then `LLM_CONFIG_INVALID` and
  `LLM_BASE_URL`; no history is rebuilt, no database connection is opened, the model is not
  called, and the previous golden file is unchanged

#### Scenario: An unknown or repeated question id is a usage error

- **GIVEN** a valid configuration
- **WHEN** the cache build runs with `--project acme-shop Q2`, then with `--project acme-shop Q3 Q3`,
  then with `--project acme-shop q3`, and then with `--project task-api Q4`
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code `USAGE`,
  the message `unknown or repeated golden question id` and `details.allowed` = `["Q1","Q3","Q4"]` for
  the first three and `["Q1","Q2","Q3"]` for the last; and no environment variable is required for
  it (the same happens with an empty environment)

#### Scenario: Project arguments are checked before anything else

- **GIVEN** an empty environment
- **WHEN** the cache build runs with `Q1`, then with `--project nope`, then with `--project`, then with
  `--project acme-shop --project task-api`, then with `--all`, then with `--project=acme-shop`
- **THEN** each run exits with `1`, stdout is empty and stderr holds one error line with code `USAGE`:
  the message `golden question ids need --project <name>` and `details.allowed` =
  `["acme-shop","task-api"]`; then `unknown golden project` with the same `details.allowed`; then
  four times the message `usage: npm run cache:build [-- --project <name> [<id>...]]` with `details`
  = `{}`; no golden file is read

#### Scenario: Unreachable services are reported without their URLs

- **GIVEN** `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` and a valid model configuration with
  `LLM_BASE_URL=http://127.0.0.1:1/v1` and `LLM_API_KEY=k3y`
- **WHEN** the cache build runs
- **THEN** it exits with `1` and `DATABASE_UNAVAILABLE`; no output contains `s3cret`, `u:`, `k3y` or
  `127.0.0.1:1`; the previous golden files are unchanged

#### Scenario: The build's request limit applies and the daily ceiling does not

- **GIVEN** a valid configuration with `LLM_MODEL=qwen2.5-coder`, `LLM_TIMEOUT_MS=1000` and
  `DAILY_BUDGET_USD=0.000001`, a daily spend already above that ceiling, and `CACHE_BUILD_TIMEOUT_MS`
  unset, then `5000`
- **WHEN** the cache build runs with `--project acme-shop` and a model that answers every golden
  question validly
- **THEN** each run exits with `0`; the model client is built with a per-request limit of `1200000`,
  then `5000` (never `1000`), and with the build's request function; every golden question of
  acme-shop reaches the model; and no failure is `BUDGET_EXHAUSTED`

#### Scenario: A slow model answer within the build's limit is kept

- **GIVEN** a local model endpoint that answers each request after 300 ms, `CACHE_BUILD_TIMEOUT_MS`
  = `5000`, and then `CACHE_BUILD_TIMEOUT_MS` = `100`
- **WHEN** one request is sent to it with the build's request function and the configured limit
- **THEN** with `5000` the request returns the endpoint's status and body; with `100` it fails as a
  timeout, which the model client reports as `LLM_UNAVAILABLE` with reason `timeout`

### Requirement: Golden questions

The golden questions of acme-shop SHALL be exactly, in this order, `Q1`
`¿Cómo se calcula el precio final de un pedido?`, `Q3` `¿Cómo se validan los cupones?` and `Q4`
`¿Qué hace OrderObserver al crear un pedido?`, each with the id and the exact text of its row in the
demo-question table of acme-shop in `fixtures/README.md`. Q2 (impact), Q5 (documentation drift) and
Q6 (an `UNKNOWN` answered without the model) SHALL NOT be golden questions.

The golden questions of task-api SHALL be exactly, in this order, `Q1`
`¿Cómo valida taskRoutes las peticiones entrantes?`, `Q2`
`¿Qué hace buildPage con los resultados paginados?` and `Q3`
`¿Qué transiciones de estado son válidas?`, each with the id and the exact text of its row in the
demo-question table of task-api in `fixtures/README.md`. Q4 (an `UNKNOWN`: the repository has no
authentication) SHALL NOT be a golden question: its terms (`autentican`, `usuarios` and their
prefixes `auten`, `usuar`) name no symbol of task-api, so `ask` answers it `UNKNOWN` of reason
`no-anchor` before the answer cache is read, without a model, in evaluation mode as in live mode. It
is not checked by `verify`, which compares golden answers only; the scenario below checks it.

Every golden question SHALL anchor in its project: at least one of the first 16 terms the context
engine derives from the question (`questionTerms`) SHALL be contained, case-insensitively, in the
name of a symbol of that project in the versioned seed. A question that anchors nothing is answered
`UNKNOWN` of reason `no-anchor` before the answer cache is read and SHALL NOT be a golden question
(as acme-shop's Q5).

#### Scenario: Every golden question anchors a symbol of its project

- **GIVEN** the versioned `seeds/graph-dump.sql` and the golden questions of every golden project
- **WHEN** the first 16 terms of each question are compared with the names of the symbols of its
  project's rows in the seed
- **THEN** every golden question has at least one term contained, case-insensitively, in one of those
  names; in particular task-api's Q1 anchors `taskRoutes`, Q2 anchors `buildPage` and Q3 anchors
  `canTransition`

#### Scenario: The golden questions match the demo-question table

- **GIVEN** the demo-question table of acme-shop in `fixtures/README.md`
- **WHEN** the golden questions of acme-shop are compared with it
- **THEN** each golden question's id and text equal those of the row with the same id, and the ids
  are `Q1`, `Q3` and `Q4` in that order

#### Scenario: The task-api golden questions match its demo-question table

- **GIVEN** the demo-question table of task-api in `fixtures/README.md`
- **WHEN** the golden questions of task-api are compared with it
- **THEN** each golden question's id and text equal those of the row with the same id (the row id
  written without its `(UNKNOWN)` note), the ids are `Q1`, `Q2` and `Q3` in that order, and the golden
  projects are exactly `acme-shop` and `task-api`, in that order

#### Scenario: task-api's Q4 is answered UNKNOWN without anchor in evaluation mode

- **GIVEN** a migrated database where `db:seed` loaded the versioned seed and the versioned golden
  files, and no `LLM_*` variable (evaluation mode)
- **WHEN** `ask task-api "¿Cómo se autentican los usuarios?"` runs
- **THEN** it exits with `0`; stdout is exactly `UNKNOWN (no-anchor)` followed by a line feed;
  stderr is empty; no request reaches a model; and the number of `claim` rows and of task-api's
  `cache_entry` rows is unchanged

### Requirement: The seed the answers are built on is current

Before rebuilding any history, the build SHALL read the versioned seed `seeds/graph-dump.sql`, check
it as `db:seed` does, and compare its header's analyzer and contract fingerprints with the ones the
seed build computes from the current repository; when either differs it SHALL fail with
`GOLDEN_STALE`, the message `seed out of date: run npm run seed:build` and `details.reason` =
`seed`. A seed that holds no project row of a requested project, or whose row of a requested project
has no `indexed_commit`, SHALL fail in the same way, before any history is rebuilt. It SHALL then
rebuild the history of every requested project from its versioned manifest, as the seed build does,
and, when the `HEAD` commit of a rebuilt sample differs from the seed's `indexed_commit` for that
project, fail in the same way. These checks SHALL happen for every requested project before any
database connection and before the model is called.

#### Scenario: A missing or outdated seed is refused

- **GIVEN** a valid configuration and a seed file that does not exist; then a seed whose analyzer
  fingerprint differs from the current one; then a seed with current fingerprints whose
  `indexed_commit` differs from the rebuilt `HEAD`
- **WHEN** the cache build runs
- **THEN** each run exits with `1`: the first with `INVALID_SEED`, `details.reason` = `missing` and
  the message of `db:seed`; the other two with `GOLDEN_STALE`, the message
  `seed out of date: run npm run seed:build` and `details.reason` = `seed`; no database connection
  is opened, the model is not called, and the previous golden files are unchanged

#### Scenario: A seed without the second project is refused before any question

- **GIVEN** a valid configuration and a seed with current fingerprints that holds only acme-shop
- **WHEN** the cache build runs without arguments, and then with `--project task-api`
- **THEN** each run exits with `1` and `GOLDEN_STALE` with `details.reason` = `seed`; stdout is
  empty; no history is rebuilt, no database connection is opened, the model is not called, and the
  previous golden files are unchanged

### Requirement: How a golden answer is produced

For each requested question the build SHALL, in its own database transaction: load the versioned
seed as `db:seed` does (without golden answers), ask `explain` the question about the question's
project with the default token budget and hops and the answer cache turned off, over the git source
of that project's rebuilt sample, and then roll the transaction back. The kept response SHALL be the
stored response the answer cache would keep for that answer. Its `priorClaims` SHALL be empty. The
database SHALL be left as it was: the set of project ids and the rows of `claim`, `query_log` and
`cache_entry` SHALL not change, on success and on failure, and every connection SHALL be closed. A
non-sample project named as a requested project SHALL fail the build with `PROJECT_NAME_TAKEN`, as
`db:seed` reports it.

#### Scenario: The golden answers are generated with a scripted model

- **GIVEN** a migrated database with its set of project ids and its `claim`, `query_log` and
  `cache_entry` rows recorded, the versioned seed, the sample's history rebuilt in a temporary
  workspace, and a scripted live model that answers each golden question with a valid answer citing a
  span of the evidence it receives and entails every pair
- **WHEN** the cache build runs with `--project acme-shop` to an output directory in a temporary
  directory that does not exist yet
- **THEN** it exits with `0`; the directory is created; the file `acme-shop.json` in it is exactly the
  canonical render of a golden file with project `acme-shop`, the seed's two header fingerprints,
  the current answer fingerprint, the configured answer and verification models, and one entry per
  golden question in order, each with its id and question, `questionNormalized` equal to the
  normalized question, `reviews` empty and a `response` the answer cache accepts as a stored
  response, with `priorClaims` empty and every evidence `fileId` naming a file of the seed with the
  same path; stdout is one `answered` line per question followed by
  `acme-shop: 3 golden answers -> acme-shop.json`; stderr is empty; each question's transaction was
  rolled back and released; and the recorded project ids and rows are unchanged

#### Scenario: Every golden project is built without arguments

- **GIVEN** the setting of "The golden answers are generated with a scripted model", with the
  histories of both samples rebuilt in the temporary workspace
- **WHEN** the cache build runs without arguments
- **THEN** it exits with `0`; the output directory holds `acme-shop.json` and `task-api.json`, the
  second a golden file with project `task-api` and entries `Q1`, `Q2` and `Q3` in order, every
  evidence `fileId` naming a task-api file of the seed with the same path; stdout is, in order, the
  three `answered` lines of acme-shop (`Q1`, `Q3`, `Q4`), `acme-shop: 3 golden answers -> acme-shop.json`,
  the three `answered` lines of task-api (`Q1`, `Q2`, `Q3`) and
  `task-api: 3 golden answers -> task-api.json`; and acme-shop's file was written before the first
  task-api question was asked

#### Scenario: A non-sample acme-shop blocks the cache build

- **GIVEN** a migrated database holding a non-sample project named `acme-shop`, and a previous golden
  file with known content
- **WHEN** the cache build runs with `--project acme-shop`
- **THEN** it exits with `1`; stderr holds one error line with code `PROJECT_NAME_TAKEN`, the message
  `a project named "acme-shop" already exists and is not a sample` and `details.name` = `acme-shop`;
  the model is not called; the existing project keeps its id and rows; the previous golden file is
  unchanged

### Requirement: Retries and failures of a golden answer

An attempt SHALL be retried, up to 3 attempts per question, when its answer is an `UNKNOWN` of reason
`invalid-model-output`, `broken-evidence` or `no-evidence`, when it is an answer the cache would not
keep (reason `not-cacheable`), or when the model request fails as `LLM_UNAVAILABLE` with reason
`timeout` or `network`. An `UNKNOWN` of reason `no-anchor` or `over-budget` SHALL fail at once. A
response whose JSON text matches `/AKIA[A-Z0-9]{16}/`, or contains, as written or as escaped inside a
JSON string, the absolute path of the repository root or of the workspace the sample is rebuilt in,
the value of `DATABASE_URL`, of `LLM_BASE_URL` or, when set, of `LLM_API_KEY`, SHALL fail at once with
reason `unsafe-content`. A failure of the model with any other reason SHALL fail at once as
`LLM_UNAVAILABLE`. After 3 failed attempts the
build SHALL fail as `LLM_UNAVAILABLE` when the last attempt failed that way, and otherwise with
`GOLDEN_NOT_CACHEABLE`. A `GOLDEN_NOT_CACHEABLE` failure SHALL have the message
`<id> has no cacheable answer (<reason>)` and `details` = `{ id, reason }`, `<reason>` being one of
`no-anchor`, `over-budget`, `invalid-model-output`, `no-evidence`, `broken-evidence`,
`not-cacheable` or `unsafe-content`. Any failure SHALL leave the failing project's golden file, and
those of the projects after it, byte for byte as they were, with no temporary file next to them (see
"A failed build never leaves a broken golden file").

#### Scenario: An invalid model output is retried

- **GIVEN** the setting of "The golden answers are generated with a scripted model", with a model
  whose first answer to Q3 is not valid JSON and whose second is valid
- **WHEN** the cache build runs with `--project acme-shop`
- **THEN** it exits with `0`; Q3 is in the file; stdout holds `Q3: attempt 1/3 not cacheable
  (invalid-model-output)` followed by `Q3: answered in <s> s (attempt 2/3)`

#### Scenario: A question without a cacheable answer fails without writing

- **GIVEN** a previous golden file with known content, and the setting of "The golden answers are
  generated with a scripted model" with a model whose three answers to Q3 are not valid JSON; then
  one whose three answers to Q1 hold no statement; then one whose answer to Q4 quotes
  `AKIAABCDEFGHIJKLMNOP` in a statement
- **WHEN** the cache build runs with `--project acme-shop`
- **THEN** each run exits with `1`; stderr holds one error line with code `GOLDEN_NOT_CACHEABLE` and
  `details` = `{"id":"Q3","reason":"invalid-model-output"}`, then `{"id":"Q1","reason":"no-evidence"}`
  after three attempts, then `{"id":"Q4","reason":"unsafe-content"}` after one attempt; stdout ends
  with `Q3: attempt 3/3 not cacheable (invalid-model-output)`, `Q1: attempt 3/3 not cacheable
  (no-evidence)` and `Q4: attempt 1/3 not cacheable (unsafe-content)` respectively; no output
  contains `AKIAABCDEFGHIJKLMNOP`; the previous golden file is unchanged and no `.tmp` file remains
  next to it; and the database rows are unchanged

#### Scenario: Answers that cannot become golden fail at once

- **GIVEN** a previous golden file with known content and a build whose answer to Q1 is an `UNKNOWN`
  of reason `no-anchor`; then one whose answer is an `UNKNOWN` of reason `over-budget`; then one whose
  model request fails as `LLM_UNAVAILABLE` with reason `http-status` and status `500`
- **WHEN** the cache build runs with `--project acme-shop`
- **THEN** each run exits with `1` after one attempt at Q1; stdout is exactly
  `Q1: attempt 1/3 not cacheable (no-anchor)`, then `Q1: attempt 1/3 not cacheable (over-budget)`,
  then `Q1: attempt 1/3 not cacheable (http-status)`; stderr holds one error line with code
  `GOLDEN_NOT_CACHEABLE` and `details` = `{"id":"Q1","reason":"no-anchor"}`, then
  `{"id":"Q1","reason":"over-budget"}`, then code `LLM_UNAVAILABLE` with `details.reason` =
  `http-status` and `details.status` = `500`; the previous golden file is unchanged

#### Scenario: A model that keeps timing out is reported as unavailable

- **GIVEN** a previous golden file with known content and a model whose every request fails as a
  timeout
- **WHEN** the cache build runs with `--project acme-shop`
- **THEN** it exits with `1` after three attempts at Q1; stdout is exactly the three lines
  `Q1: attempt 1/3 not cacheable (timeout)`, `Q1: attempt 2/3 not cacheable (timeout)` and
  `Q1: attempt 3/3 not cacheable (timeout)`; stderr holds one error line with code
  `LLM_UNAVAILABLE` and `details.reason` = `timeout`; the previous golden file is unchanged

### Requirement: Partial regeneration

With `--project <name>` and question ids the build SHALL read that project's existing golden file
before rebuilding any history and before connecting, and SHALL fail with `GOLDEN_STALE`, the message
`golden file cannot be partially regenerated (<reason>): run npm run cache:build` and
`details.reason` = `<reason>` when: the file does not exist (`missing`); it is not a valid golden file
by the checks `db:seed` applies, or it holds an entry whose id is not a golden question of the project
(`invalid`); its seed or answer fingerprint differs from the current one (`fingerprint`); or its
answer or verification model differs from the configured one (`model`). Otherwise it SHALL
regenerate only the named questions and write a file holding the existing entries that were not
named, identical to the existing ones (their `reviews` included), and the regenerated ones, in the
golden order; a golden question absent from the existing file and not named stays absent. A
regenerated entry SHALL have empty `reviews`. Without question ids every golden question of each
requested project SHALL be regenerated and every `reviews` list of its file SHALL be empty.

#### Scenario: Only the named question is regenerated

- **GIVEN** a golden file of acme-shop with Q1, Q3 and Q4 whose fingerprints and models match the
  current ones and whose Q1 has one review
- **WHEN** the cache build runs with `--project acme-shop Q3`
- **THEN** it exits with `0`; the model is asked only Q3; the Q1 and Q4 entries of the new file,
  Q1's review included, are identical to the previous ones; the Q3 entry holds the new answer with
  empty `reviews`; and the final line counts `3 golden answers`; a run with `Q3 --project acme-shop`
  over the same previous file behaves exactly the same (the arguments may come in any order); and a
  run with `--project acme-shop` over that file then regenerates the three questions and leaves every
  `reviews` list empty

#### Scenario: A stale golden file is not partially regenerated

- **GIVEN** no golden file; then a golden file that is not valid JSON; then a valid one holding an
  entry `Q7`; then a valid one whose answer fingerprint differs from the current one; then a valid one
  whose answer model differs from `LLM_MODEL`
- **WHEN** the cache build runs with `--project acme-shop Q3`
- **THEN** each run exits with `1` and `GOLDEN_STALE` with `details.reason` = `missing`, `invalid`,
  `invalid`, `fingerprint` and `model` respectively; the model is not called and the file, when it
  existed, is unchanged

### Requirement: Golden file format

A golden file SHALL be a JSON object with exactly these keys, in this order: `format` (the number
`1`); `project` (the sample project's name); `seed`, an object with exactly `analyzerFingerprint`
and `contractFingerprint`; `answerFingerprint`; `generatedWith`, an object with exactly `model` and
`verifyModel` (non-empty strings); and `entries`, a list of objects with exactly `id` (`Q` followed
by decimal digits), `question` (non-empty), `questionNormalized`, `response` and `reviews`, a list of
objects with exactly `by` (non-empty) and `date` (`YYYY-MM-DD`). Every fingerprint SHALL be
`sha256:` followed by 64 lowercase hexadecimal digits. The file SHALL hold no generation time.

The canonical render of a golden file SHALL be its JSON text with two-space indentation, keys in the
order above, the keys of each `response` in the order the answer cache stores them, entries in the
golden order, LF line endings and a final line feed. The build SHALL write the canonical render.

#### Scenario: The canonical render is stable

- **GIVEN** a golden file value
- **WHEN** it is rendered, parsed back and rendered again, and rendered once more from a copy whose
  object keys were inserted in another order
- **THEN** the three texts are identical byte for byte, use two-space indentation, contain no `\r`
  byte and end with exactly one line feed

#### Scenario: Golden files with an invalid shape are rejected

- **GIVEN** a valid golden file value and, one at a time, copies with `format` `2`, an extra
  top-level key, a fingerprint in upper case, an entry id `X1`, a review date `2026-13-01`, and an
  entry without `reviews`
- **WHEN** each is checked as a golden file
- **THEN** the valid one is accepted and each copy is rejected

### Requirement: Golden answer fingerprint

`answerFingerprint` SHALL be computed with the algorithm of the seed's fingerprints over exactly these
repository files: `packages/core/src/explain/prompt.ts`, `packages/core/src/explain/question-language.ts`,
`packages/core/src/explain/untrusted-text.ts`,
`packages/core/src/explain/sanitize.ts`, `packages/core/src/explain/limits.ts`,
`packages/core/src/explain/statement-schema.ts`, `packages/core/src/explain/typing-rules.ts`,
`packages/core/src/verify/verify-prompt.ts`, `packages/core/src/verify/policy.ts`,
`packages/core/src/knowledge/confidence.ts`, `packages/core/src/cache/normalize.ts` and
`packages/core/src/cache/response-cache.ts`. It SHALL depend only on those files' paths and contents,
not on their line endings.

#### Scenario: The answer fingerprint covers exactly its declared inputs

- **GIVEN** a repository tree holding every declared input and files outside them
  (`packages/core/src/context/anchor.ts`, `packages/core/src/explain/explain.ts`, `readme.md`)
- **WHEN** each declared input changes in turn, then one of them is rewritten with CRLF line endings,
  then every outside file changes
- **THEN** each change of a declared input alters the fingerprint, the CRLF rewrite does not, and the
  outside changes do not

### Requirement: A failed build never leaves a broken golden file

Each golden file SHALL be replaced only once its whole new content is written: on any failure it
SHALL stay byte for byte as it was and no partial or temporary file SHALL remain next to it. A
project's file SHALL be written only after every requested question of that project produced a kept
response, and before the first question of the next project is asked. A failure SHALL stop the
build: the files of the projects written earlier in the same run SHALL keep their new content, and
the failing project's file and the files of the projects after it SHALL stay as they were. The build
SHALL create the golden files' directory, and its missing parents, when it does not exist.

#### Scenario: A failed write leaves the previous golden file intact

- **GIVEN** a previous golden file of acme-shop with known content and a build with
  `--project acme-shop` whose answers all succeed, followed by a failure while the new file is
  written
- **WHEN** the cache build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `cache build failed; nothing was
  written`; the previous file is unchanged and no file matching `.*.tmp` remains next to it

#### Scenario: A failure in the second project keeps the first project's new file

- **GIVEN** previous golden files of acme-shop and task-api with known contents, and a build without
  arguments whose acme-shop answers all succeed and whose three answers to task-api's Q2 are not valid
  JSON; then one whose task-api answers all succeed, followed by a failure while task-api's file is
  written
- **WHEN** the cache build runs
- **THEN** each run exits with `1`; stdout holds the line `acme-shop: 3 golden answers -> <file>` and
  the new acme-shop file is in place; the first run's stderr holds `GOLDEN_NOT_CACHEABLE` with
  `details` = `{"id":"Q2","reason":"invalid-model-output"}`; the second run's stderr holds `INTERNAL`
  with the message
  `cache build failed after writing <acme-shop file>; <task-api file> was not written — run npm run cache:build -- --project task-api`;
  in both, the previous task-api file is unchanged and no `.tmp` file remains

### Requirement: The versioned golden file is coherent

Each versioned golden file, `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json`, SHALL be a
valid golden file whose `project` is its file's name, whose entries are exactly that project's golden
questions in order with their ids and texts, whose `questionNormalized` equals the normalized
question, whose every `response` the answer cache accepts as a stored answered response with empty
`priorClaims`, and whose every evidence `fileId` and `path` name a file row of the versioned seed for
that project. Each file SHALL be the canonical render of its value and SHALL NOT match
`/AKIA[A-Z0-9]{16}/`. `seeds/cache/` SHALL hold no other golden file.

#### Scenario: The versioned golden file matches the seed, the questions and the code

- **GIVEN** the versioned `seeds/cache/acme-shop.json`, `seeds/graph-dump.sql` and the golden
  questions
- **WHEN** they are compared
- **THEN** every property above holds for acme-shop

#### Scenario: The versioned task-api golden file matches the seed, the questions and the code

- **GIVEN** the versioned `seeds/cache/task-api.json`, `seeds/graph-dump.sql` and the golden
  questions
- **WHEN** they are compared
- **THEN** every property above holds for task-api, and the `.json` files of `seeds/cache/` are
  exactly `acme-shop.json` and `task-api.json`
