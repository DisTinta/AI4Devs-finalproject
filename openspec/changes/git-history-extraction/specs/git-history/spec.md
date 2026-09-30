## Purpose

How the domain reads a repository's Git history through `GitPort`: commits, the files each commit
touched with their line counts, and the pull-request number, with every author pseudonymised so that
no contributor's name or e-mail ever reaches the knowledge-graph store.

## ADDED Requirements

### Requirement: History reading

`GitPort.readHistory(repoPath)` SHALL return the history of the repository whose top-level
directory is `repoPath`, as a `GitHistory` with:

- `head`: the sha of `HEAD`;
- `commits`: every commit reachable from `HEAD`, exactly once, newest first, each with its `sha`, its
  sanitised `message`, its `authorHash` and its `committedAt` (the committer date);
- `fileCommits`: one link per file a non-merge commit touched, with the repository-relative path
  using `/` as separator and the commit's `sha`.

Every `sha` of `fileCommits` SHALL be the `sha` of an element of `commits`. The result SHALL be
accepted by the graph validation of `graph-store` once its paths are in `files`. Reading SHALL NOT
modify the repository.

#### Scenario: The acme-shop history is read completely

- **GIVEN** `fixtures/acme-shop` rebuilt by `node fixtures/build-history.mjs acme-shop`
- **WHEN** its history is read
- **THEN** `commits` has 32 elements with 32 distinct shas, newest first, and `head` equals the sha
  of its first element and of the repository's `HEAD`
- **AND** the commit whose message starts with `fix: apply discount before tax` has
  `committedAt` = 2024-05-02T14:49:00Z and links to `app/Services/PriceCalculator.php` and
  `config/shop.php`

#### Scenario: A repository without commits yields an empty history

- **GIVEN** a repository created with `git init` and no commit
- **WHEN** its history is read
- **THEN** the result is `{ head: undefined, commits: [], fileCommits: [] }` and no error is raised

### Requirement: Author pseudonymisation

Each commit's `authorHash` SHALL be a keyed hash, with the configured salt as key, of the author's
e-mail normalised by trimming and lower-casing (of the normalised author name when the e-mail is
empty), encoded as 64 lowercase hexadecimal characters.

- The same author and salt SHALL always yield the same `authorHash`; different salts SHALL yield
  different ones.
- No field of a `GitHistory` SHALL contain an author's or committer's name or e-mail.

#### Scenario: Commits of one author share a hash

- **GIVEN** the acme-shop history read twice with the same salt
- **THEN** every commit has the same `authorHash` in both reads, each is 64 lowercase hex characters,
  and there are exactly 3 distinct values, one per author

#### Scenario: A different salt changes every hash

- **GIVEN** the acme-shop history read with salt A and with salt B
- **THEN** no `authorHash` of the first read appears in the second

#### Scenario: E-mail case and surrounding whitespace do not change the hash

- **WHEN** the identities `' Ana@X.test '` and `'ana@x.test'` are pseudonymised with the same salt
- **THEN** both hashes are equal

#### Scenario: An empty e-mail falls back to the normalised name

- **WHEN** the identities `{ name: ' Ana Pérez ', email: '' }` and
  `{ name: 'ana pérez', email: '   ' }` are pseudonymised with the same salt
- **THEN** both hashes are equal to the hash of the name `ana pérez` (trimmed and lower-cased)
- **AND** they differ from the hash of `{ name: 'ana pérez', email: 'ana@x.test' }`

### Requirement: Salt is mandatory

The adapter SHALL receive the salt as an explicit value when it is created and SHALL NOT read the
environment itself. A separate helper SHALL read the salt from the `AUTHOR_HASH_SALT` environment
variable on behalf of the composition root, which is outside this capability.

- The helper MUST fail when `AUTHOR_HASH_SALT` is missing, empty or whitespace-only.
- Creating the adapter MUST fail when the salt it receives is empty or whitespace-only.
- Both failures MUST happen before any Git process runs, with an error whose message names
  `AUTHOR_HASH_SALT` and does not contain the salt value.
- There SHALL be no unsalted fallback.

#### Scenario: A missing or blank salt is rejected

- **WHEN** the helper reads an environment without `AUTHOR_HASH_SALT`, and one where it is `'   '`,
  and the adapter is created with the salt `'   '`
