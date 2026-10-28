## MODIFIED Requirements

### Requirement: Command contract and configuration

`npm run seed:build` SHALL take no arguments. It SHALL read `AUTHOR_HASH_SALT` and `DATABASE_URL`
from the environment, trimmed; a variable that is unset, empty or only whitespace SHALL fail with
`MISSING_CONFIG` and `details.variable` naming it (`AUTHOR_HASH_SALT` is checked first). Both
checks SHALL happen before any history is rebuilt, before any database connection and before the
seed file or the sample-project constant is touched.

`ALLOWED_REPOS_DIR` of the environment SHALL be ignored: the allowed root of the build SHALL be the
repository's `fixtures/` directory.

The exit code SHALL be `0` on success and `1` on any failure. The build SHALL print no progress. On
success, stdout SHALL be exactly one line per sample project of the seed, in name order (code-unit
order), `<name>: <files> files, <symbols> symbols, <edges> edges, <commits> commits -> <output>`, with
that project's counts in the written seed, and stderr SHALL be empty; no line SHALL mention the
sample-project constant. `<output>` SHALL be the seed file's path relative to the repository root,
with `/` separators, when the file is inside the repository root; when it is outside (for example
under the OS temporary directory, or on another drive on Windows), `<output>` SHALL be only the file
name. On failure, stdout SHALL stay empty and stderr SHALL hold exactly one line,
`{"error":{"code","message","details"}}`, and nothing else, with the codes of the `index` command
for the same failures (`MISSING_CONFIG`, `DATABASE_UNAVAILABLE`, `PROJECT_NAME_TAKEN`,
`FORBIDDEN_PATH`, `INVALID_GRAPH`, `NOT_A_GIT_REPOSITORY`, `EMPTY_REPOSITORY`), `PARTIAL_WRITE` when
the sample-project constant was written and the seed file was not, and `INTERNAL` for anything else.
An `INTERNAL` failure, which always happens before any file is written, SHALL have the message
`seed build failed; nothing was written`. No output SHALL contain an absolute path, the database URL
or its credentials, or the text `may have been saved`.

#### Scenario: Missing configuration fails before anything else

- **GIVEN** a previous seed file and a previous sample-project constant with known contents, and
  `AUTHOR_HASH_SALT` unset, then empty, then `'   '`; and then a valid salt with `DATABASE_URL`
  unset, then `'   '`
- **WHEN** the seed build runs
- **THEN** each run exits with `1`, stdout is empty, stderr holds one error line with code
  `MISSING_CONFIG` and `details.variable` = `AUTHOR_HASH_SALT` or `DATABASE_URL`; no history is
  rebuilt, no database connection is opened, and the previous seed file and the previous constant
  are unchanged

#### Scenario: An unreachable database is reported without its URL by the seed build

- **GIVEN** a valid salt and `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db`, and a previous seed
  file with known content
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `DATABASE_UNAVAILABLE`; neither stdout nor stderr contains the URL,
  `s3cret` or `u:`; the previous seed file is unchanged

#### Scenario: The allowed repositories directory of the environment is ignored

- **GIVEN** a migrated database, a valid salt, and `ALLOWED_REPOS_DIR` empty, and then pointing to an
  unrelated existing directory
- **WHEN** the seed build runs
- **THEN** each run exits with `0` and writes the same seed as a run without `ALLOWED_REPOS_DIR`

### Requirement: Seed content

The seed SHALL hold exactly two projects, `acme-shop` and `task-api`, each built from its sample
repository under `fixtures/` with its history rebuilt from its versioned manifest, acme-shop indexed
as `php` and task-api as `typescript`. After the header, the seed SHALL hold one block per project,
in name order (`acme-shop`, then `task-api`); each block SHALL contain, in this order: one `INSERT`
into `project`, then the `INSERT`s of that project into `file`, `symbol`, `edge`, `commit` and
`file_commit`. Every `INSERT` SHALL name its columns explicitly. The seed SHALL NOT contain rows of
`claim`, `evidence`, `query_log` or `cache_entry`, any `embedding` value, any `DELETE`,
`ON CONFLICT`, transaction statement or session setting.

Each project row SHALL have `is_sample = true`, `root_path` = `fixtures/<name>`, `indexed_commit` =
the `HEAD` commit of its rebuilt history, `created_at` and `indexed_at` = that commit's date,
`node_count` = the number of `file` plus `symbol` rows of that project in the seed and `edge_count` =
the number of its `edge` rows. acme-shop's row SHALL have `language = 'php'` and
`framework = 'laravel'`; task-api's row SHALL have `language = 'typescript'` and
`framework = 'fastify'`. The rows of acme-shop SHALL depend only on acme-shop's sources, history and
the analyzer: adding task-api SHALL NOT change any of them.

