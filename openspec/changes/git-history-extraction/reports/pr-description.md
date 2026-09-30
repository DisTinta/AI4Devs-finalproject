## What changes?

`GitPort` gets its contract (`readHistory(repoPath)` → `GitHistory { head?, commits, fileCommits }`,
reusing `GraphCommit` / `GraphFileCommit`) and `@codemind/adapter-git` implements it with
`simple-git` in a single `git log --numstat --no-renames` pass. Authors leave the adapter only as an
HMAC-SHA256 of the normalised e-mail keyed by the required `AUTHOR_HASH_SALT`, identity trailers are
stripped from messages, and `prNumber` is taken from the subject; the privacy and parsing rules live
in core, and `NotAGitRepository` rejects any path that is not a repository's top-level directory.

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `docker compose up -d` and wait until Postgres is healthy.
2. `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
3. `npm run db:migrate` (migrations `0001`–`0003`; this PR adds none).
4. `npm ci` (adds `simple-git` to `@codemind/adapter-git`); `git` must be on `PATH`.
5. `npx vitest run tests/unit/knowledge tests/unit/git tests/integration/git` → 7 files, 74 tests
   passed. The git spec rebuilds `fixtures/acme-shop/.git` itself in `beforeAll`.
6. `npx vitest run` → 16 files, 229 tests passed.
7. `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage` → exit 0
   (lint: 2 pre-existing warnings on the empty `AnalyzerPort` / `LlmPort`; architecture: 6
   pre-existing `no-orphans` warnings, down from 8).
8. `npx stryker run` → `author-hash.ts` and `commit-message.ts` 100 %, all core files 89.90 %
   (threshold `MIN_MUTATION_SCORE=70`).
9. Check the shared database is back to its baseline: `project`, `file`, `commit` and `file_commit`
   have the same row counts as before step 5, and `git status --porcelain fixtures` is empty.

## Decisions / trade-offs

- **The port never carries an identity** (`design.md` D1). The adapter hashes each author as soon as
  its log record is parsed; a `RawCommit` with name and e-mail crossing into the domain was rejected
  because it would move personal data through core.
- **Privacy rules in core** (`design.md` D2). `pseudonymiseAuthor`, `extractPrNumber` and
  `stripIdentityTrailers` are pure core functions, so Stryker covers them; the adapter only calls
  them. HMAC rather than `sha256(salt + email)`; the e-mail is the identity, the name only a fallback
  when the e-mail is blank.
- **Seven identity trailers, not five** (proposal → Privacy, `design.md` D2). `Tested-by` and
  `Suggested-by` are removed on top of the ticket's list, as a privacy expansion; each of the seven
  has its own unit case.
- **Top-level check by real path** (`design.md` D4.2, revised during apply). simple-git's
  `checkIsRepo(IS_REPO_ROOT)` rejected the root of a linked worktree, so the adapter compares
  `git rev-parse --show-toplevel` with `repoPath` by real path. This is also what stops a fixture
  without its own `.git` from silently reading the Codemind history.
- **One `git log` pass with `--no-renames`** (`design.md` D4). A rename appears as a delete plus an
  add, so links can name paths the snapshot no longer has; dropping them before `saveGraph` is left
  to DIS-85 (proposal non-goals).
- **The salt is a parameter** (`design.md` D5). `createSimpleGitHistory({ authorHashSalt })` never
  reads the environment; `authorHashSaltFromEnv(process.env)` is for the composition root (DIS-85).
  Missing or blank salt fails before any git process, with a message that never contains the value.
- **No ADR** (`design.md` D7): the decisions are local to the capability and `simple-git` was already
  chosen in readme §2.2.

## Traceability

Spec: `openspec/changes/git-history-extraction/specs/git-history/spec.md` (17 scenarios).

| Scenario in the specification | Test that covers it |
|---|---|
| The acme-shop history is read completely | `tests/integration/git/simple-git-history.spec.ts:61` |
| A repository without commits yields an empty history | `tests/integration/git/simple-git-history.spec.ts:96` |
| Commits of one author share a hash | `tests/integration/git/simple-git-history.spec.ts:106` |
| A different salt changes every hash | `tests/integration/git/simple-git-history.spec.ts:122` |
| E-mail case and surrounding whitespace do not change the hash | `tests/unit/knowledge/author-hash.spec.ts:8` |
| An empty e-mail falls back to the normalised name | `tests/unit/knowledge/author-hash.spec.ts:17` |
| A missing or blank salt is rejected | `tests/unit/git/salt-config.spec.ts:7` |
| Identity trailers are removed from the message | `tests/integration/git/simple-git-history.spec.ts:145` |
| A squash-style number is extracted | `tests/unit/knowledge/commit-message.spec.ts:6` |
| A merge-commit number is extracted | `tests/unit/knowledge/commit-message.spec.ts:10` |
| A message without a number has none | `tests/unit/knowledge/commit-message.spec.ts:14` |
| The acme-shop PR numbers are extracted | `tests/integration/git/simple-git-history.spec.ts:134` |
| Text and binary files are counted correctly | `tests/integration/git/simple-git-history.spec.ts:166` |
| A directory without Git is rejected | `tests/integration/git/simple-git-history.spec.ts:188` |
| A subdirectory of a repository is rejected | `tests/integration/git/simple-git-history.spec.ts:199` |
| A non-existent path is rejected | `tests/integration/git/simple-git-history.spec.ts:212` |
| The acme-shop history is persisted without names or e-mails | `tests/integration/git/simple-git-history.spec.ts:227` |

Boundary test outside the scenarios: "accepts the top-level directory of a linked worktree"
(`tests/integration/git/simple-git-history.spec.ts:80`), added with the D4.2 revision.

## Origin

`agent+human-review`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
