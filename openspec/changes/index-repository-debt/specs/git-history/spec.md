## MODIFIED Requirements

### Requirement: History reading

`GitPort.readHistory(repoPath)` SHALL return the history of the repository whose top-level
directory is `repoPath`, as a `GitHistory` with:

- `head`: the sha of `HEAD`;
- `commits`: every commit reachable from `HEAD`, exactly once, newest first, each with its `sha`, its
  sanitised `message`, its `authorHash` and its `committedAt` (the committer date);
- `fileCommits`: one link per file a non-merge commit touched, with the repository-relative path
  using `/` as separator, exactly as the repository stores it (never quoted or escaped), and the
  commit's `sha`. A link whose path, as Git stores it, is not valid UTF-8 SHALL be left out (no
  indexed file can have that path); its commit SHALL still be listed. Being left out of the history,
  such a path is not one of its commit's files for the co-change edges either (it does not count
  towards a commit's 100-file limit nor towards any file's commits).

Every `sha` of `fileCommits` SHALL be the `sha` of an element of `commits`. The result SHALL be
accepted by the graph validation of `graph-store` once its paths are in `files`. Reading SHALL NOT
modify the repository.

Characters that Git allows inside names, e-mails, messages or paths (control characters such as
`\x1e` and `\x1f`, quotes, tabs, backslashes) SHALL NOT shift one commit's values into another field
or another commit: each value SHALL arrive in its own field, intact.

The reader SHALL consume Git's output as it arrives and SHALL NOT hold the whole raw output in
memory at once; the parsed result SHALL be the same as if the output had been read whole. When git
fails part-way, `readHistory` SHALL reject with git's error and SHALL NOT resolve with a partial
history.

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

#### Scenario: A link whose path is not UTF-8 is left out

- **GIVEN** a commit, written through Git's object commands, that adds `ok.php` and a file whose path
  bytes are `a` `0xFF` `.php`
- **WHEN** the history is read
- **THEN** the commit is listed, `fileCommits` has its link to `ok.php`, and no link of that commit
  has a path containing U+FFFD

#### Scenario: A long history read as a stream equals the history read whole

- **GIVEN** a repository with 300 commits, each touching two files, whose messages hold multi-byte
  UTF-8 characters
- **WHEN** its history is read, and its `git log` output (with the reader's arguments) is captured
  whole and parsed in one piece
- **THEN** both results are deeply equal