- **THEN** all three fail with an error whose message names `AUTHOR_HASH_SALT`, and no Git process
  has run

### Requirement: Message sanitisation

A commit's `message` SHALL be its full message with every trailer line that identifies a person
removed: lines starting, case-insensitively, with `Co-authored-by:`, `Signed-off-by:`,
`Reviewed-by:`, `Acked-by:`, `Reported-by:`, `Tested-by:` or `Suggested-by:`. Trailing blank lines
left by the removal SHALL be trimmed. Other lines SHALL be kept verbatim.

#### Scenario: Identity trailers are removed from the message

- **GIVEN** a commit with message `feat: x (#7)`, a blank line, `Co-authored-by: Jane Doe <jane@x.test>`
  and `Signed-off-by: Jane Doe <jane@x.test>`
- **WHEN** the history is read
- **THEN** its `message` is `feat: x (#7)` and contains neither `Jane` nor `jane@x.test`

### Requirement: Pull request number

A commit's `prNumber` SHALL be taken from its subject (first line) only:

- the number of the last `(#N)` in the subject; otherwise
- the number `N` of a subject starting with `Merge pull request #N`; otherwise
- absent.

`N` SHALL be a non-negative decimal integer.

#### Scenario: A squash-style number is extracted

- **WHEN** the PR number of `fix: a (#3) and b (#61)` is extracted
- **THEN** it is 61

#### Scenario: A merge-commit number is extracted

- **WHEN** the PR number of `Merge pull request #12 from org/branch` is extracted
- **THEN** it is 12

#### Scenario: A message without a number has none

- **WHEN** the PR number of `chore: y`, and of `chore: y` with body line `see (#9)`, is extracted
- **THEN** it is absent in both cases

#### Scenario: The acme-shop PR numbers are extracted

- **GIVEN** the acme-shop history
- **THEN** exactly 17 commits have a `prNumber`, and the `fix: apply discount before tax` commit has
  `prNumber` 61

### Requirement: Line counts

Each `fileCommits` element SHALL carry `linesAdded` and `linesRemoved` as Git counts them for that
file in that commit. For a binary file both SHALL be absent (never negative, never `NaN`).

#### Scenario: Text and binary files are counted correctly

- **GIVEN** a repository whose commit adds a 3-line text file and a binary file
- **WHEN** its history is read
- **THEN** the text file's link has `linesAdded` 3 and `linesRemoved` 0
- **AND** the binary file's link has neither `linesAdded` nor `linesRemoved`

### Requirement: Not a repository

`readHistory` MUST reject with the domain error `NotAGitRepository` (code `NOT_A_GIT_REPOSITORY`,
carrying the path) when `repoPath` does not exist, is not inside a Git repository, or is inside one
but is not its top-level directory. Nothing SHALL be returned.

#### Scenario: A directory without Git is rejected

- **GIVEN** a temporary directory outside any Git repository
- **WHEN** its history is read
- **THEN** the call rejects with `NotAGitRepository` naming that path

#### Scenario: A subdirectory of a repository is rejected

- **GIVEN** a repository with a subdirectory `src`
- **WHEN** the history of `<repo>/src` is read
- **THEN** the call rejects with `NotAGitRepository`

#### Scenario: A non-existent path is rejected

- **GIVEN** a path under a temporary directory that does not exist
- **WHEN** its history is read
- **THEN** the call rejects with `NotAGitRepository` naming that path

### Requirement: Persisted history holds no personal data

A `GitHistory`, saved through `StorePort.saveGraph` together with the files it references, SHALL
persist its commits and file–commit links with no author or committer name or e-mail in any stored
row.

#### Scenario: The acme-shop history is persisted without names or e-mails

- **GIVEN** a new project and the acme-shop history
- **WHEN** a graph with `indexedCommit` = `head`, one file per distinct path of `fileCommits`, no
  symbols or edges, and the history's commits and links is saved
- **THEN** the save reports 32 commits, and the project has 32 `commit` rows, 17 with `pr_number`,
  3 distinct `author_hash` values, and the `(#61)` commit has `pr_number` 61, `committed_at`
  2024-05-02T14:49:00Z and links to `app/Services/PriceCalculator.php` and `config/shop.php` with
  `lines_added + lines_removed > 0`
- **AND** no `commit` or `file_commit` row of the project contains any of the fixture's author names
  or e-mails, nor the string `@acme.test`
