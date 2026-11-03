# Test and State Verification Report

- Date: 2026-11-03
- Change: graph-quality-measurement (DIS-79)
- Step: 7. Run Tests and Verify Data State (MANDATORY)

*Agent's text, autonomous run (`docs/AUTONOMOUS-RUN.md` §6).*

## Commands executed
- `npx vitest run --project dom --project seed-build --project node` (baseline 0.4 and after)
- `npm run typecheck`, `npm run lint` (baseline and after), `npm run lint:architecture`, `npm run docs:coverage`
- `npx vitest run tests/unit/scripts/measure-graph.spec.ts` (RED and GREEN runs, below)
- `npx vitest run tests/unit/docs tests/unit/scripts`
- `node scripts/annotation-agreement.mjs hashes`, `sha256sum seeds/graph-dump.sql`
- `npm run measure:graph`
- `node scripts/dev-processes.mjs stop`

## Test results
- Baseline (task 0.4, before any change): 182 files passed, 1863 tests passed, 281 skipped (29 files skipped), 81.5 s. `npm run typecheck` and `npm run lint` green. `scripts/measure-graph.mjs` and `docs/measurements/graph-quality.json` did not exist. `node scripts/annotation-agreement.mjs hashes` printed the nine hashes of the `## Hashes SHA-256` table (`tests/unit/docs/annotation-freeze.spec.ts` green in the baseline).
- Targeted tests (`tests/unit/scripts tests/unit/docs`): 16 files, 121 passed, 0 failed.
- Required suite after the change: 184 files passed, 1893 tests passed (1863 + 30 new), 281 skipped, 80.8 s.
- Gates: `npm run lint` and `npm run typecheck` green; `npm run lint:architecture` 0 errors (the one warning is the pre-existing orphan `packages/web/dist/assets/*.js`); `npm run docs:coverage` no warning.
- Notes: no flaky test, no retry. 26 scenario titles of `specs/graph-quality/spec.md` each appear exactly once as a test name (checked with a script over both new test files).

### RED evidence per TDD task
- 1.1: `tests/unit/scripts/measure-graph.spec.ts` with only "An unknown argument is a usage error": the run failed on the import (module `scripts/measure-graph.mjs` missing).
- 1.3: the two freeze tests were written together with the freeze step of the first implementation, so they never ran red on their own. Deviation recorded: the same behaviour was seen to fail by the broken-hash run of step 8 only through the passing path, so the evidence for 1.3 is the GREEN run and the 8.2 error cases.
- 2.1 to 2.4: after adding the tests for `checkAnnotations`, `readSeed` and the CLI seed errors, 7 of 10 tests failed (`checkAnnotations is not a function`, a CLI exit 0 where 1 was expected); implemented; 10 of 10 passed.
- 3.1 to 3.5: 15 tests failed (`measure is not a function`, `calledNames is not a function`, `formatRatio is not a function`, no output file); implemented; 25 of 25 passed.
- 5.2: the JSON freshness test was seen to fail on a changed JSON (`0.7742` edited to `0.7743`, message `docs/measurements/graph-quality.json is stale: run \`npm run measure:graph\``) and the file was regenerated.
- 5.3 and 5.4: "The README table agrees with the measurement" failed (table, agreement lines and introduction not yet written) and "The report agrees with the measurement" failed (`ENOENT` on `docs/measurements/graph-quality.md`); both passed after `readme.md` and the report were written.

## Data state verification
The change touches no database (no migration, no seed), so the indicators are the frozen hashes and the seed.
- Pre-test baseline:
  - nine frozen hashes (`node scripts/annotation-agreement.mjs hashes`): equal to the `## Hashes SHA-256` table
  - SHA-256 of `seeds/graph-dump.sql`: `771ddaf556a7ebcf41632fa7a487b44eee9a7f71371ae4f84bd1e7b9658c6d16`
  - `git status`: only `.claude/sdd-harness.env` modified (the author's switch, never staged)
- Post-test validation:
  - nine frozen hashes: unchanged; `git diff --stat origin/final-project-CRN -- fixtures/annotations docs/measurements/annotation docs/measurements/annotation-agreement.md` is empty
  - SHA-256 of `seeds/graph-dump.sql`: `771ddaf556a7ebcf41632fa7a487b44eee9a7f71371ae4f84bd1e7b9658c6d16` (same)
  - `git status`: the change's files only (plus the author's `.claude/sdd-harness.env`); the tests write only under `os.tmpdir()` copies removed in `afterEach`
- State restored: Yes
- Restoration actions: none needed; `node scripts/dev-processes.mjs stop` reported no dev process running

## Mutation testing (7.4)
`scripts/**` is outside `stryker.config.json` → `mutate`, so no mutated source changes; the CI `mutation` job is the check and is expected to skip or pass on this diff.

## Privacy and ethics check (7.5)
The change reads and writes only repository fixtures, the seed of the two sample projects and JSON/Markdown reports: no personal data, no authentication or session code, no logging or telemetry, no upload and no external service (no network, no model call, no new dependency). The seed and the annotation files contain only code of the sample repositories built on purpose. Result: nothing to report.

## UI evidence (if applicable)
- (none: the change has no browser UI)

## Outcome
- Status: PASS
- Blocking issues: none
