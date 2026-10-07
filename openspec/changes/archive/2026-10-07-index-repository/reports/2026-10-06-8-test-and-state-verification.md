# Test and State Verification Report

- Date: 2026-10-06
- Change: index-repository (DIS-85)
- Step: 8. Backend: Run Tests and Verify Data State

## Commands executed

- `docker compose up -d` (Postgres `pgvector/pgvector:pg16`), `npm run db:migrate` (`No migrations to run!`)
- `export DATABASE_URL=postgres://codemind:codemind@localhost:5432/codemind` (compose defaults)
- `git status --porcelain fixtures`, `git ls-files -s fixtures | sha1sum`
- `docker compose exec -T postgres psql -U codemind -d codemind -tAc "select count(*) from project|commit|file"`
- `npx vitest run tests/unit/index tests/integration/index tests/integration/git` (twice)
- `npx vitest run`
- `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`
- `env -u DATABASE_URL npx vitest run --exclude 'tests/integration/**'` (the CI frontend job's shape)
- `npx stryker run --mutate "packages/core/src/index/**/*.ts"` (three runs, see below)

## Test results

- Baseline (task 0.4, before any change): 35 files, 520 tests passed, 71.62 s.
- Targeted tests (8.2), two runs: 10 files, 113 tests passed each time (51.16 s, 51.16 s). No flakiness.
- Required suite (8.3, final code at `ce50dae`): 39 files, **556 passed**, 0 failed, 0 skipped, 63.04 s.
- Without `DATABASE_URL`, integration excluded: 26 files, 368 passed.
- `npm run lint`: 0 errors, 1 warning (pre-existing: empty interface in `packages/core/src/ports/LlmPort.ts`).
- `npm run typecheck`: exit 0. `npm run docs:coverage`: exit 0, no warning.
- `npm run lint:architecture`: 0 errors, 4 warnings (pre-existing `no-orphans` on stub packages; same
  count as before the change). `core-no-infra` and `core-no-transport` green.
- Notes: `acme-shop.spec.ts` raises the per-test timeout to 60 s; one indexing takes about 6 s (one
  `git cat-file` per blob, design Risks).

## Spec coverage (task 7.2)

22 scenarios in `specs/repository-indexing/spec.md`; each title matches exactly one `it('<title>'` in
`tests/` (grep output in `tasks.md` 7.2).

## Forced failures

### 4.8b — RED of "The analyzer only receives redacted content"

The behaviour already existed, so RED was shown with mutation (2) applied
(`deps.analyzer.analyze({ files: indexable.files })`):

```
FAIL  index repository > The analyzer only receives redacted content
AssertionError: expected '<?php return [\'key\' => \'<synthetic key, masked>…' to contain '[REDACTED: possible secret]'
Tests  1 failed | 18 passed (19)
```

Failing assertion: `expect(received?.content).toContain(REDACTION_MARKER)`. Restored with `cmp`; 19/19 green.

### 4.10 — key tests can fail (re-run after 4.8b)

Each anchor matched once; each file was restored and checked with `cmp`.

| Mutation in `index-repository.ts` | Test that fails | Result |
| -- | -- | -- |
| (1) real-path `confinePath(realRepo, realRoot)` removed | A symbolic link escaping the allowed root is rejected before reading | 1 failed, 18 passed |
| (2) analyzer given `indexable.files` (unredacted) | The analyzer only receives redacted content | 1 failed, 18 passed |
| (3) `createProject` before `assertValidGraph` | An invalid graph creates no project | 1 failed, 18 passed |

19/19 green after restore. Mutation (2) does **not** fail the acme-shop integration scenarios (the
planted key yields no symbol): that is why the unit scenario of 4.8b exists (design Risks).

## Mutation testing (Stryker, `packages/core/src/index/**/*.ts`)

| Run | Code | Score | Killed | Timeout | Survived | No cov |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | `78dfe4c` | 94.48 % | 509 | 22 | 31 | 0 |
| 2 | extra cases, `isValidPath` simplified | 95.66 % | 507 | 22 | 24 | 0 |
| 3 (final, `ce50dae`) | `compareBytes` over code point arrays | **96.48 %** | 499 | 22 | 19 | 0 |

Final per file: `framework-detect.ts` 96.23 %, `index-repository.ts` 98.88 %, `source-path.ts`
100 %, `path-policy.ts` 94.44 %, `secret-scanner.ts` 95.57 % (the last two unchanged by this change).
Threshold `MIN_MUTATION_SCORE=70`: passed.

Survivors in the new code, all equivalent:

- `framework-detect.ts:46` `catch { return undefined; }` → `catch {}`: both return `undefined`.
- `framework-detect.ts:52` `typeof value === 'object'` → `true`: a primitive then reaches
  `Object.hasOwn(primitive, 'laravel/framework' | 'fastify')`, which is `false`, same result.
- `index-repository.ts:167` `update(content, 'utf8')` → `update(content, "")`: the default encoding is UTF-8.

Killed after run 1 (meaningful): edge counts by resolution (the 1/1 case was symmetric), a root
`realPath` failure that is not `NotAGitRepository` propagates, a file the analyzer returns without
input is kept as is, byte order for a path and its extension and around U+FFFF. Three survivors of
`isValidPath` showed redundant checks (empty path, leading `/`), removed with no behaviour change.

## Layer guard (task 3.2b)

```
$ source .claude/sdd-harness.env; grep -qE "$GUARD_HTTP_IN_BUSINESS" <file|line>
no match (expected): packages/core/src/knowledge/project.ts
no match (expected): packages/core/src/index/framework-detect.ts
MATCH (expected): import Fastify from 'fastify'
MATCH (expected): import type { FastifyRequest } from 'fastify'
MATCH (expected): const c = require('@fastify/cors')
MATCH (expected): await import('fastify')
MATCH (expected): import http from 'node:http'
no file in packages/core/src matches
```

Same results with the hooks' own loader (`load_env_safe` keeps `\"` literally, adding only `\` to the
bracket). Commit `b04675d`.

