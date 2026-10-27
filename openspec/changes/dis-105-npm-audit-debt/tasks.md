## 0. Setup: Create Feature Branch (MANDATORY - FIRST STEP)

- [x] 0.1 First action of the apply: confirm DIS-105 is In Progress in Linear, with a short Spanish comment naming the change `dis-105-npm-audit-debt` and the branch `feature/dis-105-npm-audit-debt`
- [x] 0.2 Feature branch `feature/dis-105-npm-audit-debt` (`BRANCH_PREFIX=feature/`), created from `final-project-CRN` before `/opsx:propose`; confirm `git merge-base --is-ancestor origin/final-project-CRN HEAD` and that `openspec/changes/dis-105-npm-audit-debt/` is on it. `git fetch`; if `origin/final-project-CRN` moved, merge it before any code (never force-push a published branch)
- [x] 0.3 Verify the current branch and `git status`; nothing under `.claude/` or `.cursor/` is ever staged (explicit paths only)
- [x] 0.4 Baseline (recorded in the step 7 report): `node -v`, `npm -v`; `npm audit` summary line and `npm audit --json` counts by severity; `npx vitest run` once with Postgres up (`docker compose up -d`, as `docs/TESTING.md` says) and the totals of test files and tests; `npm run test:a11y` totals; the last `mutation` score and duration on `final-project-CRN` (`gh run list`); the `npm warn deprecated` lines of a clean `npm ci`

## 1. Phase 1: `npm audit fix` without `--force` (design D1, D6) — `local-startup` → "A clean install reports no high or critical advisory"

