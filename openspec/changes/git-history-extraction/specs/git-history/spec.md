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
  using `/` as separator, exactly as the repository stores it (never quoted or escaped), and the
  commit's `sha`.

Every `sha` of `fileCommits` SHALL be the `sha` of an element of `commits`. The result SHALL be
accepted by the graph validation of `graph-store` once its paths are in `files`. Reading SHALL NOT
modify the repository.

Characters that Git allows inside names, e-mails, messages or paths (control characters such as
`\x1e` and `\x1f`, quotes, tabs, backslashes) SHALL NOT shift one commit's values into another field
or another commit: each value SHALL arrive in its own field, intact.

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

#### Scenario: Reading does not modify the repository

- **GIVEN** a repository with commits and an uncommitted change in its working tree
- **WHEN** its history is read
- **THEN** its `HEAD`, its refs, its `git status` output and the modification time of its index are
  the same as before the read

#### Scenario: A merge commit is listed without file links

- **GIVEN** a repository whose `HEAD` is a merge commit (`git merge --no-ff`) of a branch that
  changed one file
- **WHEN** its history is read
- **THEN** the merge commit is one of `commits`, and no element of `fileCommits` has its `sha`
- **AND** the branch commit that changed the file has its link

#### Scenario: Control characters in names and messages stay in their field

- **GIVEN** a commit whose author name contains `\x1f` twice (e-mail `ana@x.test`) and whose message
  is `feat: sep \x1e and \x1f (#5)` followed by a body line
- **WHEN** the history is read
- **THEN** there is exactly one commit; its `message` equals the commit's raw message, control
  characters included; its `authorHash` is the hash of `ana@x.test`; its `committedAt` is a valid
  date; its `prNumber` is 5; and its file link has the committed path
- **AND** the serialised history contains neither `ana@x.test` nor the author name

#### Scenario: Paths Git would quote arrive verbatim

- **GIVEN** a commit adding the paths `q"uote.txt` and `t<TAB>tab.txt`
- **WHEN** the history is read
- **THEN** `fileCommits` has links with exactly those two paths, with no surrounding quotes or
  escape sequences

### Requirement: Author pseudonymisation

Each commit's `authorHash` SHALL be a keyed hash, with the configured salt as key, of the author's
e-mail normalised by trimming and lower-casing (of the normalised author name when the e-mail is
empty), encoded as 64 lowercase hexadecimal characters.

- The same author and salt SHALL always yield the same `authorHash`; different salts SHALL yield
  different ones.
- `authorHash` SHALL never hold a raw identity, and no other structured value of a `GitHistory`
  (`head`, `sha`, `committedAt`, `prNumber`, `fileCommits`) SHALL contain the author's or
  committer's name or e-mail.
- `message` SHALL contain none of the identity trailers of *Message sanitisation*. Free text
  elsewhere in a message body — other trailers such as `Helped-by:` or `Cc:`, or names and e-mails
  written in prose — is kept verbatim and is outside this capability (no content scrubbing).

#### Scenario: Commits of one author share a hash

- **GIVEN** the acme-shop history read twice with the same salt
- **THEN** every commit has the same `authorHash` in both reads, each is 64 lowercase hex characters,
  and there are exactly 3 distinct values, one per author

#### Scenario: The returned history holds no name or e-mail

- **GIVEN** the acme-shop history, read without any database
- **WHEN** the whole returned `GitHistory` is serialised
- **THEN** it contains none of the fixture's author or committer names or e-mails, nor the string
  `@acme.test`

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

The salt SHALL be trimmed of surrounding whitespace, by the helper and by the adapter, before it is
used: the key of the author hash is the trimmed value, so `' s '` and `'s'` yield the same hashes.

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

#### Scenario: The adapter trims the salt it receives

- **GIVEN** a repository with one commit
- **WHEN** its history is read by an adapter created with the salt `' s '` and by one created with
  `'s'`
- **THEN** both reads give the same `authorHash`

### Requirement: Message sanitisation

A commit's `message` SHALL be its full message with every trailer line that identifies a person
removed: lines starting, case-insensitively and after any leading whitespace, with
`Co-authored-by:`, `Signed-off-by:`, `Reviewed-by:`, `Acked-by:`, `Reported-by:`, `Tested-by:` or
`Suggested-by:`. Trailing whitespace of the resulting message (including the blank lines the removal
leaves) SHALL be trimmed, whether or not a trailer was removed. Every other line SHALL be kept
verbatim, line ends included.

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

`N` SHALL be a decimal integer from 0 to 2147483647 (2^31 − 1), the range the graph store's
`pr_number` column holds. A number outside that range SHALL be treated as no number: `prNumber` is
absent, and the commit is still stored.

#### Scenario: A squash-style number is extracted

- **WHEN** the PR number of `fix: a (#3) and b (#61)` is extracted
- **THEN** it is 61

#### Scenario: A merge-commit number is extracted

- **WHEN** the PR number of `Merge pull request #12 from org/branch` is extracted
- **THEN** it is 12

#### Scenario: A message without a number has none

- **WHEN** the PR number of `chore: y`, and of `chore: y` with body line `see (#9)`, is extracted
- **THEN** it is absent in both cases

#### Scenario: The largest storable number is extracted

- **WHEN** the PR number of `feat: x (#2147483647)` is extracted
- **THEN** it is 2147483647

#### Scenario: A number beyond 32 bits is dropped

- **WHEN** the PR number of `feat: x (#2147483648)`, and of `feat: x (#3000000000)`, is extracted
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
persist its commits and file–commit links with the guarantees of *Author pseudonymisation*: no
author or committer name or e-mail in `author_hash` or any other structured column, and no identity
trailer in `message`. Free text of a message body is stored as read (see *Author pseudonymisation*).

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
