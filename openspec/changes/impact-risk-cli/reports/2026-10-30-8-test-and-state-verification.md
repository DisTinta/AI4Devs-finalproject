# Test and State Verification Report

- Date: 2026-10-30
- Change: impact-risk-cli
- Step: 8. Backend: Run Tests and Verify Data State (MANDATORY)

Agent's text (autonomous run, `docs/AUTONOMOUS-RUN.md` §6).

## Commands executed

- Baseline (0.4): `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli/ask-command.spec.ts tests/integration/cli/ask-command.spec.ts` against `codemind_test` (empty)
- Targeted (8.2): `npx vitest run tests/unit/impact tests/integration/impact tests/unit/cli tests/integration/cli/impact-command.spec.ts tests/integration/cli/ask-command.spec.ts`
- Broader suite (8.3): `npx vitest run --project dom --project seed-build --project node`, `npm run lint`, `npm run typecheck`, `npm run lint:architecture`, `npm run docs:coverage`, `npm run verify` (against the seeded dev database)
- Mutation (8.4): `npx stryker run --mutate "packages/core/src/impact/**/*.ts,packages/cli/src/commands/impact.ts"` (twice; the second run is incremental)
- `grep -rn "adapters\|store-postgres\|fastify" packages/core/src/impact` (prints nothing) and `git diff --stat origin/final-project-CRN -- packages/cli/src/commands/ask.ts packages/cli/src/compose-index.ts` (prints nothing)
- `node scripts/dev-processes.mjs stop`

## Test results

- Baseline: 83 passed in 7 files (impact and ask suites).
- Targeted tests: 343 passed, 0 failed, 0 skipped (24 files).
- Required suite: 2087 passed, 0 failed, 0 skipped (199 files, 341 s).
- Lint, typecheck, `lint:architecture` (one pre-existing `no-orphans` warning for a built web asset), `docs:coverage`: clean.
- `npm run verify`: acme-shop 3/3 and task-api 3/3 golden answers match, without `seed:build` (no fingerprint input changed, design P9).
- Stryker (scoped files): `impact.ts` core 98.04, `query-log.ts` 100, `risk.ts` 100, `relevance.ts` 81.92, `reverse-walk.ts` 77.84 (71.43 on the first run, before the tests added for the seeds a direct component owns), CLI `impact.ts` 90.75. Whole run: 93.01 (threshold `MIN_MUTATION_SCORE=70`, break 80). Accepted survivors are in `design.md` → Follow-ups A4 (destination D).
- Notes: the integration specs need an empty database (`docs/TESTING.md`), so they ran against `codemind_test`; the dev database `codemind` holds the loaded seed. No flaky test seen.

## Data state verification

- Pre-test baseline (dev database `codemind`):
  - `project`: 2; `symbol`: 185; `edge`: 270; `query_log` rows by capability: none (0 rows)
  - `analyzer-fingerprint`: `sha256:153d943ed77bce5c58308fab13e3d49664723cb85eb07c89b151d3490edfc44f`
  - `contract-fingerprint`: `sha256:e94eef9665a038116a244342915af3743028225330fec41614260f1603fb392f`
  - `codemind_test` projects: 0
- Post-test validation:
  - dev database after steps 8 and 9: `project` 2, `symbol` 185, `edge` 270, `query_log` 0 rows
  - `codemind_test` projects: 0
  - fingerprint header lines of `seeds/graph-dump.sql` unchanged (the file is untouched); `git status --porcelain seeds packages/web fixtures` empty; no `.stryker-tmp/` left
- State restored: Yes
- Restoration actions: the step 9 commands wrote 6 `impact` rows into the dev `query_log`; they were deleted by `created_at` (see the step 9 report).

## 1:1 scenario map (task 7.2)

Every `#### Scenario:` title of `specs/impact/spec.md` (22) and `specs/cli-impact/spec.md` (17) was searched in `tests/` with the exact title: each has exactly one test.

- impact, the 7 MODIFIED-requirement scenarios keep their DIS-89 tests (`tests/unit/impact/impact.spec.ts`, `components.spec.ts`).
- impact, the 15 ADDED scenarios: 8 risk scenarios in `tests/unit/impact/risk.spec.ts`; `Q2 over the seed is high risk` and `An impact call over the seed writes its row` in `tests/integration/impact/acme-shop.spec.ts`; 4 query-log scenarios in `tests/unit/impact/query-log.spec.ts`; the renamed test of task 2.6 in `impact.spec.ts`.
- cli-impact, 17 scenarios: `tests/unit/cli/impact-command.spec.ts` (12) and `tests/integration/cli/impact-command.spec.ts` (5: unreachable database, global help, closed connections, Q2 with its risk, no-anchor).

## Existing tests changed (task 7.1)

- `tests/unit/impact/impact.spec.ts`, "sends one reverse traversal over the dependency kinds…": the reverse traversal is selected by its kinds; outward `tested_by` statements at most `maxHops + 1` plus exactly one inward read. No assertion weakened.
- `tests/unit/impact/impact.spec.ts`, no-search-terms test: renamed to the scenario and expects the `project-not-found` event.
- `tests/integration/impact/acme-shop.spec.ts`: two tests added, existing ones unchanged.

## Privacy check (task 10.5, `/privacy-ethics-check` over the diff)

- The change text is written only to `query_log.question` (the same column `ask` uses for the question). Scenarios with sentinels prove it is not in the rationale, the event JSON, the usage or internal error lines, or any stderr line of the command.
- No new personal data, no new dependency (no `npm install`, so no `npm audit` run), no telemetry, no third-party call: `impact` calls no model and the command reads no `LLM_*` variable.
- The database URL never reaches an output (unreachable-database scenario).
- Outcome: no finding.

## Outcome

- Status: PASS
- Blocking issues: none

## Addendum: CI of the pull request (task 12.2)

Agent's text. PR https://github.com/DisTinta/AI4Devs-finalproject/pull/91. The first run
(https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41106506753) was green except `secrets`: gitleaks
flagged the synthetic sentinel API key of the model-configuration scenario (spec line 82, test line 191, and the
two commits of the branch that carried them). It was allowed by its exact value in `.gitleaks.toml`, as the other
synthetic findings (confirmed locally with `gitleaks dir` and `gitleaks git` before pushing). The second run
(https://github.com/DisTinta/AI4Devs-finalproject/actions/runs/41108086977) passed `scope`, `quality`, `verify`,
`mutation`, `secrets` and `frontend`.
