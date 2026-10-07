# Show spec working — cli-index-command

- Date: 2026-10-07
- Change: `cli-index-command` (DIS-86), capability `cli-indexing`
- Interface: the real CLI, `npm run -s cli -- index …` (tsx from sources, every `dist/` moved away
  for the step 10 run), Postgres 16 from `docker compose`, Git Bash on Windows 11.
- Paths masked: scratchpad as `<scratch>`, OS user name as `<user>`. The full transcript of the
  step 10 run is in [`2026-10-07-10-manual-interface-testing.md`](./2026-10-07-10-manual-interface-testing.md).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Help and version exit with zero | `index --help`, `index --version` | exit 0; help / `0.0.1` on stdout, stderr empty | Yes | manual #1, #2 |
| An unsupported language is a usage error | `--language cobol`, `--language typescript` | exit 2, `UNSUPPORTED_LANGUAGE`, `allowed: ["php"]`, `typescript: not available yet (CM-HU-18)` | Yes | manual #11, #12 |
| An unsupported framework is a usage error | `--framework symfony` | exit 2, `UNSUPPORTED_FRAMEWORK`, `allowed: ["laravel","fastify","none"]` | Yes | manual #13 |
| A missing or blank name is a usage error | no `--name`; `--name '   '` | exit 2, `USAGE`, only JSON lines on stderr | Yes | manual #14, #15 |
| Indexing is disabled before connecting without an allowed root | `ALLOWED_REPOS_DIR=` | exit 1, `INDEXING_DISABLED`, no progress line (no connection) | Yes | manual #7 |
| A path outside the allowed root is rejected before connecting | `index ../etc`; `index /tmp/otro` (`MSYS_NO_PATHCONV=1`) | exit 1, `FORBIDDEN_PATH` naming the path as typed, no progress | Yes | manual #9, #10 |
| Missing configuration fails before connecting | `AUTHOR_HASH_SALT=`; `DATABASE_URL='   '` | exit 1, `MISSING_CONFIG`, `details.variable` | Yes | manual #18; below |
| A successful indexing commits and releases | `index acme-shop --name dis86-demo` | exit 0; the project is readable from another connection (`psql`) afterwards, so the transaction committed | Yes (commit; release is internal) | manual #3, #5 |
| A taken name rolls back and keeps the first project | repeat with `--name dis86-demo` | exit 1, `PROJECT_NAME_TAKEN`, stdout empty; still one `dis86-demo` row | Yes | manual #6 |
| An allowed root that does not exist is detected inside the transaction | `ALLOWED_REPOS_DIR=<scratch>/root/inexistente` | `[1/6] confine` printed (past the pre-check), then exit 1, `INDEXING_DISABLED` | Yes | below |
| An unreachable database is reported without its URL | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | exit 1, `DATABASE_UNAVAILABLE`; no URL, `s3cret` or `u:` in the output | Yes | manual #19 |
| acme-shop is indexed and its report printed | `index acme-shop --name dis86-demo --language php` | six phases; report with commit `4f028db…` = `HEAD`, `laravel (detected)`, 53 files, 121 symbols, 32 commits, edges 170/137/33; `secret_redacted` line for `config/services.php` line 21; no `AKIA…` | Yes | manual #3 |
| An explicit framework wins and --json prints the full report | `--framework none --json` | exit 0; one JSON document with every report field, `framework: "none"`, `frameworkSource: "explicit"`; stored `framework` = `none` | Yes | manual #4, #5 |
| On error stdout stays empty | `ALLOWED_REPOS_DIR=` with `--json` | exit 1, stdout empty | Yes | manual #8 |
| Every redaction is logged without the secret | acme-shop run | one `"source":"file"` line; acme-shop has no commit redaction, so no `"source":"commit"` line (equal to `0 in commit messages`) | Yes for files; commit lines shown by the unit test | manual #3 |
| A failure is logged with its code and exit | every error case | `{"level":"error","event":"index_failed","code":…,"exit":…}` after each `{"error":…}` line | Yes | manual #6–#19 |
| A directory that is not a repository is reported by the path as typed | `index no-repo` | exit 1, `"no-repo" is not the root of a git repository`; no real path | Yes | manual #16 |
| A repository without commits is reported by the path as typed | `index vacio` | exit 1, `"vacio" has no commits`; no real path | Yes | manual #17 |
| Diagnostics and skipped paths are escaped | `index weird2` (tree built with `git mktree`, holding `x<ESC>[31m.php`) | skipped entry printed as `"x\u001b[31m.php" (invalid-path)`; no raw ESC byte in stdout | Yes | below |

