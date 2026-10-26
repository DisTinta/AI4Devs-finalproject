## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [ ] 0.1 First action of the apply: confirm DIS-105 is In Progress in Linear, with a short Spanish comment naming the change `dis-105-npm-audit-debt` and the branch `feature/dis-105-npm-audit-debt`
- [ ] 0.2 Feature branch `feature/dis-105-npm-audit-debt` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/dis-105-npm-audit-debt/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch)
- [ ] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [ ] 0.4 Baseline (recorded in the step 7 report): `node -v`, `npm -v`; `npm audit` summary line and `npm audit --json` counts by severity; `npx vitest run` once with Postgres up (`docker compose up -d`, as `docs/TESTING.md` says) and the totals of test files and tests; `npm run test:a11y` totals; the last `mutation` score and duration on `final-project-CRN` (`gh run list`); the `npm warn deprecated` lines of a clean `npm ci`

## 1. Phase 1: `npm audit fix` without `--force` (design D1, D6) — `local-startup` → "A clean install reports no high or critical advisory"

- [ ] 1.1 `npm audit fix` (no `--force`); review the diff of `package.json` files and `package-lock.json` (only lockfile entries and same-major ranges); confirm `zod` resolves to 4.6.6 or later in every workspace and `markdown-it` to 14.3.3 or later; `npm audit --audit-level=high` and record the remaining advisories (only the ones phase 2 fixes)
- [ ] 1.2 Verify phase 1: `npm run lint`, `npm run typecheck`, `npx vitest run` (same file and test totals as 0.4), `npm run test:a11y`
- [ ] 1.3 Commit phase 1 alone (explicit paths: `package-lock.json` and any `package.json` npm changed), message naming DIS-105 phase 1

## 2. Migration notes (design D8, Risks)

- [ ] 2.1 Read the migration guides of Vitest 2, 3, 4 and 5, Vite 6, 7 and 8, `@vitejs/plugin-react` 5 and 6, and Stryker 9 and 10 (official pages, dated); list every change that touches `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.json`, `packages/web/vite.config.ts`, `tests/support/jsdom-setup.ts` or the test files, as notes for the PR body

## 3. Phase 2: dependency bumps (design D2, D3, D4)

- [ ] 3.1 Package checks for each new version (exact name, at least 7 days old, repository, weekly downloads, install scripts): `vitest@5.0.5`, `vite@8.3.4`, `@vitejs/plugin-react@6.1.2`, `@stryker-mutator/core@10.0.0`, `@stryker-mutator/vitest-runner@10.0.0`, `@types/node@22.20.5`; confirm from `npm view @vitejs/plugin-react@6.1.2 peerDependenciesMeta` that its extra peers are optional (design D4); a required peer goes through the same checks or is a clean stop
- [ ] 3.2 Root: `npm install -D vitest@5.0.5 vite@8.3.4 @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0 @types/node@22.20.5`, then set the ranges to `^5.0.5`, `^8.3.4`, `^10.0.0`, `^10.0.0`, `^22.20.5`; `engines.node` to `>=22.12`
- [ ] 3.3 `packages/web`: `npm install -w packages/web -D vite@8.3.4 @vitejs/plugin-react@6.1.2` (ranges `^8.3.4`, `^6.1.2`); one copy of `vite` in the tree (`npm ls vite`)
- [ ] 3.4 `npm audit --audit-level=high` exits `0` (a new high or critical stops the ticket); record `npm audit` output and the `npm warn deprecated` lines for design D7

## 4. Test configuration migration (TDD where behaviour is observable; design D8) — `web-foundation` → "Component test environment" unchanged

