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

### Requirement: Blind panel input of the golden review

The file `docs/golden-review/panel/2026-10-golden-review-dis-110-input.json` SHALL be the input
of the current round (DIS-110) of the independent review of the versioned golden answers, a single
round over the six golden answers regenerated after the pooled transaction runner of DIS-110 changed
the store adapter (a new seed fingerprint, the same seed rows): all six, regenerated by one
`cache:build` of both projects, not a partial regeneration. The files of the previous rounds (DIS-42
r3: `docs/golden-review/panel/2026-10-golden-review-dis-42-r3-input.json`,
`…-dis-42-r3-panelist-1.json`, `…-dis-42-r3-panelist-2.json`, `…-dis-42-r3-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-42-r3.md`, the third and last DIS-42 round, over the
answers regenerated after the stale claim refresh of DIS-42 changed the store adapter, once task-api
`Q2` and acme-shop `Q1` alone had been regenerated for DIS-42 r2 and acme-shop `Q1` alone once more
for DIS-42 r3; DIS-42 r2:
`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-input.json`, `…-dis-42-r2-panelist-1.json`,
`…-dis-42-r2-panelist-2.json`, `…-dis-42-r2-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-42-r2.md`; the first DIS-42 round:
`docs/golden-review/panel/2026-10-golden-review-dis-42-input.json`, `…-dis-42-panelist-1.json`,
`…-dis-42-panelist-2.json`, `…-dis-42-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-42.md`; DIS-33:
`docs/golden-review/panel/2026-10-golden-review-input.json`, `…-panelist-1.json`,
`…-panelist-2.json`, `…-resolution.json` and `docs/golden-review/2026-10-task-api-golden-review.md`;
DIS-107: `docs/golden-review/panel/2026-10-golden-review-dis-107-input.json`,
`…-dis-107-panelist-1.json`, `…-dis-107-panelist-2.json`, `…-dis-107-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-107.md`; DIS-9:
`docs/golden-review/panel/2026-10-golden-review-dis-9-input.json`, `…-dis-9-panelist-1.json`,
`…-dis-9-panelist-2.json`, `…-dis-9-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-9.md`; the first DIS-10 round:
`docs/golden-review/panel/2026-10-golden-review-dis-10-input.json`, `…-dis-10-panelist-1.json`,
`…-dis-10-panelist-2.json`, `…-dis-10-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-10.md`; DIS-10 r2:
`docs/golden-review/panel/2026-10-golden-review-dis-10-r2-input.json`, `…-dis-10-r2-panelist-1.json`,
`…-dis-10-r2-panelist-2.json`, `…-dis-10-r2-resolution.json` and
`docs/golden-review/2026-10-golden-review-dis-10-r2.md`) are history: they SHALL stay unchanged and no
requirement checks them against the current golden files. The current input SHALL be a JSON object
`{ "items": [ ... ] }` with exactly seven items, in this order: the entries of
`seeds/cache/task-api.json` (`Q1`, `Q2`, `Q3`), the behaviour item task-api `Q4`, then the entries of
`seeds/cache/acme-shop.json` (`Q1`, `Q3`, `Q4`).

A golden item SHALL be `{ "project", "id", "kind": "golden", "question", "answer", "statements",
"evidence" }` where `question` is the entry's question, `answer` the response's `answer`,
`statements` lists every statement of the response in order as `{ "n", "text", "type", "evidence" }`
(`n` from 1; `type` `FACT` or `INFERENCE`; `evidence` the `n` of each evidence entry the statement
cites, in the order of its `evidenceIds`), and `evidence` lists every evidence entry of the response
in order as `{ "n", "path", "startLine", "endLine" }` (`n` from 1; `path` relative to the fixture
root). The behaviour item SHALL be `{ "project": "task-api", "id": "Q4", "kind": "unknown",
"question": "¿Cómo se autentican los usuarios?", "answer": "UNKNOWN (no-anchor)", "statements": [],
"evidence": [] }`.

No item SHALL carry an `excerpt`, a `verification`, a `status`, a `confidence`, a fingerprint, a
`usage`, an evidence or file id, nor any other key than those above. The file SHALL be two-space
JSON with LF line endings and a final line feed.

