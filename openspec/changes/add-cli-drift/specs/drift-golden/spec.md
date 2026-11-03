## Purpose

Lets the author generate, with a live model, the versioned golden drift report of the sample
projects (`npm run drift:build`), in a reproducible file format with a fingerprint that tells when it
no longer matches the code, so the `drift` command answers in evaluation mode without a model.

## ADDED Requirements

### Requirement: Drift build command contract and configuration

`npm run drift:build` SHALL take no arguments: any argument SHALL fail with `USAGE`, the message
`usage: npm run drift:build` and `details` = `{}`, before anything else is read. The **golden drift
reports** SHALL be exactly one: project `acme-shop`, id `Q5` (the documentation-drift row of its
demo-question table in `fixtures/README.md`), key `drift:` (the whole project, no `docPath`). It SHALL
then read the environment exactly as `npm run cache:build` does (`golden-answers` → "Cache build
command contract and configuration"), in the same order and with the same codes, messages and
details: `DATABASE_URL`, then the model configuration (the evaluation mode fails with
`MISSING_CONFIG` and `details.variable` = `LLM_BASE_URL`), then `CACHE_BUILD_TIMEOUT_MS`, the limit of
each request to the model; `LLM_TIMEOUT_MS` SHALL NOT limit the build's requests and the daily
ceiling `DAILY_BUDGET_USD` SHALL NOT be applied. Every one of these checks SHALL happen before any
history is rebuilt, before any database connection and before the golden drift file is read or
written.

The golden drift file of a project SHALL be `seeds/drift/<project>.json`. The exit code SHALL be `0` on
success and `1` on any failure. stdout SHALL receive one line per attempt that ends with a report or
with a failed model request: `Q5: answered in <s> s (attempt <n>/3)` for a kept report, `<s>` the
attempt's duration in whole seconds rounded half up; `Q5: attempt <n>/3 not cacheable (<reason>)` for
any other such attempt, whether it is retried or not. Right after the file is written, stdout SHALL
receive `acme-shop: golden drift report with <c> contradictions -> <output>`, `<c>` the number of
contradictions of all its documents and `<output>` the file's path displayed as `seed:build` displays
its output. On success stderr SHALL be empty. On failure stdout SHALL hold only the attempt lines
already printed, and stderr exactly one line, `{"error":{"code","message","details"}}`, with one of the
codes `USAGE`, `MISSING_CONFIG`, `INVALID_CONFIG`, `LLM_CONFIG_INVALID`, `INVALID_SEED`,
`GOLDEN_STALE`, `GOLDEN_NOT_CACHEABLE`, `DATABASE_UNAVAILABLE`, `PROJECT_NAME_TAKEN`,
`LLM_UNAVAILABLE`, `SOURCE_UNAVAILABLE` or `INTERNAL`, each with the message and details
`npm run cache:build` gives it, except `INTERNAL`, whose message SHALL be
`drift build failed; nothing was written`. No output SHALL contain an absolute path, the database URL
or its credentials, the model's base URL or its API key, or any text of the report.

#### Scenario: Drift build arguments and configuration fail before anything else

- **GIVEN** a previous golden drift file with known content, and then, one at a time: an empty
  environment with the argument `Q5`; `DATABASE_URL` unset; `DATABASE_URL` set and `LLM_BASE_URL` and
  `LLM_API_KEY` empty; a valid model configuration with `CACHE_BUILD_TIMEOUT_MS` = `0`; and
  `LLM_BASE_URL` = `ftp://x`
- **WHEN** the drift build runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code `USAGE`,
  the message `usage: npm run drift:build` and `details` `{}`, then `MISSING_CONFIG` and
  `details.variable` = `DATABASE_URL`, then `MISSING_CONFIG` and `LLM_BASE_URL`, then
  `INVALID_CONFIG` and `CACHE_BUILD_TIMEOUT_MS`, then `LLM_CONFIG_INVALID` and `LLM_BASE_URL`; no
  history is rebuilt, no database connection is opened, the model is not called, and the previous
  golden drift file is unchanged

#### Scenario: The drift build's request limit applies and the daily ceiling does not

- **GIVEN** a valid configuration with `LLM_TIMEOUT_MS=1000`, `DAILY_BUDGET_USD=0.000001`, a daily
  spend already above that ceiling, and `CACHE_BUILD_TIMEOUT_MS=5000`
- **WHEN** the drift build runs with a scripted model that answers every request validly
- **THEN** it exits with `0`; the model client is built with a per-request limit of `5000` (never
  `1000`) and with the build's request function; and no failure is `BUDGET_EXHAUSTED`

### Requirement: The seed the drift report is built on is current

Before rebuilding any history, the drift build SHALL check the versioned seed `seeds/graph-dump.sql`
exactly as `npm run cache:build` does for the project `acme-shop` (`golden-answers` → "The seed the
answers are built on is current"): a seed `db:seed` refuses fails with `INVALID_SEED` and the reason
and message of `db:seed`; header fingerprints that differ from the ones the seed build computes from
the current repository, a seed without an `acme-shop` project row or without its `indexed_commit`, or
a rebuilt acme-shop history whose `HEAD` differs from that commit fail with `GOLDEN_STALE`, the
message `seed out of date: run npm run seed:build` and `details.reason` = `seed`. These checks SHALL
happen before any database connection and before the model is called.

#### Scenario: A missing or outdated seed is refused by the drift build

- **GIVEN** a valid configuration and a seed file that does not exist; then a seed whose analyzer
  fingerprint differs from the current one; then a seed with current fingerprints whose acme-shop
  `indexed_commit` differs from the rebuilt `HEAD`
- **WHEN** the drift build runs
- **THEN** each run exits with `1`: the first with `INVALID_SEED` and `details.reason` = `missing`, the
  other two with `GOLDEN_STALE` and `details.reason` = `seed`; no database connection is opened, the
  model is not called, and the previous golden drift file is unchanged

### Requirement: How a golden drift report is produced

Each attempt SHALL run in its own database transaction: load the versioned seed as `db:seed` does
(without any golden answer or golden drift report), call the core `drift` for acme-shop with the live
model, no `docPath`, the default token budget, `useCache: false`, a new verification cache, the git
source of the rebuilt sample and the workspace the sample is rebuilt in, and then roll the
transaction back. The kept response SHALL be the stored drift report `{ commit, documents }` of the
answered report (its events, usage and `cacheHit` are not kept). The database SHALL be left as it
was: the set of project ids and the rows of `claim`, `query_log` and `cache_entry` SHALL not change,
on success and on failure, and every connection SHALL be closed. A non-sample project named
`acme-shop` SHALL fail the build with `PROJECT_NAME_TAKEN`, as `db:seed` reports it.

#### Scenario: The golden drift report is generated with a scripted model

- **GIVEN** a migrated database with its set of project ids and its `claim`, `query_log` and
  `cache_entry` rows recorded, the versioned seed, the acme-shop history rebuilt in a temporary
  workspace, and a scripted live model that extracts the claims of lines 11–17, 21–27 and 31 of
  `docs/pricing.md`, answers `contradicted` for the first and the last and `consistent` for the second,
  and entails every pair
- **WHEN** the drift build runs to an output directory in a temporary directory that does not exist yet
- **THEN** it exits with `0`; the directory is created; its file `acme-shop.json` is exactly the
  canonical render of a golden drift file with project `acme-shop`, the seed's two header
  fingerprints, the current drift fingerprint, the configured answer and verification models, and one
  entry `Q5` with key `drift:`, `reviews` empty and a `response` that is a stored drift report whose
  `commit` is the seed's acme-shop `indexed_commit` and whose `docs/pricing.md` entry holds two
  contradictions; stdout is one `Q5: answered` line followed by
  `acme-shop: golden drift report with 2 contradictions -> acme-shop.json`; stderr is empty; the
  transaction was rolled back and released; and the recorded project ids and rows are unchanged

#### Scenario: A non-sample acme-shop blocks the drift build

- **GIVEN** a migrated database holding a non-sample project named `acme-shop`, and a previous golden
  drift file with known content
- **WHEN** the drift build runs
- **THEN** it exits with `1`; stderr holds one error line with code `PROJECT_NAME_TAKEN` and
  `details.name` = `acme-shop`; the model is not called; the existing project keeps its id and rows;
  the previous golden drift file is unchanged

### Requirement: Retries and failures of a golden drift report

An attempt SHALL be retried, up to 3 attempts, when its answered report holds a `drift_doc_skipped` or
`drift_claim_skipped` event with reason `invalid-model-output` (reason `invalid-model-output`), or when
the model request fails as `LLM_UNAVAILABLE` with reason `timeout` or `network`. An `unknown` report
SHALL fail at once with its reason (`no-docs`). A response whose JSON text matches
`/AKIA[A-Z0-9]{16}/`, or contains, as written or as escaped inside a JSON string, the absolute path of
the repository root or of the workspace, the value of `DATABASE_URL`, of `LLM_BASE_URL` or, when set,
of `LLM_API_KEY`, SHALL fail at once with reason `unsafe-content`. A failure of the model with any
other reason SHALL fail at once as `LLM_UNAVAILABLE`. After 3 failed attempts the build SHALL fail as
`LLM_UNAVAILABLE` when the last attempt failed that way, and otherwise with `GOLDEN_NOT_CACHEABLE`. A
`GOLDEN_NOT_CACHEABLE` failure SHALL have the message `Q5 has no cacheable drift report (<reason>)` and
`details` = `{ id: 'Q5', reason }`. The number of contradictions of a kept report SHALL NOT be
checked. Any failure SHALL leave the golden drift file byte for byte as it was, with no temporary file
next to it.

#### Scenario: A skipped document is retried

- **GIVEN** the setting of "The golden drift report is generated with a scripted model", with a model
  whose first extraction output for `docs/pricing.md` is not JSON and whose later outputs are valid
- **WHEN** the drift build runs
- **THEN** it exits with `0`; stdout holds `Q5: attempt 1/3 not cacheable (invalid-model-output)`
  followed by `Q5: answered in <s> s (attempt 2/3)`

#### Scenario: A drift report that cannot become golden fails without writing

- **GIVEN** a previous golden drift file with known content, and the setting of "The golden drift
  report is generated with a scripted model" with a model whose three extraction outputs for
  `docs/pricing.md` are not JSON; then one whose contradiction statement quotes
  `AKIAABCDEFGHIJKLMNOP`; then one whose every request fails as a timeout; then one whose request
  fails as `LLM_UNAVAILABLE` with reason `http-status` and status `500`
- **WHEN** the drift build runs
- **THEN** each run exits with `1`; stderr holds one error line with code `GOLDEN_NOT_CACHEABLE` and
  `details` = `{"id":"Q5","reason":"invalid-model-output"}` after three attempts, then
  `{"id":"Q5","reason":"unsafe-content"}` after one attempt, then `LLM_UNAVAILABLE` with
  `details.reason` = `timeout` after three attempts, then `LLM_UNAVAILABLE` with `details.reason` =
  `http-status` after one attempt; no output contains `AKIAABCDEFGHIJKLMNOP`; the previous golden
  drift file is unchanged and no `.tmp` file remains next to it; and the database rows are unchanged

#### Scenario: A project without documents fails at once

- **GIVEN** a previous golden drift file with known content and a drift use case that answers
  `{ status: 'unknown', reason: 'no-docs' }`
- **WHEN** the drift build runs
- **THEN** it exits with `1` after one attempt; stdout is exactly
  `Q5: attempt 1/3 not cacheable (no-docs)`; stderr holds `GOLDEN_NOT_CACHEABLE` with `details` =
  `{"id":"Q5","reason":"no-docs"}`; the previous golden drift file is unchanged

### Requirement: Golden drift file format

A golden drift file SHALL be a JSON object with exactly these keys, in this order: `format` (the
number `1`); `project` (the sample project's name); `seed`, an object with exactly
`analyzerFingerprint` and `contractFingerprint`; `driftFingerprint`; `generatedWith`, an object with
exactly `model` and `verifyModel` (non-empty strings); and `entries`, a list of objects with exactly
`id` (`Q` followed by decimal digits), `key` (`drift:` alone or followed by a path of 1 to 1,000 code
points without U+0000), `response` (a stored drift report, `drift-detection` → "Golden drift report
lookup") and `reviews`, a list of objects with exactly `by` (non-empty) and `date` (a real
`YYYY-MM-DD` day). Every fingerprint SHALL be `sha256:` followed by 64 lowercase hexadecimal digits.
The file SHALL hold no generation time. The canonical render of a golden drift file SHALL be its JSON
text with two-space indentation, keys in the order above, the keys of each `response` and of every
object inside it in the order of "Drift report", LF line endings and a final line feed. The build SHALL
write the canonical render.

#### Scenario: The canonical drift render is stable

- **GIVEN** a golden drift file value
- **WHEN** it is rendered, parsed back and rendered again, and rendered once more from a copy whose
  object keys were inserted in another order
- **THEN** the three texts are identical byte for byte, use two-space indentation, contain no `\r`
  byte and end with exactly one line feed

#### Scenario: Golden drift files with an invalid shape are rejected

- **GIVEN** a valid golden drift file value and, one at a time, copies with `format` `2`, an extra
  top-level key, a fingerprint in upper case, an entry id `X5`, an entry `key` `pricing`, a response
  with the extra key `events`, a contradiction of `type` `FACT`, a review date `2026-13-01`, and an
  entry without `reviews`
- **WHEN** each is checked as a golden drift file
- **THEN** the valid one is accepted and each copy is rejected

### Requirement: Golden drift fingerprint

`driftFingerprint` SHALL be computed with the algorithm of the seed's fingerprints over exactly these
repository files: `packages/core/src/drift/drift-prompts.ts`, `packages/core/src/drift/drift-quarantine.ts`,
`packages/core/src/drift/doc-claims.ts`, `packages/core/src/drift/contradiction.ts`,
`packages/core/src/drift/drift-report.ts`, `packages/core/src/drift/drift-cache.ts`,
`packages/core/src/explain/sanitize.ts`, `packages/core/src/explain/untrusted-text.ts`,
`packages/core/src/verify/verify-prompt.ts` and `packages/core/src/verify/policy.ts`. It SHALL depend
only on those files' paths and contents, not on their line endings.

#### Scenario: The drift fingerprint covers exactly its declared inputs

- **GIVEN** a repository tree holding every declared input and files outside them
  (`packages/core/src/drift/drift.ts`, `packages/core/src/explain/prompt.ts`, `readme.md`)
- **WHEN** each declared input changes in turn, then one of them is rewritten with CRLF line endings,
  then every outside file changes
- **THEN** each change of a declared input alters the fingerprint, the CRLF rewrite does not, and the
  outside changes do not

### Requirement: A failed drift build never leaves a broken golden drift file

The golden drift file SHALL be replaced only once its whole new content is written: on any failure it
SHALL stay byte for byte as it was and no partial or temporary file SHALL remain next to it. The build
SHALL create the file's directory, and its missing parents, when it does not exist.

#### Scenario: A failed write leaves the previous golden drift file intact

- **GIVEN** a previous golden drift file with known content and a build whose attempt succeeds,
  followed by a failure while the new file is written
- **WHEN** the drift build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `drift build failed; nothing was written`;
  the previous file is unchanged and no file matching `.*.tmp` remains next to it

### Requirement: The versioned golden drift file is coherent

The versioned `seeds/drift/acme-shop.json` SHALL be a valid golden drift file whose `project` is
`acme-shop`; whose entries are exactly one, `Q5` with key `drift:`, `Q5` being the id of the
documentation-drift row of the acme-shop demo-question table in `fixtures/README.md`; whose `seed`
fingerprints are the header fingerprints of the versioned `seeds/graph-dump.sql`; whose
`driftFingerprint` is the one of the current code; whose response's `commit` is acme-shop's
`indexed_commit` in the versioned seed; and whose every claim `path` and evidence `path` names a file
row of acme-shop in the versioned seed. The file SHALL be the canonical render of its value and SHALL
NOT match `/AKIA[A-Z0-9]{16}/`. `seeds/drift/` SHALL hold no other `.json` file.

#### Scenario: The versioned golden drift file matches the seed, the table and the code

- **GIVEN** the versioned `seeds/drift/acme-shop.json`, `seeds/graph-dump.sql`, `fixtures/README.md`
  and the current code
- **WHEN** they are compared
- **THEN** every property above holds, and the `.json` files of `seeds/drift/` are exactly
  `acme-shop.json`
