## MODIFIED Requirements

### Requirement: Source tree contract

The source tree port SHALL offer two operations:

- `realPath(path)` SHALL resolve `path` to its canonical absolute path, following every symbolic
  link. A path that does not exist SHALL reject with `NotAGitRepository` naming that path.
- `readFiles(root)` SHALL resolve to `{ files, skipped }`, where `files` are the files tracked in the
  commit `HEAD` names, each `{ path, content }` with `path` repository-relative with `/` separators
  and `content` decoded as UTF-8 (a leading UTF-8 byte order mark is dropped when decoding, so
  `contentHash` is computed over the content without it), and `skipped` lists `{ path, reason }` for each tracked entry it
  did not return. It SHALL read the content stored in that commit, never the working tree: untracked,
  ignored and locally modified files SHALL NOT change the result.

`readFiles` SHALL NOT return the entries below. Each SHALL be reported in `skipped` with exactly one
reason, the first that applies in this order:

1. `non-utf8-path`: the entry's path, as Git stores it, is not valid UTF-8. Its content SHALL NOT be
   read. The reported `path` is the path decoded with each invalid sequence replaced by U+FFFD, for
   display only; two such entries SHALL each be reported, never merged and never reported as
   `duplicate-path`;
2. `symlink`: a symbolic link (Git mode `120000`);
3. `submodule`: a submodule (Git mode `160000`);
4. `too-large`: a file whose stored size is greater than 1 048 576 bytes (1 MiB). Its content SHALL
   NOT be read; a file of exactly 1 048 576 bytes is read;
5. `binary-content`: a file whose bytes are not valid UTF-8.