#### Scenario: The panel input projects the golden answers without their verification

- **GIVEN** the versioned `seeds/cache/task-api.json`, `seeds/cache/acme-shop.json` and
  `docs/golden-review/panel/2026-10-golden-review-dis-110-input.json`
- **WHEN** the projection above is computed from the two golden files
- **THEN** the input file equals it item by item and key by key, has seven items in the order above,
  and its text contains none of the quoted keys `"excerpt":`, `"verification":`, `"status":`,
  `"confidence":`, `"fileId":`, `"evidenceIds":` nor any `sha256:` value

### Requirement: Panel outputs of the golden review

Each panelist of the current round SHALL write one output,
`docs/golden-review/panel/2026-10-golden-review-dis-110-panelist-1.json` and
`docs/golden-review/panel/2026-10-golden-review-dis-110-panelist-2.json`, shaped
`{ "panelist", "model", "date", "sourcesRead", "items" }`: `panelist` equal to the number in its
file name; `model` the panelist's exact model id, matching `^claude-[a-z]+-[0-9]+(-[0-9]+)*$`
(the DIS-110 Panel group, group 12c of the change's tasks file, expects `claude-opus-5-5` for
panelist 1 and `claude-sonnet-5-5` for panelist 2 in this run, and tells a panelist whose own id
differs to write its own), different between the two outputs and different from the generator model of
both golden files (`generatedWith.model`); `date` a real `YYYY-MM-DD` day; `sourcesRead` the list of
every source read, one entry per file: a repository-relative file path (no Linear source is allowed
in this round, so an entry starting with `linear:` is outside every allowlist), never a directory
nor a glob (an entry with `*`, `?`, `[` or `{`), and
every entry in the allowlist of its role (see Allowlists); `items` the seven input items in input order, each
`{ "project", "id", "answer", "verdict", "statements", "notes" }` where:

- `answer` is `"true"` when the item's answer is true against the fixture code (for the behaviour
  item: when `UNKNOWN` is the due answer because the fixture has no authentication), `"false"`
  otherwise;
- `statements` has one judgement per input statement, in order, `{ "n", "judgement", "cites" }`,
  `judgement` one of `true` (true against the code and backed by the evidence it cites), `false`
  (contradicted by the code), `unverifiable` (its cited evidence does not exist or does not back it)
  or `overtyped` (typed `FACT` but true only by inference: the code does not state it literally);
- every statement (in its `cites`) and every item's `notes` carries at least one valid citation;
  other citations are ignored;
- `verdict` is the one the criterion derives: `incorrect` when `answer` is `"false"`, or a `FACT`
  statement is judged `false`, or the item has statements and every one is judged other than `true`;
  otherwise `correct` when every statement is judged `true`; otherwise `partial`.

The resolution `docs/golden-review/panel/2026-10-golden-review-dis-110-resolution.json` SHALL be
`{ "resolver", "date", "sourcesRead", "items" }` (no `panelist`, no `model`), whose `items` answer
exactly the items where the two panelists' verdicts differ, in input order, each
`{ "project", "id", "verdict", "justification", "cites" }` with at least one valid citation in its
`cites` or its `justification`; `items` is empty when they agree on all seven. Its `resolver` is a
model id matching the same pattern as `model`; its `date` a real `YYYY-MM-DD` day; its `sourcesRead`
follows the same entry rules as a panelist's, against the resolver allowlist.

**Allowlists.** Panelists: `openspec/changes/pool-transaction-release/tasks.md`,
`docs/golden-review/2026-10-golden-review-dis-110.md`,
`docs/golden-review/panel/2026-10-golden-review-dis-110-input.json`, `docs/base-standards.md`, and
any file under `fixtures/task-api/` or `fixtures/acme-shop/` except `<fixture>/README.md` and the
files under `<fixture>/docs/` and `<fixture>/node_modules/`. Resolver: the panelist allowlist plus
`docs/golden-review/panel/2026-10-golden-review-dis-110-panelist-1.json`,
`docs/golden-review/panel/2026-10-golden-review-dis-110-panelist-2.json` and
`docs/AUTONOMOUS-RUN.md`. No file of the DIS-42 r3 round, the DIS-42 r2 round, the first DIS-42
round nor of the DIS-33, DIS-107, DIS-9, DIS-10 or DIS-10 r2 rounds is in any allowlist. The
check is by path string only: an entry is never checked for existence. An entry is a directory when
it ends in `/` or names an existing directory. An entry with a `..` segment is outside every
allowlist. An entry outside its role's allowlist rejects the output.

