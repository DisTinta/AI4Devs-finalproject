# Test and State Verification Report

- Date: 2026-10-28
- Change: callsite-annotations
- Step: 8 Run Tests and Verify Data State (agent's text, `apply-finish`)

## Commands executed
- `node scripts/annotation-agreement.mjs merge` (twice; the second run left the SHA-256 of both annotation files unchanged)
- `npx vitest run tests/unit/docs/annotation-freeze.spec.ts` (red before the report existed: 5 failed; green after: 5 passed)
- `npx vitest run tests/unit/scripts/annotation-agreement.spec.ts tests/unit/docs`
- `npx vitest run`
- `npm run lint`
- `npm run typecheck`
- `npm run lint:architecture`
- `npm run docs:coverage`
- `git diff --stat origin/final-project-CRN -- packages fixtures/acme-shop fixtures/task-api`
- `git diff origin/final-project-CRN -- fixtures/README.md`
- `git ls-files --eol docs/measurements/annotation fixtures/annotations docs/measurements/annotation-agreement.md`
- `git ls-tree 80a1d9c scripts/` (freeze commit)
- `node scripts/annotation-agreement.mjs hashes`
- `node scripts/dev-processes.mjs stop`

## Test results
- Targeted tests (8.1): 5 files, 35 passed, 0 failed, 0 skipped (28 scenario tests of the change: 19 + 4 + 5)
- Required suite (8.2): 186 files passed, 20 skipped; 1876 tests passed, 0 failed, 225 skipped (the skipped ones need `DATABASE_URL`)
- Lint, typecheck, `lint:architecture` (no dependency violations) and `docs:coverage`: clean
- Runtime: about 370 s for the full suite
- Notes: no existing test was changed (7.1: `demo-excerpt.spec.ts` and `guides.spec.ts` pass unchanged). The base branch moved during the ticket (`origin/final-project-CRN`, PR #77 of DIS-32) and was merged before the freeze; it changes `fixtures/README.md` outside the Table 2 section and no Table 2 row.

## Data state verification
- Pre-test baseline (task 0.4): `git diff --stat` of `packages`, `fixtures/acme-shop` and `fixtures/task-api` empty; 18 files, 112 tests in `tests/unit/scripts` and `tests/unit/docs`.
- Post-test validation:
  - `git diff --stat origin/final-project-CRN -- packages fixtures/acme-shop fixtures/task-api`: empty.
  - `git diff origin/final-project-CRN -- fixtures/README.md` touches only the § "Table 2 seed" title, its intro sentences and the two batch headings (design D12); the 22 rows are unchanged.
  - `git ls-files --eol`: `i/lf w/lf` for every hashed file and for the report; no hashed file starts with a BOM.
  - `node scripts/annotation-agreement.mjs hashes` equals the table `## Hashes SHA-256` of the report (nine rows, all matched).
  - Freeze before measuring: `git ls-tree 80a1d9c scripts/` lists no `measure-graph.mjs` (freeze commit `80a1d9c`).
  - Privacy and ethics (8.4): no dependency added (no `npm install`, no `npm audit`); the diff holds no personal data, no network access and no model call from code.
  - ADR not warranted (design P8).
- State restored: Yes
- Restoration actions: none; `node scripts/dev-processes.mjs stop` reported no repository process running.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
