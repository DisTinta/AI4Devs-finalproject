# Test and State Verification Report

- Date: 2026-10-08
- Change: index-repository-debt (DIS-100)
- Step: 8 — Backend: Run Tests and Verify Data State

## Commands executed

- Docker Desktop was stopped at the start; it was started, then `docker compose up -d` and
  `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (compose defaults)
- Baseline / post-state: `git status --porcelain fixtures`, `git ls-files -s fixtures | sha1sum`,
  `docker compose exec -T postgres psql -U codemind -d codemind -tAc "SELECT (SELECT count(*) FROM project),(SELECT count(*) FROM commit)"`
- Targeted: `npx vitest run tests/unit/git tests/unit/index tests/unit/cli tests/integration/git tests/integration/index`
- Broad: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`,
  `npm run docs:coverage`
- No-database run: `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'`
- Mutation: `npx stryker run --mutate "packages/core/src/index/source-path.ts"`
- Forced failures: the production file copied to the scratchpad, mutated with `sed`, the test run,
  the file restored with `cp` and checked with `cmp`

## Test results

- Baseline before any change (task 0.4): 44 files, **645 passed**, 69.48 s.
- Targeted (shell without `DATABASE_URL`): 17 files passed, 1 skipped; 213 passed, 6 skipped (the
  DB-backed `describeWithDatabase` blocks); 61.87 s. The same files ran with the database inside the
  required suite below.
- Required suite (final, with the database): **47 files, 664 passed**, 67.19 s.
- No-database run: 32 files, 442 passed (integration excluded).
- Lint: 0 errors, 1 pre-existing warning (`packages/core/src/ports/LlmPort.ts`, empty interface).
- Typecheck: green. Architecture: 0 errors, 4 pre-existing warnings (orphans in `dist/` of stubs).
- Docs coverage: exit 0, no warnings (four `{@link spawnReaderGit}` warnings appeared mid-way, since
  the helper is not exported from the package; the links became code spans).
- Mutation, `source-path.ts`: **100 %** (46 killed, 0 survived, 0 without coverage; ≥ 70 required).
- End-to-end: **not applicable** — no route, page or other user interface changes; the only
  interface, the CLI `index` command, is exercised in step 9.

### Durations of the git and indexing specs

| Spec | Before (baseline) | After |
|---|---|---|
| `acme-shop.spec.ts`, full suite | 25.4 s | 16.1 s (21.2 s in an earlier full run) |
| `acme-shop.spec.ts`, alone | — | 18.6 s file; each indexing 1.1–1.4 s (was ~6 s) |
| `git-source-tree.spec.ts` | 18.5 s (18 tests) | 34.7 s (22 tests, incl. a 500-file repository) |
| `simple-git-history.spec.ts` | 57.0 s (26 tests) | 66.4 s (28 tests, incl. a 300-commit repository) |

Most of `acme-shop.spec.ts` is the fixture history build in `beforeAll`. Its timeout dropped from
60 s to 20 s (task 7.2).

### RED and forced failures

| Test | How it was shown to fail |
|---|---|
| C1, bidirectional and separator characters make a path invalid | RED before 1.2: the analyzer received 15 files instead of 3 |
| Control characters are escaped in the log, the JSON report and the error | section 1 alone made it fail (`secret_redacted` line for `k\u009b2J.php` gone), then updated (6.1) |
| spawnReaderGit unit tests | RED: `spawnReaderGit is not a function` |
| A file over the size limit / Paths that are not UTF-8 / Many files | RED: `big.txt` read; `a\ufffd.php` read as a file; 500 files timed out at 5 s with one process per blob |
| missing object mid-batch (extra) | written after 4.4; removing the `MissingObject → git's error` branch makes it fail; restored, `cmp` ok |
| LogParser unit tests | RED: `LogParser is not a constructor`; dropping the bytes after a chunk's last NUL fails both |
| A link whose path is not UTF-8 is left out | RED: link `a\ufffd.php` returned by the `git.raw` reader |
| A long history read as a stream equals the history read whole | passed before 5.6 (the old reader read whole too). The "drop the chunk tail" mutant **survives** it: on this machine git flushes per commit, so pipe chunks end on NUL. That mutant is killed by the LogParser unit tests (1-byte and 7-byte chunks) |
| A redaction event's file path is escaped in its log line | passed at once (existing behaviour); `toTerminalSafeJson` without its replace makes it fail; restored, `cmp` ok |
| Bidirectional and separator characters in untrusted strings are escaped | RED before 6.3's change; `safe-json.ts` from `HEAD` makes it fail again; restored, `cmp` ok |