**Citations.** A citation is a match of
`/fixtures\/(task-api|acme-shop)\/([A-Za-z0-9_.\/-]+):([0-9]+)/g` in a `cites` entry, a `notes` or a
`justification`. It is valid when its project is the item's, the path names an existing file inside
that fixture and the line is between 1 and the file's number of lines (a final LF does not count as
a line). A line range `:a-b` is not a citation of the range: the pattern reads it as a citation of
its first line `a`.

**Strictness.** Every object of a panelist output or the resolution (the output, an item, a
statement judgement, a resolution item) SHALL have exactly the keys listed above; any other key or
a missing one rejects the output.

The final verdict of an item SHALL be the panelists' common verdict, or the resolution's verdict
when they differ. Panel outputs and the resolution SHALL NOT be edited after they are committed
(requirement "Criterion first and immutable panel record").

#### Scenario: Each panelist output judges every item under the criterion

- **GIVEN** the panel input and the two panelist outputs
- **WHEN** each output is checked against the rules above
- **THEN** both are accepted: right `panelist` number, distinct models matching the pattern and
  other than the generator, a real date, single-file `sourcesRead` inside the panelist allowlist,
  exactly the keys listed in every object, the seven items in order, one
  judgement per input statement with an allowed value, at least one valid citation per statement and
  per `notes`, and a `verdict` equal to the derived one

#### Scenario: The resolution answers exactly the disagreements

- **GIVEN** the two panelist outputs and the resolution
- **WHEN** the items whose verdicts differ are computed
- **THEN** the resolution's `items` are exactly those items, in input order, each with an allowed
  `verdict` and at least one valid citation, the resolution has a `resolver` and no `panelist`
  nor `model`, and its `sourcesRead` has no directory, no glob and no entry outside the resolver
  allowlist

#### Scenario: Invalid panel outputs are rejected

- **GIVEN** a valid panelist output built in the test and, one at a time, copies of it with a
  `verdict` different from the derived one, a `sourcesRead` entry outside the panelist allowlist, a
  directory entry (ending in `/`, or naming an existing directory without it), a glob entry, an
  entry with a `..` segment, a `linear:DIS-110/description` entry, a file of the DIS-42 r3 round
  (`docs/golden-review/panel/2026-10-golden-review-dis-42-r3-panelist-1.json`), a file of the DIS-42
  r2 round (`docs/golden-review/panel/2026-10-golden-review-dis-42-r2-panelist-1.json`), a file of the
  first DIS-42 round (`docs/golden-review/panel/2026-10-golden-review-dis-42-panelist-1.json`), a file
  of the DIS-10 r2 round (`docs/golden-review/panel/2026-10-golden-review-dis-10-r2-panelist-1.json`),
  a file of the first DIS-10 round (`docs/golden-review/panel/2026-10-golden-review-dis-10-panelist-1.json`),
  a file of the DIS-9 round (`docs/golden-review/panel/2026-10-golden-review-dis-9-panelist-1.json`), a
  file of the DIS-107 round (`docs/golden-review/panel/2026-10-golden-review-dis-107-panelist-1.json`),
  a file of the DIS-33 round (`docs/golden-review/panel/2026-10-golden-review-panelist-1.json`), a
  missing statement judgement, a statement with no valid citation,
  a `notes` with no valid citation, a citation of a line past the end of its file, the generator's
  model, a `model` not matching the pattern, and an extra key; plus a resolution that answers an
  item on which both panelists agree
- **WHEN** each is checked against the rules above
- **THEN** the valid output is accepted and every copy, and that resolution, is rejected with a
  message naming the broken rule

### Requirement: Signatures of the reviewed golden answers

