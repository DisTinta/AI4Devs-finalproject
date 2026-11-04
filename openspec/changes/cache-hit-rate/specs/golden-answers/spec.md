## ADDED Requirements

### Requirement: Golden embeddings command

`npm run cache:embed` SHALL fill the question embeddings of the versioned golden files with the
configured embedding model, without asking any golden question again and without any database. It
SHALL take the arguments `[--project <name>]`: without arguments it SHALL embed every golden project,
`acme-shop` then `task-api`; with `--project <name>`, only that project. The arguments SHALL be checked
before anything else is read, and the first failure SHALL be reported, in this order: a positional
argument, an unknown option (`--project=<name>` included), a `--project` without a value or a
`--project` given twice SHALL fail with `USAGE`, the message
`usage: npm run cache:embed [-- --project <name>]` and `details` = `{}`; a `--project` value that is
not a golden project SHALL fail with `USAGE`, the message `unknown golden project` and
`details.allowed` = `["acme-shop","task-api"]`.

It SHALL then read from the environment, trimmed, and in this order: the model configuration, read as
the `ask` command reads it (an invalid one fails with `LLM_CONFIG_INVALID` and `details.variable` as
`ask` reports it; the evaluation mode, without `LLM_BASE_URL` nor `LLM_API_KEY`, fails with
`MISSING_CONFIG` and `details.variable` = `LLM_BASE_URL`); then `LLM_EMBED_MODEL`, whose absence
(unset, empty or only whitespace) fails with `MISSING_CONFIG` and `details.variable` =
`LLM_EMBED_MODEL`. `DATABASE_URL` SHALL NOT be read, and no database connection SHALL be opened. Each
embedding request SHALL be limited by the model configuration's time limit, as the `ask` command's
requests are; the daily ceiling `DAILY_BUDGET_USD` SHALL NOT be applied.

It SHALL then read the golden file `seeds/cache/<project>.json` of every requested project, before any
embedding request: a file that does not exist, or that fails the checks `db:seed` applies to a golden
file (`seed-load`, "Command contract and configuration") with the golden projects in place of the
seed's projects, SHALL fail with `INVALID_SEED`, `details.reason` = `cache`, `details.file` = the file
named as `db:seed` names it and the message `<file> is not a loadable codemind golden file`. The
fingerprints and models of the file SHALL NOT be checked.

Then, project by project in the order above, it SHALL send, for every entry of the file in its order,
one embedding request whose only input is the entry's `questionNormalized`, and the result SHALL be a
usable vector (`semantic-cache`, "Similarity threshold and embedded text"). An embedding request that
fails with `LlmUnavailable` SHALL fail the command with `LLM_UNAVAILABLE`, with the message and details
the `ask` command gives it; a result that is not a usable vector SHALL fail it with `LLM_UNAVAILABLE`,
the message `ask` gives that code and `details.reason` = `invalid-response`. Once every entry of a
project has its vector, the command SHALL write that project's golden file as the canonical render of
the same value with each entry's `questionEmbedding` replaced by its vector, so every other key keeps
its value (`response` and `reviews` included), and SHALL print
`<project>: <count> question embeddings -> <output>`, `<count>` the number of entries and `<output>`
the file displayed as `cache:build` displays it. The write SHALL follow "A failed build never leaves a
broken golden file": the failing project's file and the files after it stay as they were, the files
written earlier in the run keep their new content, and no temporary file remains.

The exit code SHALL be `0` on success and `1` on any failure. On success stderr SHALL be empty. On
failure stdout SHALL hold only the lines of the projects already written and stderr exactly one line,
`{"error":{"code","message","details"}}`, with one of the codes `USAGE`, `MISSING_CONFIG`,
`LLM_CONFIG_INVALID`, `INVALID_SEED`, `LLM_UNAVAILABLE` or `INTERNAL`. An `INTERNAL` failure SHALL have
the message `cache embed failed; nothing was written` when no golden file was written in the run, and
otherwise
`cache embed failed after writing <written>; <file> was not written — run npm run cache:embed -- --project <name>`.
No output SHALL contain an absolute path, the model's base URL or its API key, a question, an answer
text or a vector component.

#### Scenario: Golden question embeddings are written without touching the answers

- **GIVEN** the versioned golden files of acme-shop and task-api copied to a scratch golden directory,
  a live model configuration with `LLM_EMBED_MODEL` set and `DATABASE_URL` unset, and a scripted
  embedding model that answers each input with its own usable vector of `EMBEDDING_DIMENSIONS`
  components
