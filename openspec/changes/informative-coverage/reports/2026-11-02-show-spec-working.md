# Show spec working — informative-coverage (DIS-77)

*Agent's text, autonomous run, review step, 2026-11-02. Windows 11, Node v24.11.1, PowerShell 7.6.9
(`pwsh`) and Windows PowerShell 5.1.26100.9818 (`powershell.exe`). PR #100, head `3d4655a`; CI run
<https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41523599968>. Paths relative to the
repository.*

The interfaces of this change are the npm script `test:coverage`, the command
`node scripts/coverage-summary.mjs`, and the `quality` / `mutation` jobs of `ci.yml`. No screen and no
database row is touched. Each was exercised again in this step (not only reused from the step 9 report).

## Demonstrated

| Scenario | Interaction | Result | Matches spec | Evidence |
|---|---|---|---|---|
| Coverage is off by default and has no thresholds | `npm run test:coverage -- --project dom --project seed-build --project node` (Bash) | exit 0, 178 files / 1842 tests passed, 75.9 s; `coverage/coverage-summary.json` written; none of the four `*.linear.spec.ts` / `*.scaling.spec.ts` in the run | yes | L1 |
| The summary has one row per package | `node scripts/coverage-summary.mjs coverage/coverage-summary.json` on the real report | heading, sentence, 9 package rows sorted by name, `Total`; exit 0 | yes | L2 |
| Coverage targets are marked, never enforced | same output | `core` `✓ 80 %`, `analyzers/*` `✓ 70 %`, others and `Total` `—`; exit 0 | yes | L2 (the ✗ case is proven by the unit test with fixed figures) |
| A missing coverage report is reported, not failed | `node scripts/coverage-summary.mjs coverage/none.json` (Bash and `powershell.exe`) | `Sin informe de cobertura: coverage/none.json no existe.`, exit 0 | yes | L3, L5 |
| An unreadable coverage report is reported, not failed | `node scripts/coverage-summary.mjs coverage` (a directory: `EISDIR`) | `Informe de cobertura ilegible: coverage.`, exit 0 | yes | L3 |
| The CI publishes coverage without blocking | CI run 41523599968, job `quality` | `Tests` ran `npx vitest run --coverage --exclude …` (238 files passed, V8 text-summary printed), `Coverage summary (informative)` ran and succeeded, `Timing budgets` ran exactly the four timed specs (4 files passed) | yes | C1 |
| The mutation gate stays hard | CI run 41523599968, job `mutation` | full pass (no incremental cache, as design P4 expected), `perTest` coverage analysis of Stryker only, no Vitest V8 summary in the log, `Final mutation score of 94.34 is greater than or equal to break threshold 80` | yes | C2 |
| The testing guide documents the pyramid and the coverage policy | `find` recount of each level | 152 + 12 = 164, 43, 31, 4, 4: the figures in `docs/TESTING.md` | yes | L4 |
| The guide's scripts load .env and the quality scripts do not | `npx vitest run tests/unit/ci tests/unit/scripts tests/unit/docs` | 19 files, 101 tests passed | yes | L6 |

## Evidence

**L1** — `npm run test:coverage -- --project dom --project seed-build --project node`, exit 0:

```
> vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts" --project dom --project seed-build --project node
 Test Files  178 passed | 29 skipped (207)
      Tests  1842 passed | 281 skipped (2175)
   Duration  75.86s
=============================== Coverage summary ===============================
Statements   : 93.41% ( 5778/6185 )
Branches     : 90.88% ( 3430/3774 )
Functions    : 89.89% ( 1352/1504 )
Lines        : 94.25% ( 4852/5148 )
```

The only line of the log naming `linear.spec` / `scaling.spec` is the command echo itself.

**L2** — `node scripts/coverage-summary.mjs coverage/coverage-summary.json`, exit 0:

```
## Cobertura por paquete (informativa)

La cobertura no bloquea el pipeline: la puerta es la puntuación de mutación (stryker.config.json).

| Paquete | Líneas | Sentencias | Funciones | Ramas | Objetivo (líneas) |
|---|---:|---:|---:|---:|---|
| adapters/git | 97.3 % | 96.6 % | 96.6 % | 94.9 % | — |
| adapters/llm | 99.3 % | 98.8 % | 97.3 % | 96.5 % | — |
| adapters/store-postgres | 44.2 % | 40.3 % | 28.0 % | 16.1 % | — |
| analyzers/php | 100.0 % | 96.8 % | 100.0 % | 91.6 % | ✓ 70 % |
| analyzers/typescript | 98.2 % | 97.3 % | 94.4 % | 92.9 % | ✓ 70 % |
| api | 92.8 % | 93.2 % | 93.8 % | 96.3 % | — |
| cli | 95.6 % | 95.1 % | 91.6 % | 92.9 % | — |
| core | 99.8 % | 99.7 % | 100.0 % | 98.4 % | ✓ 80 % |
| web | 98.1 % | 98.2 % | 99.4 % | 97.0 % | — |
| Total | 94.3 % | 93.4 % | 89.9 % | 90.9 % | — |
```