After the current round of the review (DIS-110), every entry of `seeds/cache/task-api.json` and
`seeds/cache/acme-shop.json` whose final verdict is `correct` or `partial` SHALL have `reviews` equal to
`[{"by": "agent:<model of panelist 1>", "date": "<date of panelist 1>"}, {"by": "agent:<model of
panelist 2>", "date": "<date of panelist 2>"}]`. An entry whose final verdict is `incorrect` SHALL
have `reviews` empty, SHALL stay in its file (it is not retired by this change), and SHALL be named
in the report's `## Pending` section as the requirement "Golden review report" states: DIS-110 is a
single round, so no successor ticket regenerates it and it stays as a known unsigned golden answer
for the author. No review in a versioned golden file SHALL start with `author:`. Each file
SHALL stay the canonical render of its value, and, against the regenerated version committed before
the panel input, nothing but `reviews` SHALL change in it, so nothing `verify` reads changes.

#### Scenario: Every golden answer judged correct or partial carries both panel signatures

- **GIVEN** the versioned golden files, the panel outputs and the resolution
- **WHEN** the final verdict of each golden entry is computed
- **THEN** every entry judged `correct` or `partial` has exactly the two panel signatures above, in
  that order, and no review of either file starts with `author:`

#### Scenario: A golden answer judged incorrect carries no signature

- **GIVEN** a final verdict `incorrect` for an entry (built in the test)
- **WHEN** the expected `reviews` of that entry are computed by the same rule
- **THEN** they are empty, and for the real files every entry whose final verdict is `incorrect` has
  empty `reviews` and its project and id appear in the report's `## Pending` section

### Requirement: Golden review report

The report of the current round, `docs/golden-review/2026-10-golden-review-dis-110.md`, SHALL have
the sections `## Criterion`,
`## Panel`, `## Verdicts`, `## Agreement`, `## Pending` (only when some final verdict is
`incorrect`) and `## Limitations`, in this order.

`## Panel` SHALL name both panelists' `model` and `date`, the resolver's model, and list the allowed
and the forbidden sources of the DIS-110 Panel group (group 12c) of the change's tasks file: it SHALL
contain each exact entry of the panelist allowlist, the prefixes `fixtures/task-api/` and
`fixtures/acme-shop/`, and the forbidden paths `fixtures/README.md`, `seeds/`,
`docs/golden-review/2026-10-golden-review-dis-42-r3.md` (the DIS-42 r3 report),
`docs/golden-review/2026-10-golden-review-dis-42-r2.md` (the DIS-42 r2 report),
`docs/golden-review/2026-10-golden-review-dis-42.md` (the report of the first DIS-42 round),
`docs/golden-review/2026-10-golden-review-dis-10-r2.md` (the DIS-10 r2 report),
`docs/golden-review/2026-10-golden-review-dis-10.md` (the report of the first DIS-10 round),
`docs/golden-review/2026-10-golden-review-dis-9.md` (the DIS-9 report),
`docs/golden-review/2026-10-golden-review-dis-107.md` (the DIS-107 report) and
`docs/golden-review/2026-10-task-api-golden-review.md` (the DIS-33 report).
Repository paths in the report are written as code, never as Markdown links.

