## Context

See `proposal.md` → Why. Current state that shapes the approach (checked on 2026-10-26 on
`final-project-CRN` at `042226b`, local Node v24.11.1):

- Root `package.json`: `engines.node` `>=20.11`; `vitest` `^1.6.0` (1.6.1 installed),
  `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` `^8.7.1`, `@types/node` `^20.14.0`,
  `jsdom` `^26.1.0`, `@testing-library/*`, `axe-core`. `packages/web/package.json`: `vite` `^5.4.0`
  (5.4.21), `@vitejs/plugin-react` `^4.3.0`, `@tailwindcss/vite` `^4.3.3` (accepts Vite 8).
- `vitest.config.ts` uses `poolMatchGlobs` (`tests/integration/cli/seed-build.spec.ts` in `forks`,
  DIS-91 D9) and `environmentMatchGlobs` (jsdom for `packages/web/**/*.test.tsx` and `tests/a11y/**`,
  DIS-58 D17). Both options were removed in Vitest 4. It also sets `esbuild: { jsx: 'automatic' }`,
  `setupFiles`, `env.CODEMIND_SKIP_DOTENV`, the 20 s timeouts and `exclude`.
- `vitest.stryker.config.ts` is `mergeConfig(base, { test: { exclude: [...] } })`.
- `stryker.config.json`: `$schema` from `node_modules`, `testRunner: vitest`, `incremental`,
  `coverageAnalysis: perTest`, `thresholds.break` 80.
- `.github/workflows/ci.yml` (`quality`, `verify`, `mutation`) and `.github/workflows/frontend.yml` use
  `node-version: '20'`. The mutation job caches Stryker's incremental file keyed on the lockfile and the
  configs, with a 40-minute timeout.
- `npm audit`: 20 advisories (5 low, 6 moderate, 6 high, 3 critical).
- Registry facts used below: `vitest` 5.0.5 (2026-10-15) needs Node `^22.12 || ^24 || >=26` and peers
  `vite ^6.4 || ^7 || ^8`; `vite` 8.3.4 (2026-10-08) needs `^20.19 || >=22.12`; Stryker 10.0.0
  (2026-08-14) needs `>=22`; `@vitejs/plugin-react` 6.1.2 (2026-10-05) peers `vite ^8`;
  `@types/node` 22.20.5 (2026-10-01).

## Goals / Non-Goals

**Goals:**

