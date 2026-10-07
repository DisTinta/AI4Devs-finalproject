## Purpose

Indexes one repository end to end: reads the files tracked at its `HEAD` inside the allowed root,
keeps secrets and malformed input out, analyses the code, reads the history, detects the framework
and saves the complete knowledge graph of a new project in a single snapshot, returning a structured
report of what was indexed, skipped and redacted.

## ADDED Requirements

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

`readFiles` SHALL NOT return:

- a symbolic link (Git mode `120000`), reported with `reason: 'symlink'`;
- a submodule (Git mode `160000`), reported with `reason: 'submodule'`;
- a file whose bytes are not valid UTF-8, reported with `reason: 'binary-content'`.

`readFiles(root)` SHALL reject with `NotAGitRepository` under the same rule as reading the history:
`root` does not exist, is not inside a Git repository, or is inside one but is not its top-level
directory. It SHALL reject with `EmptyRepository` (code `EMPTY_REPOSITORY`) when `HEAD` names no
commit (an unborn branch, even when other branches have commits: only `HEAD` is indexed).
`EmptyRepository` SHALL mean "`HEAD` names no commit", not "no files": a repository whose `HEAD`
commit tracks no file resolves to `{ files: [], skipped: [] }`. Any other git failure (git missing,
a refused repository ownership, a broken `HEAD` or ref, a permission error) propagates unchanged.
Reading SHALL never modify the repository nor execute anything from it, and the repository's own
configuration SHALL NOT change what is read.

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
  sets `log.showRoot=false`, `diff.renames=copies`, `diff.relative=true` and `core.quotePath=true`
- **WHEN** `readFiles` reads its root and the history reader reads its history
- **THEN** both resolve and the marker file does not exist
- **AND** both results equal those read from the same repository without that configuration

### Requirement: Indexing order and no partial write

Indexing a repository with input `{ repoPath, allowedRoot, name, language, framework? }` SHALL run
these phases, in this order, and SHALL call the optional progress callback once with each phase
name when that phase starts:

| Phase | Work |
| -- | -- |
| `confine` | confine `repoPath` to `allowedRoot` lexically; resolve the real path of the result and of `allowedRoot`; confine the real repository path to the real root again |
| `read` | read the files of the real repository path; apply the input hygiene rules |
| `redact` | redact every kept file; detect the framework unless `input.framework` is given |
| `analyze` | analyse the redacted files; set each file's `redacted` and `contentHash` |
| `history` | read the history; reject an empty one; redact commit messages; drop orphan file–commit links; add the `co_changed` edges |
| `save` | validate the graph; create the project; save the graph |

When a phase fails, its error SHALL propagate unchanged, except for the two `confine` cases below,
and no later phase SHALL start or be reported:

- When resolving the real path of `allowedRoot` rejects because the root does not exist, indexing
  SHALL reject with `IndexingDisabled`: a configured root that cannot be used means indexing is
  disabled. Resolving the real path of a repository that does not exist still rejects with
  `NotAGitRepository`.
- When the confinement on real paths fails, the `ForbiddenPathError` SHALL name `repoPath` as it was
  requested, never the resolved real path, and its message SHALL NOT contain the resolved real path:
  the target of a symbolic link is not revealed.

Nothing SHALL be written to the store before the `save` phase, and within it the graph
SHALL be validated before the project is created, so an invalid graph leaves no project behind. The
set of paths the analyzer returns SHALL be exactly the set it received; otherwise the graph is
invalid, like an edge to a symbol the analyzer does not return, and indexing SHALL reject with
`InvalidGraph`, whose message names every path that is missing or extra, in the `save` phase and
before `createProject`. The
project SHALL be created with `rootPath` set to the real repository path, and the graph SHALL be
saved in **one** call holding every file, symbol, edge (the analyzer's and the `co_changed` ones,
after the deduplication of `code-analysis`: an `exact` edge wins over a `heuristic` one with the same
`kind`, source and target), commit and file–commit link: a complete snapshot. Indexing SHALL NOT open, commit or roll back a
transaction, and SHALL NOT write to any log.

#### Scenario: Progress phases are reported once and in order

- **GIVEN** in-memory fake ports for a small repository that indexes successfully, and a progress
  spy
- **WHEN** the repository is indexed
- **THEN** the spy received exactly `confine`, `read`, `redact`, `analyze`, `history`, `save`, once
  each and in that order
- **AND** the store received one `createProject` and then one `saveGraph`, and the source tree, the
  analyzer and the history were each called once, in that order

#### Scenario: A path outside the allowed root is rejected before reading

- **GIVEN** `allowedRoot = '/repos'` and in-memory fake ports
- **WHEN** indexing is called with `repoPath = '../etc'`
- **THEN** it rejects with `ForbiddenPathError`, the progress spy received only `confine`, and
  neither `realPath`, `readFiles`, `analyze`, `readHistory`, `createProject` nor `saveGraph` was
  called

