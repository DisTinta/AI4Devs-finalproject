# Test and State Verification Report

- Date: 2026-09-30
- Change: git-history-extraction (DIS-35)
- Step: 8 — Run Tests and Verify Data State

Environment: Windows 11, Node v24.11.1, git 2.45.1.windows.1, Postgres from `docker compose`
(`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`), branch
`feature/DIS-35-git-history-extraction`.

## Commands executed

- `node fixtures/build-history.mjs acme-shop` (step 0.5; the spec also rebuilds it in `beforeAll`)
- `npx vitest run` (pre-change baseline, step 0.5)
- `npx vitest run tests/unit/knowledge tests/unit/git tests/integration/git` (twice)
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `npx stryker run` (whole `packages/core`), and scoped runs with
  `--mutate packages/core/src/knowledge/commit-message.ts,packages/core/src/knowledge/author-hash.ts`
- `CI=true npx vitest run --exclude 'tests/integration/**'` with `DATABASE_URL` unset
- Forced failures (task 6.8), each on a scratch copy restored and checked with `cmp`

## Test results

- Pre-change baseline: 12 files, 186 tests passed.
- Targeted tests: 7 files, 74 passed, 0 failed, 0 skipped — twice (16.9 s, 17.1 s), no flakiness.
- Required suite: 16 files, 229 passed, 0 failed, 0 skipped; runtime 68.5 s (+4 files, +43 tests).
- No-database run (`CI=true`, no `DATABASE_URL`, integration excluded): 6 files, 62 passed, no
  import error.
- Gates: lint 0 errors (2 pre-existing warnings: empty `AnalyzerPort` / `LlmPort` stubs); typecheck
  green; `lint:architecture` 0 errors, 6 pre-existing `no-orphans` warnings (analyzer and LLM stubs;
  8 before this change — the git adapter is no longer orphaned); `docs:coverage` no warning.
- Mutation (threshold 70): `author-hash.ts` 100 % (10/10), `commit-message.ts` 100 % (22/22);
  all core files 89.90 %. The first scoped run left 3 survivors in `commit-message.ts`, all
  equivalent mutants of redundant code (a `\r` strip the patterns never need, and a
  `digits === undefined` branch `Number.isSafeInteger(NaN)` already covers); the code was
  simplified (task 4.3) rather than tested around.
- Scenario ↔ test: the 17 `#### Scenario:` of `specs/git-history/spec.md` each match exactly one
  test title (`grep -rF` over `tests/`).
- Tasks 6.5 went green without a new implementation step (6.4's parser already produced hashes and
  PR numbers); their power to fail is shown by the forced failures below.

### Forced failures (task 6.8)

| Mutation | Test that failed | Result |
|---|---|---|
| `authorHash: email` instead of `pseudonymiseAuthor(...)` | "The acme-shop history is persisted without names or e-mails" | failed: stored rows contained a fixture e-mail; restored, `cmp` OK |
| `message` without `stripIdentityTrailers` | "Identity trailers are removed from the message" | failed: message kept `Co-authored-by: …`; restored, `cmp` OK |
| `checkIsRepo()` without `IS_REPO_ROOT` (first version) | "A subdirectory of a repository is rejected" | failed: the read resolved with the parent's history; restored, `cmp` OK |
| top-level comparison removed (final version) | "A subdirectory of a repository is rejected" | failed the same way; restored, `cmp` OK |

### Design revision found while testing

`checkIsRepo(CheckRepoActions.IS_REPO_ROOT)` (simple-git 4.0.2) tests "`rev-parse --git-dir` is
`.git`", which rejects the root of a linked worktree (probe: main → `true`, linked worktree →
`false`). The spec requires any top-level directory to be accepted, so, with the author's approval,
the check now compares `git rev-parse --show-toplevel` with `repoPath` by real path (design D4.2).
Boundary test added: "accepts the top-level directory of a linked worktree" (RED before, GREEN after).

## Data state verification

- Pre-test baseline:
  - `pgmigrations`: `0001_graph-l1, 0002_history-claims, 0003_indexes-stale`
  - rows `project/file/commit/file_commit`: 0/0/0/0
  - `fixtures/acme-shop` `HEAD`: `4f028db4d51a3321031f3a24b3f36240410ed38c`
  - `git status --porcelain fixtures`: empty; `codemind-git-*` temp dirs: 0
- Post-test validation:
  - `pgmigrations`: unchanged
  - rows `project/file/commit/file_commit`: 0/0/0/0 (the persistence test runs in the harness
    transaction, rolled back)
  - `fixtures/acme-shop` `HEAD`: `4f028db…` (the rebuild is deterministic)
  - `git status --porcelain fixtures`: empty; `codemind-git-*` temp dirs: 0; no `.stryker-tmp/`
- State restored: Yes (nothing to restore)
- Restoration actions: none

## End-to-end testing (step 10.1)

Not applicable: the change adds no HTTP route, CLI command or web screen; the new interface is the
`GitPort` implementation, exercised in step 9.

## UI evidence (if applicable)

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none. CI evidence (step 10.2) pending until the branch is pushed.
