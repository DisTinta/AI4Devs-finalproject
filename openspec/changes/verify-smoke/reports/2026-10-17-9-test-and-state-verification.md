# Test and State Verification Report

- Date: 2026-10-17
- Change: verify-smoke
- Step: 9 — Backend: Run Tests and Verify Data State (with the baseline of task 0.4, the real run of
  step 8, the privacy check and the ADR of task 12.2)

All database commands used the local Compose Postgres with
`DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind`. Paths under the session
scratchpad are shown as `<scratchpad>`.

## Commands executed
- Task 0.2: `git fetch`; `origin/feature/entrega-2-CRN` had moved (PR #49 and #50 of DIS-34, which
  regenerated golden Q3 and Q4), so the unpublished branch was rebased onto it before any code
  (`git rebase --autostash`; the local `.claude/` edits stayed unstaged).
- Task 0.4: `npx vitest run` (baseline); the indicator queries below; the fingerprint script
  (`npx tsx --tsconfig packages/cli/tsconfig.run.json <scratchpad>/fp.mts <root>`, importing
  `collectFingerprintInputs` + `fingerprint` and `answerFingerprint` from their sources) on the
  working tree and on `git worktree add <scratchpad>/clean HEAD` (removed afterwards with
  `git worktree remove`); `docker compose exec -T postgres pg_dump -U codemind -Fc codemind >
  <scratchpad>/pre-dis44.dump`.
- Step 8: `npm run db:migrate`, `npm run db:seed`, `time npm run verify`.
- 9.2: `npx vitest run tests/unit/cache tests/unit/cli tests/unit/ci tests/integration/cli`.
- 9.3: `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`,
  `npm run docs:coverage`.
- 9.4: `npx stryker run --mutate "packages/cli/src/verify.ts,packages/cli/src/cache/compare-golden.ts,packages/cli/src/cache/seed-header.ts" --incrementalFile <scratchpad>/stryker-dis44.json --reporters clear-text`
  (the targeted run: same config and break threshold 80 as `npm run test:mutation`, with its own
  incremental file so the local report is not touched; the CI mutation job runs the whole set).
- 9.5: `/privacy-ethics-check` over `git diff origin/feature/entrega-2-CRN`.

