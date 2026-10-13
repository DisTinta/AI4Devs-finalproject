## MODIFIED Requirements

### Requirement: Source tree contract

The source tree port SHALL offer four operations: `realPath` and `readFiles`, below, `readFileAt`,
specified in "Reading one file at a commit", and `readFilesAt`, specified in "Reading several files
at a commit":

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

## ADDED Requirements

### Requirement: Reading several files at a commit

The source tree port SHALL read several files of one commit in one call:
`readFilesAt(root, commit, paths)` SHALL resolve to the contents of `paths`, in the order given, each
exactly as `readFileAt(root, commit, path)` resolves it. A path given twice SHALL be returned twice.

- Every argument SHALL be checked as `readFileAt` checks it, before starting any git process, the
  commit first, even when `paths` is empty: a malformed `commit`, or any malformed path of `paths`,
  MUST fail with `RangeError` naming `commit` or `path`.
- When some path cannot be read, the call SHALL reject with the `SourceUnavailable` that
  `readFileAt` would raise for the first such path in the order given (`not-a-repository`,
  `missing`, `too-large` or `binary-content`), naming that path and never any file content. It SHALL
  NOT resolve with a partial result. A requested regular file whose object git cannot read (a
  damaged or missing object) propagates git's error, before any `missing` path, `too-large` or
  `binary-content` reason is reported. Any other git failure propagates as an error. Only the entries of the requested paths are
  checked: an entry elsewhere in the commit, even one whose object git cannot read, does not fail the
  call.
- An empty list SHALL resolve to an empty list without starting any git process.
- As `readFileAt`, it SHALL never modify the repository nor execute anything from it, and neither the
  repository's configuration nor the caller's git environment variables SHALL change what is read.
  One call SHALL start at most six git processes, whatever the number of paths and the size of the
  files, plus one only when git reports a damaged requested object.

#### Scenario: Several files are read as the given commit stores them

- **GIVEN** a throwaway repository with a first commit where `a.php` holds `v1` and `b.php` holds
  `w1`, a second commit where `a.php` holds `v2`, and `a.php` then modified on disk without committing
- **WHEN** `readFilesAt` reads `b.php`, `a.php` and `b.php` at the first commit, and `a.php` at the
  second
- **THEN** the first call resolves to `w1`, `v1`, `w1` and the second to `v2`

#### Scenario: The first unreadable path rejects the whole batch

- **GIVEN** a committed repository tracking `a.php`, `big.txt` of 1 048 577 bytes of ASCII text and
  `logo.bin`, whose bytes are not valid UTF-8
- **WHEN** `readFilesAt` reads `a.php`, `missing.php`, `big.txt` and `logo.bin` at its commit; then
  `a.php`, `logo.bin` and `big.txt`; then `a.php` and `big.txt`; and then `a.php` under a directory
  outside any repository
- **THEN** the first call rejects with `SourceUnavailable` with reason `missing` and the path
  `missing.php`, the second with reason `binary-content` and the path `logo.bin`, the third with
  reason `too-large` and the path `big.txt`, and the fourth with reason `not-a-repository` and the
  path `a.php`

#### Scenario: An unreadable object outside the batch does not fail it

- **GIVEN** a committed repository tracking `a.php` and `other.php`, declared a partial clone of a
  promisor remote whose upload program writes a marker file outside it, with the blob of `other.php`
  removed
- **WHEN** `readFilesAt` reads `a.php` at its commit
- **THEN** it resolves to the committed content of `a.php` and the marker file does not exist

#### Scenario: A requested object git cannot read fails the batch with git's error

- **GIVEN** a committed repository tracking `a.php` and `other.php`, declared a partial clone of a
  promisor remote whose upload program writes a marker file outside it, with the blob of `other.php`
  removed
- **WHEN** `readFilesAt` reads `missing.php` and then `other.php` at its commit
- **THEN** it rejects with git's error, not with `SourceUnavailable`, and the marker file does not
  exist

#### Scenario: Many files are read with a fixed number of git processes

- **GIVEN** a committed repository tracking 50 small UTF-8 files
- **WHEN** `readFilesAt` reads 1 of them and then all 50 while the git processes it starts are counted
- **THEN** both calls resolve with every content asked for, and both started the same number of git
  processes

#### Scenario: Malformed batch arguments are rejected before running git

- **WHEN** `readFilesAt` is called with commit `HEAD` and a valid path, with commit `HEAD` and an
  empty list of paths, and with a valid commit and the paths `a.php` and `../etc/passwd`, while the
  git processes it starts are counted
- **THEN** the calls fail with `RangeError` naming `commit`, `commit` and `path`
- **AND** no git process was started

#### Scenario: An empty batch starts no git process

- **WHEN** `readFilesAt` is called with an empty list of paths while the git processes it starts are
  counted
- **THEN** it resolves to an empty list and no git process was started

#### Scenario: Reading a batch executes nothing from the repository

- **GIVEN** a repository whose local configuration names programs that write a marker file outside
  it (a `core.fsmonitor` command, a `filter.<x>.smudge` and a `diff.<x>.textconv` applied to every
  path by `.gitattributes`)
- **WHEN** `readFilesAt` reads two tracked files at its commit
- **THEN** it resolves to their committed contents and the marker file does not exist
