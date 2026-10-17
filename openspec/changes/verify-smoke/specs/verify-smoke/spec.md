## Purpose

Lets an evaluator or CI check, with one command and without any language model, that the versioned
seed and golden answers match the current code and that the installation (as `make up` /
`npm run db:seed` leaves it) serves every golden question exactly with its expected structural
answer, on a database of its own in CI.

## ADDED Requirements

### Requirement: Verify command contract and configuration

`npm run verify` SHALL take no arguments; arguments, if any, are ignored. It SHALL read only `DATABASE_URL` from the environment,
trimmed: unset, empty or only whitespace fails with `MISSING_CONFIG`, the message
`DATABASE_URL is not set` and `details.variable` = `DATABASE_URL`, before any file is read and before
any connection is opened. It SHALL NOT read nor check any `LLM_*` variable, `DAILY_BUDGET_USD` or
`CACHE_BUILD_TIMEOUT_MS`: an invalid model configuration does not affect it.

It SHALL then read the versioned seed `seeds/graph-dump.sql` and every golden file of `seeds/cache/`
and check them exactly as `db:seed` does, failing with `INVALID_SEED` with the reasons, details and
messages of `db:seed`, before any connection is opened.

The exit code SHALL be `0` when every golden answer matches and `1` in any other case. A failure of a
check or of the environment SHALL leave stdout without any line printed after it and write exactly
one line to stderr, `{"error":{"code","message","details"}}`, with one of the codes
`MISSING_CONFIG`, `INVALID_SEED`, `FINGERPRINT_MISMATCH`, `GOLDEN_MISSING`, `DATABASE_UNAVAILABLE`
(message `cannot connect to the database`), `SEED_NOT_LOADED` or `INTERNAL` (message
`verify failed; the database is unchanged`). `details` SHALL be exactly: `{"variable":"DATABASE_URL"}`
for `MISSING_CONFIG`; the details `db:seed` gives for `INVALID_SEED`; `{"reason":"seed"}` or
`{"reason":"golden","file":<file>}` for `FINGERPRINT_MISMATCH`; `{"project":<name>}` for
`GOLDEN_MISSING` and `SEED_NOT_LOADED`; `{}` for `DATABASE_UNAVAILABLE` and `INTERNAL`. A golden answer that does not match is not a failure of
the command: it is reported on stdout (see "Golden answers are compared on structure only") and
stderr SHALL stay empty. No output SHALL contain an absolute path, the database URL or its
credentials, or the text of an answer, a statement or an excerpt; every question, project name and
compared value SHALL be printed terminal-safe (a value holding a control or a terminal-unsafe
character is printed as its escaped JSON literal).

#### Scenario: Missing database configuration fails before verifying anything

- **GIVEN** `DATABASE_URL` unset, then `DATABASE_URL` = `"   "`
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `MISSING_CONFIG`, the message `DATABASE_URL is not set` and `details` = `{"variable":"DATABASE_URL"}`;
  no seed or golden file is read and no database connection is opened

#### Scenario: An invalid seed or golden file fails before connecting

- **GIVEN** `DATABASE_URL` set, and one at a time: a seed path that does not exist; a seed without
  the format line; a golden file that is not valid JSON
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one `INVALID_SEED` error line with,
  in order, `details.reason` = `missing`, `format` and `cache` (with `details.file`), and the messages
  `db:seed` gives them; no database connection is opened. (These three reasons stand for all of
  `db:seed`'s: the seed and golden files are read by the same readers, whose other reasons are covered
  by the `seed-load` scenarios.)

#### Scenario: An unreachable database is reported without its URL by verify

- **GIVEN** the versioned seed and golden files with current fingerprints and
  `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`
- **WHEN** verify runs
- **THEN** it exits with `1`; stdout is empty; stderr holds one error line with code
  `DATABASE_UNAVAILABLE`, the message `cannot connect to the database` and `details` = `{}`; no output contains
  `s3cret`, `u:`, `127.0.0.1:1` or `postgres://`

### Requirement: Seed and golden fingerprints are current

After reading the files and before any connection, verify SHALL compare, in this order:

1. the seed header's analyzer and contract fingerprints with the ones the seed build computes from the
   current repository. When either differs, or the header lacks one, it SHALL fail with
   `FINGERPRINT_MISMATCH`, `details` = `{"reason":"seed"}` and the message
   `seed/golden fingerprint mismatch: <seed> is out of date; run npm run seed:build, then npm run cache:build`,
   `<seed>` being the seed path displayed as `db:seed` displays it (`seeds/graph-dump.sql` by default);