- [ ] 4.1 `vitest.config.ts`: replace `poolMatchGlobs` and `environmentMatchGlobs` with `test.projects` (`dom`, `seed-build`, `node`, each `extends: true`) as in design D8, keeping the comments and their design references; move `esbuild.jsx` to its Vite 8 equivalent only if Vite 8 deprecates it
- [ ] 4.2 `vitest.stryker.config.ts`: check that the `exclude` list reaches every project (`npx vitest run --config vitest.stryker.config.ts --project node --reporter=verbose` lists none of the excluded paths); if not, apply the same list per project, exactly today's paths
- [ ] 4.3 `stryker.config.json`: apply the Stryker 9 and 10 changes listed in 2.1 (renamed or removed options, `$schema` path); `thresholds` and `mutate` unchanged
- [ ] 4.4 `tests/support/jsdom-setup.ts` and `packages/web/vite.config.ts`: change only if 2.1 or a failing run requires it (record why); `tests/unit/web/vite-config.spec.ts` stays unchanged and green
- [ ] 4.5 Check the environments: `packages/web/src/**/*.test.tsx` and `tests/a11y/*.a11y.test.tsx` run in jsdom (the existing "Rendered output does not leak between tests" green), `packages/web/src/**/*.test.ts` in Node, `tests/integration/cli/seed-build.spec.ts` in `forks` (its time-zone scenario green); `npx vitest run` file total equals 0.4
- [ ] 4.6 Hook order (design D5): any integration test that fails because hooks now run in series is fixed with the smallest change and named in an `/opsx:update` task before editing it

## 5. Node 22 baseline (TDD; design D2, D10, D11, D12)

- [ ] 5.1 RED (`local-startup` → "Every CI job installs Node 22"): create `tests/unit/ci/node-baseline.spec.ts`, parsing `.github/workflows/ci.yml` and `.github/workflows/frontend.yml` with `yaml` (as `tests/unit/ci/verify-job.spec.ts`); test named "Every CI job installs Node 22". See it fail
- [ ] 5.2 GREEN: `node-version: '22'` in every `actions/setup-node` step of both workflows (`quality`, `verify`, `mutation`, Frontend)
- [ ] 5.3 RED (`local-startup` → "The guide's scripts load .env and the quality scripts do not"): **existing test changes** — in `tests/unit/scripts/wiring.spec.ts`, test "The guide's scripts load .env and the quality scripts do not", the assertion `expect(root.engines?.node).toBe('>=20.11')` (l.112) becomes `'>=22.12'`, nothing else touched. See it fail if 3.2 has not set engines yet, or confirm it fails against the base value
- [ ] 5.4 GREEN: `engines.node` `>=22.12` (if not already set in 3.2); the comment of `scripts/env.mjs` names `>=22.12`
- [ ] 5.5 RED (`project-picker` → "The indexing hint is text, not a control"): **existing test changes** — in `packages/web/src/pages/ProjectPickerPage.test.tsx`, test "The indexing hint is text, not a control", the text `Node 20+` (l.421) becomes `Node 22+`, nothing else touched. See it fail
- [ ] 5.6 GREEN: `packages/web/src/pages/ProjectPickerPage.tsx` hint line says «Node 22+»; `npx vitest run packages/web tests/unit/ci tests/unit/scripts` green

## 6. Review and Update Existing Tests (MANDATORY)

- [ ] 6.1 Confirm the only existing tests edited are `tests/unit/scripts/wiring.spec.ts` (5.3) and `packages/web/src/pages/ProjectPickerPage.test.tsx` (5.5), plus any named through `/opsx:update` in 4.6; no assertion weakened (`git diff` of `tests/` and `packages/web/src/**/*.test.*`)
- [ ] 6.2 Every `#### Scenario:` of the deltas maps to a test or recorded check: "The guide's scripts load .env and the quality scripts do not" → `wiring.spec.ts`; "Every CI job installs Node 22" → `node-baseline.spec.ts`; "The indexing hint is text, not a control" → `ProjectPickerPage.test.tsx`; "A guide command reads DATABASE_URL from .env" and "npm audit on a clean clone" → recorded checks of step 8

## 7. Run Tests and Verify Data State (MANDATORY)

