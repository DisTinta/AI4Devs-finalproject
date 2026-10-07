# Manual Interface Testing Report

- Date: 2026-10-06
- Change: index-repository (DIS-85)
- Step: 9. Backend: Manual Interface Testing

The interface is the core API `indexRepository` composed with the real adapters
(`createGitSourceTree`, `createPhpAnalyzer`, `createSimpleGitHistory`, `createPostgresStore`). No CLI
command or route calls it yet (DIS-86). Absolute temporary paths are masked as `<ROOT>` (the allowed
root, a fresh directory under the OS temp dir).

## Environment and state before

- Postgres from `docker compose up -d`, `DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`.
- `npx tsc --build` (the script imports the built `dist` of the workspace packages).
- Rows before: `project` 0, `commit` 0, `file` 0 (step 8 baseline).

## Commands executed

- `node <scratchpad>/manual-index.mjs` — a scratch script outside the repository. It copies
  `fixtures/acme-shop` (without `.git`) to `<ROOT>/acme-shop` and rebuilds its history with
  `buildOne`; creates `<ROOT>/plain-dir`, `<ROOT>/fresh-repo` (`git init`, no commit) and
  `<ROOT>/escape`, a directory junction to a second temporary directory outside `<ROOT>`; opens one
  `pg` client, runs `BEGIN`, builds the store with `createPostgresStore({ transaction: client })`,
  indexes and runs the error cases, then **`ROLLBACK`** in a `finally`.

## Success path

```
phases: confine > read > redact > analyze > history > save
report: {
  "projectId": "4a7acebf-9d87-476c-95a2-aa8453310754",
  "indexedCommit": "4f028db4d51a3321031f3a24b3f36240410ed38c",
  "framework": "laravel",
  "frameworkSource": "detected",
  "files": 53, "filesDeleted": 0, "symbols": 121, "commits": 32, "fileCommits": 59,
  "edges": { "total": 170, "exact": 137, "heuristic": 33 },
  "events": [{ "type": "secret_redacted", "file": "config/services.php", "line": 21, "column": 44, "rule": "aws-access-key-id" }],
  "commitEvents": [],
  "diagnostics": "0 diagnostics",
  "skipped": []
}
project: {
  "name": "dis-85-manual-acme-shop", "rootPath": "<ROOT>\\acme-shop", "framework": "laravel",
  "indexedCommit": "4f028db4d51a3321031f3a24b3f36240410ed38c", "indexedAt": "set",
  "nodeCount": 174, "edgeCount": 170
}
HEAD of the copy: 4f028db4d51a3321031f3a24b3f36240410ed38c
rows matching /AKIA[A-Z0-9]{16}/: { "symbols": "0", "commits": "0" }
report matches /AKIA[A-Z0-9]{16}/: false
```

Checks: `indexedCommit` equals the copy's `HEAD`; `nodeCount` 174 = 53 files + 121 symbols;
`edgeCount` 170 = 137 exact + 33 heuristic; `rootPath` is the real path; one redaction event at
`config/services.php:21:44`; no row and no report field holds an AWS key id.

## Mutating operations and restoration

`createProject` and `saveGraph` ran on the open transaction (each write a `SAVEPOINT`, nothing
committed).

```
projects with the manual name inside the transaction: 1
projects with the manual name after ROLLBACK: 0
```

Rows after the script (`project` / `commit` / `file`): 0 / 0 / 0, equal to the baseline. No
restoration needed beyond the script's own `ROLLBACK`.

## Error cases

Each one run with a fresh progress spy, after the success path, on the same transaction:

```
repoPath ../etc:            ForbiddenPathError FORBIDDEN_PATH "Forbidden path: ../etc" | phases: confine
blank root:                 IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)" | phases: confine
root that does not exist:   IndexingDisabled INDEXING_DISABLED "indexing disabled (fixtures-only mode)" | phases: confine
junction escaping the root: ForbiddenPathError FORBIDDEN_PATH "Forbidden path: escape" | phases: confine
not a repository:           NotAGitRepository NOT_A_GIT_REPOSITORY "Not a Git repository: <ROOT>\plain-dir" | phases: confine > read
repository with no commit:  EmptyRepository EMPTY_REPOSITORY "Git repository has no commit: <ROOT>\fresh-repo" | phases: confine > read
repeated name:              ProjectNameTaken PROJECT_NAME_TAKEN "Project name already taken: dis-85-manual-acme-shop" | phases: confine > read > redact > analyze > history > save
```

For every case: the message does not show the junction's target ("message shows link target:
false") and does not match `/AKIA[A-Z0-9]{16}/`. The junction case names only `escape`, the path as
requested. The `NotAGitRepository` and `EmptyRepository` messages carry the absolute repository path,
recorded as a Low privacy finding routed to DIS-86 (step 8 report).

## Outcome

- Status: PASS
- State restored: Yes (transaction rolled back; counts equal to the baseline)
- The scratch script stays in the session scratchpad, outside the repository.
