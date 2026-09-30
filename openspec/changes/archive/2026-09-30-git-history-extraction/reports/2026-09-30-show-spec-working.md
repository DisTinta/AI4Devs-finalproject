# Show Spec Working — git-history-extraction (DIS-35)

- Date: 2026-09-30
- Branch: `feature/DIS-35-git-history-extraction` (head `3c36acc`, PR #11)
- Spec: `specs/git-history/spec.md` (8 requirements, 17 scenarios)
- Interface exercised: the `GitPort` adapter (`createSimpleGitHistory`, `authorHashSaltFromEnv`),
  the core rules it exposes (`pseudonymiseAuthor`, `extractPrNumber`) and the Postgres store
  (`createPostgresStore({ pool })`) — against the rebuilt fixtures, throwaway repositories under the
  OS temp dir and the local database. No HTTP route or CLI command exists for this capability.
- Driver: [`./2026-09-30-demo.mts`](./2026-09-30-demo.mts), independent of the repo's test suite;
  transcript: [`./2026-09-30-demo-output.txt`](./2026-09-30-demo-output.txt).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| The acme-shop history is read completely | `readHistory(fixtures/acme-shop)` | 32 commits, 32 distinct shas, newest first; `head` = `git rev-parse HEAD` = `4f028db…`; `(#61)` at `2024-05-02T14:49:00.000Z` links `PriceCalculator.php` and `config/shop.php` | yes | transcript, History reading |
| A repository without commits yields an empty history | `readHistory` on a fresh `git init` repo | `head` undefined, `commits` `[]`, `fileCommits` `[]`, no error | yes | transcript |
| Commits of one author share a hash | two reads of acme-shop, same salt | identical hashes in both reads, all 64 lowercase hex, 3 distinct, one per author e-mail | yes | transcript, Author pseudonymisation |
| A different salt changes every hash | reads with `salt-a` and `salt-b` | 0 commits share a hash across salts | yes | transcript |
| E-mail case and surrounding whitespace do not change the hash | `pseudonymiseAuthor` on `' Ana@X.test '` and `'ana@x.test'` | both `a2f13c5f…73ef6` | yes | transcript |
| An empty e-mail falls back to the normalised name | e-mail `''` / `'   '`, name `' Ana Pérez '` / `'ana pérez'` | all three `ee3f2d1a…fabff`; with an e-mail `a2f13c5f…` (different) | yes | transcript |
| A missing or blank salt is rejected | `authorHashSaltFromEnv({})`, `({ AUTHOR_HASH_SALT: '   ' })`, `createSimpleGitHistory({ authorHashSalt: '   ' })` | all three throw "AUTHOR_HASH_SALT is required …" synchronously, before any `GitPort` exists | yes | transcript, Salt is mandatory |
| Identity trailers are removed from the message | commit `feat: x (#7)` + `Co-authored-by` + `Signed-off-by` in a temp repo, then `readHistory` | raw message keeps the trailers; stored `message` = `feat: x (#7)`, `prNumber` 7 | yes | transcript, Message sanitisation |
| A squash-style number is extracted | `extractPrNumber('fix: a (#3) and b (#61)')` | 61 | yes | transcript |
| A merge-commit number is extracted | `extractPrNumber('Merge pull request #12 from org/branch')` | 12 | yes | transcript |
| A message without a number has none | `chore: y`, and `chore: y` + body `see (#9)` | undefined in both | yes | transcript |
| The acme-shop PR numbers are extracted | `readHistory(fixtures/acme-shop)` | 17 commits with a number (61 … 12); `(#61)` commit → 61 | yes | transcript |
| Text and binary files are counted correctly | temp repo commit with a 3-line text file and a binary | `notes.txt` 3 added / 0 removed; `image.bin` link with neither count | yes | transcript, Line counts |
| A directory without Git is rejected | `readHistory` on a temp dir (git itself sees no repo) | `NotAGitRepository`, `NOT_A_GIT_REPOSITORY`, `repoPath` = that dir | yes | transcript, Not a repository |
| A subdirectory of a repository is rejected | `readHistory(<repo>/src)` | `NotAGitRepository` | yes | transcript |
| A non-existent path is rejected | `readHistory(<tmp>/does-not-exist)` | `NotAGitRepository`, `repoPath` = that path | yes | transcript |
| The acme-shop history is persisted without names or e-mails | new project + `saveGraph` of the acme-shop history (53 files, 32 commits, 59 links) via the pool store, then `SELECT` of every `commit` / `file_commit` row | save reports 32 commits; 32 rows, 17 with `pr_number`, 3 `author_hash`; `(#61)`: `pr_number` 61, `committed_at` `2024-05-02T14:49:00.000Z`, links `PriceCalculator.php` (+9/−5) and `config/shop.php` (+1/−1); 0 of the 6 fixture names/e-mails and no `@acme.test` in any row | yes | transcript, Persisted history |

Boundary outside the scenarios (design D4.2): the root of a linked worktree is accepted
(`readHistory` returns its one commit `feat: a`) — PASS.

## Evidence

Commands (repository root, Windows 11, Node v24.11.1, git 2.45.1):

```
docker compose ps                        # codemind-postgres-1 Up (healthy)
export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind
npm run db:migrate                       # No migrations to run!
node fixtures/build-history.mjs          # acme-shop: 32 commits, 3 authors / task-api: 28 commits, 3 authors
npx tsc --build
npx tsx openspec/changes/git-history-extraction/reports/2026-09-30-demo.mts > …/2026-09-30-demo-output.txt   # exit 0
```

The verbatim output of the driver is [`./2026-09-30-demo-output.txt`](./2026-09-30-demo-output.txt);
it ends with `== ALL SCENARIOS PASS`. The `warning: … LF will be replaced by CRLF` lines in it come
from the machine's global `core.autocrlf` while the driver commits files into its temp repositories;
they do not affect the results (the 3-line text file still counts 3 added lines).

No screenshots: the capability has no browser UI.

## State

- Before: `pgmigrations` = `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`;
  `project/file/commit/file_commit` = 0/0/0/0; `fixtures/acme-shop` `HEAD` = `4f028db…`;
  `git status --porcelain fixtures` empty; `codemind-demo-*` temp dirs = 0.
- After: `pgmigrations` unchanged; `project/file/commit/file_commit` = 0/0/0/0; fixture `HEAD`
  `4f028db…` (the rebuild is deterministic); `git status --porcelain fixtures` empty;
  `codemind-demo-*` temp dirs = 0.
- Restored: yes. The driver deleted the project it created (`27df024f-…`, cascade: 0 commit rows left)
  in a `finally`, and removed its 8 temporary directories (including the linked worktree).

## Not demonstrated

- None of the 17 scenarios. The "Reading SHALL NOT modify the repository" clause of *History
  reading* has no scenario of its own; it is shown indirectly by the unchanged fixture `HEAD` and
  the empty `git status --porcelain fixtures` after the run.

## Handoff

The change is **demonstrably working**: all 17 scenarios of `git-history` pass against the real
adapter, the real fixtures and the real database, the error paths included, and the state is back to
its baseline. No screenshot or other file was written at the repository root.