- [ ] 7.1 Pre-test baseline of the local database: `SELECT count(*) FROM project`, `FROM query_log`, `SELECT count(*), sum(hit_count) FROM cache_entry`
- [ ] 7.2 Targeted: `npx vitest run tests/unit/ci tests/unit/scripts packages/web tests/unit/web`, `npm run test:a11y`
- [ ] 7.3 Broader: `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx vitest run` (file count equal to 0.4, test count noted before and after), `npm run test:mutation:full` (score at or above 80; duration noted), `npm run verify`
- [ ] 7.4 Post-test state equals 7.1 (restore if not); no temporary files left; report `openspec/changes/dis-105-npm-audit-debt/reports/YYYY-MM-DD-7-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6, including the package checks of 3.1 and the `npm audit` outputs of 1.1 and 3.4)

## 8. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Recorded check "npm audit on a clean clone": push the branch, clone it into the scratchpad (own Compose project name and `POSTGRES_PORT`), `npm ci`, `npm audit --audit-level=high` exit `0`, `npm audit` output; capture the full `npm install` output for `docs/DEMO.md` → `Paso 0`
- [ ] 8.2 In that clone: `npm run up` (ports 3000 and 5173 checked free first; a process outside the scratchpad holding them is recorded, never ended); `http://localhost:5173/` loads (Vite 8) and `http://localhost:5173/health` answers 200 through the proxy; recorded check "A guide command reads DATABASE_URL from .env" (`npm run cli -- projects` in PowerShell and in Bash lists `acme-shop`, exit `0`)
- [ ] 8.3 Restore: stop the dev servers by process tree, `docker compose -p <clone> down -v` for the clone only, the author's database untouched; document every command and output in `reports/YYYY-MM-DD-8-manual-interface-testing.md`

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 In the 8.2 clone, Screen 1 in Chromium (browser-automation skill): the hint shows «Node 22+», a sample project opens Screen 2; screenshot `reports/YYYY-MM-DD-9-project-picker-node-22.png`, linked from the step 8 report

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/adr/20261026-node-22-baseline.md` from `docs/adr/_template.md` (design D2; the rationale marked as the agent's text)
- [ ] 10.2 `docs/DEMO.md`: environment table (l.20), Node requirement (l.56, l.65: Node 22.12 or later, CI on Node 22), `Paso 0` install output replaced with the 8.1 capture and `Cómo se capturó` updated; `npx vitest run tests/unit/docs` green
- [ ] 10.3 `docs/DEPLOYMENT.md` (l.20), `docs/backend-standards.md` (l.12), `readme.md` (l.294, l.471, l.549): Node 22; `docs/TESTING.md` if a command or environment line changed
- [ ] 10.4 `docs/project-context.md`: `engines.node` line (l.94) and the hook-order note (l.427, design D5); the per-file environment mechanism (`test.projects`) where the config is described
- [ ] 10.5 Linear: one Spanish checklist comment on DIS-105 with design D7 (the `npm warn deprecated` lines from 3.4) and D9; update design.md → Follow-ups with the final list
- [ ] 10.6 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-105 prompts with its Índice entry if the project keeps it

## 11. Pull request preparation

- [ ] 11.1 Commit phase 2 with explicit paths; `/pr-describe` in Spanish against `final-project-CRN`: the two phases, the migration notes of 2.1, test file and test counts before and after, mutation score and duration, the `npm audit` outputs, the package checks, the two existing tests changed, the Why marked as the agent's decision where it is

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Open the PR against `final-project-CRN`; DIS-105 to In Review with a Spanish comment linking it
- [ ] 12.2 CI green (`quality`, `verify`, `mutation`, `secrets`, Frontend), waited with `Monitor`; a mutation timeout gets one re-run, then `timeout-minutes` raised with its reason (design Risks); link the run in an addendum to the step 7 report
- [ ] 12.3 `/show-spec-working` (may reuse the 8 and 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 12.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 12.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`, commit it to the same PR; merge only after the archive commit and with CI green, through the merge gate (`gh pr merge <n> --merge`)
