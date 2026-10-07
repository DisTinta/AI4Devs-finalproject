# git-history Specification

## Purpose

How the domain reads a repository's Git history through `GitPort`: commits, the files each commit
touched with their line counts, and the pull-request number, with every author pseudonymised and
identity trailers removed, so that no contributor's name or e-mail reaches the structured fields of
the knowledge-graph store (free text of message bodies is stored as written). It also covers
the weighted `co_changed` edges the domain derives from that history, and the fixture history
builder's guarantee that every file a manifest lists really changes in its commit.

## Requirements

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

#### Scenario: A .git directory or a bare repository is rejected

- **GIVEN** the `.git` directory of a committed repository, and a bare repository
- **WHEN** the history of each is read
- **THEN** each call rejects with `NotAGitRepository`

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

### Requirement: Co-change edges

The domain SHALL derive co-change edges from a history's file–commit links and the set of paths
present in the snapshot (the known paths), with no I/O, as follows:

- A commit's files are the distinct paths of its links. A commit with more than 100 files SHALL be
  ignored entirely: it contributes no pair and is not counted for any file. A commit with exactly
  100 files SHALL be counted.
- For a file, `commits(F)` is the set of distinct counted commits that touch it, known path or not.
- For every unordered pair of distinct known paths {A, B} with `|commits(A) ∩ commits(B)| >= 2`
  there SHALL be exactly one edge, with:
  - `source` = the file whose path is smaller in UTF-8 byte order, `target` = the other file (both
    file endpoints, never symbols);
  - `kind` = `co_changed`, `resolution` = `heuristic`, `extractor` = `git`;
  - `weight` = `|commits(A) ∩ commits(B)| / |commits(A) ∪ commits(B)|`, a number in (0, 1].
- No other pair SHALL yield an edge. A pair with an endpoint outside the known paths yields none.
- The edges SHALL be ordered by `source` path, then `target` path, in UTF-8 byte order, and the same
  input SHALL always yield the same output.
- The derivation SHALL use only paths and shas: author data (`authorHash`) and line counts SHALL NOT
  affect the result.

#### Scenario: Files changed together form a weighted edge

- **GIVEN** links where `a.ts` and `b.ts` are both touched by commits `s1`, `s2` and `s3`, and `b.ts`
  also by `s4`
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge: source file `a.ts`, target file `b.ts`, kind
  `co_changed`, resolution `heuristic`, extractor `git`, weight 0.75

#### Scenario: A single shared commit is not enough

- **GIVEN** links where `a.ts` and `b.ts` share exactly one commit, and `c.ts` shares no commit with
  either
- **WHEN** the co-change edges are derived with all three known
- **THEN** the result is empty

#### Scenario: Each pair yields one edge from the smaller path

- **GIVEN** links, listed in an arbitrary order, where `z.ts`, `m.ts` and `Z.ts` all change together
  in two commits
- **WHEN** the co-change edges are derived twice from the same input
- **THEN** both results are equal and are exactly the edges `Z.ts → m.ts`, `Z.ts → z.ts` and
  `m.ts → z.ts`, in that order, each with weight 1

#### Scenario: A path outside the snapshot yields no edge but still counts

- **GIVEN** links where `a.ts` and `b.ts` share commits `s1` and `s2`, `a.ts` and `old.ts` share
  `s1`, `s2` and `s3`, and `old.ts` is not a known path
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 2/3

#### Scenario: A commit with more than 100 files is ignored

- **GIVEN** links where `a.ts` and `b.ts` share commits `s1` and `s2` with no other file, and two
  commits `big1` and `big2` each touch 101 files, among them `a.ts` and `c.ts` (not `b.ts`)
- **WHEN** the co-change edges are derived with every path known
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 1

#### Scenario: A commit with exactly 100 files is counted

- **GIVEN** the links of the previous scenario, except that `big1` and `big2` each touch exactly 100
  files, among them `a.ts` and `c.ts`
- **WHEN** the co-change edges are derived with every path known
- **THEN** the result contains `a.ts → b.ts` with weight 0.5 and `a.ts → c.ts` with weight 0.5