`## Verdicts` SHALL hold one table with the header
`| Project | Id | Panelist 1 | Panelist 2 | Final | Justification | Errors |` and one row per input
item, in input order. The verdict cells SHALL hold the bare lowercase verdict (no backticks) and
equal the panel files; the justification SHALL hold at least one valid citation (requirement "Panel
outputs of the golden review"). The `Errors` cell SHALL be `none` or a `; `-separated list of
`S<n> <judgement>`, in statement order, of the item's statements judged other than `true` by its
error source: panelist 1 when its verdict equals the final one, otherwise panelist 2 when its
verdict equals the final one, otherwise panelist 1 (so when the final verdict matches neither
panelist, the `Errors` cell shows panelist 1's judgements). No cell of the `## Verdicts` table SHALL
contain `|`.

`## Agreement` SHALL state `n = 7`, the line `Percent agreement: <x.y>%` (agreed items / 7 × 100,
exactly one decimal, half away from zero with integer arithmetic, for example `100.0%`), the line
`Cohen's kappa: <k.kkk>` (the value of `cohenKappa` of `scripts/annotation-agreement.mjs` over the
seven verdicts with exactly three decimals, for example `0.500`, or `undefined` when it is `null`),
the word `indicative` for the kappa, and the line `Resolved by the resolver: <k> of 7`. These lines
are compared as text with the values the test recomputes from the panel files.

Each list line of `## Pending` SHALL be `- <project> <id>: DIS-<n>`, naming the ticket under which
the item was last judged and, where one follows, the round that regenerates and judges it again. No
new ticket is opened for a pending item: the first DIS-42 round's report names `DIS-42` itself for
each of its `incorrect` items, with a sentence naming the DIS-42 r2 round that regenerates and judges
them again; the r2 report likewise names `DIS-42` for each of its `incorrect` items, with a sentence
naming the DIS-42 r3 round; DIS-42 r3 was the last DIS-42 round: its report names `DIS-42` for each
of its `incorrect` items, with a sentence saying that no further round and no ticket follow and that
the item stays as a known unsigned golden answer for the author. DIS-110 is a single round: its
report names `DIS-110` for each of its `incorrect` items, with a sentence saying that no further
round and no ticket follow and that the item stays as a known unsigned golden answer for the author.

`## Limitations` SHALL contain these four lines verbatim:
`- Two models of one family are not independent reviewers in the sense of two people.`,
`- The generator is a local 7B model (qwen2.5-coder).`, `- sourcesRead is self-declared.` and
`- The criterion was written by an agent that had read the golden answers.`

The report SHALL NOT contain the words `human`, `humana` nor `a mano`, and SHALL NOT quote the
planted secret.

#### Scenario: The report's verdicts and agreement match the panel files

- **GIVEN** the report and the panel files
- **WHEN** the verdicts table and the agreement figures are parsed and recomputed from the panel
  files
- **THEN** every row's verdicts equal the panelists' and the final verdict, no cell contains `|`,
  every justification has a valid citation, every `Errors` cell equals the one computed from its error source, and the
  `Percent agreement:`, `Cohen's kappa:` and `Resolved by the resolver:` lines equal, as text, the
  recomputed ones

#### Scenario: The report states its criterion, panel and limitations

- **GIVEN** the report
- **WHEN** its sections are read
- **THEN** the sections above are present in order, `## Criterion` defines `correct`, `partial`,
  `incorrect` and an error, `## Panel` names both panelists' models and dates and the resolver and
  contains every exact panelist allowlist entry, both fixture prefixes, `fixtures/README.md`,
  `seeds/`, `docs/golden-review/2026-10-golden-review-dis-42-r3.md`,
  `docs/golden-review/2026-10-golden-review-dis-42-r2.md`,
  `docs/golden-review/2026-10-golden-review-dis-42.md`,
  `docs/golden-review/2026-10-golden-review-dis-10-r2.md`,
  `docs/golden-review/2026-10-golden-review-dis-10.md`,
  `docs/golden-review/2026-10-golden-review-dis-9.md`,
  `docs/golden-review/2026-10-golden-review-dis-107.md` and
  `docs/golden-review/2026-10-task-api-golden-review.md`, `## Limitations` contains the four lines
  above verbatim, and the report contains neither `human`, `humana`, `a mano` nor an `AKIA` key

### Requirement: Criterion first and immutable panel record

The `## Criterion` section of `docs/golden-review/2026-10-golden-review-dis-110.md` SHALL consist
of exactly the lines of the Criterion block of the DIS-110 Panel group (group 12c) of the change's
tasks file, and no other non-blank line. A Criterion block is the non-blank lines between a line
starting with `**Criterion**` (excluded) and the next line starting with `**Output format.**`
(excluded); each of them starts with `- `. The change's tasks file holds exactly one Criterion
block, the one of the DIS-110 Panel group. The change's tasks file is
`openspec/changes/pool-transaction-release/tasks.md` while the change is active, and the single
`openspec/changes/archive/*-pool-transaction-release/tasks.md` once it is archived. The Criterion
block of the change's tasks file SHALL equal, line by line, each of the three Criterion blocks of the
DIS-42 rounds' tasks file `openspec/changes/archive/2026-10-30-stale-claims-refresh/tasks.md` (the
first DIS-42 round, DIS-42 r2 and DIS-42 r3, equal among themselves), each of the two Criterion
blocks of the DIS-10 rounds' tasks file
`openspec/changes/archive/2026-10-29-incremental-indexing/tasks.md` (the first DIS-10 round and
DIS-10 r2), the Criterion block of the DIS-9 round's tasks file
`openspec/changes/archive/2026-10-29-index-endpoint/tasks.md`, the one of the DIS-107 round's tasks
file `openspec/changes/archive/2026-10-28-ts-await-using-golden-regen/tasks.md` and the one of the
DIS-33 round's tasks file `openspec/changes/archive/2026-10-28-golden-independent-review/tasks.md`:
the criterion is not rewritten between rounds.

In this round the criterion is fixed before the golden files are regenerated. The commit that
creates the DIS-110 report with that section SHALL be an ancestor of the commit that regenerates
`seeds/cache/acme-shop.json` and `seeds/cache/task-api.json` for DIS-110 (the regeneration of all six
golden answers by one `cache:build` of both projects, those two files alone in its commit), which
SHALL be an ancestor of the commit that creates
`docs/golden-review/panel/2026-10-golden-review-dis-110-input.json`; between the regeneration and
the input's commit no commit SHALL change `seeds/cache/`; no later commit SHALL change the
`## Criterion` section; each panel output and the resolution of the current round SHALL be changed by
exactly one commit, the one that creates it; and no commit after the one that creates the DIS-110
report SHALL change the files of any previous round (DIS-42 r3, DIS-42 r2, the first DIS-42 round,
DIS-10 r2, DIS-10, DIS-9, DIS-107 and DIS-33). Those files were already frozen by the earlier rounds:
the DIS-42 change left the files of the DIS-33, DIS-107, DIS-9, DIS-10 and DIS-10 r2 rounds unchanged,
no commit after the one that created the DIS-42 r2 report changed the files of the first DIS-42
round, and no commit after the one that created the DIS-42 r3 report changed the files of the DIS-42
r2 round.

#### Scenario: The report's criterion is the Panel group's criterion

- **GIVEN** the report, the change's tasks file, active or archived, and the DIS-42 (with its three
  Criterion blocks), DIS-10 (with its two Criterion blocks), DIS-9, DIS-107 and DIS-33 rounds' tasks
  files