#### Scenario: Indexing is disabled without an allowed root

- **GIVEN** `allowedRoot = ''` and in-memory fake ports
- **WHEN** indexing is called
- **THEN** it rejects with `IndexingDisabled`, the progress spy received only `confine`, and no port
  operation was called

#### Scenario: A symbolic link escaping the allowed root is rejected before reading

- **GIVEN** `allowedRoot = '/repos'`, `repoPath = 'acme-shop'`, and a fake `realPath` that resolves
  `/repos` to itself and `/repos/acme-shop` to `/elsewhere/acme-shop`
- **WHEN** the repository is indexed
- **THEN** it rejects with `ForbiddenPathError`, the progress spy received only `confine`, and
  neither `readFiles`, `analyze`, `readHistory`, `createProject` nor `saveGraph` was called
- **AND** the error has `requestedPath = 'acme-shop'` and its message does not contain `/elsewhere`

#### Scenario: An allowed root that does not exist disables indexing

- **GIVEN** `allowedRoot = '/repos'`, `repoPath = 'acme-shop'`, and a fake `realPath` that rejects for
  `/repos` because it does not exist
- **WHEN** the repository is indexed
- **THEN** it rejects with `IndexingDisabled`, the progress spy received only `confine`, and neither
  `readFiles`, `analyze`, `readHistory`, `createProject` nor `saveGraph` was called

#### Scenario: A failure reading the source tree writes nothing

- **GIVEN** a fake `readFiles` that rejects with `NotAGitRepository`
- **WHEN** the repository is indexed
- **THEN** it rejects with that same error, the progress spy's last phase is `read`, and neither
  `analyze`, `readHistory`, `createProject` nor `saveGraph` was called

#### Scenario: A failure reading the history writes nothing

- **GIVEN** a fake `readHistory` that rejects with `NotAGitRepository` in one run, and one that
  resolves with no `head` (no commit) in another
- **WHEN** the repository is indexed in each run
- **THEN** the first rejects with that same `NotAGitRepository` and the second with `EmptyRepository`;
  in both the progress spy's last phase is `history` and neither `createProject` nor `saveGraph` was
  called

#### Scenario: An invalid graph creates no project

- **GIVEN** a fake analyzer whose result holds an edge to a symbol it does not return
- **WHEN** the repository is indexed
- **THEN** it rejects with `InvalidGraph`, the progress spy's last phase is `save`, and neither
  `createProject` nor `saveGraph` was called

#### Scenario: A file the analyzer did not receive creates no project

- **GIVEN** a fake analyzer that returns a file that was not in its input
- **WHEN** the repository is indexed
- **THEN** it rejects with `InvalidGraph`, whose message names that file's path
- **AND** the progress spy's last phase is `save`, and `createProject` was not called
- **AND** the database holds no new project

#### Scenario: A file the analyzer did not return creates no project

- **GIVEN** a fake analyzer that leaves out of its result one file of its input
- **WHEN** the repository is indexed
- **THEN** it rejects with `InvalidGraph`, whose message names that file's path, and no report is
  returned
- **AND** the progress spy's last phase is `save`, and `createProject` was not called
- **AND** the database holds no new project

#### Scenario: A taken project name saves no graph

- **GIVEN** a fake `createProject` that rejects with `ProjectNameTaken`
- **WHEN** the repository is indexed
- **THEN** it rejects with that same error, the progress spy's last phase is `save`, and `saveGraph`
  was not called

### Requirement: Input hygiene before analysis

Before any file is redacted or analysed, indexing SHALL drop each file entry that breaks a rule
below and record it in the report's `skipped` with `{ path, reason }`. Each dropped entry SHALL get
exactly one reason, the first that applies in this order:

1. `invalid-path`: the path is empty, contains `\`, starts with `/`, contains a control character
   (U+0000–U+001F or U+007F), or has an empty, `.` or `..` segment;
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

### Requirement: Secrets never reach the store

Every kept file SHALL be redacted before the analyzer receives it, so the analyzer only ever sees
redacted content. Each saved file SHALL carry `redacted: true` if and only if its redaction replaced
at least one span, and `contentHash` SHALL be the lowercase hexadecimal SHA-256 of the UTF-8 bytes of
its **redacted** content (64 characters). The redaction events of every file SHALL be returned in
the report's `events`, ordered by file path in byte order and, within a file, in the order redaction
returns them.

Every commit message SHALL be redacted with the same rules before it is saved. Its events SHALL be
returned in the report's `commitEvents` as `{ commit, line, column, rule }`, where `commit` is the
commit's sha, ordered as the history lists the commits and, within a commit, by line and column. No
event SHALL carry the redacted value.

#### Scenario: The planted secret of acme-shop never reaches the database

- **GIVEN** the acme-shop indexing of scenario "acme-shop is indexed completely"
- **WHEN** the saved rows are queried
- **THEN** the file `config/services.php` has `redacted = true`, and its `content_hash` is the SHA-256
  of its redacted content
- **AND** the report's `events` contains
  `{ type: 'secret_redacted', file: 'config/services.php', line: 21, column: 44, rule: 'aws-access-key-id' }`
- **AND** no `symbol` row and no `commit` row of the project matches `/AKIA[A-Z0-9]{16}/`

#### Scenario: The analyzer only receives redacted content

- **GIVEN** a fake `readFiles` returning a kept file whose content holds a synthetic AWS access key id
  built by concatenation in the test, and a clean file, and a fake analyzer that records what it
  receives
- **WHEN** the repository is indexed
- **THEN** the analyzer received the first file with `[REDACTED: possible secret]` in its content and
  no substring of the key of 8 or more characters
- **AND** in the saved graph that file has `redacted: true` and the clean file `redacted: false`

#### Scenario: A secret in a commit message is redacted

- **GIVEN** a fake `readHistory` with a commit whose message holds a synthetic AWS access key id
  built by concatenation in the test (the same shape as the planted key of acme-shop)
- **WHEN** the repository is indexed
- **THEN** the saved commit's message contains `[REDACTED: possible secret]` and not the key
- **AND** the report's `commitEvents` holds one entry with that commit's sha and
  `rule: 'aws-access-key-id'`, and the serialised report contains no substring of the key of 8 or
  more characters

### Requirement: Framework detection by manifest

The framework SHALL be detected from the kept, redacted files, using only the manifests at the
repository root, in this order:

1. `composer.json` whose `require` or `require-dev` object has the key `laravel/framework` →
   `laravel`;
2. `package.json` whose `dependencies` or `devDependencies` object has the key `fastify` → `fastify`;
3. otherwise → `none`.

A manifest that is not valid JSON, is not an object, or whose dependency field is not an object SHALL
count as not declaring the framework; detection SHALL never throw. A manifest outside the root (for
example `packages/x/package.json`) SHALL be ignored. When `input.framework` is given, it SHALL be used
as is and detection SHALL NOT run. The project SHALL be created with the resulting framework, and the
report SHALL state it and whether it was `detected` or `explicit`.

#### Scenario: The framework is detected from the root manifest

- **GIVEN** file sets with: `composer.json` with `laravel/framework` in `require`; the same in
  `require-dev`; `package.json` with `fastify` in `dependencies`; the same in `devDependencies`; both
  manifests (Laravel and Fastify); no manifest; a `composer.json` without Laravel; a `composer.json`
  that is not valid JSON; a `composer.json` whose `require` is an array; and `packages/x/package.json`
  with `fastify` only
- **WHEN** the framework is detected for each
- **THEN** the results are `laravel`, `laravel`, `fastify`, `fastify`, `laravel`, `none`, `none`,
  `none`, `none` and `none`, and no call throws

#### Scenario: An explicit framework wins over detection

- **GIVEN** fake ports for a repository whose `composer.json` declares `laravel/framework`
- **WHEN** it is indexed with `framework: 'none'`
- **THEN** `createProject` received `framework: 'none'` and the report states `none` as `explicit`

### Requirement: Index report

A successful indexing SHALL resolve to a report holding: `projectId`; `indexedCommit` (the history's
`head`); `framework` and `frameworkSource` (`detected` or `explicit`); `files`, `filesDeleted`,
`symbols`, `commits` and `fileCommits` as counted by the snapshot write; `edges` as
`{ total, exact, heuristic }` over the saved edges (after that deduplication), with `exact + heuristic = total`; `events`;
`commitEvents`; the analyzer's `diagnostics`; and `skipped`, ordered by path in byte order, then by
reason. The report SHALL be plain JSON-serialisable data.

#### Scenario: acme-shop is indexed completely

- **GIVEN** a copy of `fixtures/acme-shop` with its history rebuilt under a temporary directory `T`
  (never inside `fixtures/`), the PHP analyzer, the Git history reader with a test salt, the Git
  source tree, a store on the test transaction, and a progress spy
- **WHEN** `acme-shop` is indexed with `allowedRoot = T`, a unique name and `language: 'php'`
- **THEN** the stored project has `framework = 'laravel'`, `indexedCommit` equal to the copy's
  `git rev-parse HEAD`, `indexedAt` set, `nodeCount = report.files + report.symbols` and
  `edgeCount = report.edges.total`
- **AND** `report.edges.exact + report.edges.heuristic = report.edges.total`, at least one saved
  edge is `co_changed`, and `report.commits` equals the copy's `git rev-list --count HEAD`
- **AND** every saved file has a 64-character hexadecimal `content_hash`
- **AND** the progress spy received each phase once, in order
