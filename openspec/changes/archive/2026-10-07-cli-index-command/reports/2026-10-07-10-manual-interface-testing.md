# Manual Interface Testing Report

- Date: 2026-10-07
- Change: cli-index-command
- Step: 10 — Backend: Manual Interface Testing (agent executed)

## Environment

- Branch `feature/DIS-86-cli-index-command`; Postgres from `docker compose up -d`
  (`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`), Git Bash on Windows 11.
- Scratch allowed root `<scratch>/root` built by a scratch script (not in the repository): a copy of
  `fixtures/acme-shop` without `.git` whose history was rebuilt with `buildOne` (32 commits,
  `HEAD` `4f028db…`), plus `no-repo/` (no `.git`) and `vacio/` (`git init`, no commit).
- `ALLOWED_REPOS_DIR=<scratch>/root`, `AUTHOR_HASH_SALT=manual-salt` (scratch value).
- **Every `packages/*/dist` and `packages/*/*/dist` moved out of the repository before the first
  command** (design D10: `npm run cli` must run from sources). The repository hook blocks `rm -rf`,
  so they were moved to the scratchpad instead of deleted; afterwards the build output was restored
  with `npx tsc --build --force` and `packages/core/dist/index.js` / `packages/cli/dist/index.js`
  checked.
- Paths masked: the scratchpad as `<scratch>`, the OS user name as `<user>`.

## Pre-test state

`project` 0 rows, `commit` 0 rows, `file` 0 rows; `git status --porcelain fixtures` empty.

## Results

| # | Command (`npm run -s cli -- …`) | Expected | Exit | Result |
|---|---|---|---|---|
| 1 | `index --help` | help on stdout, exit 0 | 0 | PASS |
| 2 | `index --version` | `0.0.1`, exit 0 | 0 | PASS |
| 3 | `index acme-shop --name dis86-demo --language php` | report, 6 phases, one `secret_redacted` line | 0 | PASS — 53 files, 121 symbols, 32 commits, edges 170/137/33, `laravel (detected)`, `config/services.php:21:44` |
| 4 | `… --name dis86-demo-json --framework none --json` | one JSON document, `framework: none`, `explicit` | 0 | PASS |
| 5 | `SELECT name, framework, indexed_commit FROM project` | both projects, `indexed_commit` = `HEAD` | — | PASS |
| 6 | repeat #3 (same name) | `PROJECT_NAME_TAKEN`, stdout empty | 1 | PASS |
| 7 | `ALLOWED_REPOS_DIR=` | `INDEXING_DISABLED`, no progress (no connection) | 1 | PASS |
| 8 | `ALLOWED_REPOS_DIR=` with `--json` | stdout empty | 1 | PASS |
| 9 | `index ../etc` | `FORBIDDEN_PATH` naming `"../etc"` | 1 | PASS |
| 10 | `index /tmp/otro` | `FORBIDDEN_PATH` | 1 | PASS — see note |
| 11 | `--language cobol` | `UNSUPPORTED_LANGUAGE`, `allowed: ["php"]` | 2 | PASS |
| 12 | `--language typescript` | `typescript: not available yet (CM-HU-18)` | 2 | PASS |
| 13 | `--framework symfony` | `UNSUPPORTED_FRAMEWORK` | 2 | PASS |
| 14 | no `--name` | `USAGE`, no `commander` text | 2 | PASS |
| 15 | `--name '   '` | `USAGE` `--name must not be blank` | 2 | PASS |
| 16 | `index no-repo` | `NOT_A_GIT_REPOSITORY` naming `"no-repo"` | 1 | PASS |
| 17 | `index vacio` | `EMPTY_REPOSITORY` naming `"vacio"` | 1 | PASS |
| 18 | `AUTHOR_HASH_SALT=` | `MISSING_CONFIG`, `variable` | 1 | PASS |
| 19 | `DATABASE_URL=postgres://u:s3cret@127.0.0.1:1/db` | `DATABASE_UNAVAILABLE`, no URL | 1 | PASS |

Checks over the whole output: no `AKIA[A-Z0-9]{16}`; the real path of the scratch root appears in no
error message (16, 17 name the path as typed); `s3cret` and the URL never appear (19).