### Finding while implementing (design D3)

For a missing object (corrupt repository or partial clone under `GIT_NO_LAZY_FETCH`, git
2.45.1.windows.1), `ls-tree -l` prints the size `BAD` and `cat-file --batch` prints `<oid> missing`,
both with exit code 0. Only `git cat-file blob <oid>` gives git's own error
(`fatal: git cat-file <oid>: bad file`), which the scenario "A partial clone never fetches a missing
object" requires. The reader now runs that one command on this failure path only.

### Scenario → test map (task 7.3)

| Spec | Scenario | Test |
|---|---|---|
| repository-indexing | Only the files tracked at HEAD are read | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A path that is not a repository root is rejected | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A .git directory or a bare repository is not a repository root | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A repository with no commit is rejected | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A HEAD on an orphan branch is rejected as empty | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A broken HEAD propagates git's error | `git-source-tree.spec.ts` (same name) |
| repository-indexing | Symbolic links and submodules are skipped and reported | `git-source-tree.spec.ts` (same name) |
| repository-indexing | Content that is not UTF-8 is skipped and reported | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A file over the size limit is skipped without being read | `git-source-tree.spec.ts` (same name, new) |
| repository-indexing | Paths that are not UTF-8 are skipped and never merged | `git-source-tree.spec.ts` (same name, new) |
| repository-indexing | Many files are read without one process per file | `git-source-tree.spec.ts` (same name, new) |
| repository-indexing | The real path follows symbolic links | `git-source-tree.spec.ts` (same name) |
| repository-indexing | Reading executes nothing from the repository | `git-source-tree.spec.ts` (same name) |
| repository-indexing | A partial clone never fetches a missing object | `git-source-tree.spec.ts` (same name) |
| repository-indexing | Malformed, repeated and binary entries never reach the analyzer | `index-repository.spec.ts` (same name) |
| repository-indexing | C1, bidirectional and separator characters make a path invalid | `index-repository.spec.ts` (same name, new) |
| git-history | The acme-shop history is read completely | `simple-git-history.spec.ts` (same name) |
| git-history | A repository without commits yields an empty history | `simple-git-history.spec.ts` (same name) |
| git-history | Reading does not modify the repository | `simple-git-history.spec.ts` (same name) |
| git-history | A merge commit is listed without file links | `simple-git-history.spec.ts` (same name) |
| git-history | Control characters in names and messages stay in their field | `simple-git-history.spec.ts` (same name) |
| git-history | Paths Git would quote arrive verbatim | `simple-git-history.spec.ts` (same name) |
| git-history | A link whose path is not UTF-8 is left out | `simple-git-history.spec.ts` (same name, new); unit `parse-log.spec.ts` |
| git-history | A long history read as a stream equals the history read whole | `simple-git-history.spec.ts` (same name, new); unit `parse-log.spec.ts` |
| cli-indexing | Diagnostics and skipped paths are escaped | `render-report.spec.ts` (same name) |
| cli-indexing | Control characters are escaped in the log, the JSON report and the error | `index-command.spec.ts` (same name, updated) |
| cli-indexing | Bidirectional and separator characters in untrusted strings are escaped | `render-report.spec.ts` (same name, new) |
| cli-indexing | A redaction event's file path is escaped in its log line | `index-command.spec.ts` (same name, new) |

## Data state verification

- Pre-test baseline:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
  - `project` / `commit` rows: 0 / 0
- Post-test validation:
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
  - `project` / `commit` rows: 0 / 0
- State restored: Yes (nothing to restore; every integration test runs in a reverted transaction or
  under the OS temp dir)
- Restoration actions: none

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none. Pending: task 10.2 (CI run of the pushed branch), which needs the push.

## Final run (after `/verify-against-spec` and `/adversarial-review` fixes)

- `npx vitest run` (with the database): **48 files, 682 passed**, 72.16 s (664 at the first pass;
  +2 for the verify fixes, +1 for the adversarial `cat-file` early-end test, +11 parser unit tests,
  +4 `parse-log` unit tests).
- No-database run: 33 files, 457 passed.
- Lint: 0 errors, 1 pre-existing warning. Typecheck: green. Architecture: 0 errors, 4 pre-existing
  warnings. Docs coverage: exit 0.
- Mutation: `source-path.ts` 100 %; `parse-log.ts` 82.64 %; `git-source-tree.ts` parser ranges
  (130–160, 256–305) 92.63 % — survivors listed in `2026-10-08-adversarial-review.md`.
- Data state: `project` 0, `commit` 0; fixtures unchanged
  (`b97101fedecb07b21ca67c6156224d81bc13a3e8`, empty status).