## Test results
- Baseline (task 0.4), before any code: 131 files, 1554 passed, 1 failed of 1555 in 142 s. The
  failure rotated between runs (first `seed-load.spec.ts` "A failed golden save leaves the database
  unchanged", then `projects-command.spec.ts` "An empty database lists no projects"); both files pass
  alone. They are pre-existing parallel-commit flakes of the shared local database, not touched by
  this change.
- Targeted tests (9.2): 28 files, 316 passed, 0 failed; after the tests of the mutation pass,
  29 files, 322 passed, 0 failed (143 s). `npm run lint` and `npm run typecheck` green again.
- Required suite (9.3), final run: 135 files, 1586 passed, 3 failed of 1589. The three failures are
  `tests/integration/git/git-source-tree.spec.ts` (two "extra cases" that cut `cat-file` mid-batch)
  and `tests/integration/git/simple-git-history.spec.ts` ("rejects with git's error, never a partial
  history, when git fails part-way"): each one's arrange step runs `git add .` on a temporary
  repository holding `b.php` = `<?php // b` + LF, and this Windows machine refuses to open that file
  (`error: open("b.php"): Invalid argument`). Reproduced outside the tests in a fresh temporary
  directory: a file with exactly that content cannot be added, a file with `<?php // c` can. They
  passed in the baseline earlier the same day, the files and the code they test are untouched by this
  change, so they are environmental; the CI `quality` job (Linux) is the check (task 14.3). The
  earlier full run of 9.3 also showed the `projects-command.spec.ts` parallel-commit flake of the
  baseline.
- New tests: `tests/unit/cache/compare-golden.spec.ts` (7), `tests/unit/cache/seed-header.spec.ts`
  (4, from the mutation pass), `tests/unit/cli/verify.spec.ts` (21), `tests/unit/ci/verify-job.spec.ts`
  (1), `tests/integration/cli/verify.spec.ts` (7). No existing test changed (task 6.2):
  `git diff origin/feature/entrega-2-CRN --stat -- tests/` lists only the five new files. Each `#### Scenario:` of the delta spec maps to exactly one test of the same name,
  except "The verify job is green on the pull request" (a recorded check, task 14.3).
- `npm run lint`, `npm run typecheck`, `npm run docs:coverage`: exit 0. `npm run lint:architecture`:
  exit 0, 0 errors, 3 pre-existing `no-orphans` warnings (`packages/web/src/data/sample-projects.ts`,
  `packages/analyzers/typescript/src/index.ts` and its `dist/`), none from this change.
- Mutation (9.4): see "Mutation" below.
- Runtime: full suite about 150 s; targeted tests about 60 s.
- TDD note: the triad ran in this step's own agent (no subagent tool here). `compare-golden.ts`
  (2.2) and `verify.ts` (3.2) were written whole from design C2–C7, so the tests of 2.3, 3.3, 4.1–4.3
  and the integration scenarios passed when added; the first test of each file was seen red (module
  missing), and the integration scenario "Every golden answer matches" was seen red by breaking
  `useCache` on purpose and restoring it.

## Fingerprints (task 0.4, amendment A13)

| Value | Working tree | Clean worktree of `HEAD` |
|---|---|---|
| Analyzer, computed / seed header | `sha256:c133c15b…` / `sha256:c133c15b…` | identical |
| Contract, computed / seed header | `sha256:e94eef96…` / `sha256:e94eef96…` | identical |
| Answer, computed / golden file | `sha256:63e21cff…` / `sha256:63e21cff…` | identical |
| Golden `seed.*` | the seed header's pair | identical |

`diff` of the two outputs: identical. No file touched by this change is a fingerprint input.

## Real run (step 8)

On the migrated local database, after `npm run db:seed` and with no `LLM_*` exported:

```
✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
```

Exit `0`; `real 0m2.967s` (under the ticket's 5 s).

## Mutation

Targeted run over the three new files, first pass: **91.30 %** (315 killed, 20 survived, 10 without
coverage; `compare-golden.ts` 100.00, `seed-header.ts` 85.19, `verify.ts` 90.06). Meaningful
survivors and their RED → GREEN tests (each test is red under its mutant, green on the code):

| Survivor | Test added |
|---|---|
| `headerFingerprints`: `break` at the first non-comment line removed, or `startsWith('')` | `tests/unit/cache/seed-header.spec.ts` "stops at the first line that is not a comment" |
| `headerFingerprints`: `||` → `&&`, or either `=== undefined` → `false` | same file, "is undefined when either fingerprint is missing from the header" |
| `currentSeedFingerprints` without coverage (every test injects the seam, A4) | same file, "is the pair the seed build computes from the repository" |
| `verify.ts` default `seedPath` / `cacheDir` (`'seeds'`, `'graph-dump.sql'`, `'cache'`, `??` → `&&`) | `tests/unit/cli/verify.spec.ts` "reads the seed and the golden files under repoRoot when no path is given" |
| `verify.ts` default `listProjects` and `createPostgresStore({ transaction: client })` → `({})` | same file, "lists the projects and gives explain a store on the transaction's client" (a client double that records every statement) |

Second pass: **97.39 %** (331 killed, 5 timeout, 7 survived, 2 without coverage; `compare-golden.ts`
100.00, `seed-header.ts` 95.06, `verify.ts` 97.24), above the break threshold 80. The ones left are
not meaningful: `header` starting with a junk entry and the two bounds of the `literals` loop are
equivalent (the junk line never starts with `-- <name>: `; the sticky pattern cannot match an empty
remainder); an unquoted value other than `NULL` in `indexedCommitOf` (`renderSeedDump` always quotes
`name` and `indexed_commit`); and the process entry guard and `DEFAULT_REPO_ROOT`, the process shell
that the real run of step 8, the manual runs of step 10 and the CI `verify` job execute. The whole
mutation set runs in the CI `mutation` job (task 14.3).

## Privacy and ethics check (9.5)

### Verdict
PASS

### Findings
| Severity | Area | Finding | Evidence | Required action |
|---|---|---|---|---|
| Low | Delivery | Synthetic credentials only: the CI service password `postgres` (an ephemeral service container, as `quality`'s), and `k3y` / `s3cret` in tests that assert they never reach an output | `.github/workflows/ci.yml` job `verify`; `tests/integration/cli/verify.spec.ts` | none |
| Low | Dependencies | `yaml` added as a root devDependency; it is the official npm package already resolved in the lock file at 2.9.1 (through `@fastify/swagger`), and only the root `devDependencies` entry of `package-lock.json` changed | `package.json`, `package-lock.json` | none |

No personal data, no new logging of payloads: stdout and stderr hold only project names, golden
ids, questions and structural values, each terminal-safe; the database URL, credentials, absolute
paths and answer, statement or excerpt text never reach an output (unit and integration tests assert
it, and step 10 checked `s3cret`). The run never commits (always rolled back). No model is called
(`createEvaluationLlm`), so no repository content leaves the machine.

### Allowed to proceed?
Yes.

### Not assessed
The CI run itself (task 14.3).

## ADR (task 12.2, design C12, amendment A9)

[`docs/adr/20261017-stale-fingerprint-fails-verify.md`](../../../../docs/adr/20261017-stale-fingerprint-fails-verify.md):
a stale seed or golden fingerprint fails `verify`, locally and in CI, and the author regenerates
`seed:build` then `cache:build` locally. Its why is the agent's (decision D2, marked as such);
linked from `docs/project-context.md` → Gotchas and indexed in `docs/adr/README.md`.

## Data state verification
- Pre-test baseline (task 0.4 / 9.1):
  - `project`: 1 (acme-shop, sample, indexed commit `4f028db4…`)
  - `claim`: 0
  - `query_log`: 0 (`max(created_at)` null)
  - `cache_entry`: 3, `sum(hit_count)` 0
- Post-test validation (9.6), after the suites and both Stryker passes: the same four values
  (`project` 1, `claim` 0, `query_log` 0, `cache_entry` 3 with `hit_count` sum 0); no
  `.stryker-tmp/` left in the repository; no temporary seed or golden copy left
  (the tests use `mkdtempSync` directories removed in `afterEach`/`afterAll`).
- State restored: Yes (see the addendum).
- Restoration actions: none needed for the suites (every integration write is inside a harness
  transaction); the manual steps restore from the 0.4 dump (step 10.7).

## UI evidence (if applicable)
- None. Task 11.1: the change has no browser UI (`packages/web` is untouched), so end-to-end testing
  is not applicable beyond step 10.
- Task 11.2: the CI evidence (the `verify` job green with its three `✓` lines and
  `acme-shop: 3/3 golden answers match`, the new spec files run by `quality`, the mutation job
  ≥ 80) is collected in task 14.3, once the pull request exists, as an addendum to this report.

## Outcome
- Status: PASS
- Blocking issues: none. The three environmental git failures above are left for the CI run to
  confirm.

## Addendum — after the restore of step 10.7

| Indicator | 0.4 | After 10.7 |
|---|---|---|
| `project` rows | 1 | 1 |
| `claim` rows | 0 | 0 |
| `query_log` rows | 0 | 0 |
| `cache_entry` rows, `sum(hit_count)` | 3, 0 | 3, 0 |
| `codemind` sessions in `pg_stat_activity` | — | 0 |

Details in `2026-10-17-10-manual-interface-testing.md`.