## Evidence

Commands run on 2026-10-07 in addition to the step 10 transcript (environment:
`ALLOWED_REPOS_DIR=<scratch>/root`, `AUTHOR_HASH_SALT=demo-salt`,
`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`).

Allowed root that does not exist:

```text
$ ALLOWED_REPOS_DIR=<scratch>/root/inexistente npm run -s cli -- index acme-shop --name x --language php
[1/6] confine
{"error":{"code":"INDEXING_DISABLED","message":"indexing disabled (fixtures-only mode)","details":{}}}
{"level":"error","event":"index_failed","code":"INDEXING_DISABLED","exit":1}
EXIT=1
```

Blank `DATABASE_URL`:

```text
$ DATABASE_URL='   ' npm run -s cli -- index acme-shop --name x --language php
{"error":{"code":"MISSING_CONFIG","message":"DATABASE_URL is not set","details":{"variable":"DATABASE_URL"}}}
{"level":"error","event":"index_failed","code":"MISSING_CONFIG","exit":1}
EXIT=1
```

Escaping. Git for Windows refuses a control character in a path through `update-index`
(`error: Invalid path 'x?[31m.php'`), so the demo tree was written with `git mktree` and
`git commit-tree` in `<scratch>/root/weird2`: `a.php`, `x<ESC>[31m.php`, and `c<U+009B>2Jd.php`.

```text
$ git ls-tree -r HEAD --name-only -z | od -c
0000000   a   .   p   h   p  \0   c 302 233   2   J   d   .   p   h   p
0000020  \0   x 033   [   3   1   m   .   p   h   p  \0
$ npm run -s cli -- index weird2 --name dis86-weird --language php    (stdout through cat -A)
EXIT=0
Indexed project add48407-6683-4a50-97eb-b9d990ad022b$
  commit:      3e4e2913e9ed89be919e97fe30fca41bd5017ce1$
  framework:   none (detected)$
  files:       2 (0 deleted)$
  symbols:     1$
  commits:     1$
  edges:       0 total / 0 exact / 0 heuristic$
  redactions:  0 in files, 0 in commit messages$
  skipped:     1$
    "x\u001b[31m.php" (invalid-path)$
  diagnostics: 0$
$ grep -c $'\033' stdout
0
```

Observation: core's input hygiene treats C0 controls as `invalid-path` but accepts the C1 path
`c<U+009B>2Jd.php` as a valid file (it is indexed: `files: 2`). The CLI never prints the indexed
files, so that path does not reach the terminal here; the C1 branch of `escapeLiteral` is exercised by
the unit scenario. Whether core should also reject C1 paths is outside this change (recorded for the
archive gap classification).

## State

- Before: `project` 0, `commit` 0, `file` 0; `git status --porcelain fixtures` empty.
- After: `project` 0, `commit` 0, `file` 0 (demo projects `dis86-demo`, `dis86-demo-json`,
  `dis86-weird` and the first `weird` attempt deleted by name; the schema cascades).
- Restored: yes. Build output restored with `npx tsc --build --force` after the step 10 run.

## Not demonstrated through the real interface

- **A failed indexing rolls back and releases** and **An unexpected error is reported as INTERNAL**:
  both need a port to throw an arbitrary error mid-indexing, which the real adapters do not do on
  demand. Shown by the unit tests with fake ports (`tests/unit/cli/index-command.spec.ts`), and the
  rollback of a real failure is visible in "A taken name…" (no second row).
- The `"source":"commit"` log line: acme-shop's history holds no secret. Shown by the unit scenario
  "Every redaction is logged without the secret".

## Handoff

The change is **demonstrably working** through the real CLI: 19 of 21 scenarios exercised end to end
with the expected exit codes, streams and stored state; the remaining two are covered by unit tests
with fakes, as explained above. No screenshot or other file was written at the repository root (the
change has no browser UI).