**Note on #10.** Git Bash (MSYS) rewrites a POSIX-looking argument before the process sees it, so
`/tmp/otro` reached the CLI as `C:/Users/<user>/AppData/Local/Temp/otro`, and the message names that
argument, as received. With `MSYS_NO_PATHCONV=1` the same command prints
`{"error":{"code":"FORBIDDEN_PATH","message":"\"/tmp/otro\" is outside the allowed repositories directory","details":{}}}`
(exit 1). The CLI always echoes the argument it was given, never a resolved path; the rewrite is the
shell's.

## Mutating operations and restoration

#3 and #4 committed two projects by design. Restored with
`DELETE FROM project WHERE name IN ('dis86-demo','dis86-demo-json')` (the schema cascades): DELETE 2;
counts back to `project` 0, `commit` 0, `file` 0.

## Full transcript

```text
$ npm run -s cli -- index --help
EXIT=0
--- stdout
Usage: codemind index [options] <path>

Index a repository inside ALLOWED_REPOS_DIR and save its knowledge graph

Arguments:
  path                     repository path, absolute or relative to
                           ALLOWED_REPOS_DIR

Options:
  --name <name>            unique name of the project to create
  --language <language>    language of the repository: php
  --framework <framework>  framework, instead of detecting it: laravel,
                           fastify, none
  --json                   print the report as one JSON document
  -V, --version            output the version number
  -h, --help               display help for command
--- stderr

$ npm run -s cli -- index --version
EXIT=0
--- stdout
0.0.1
--- stderr

$ npm run -s cli -- index acme-shop --name dis86-demo --language php
EXIT=0
--- stdout
Indexed project 0d9760cb-c96a-4057-9ae0-315093f1aa02
  commit:      4f028db4d51a3321031f3a24b3f36240410ed38c
  framework:   laravel (detected)
  files:       53 (0 deleted)
  symbols:     121
  commits:     32
  edges:       170 total / 137 exact / 33 heuristic
  redactions:  1 in files, 0 in commit messages
  skipped:     0
  diagnostics: 0
--- stderr
[1/6] confine
[2/6] read
[3/6] redact
[4/6] analyze
[5/6] history
[6/6] save
{"level":"info","event":"secret_redacted","source":"file","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}

$ npm run -s cli -- index acme-shop --name dis86-demo-json --language php --framework none --json
EXIT=0
--- stdout
{"projectId":"0870d876-d05f-418f-9110-32f373a56e82","indexedCommit":"4f028db4d51a3321031f3a24b3f36240410ed38c","framework":"none","frameworkSource":"explicit","files":53,"filesDeleted":0,"symbols":121,"commits":32,"fileCommits":59,"edges":{"total":170,"exact":137,"heuristic":33},"events":[{"type":"secret_redacted","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}],"commitEvents":[],"diagnostics":[],"skipped":[]}
--- stderr
[1/6] confine
[2/6] read
[3/6] redact
[4/6] analyze
[5/6] history
[6/6] save
{"level":"info","event":"secret_redacted","source":"file","file":"config/services.php","line":21,"column":44,"rule":"aws-access-key-id"}

$ SELECT name, framework, indexed_commit FROM project
dis86-demo|laravel|4f028db4d51a3321031f3a24b3f36240410ed38c
dis86-demo-json|none|4f028db4d51a3321031f3a24b3f36240410ed38c

$ npm run -s cli -- index acme-shop --name dis86-demo --language php
EXIT=1
--- stdout
--- stderr
[1/6] confine
[2/6] read
[3/6] redact
[4/6] analyze
[5/6] history
[6/6] save
{"error":{"code":"PROJECT_NAME_TAKEN","message":"project name \"dis86-demo\" is already taken","details":{}}}
{"level":"error","event":"index_failed","code":"PROJECT_NAME_TAKEN","exit":1}

$ npm run -s cli -- index acme-shop --name x --language php
EXIT=1
--- stdout
--- stderr
{"error":{"code":"INDEXING_DISABLED","message":"indexing disabled (fixtures-only mode)","details":{}}}
{"level":"error","event":"index_failed","code":"INDEXING_DISABLED","exit":1}

$ npm run -s cli -- index acme-shop --name x --language php --json
EXIT=1
--- stdout
--- stderr
{"error":{"code":"INDEXING_DISABLED","message":"indexing disabled (fixtures-only mode)","details":{}}}
{"level":"error","event":"index_failed","code":"INDEXING_DISABLED","exit":1}

$ npm run -s cli -- index ../etc --name x --language php
EXIT=1
--- stdout
--- stderr
{"error":{"code":"FORBIDDEN_PATH","message":"\"../etc\" is outside the allowed repositories directory","details":{}}}
{"level":"error","event":"index_failed","code":"FORBIDDEN_PATH","exit":1}

$ npm run -s cli -- index /tmp/otro --name x --language php
EXIT=1
--- stdout
--- stderr
{"error":{"code":"FORBIDDEN_PATH","message":"\"C:/Users/<user>/AppData/Local/Temp/otro\" is outside the allowed repositories directory","details":{}}}
{"level":"error","event":"index_failed","code":"FORBIDDEN_PATH","exit":1}

$ npm run -s cli -- index acme-shop --name x --language cobol
EXIT=2
--- stdout
--- stderr
{"error":{"code":"UNSUPPORTED_LANGUAGE","message":"cobol: not supported","details":{"allowed":["php"]}}}
{"level":"error","event":"index_failed","code":"UNSUPPORTED_LANGUAGE","exit":2}

$ npm run -s cli -- index acme-shop --name x --language typescript
EXIT=2
--- stdout
--- stderr
{"error":{"code":"UNSUPPORTED_LANGUAGE","message":"typescript: not available yet (CM-HU-18)","details":{"allowed":["php"]}}}
{"level":"error","event":"index_failed","code":"UNSUPPORTED_LANGUAGE","exit":2}

$ npm run -s cli -- index acme-shop --name x --language php --framework symfony
EXIT=2
--- stdout
--- stderr
{"error":{"code":"UNSUPPORTED_FRAMEWORK","message":"symfony: not supported","details":{"allowed":["laravel","fastify","none"]}}}
{"level":"error","event":"index_failed","code":"UNSUPPORTED_FRAMEWORK","exit":2}

$ npm run -s cli -- index acme-shop --language php
EXIT=2
--- stdout
--- stderr
{"error":{"code":"USAGE","message":"required option '--name <name>' not specified","details":{}}}
{"level":"error","event":"index_failed","code":"USAGE","exit":2}

$ npm run -s cli -- index acme-shop --name     --language php
EXIT=2
--- stdout
--- stderr
{"error":{"code":"USAGE","message":"--name must not be blank","details":{}}}
{"level":"error","event":"index_failed","code":"USAGE","exit":2}

$ npm run -s cli -- index no-repo --name x --language php
EXIT=1
--- stdout
--- stderr
[1/6] confine
[2/6] read
{"error":{"code":"NOT_A_GIT_REPOSITORY","message":"\"no-repo\" is not the root of a git repository","details":{}}}
{"level":"error","event":"index_failed","code":"NOT_A_GIT_REPOSITORY","exit":1}

$ npm run -s cli -- index vacio --name x --language php
EXIT=1
--- stdout
--- stderr
[1/6] confine
[2/6] read
{"error":{"code":"EMPTY_REPOSITORY","message":"\"vacio\" has no commits","details":{}}}
{"level":"error","event":"index_failed","code":"EMPTY_REPOSITORY","exit":1}

$ npm run -s cli -- index acme-shop --name x --language php
EXIT=1
--- stdout
--- stderr
{"error":{"code":"MISSING_CONFIG","message":"AUTHOR_HASH_SALT is not set","details":{"variable":"AUTHOR_HASH_SALT"}}}
{"level":"error","event":"index_failed","code":"MISSING_CONFIG","exit":1}

$ npm run -s cli -- index acme-shop --name x --language php
EXIT=1
--- stdout
--- stderr
{"error":{"code":"DATABASE_UNAVAILABLE","message":"cannot connect to the database","details":{}}}
{"level":"error","event":"index_failed","code":"DATABASE_UNAVAILABLE","exit":1}
```

## Outcome

- Status: PASS
- State restored: Yes (counts 0/0/0; build output rebuilt).