The seed SHALL NOT contain a secret the indexing redacts, an absolute path of the machine that built
it, or a commit author's name or e-mail address (authors appear only as `author_hash`).

#### Scenario: The acme-shop seed is generated

- **GIVEN** a migrated database, `AUTHOR_HASH_SALT=test-salt`, and the build pointed at copies of the
  two sample repositories (without `.git` nor `node_modules`) under a temporary directory and at a
  temporary output file
- **WHEN** the seed build runs
- **THEN** it exits with `0`; the output holds one header, then the acme-shop block and then the
  task-api block; the acme-shop block holds one `project` row with the attributes above and
  `indexed_commit` = `git rev-parse HEAD` of its copy, then `file`, `symbol`, `edge`, `commit` and
  `file_commit` rows in that order; its `node_count` and `edge_count` equal its row counts in the
  output; stdout is exactly two lines, the acme-shop line and then the task-api line, each naming that
  project's counts and the output file name, and stderr is empty; and the output does not match
  `/AKIA[A-Z0-9]{16}/`, does not contain the temporary directory's path, and does not contain
  `@acme.test`

#### Scenario: The task-api block of the seed is generated

- **GIVEN** the build of "The acme-shop seed is generated"
- **WHEN** its output is read
- **THEN** the task-api block holds one `project` row with `name = 'task-api'`, `is_sample = true`,
  `language = 'typescript'`, `framework = 'fastify'`, `root_path = 'fixtures/task-api'` and
  `indexed_commit` = `git rev-parse HEAD` of the task-api copy, then `file`, `symbol`, `edge`,
  `commit` and `file_commit` rows in that order, every one of them with task-api's project id; its
  `node_count` and `edge_count` equal its row counts in the output and the counts of the task-api
  stdout line; it holds a `file` row for `src/config/env.ts`, a `symbol` row `function taskRoutes`,
  `calls` edges only with `resolution` `exact`; and the output does not contain `@taskapi.test`

#### Scenario: Adding task-api leaves the acme-shop rows unchanged

- **GIVEN** the build of "The acme-shop seed is generated" and the versioned
  `seeds/graph-dump.sql` of `final-project-CRN` before this change
- **WHEN** their acme-shop blocks are compared
- **THEN** every line of the acme-shop block of the new seed is identical to the corresponding line of
  the old seed; of the header, only the analyzer fingerprint line differs

This scenario is checked once, on the regenerated versioned seed of this change, by a recorded
comparison in the test-and-state report (the old seed is the one of the merge base), not by a test.

### Requirement: The database is never changed

The build SHALL NOT commit anything to the database: each project SHALL be indexed in its own
transaction, one after the other, and every row the indexing writes SHALL be read back and then
rolled back, on success and on failure, and every connection SHALL always be closed. The build SHALL
index each project under the temporary project name `__codemind_seed_build__` and write its real name
in the seed, so an existing project named `acme-shop` or `task-api` neither blocks the build nor is
touched.

#### Scenario: The database is unchanged after a build

- **GIVEN** a migrated database and the set of its project ids
- **WHEN** the seed build runs and succeeds, using its own connection to `DATABASE_URL`
- **THEN** the set of project ids is the same afterwards and no project named
  `__codemind_seed_build__` exists

#### Scenario: An existing acme-shop project does not block the build

- **GIVEN** a database that already holds a project named `acme-shop` and one named `task-api`
- **WHEN** the seed build runs
- **THEN** it exits with `0`, writes the seed, and the existing `acme-shop` and `task-api` projects
  keep their ids and their row counts

### Requirement: Byte-for-byte reproducibility

Two builds with the same sources, the same history manifests and the same `AUTHOR_HASH_SALT` SHALL
write identical files, whatever the ids already in the database, the time zone of the process or
the order in which the database returns rows.

#### Scenario: Two consecutive builds produce identical files

- **GIVEN** a migrated database that already holds other projects, and the build of "The seed of both
  samples is generated"
- **WHEN** the seed build runs twice in a row with the same salt
- **THEN** both outputs are identical byte for byte, both sample-project constants are identical
  byte for byte, and none of their ids equals an id in the database

#### Scenario: The time zone does not change the file

