# Verify Against Spec — index-repository-debt (DIS-100)

- Date: 2026-10-08
- Run: `/verify-against-spec index-repository-debt` (read-only conformance audit, forked agent),
  after `/show-spec-working`.

## Verdict of the audit

Every requirement of the three delta specs (`cli-indexing`, `git-history`, `repository-indexing`) is
implemented, and no production behaviour was missing. It reported five places where the tests proved
less than their scenario and five unspecified behaviours, two of which needed a decision before the PR.

## Findings and what was done

| # | Finding | Action |
|---|---|---|
| 2.1 | "SHALL NOT hold the whole raw output in memory" has no test that measures memory; the 300-commit test proves equality only | **Accepted, not tested further.** The property is structural (`LogParser` keeps only the current incomplete value, `parse-log.ts`). Its failure mode, losing or merging bytes across chunk boundaries, is pinned by the unit tests with 1-byte and 7-byte chunks, which kill the "drop the chunk tail" mutant. A heap-size assertion would be flaky. |
| 2.2 | "When git fails part-way … SHALL NOT resolve with a partial history" had no test | **Fixed.** New integration test "rejects with git's error, never a partial history, when git fails part-way": a stand-in process delivers half of a real `git log` output, then fails. Forced failure: making `readLog` resolve when the parser already holds commits fails it (`Unexpected git log output at commit 2` instead of git's error); restored, `cmp` ok. |
| 2.3 | "Many files" counts only the processes the adapter spawns itself, not the simple-git checks | **Accepted.** `assertRepositoryRoot` and `hasCommits` run a fixed sequence of commands that never depends on the file count; the scenario's property is that the count does not grow with the files. Recorded in design D1. |
| 2.4 | "skipped *without being read*" was proven by the output only | **Fixed.** The size-limit and non-UTF-8 tests now record every object id written to `cat-file --batch`'s stdin: `big.txt`'s id is never written, `edge.txt`'s is; for the non-UTF-8 case only `ok.php`'s id is written. Forced failure: treating an over-limit file as readable fails the size test; restored, `cmp` ok. |
| 2.5 | A missing object behind an entry that is only skipped (symlink, non-UTF-8 path, over the limit) resolved as a normal skip | **Fixed.** Any entry whose `ls-tree -l` size is `BAD` now rejects with git's own error (`git-source-tree.ts`), since the spec allows no partial result from an incomplete repository. New test: a symbolic link whose blob is removed rejects with `fatal: git cat-file <oid>: bad file`. Forced failure: restricting the check to entries that are read fails it; restored, `cmp` ok. |
| 3.1 | The package index exported `MAX_BLOB_BYTES`, `GitSourceTreeDependencies`, `GitProcess`, `GitSpawner` | **Fixed.** Removed from `packages/adapters/git/src/index.ts`; the public API is as before DIS-100. |
| 3.2 | `createGitSourceTree({ spawnGit })` and `createSimpleGitHistory({ spawnGit })` let any caller replace the launcher, bypassing `GIT_CONFIG` and `GIT_ENV` | **Fixed.** Public factories back to their original signatures; the seam moved to internal `gitSourceTreeWith(spawnGit)` and `simpleGitHistoryWith(options, spawnGit)`, not exported by the package and used only by tests. Design D1 and `docs/project-context.md` updated. |
| 3.3 | The extra `git cat-file blob <oid>` on a missing object, and its fallback, are only in the design | **Documented.** Design D3 (already there) and the project-context gotcha; it adds no process to a successful read. |
| 3.4 | `BatchAnswerError`, the invalid-oid check and the parse-error-over-exit-error preference are only in code | **Documented** in design D3 and D4; they fall under the spec's "any other git failure propagates as an error". |
| 3.5 | The `ls-tree` listing is read whole | **Documented** as a non-goal in the proposal and in design D3: it holds one short line per entry, not contents. |

## After the fixes

- `openspec validate index-repository-debt --strict`: valid.
- `npx vitest run` (with the database): **47 files, 666 passed** (664 + the two new tests), 70.68 s.
- `npm run lint`: 0 errors, 1 pre-existing warning. `npm run typecheck`: green.
  `npm run lint:architecture`: 0 errors, 4 pre-existing warnings. `npm run docs:coverage`: exit 0.
- Data state: `project` 0, `commit` 0; `git status --porcelain fixtures` empty.