`adapters/store-postgres` is low locally because the integration specs skip without `DATABASE_URL`; CI has
the database (its totals: lines 98.34 %, C1).

**L3** — error cases, Bash:

```
$ node scripts/coverage-summary.mjs coverage/none.json
Sin informe de cobertura: coverage/none.json no existe.
exit=0
$ node scripts/coverage-summary.mjs coverage
Informe de cobertura ilegible: coverage.
exit=0
```

**L4** — `find <dir> -path '*/node_modules' -prune -o -type f \( -name '*.spec.ts' -o -name '*.spec.tsx' -o -name '*.test.ts' -o -name '*.test.tsx' \) -print | wc -l`:
`tests/unit` 152, `packages` 12, `tests/integration` 43, `tests/harness` 31, `tests/a11y` 4, `tests/e2e` 4.

**L5** — PowerShell (no `$env:` variable set):

```
pwsh -NoProfile -Command 'node scripts/coverage-summary.mjs coverage/coverage-summary.json | Out-Null; "exit=$LASTEXITCODE"'
exit=0            (PowerShell 7.6.9)
powershell.exe -NoProfile -Command 'node scripts/coverage-summary.mjs coverage/none.json; "exit=$LASTEXITCODE"'
Sin informe de cobertura: coverage/none.json no existe.
exit=0            (PowerShell 5.1.26100.9818)
```

**L6** — targeted suites: 19 files, 101 tests passed (after the review fix of the adversarial review,
finding R1, the same 101 pass; the guard spec also passes under `--coverage` and under
`--coverage --pool threads`).

**C1** — CI job `quality` (run 41523599968, job 125545711173), steps and times (UTC):

```
Tests                            20:57:28 → 21:02:09  success  (npx vitest run --coverage --exclude "**/*.linear.spec.ts" --exclude "**/*.scaling.spec.ts")
  Test Files  238 passed (238)
  Statements 97.67% (6041/6185) · Branches 94.72% (3575/3774) · Functions 97.8% (1471/1504) · Lines 98.34% (5063/5148)
Coverage summary (informative)   21:02:09 → 21:02:09  success  (node scripts/coverage-summary.mjs coverage/coverage-summary.json >> "$GITHUB_STEP_SUMMARY")
Timing budgets                   21:02:09 → 21:02:14  success  Test Files 4 passed (4): the two sanitize and the two secret-scanner timed specs
job quality                      20:55:41 → 21:06:45  (11 min 04 s, under the 13-minute mark of design D3: `timeout-minutes` stays 15)
```

No line of the `Tests` step names a `*.linear.spec.ts` or `*.scaling.spec.ts`. The per-package table itself
is in the run's *Summary* tab; the GitHub API does not return step summaries, so the log shows the step and
its success, not the table text.

**C2** — CI job `mutation` (job 125545711083), 51 min 54 s:

```
No incremental result file found at reports/stryker-incremental.json, a full mutation testing run will be performed.
Starting initial test run (vitest test runner with "perTest" coverage analysis).
Initial test run succeeded. Ran 1500 tests in 58 seconds
All files | 94.34 | 95.40 | 7166 | 65 | 349 | 85 | 0 |
Final mutation score of 94.34 is greater than or equal to break threshold 80
```

The log holds no Vitest `Coverage summary` block (`grep -c` = 0): Stryker did not enable V8 coverage
(design D2).

## State

- Before: `git status` clean apart from `.claude/sdd-harness.env` (not ours); `coverage/` present from the
  earlier run and ignored (`.gitignore:32`).
- After: `coverage/` rewritten and still ignored, not staged; no `.stryker-tmp/`; no database touched.
- Restored: yes; `node scripts/dev-processes.mjs stop` run at the end of the step.

## Not demonstrated

- A red `Tests` step publishing the summary anyway (`!cancelled()` + `reportOnFailure`): not provoked in
  CI, since it would need a deliberately failing commit on the PR. It is covered by the YAML guard test
  ("The CI publishes coverage without blocking") and by `reportOnFailure: true` in "Coverage is off by
  default and has no thresholds".

## Handoff

The change is demonstrably working: the script, the command and both CI jobs behave as the scenarios say,
locally and in CI. No screenshot was taken, and none was left at the repository root.