#### Scenario: An empty history yields no edges

- **WHEN** the co-change edges are derived from no links
- **THEN** the result is empty

#### Scenario: Duplicate links in one commit count once

- **GIVEN** links where `a.ts` is touched by commits `s1` and `s2`, `b.ts` by `s1`, `s2` and `s3`,
  and the link of `a.ts` to `s1` appears twice
- **WHEN** the co-change edges are derived with known paths `a.ts` and `b.ts`
- **THEN** the result is exactly one edge `a.ts → b.ts` with weight 2/3

#### Scenario: Author hash and line counts do not affect co-change

- **GIVEN** two histories with the same commits and the same links (same paths and shas), which
  differ only in every commit's `authorHash` and in every link's `linesAdded` and `linesRemoved`
  (present in one, absent or different in the other)
- **WHEN** the co-change edges are derived from each with the same known paths
- **THEN** both results are equal

### Requirement: Co-change edges persist with the snapshot

Co-change edges derived with the snapshot's file paths as known paths SHALL be accepted by the graph
validation of `graph-store` and SHALL persist through `StorePort.saveGraph` in the same snapshot as
the project's files, with their `weight`. Because `saveGraph` replaces all of a project's edges, a
caller that also has other edges SHALL save them in that same snapshot.

#### Scenario: The documented fixture pairs are persisted

- **GIVEN** `fixtures/acme-shop` and `fixtures/task-api` rebuilt by `node fixtures/build-history.mjs`,
  and one new project for each
- **WHEN** each history is read, its co-change edges are derived with the distinct paths of its links
  as known paths, and a graph with those files, the history and those edges is saved
- **THEN** the acme-shop project has exactly one `co_changed` edge, with extractor `git` and
  resolution `heuristic`, from `app/Services/DiscountService.php` to
  `app/Services/ShippingService.php`, weight 1
- **AND** the task-api project has exactly one `co_changed` edge, with extractor `git` and
  resolution `heuristic`, from `src/schemas/task.schema.ts` to `src/services/task.service.ts`,
  weight 0.75

### Requirement: Fixture histories record every listed file

The fixture history builder (`node fixtures/build-history.mjs`) SHALL make every file that a
manifest entry lists change in that entry's commit, so that the built `git log` holds every
file–commit link the manifest documents:

- A non-final touch whose content would equal what the previous commits left SHALL get the
  throwaway `hist:rN` marker, so the file still changes.
- When a listed file cannot change in its commit — a final touch whose tracked content equals what
  the previous commits left, or a re-touch of a file type that takes no marker (`.json`) — the build
  SHALL fail with an error naming the fixture, the commit index and the path. No link SHALL be
  dropped silently.
- Whether the build succeeds or fails, the fixture's tracked source files SHALL keep their original
  content.

#### Scenario: A re-touch with no new content still records the file

- **GIVEN** a temporary fixture with a tracked file `x.ts` and a manifest whose commits 0 and 1 both
  list `x.ts` with the same `before` snapshot, and whose commit 2 lists `x.ts` plainly
- **WHEN** its history is built
- **THEN** the built repository has 3 commits and each of them changes `x.ts`
- **AND** `x.ts` in the working tree has its original content

#### Scenario: A final touch that changes nothing fails the build

- **GIVEN** a temporary fixture whose manifest's commit 0 lists `x.ts` with a `before` snapshot equal
  to `x.ts`'s tracked content, and whose commit 1 (its last touch) lists `x.ts` plainly
- **WHEN** its history is built
- **THEN** the build fails with an error naming the fixture, `commit 1` and `x.ts`
- **AND** `x.ts` in the working tree has its original content

#### Scenario: A re-touch that cannot be marked fails the build

- **GIVEN** a temporary fixture whose manifest's commits 0 and 1 both list `c.json` with the same
  `before` snapshot, and whose commit 2 lists `c.json` plainly
- **WHEN** its history is built
- **THEN** the build fails with an error naming the fixture, `commit 1` and `c.json`
- **AND** `c.json` in the working tree has its original content

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