- **WHEN** the embeddings command runs without arguments
- **THEN** it exits with `0`; stderr is empty; stdout is exactly
  `acme-shop: 3 question embeddings -> <acme-shop file>` and
  `task-api: 3 question embeddings -> <task-api file>`; the model received one embedding request per
  entry, in file order, each with the entry's `questionNormalized` as its only input; each entry's
  `questionEmbedding` is the vector answered for its key; each file is the canonical render of its
  value; each file, with every `questionEmbedding` set to `null`, equals the previous file with every
  `questionEmbedding` set to `null`; and no database connection was opened

#### Scenario: Embedding arguments and configuration are checked before any file

- **GIVEN** previous golden files with known contents, and in turn: the arguments `Q1`, `--all`,
  `--project=acme-shop`, `--project`, `--project acme-shop --project task-api` and `--project nope`
  with an empty environment; then no arguments with `LLM_BASE_URL` and `LLM_API_KEY` empty; then a
  live model configuration with `LLM_BASE_URL` = `ftp://x`; then a valid live model configuration with
  `LLM_EMBED_MODEL` unset, then `'   '`
- **WHEN** the embeddings command runs
- **THEN** each run exits with `1` and stdout is empty; stderr holds one error line with code `USAGE`
  and the message `usage: npm run cache:embed [-- --project <name>]` for the first five, `USAGE` with
  the message `unknown golden project` and `details.allowed` = `["acme-shop","task-api"]` for the
  sixth, then `MISSING_CONFIG` with `details.variable` = `LLM_BASE_URL`, then `LLM_CONFIG_INVALID`
  with `details.variable` = `LLM_BASE_URL`, then twice `MISSING_CONFIG` with `details.variable` =
  `LLM_EMBED_MODEL`; no golden file is read or written and no embedding request is sent

#### Scenario: An invalid golden file stops the embedding before any request

- **GIVEN** a valid configuration, a valid acme-shop golden file, and a task-api golden file that is
  not valid JSON; then no task-api golden file
- **WHEN** the embeddings command runs without arguments
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `INVALID_SEED`, `details.reason` = `cache` and `details.file` = the task-api file's displayed path;
  no embedding request is sent and the acme-shop file is unchanged

#### Scenario: A failed embedding leaves the golden file intact

- **GIVEN** previous golden files of acme-shop and task-api with known contents and a valid
  configuration; in turn: a model whose request for acme-shop's second entry fails with
  `LlmUnavailable` `timeout`; a model that answers acme-shop's second entry with a vector of
  `EMBEDDING_DIMENSIONS` zeros; and a model that answers every acme-shop entry and fails every task-api
  request with `LlmUnavailable` `network`
- **WHEN** the embeddings command runs without arguments
- **THEN** each run exits with `1` and stderr holds one error line with code `LLM_UNAVAILABLE`, with
  `details.reason` = `timeout`, then `invalid-response`, then `network`; in the first two runs stdout
  is empty and both files are unchanged; in the third, stdout is exactly
  `acme-shop: 3 question embeddings -> <acme-shop file>`, the acme-shop file holds its new vectors,
  the task-api file is unchanged; and no `.tmp` file remains in any run

## MODIFIED Requirements

### Requirement: Golden file format