- [x] 1.1 `npm audit fix` (no `--force`); review the diff of `package.json` files and `package-lock.json` (only lockfile entries and same-major ranges); confirm `zod` resolves to 4.6.6 or later in every workspace and `markdown-it` to 14.3.3 or later; `npm audit --audit-level=high` and record the remaining advisories (only the ones phase 2 fixes)
- [x] 1.2 Verify phase 1: `npm run lint`, `npm run typecheck`, `npx vitest run` (same file and test totals as 0.4), `npm run test:a11y`
- [x] 1.2a **existing test changes** (found by 1.2, agent's decision D13): `zod` 4.6.7 stops validating the elements of an array that already exceeds its maximum, so in `tests/unit/explain/statement-schema.spec.ts` the test "The issues of an event are bounded" (21,000 empty statements) now yields one `too_big` issue and the subcode `limit_exceeded`, not 42,001 issues. RED: the test fails under zod 4.6.7 (seen). The test keeps its name and its intent (an event carries at most `MAX_EVENT_ISSUES` issues and stays under 4,096 bytes, `issueCount` keeps the total) with a fixture of `MAX_STATEMENTS` empty statements (two issues each, `issueCount` 40, subcode `invalid_shape`); the 21,000-statement fixture moves to a new test "An oversized statements array is one limit issue" (63,029 bytes, `limit_exceeded`, one issue). No assertion of the original is weakened. Production code unchanged
- [x] 1.3 Commit phase 1 alone (explicit paths: `package-lock.json` and any `package.json` npm changed), message naming DIS-105 phase 1

## 2. Migration notes (design D8, Risks)

Each task reads the official migration pages (dated) and lists every change that touches `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.json`, `packages/web/vite.config.ts`, `tests/support/jsdom-setup.ts` or the test files, as notes for the PR body.

- [x] 2.1 Vitest 2, 3, 4 and 5: `test.projects` and `extends: true` (how `include`/`exclude` arrays merge, design D8), how CLI filters (`--exclude`, file arguments) apply to projects, `sequence.hooks` (design D5), and the mock semantics of `mockClear`/`mockReset` against `tests/unit/analyzers/php/parser-load.spec.ts` (l.19–21) and `docs/project-context.md` l.1444–1445 (design Risks)
- [x] 2.2 Vite 6, 7 and 8 and `@vitejs/plugin-react` 5 and 6: the top-level `esbuild` option, the dev-server proxy, anything `packages/web/vite.config.ts` uses
- [x] 2.3 Stryker 9 and 10: renamed or removed options and `$schema` of `stryker.config.json`, and whether `@stryker-mutator/vitest-runner` 10 supports `test.projects` (design Risks: otherwise `vitest.stryker.config.ts` flattens to a single project)

## 3. Phase 2: dependency bumps (design D2, D3, D4)

- [x] 3.1 Package checks for each new version (exact name, at least 7 days old, repository, weekly downloads, install scripts): `vitest@5.0.5` (replaced by `vitest@4.1.12` in 3.5, design D16), `vite@8.3.4`, `@vitejs/plugin-react@6.1.2`, `@stryker-mutator/core@10.0.0`, `@stryker-mutator/vitest-runner@10.0.0`, `@types/node@22.20.5`; confirm from `npm view @vitejs/plugin-react@6.1.2 peerDependenciesMeta` that its extra peers are optional (design D4); a required peer goes through the same checks or is a clean stop
- [x] 3.2 Root: `npm install -D vitest@5.0.5 (3.5 moves it to 4.1.12) vite@8.3.4 @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0 @types/node@22.20.5`, then set the ranges to `^5.0.5`, `^8.3.4`, `^10.0.0`, `^10.0.0`, `^22.20.5` (`engines.node` is left to 5.4)
- [x] 3.3 `packages/web`: `npm install -w packages/web -D vite@8.3.4 @vitejs/plugin-react@6.1.2` (ranges `^8.3.4`, `^6.1.2`); one copy of `vite` in the tree (`npm ls vite`)
- [x] 3.4 `npm audit --audit-level=high` exits `0` (a new high or critical stops the ticket); record `npm audit` output and `npm audit --json` (`fixAvailable` of any remaining advisory) and the `npm warn deprecated` lines for design D7
- [x] 3.5 (found by 7.4, agent's decision D16) The first full mutation run under Vitest 5.0.5 killed almost no mutant (2,924 of 2,987 survived; `confidence.ts` 9.86 % against 97.18 % under Vitest 4.1.12). `npm install -D vitest@4.1.12` (package checks: 12 days old, official repository, `vite ^6 || ^7 || ^8` peer), range `^4.1.12`; `npm audit` 0 vulnerabilities; `vitest.stryker.config.ts` and `test.projects` unchanged; the comments that said "Vitest 5" (`frontend.yml`, `tests/integration/helpers/db.ts`, `tests/unit/analyzers/php/parser-load.spec.ts`) and the docs are corrected; the suite, lint, typecheck and a11y are re-run (7.2, 7.3) before 7.4 is repeated

## 4. Test configuration migration (TDD where behaviour is observable; design D8) — `web-foundation` → "Component test environment" unchanged

- [x] 4.1 `vitest.config.ts`: replace `poolMatchGlobs` and `environmentMatchGlobs` with `test.projects` (`dom`, `seed-build`, `node`, each `extends: true`) with the `include`/`exclude` of design D8 (the `node` project restates the three root globs plus the `dom` and `seed-build` globs), keeping the comments and their design references; move `esbuild.jsx` to its Vite 8 equivalent only if Vite 8 deprecates it
- [x] 4.2 `vitest.stryker.config.ts`: for every project (`dom`, `seed-build`, `node`), list its files under `--config vitest.stryker.config.ts` (`npx vitest list --config vitest.stryker.config.ts --project <name>`, or `run --reporter=verbose` if `list` is unavailable); none of the nine excluded globs of `vitest.stryker.config.ts` is listed; if one is, apply the same list per project, exactly today's paths
- [x] 4.3 `stryker.config.json`: apply the Stryker 9 and 10 changes listed in 2.3 (renamed or removed options, `$schema` path); `thresholds` and `mutate` unchanged
- [x] 4.4 `tests/support/jsdom-setup.ts` and `packages/web/vite.config.ts`: change only if 2.1, 2.2 or a failing run requires it (record why); `tests/unit/web/vite-config.spec.ts` stays unchanged and green
- [x] 4.5 Check the environments and the file sets:
  - `packages/web/src/**/*.test.tsx` and `tests/a11y/*.a11y.test.tsx` run in jsdom (the existing "Rendered output does not leak between tests" green), `packages/web/src/**/*.test.ts` in Node, `tests/integration/cli/seed-build.spec.ts` in `forks` (its time-zone scenario green);
  - the per-project file lists add up to the 0.4 total and no file belongs to two projects; `npx vitest run` file total equals 0.4;
  - Frontend job (`.github/workflows/frontend.yml:63`): `CI=1 npx vitest run --exclude 'tests/integration/**' --reporter=verbose` with `DATABASE_URL` unset lists no file under `tests/integration/` and is green;
  - hook-timing step (`.github/workflows/ci.yml:147`): its command runs exactly its four `tests/harness/` files;
  - if a CLI filter does not reach a project, stop and add the fix of design D8 through `/opsx:update` before editing `frontend.yml` or `ci.yml`
- [x] 4.5a Fix of design D8/D14 (the CLI `--exclude` does not reach the projects, seen in 4.5): `.github/workflows/frontend.yml` step "Unit / component tests" runs `npx vitest run tests/unit tests/harness tests/a11y packages/web` with its comment; verified with `CI=1` and `DATABASE_URL` unset: 164 files, none under `tests/integration/`, green; the docs lines that name the old command (`docs/DEPLOYMENT.md` l.71, `docs/project-context.md` l.1271) are updated in 10.3 and 10.4
- [x] 4.6 Hook order (design D5): any integration test that fails because hooks now run in series is fixed with the smallest change and named in an `/opsx:update` task before editing it
- [x] 4.6a **existing test support changes** (found by 4.5's full run, agent's decision D15): under Vitest 5 the default reporter no longer prints the `console.warn` of an all-skipped file, so `tests/integration/helpers/gate.spec.ts` test "Database tests are skipped locally without a database" fails (no `WARNING: DATABASE_URL is not set` line) and a contributor without a database would see no warning. RED: that test (seen failing). GREEN: `tests/integration/helpers/db.ts` writes the same warning text with `fs.writeSync(2, …)` instead of `console.warn`, which Vitest does not intercept; `gate.spec.ts` stays unchanged (its comment of "Vitest 1.x" may be reworded only if it is false) and green
- [x] 4.7 (the comment is rewritten; the file passes under Vitest 5 without a code change) Mock semantics (design Risks, D12): **existing test changes** — in `tests/unit/analyzers/php/parser-load.spec.ts`, the comment of the `beforeEach` of `describe('php analyzer parser load')` (l.19–21, "In Vitest 1.6 `mockClear` keeps queued `…Once` values…") is rewritten to the Vitest 5 semantics found in 2.1; the `mockReset().mockImplementation(real)` call and every assertion stay unless the file fails under Vitest 5, in which case the smallest change is named here through `/opsx:update` before editing; the file green

## 5. Node 22 baseline (TDD; design D2, D10, D11, D12)

- [x] 5.1 RED (`local-startup` → "CI runs on the supported Node baseline", scenario "Every CI job installs Node 22"): create `tests/unit/ci/node-baseline.spec.ts`, parsing `.github/workflows/ci.yml` and `.github/workflows/frontend.yml` with `yaml` (as `tests/unit/ci/verify-job.spec.ts`) and reading the root `package.json`; test named "Every CI job installs Node 22", checking every `actions/setup-node` step and that `22` is the major of the lower bound of `engines.node`. See it fail
- [x] 5.2 GREEN: `node-version: '22'` in every `actions/setup-node` step of both workflows (`quality`, `verify`, `mutation`, Frontend); the `engines.node` half turns green with 5.4
- [x] 5.3 RED (`local-startup` → "The guide's scripts load .env and the quality scripts do not"): **existing test changes** — in `tests/unit/scripts/wiring.spec.ts`, test "The guide's scripts load .env and the quality scripts do not", the assertion `expect(root.engines?.node).toBe('>=20.11')` (l.112) becomes `'>=22.12'`, and the comment above it (l.111) becomes the one in design D12 ("engines on the Node 22.12 baseline; one .env reader…"); the three `not.toContain`/`not.toMatch` checks of `scripts/` stay unchanged; nothing else touched. See it fail
- [x] 5.4 GREEN: `engines.node` `>=22.12` in the root `package.json`; the comment of `scripts/env.mjs` names `>=22.12` and the reason of design D12 (one `.env` reader and one grammar); 5.1 and 5.3 green
- [x] 5.5 RED (`project-picker` → "The indexing hint is text, not a control"): **existing test changes** — in `packages/web/src/pages/ProjectPickerPage.test.tsx`, test "The indexing hint is text, not a control", the text `Node 20+` (l.421) becomes `Node 22.12+`, nothing else touched. See it fail
- [x] 5.6 GREEN: `packages/web/src/pages/ProjectPickerPage.tsx` hint line says «Node 22.12+»; `npx vitest run packages/web tests/unit/ci tests/unit/scripts` green
- [x] 5.7 Commit phase 2 code with explicit paths (root and `packages/web` `package.json`, `package-lock.json`, `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.json`, both workflows, `scripts/env.mjs`, the hint, the new and changed tests, and any file of 4.4/4.6/4.7), message naming DIS-105 phase 2; push the branch so steps 8 and 9 clone it

## 6. Review and Update Existing Tests (MANDATORY)

- [ ] 6.1 Confirm the only existing tests edited are `tests/unit/scripts/wiring.spec.ts` (5.3), `packages/web/src/pages/ProjectPickerPage.test.tsx` (5.5) `tests/unit/analyzers/php/parser-load.spec.ts` (4.7) and `tests/unit/explain/statement-schema.spec.ts` (1.2a), plus any named through `/opsx:update` in 4.6 or 4.7; no assertion weakened (`git diff` of `tests/` and `packages/web/src/**/*.test.*`)
- [ ] 6.2 Every `#### Scenario:` of the deltas maps to a test or recorded check: "The guide's scripts load .env and the quality scripts do not" → `wiring.spec.ts`; "Every CI job installs Node 22" → `node-baseline.spec.ts`; "The indexing hint is text, not a control" → `ProjectPickerPage.test.tsx`; "A guide command reads DATABASE_URL from .env" (both halves) and "npm audit on a clean clone" → recorded checks of step 8; ticket AC2 (quality unchanged) → recorded checks 0.4, 7.3, 7.4; ticket AC3 Stryker exclusions → recorded check 4.2

## 7. Run Tests and Verify Data State (MANDATORY)

- [ ] 7.1 Pre-test baseline of the local database: `SELECT count(*) FROM project`, `FROM query_log`, `SELECT count(*), sum(hit_count) FROM cache_entry`
- [ ] 7.2 Targeted: `npx vitest run tests/unit/ci tests/unit/scripts tests/unit/analyzers/php packages/web tests/unit/web`, `npm run test:a11y`
- [ ] 7.3 Broader: `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npx vitest run` (file count equal to 0.4, test count noted before and after), `npm run verify`
- [ ] 7.4 Mutation: `npm run test:mutation:full` (score at or above 80; duration noted against 0.4)
- [ ] 7.5 Post-test state equals 7.1 (restore if not); no temporary files left; report `openspec/changes/dis-105-npm-audit-debt/reports/YYYY-MM-DD-7-test-and-state-verification.md` (template of `docs/openspec-tasks-mandatory-steps.md` §6, including the package checks of 3.1 and the `npm audit` outputs of 1.1 and 3.4)

## 8. Manual Interface Testing (MANDATORY - AGENT MUST EXECUTE)

- [ ] 8.1 Recorded check "npm audit on a clean clone" and the `Paso 0` capture: clone the pushed branch (with the 5.7 commit) into the scratchpad, with its own Compose project name and `POSTGRES_PORT`, and `.env` copied from `.env.example`; run `npm run up` first (no prior `npm ci`, ports 3000 and 5173 checked free first; a process outside the scratchpad holding them is recorded, never ended) and capture its whole output up to the API and Vite start lines for `docs/DEMO.md` → `Paso 0`, in PowerShell 7 and in Git Bash, as `docs/DEMO.md` → `Cómo se capturó` states (a second clean clone for the second terminal); then `npm audit --audit-level=high` (exit `0`), `npm audit` and `npm audit --json` (any remaining advisory is low or moderate with `fixAvailable: false`, and listed in design Follow-ups)
- [ ] 8.2 In that clone with the system up: `http://localhost:5173/` loads (Vite 8) and `http://localhost:5173/health` answers 200 through the proxy; recorded check "A guide command reads DATABASE_URL from .env": `npm run cli -- projects` in a new PowerShell terminal and in a new Bash terminal lists `acme-shop`, exit `0`; error half: with `.env` moved aside and no `DATABASE_URL` in the environment, `npm run cli -- projects` fails with `MISSING_CONFIG` on stderr and exit `1`, then `.env` is put back
- [ ] 8.3 Keep the clone and its services running for step 9; document every command and output in `reports/YYYY-MM-DD-8-manual-interface-testing.md`

## 9. End-to-End Testing (MANDATORY if applicable - AGENT MUST EXECUTE)

- [ ] 9.1 In the 8.2 clone, Screen 1 in Chromium (browser-automation skill): the hint shows «Node 22.12+», a sample project opens Screen 2; screenshot `reports/YYYY-MM-DD-9-project-picker-node-22.png`
- [ ] 9.2 Restore: stop the dev servers by process tree, `docker compose -p <clone> down -v` for the clone only (and for the second-terminal clone of 8.1), the author's database untouched; document it in `reports/YYYY-MM-DD-9-end-to-end.md`, which links the screenshot

## 10. Update Technical Documentation (MANDATORY)

- [ ] 10.1 `docs/adr/20261026-node-22-baseline.md` from `docs/adr/_template.md` (design D2, including the Node 23/25 note; the rationale marked as the agent's text); it says it supersedes the Node line of `docs/adr/20260928-node-pg-migrate-sql-migrations.md` (l.34, "Node ≥ 20.11; CI uses Node 20"); a new index row in `docs/adr/README.md`
- [ ] 10.2 `docs/DEMO.md`: environment table (l.20), Node requirement (l.56, l.65: Node 22.12 or later, an LTS line, CI on Node 22), `Paso 0` output replaced with the 8.1 capture (including its Vite banner); `Cómo se capturó` rows updated: date, commit, terminals, Node/npm versions; `npx vitest run tests/unit/docs` green
- [ ] 10.3 `docs/DEPLOYMENT.md` (l.20), `docs/backend-standards.md` (l.12), `readme.md` (l.294, l.471, l.549): Node 22.12 or later; `docs/TESTING.md` if a command or environment line changed
- [ ] 10.4 `docs/project-context.md`: `engines.node` line (l.94, with the D12 reason for the single `.env` reader), the hook-order note (l.427, design D5), the seed-build time-zone note (l.1101–1102: `forks` through the `seed-build` project instead of `poolMatchGlobs`), the mock-semantics note (l.1444–1445, the Vitest 5 semantics found in 2.1), and the per-file environment mechanism (`test.projects`) where the config is described
- [ ] 10.5 Linear: one Spanish checklist comment on DIS-105 with design D7 (the `npm warn deprecated` lines from 3.4) and D9; update design.md → Follow-ups with the final list
- [ ] 10.6 `/update-docs`: the docs gate passes; `prompts.md` gains the DIS-105 prompts with its Índice entry if the project keeps it

## 11. Pull request preparation

- [ ] 11.1 Commit the documentation, ADR and reports (and any change still pending) with explicit paths; `/pr-describe` in Spanish against `final-project-CRN`: the two phases, the migration notes of 2.1–2.3, test file and test counts before and after, mutation score and duration, the `npm audit` outputs, the package checks, the three existing tests changed, the Why marked as the agent's decision where it is

## 12. Pre-merge Review (MANDATORY - AGENT MUST EXECUTE)

- [ ] 12.1 Open the PR against `final-project-CRN`; DIS-105 to In Review with a Spanish comment linking it
- [ ] 12.2 CI green (`quality`, `verify`, `mutation`, `secrets`, Frontend), waited with `Monitor`; a mutation timeout gets one re-run, then `timeout-minutes` of `mutation` goes from 40 to 60 with its reason (design Risks); link the run in an addendum to the step 7 report
- [ ] 12.3 `/show-spec-working` (may reuse the 8 and 9 evidence) → `reports/YYYY-MM-DD-show-spec-working.md`
- [ ] 12.4 `/verify-against-spec` (inline mode) → `reports/YYYY-MM-DD-verify-against-spec.md`
- [ ] 12.5 `/adversarial-review` (inline mode) → `reports/YYYY-MM-DD-adversarial-review.md`
- [ ] 12.6 Fix every finding in this change (TDD for behaviour), each with an A/B/C/D destination in `design.md` → Follow-ups; re-run what each fix invalidates; commit to the same PR; re-run a check whose findings led to non-trivial fixes until no Blocker or Major
- [ ] 12.7 `/opsx:archive`, commit it to the same PR; merge only after the archive commit and with CI green, through the merge gate (`gh pr merge <n> --merge`)