- **GIVEN** the build of "The acme-shop seed is generated"
- **WHEN** it runs once with the process time zone `UTC` and once with `America/Bogota`
- **THEN** both outputs are identical byte for byte

### Requirement: Fingerprints

The seed SHALL start with the header lines `-- codemind-seed-format: 1`,
`-- analyzer-fingerprint: sha256:<64 lowercase hex>` and
`-- contract-fingerprint: sha256:<64 lowercase hex>`, once for the whole seed. Each fingerprint SHALL
be the SHA-256 of its inputs, taken in path order, each one as its repository-relative path and its
content with line endings normalised to LF:

- analyzer — every repository file that produces the seed's rows: every file under
  `packages/analyzers/php/src/`, `packages/analyzers/typescript/src/`, `packages/core/src/index/`,
  `packages/core/src/knowledge/`, `packages/cli/src/seed/`, `packages/adapters/git/src/`,
  `packages/adapters/store-postgres/src/`, `fixtures/history/`, `fixtures/acme-shop/` and
  `fixtures/task-api/`; the files `packages/cli/src/seed-build.ts`,
  `packages/cli/src/compose-index.ts` and `fixtures/build-history.mjs`; and one synthetic input per
  parser dependency, `deps:tree-sitter-php@<version>`, `deps:typescript@<version>` and
  `deps:web-tree-sitter@<version>`, with the versions resolved in `package-lock.json`. Any path with a
  `.git` or a `node_modules` segment is excluded;
- contract: `packages/core/src/ports/AnalyzerPort.ts` and every
  `packages/adapters/store-postgres/migrations/*.up.sql`.

A fingerprint SHALL depend only on those inputs: not on line endings, on the order in which files
are listed, or on any other file.

#### Scenario: A fingerprint ignores line endings and listing order

- **GIVEN** a set of inputs
- **WHEN** the fingerprint is computed twice, once more with the same contents in CRLF, and once more
  with the inputs listed in another order
- **THEN** the four fingerprints are equal

#### Scenario: A fingerprint changes with content, files or parser versions

- **GIVEN** a set of inputs and its fingerprint
- **WHEN** one byte of one input changes, then one input is added, then the resolved version of
  `tree-sitter-php`, then of `typescript`, and then of `web-tree-sitter`, changes
- **THEN** each of the five fingerprints differs from the original

#### Scenario: Each fingerprint covers exactly its declared inputs

- **GIVEN** a repository tree holding every declared input and files outside them
  (`packages/api/src/x.ts`, `packages/cli/src/index.ts`, `fixtures/README.md`, a `.down.sql`
  migration, `fixtures/acme-shop/.git/`, `fixtures/task-api/.git/` and
  `fixtures/task-api/node_modules/`)
- **WHEN** a file changes under each analyzer input directory and in each analyzer input file, in
  `AnalyzerPort.ts` and in one `.up.sql` migration, and then every outside file changes and a file is
  added under `fixtures/acme-shop/.git/`, `fixtures/task-api/.git/` and
  `fixtures/task-api/node_modules/`
- **THEN** each analyzer change alters only the analyzer fingerprint, each contract change alters only
  the contract fingerprint, and the outside changes alter neither

### Requirement: A failed build never leaves a broken seed

The build SHALL write the sample-project constant first and the seed file second, only after both
projects were indexed and read back. Each of the two files SHALL be replaced only once its whole new
content is written: a failed write SHALL leave that file byte for byte as it was, and no partial or
temporary file SHALL remain next to either of them. A failure before the constant is written leaves
both files as they were, whichever project it happens in. A failure after an indexing, while its rows
are being read back, SHALL be reported as `INTERNAL` with the message
`seed build failed; nothing was written`, with that indexing's writes rolled back and its connection
closed. A failure to write the constant SHALL be reported as `INTERNAL` with the message
`seed build failed; nothing was written`, and the seed file SHALL NOT be written. A failure to write
the seed file after the constant was written SHALL be reported as `PARTIAL_WRITE` with the message
`seed build failed after writing <constant>; <seed> was not written — run npm run seed:build again`
and `details` = `{"written":["<constant>"]}`, where `<constant>` and `<seed>` follow the rule of
`<output>`; the constant SHALL keep its new content.

#### Scenario: A failed indexing leaves the previous seed intact

- **GIVEN** a previous seed file with known content and an indexing that throws, first for acme-shop
  and then, in another run, only for task-api (after acme-shop was indexed)