A golden file SHALL be a JSON object with exactly these keys, in this order: `format` (the number
`1`); `project` (the sample project's name); `seed`, an object with exactly `analyzerFingerprint`
and `contractFingerprint`; `answerFingerprint`; `generatedWith`, an object with exactly `model` and
`verifyModel` (non-empty strings); and `entries`, a list of objects with exactly `id` (`Q` followed
by decimal digits), `question` (non-empty), `questionNormalized`, `questionEmbedding`, `response` and
`reviews`, a list of objects with exactly `by` (non-empty) and `date` (`YYYY-MM-DD`).
`questionEmbedding` SHALL be `null` or a list of exactly `EMBEDDING_DIMENSIONS` numbers, every one
finite and at least one different from 0 (a usable vector, `semantic-cache`, "Similarity threshold and
embedded text"): the embedding of the entry's `questionNormalized`. Every fingerprint SHALL be
`sha256:` followed by 64 lowercase hexadecimal digits. The file SHALL hold no generation time.

The canonical render of a golden file SHALL be its JSON text with two-space indentation, keys in the
order above, the keys of each `response` in the order the answer cache stores them, entries in the
golden order, LF line endings and a final line feed. The build SHALL write the canonical render.

#### Scenario: The canonical render is stable

- **GIVEN** a golden file value whose first entry has a usable `questionEmbedding` and whose other
  entries have `null`
- **WHEN** it is rendered, parsed back and rendered again, and rendered once more from a copy whose
  object keys were inserted in another order
- **THEN** the three texts are identical byte for byte, use two-space indentation, contain no `\r`
  byte and end with exactly one line feed; and in each entry `questionEmbedding` comes right after
  `questionNormalized` and right before `response`

#### Scenario: Golden files with an invalid shape are rejected

- **GIVEN** a valid golden file value and, one at a time, copies with `format` `2`, an extra
  top-level key, a fingerprint in upper case, an entry id `X1`, a review date `2026-13-01`, an
  entry without `reviews`, an entry without `questionEmbedding`, an entry whose `questionEmbedding`
  has `EMBEDDING_DIMENSIONS − 1` numbers, one whose vector holds the string `"1"`, and one whose
  vector is `EMBEDDING_DIMENSIONS` zeros
- **WHEN** each is checked as a golden file
- **THEN** the valid one is accepted and each copy is rejected

### Requirement: Partial regeneration

With `--project <name>` and question ids the build SHALL read that project's existing golden file
before rebuilding any history and before connecting, and SHALL fail with `GOLDEN_STALE`, the message
`golden file cannot be partially regenerated (<reason>): run npm run cache:build` and
`details.reason` = `<reason>` when: the file does not exist (`missing`); it is not a valid golden file
by the checks `db:seed` applies, or it holds an entry whose id is not a golden question of the project
(`invalid`); its seed or answer fingerprint differs from the current one (`fingerprint`); or its
answer or verification model differs from the configured one (`model`). Otherwise it SHALL
regenerate only the named questions and write a file holding the existing entries that were not
named, identical to the existing ones (their `reviews` and `questionEmbedding` included), and the
regenerated ones, in the golden order; a golden question absent from the existing file and not named
stays absent. A regenerated entry SHALL have empty `reviews` and a `null` `questionEmbedding` (its
vector is filled by "Golden embeddings command"). Without question ids every golden question of each
requested project SHALL be regenerated and every `reviews` list of its file SHALL be empty and every
`questionEmbedding` `null`.

#### Scenario: Only the named question is regenerated

- **GIVEN** a golden file of acme-shop with Q1, Q3 and Q4 whose fingerprints and models match the
  current ones, whose Q1 has one review, and whose every entry has a usable `questionEmbedding`
- **WHEN** the cache build runs with `--project acme-shop Q3`
- **THEN** it exits with `0`; the model is asked only Q3; the Q1 and Q4 entries of the new file,
  Q1's review and both vectors included, are identical to the previous ones; the Q3 entry holds the
  new answer with empty `reviews` and a `null` `questionEmbedding`; and the final line counts
  `3 golden answers`; a run with `Q3 --project acme-shop` over the same previous file behaves exactly
  the same (the arguments may come in any order); and a run with `--project acme-shop` over that file
  then regenerates the three questions and leaves every `reviews` list empty and every
  `questionEmbedding` `null`

#### Scenario: A stale golden file is not partially regenerated

- **GIVEN** no golden file; then a golden file that is not valid JSON; then a valid one holding an
  entry `Q7`; then a valid one whose answer fingerprint differs from the current one; then a valid one
  whose answer model differs from `LLM_MODEL`
- **WHEN** the cache build runs with `--project acme-shop Q3`
- **THEN** each run exits with `1` and `GOLDEN_STALE` with `details.reason` = `missing`, `invalid`,
  `invalid`, `fingerprint` and `model` respectively; the model is not called and the file, when it
  existed, is unchanged

### Requirement: The versioned golden file is coherent

Each versioned golden file, `seeds/cache/acme-shop.json` and `seeds/cache/task-api.json`, SHALL be a
valid golden file whose `project` is its file's name, whose entries are exactly that project's golden
questions in order with their ids and texts, whose `questionNormalized` equals the normalized
question, whose every `questionEmbedding` is a usable vector (not `null`), whose every `response` the
answer cache accepts as a stored answered response with empty `priorClaims`, and whose every evidence
`fileId` and `path` name a file row of the versioned seed for that project. Each file SHALL be the
canonical render of its value and SHALL NOT match `/AKIA[A-Z0-9]{16}/`. `seeds/cache/` SHALL hold no
other golden file.

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
