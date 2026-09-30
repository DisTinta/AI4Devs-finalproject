# Manual Interface Testing Report

- Date: 2026-09-30
- Change: git-history-extraction (DIS-35)
- Step: 9 — Manual Interface Testing

The interface is the `GitPort` implementation `createSimpleGitHistory` (plus the salt helper
`authorHashSaltFromEnv`); no HTTP route or CLI command exists for it. It was exercised by a scratch
script outside the repository (`<scratchpad>/manual-git.mts`, run with `npx tsx`, deleted
afterwards) against the real fixtures and the local Postgres.

## Preparation

- `node fixtures/build-history.mjs` → `acme-shop: 32 commits, 3 authors`, `task-api: 28 commits, 3 authors`
- `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`
- Data state before: `project/file/commit/file_commit` = 0/0/0/0

## 9.2 Success path — reading both fixtures (salt `manual-scratch-salt-2026`)

| Fixture | head | commits | links | PR-tagged | distinct hashes | identity in output |
|---|---|---|---|---|---|---|
| acme-shop | `4f028db` | 32 | 59 | 17 | 3 | false |
| task-api | `d575816` | 28 | 41 | 14 | 3 | false |

Both match `fixtures/README.md` (32/3/17 and 28/3/14). Sample commits (newest first):

```
acme-shop
   4f028db 2024-05-06T09:31:00.000Z - d7568cc8479d… "docs: project readme"
   c5003aa 2024-05-02T14:49:00.000Z 61 4a172002e9c6… "fix: apply discount before tax and raise free-shipping threshold to 75 (#61)"
   1125a37 2024-04-16T10:03:00.000Z 55 a066079a6b86… "refactor: extend shipping zones and discount stacking (#55)"
task-api
   d575816 2024-09-02T13:07:00.000Z - 9c943118476a… "docs: api reference and project readme"
   dfeddcf 2024-08-29T09:52:00.000Z 40 c3d063d69953… "refactor: align schema defaults with service (#40)"
   5a58f83 2024-08-26T14:18:00.000Z - 0870b2413501… "test: request validation integration tests"
```

"identity in output" checks the whole serialised history for the three fixture author names
(accented: `Lucía Fernández`, `Marta Ibáñez`) and any `@*.test` e-mail.

## 9.3 Mutating path — persisting through `createPostgresStore({ pool })` and restoring

```
save #1 { files: 53, filesDeleted: 0, symbols: 0, edges: 0, commits: 32, fileCommits: 59 } stored commit/file_commit 32/59
save #2 { files: 53, filesDeleted: 0, symbols: 0, edges: 0, commits: 32, fileCommits: 59 } stored commit/file_commit 32/59
stored rows contain identity: false
after delete commit/file_commit 0/0 project rows 0
```

The second save upserts: counts unchanged. Restoration: the project was deleted (cascade removed
its files, commits and links) and verified gone.

## 9.4 Error cases

```
blank salt (factory)          -> Error "AUTHOR_HASH_SALT is required to pseudonymise commit authors; set it in .env (see .env.example)" containsSalt: false
missing salt (env helper)     -> Error "AUTHOR_HASH_SALT is required to pseudonymise commit authors; set it in .env (see .env.example)" containsSalt: false
non-existent path             -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: C:\Users\cristina\AppData\Local\Temp\codemind-missing-1790790696156"
dir outside any repo          -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: C:\Users\cristina\AppData\Local\Temp\codemind-manual-7CE3RR"
packages/ (subdir of Codemind) -> NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: C:/Users/cristina/Desktop/AI4Dev/00-TFM/Codemind/packages"
```

No message contains the salt. The `packages/` case is the nested-repository risk: without the
top-level check git would have read the Codemind history.

## 9.6 Data state after

- `project/file/commit/file_commit` = 0/0/0/0 (same as before)
- `git status --porcelain fixtures`: empty
- Temporary directory `codemind-manual-*` created by the script: removed (`rmdir`). The only other
  `codemind-*` entry in the temp dir (`codemind-hito2-review-*`) predates this change and was left
  untouched.
- Scratch script deleted.

## Outcome

- Status: PASS
- Blocking issues: none