- **WHEN** the seed build runs
- **THEN** each run exits with `1` and `INTERNAL` with the message `seed build failed; nothing was
  written`; stdout is empty and stderr holds exactly one line; every transaction opened is rolled
  back and released; the seed file and the sample-project constant are unchanged and no temporary
  file remains next to them

#### Scenario: A failed read-back is not reported as saved

- **GIVEN** a previous seed file with known content and an indexing that succeeds, followed by a
  failure while its rows are read back
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `seed build failed; nothing was
  written`; no output contains `may have been saved`; nothing was committed (the transaction is
  rolled back and released); the seed file is unchanged

#### Scenario: A failed write of the constant leaves both files intact

- **GIVEN** a previous seed file and a previous sample-project constant with known contents, and an
  indexing that succeeds, followed by a failure while the constant is written
- **WHEN** the seed build runs
- **THEN** it exits with `1`, stdout is empty, and stderr holds exactly one line with code `INTERNAL`
  and the message `seed build failed; nothing was written`; the constant and the seed file are
  unchanged; and no file matching `.*.tmp` remains next to either of them

#### Scenario: A failed write of the seed after the constant is a partial write

- **GIVEN** a previous seed file with known content, and an indexing that succeeds, followed by a
  failure while the seed file is written after the constant was written
- **WHEN** the seed build runs
- **THEN** it exits with `1`, stdout is empty, and stderr holds exactly one line with code
  `PARTIAL_WRITE`, the message
  `seed build failed after writing <constant>; <seed> was not written — run npm run seed:build again`
  and `details` = `{"written":["<constant>"]}`, with `<constant>` and `<seed>` displayed by the rule
  of `<output>`; no output contains an absolute path or `may have been saved`; the constant holds the
  new content; and the seed file is unchanged

### Requirement: Sample-project constant

On success the build SHALL also write the sample-project constant,
`packages/web/src/data/sample-projects.ts`, rendered from the same rows as the seed. Its content
SHALL be exactly, with LF line endings and a final line feed:

```ts
// Generated by `npm run seed:build`; do not edit by hand.

export const SAMPLE_PROJECTS = [
  {
    id: '<id>',
    name: '<name>',
    language: '<language>',
    framework: '<framework>',
    fileCount: <files>,
    symbolCount: <symbols>,
    edgeCount: <edges>,
    commitCount: <commits>,
  },
] as const;
```

with one object per project of the seed (the block between `[` and `]` repeated, with nothing
between two objects), ordered by name; `<id>` the project's id in the seed;
`<framework>` quoted, or `null` without quotes when the project has none; and the four counts equal
to the number of `file`, `symbol`, `edge` and `commit` rows of that project in the seed. The text
SHALL depend only on the rows, not on their order, and SHALL pass the repository's lint and type
checks (`packages/web/tsconfig.json`) without any lint exception for the file.

#### Scenario: The sample-project constant is generated

- **GIVEN** the build of "The acme-shop seed is generated", with the constant directed to a
  temporary file
- **WHEN** the seed build runs
- **THEN** it exits with `0`; the constant is exactly the template above with an acme-shop object and
  then a task-api object, each with the `id` the seed writes for that project and the `fileCount`,
  `symbolCount`, `edgeCount` and `commitCount` of that project's stdout line, and task-api's object
  with `language: 'typescript'` and `framework: 'fastify'`; and stdout is the same two lines as
  without the constant

#### Scenario: The constant does not depend on row order

- **GIVEN** the rows of two projects with random ids
- **WHEN** the constant is rendered, and rendered again with the projects given in the other order,
  the rows of each table shuffled and other random ids
- **THEN** both texts are identical byte for byte

#### Scenario: The versioned constant matches the versioned seed

- **GIVEN** the versioned `packages/web/src/data/sample-projects.ts` and `seeds/graph-dump.sql`
- **WHEN** they are compared
- **THEN** the constant holds exactly one object per `INSERT INTO project` of the seed, with the same
  `id`, `name`, `language` and `framework`, and counts equal to the number of `INSERT`s into `file`,
  `symbol`, `edge` and `commit` for that `project_id`; and the names are `acme-shop` and `task-api`, in
  that order

#### Scenario: The generated constant passes lint and type checks

- **GIVEN** the versioned constant
- **WHEN** it is linted with the repository's lint configuration and type-checked with the options
  of `packages/web/tsconfig.json`
- **THEN** both report no problem, the file holds no `eslint-disable` comment, and the lint
  configuration does not ignore it