- **WHEN** the non-blank lines of `## Criterion`, the one Criterion block of the change's tasks file
  and the eight Criterion blocks of the previous tasks files are extracted
- **THEN** the change's tasks file has exactly one Criterion block, the ten are equal, and the test
  fails naming the paths it tried when no tasks file of this change, or more than one, is found

#### Scenario: The criterion precedes the input and nothing in the record is rewritten

- **GIVEN** the branch history
- **WHEN** `git merge-base --is-ancestor` over the creating commits of the report, the regeneration
  and the input, `git log` over `seeds/cache/` between the regeneration commit and the input's
  commit, `git log -p` over the report, `git log --format=%H` over each file of the current round in
  `docs/golden-review/panel/`, `git diff` from the DIS-110 report's commit over the files of every
  previous round (DIS-42 r3, DIS-42 r2, the first DIS-42 round, DIS-10 r2, DIS-10, DIS-9, DIS-107 and
  DIS-33), and `git diff` of `seeds/cache/` from the regeneration commit run
- **THEN** the report's commit is an ancestor of the regeneration's, which is an ancestor of the
  input's, no commit touches `seeds/cache/` between the regeneration and the input, no later commit
  touches `## Criterion`, each panel output and the resolution of the current round has exactly one
  commit, the files of every previous round have no diff since the DIS-110 report's commit, and that
  diff of `seeds/cache/` touches only `reviews` (verified and recorded in an addendum to the step 6
  report of this change, `reports/*-6-test-and-state-verification.md`, not by a test: CI clones may be
  shallow)
