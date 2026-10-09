## MODIFIED Requirements

### Requirement: Command contract and configuration

`npm run seed:build` SHALL take no arguments. It SHALL read `AUTHOR_HASH_SALT` and `DATABASE_URL`
from the environment, trimmed; a variable that is unset, empty or only whitespace SHALL fail with
`MISSING_CONFIG` and `details.variable` naming it (`AUTHOR_HASH_SALT` is checked first). Both
checks SHALL happen before the history is rebuilt, before any database connection and before the
seed file or the sample-project constant is touched.

`ALLOWED_REPOS_DIR` of the environment SHALL be ignored: the allowed root of the build SHALL be the
repository's `fixtures/` directory.

The exit code SHALL be `0` on success and `1` on any failure. The build SHALL print no progress. On
success, stdout SHALL be exactly one line,
`acme-shop: <files> files, <symbols> symbols, <edges> edges, <commits> commits -> <output>`, with the
counts of the written seed, and stderr SHALL be empty; the line SHALL NOT mention the sample-project
constant. `<output>` SHALL be the seed file's path relative to the repository root, with `/`
separators, when the file is inside the repository root; when it is outside (for example under the
OS temporary directory, or on another drive on Windows), `<output>` SHALL be only the file name. On
failure, stdout SHALL stay empty and stderr SHALL hold exactly one line,
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
  `MISSING_CONFIG` and `details.variable` = `AUTHOR_HASH_SALT` or `DATABASE_URL`; the history is not
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

### Requirement: A failed build never leaves a broken seed

The build SHALL write the sample-project constant first and the seed file second. Each of the two
files SHALL be replaced only once its whole new content is written: a failed write SHALL leave that
file byte for byte as it was, and no partial or temporary file SHALL remain next to either of them.
A failure before the constant is written leaves both files as they were. A failure after the
indexing, while its rows are being read back, SHALL be reported as `INTERNAL` with the message
`seed build failed; nothing was written`, with the indexing's writes rolled back and the connection
closed. A failure to write the constant SHALL be reported as `INTERNAL` with the message
`seed build failed; nothing was written`, and the seed file SHALL NOT be written. A failure to write
the seed file after the constant was written SHALL be reported as `PARTIAL_WRITE` with the message
`seed build failed after writing <constant>; <seed> was not written — run npm run seed:build again`
and `details` = `{"written":["<constant>"]}`, where `<constant>` and `<seed>` follow the rule of
`<output>`; the constant SHALL keep its new content.

#### Scenario: A failed indexing leaves the previous seed intact

- **GIVEN** a previous seed file with known content and an indexing that throws
- **WHEN** the seed build runs
- **THEN** it exits with `1` and `INTERNAL` with the message `seed build failed; nothing was
  written`; stderr holds exactly one line; the transaction is rolled back and released; the seed
  file is unchanged and no temporary
  file remains next to it

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

## ADDED Requirements

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

with one object per project of the seed, ordered by name; `<id>` the project's id in the seed;
`<framework>` quoted, or `null` without quotes when the project has none; and the four counts equal
to the number of `file`, `symbol`, `edge` and `commit` rows of that project in the seed. The text
SHALL depend only on the rows, not on their order, and SHALL pass the repository's lint and type
checks (`packages/web/tsconfig.json`) without any lint exception for the file.

#### Scenario: The sample-project constant is generated

- **GIVEN** the build of "The acme-shop seed is generated", with the constant directed to a
  temporary file
- **WHEN** the seed build runs
- **THEN** it exits with `0`; the constant is exactly the template above with one acme-shop object
  whose `id` equals the project id written in the seed and whose `fileCount`, `symbolCount`,
  `edgeCount` and `commitCount` equal the counts of the stdout line; and stdout is the same single
  line as without the constant

#### Scenario: The constant does not depend on row order

- **GIVEN** the rows of one project with random ids
- **WHEN** the constant is rendered, and rendered again with the rows of each table shuffled and
  other random ids
- **THEN** both texts are identical byte for byte

#### Scenario: The versioned constant matches the versioned seed

- **GIVEN** the versioned `packages/web/src/data/sample-projects.ts` and `seeds/graph-dump.sql`
- **WHEN** they are compared
- **THEN** the constant holds exactly one object per `INSERT INTO project` of the seed, with the same
  `id`, `name`, `language` and `framework`, and counts equal to the number of `INSERT`s into `file`,
  `symbol`, `edge` and `commit` for that `project_id`

#### Scenario: The generated constant passes lint and type checks

- **GIVEN** the versioned constant
- **WHEN** it is linted with the repository's lint configuration and type-checked with the options
  of `packages/web/tsconfig.json`
- **THEN** both report no problem, the file holds no `eslint-disable` comment, and the lint
  configuration does not ignore it