2. each golden file, in file-name order: its `seed` fingerprints with the seed header's, and its
   `answerFingerprint` with the answer fingerprint of the current repository. When any differs it
   SHALL fail with `FINGERPRINT_MISMATCH`, `details.reason` = `golden`, `details.file` = the golden
   file displayed in the same way, and the message
   `seed/golden fingerprint mismatch: <file> is out of date; run npm run cache:build`;
3. each project of the seed, in the seed's order: it SHALL have a golden file with at least one
   entry; otherwise it SHALL fail with `GOLDEN_MISSING`, `details.project` = the project's name and the
   message `no golden answers for <name>: run npm run cache:build`, `<name>` being the project's name
   as a quoted terminal-safe literal (`"acme-shop"`).

Every one of these failures SHALL happen before any question is asked and before any `✓`/`✗` line is
printed.

#### Scenario: A stale seed fingerprint stops verify before any question

- **GIVEN** `DATABASE_URL` set and a seed whose analyzer fingerprint differs from the one the current
  code computes; then a seed whose contract fingerprint differs; then a seed whose header has no
  analyzer fingerprint line
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `FINGERPRINT_MISMATCH`, `details` = `{"reason":"seed"}` and the message
  `seed/golden fingerprint mismatch: seeds/graph-dump.sql is out of date; run npm run seed:build, then npm run cache:build`;
  no database connection is opened

#### Scenario: A stale golden file stops verify before any question

- **GIVEN** a current seed and `seeds/cache/acme-shop.json` whose `answerFingerprint` differs from the
  current answer fingerprint; then one whose `seed.analyzerFingerprint` differs from the seed header's
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `FINGERPRINT_MISMATCH`, `details` = `{"reason":"golden","file":"seeds/cache/acme-shop.json"}` and
  the message
  `seed/golden fingerprint mismatch: seeds/cache/acme-shop.json is out of date; run npm run cache:build`;
  no database connection is opened

#### Scenario: A seed project without golden answers is reported

- **GIVEN** a current seed with the project `acme-shop` and a `seeds/cache/` directory without any
  golden file; then one whose `acme-shop.json` has current fingerprints and no entries
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `GOLDEN_MISSING`, `details` = `{"project":"acme-shop"}` and the message
  `no golden answers for "acme-shop": run npm run cache:build`; no database connection is opened

### Requirement: Golden projects are the seed's sample projects

