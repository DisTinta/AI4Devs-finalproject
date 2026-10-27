# Step 7: tests and data state (DIS-105)

Agent's report (autonomous run), 2026-10-27, branch `feature/dis-105-npm-audit-debt`, commit `4b1435a`.
Node v24.11.1, npm 11.19.0 (the CI runs Node 22).

## Baseline (task 0.4) and result

| Check | Before (`final-project-CRN`, Vitest 1.6) | After |
|---|---|---|
| `npm audit` | 20 advisories (5 low, 6 moderate, 6 high, 3 critical) | 0 vulnerabilities; `npm audit --audit-level=high` exits 0; `npm audit --json` has an empty `vulnerabilities` object |
| `npx vitest run` (Postgres up, `codemind_test`) | 196 files, 2,037 tests | 197 files, 2,039 tests, all passed (+1 file `node-baseline.spec.ts`, +1 test of `statement-schema.spec.ts`, +1 test of `node-baseline.spec.ts`) |
| `npm run test:a11y` | 3 files, 5 tests | 3 files, 5 tests |
| `npm run lint`, `typecheck`, `lint:architecture` (3 warnings as before), `docs:coverage` | clean | clean |
| `npm run verify` (seeded `codemind_test`) | 3/3 golden answers | 3/3 golden answers match |
| Mutation (`npm run test:mutation:full`) | last CI job on `final-project-CRN`: success, 32 min (run 40432336081) | score 95.16 (break threshold 80), 25 min 6 s plus a 2 min dry run on this machine |
| `npm warn deprecated` of a clean install | `@babel/plugin-proposal-explicit-resource-management@7.27.4`, `whatwg-encoding@3.1.1`, `eslint@9.39.5` | `whatwg-encoding@3.1.1`, `eslint@9.39.5` |

The targeted run of 7.2 (`tests/unit/ci`, `tests/unit/scripts`, `tests/unit/docs`, `tests/unit/analyzers/php`, `packages/web`, `tests/unit/web`) is a subset of the full run above, and the docs, scripts and CI specs were run again after the documentation edits (10 files, 48 tests).

## Finding during step 7: Vitest 5.0.5 is not usable with Stryker 10.0.0

The first full mutation run on Vitest 5.0.5 killed almost no mutant (2,924 of 2,987 tested had survived when it was stopped). A run on `packages/core/src/knowledge/confidence.ts` gave 9.86 % under Vitest 5.0.5 (also with a single-project config) and 97.18 % under Vitest 4.1.12. The decision (design D16, task 3.5): `vitest` `^4.1.12`, Stryker 10.0.0 and Vite 8.3.4 kept. The suite, lint, typecheck, a11y and the audit were run again after the change (the table above).

## Package checks (task 3.1)

All at least 7 days old when installed, with their official repository and no install script of their own: `vite@8.3.4` (2026-10-08), `@vitejs/plugin-react@6.1.2` (2026-10-05; its extra peers are optional), `@stryker-mutator/core@10.0.0` and `@stryker-mutator/vitest-runner@10.0.0` (2026-08-14), `@types/node@22.20.5` (2026-10-01), `vitest@4.1.12` (2026-10-15, 12 days). `vitest@5.0.5` was checked and replaced. Skipped for age: `vite@8.3.5` and Stryker 10.1.1 (D3). The environment hook vetted each install.

## Data state

Local database (`codemind`, the author's), before and after: `project` 1, `query_log` 0, `cache_entry` 3 with `sum(hit_count)` 0. The suite and `verify` ran against `codemind_test`, which they own. `.stryker-tmp/` (gitignored) is left by Stryker runs; `reports/stryker-incremental.json` (gitignored) was rewritten. No other temporary file; the clone folders are in the session scratchpad.

## Addendum: CI of PR #69 (task 12.2)

- At `f473bdd` (end of the apply): scope, secrets, verify, quality, frontend and mutation green; the
  mutation job, the first full run on Node 22 and Stryker 10, took 33 min 41 s
  ([run 40481582423](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40481582423),
  [frontend 40481582252](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40481582252)).
- At `6a8d06c` (review fixes: `claims-and-typing` delta, two tests): all six checks green
  ([run 40489657157](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40489657157),
  [frontend 40489657280](https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/40489657280));
  mutation 1 min 15 s, since no file of its `mutate` set changed.
