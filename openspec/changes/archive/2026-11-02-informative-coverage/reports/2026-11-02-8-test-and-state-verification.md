# Test and state verification (step 8) — informative-coverage (DIS-77)

*Agent's text, autonomous run, 2026-11-02. Windows 11, Node v24.11.1, Vitest 4.1.12.*

## Baseline (task 0.4) and after

| Measure | Before | After |
|---|---|---|
| `npx vitest run --project dom --project seed-build --project node` | 179 files passed (29 skipped), 1852 tests passed (281 skipped), 71.7 s | 182 files passed (29 skipped), 1863 tests passed (281 skipped), 70.3 s |
| `npm run test:coverage` (same projects) | fails: `MISSING DEPENDENCY Cannot find dependency '@vitest/coverage-v8'` | 178 files, 1842 tests passed, 76.8 s (exit 0) |
| Local cost of V8 coverage | n/a | about 6.5 s over the plain run (+9 %), with four timed files fewer |
| `npm run typecheck`, `npm run lint` | green | green |
| `npm run lint:architecture` | n/a | 0 errors; one pre-existing `no-orphans` warning on an ignored build output (`packages/web/dist/...`) |
| `npm run docs:coverage` | n/a | green |
| `coverage/` | absent | written by `--coverage`, ignored by git (`.gitignore` line `coverage/`), not staged |

Totals printed by `text-summary`: statements 93.41 % (5778/6185), branches 90.88 % (3430/3774),
functions 89.89 % (1352/1504), lines 94.25 % (4852/5148). `adapters/store-postgres` reads 44.2 % of lines
because the integration specs are skipped without `DATABASE_URL` locally; CI has the database.

The change touches no database: the data indicator is `git status` showing only the change's files.

## Targeted tests (8.2)

`npx vitest run tests/unit/ci tests/unit/scripts tests/unit/docs`: 19 files, 101 tests passed.

## Changed existing test

`tests/unit/scripts/wiring.spec.ts` → "The guide's scripts load .env and the quality scripts do not": `test:coverage`
added to `QUALITY` (extended, not weakened; delta of `local-startup`, design P5). No other existing test file
changed (`git diff --stat`).

## RED evidence of task 5.1 ("The mutation gate stays hard")

It passes against the current gate. With `thresholds.break` set to 60 in a local edit of `stryker.config.json`
it failed (`expected 60 to be greater than or equal to 70`); with `continue-on-error: true` added to the
`mutation` job of `ci.yml` it failed (`expected {...} to not have property "continue-on-error"`). Both files
were restored; `git diff --stat stryker.config.json` is empty and `ci.yml` holds only this change's edits.

## Exclusion of the wall-clock specs (task 2.4)

The CLI `--exclude` did not drop the four `*.linear.spec.ts` / `*.scaling.spec.ts` files (the first coverage
run listed 180 files). Fixed in `vitest.config.ts` (design D7, A9): with `--coverage` in `process.argv` the
globs are added to the root and `node` project lists. The run now lists 176 files before the new specs
(179 baseline - 4 + new specs) and none of the four.

## Mutation (8.4)

No source of `stryker.config.json`'s `mutate` changed. The `package-lock.json` and `vitest.config.ts` changes
change the incremental cache key, so the CI `mutation` job runs a full pass (design P4); `npx stryker run` is
left to that job, whose log must show no Vitest coverage run (design D2).

## Dependency (tasks 1.1, 1.2)

`npm view @vitest/coverage-v8@4.1.12`: exists, published 2026-10-15 (18 days before 2026-11-02, more than two
weeks). Installed with `--save-dev --save-exact`; `package.json` has `"@vitest/coverage-v8": "4.1.12"`,
`vitest` still 4.1.12, `package-lock.json` +195 lines (14 packages added). `npm audit --audit-level=high`:
18 moderate before and after, 0 high, 0 critical.

## Privacy and ethics check (8.5)

No personal data, no external service and no network call: the report stays on the runner and in the job
summary; the script reads one local JSON file and writes to standard output. No secret or `.env` is read
(`scripts/coverage-summary.mjs` imports only `node:` modules). The new dependency is justified in design D1
and audited above. Result: nothing to remediate.

## Post-test state (8.6)

`coverage/` ignored and not staged; no `.stryker-tmp/`; `node scripts/dev-processes.mjs stop` run at the end.