After connecting, and before asking any question, verify SHALL look up every golden file's project by
its exact name among the stored projects, in golden-file order; the first project that fails is
reported. When it is absent, is not a sample project, its id is not the id the versioned seed gives
it, or its indexed commit is not the one the versioned seed records for it, verify SHALL fail with `SEED_NOT_LOADED`,
`details.project` = the project's name and the message
`<name> is not loaded from the current seed: run npm run db:seed`, `<name>` being the quoted
terminal-safe literal of the name. Seed ids are deterministic (a project's id derives from its name),
so this check tells a database loaded by `db:seed` from a project created otherwise, and a seed whose
sample history changed from the current one; it does not tell apart two seeds of the same project and
history that differ only in what the analyzer produced (that limit is accepted).

#### Scenario: A database without the current seed is reported

- **GIVEN** current seed and golden files and, one at a time, a migrated database with no project; a
  database where a sample project `acme-shop` exists with an id different from the seed's; a
  database where a non-sample project named `acme-shop` exists with the seed's id; a database where
  the sample `acme-shop` has the seed's id and another indexed commit
- **WHEN** verify runs
- **THEN** each run exits with `1`; stdout is empty; stderr holds one error line with code
  `SEED_NOT_LOADED`, `details` = `{"project":"acme-shop"}` and the message
  `"acme-shop" is not loaded from the current seed: run npm run db:seed`; no question is asked; the
  database is unchanged

### Requirement: Golden questions are asked without any model

For each golden file, in file-name order, and each of its entries, in file order, verify SHALL ask the
entry's `question` of the entry's project through the same answering use case the `ask` command
uses, with the answer cache on and a model in evaluation mode that never sends a request, whatever
the environment holds. Every question of one run SHALL be asked inside one database transaction
that is always rolled back and never committed, whatever happens, and whose connection is always
closed before verify returns; the run SHALL leave no row added, changed or deleted (no `query_log` or
`claim` row added, no `cache_entry.hit_count` changed). `DATABASE_UNAVAILABLE` SHALL be reported only
when opening the transaction fails. Any failure after the transaction is open (a lost connection
included) SHALL be reported as `INTERNAL`, after the lines already printed for the previous entries.

#### Scenario: No request reaches a model even when one is configured

- **GIVEN** a database with the seed and the golden answers loaded, current fingerprints, a local
  HTTP server that counts every request it receives, `LLM_BASE_URL` = that server's URL and
  `LLM_API_KEY` = `k3y`; then, in another run, `LLM_BASE_URL` = `ftp://x`, `DAILY_BUDGET_USD` = `abc`
  and `CACHE_BUILD_TIMEOUT_MS` = `abc`
- **WHEN** verify runs
- **THEN** each run exits with `0` with the same stdout as without any `LLM_*` variable, and the
  server has received `0` requests

#### Scenario: Verify leaves the database as it was

- **GIVEN** a database with the seed and the golden answers loaded, every golden `cache_entry` with
  `hit_count` `0`, and the counts of `query_log` and `claim` rows recorded
- **WHEN** verify runs and exits with `0`
- **THEN** every golden `cache_entry` still has `hit_count` `0`, the `query_log` and `claim` counts are
  unchanged, the transaction was rolled back and never committed, and its connection was closed

#### Scenario: A failure while asking is reported after the lines already printed

- **GIVEN** current seed and golden files with three entries, the projects loaded, and an answering
  use case that answers the first entry from the cache and then throws an unexpected error
- **WHEN** verify runs
- **THEN** it exits with `1`; stdout holds only the `✓` line of the first entry; stderr holds one
  error line with code `INTERNAL` and the message `verify failed; the database is unchanged`; the
  transaction was rolled back and its connection closed

### Requirement: Golden answers are compared on structure only

Each served answer SHALL be compared with the entry's golden response on these fields only, in this
order:

1. that it was served from the answer cache: an `UNKNOWN` answer is a mismatch reported only by the
   line `expected an answer from the golden cache, got UNKNOWN (<reason>)`, followed by
   `: run npm run db:seed` when `<reason>` is `llm-required`; an answered answer whose
   `usage.cacheHit` is not `true` is the difference `usage.cacheHit: expected true, got <served>` (the
   expected value is the literal `true`: a stored golden response always holds `false`);
2. `statements`: the number of statements, then, for each index present in both, the statement's
   `type`, `verification`, `status` and `evidence` — its cited spans as the list of
   `<path>:<startLine>-<endLine>` of the evidence its `evidenceIds` resolve to, in order (an id that
   resolves to no evidence entry is left out);
3. `evidence`: the number of evidence entries, then, for each index present in both, its `path`,
   `startLine` and `endLine`.

The answer text, the statement texts, the excerpts, every id (`id`, `fileId`, `evidenceIds`
themselves), `usage` other than `cacheHit`, `confidence`, `priorClaims` and `persisted` SHALL NOT be
compared.

stdout SHALL hold, for each entry, in the order the questions are asked, one line
`✓ <project> <id> <question>` when it matches or `✗ <project> <id> <question>` when it does not;
under each `✗` line, one line indented by four spaces per difference, in the order above:
`<field>: expected <golden>, got <served>` (for `usage.cacheHit`, `expected true`) with both values
as terminal-safe JSON literals (for
example `statements[0].type: expected "FACT", got "INFERENCE"`), or
`<field>: expected <n> items, got <m>` for a count (`statements`, `evidence`). After every entry line,
stdout SHALL end with one line per golden file, in the same order,
`<project>: <matching>/<entries> golden answers match`. The exit code SHALL be `0` only when every
entry matches.

#### Scenario: Every golden answer matches

- **GIVEN** a migrated database where `db:seed` (as `make up` runs it) loaded the versioned seed and
  the versioned
  `seeds/cache/acme-shop.json` (Q1, Q3 and Q4), current fingerprints and no `LLM_*` variable
- **WHEN** verify runs
- **THEN** it exits with `0`; stdout is exactly
  `✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?`,
  `✓ acme-shop Q3 ¿Cómo se validan los cupones?`,
  `✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?` and
  `acme-shop: 3/3 golden answers match`, one per line; stderr is empty

#### Scenario: An altered golden answer is reported field by field

- **GIVEN** the database of "Every golden answer matches" and, after the load, a golden file on disk
  with the same fingerprints whose Q3 `statements[0].type` is `FACT` instead of `INFERENCE`
- **WHEN** verify runs
- **THEN** it exits with `1`; stdout is the `✓` line of Q1, the line
  `✗ acme-shop Q3 ¿Cómo se validan los cupones?`, the line
  `    statements[0].type: expected "FACT", got "INFERENCE"`, the `✓` line of Q4 and
  `acme-shop: 2/3 golden answers match`; stderr is empty

#### Scenario: A missing cache entry is reported as a cache miss

- **GIVEN** a migrated database with the versioned seed loaded and no golden answer saved in the
  answer cache, and current golden files
- **WHEN** verify runs
- **THEN** it exits with `1`; each of Q1, Q3 and Q4 has a `✗` line followed by
  `    expected an answer from the golden cache, got UNKNOWN (llm-required): run npm run db:seed`;
  the last line is `acme-shop: 0/3 golden answers match`; stderr is empty

#### Scenario: Count and span differences are listed in a fixed order

- **GIVEN** a golden response with two statements, the first citing evidence `a.php:1-2` and the
  second citing evidence `b.php:5-6`, and four answers served from the cache, each equal to it except:
  (A) the second statement and the second evidence entry are absent; (B) the second statement cites
  the first evidence entry; (C) the second evidence entry ends at line `7`; (D) `usage.cacheHit` is
  `false`; and (E) a served `UNKNOWN` answer of reason `no-anchor`
- **WHEN** each is compared with the golden response
- **THEN** the differences are exactly: (A) `statements: expected 2 items, got 1`, then
  `evidence: expected 2 items, got 1`; (B) `statements[1].evidence: expected ["b.php:5-6"], got ["a.php:1-2"]`;
  (C) `statements[1].evidence: expected ["b.php:5-6"], got ["b.php:5-7"]`, then
  `evidence[1].endLine: expected 6, got 7`; (D) `usage.cacheHit: expected true, got false`; (E) `expected an answer from the golden cache, got UNKNOWN (no-anchor)`,
  without the `db:seed` hint

#### Scenario: Free text, ids and usage are not compared

- **GIVEN** a golden response and a served answer from the cache that differ only in the answer
  text, the statement texts, the excerpts, every id (consistently remapped), `confidence`,
  `priorClaims` and `usage` fields other than `cacheHit`
- **WHEN** they are compared
- **THEN** there is no difference

### Requirement: Verify runs in a CI job of its own

`.github/workflows/ci.yml` SHALL have a job `verify` that depends on `scope` and runs under the same
condition as `quality`, with its own Postgres service (`pgvector/pgvector:pg16`) whose database is
`verify`, and that runs, in this order, `npm ci`, `npm run db:migrate`, `npm run db:seed` and
`npm run verify` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/verify` and without
any `LLM_*` variable. No other job SHALL use the database `verify`, and the `quality` job SHALL keep
its database `test`, never seeded. The `scope` job SHALL treat a previous `verify` result that is
neither success nor skipped as it treats `quality` and `mutation`: a docs-only push SHALL NOT skip the
jobs when it is not green. A failing `verify` job SHALL fail the run.

#### Scenario: The CI workflow runs verify in a job of its own

- **GIVEN** `.github/workflows/ci.yml`
- **WHEN** it is parsed
- **THEN** it has a job `verify` with `needs` including `scope` and the `if` of `quality`; its only
  service is `pgvector/pgvector:pg16` with `POSTGRES_DB` = `verify`; its steps run `npm ci`,
  `npm run db:migrate`, `npm run db:seed` and `npm run verify` in that order, each step that needs
  the database with `DATABASE_URL` = `postgres://postgres:postgres@localhost:5432/verify`; no step
  or job of it defines an `LLM_*` variable; neither the job nor any of its steps sets
  `continue-on-error`; no other job has a service with `POSTGRES_DB` = `verify`; `quality` still uses `POSTGRES_DB` = `test` and no step of
  `quality` runs `db:seed`; and the `scope` script checks `verify` together with `quality` and
  `mutation`

#### Scenario: The verify job is green on the pull request

- **GIVEN** the pull request of this change
- **WHEN** its CI run finishes
- **THEN** the `verify` job succeeded, printing the three `✓` lines and `acme-shop: 3/3 golden
  answers match`, and the `quality` job succeeded with `tests/integration/store/graph-read.spec.ts`
  "Listing with no project returns an empty list" unchanged

This scenario is checked by the CI run itself, a recorded check linked from an addendum to the
step 9 report (task 14.3), not by a test.
