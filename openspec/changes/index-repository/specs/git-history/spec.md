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
never verified). The repository's configuration SHALL NOT change the returned history either: the
root commit's files are always linked, renames and copies are never detected (a rename is a delete
plus an add), paths are relative to the top-level directory and never quoted, and commit text is
read as UTF-8.

#### Scenario: Reading the history executes nothing from the repository

- **GIVEN** a repository with a commit carrying a signature header, whose local configuration names
  programs that write a marker file outside it: a `core.fsmonitor` command, a `core.hooksPath`
  directory of hooks, a `filter.<x>.clean`, `filter.<x>.smudge` and `diff.<x>.textconv` applied to
  every path by `.gitattributes`, and `log.showSignature` with a `gpg.program`
- **WHEN** its history is read
- **THEN** the call resolves and the marker file does not exist

#### Scenario: Repository configuration does not change the history

- **GIVEN** a repository whose root commit adds a file whose name has accented letters, and whose
  local configuration sets `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true` and
  `core.quotePath=true`
- **WHEN** its history is read
- **THEN** the result equals the history read from the same repository without that configuration,
  and the root commit links the accented path, verbatim