## Privacy and ethics check (task 6.1)

PASS WITH GAPS, three Low:

| Severity | Finding | Destination |
| -- | -- | -- |
| Low | `EmptyRepository` / `NotAGitRepository` messages carry the absolute repository path (may hold an OS user name once a transport logs it). `ForbiddenPathError` from the real-path check names only the requested path. | B → DIS-86 (with the existing `ForbiddenPathError` follow-up) |
| Low | Commit messages are redacted by the four secret rules only; other free text is stored as written. | D, DIS-35 non-goal |
| Low | Synthetic identity `test.author@example.test` in `git-source-tree.spec.ts`. | D, same precedent as `simple-git-history.spec.ts` |

No real PII, no secret-shaped literal (synthetic keys built by concatenation), no logging in core or
the adapter, no dependency or lockfile change.

## Data state verification

- Pre-test baseline (8.1):
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
  - `project` / `commit` / `file` rows: 0 / 0 / 0
- Post-test validation (8.4):
  - `git status --porcelain fixtures`: empty
  - `git ls-files -s fixtures | sha1sum`: `b97101fedecb07b21ca67c6156224d81bc13a3e8`
  - `project` / `commit` / `file` rows: 0 / 0 / 0 (every DB test runs on the harness transaction)
- State restored: Yes (nothing to restore). Restoration actions: none.

## End-to-end testing (task 10.1)

Not applicable: no route, CLI command or web change (the CLI command is DIS-86).

## CI evidence (task 10.2)

PR #23 (https://github.com/DisTinta/AI4Devs-finalproject/pull/23), head `2e036b8`:

- `quality` run 37508118785 (https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/37508118785),
  5 m 39 s, **pass**. Postgres service `pgvector/pgvector:pg16`, `DATABASE_URL` set,
  `db:migrate` → `db:rollback` → `db:migrate`. Vitest: 39 files, 555 passed, 1 skipped (the
  Windows-only `path-policy` case). The four new spec files ran and passed:
  - `tests/unit/index/index-repository.spec.ts` (21 tests)
  - `tests/integration/git/git-source-tree.spec.ts` (9 tests, real Git)
  - `tests/unit/index/framework-detect.spec.ts` (3 tests)
  - `tests/integration/index/acme-shop.spec.ts` (2 tests, Postgres + Git, 2.8 s)

  Stryker over all of `packages/core/src`: 96.00 % (974 killed, 34 timeout, 41 survived).
- `frontend` run 37508118844, **pass** in 5 s: no change under `packages/web`, nothing to run.

## UI evidence

- (none: the change has no browser UI)

## Outcome

- Status: PASS
- Blocking issues: none
