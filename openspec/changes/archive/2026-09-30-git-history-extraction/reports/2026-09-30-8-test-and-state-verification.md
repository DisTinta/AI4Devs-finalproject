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

## CI evidence (step 10.2)

PR #11 (https://github.com/DisTinta/AI4Devs-finalproject/pull/11), head `fe252c1`, `ci.yml` job
`quality` run 36756128150 — success (1m43s); `frontend.yml` — success (33s).

- `Tests` step: 16 files, 229 tests passed. `tests/integration/git/simple-git-history.spec.ts`
  ran 12 tests, none skipped, including the `git history persistence` block on the job's Postgres;
  its `beforeAll` rebuilt `fixtures/acme-shop/.git` on the Ubuntu runner. `tests/unit/git/salt-config.spec.ts`
  ran 5 tests.
- `Mutation testing on critical paths`: all core files 89.90 %; `author-hash.ts` 100 % (10),
  `commit-message.ts` 100 % (22). Stryker lists the `salt-config` tests as covering 0 mutants:
  expected, they exercise the adapter, which is not mutated.

## Outcome

- Status: PASS
- Blocking issues: none.

## Post-verify delta (verify-against-spec, 2026-09-30)

- Spec only, no production change: "Message sanitisation" now states that indented trailers are
  removed and trailing whitespace is always trimmed; "Salt is mandatory" states that the salt is
  trimmed before use (design D2/D5 and the code already did so). Three scenarios added for clauses
  that were MUST without one: 17 → 20.
- New tests in `tests/integration/git/simple-git-history.spec.ts`: "Reading does not modify the
  repository" (`:104`), "A merge commit is listed without file links" (`:127`), "The returned history
  holds no name or e-mail" (`:153`, runs without a database).
- Commands: `npx vitest run tests/unit tests/integration/git` → 7 files, 77 passed;
  `npx vitest run` → 16 files, 232 passed (64.7 s); `npm run typecheck` green; `npm run lint`
  0 errors (the 2 pre-existing warnings). 20 scenarios ↔ 20 tests with the same name (`grep -rnF`).
- Forced failures, each on a scratch copy restored and confirmed with `cmp`:

  | Mutation | Test that failed |
  |---|---|
  | `git update-ref refs/codemind/probe HEAD` inside `readHistory` | "Reading does not modify the repository" (snapshot differs) |
  | `-m` added to `LOG_ARGUMENTS` (merge diffs) | "A merge commit is listed without file links" (`side.txt` linked to the merge) |
  | `authorHash: email` | "The returned history holds no name or e-mail" (a fixture e-mail in the serialised history) |

- State after: `project/file/commit/file_commit` 0/0/0/0, `git status --porcelain fixtures` empty.
- CI on the delta: PR #11 head `a0fae0c`, `ci.yml` run 36758833219 — success (1m59s), `frontend` —
  success. `Tests`: 16 files, 232 passed; `simple-git-history.spec.ts` ran 15 tests, database block
  included. Mutation: all core files 89.90 % (unchanged: the delta touched no production code).

## Post-review delta (adversarial-review, 2026-09-30)

Verdict PASS WITH GAPS (three Majors); fixed per the author's decisions.

- Spec/design/proposal: PR number range 0..2147483647 (Major 1); `git log -z` framing, values in
  their own field, raw paths (Major 2; design D4 steps 4–5 revised); privacy SHALL scoped to
  `authorHash`, structured values and identity trailers, free-text body as non-goal (Major 3);
  adapter salt trim scenario; `.mailmap` accepted. 20 → 25 scenarios; `openspec validate --strict`
  green.
- Probe before the rewrite (git 2.45.1, throwaway repositories): with `-z`, an author name with
  `\x1f` and a message with `\x1e`/`\x1f` arrive intact; `q"uote.txt` and `t<TAB>tab.txt` arrive raw
  (without `-z`: `"q\"uote.txt"`, `"t\ttab.txt"`); merges and empty messages go straight to the next
  sha. Windows git refuses those paths in the index unless `core.protectNTFS=false`, which the test
  sets for its own commit only.
- RED before GREEN: "A number beyond 32 bits is dropped" failed with `expected 2147483648 to be
  undefined`; "Control characters in names and messages stay in their field" failed with the
  `TypeError` the review predicted (`Cannot read properties of undefined (reading 'split')`);
  "Paths Git would quote arrive verbatim" failed with the quoted paths. "The adapter trims the salt
  it receives" pins existing behaviour (green at once).
- Forced failures, each on a scratch copy restored and confirmed with `cmp`:

  | Mutation | Test that failed |
  |---|---|
  | `Number.isSafeInteger(number)` instead of `number <= PR_NUMBER_MAX` | "A number beyond 32 bits is dropped" |
  | `parse-log.ts` back to the `\x1e`/`\x1f` version | both `log framing` tests |
  | `options.authorHashSalt` (untrimmed) passed to `parseLog` | "The adapter trims the salt it receives" |

- Commands: `npx vitest run tests/integration/git tests/unit` → 7 files, 82 passed;
  `npx vitest run` → 16 files, 237 passed (61.0 s); no-database run (`CI=true`, integration
  excluded) → 6 files, 64 passed; `npm run typecheck` green; `npm run lint` 0 errors (2 pre-existing
  warnings); `npm run lint:architecture` 0 errors (6 pre-existing warnings); `npm run docs:coverage`
  no warning; `npx stryker run` → all core files 90.09 %, `author-hash.ts` 100 % (10),
  `commit-message.ts` 100 % (26). 25 scenarios ↔ 25 tests with the same name.
- Debt and hand-offs: one C checklist comment in Spanish on DIS-35 (weak salt-message test; git
  errors swallowed as `NotAGitRepository` / empty history); one B comment on DIS-85 (log in memory).
- State after: `project/file/commit/file_commit` 0/0/0/0, `git status --porcelain fixtures` empty.
- CI on the post-review delta: PR #11 head `f74b8df`, `ci.yml` run 36762016013 — success (1m51s),
  `frontend` — success. `Tests`: 16 files, 237 passed; `simple-git-history.spec.ts` ran 18 tests on
  the Ubuntu runner, database block included (the index-injected odd paths work there too).
  Mutation: all core files 90.09 %.
