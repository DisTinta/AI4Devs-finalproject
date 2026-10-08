# Show Spec Working — index-repository-debt (DIS-100)

- Date: 2026-10-08
- Branch: `feature/DIS-100-index-repository-debt` (uncommitted working tree)
- Environment: Windows 11, Git Bash, git 2.45.1.windows.1, Postgres from `docker compose up -d`
  (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`), Node 24.11.1.
- Interfaces exercised:
  - **the real adapters over the real git** (`createGitSourceTree`, `createSimpleGitHistory`, the
    ports the `repository-indexing` and `git-history` requirements specify), driven by a scratch
    script run with `npx tsx --tsconfig packages/cli/tsconfig.run.json <scratch>/demo-adapters.mts`;
  - **the real CLI** (`npm run -s cli -- index …`, from sources) with the real adapters, the real PHP
    analyzer and Postgres, on repositories built with Git's object commands under `<scratch>/root`
    (`ALLOWED_REPOS_DIR`), `AUTHOR_HASH_SALT=demo-salt`.
- Scratch scripts (outside the repository): `demo-adapters.mts`, `demo-cli-setup.mjs`,
  `demo-cli-check.mjs`, `demo-diag-setup.mjs`. They build every character with
  `String.fromCodePoint`, so no invisible character is ever written into a file by hand.
- Paths masked: the scratchpad as `<scratch>`, the OS temp directory as `<tmp>`.

## Demonstrated

| # | Spec | Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|---|---|
| 1 | repository-indexing | Only the files tracked at HEAD are read | adapter `readFiles` on a repo with a modified, an untracked and an ignored file | `files` = `.gitignore`, `a.php` (committed content); `skipped` = [] | yes | E1 |
| 2 | repository-indexing | A path that is not a repository root is rejected | missing path, plain directory, repo subdirectory | `NotAGitRepository` ×3 | yes | E1 |
| 3 | repository-indexing | A .git directory or a bare repository is not a repository root | `.git` dir, bare repo | `NotAGitRepository` ×2 | yes | E1 |
| 4 | repository-indexing | A repository with no commit is rejected | `git init` only | `EmptyRepository` | yes | E1 |
| 5 | repository-indexing | A HEAD on an orphan branch is rejected as empty | `checkout --orphan` | `EmptyRepository` | yes | E1 |
| 6 | repository-indexing | A broken HEAD propagates git's error | branch ref holds `not-a-sha` | both readers reject with `fatal: …`, not `EmptyRepository` | yes | E1 |
| 7 | repository-indexing | Symbolic links and submodules are skipped and reported | `120000` and `160000` entries | `files` = `a.php`; `symlink`, `submodule` | yes | E1 |
| 8 | repository-indexing | Content that is not UTF-8 is skipped and reported | `logo.bin` with invalid bytes | `binary-content` | yes | E1 |
| 9 | repository-indexing | A file over the size limit is skipped without being read | `edge.txt` 1 048 576 B, `big.txt` 1 048 577 B | `edge.txt` read whole (1 048 576 chars); `big.txt` `too-large` | yes | E1 |
| 10 | repository-indexing | Paths that are not UTF-8 are skipped and never merged | `a`0xFF`.php`, `a`0xFE`.php` via `mktree` | `files` = `ok.php`; two `a<U+FFFD>.php` `non-utf8-path`; no `duplicate-path` | yes | E1 |
| 11 | repository-indexing | Many files are read without one process per file | counting wrapper on `spawnGit`, 1 vs 500 files | both start exactly `ls-tree -r -z -l --full-tree HEAD` + `cat-file --batch` (2 processes); 354 ms vs 994 ms | yes | E1 |
| 12 | repository-indexing | The real path follows symbolic links | junction; missing path | real path; `NotAGitRepository` | yes | E1 |
| 13 | repository-indexing | Reading executes nothing from the repository | hostile repo, traps armed after a clean read | marker empty; tree and history equal to the clean read; `head` = signed commit | yes | E1 |
| 14 | repository-indexing | A partial clone never fetches a missing object | promisor remote, blob removed | both readers reject with `fatal: …`; marker empty | yes | E1, E4 |
| 15 | repository-indexing | Malformed, repeated and binary entries never reach the analyzer | real CLI (C0, backslash, NUL cases) + unit test (empty, `/abs`, duplicate: git cannot produce them) | `x<LF>y.php`, `app<BACKSLASH>B.php`, `c<U+0007>.php` `invalid-path`; `d.php` `binary-content`; unit test green | yes (see note) | E2, E5 |
| 16 | repository-indexing | C1, bidirectional and separator characters make a path invalid | real CLI on a commit with the 12 code points, `café.php`, `z<U+200B>.php` | 3 files stored (`ok.php`, `café.php`, `z<U+200B>.php`, by hex); the 12 paths `invalid-path`; no stored path holds them | yes | E2 |
| 17 | git-history | The acme-shop history is read completely | rebuilt copy of `fixtures/acme-shop` | 32 commits, 32 distinct, `head` = first = `HEAD`; fix commit 2024-05-02T14:49:00Z → `PriceCalculator.php`, `config/shop.php` | yes | E1 |
| 18 | git-history | A repository without commits yields an empty history | `git init` | `{ head: undefined, commits: [], fileCommits: [] }` | yes | E1 |
| 19 | git-history | Reading does not modify the repository | dirty work tree | `HEAD`, refs, status and index mtime unchanged | yes | E1 |
| 20 | git-history | A merge commit is listed without file links | `merge --no-ff` | merge listed, 0 links; side commit links `b.php` | yes | E1 |
| 21 | git-history | Control characters in names and messages stay in their field | name with U+001F ×2, message with U+001E/U+001F | 1 commit, message intact, hash of `ana@x.test`, PR 5, link `a.txt`, no e-mail in the output | yes | E1 |
| 22 | git-history | Paths Git would quote arrive verbatim | `q"uote.txt`, `t<TAB>tab.txt` | exactly those two paths | yes | E1 |
| 23 | git-history | A link whose path is not UTF-8 is left out | `ok.php` + `a`0xFF`.php` via `mktree` | commit listed; one link `ok.php`; none with U+FFFD | yes | E1 |
| 24 | git-history | A long history read as a stream equals the history read whole | 300 commits by `fast-import`, multi-byte messages | 300 commits, 600 links; equal to `parseLog` of the captured whole output | yes | E1 |
| 25 | cli-indexing | Diagnostics and skipped paths are escaped | real CLI: real analyzer diagnostics `duplicate symbol "…"` with U+2066 and U+009B in the name; skipped paths with LF and C1 | text prints quoted literals with `\u2066`, `\u009b`, `\n`; no raw control anywhere | yes | E2, E3 |
| 26 | cli-indexing | Control characters are escaped in the log, the JSON report and the error | real CLI `--json` with `k<U+009B>2J.php` holding a synthetic AWS key id + unit test (the `INVALID_GRAPH` part needs an analyzer that invents a file) | `k\u009b2J.php` `invalid-path` in the report; 0 `secret_redacted` lines; no AWS key id in any output; unit test green | yes (see note) | E2, E5 |
| 27 | cli-indexing | Bidirectional and separator characters in untrusted strings are escaped | real CLI, text and `--json`: skipped `evil<U+202E>gnp.php`, `app/x<U+2028>y.php`; diagnostic with U+2066 | 0 raw bidi/separator characters in stdout or stderr; text shows `"evil\u202egnp.php"`; JSON parses back to the originals | yes | E2, E3 |
| 28 | cli-indexing | A redaction event's file path is escaped in its log line | unit test only: core no longer indexes a C1 path, so no real event can carry one | green | yes (see note) | E5 |

**22 of 22** adapter scenarios passed against the real git (`22/22 passed`, temp dir removed).

## Evidence

### E1 — adapters over the real git

`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratch>/demo-adapters.mts` printed one JSON line
per scenario, all `"pass":true`, then `{"summary":"22/22 passed","tempRemoved":true}`. Selected lines,
verbatim:

```
{"scenario":"Many files are read without one process per file","pass":true,"observed":{"one":{"files":1,"processes":["ls-tree -r -z -l --full-tree HEAD","cat-file --batch"],"ms":354},"five":{"files":500,"processes":["ls-tree -r -z -l --full-tree HEAD","cat-file --batch"],"ms":994}}}
```

The other 21 lines report the observed values summarised in the table (paths, reasons, error names,
`fatal:` messages, commit counts, equality flags).

### E2 — real CLI on `<scratch>/root/hygiene`

One commit written with `hash-object`, `mktree -z` and `commit-tree`: `ok.php`, `café.php`,
`z<U+200B>.php`, `k<U+009B>2J.php` (synthetic AWS key id), `x<LF>y.php`, `app<BACKSLASH>B.php`,
`c<U+0007>.php`, `d.php` (NUL byte) and `app/x<C>y.php` for each of the 12 forbidden code points.

```
$ npm run -s cli -- index hygiene --name demo-hygiene-json --language php --json   # exit 0
$ npm run -s cli -- index hygiene --name demo-hygiene-text --language php          # exit 0
```

Text report, verbatim (`skipped` part):

```
  skipped:     17
    "app/x\u0080y.php" (invalid-path)
    "app/x\u009by.php" (invalid-path)
    "app/x\u009fy.php" (invalid-path)
    "app/x\u061cy.php" (invalid-path)
    "app/x\u200ey.php" (invalid-path)
    "app/x\u200fy.php" (invalid-path)
    "app/x\u2028y.php" (invalid-path)
    "app/x\u2029y.php" (invalid-path)
    "app/x\u202ay.php" (invalid-path)
    "app/x\u202ey.php" (invalid-path)
    "app/x\u2066y.php" (invalid-path)
    "app/x\u2069y.php" (invalid-path)
    "app\\B.php" (invalid-path)
    "c\u0007.php" (invalid-path)
    "d.php" (binary-content)
    "k\u009b2J.php" (invalid-path)
    "x\ny.php" (invalid-path)
  diagnostics: 0
```

Checks over both runs (`demo-cli-check.mjs`): `files` 3; all 16 expected paths `invalid-path`,
`d.php` `binary-content`; `events` 0, `secret_redacted` lines 0; no `AKIA[A-Z0-9]{16}` in any
output; raw unsafe characters in JSON stdout, JSON stderr, text stdout and text stderr: none.

Stored paths, verbatim:

```
$ psql … "SELECT p.name || ' | ' || f.path || ' | ' || encode(convert_to(f.path,'UTF8'),'hex') FROM file f JOIN project p … WHERE p.name LIKE 'demo-hygiene%'"
demo-hygiene-json | café.php | 636166c3a92e706870
demo-hygiene-json | ok.php | 6f6b2e706870
demo-hygiene-json | z<U+200B>.php | 7ae2808b2e706870
(same three rows for demo-hygiene-text)
```

### E3 — real analyzer diagnostics with untrusted characters (`<scratch>/root/diag`)

`dup.php` declares `class bad<U+2066>name {}` twice on line 2 and `class csi<U+009B>name {}` twice on
line 3 (the analyzer reports a duplicate per name and line), plus a skipped `evil<U+202E>gnp.php`.

```
$ npm run -s cli -- index diag --name demo-diag-text3 --language php    # exit 0
  skipped:     1
    "evil\u202egnp.php" (invalid-path)
  diagnostics: 2
    "dup.php":2 "duplicate symbol \"bad\u2066name\"; kept the first"
    "dup.php":3 "duplicate symbol \"csi\u009bname\"; kept the first"
$ npm run -s cli -- index diag --name demo-diag-json3 --language php --json   # exit 0
{"rawText":0,"rawJson":0,"rawStderr":0,"diagnostics":["duplicate symbol \"badU+2066name\"; kept the first","duplicate symbol \"csiU+9bname\"; kept the first"],"skipped":["evilU+202egnp.php invalid-path"]}
```

(The last line is the check script's summary, with each non-ASCII character shown as `U+…`: the
JSON parses back to the original strings.) Two earlier attempts (`demo-diag-*`, `demo-diag-*2`) used
declarations on separate lines and produced no diagnostic; they are listed under State.

### E4 — the partial clone, under the CLI

Already run in the step 9 manual test (`2026-10-08-9-manual-interface-testing.md`, row 5): exit 1,
`INTERNAL` (DIS-86 maps an unknown git failure to it), no project; the adapters reject with
`fatal: git cat-file b3d9bbc7…: bad file` and `fatal: unable to read b3d9bbc7…`.

### E5 — scenarios whose GIVEN is a fake

```
$ npx vitest run tests/unit/cli tests/unit/index/index-repository.spec.ts -t "Malformed, repeated|C1, bidirectional|Diagnostics and skipped|Control characters are escaped in the log|Bidirectional and separator|redaction event's file path" --reporter=verbose
 ✓ … index repository > Malformed, repeated and binary entries never reach the analyzer
 ✓ … index repository > C1, bidirectional and separator characters make a path invalid
 ✓ … render-report > Diagnostics and skipped paths are escaped
 ✓ … render-report > Bidirectional and separator characters in untrusted strings are escaped
 ✓ … index command: transaction, report and log > Control characters are escaped in the log, the JSON report and the error
 ✓ … index command: transaction, report and log > A redaction event's file path is escaped in its log line
      Tests  6 passed | 60 skipped (66)
```

## State

- Before: `project` 0, `commit` 0, `file` 0; `git status --porcelain fixtures` empty;
  `git ls-files -s fixtures | sha1sum` = `b97101fedecb07b21ca67c6156224d81bc13a3e8`.
- After: `project` 0, `commit` 0, `file` 0; fixtures unchanged (same hash, empty status).
- Restored: yes. `DELETE FROM project WHERE name LIKE 'demo-%' RETURNING name` removed
  `demo-hygiene-json`, `demo-hygiene-text`, `demo-diag-text`, `demo-diag-json`, `demo-diag-text2`,
  `demo-diag-json2`, `demo-diag-text3`, `demo-diag-json3` (8; the schema cascades). The adapter
  script's temp directory removed itself (`tempRemoved: true`).

## Not demonstrated through the real interface

- **#15, part of it:** an empty path, a path starting with `/` and two entries with the same path
  cannot come out of a real git tree (`mktree` and the index refuse them); the scenario's GIVEN is a
  fake `readFiles`, and its unit test is green (E5). The C0, backslash and NUL cases were shown with the
  real CLI (E2).
- **#26, the `INVALID_GRAPH` part:** it needs an analyzer that returns a file it was not given; the
  real PHP analyzer never does. Unit test green (E5).
- **#28:** core no longer indexes a path with a C1 control, so no real redaction event can carry one;
  the scenario is at the logger level by design. Unit test green (E5).

## Handoff

The change is **demonstrably working**. All 22 source-tree and history scenarios passed against the
real git through the real adapters, and the 6 hygiene and escaping scenarios were exercised through
the real CLI wherever a real repository can produce their input. Where it cannot (empty, absolute or
duplicate paths, an analyzer inventing a file, a redaction event on a C1 path), their unit tests are
green. No screenshot was taken (no browser UI), and nothing was written at the repository root.
