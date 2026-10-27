# Test and State Verification Report

- Date: 2026-10-27
- Change: ts-analyzer-structure
- Step: 6 Run Tests and Verify Data State

## Commands executed

- `npx vitest run` (baseline before any code, and again at the end)
- `npm install` after adding `typescript` to `packages/analyzers/typescript/package.json`, then `npm audit --audit-level=high`
- `npx vitest run tests/unit/analyzers/typescript`, `npx vitest run tests/unit/analyzers tests/unit/knowledge`
- `npm run typecheck`, `npm run lint`, `npm run lint:architecture`, `npm run docs:coverage`
- `git diff --stat final-project-CRN -- packages/core`, `git status --short fixtures/`
- `npm run verify`
- `node scripts/dev-processes.mjs stop`

## Test results

- Baseline (0.4, `final-project-CRN` state): 178 files passed, 20 skipped; 1777 tests passed, 221 skipped
  (`DATABASE_URL` is not set, so the PostgreSQL integration tests are skipped); `git diff --stat
  final-project-CRN -- packages/core` empty; `npm run lint:architecture`: 0 errors, 3 warnings (the two
  `no-orphans` of the TypeScript stub and one of `web/dist`)
- Targeted: `tests/unit/analyzers/typescript` 3 files, 33 tests passed (the 33 new scenarios);
  `tests/unit/analyzers` and `tests/unit/knowledge` 27 files, 361 tests passed, no existing test changed
- Required suite: `npx vitest run` 181 files passed, 20 skipped; 1810 tests passed (+33), 221 skipped; 0 failed
- Runtime: 387 s
- `npm run lint`, `npm run typecheck`, `npm run docs:coverage`: green. `npm run lint:architecture`: 0 errors,
  1 warning (`web/dist`; the two `no-orphans` warnings of the TypeScript stub are gone)
- `npm run verify`: acme-shop 3/3 golden answers match; the seed and answer fingerprints do not include the new package
- Notes: no flaky test, no retry

## Dependency (1.1)

- `typescript` `^5.5.0` moved into `dependencies` of `packages/analyzers/typescript` (it was already a root devDependency)
- `npm audit --audit-level=high`: `found 0 vulnerabilities`, before and after the install, so no new high or critical finding

## Privacy and ethics (6.5)

The diff touches no personal data, session, log, telemetry or upload, and the analyzer does no I/O
(an in-memory compiler host). The new dependency is `typescript` (Microsoft, Apache-2.0), already a root
devDependency. Fixtures are read-only and carry no real emails or secrets. Nothing to record.

## ADR (9.4)

Not warranted (design D10, decision A6): the decisions are local to one adapter package and reversible.

## Data state verification

- Pre-test baseline:
  - `git diff --stat final-project-CRN -- packages/core`: empty
  - `git status --short fixtures/`: empty
- Post-test validation:
  - `git diff --stat final-project-CRN -- packages/core`: empty
  - `git status --short fixtures/`: empty
- State restored: Yes (nothing to restore; no database, the fixture is read-only)
- Restoration actions: none

## Outcome

- Status: PASS
- Blocking issues: none