`readFiles(root)` SHALL reject with `NotAGitRepository` under the same rule as reading the history:
`root` does not exist, is not inside a Git repository, or is inside one but is not its top-level
directory. It SHALL reject with `EmptyRepository` (code `EMPTY_REPOSITORY`) when `HEAD` names no
commit (an unborn branch, even when other branches have commits: only `HEAD` is indexed).
`EmptyRepository` SHALL mean "`HEAD` names no commit", not "no files": a repository whose `HEAD`
commit tracks no file resolves to `{ files: [], skipped: [] }`. Any other git failure (git missing,
a refused repository ownership, a broken `HEAD` or ref, a missing object, a permission error)
propagates as an error; `readFiles` SHALL NOT resolve with a partial result. Reading SHALL never
modify the repository nor execute anything from it (a missing object of a partial clone is never
fetched: the read fails with git's error instead), and neither the repository's own configuration
nor the caller's git environment variables (such as `GIT_DIR` or `GIT_CONFIG_*`) SHALL change what
is read. Git runs in the C locale, so its answers do not depend on the system language. The number
of git processes `readFiles` starts SHALL NOT grow with the number of tracked files.

#### Scenario: Only the files tracked at HEAD are read

- **GIVEN** a throwaway repository under the OS temp dir with one commit tracking `a.php` and
  `.gitignore` (ignoring `ignored.php`), and then, without committing, `a.php` modified on disk, a
  new untracked `b.php` and an ignored `ignored.php`
- **WHEN** `readFiles` reads its root
- **THEN** `files` is exactly `a.php` (with its committed content, not the modified one) and
  `.gitignore`, and `skipped` is empty

#### Scenario: A path that is not a repository root is rejected

- **GIVEN** a path that does not exist, a directory outside any repository, and a subdirectory of a
  repository
- **WHEN** `readFiles` reads each of them
- **THEN** each call rejects with `NotAGitRepository`

#### Scenario: A .git directory or a bare repository is not a repository root

- **GIVEN** the `.git` directory of a committed repository, and a bare repository
- **WHEN** `readFiles` reads each of them
- **THEN** each call rejects with `NotAGitRepository`

#### Scenario: A repository with no commit is rejected

- **GIVEN** a freshly initialised repository with no commit
- **WHEN** `readFiles` reads its root
- **THEN** the call rejects with `EmptyRepository`, whose `code` is `EMPTY_REPOSITORY`

#### Scenario: A HEAD on an orphan branch is rejected as empty

- **GIVEN** a repository with commits on `main` and `HEAD` on a branch created with
  `git checkout --orphan`, with no commit of its own
- **WHEN** `readFiles` reads its root
- **THEN** the call rejects with `EmptyRepository`

#### Scenario: A broken HEAD propagates git's error

- **GIVEN** a committed repository whose branch ref holds text that is not a sha
- **WHEN** `readFiles` reads its root and the history reader reads its history
- **THEN** both reject with git's error, neither with `EmptyRepository` nor with an empty history

#### Scenario: Symbolic links and submodules are skipped and reported

- **GIVEN** a repository whose `HEAD` commit tracks a regular file, a symbolic link
  `lib/link.php` and a submodule `vendor/sub`
- **WHEN** `readFiles` reads its root
- **THEN** `files` holds only the regular file, and `skipped` contains
  `{ path: 'lib/link.php', reason: 'symlink' }` and `{ path: 'vendor/sub', reason: 'submodule' }`

#### Scenario: Content that is not UTF-8 is skipped and reported

- **GIVEN** a repository whose `HEAD` commit tracks a UTF-8 file and a file `logo.bin` holding bytes
  that are not valid UTF-8
- **WHEN** `readFiles` reads its root
- **THEN** `files` holds only the UTF-8 file and `skipped` contains
  `{ path: 'logo.bin', reason: 'binary-content' }`

#### Scenario: A file over the size limit is skipped without being read

- **GIVEN** a repository whose `HEAD` commit tracks `small.php`, `edge.txt` of exactly 1 048 576
  bytes of ASCII text and `big.txt` of 1 048 577 bytes of ASCII text
- **WHEN** `readFiles` reads its root
- **THEN** `files` holds `small.php` and `edge.txt` with its full content, and `skipped` is exactly
  `[{ path: 'big.txt', reason: 'too-large' }]`

#### Scenario: Paths that are not UTF-8 are skipped and never merged

- **GIVEN** a repository whose `HEAD` commit tracks `ok.php` and two files whose path bytes are
  `a` `0xFF` `.php` and `a` `0xFE` `.php` (written into the commit through Git's object commands,
  never through the file system)
- **WHEN** `readFiles` reads its root
- **THEN** `files` holds only `ok.php`
- **AND** `skipped` holds exactly two entries, both
  `{ path: 'a<U+FFFD>.php', reason: 'non-utf8-path' }`,
  and no entry has `reason: 'duplicate-path'`

#### Scenario: Many files are read without one process per file

- **GIVEN** one repository whose `HEAD` commit tracks 1 small UTF-8 file and another whose `HEAD`
  commit tracks 500
- **WHEN** `readFiles` reads each root while the git processes it starts are counted
- **THEN** both resolve with all their files, and reading the second started exactly as many git
  processes as reading the first

#### Scenario: The real path follows symbolic links

- **GIVEN** a directory and a symbolic link to it under the OS temp dir
- **WHEN** `realPath` resolves the link, and then a path that does not exist
- **THEN** the first resolves to the real path of the directory, and the second rejects with
  `NotAGitRepository`

#### Scenario: Reading executes nothing from the repository

- **GIVEN** a repository with a file whose name has accented letters, whose local configuration
  names programs that write a marker file outside it (a `core.fsmonitor` command, a `core.hooksPath`
  directory of hooks, a `filter.<x>.clean` and `filter.<x>.smudge` and a `diff.<x>.textconv`
  applied to every path by `.gitattributes`, and `log.showSignature` with a `gpg.program`) and that
  sets `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true`, `core.quotePath=true`,
  `diff.orderFile`, `diff.algorithm=patience`, `core.bigFileThreshold=1`,
  `diff.ignoreSubmodules=all` and an `attr.tree` naming a tree that marks every path `-diff`, plus an
  uncommitted work-tree `.gitattributes` with the same line
- **WHEN** `readFiles` reads its root and the history reader reads its history
- **THEN** both resolve and the marker file does not exist
- **AND** both results equal those read from the same repository without that configuration

#### Scenario: A partial clone never fetches a missing object

- **GIVEN** a committed repository declared a partial clone of a promisor remote whose upload
  program writes a marker file outside it, with the blob of a tracked file removed
- **WHEN** `readFiles` reads its root and the history reader reads its history
- **THEN** both reject with git's error and the marker file does not exist

### Requirement: Input hygiene before analysis

Before any file is redacted or analysed, indexing SHALL drop each file entry that breaks a rule
below and record it in the report's `skipped` with `{ path, reason }`. Each dropped entry SHALL get
exactly one reason, the first that applies in this order:

1. `invalid-path`: the path is empty, contains `\`, starts with `/`, contains a control character
   (C0 U+0000–U+001F, DEL U+007F or C1 U+0080–U+009F), contains a bidirectional formatting
   character (U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) or a line or paragraph
   separator (U+2028, U+2029), or has an empty, `.` or `..` segment;
2. `duplicate-path`: a previous entry with a valid path has exactly the same path (compared without
   normalisation); the first one is kept;
3. `binary-content`: the content contains a NUL character.

The analyzer SHALL receive only the kept entries, in their input order. The entries the source tree
reported as skipped SHALL appear in the report's `skipped` too. A file–commit link whose path is not
among the analysed files SHALL be left out of the saved graph, while its commit SHALL still be saved;
the left-out links SHALL still count in the `co_changed` weights.

#### Scenario: Malformed, repeated and binary entries never reach the analyzer

- **GIVEN** a fake `readFiles` returning, in this order, `app/A.php`, `app/A.php` again with other
  content, `app\B.php`, `/abs.php`, an empty path, `app/C<U+0007>.php`, and `app/D.php` whose content
  holds a NUL character, with `skipped = [{ path: 'lib/link.php', reason: 'symlink' }]`; and a fake
  `readHistory` with one commit linked to `app/A.php` and to `app/gone.php`, a path not in the files
- **WHEN** the repository is indexed
- **THEN** the analyzer received only the first `app/A.php`
- **AND** the report's `skipped` holds exactly `lib/link.php` `symlink`, the second `app/A.php`
  `duplicate-path`, `app\B.php`, `/abs.php`, the empty path and `app/C<U+0007>.php` as
  `invalid-path`, and `app/D.php` `binary-content`
- **AND** the saved graph holds the commit and its link to `app/A.php` but no link to `app/gone.php`,
  and `saveGraph` did not reject with `InvalidGraph`

#### Scenario: C1, bidirectional and separator characters make a path invalid

- **GIVEN** a fake `readFiles` returning `ok.php` and one file for each of these characters inside
  its name: U+0080, U+009B, U+009F, U+061C, U+200E, U+200F, U+202A, U+202E, U+2066, U+2069, U+2028
  and U+2029; plus `café.php` (U+00E9, just above the C1 range) and `z<U+200B>.php` (a zero-width
  space, not in the list)
- **WHEN** the repository is indexed
- **THEN** the analyzer received exactly `ok.php`, `café.php` and `z<U+200B>.php`
- **AND** the report's `skipped` holds each of the twelve other files with `reason: 'invalid-path'`
- **AND** no saved file's path holds any of those twelve characters
