## ADDED Requirements

### Requirement: A broken HEAD propagates git's error

`readHistory` SHALL resolve with an empty history (`head` absent, no commits, no links) only when
`HEAD` names no commit (an unborn branch). When `HEAD` or the ref it names cannot be resolved, and
for any other git failure (git missing, a refused repository ownership, a permission error), it
SHALL reject with git's error unchanged: never an empty history, and never `NotAGitRepository`
unless one of the causes of "Not a repository" applies.

#### Scenario: A broken HEAD rejects the history read

- **GIVEN** a committed repository whose branch ref holds text that is not a sha
- **WHEN** its history is read
- **THEN** the call rejects with git's error, and does not resolve with an empty history

### Requirement: Reading the history executes nothing from the repository

Reading the history SHALL NOT run any program the analysed repository's own configuration names:
no fsmonitor command, no hook, no filter or textconv driver, and no `gpg.program` (signatures are
never verified), and a missing object of a partial clone is never fetched (the read fails with
git's error instead). Neither git's configuration (the repository's local configuration, and the
global and system configuration) nor the caller's git environment variables SHALL change the
returned history: the root commit's files are always linked, renames and
copies are never detected (a rename is a delete plus an add), paths are relative to the top-level
directory and never quoted, a commit's files keep git's default order and diff algorithm, commit
text is read as UTF-8, and no mailmap named by configuration remaps an author. Git runs in the C locale. Attributes are read from the `.gitattributes`
committed at `HEAD` and from the local `.git/info/attributes`, never from an uncommitted
work-tree `.gitattributes` nor from a tree named by configuration. Git attributes are not
configuration: a file that those attributes mark as binary or not diffable carries no line counts,
like any binary file under "Line counts", and the rest of the history is unchanged. A work-tree
entry named like a revision (such as `HEAD`) SHALL NOT change the history either.

#### Scenario: Reading the history executes nothing from the repository

- **GIVEN** a repository with a commit carrying a signature header, whose local configuration names
  programs that write a marker file outside it: a `core.fsmonitor` command, a `core.hooksPath`
  directory of hooks, a `filter.<x>.clean`, `filter.<x>.smudge` and `diff.<x>.textconv` applied to
  every path by `.gitattributes`, and `log.showSignature` with a `gpg.program`
- **WHEN** its history is read
- **THEN** the call resolves and the marker file does not exist

#### Scenario: Repository configuration does not change the history

- **GIVEN** a repository whose root commit adds a file whose name has accented letters, and whose
  local configuration sets `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true`,
  `core.quotePath=true`, `i18n.logOutputEncoding=ISO-8859-1`, a `mailmap.file` that remaps the
  author, a `diff.orderFile` that reorders a commit's files, `diff.algorithm=patience`,
  `core.bigFileThreshold=1`, `diff.ignoreSubmodules=all` and an `attr.tree` naming a tree whose
  `.gitattributes` marks every path `-diff`, and whose work tree holds an uncommitted
  `.gitattributes` with the same line
- **WHEN** its history is read
- **THEN** the result equals the history read from the same repository without that configuration,
  and the root commit links the accented path, verbatim

#### Scenario: A work-tree entry named HEAD does not change the history

- **GIVEN** a committed repository with an untracked file named `HEAD` at its top level
- **WHEN** its history is read
- **THEN** the result equals the history read without that file

#### Scenario: A file marked not diffable by attributes carries no line counts

- **GIVEN** a repository with two committed text files, and a `.git/info/attributes` that marks one
  of them `-diff`
- **WHEN** its history is read
- **THEN** that file's links carry neither `linesAdded` nor `linesRemoved`
- **AND** everything else equals the history read from the same repository without that attributes
  file

#### Scenario: Reading the history never fetches a missing object

- **GIVEN** a committed repository declared a partial clone of a promisor remote whose upload
  program writes a marker file outside it, with the blob of a committed file removed
- **WHEN** its history is read
- **THEN** the call rejects with git's error and the marker file does not exist

## MODIFIED Requirements

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

#### Scenario: A .git directory or a bare repository is rejected

- **GIVEN** the `.git` directory of a committed repository, and a bare repository
- **WHEN** the history of each is read
- **THEN** each call rejects with `NotAGitRepository`