- `npm audit --audit-level=high` exits `0` on a clean clone (spec `local-startup` → "A clean install
  reports no high or critical advisory").
- Same quality signal as before: same number of test files run by `npx vitest run`, same per-file
  environments, mutation score at or above 80, `npm run dev` serving the web through Vite 8.
- One Node baseline (22.12) for `engines`, CI and the guides.

**Non-Goals:** see `proposal.md` → Non-goals. Design-level additions: no product behaviour change
other than the hint text; no change to `packages/web/vite.config.ts` unless Vite 8 or plugin-react 6
require it; no new test runner feature adopted.

## Decisions

### D1. Scope includes `zod` and `markdown-it` (Enhanced D1, destination A)

Both appeared after the ticket was written, both are high, and `zod` ships in the product. Both are
fixed by `npm audit fix` without `--force` (zod 4.6.6 is inside `^4.6.5`), so they go in phase 1.

### D2. Node 22 baseline (Enhanced D2, destination A)

Vitest 5 and Stryker 10 refuse Node 20, and Node 20 has had no upstream security patches since April
2026. `engines.node` becomes `>=22.12` (Vitest's floor, which also covers Vite 8 and plugin-react 6),
every CI `setup-node` step requests `'22'`, and the guides ask for Node 22.12 or later. A new ADR
`docs/adr/20261026-node-22-baseline.md` records it (platform decision, costly to revert).
*Alternative rejected:* Vitest 4.1.12 + Vite 7 + Stryker 9.6.1, which still run on Node 20 but keep
the project on an unpatched runtime and postpone the same migration.

### D3. Only versions at least 7 days old (Enhanced D3, destination D)

`vite` 8.3.4 (not 8.3.5, 2026-10-21) and Stryker 10.0.0 (not 10.1.1, 2026-10-23, the version
`npm audit` proposes). Install with an exact version (`npm install <pkg>@<version>`), then
`npm audit --audit-level=high`. If neither version is flagged, nothing follows up.

### D4. `@vitejs/plugin-react` 6.1.2 (Enhanced D4, destination A)

4.x does not accept Vite 8. 6.1.2 lists `oxc-transform-react`, `@rolldown/plugin-babel` and
`babel-plugin-react-compiler` as peers; task 3.1 confirms from `peerDependenciesMeta` that they are
optional before installing. If one is required, it goes through the same package checks; if it fails
them, it is a clean stop.

### D5. Hook order follows Vitest's default (Enhanced D5, destination A)

Vitest 2 and later run the hooks of one suite in series (`sequence.hooks: 'stack'`). This is safer for
the transaction-per-test harness, so it is accepted; the note in `docs/project-context.md` ("Vitest 1.6
runs all hooks of one suite in parallel") is rewritten. A test that relied on parallel hooks is fixed
in this change.

### D6. One ticket, two phases (Enhanced D6, destination D)

Phase 1 (`npm audit fix`) is its own commit, verified with lint, typecheck, the full suite and
`test:a11y` before phase 2 starts. Phase 2 (major bumps, config migration, Node 22, docs) follows in
further commits of the same PR. CI red after two fixes is a clean stop of the ticket.

### D7. `npm warn deprecated` lines are debt (Enhanced D7, destination C)

They are not `npm audit` advisories. The lines printed by the phase 2 install (for example
`eslint@9.39.5` no longer supported) are listed in one Spanish checklist comment on DIS-105 and in
Follow-ups below.

### D8. Per-file environments move to `test.projects`

`poolMatchGlobs` and `environmentMatchGlobs` are replaced by `test.projects` in `vitest.config.ts`,
each project with `extends: true` so it inherits alias, `setupFiles`, `env`, timeouts and `exclude`:

| Project | `include` | `environment` | `pool` |
|---|---|---|---|
| `dom` | `packages/web/**/*.test.tsx`, `tests/a11y/**/*.{spec,test}.{ts,tsx}` | `jsdom` | default |
| `seed-build` | `tests/integration/cli/seed-build.spec.ts` | `node` | `forks` |
| `node` | Vitest's default include, minus the two sets above | `node` | default |

The exact include globs are taken from today's file list so the total is unchanged: the count of test
files from `npx vitest run` before and after is recorded (acceptance criterion 2). The design
references in the comments (DIS-58 D17, D18, D23, D26; DIS-91 D9; DIS-102 D12) stay. If Vite 8
deprecates the top-level `esbuild` option, `jsx: 'automatic'` moves to its documented equivalent
(`oxc`). *Alternative rejected:* a per-file `// @vitest-environment jsdom` comment in every
component and a11y test — it touches dozens of test files and a new file can forget it.

`vitest.stryker.config.ts`: `mergeConfig` merges the root `test.exclude`; whether projects with
`extends: true` see it is checked (a dry run lists no excluded file). If they do not, the exclusion
list is applied to each project, with exactly today's paths.

### D9. No `npm audit` gate in CI (destination C)

The new requirement is checked on a clean clone during this change. A CI gate would turn unrelated
PRs red the day an upstream advisory is published; whether to add one (and with what allowlist) is a
separate decision for the author. Recorded in Follow-ups and in the debt checklist comment.

### D10. The web hint says «Node 22+» (agent's decision, destination A)

`ProjectPickerPage.tsx` tells visitors which Node to install. After D2, «Node 20+» would be false, so
the `project-picker` requirement and its test change in this PR.

### D11. CI Node version is a tested requirement

The new `local-startup` requirement "CI runs on the supported Node baseline" is tested by a new spec
`tests/unit/ci/node-baseline.spec.ts` that parses both workflows with `yaml` (as
`tests/unit/ci/verify-job.spec.ts` does) and checks every `actions/setup-node` step.

### D12. Existing tests that change

Only tests whose requirement changes, each named in `tasks.md`:
`tests/unit/scripts/wiring.spec.ts` (the `engines.node` assertion at l.112, `>=20.11` → `>=22.12`)
and `packages/web/src/pages/ProjectPickerPage.test.tsx` (the hint text at l.421). Any other test the
migration breaks is fixed only as far as the migration requires, named in a task added through
`/opsx:update`, and listed in the step 7 report.

## Risks / Trade-offs

- [The `projects` split changes which files run] → count test files and tests before and after; the
  existing `web-foundation` scenario "Rendered output does not leak between tests" and the
  `seed-build` time-zone scenario must still pass.
- [Vitest 5 or Stryker 10 changes defaults that move results] (coverage analysis, isolation, timeout
  semantics) → read the migration notes of Vitest 2, 3, 4 and 5 and of Stryker 9 and 10 before
  editing; record each relevant change in the step 2 notes of the PR.
- [The first mutation run on CI is a full one] (the cache key includes the lockfile) → the job has
  40 minutes; on a timeout, one re-run, then raise `timeout-minutes` with its reason.
- [An advisory without a fix appears during the change] → listed in Follow-ups with its destination;
  high or critical stops the ticket (autonomous contract).
- [Contributors on Node 20 can no longer install cleanly] → that is the intent of D2; the guides,
  the readme and the ADR say it.
- [`packages/cli/src/seed/fingerprint.ts` comment says `Dirent.parentPath` needs Node 20.12] → still
  true; simplifying that code is out of scope (Follow-ups, D).

## Migration Plan

1. Phase 1 commit: `npm audit fix`, verification. 2. Phase 2 commits: dependency bumps, config
migration, Node 22 in `engines` and CI, hint text, docs and ADR. Rollback: revert the PR; the
lockfile returns with it. Contributors switch to Node 22.12 or later before `npm ci`.

## Follow-ups

| Id | Finding / decision | Destination |
|---|---|---|
| D1 | `zod` and `markdown-it` added to scope | **A** — fixed in phase 1 |
| D2 | Node 22 baseline | **A** — this change, with ADR |
| D3 | vite 8.3.5 and Stryker 10.1.1 skipped for age | **D** — no follow-up unless `npm audit` flags 8.3.4 or 10.0.0 |
| D4 | `@vitejs/plugin-react` 6.1.2 added | **A** — this change |
| D5 | Hooks run in series | **A** — project-context note updated here |
| D6 | One ticket, two phases | **D** |
| D7 | `npm warn deprecated` lines (e.g. `eslint@9.39.5`) | **C** — Spanish checklist comment on DIS-105 (list completed after the phase 2 install) |
| D9 | No `npm audit` gate in CI | **C** — same checklist comment on DIS-105 |
| D10 | Hint text «Node 22+» | **A** — this change |
| R1 | `fingerprint.ts` could use `readdir({ recursive })` on Node 22 | **D** — comment stays true; no behaviour gain |
