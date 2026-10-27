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
- Registry facts used below (the Vitest line was first planned as 5.0.5, see D16): `vitest` 4.1.12
  (2026-10-15) needs Node `^20 || ^22 || >=24` and peers `vite ^6 || ^7 || ^8`; `vite` 8.3.4 (2026-10-08) needs `^20.19 || >=22.12`; Stryker 10.0.0
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

Stryker 10 refuses Node 20 (`>=22`), Vite 8 needs `^20.19 || >=22.12`, and Node 20 has had no upstream
security patches since April 2026. `engines.node` becomes `>=22.12`, as the ticket's acceptance
criterion 5 says. That is the lower bound of Vite 8's range on Node 22 and the first Node 22 with
`require(esm)` on by default; it also covers plugin-react 6 and Stryker 10, but it **accepts Node 23
and 25**. *Agent's decision (audit Q2, destination D):* `engines.node` stays
`>=22.12`. Node 23 and 25 are odd, non-LTS releases already out of upstream support; npm only warns
on an engines mismatch (no `engine-strict` in the repository), so a wider `engines` range would block
nobody, while a three-part range would diverge from the ticket and from every guide. The guides ask
for "Node 22.12 or later, an LTS line (22 or 24)". Every CI `setup-node` step requests `'22'`. A new
ADR `docs/adr/20261026-node-22-baseline.md` records it (platform decision, costly to revert).
*Alternative rejected:* Vite 7 + Stryker 9.6.1, which still run on Node 20 but keep
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

Vitest 2 and later run the hooks of one suite in series (`sequence.hooks: 'stack'`): the hooks of one
suite run one after another in declaration order (`afterEach` in reverse), so a `beforeEach` declared
after `useTransactionPerTest()` runs inside the open transaction instead of racing it
(`docs/project-context.md` l.427–437). It is accepted; the note in `docs/project-context.md` ("Vitest 1.6
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
| `node` | Vitest's default include, minus the two sets above (see `exclude` below) | `node` | default |

Each project's `include` and `exclude`:

- `dom`: `include` as in the table; no `exclude` of its own.
- `seed-build`: `include` as in the table; no `exclude` of its own.
- `node`: no `include` of its own (Vitest's default); `exclude` lists, explicitly, the three root globs
  (`fixtures/**`, `node_modules/**`, `.stryker-tmp/**`) **plus** the `dom` and `seed-build` include
  globs. Under `extends: true` Vitest merges the project over the root config with Vite's
  `mergeConfig`, which concatenates arrays; because the `node` project restates the root globs, its
  effective `exclude` is the same whether the arrays are concatenated or replaced (a repeated glob is
  harmless). The `dom` and `seed-build` projects inherit the root `exclude` through the same merge.
- No file belongs to two projects, and the per-project file lists add up to the 0.4 total (task 4.5).

CLI filters MUST still reach every project: `--exclude 'tests/integration/**'` in
`.github/workflows/frontend.yml:63` (the Frontend job runs with `CI` set and no `DATABASE_URL`, and
`tests/integration/cli/seed-build.spec.ts` imports `tests/integration/helpers/db.ts`, which throws on
import there) and the file list of the hook-timing step in `.github/workflows/ci.yml:147` (exactly its
four `tests/harness/` files). Both are checked in task 4.5. If the CLI `--exclude` does not reach a
project, the Frontend step gets the smallest change that restores today's file set (named in an
`/opsx:update` task, with the `frontend.yml` comment updated), never a change to the spec under test.

The exact include globs are taken from today's file list so the total is unchanged: the count of test
files from `npx vitest run` before and after is recorded (acceptance criterion 2). The design
references in the comments (DIS-58 D17, D18, D23, D26; DIS-91 D9; DIS-102 D12) stay. If Vite 8
deprecates the top-level `esbuild` option, `jsx: 'automatic'` moves to its documented equivalent
(`oxc`). *Alternative rejected:* a per-file `// @vitest-environment jsdom` comment in every
component and a11y test — it touches dozens of test files and a new file can forget it.

`vitest.stryker.config.ts`: `mergeConfig` merges the root `test.exclude`; whether projects with
`extends: true` see it is checked: listing the files of every project (`dom`, `seed-build`, `node`)
under `--config vitest.stryker.config.ts` shows none of the nine excluded globs of that file
(`tests/integration/**`, the four linear/scaling specs, `packages/web/**`, `tests/a11y/**`,
`tests/unit/web/**`, `tests/harness/**`). If they do not, the exclusion list is applied to each
project, with exactly today's paths. Whether `@stryker-mutator/vitest-runner` 10 supports
`test.projects` at all is confirmed from its notes in task 2.3 before editing (Risks).

### D9. No `npm audit` gate in CI (destination C)

The new requirement is checked on a clean clone during this change. A CI gate would turn unrelated
PRs red the day an upstream advisory is published; whether to add one (and with what allowlist) is a
separate decision for the author. Recorded in Follow-ups and in the debt checklist comment.

### D10. The web hint says «Node 22.12+» (agent's decision, destination A)

`ProjectPickerPage.tsx` tells visitors which Node to install. After D2, «Node 20+» would be false, so
the `project-picker` requirement and its test change in this PR. *Agent's decision (audit Q1):* the
added scope is kept, since leaving a false requirement on Screen 1 contradicts acceptance criterion 5
(every guide asks for Node 22.12 or later); the hint says «Node 22.12+», the same floor as
`engines.node`, because a visitor on Node 22.0–22.11 who read «Node 22+» still could not install.

### D11. CI Node version is a tested requirement

The new `local-startup` requirement "CI runs on the supported Node baseline" is tested by a new spec
`tests/unit/ci/node-baseline.spec.ts` that parses both workflows with `yaml` (as
`tests/unit/ci/verify-job.spec.ts` does) and checks every `actions/setup-node` step.

### D12. Existing tests that change

Only tests whose requirement changes, each named in `tasks.md`:
`tests/unit/scripts/wiring.spec.ts` (the `engines.node` assertion at l.112, `>=20.11` → `>=22.12`,
and the comment above it at l.111, which today reads "engines unchanged, no Node .env API that the
supported versions lack" and becomes false on both counts),
`packages/web/src/pages/ProjectPickerPage.test.tsx` (the hint text at l.421) and
`tests/unit/analyzers/php/parser-load.spec.ts` (the comment at l.19–21 that describes Vitest 1.6
`mockClear`/`mockReset` semantics; its code changes only if the run under Vitest 4 fails). Any other
test the migration breaks is fixed only as far as the migration requires, named in a task added
through `/opsx:update`, and listed in the step 7 report.

*Agent's decision (audit Q3, destination D): the prohibition of `process.loadEnvFile`,
`util.parseEnv` and `--env-file` in `scripts/` stays, with a new reason.* Every Node ≥22.12 has those
APIs, so "the supported versions lack them" no longer holds. The prohibition is kept because
`scripts/env.mjs` is the one `.env` reader of the start-up tooling: it implements the grammar that
`local-startup` → "The .env file grammar" specifies (Node's parser accepts a different grammar, for
example multi-line values), honours the `CODEMIND_SKIP_DOTENV` switch the test suite relies on (DIS-102
D12) and prints its warning at most once per process; a second reader would let two grammars and two
behaviours coexist. The comment at l.111 becomes "Assert: engines on the Node 22.12 baseline; one .env
reader (`scripts/env.mjs`), never Node's own .env APIs", and the comment of `scripts/env.mjs` names
the same reason and `>=22.12`.

### D16. Vitest 4.1.12, not 5.0.5 (agent's decision, found by the first full mutation run, destination A)

The change was planned on Vitest 5.0.5. The full mutation run of task 7.4 under Vitest 5.0.5 with
`@stryker-mutator/vitest-runner` 10.0.0 killed almost no mutant: after 2,987 mutants, 2,924 had survived,
and a run restricted to `packages/core/src/knowledge/confidence.ts` scored 9.86 % (7 killed, 64 survived,
for example `if (true) throw …` survived with the covering tests passing), against 97.18 % for the same
file under Vitest 4.1.12, with the same `vitest.stryker.config.ts` and the `test.projects` kept (a flattened
single-project config gave 9.86 % under Vitest 5 too, so the projects are not the cause). Stryker 10.0.0
(2026-08-14) predates Vitest 5.0.0 (2026-09-03) and does not activate its mutants under it. *Decision:*
`vitest` `^4.1.12` (2026-10-15, 12 days old, peers `vite ^6 || ^7 || ^8`, 0 advisories), Stryker stays 10.0.0
and Vite 8.3.4. Everything else of D8 holds: `test.projects` exists in Vitest 4, and the CLI `--exclude` still
does not reach the projects (D14) and the default reporter still hides the warning (D15), both re-checked
under 4.1.12. The Node baseline (D2) stays `>=22.12`. A later move to Vitest 5 waits for a Stryker release
that supports it (Follow-ups, R3). *Alternative rejected:* keep Vitest 5 and lower the mutation
gate (it would give up the signal the ticket asks to keep, acceptance criterion 2).

## Risks / Trade-offs

- [The `projects` split changes which files run] → count test files and tests before and after; the
  existing `web-foundation` scenario "Rendered output does not leak between tests" and the
  `seed-build` time-zone scenario must still pass.
- [Vitest 4 or Stryker 10 changes defaults that move results] (coverage analysis, isolation, timeout
  semantics) → read the migration notes of Vitest 2, 3, 4 and 5 and of Stryker 9 and 10 before
  editing; record each relevant change in the step 2 notes of the PR.
- [Mock semantics changed after Vitest 1.6] (`mockReset` restores the original implementation
  instead of dropping it) → `tests/unit/analyzers/php/parser-load.spec.ts` and
  `docs/project-context.md` l.1444–1445 are re-checked against the Vitest migration notes (task 2.1);
  a test that still passes while asserting something else is a finding of this change.
- [`@stryker-mutator/vitest-runner` 10 and `test.projects`] → support confirmed in task 2.3 before
  editing; otherwise `vitest.stryker.config.ts` flattens to a single project (`node` environment,
  Stryker's exclusions unchanged), since Stryker loads no jsdom test anyway (DIS-58 D25).
- [The first mutation run on CI is a full one] (the cache key includes the lockfile) → the job has
  40 minutes; on a timeout, one re-run, then raise `timeout-minutes` of the `mutation` job from 40 to
  60, with the reason in a comment next to it.
- [An advisory without a fix appears during the change] → listed in Follow-ups with its destination;
  high or critical stops the ticket (autonomous contract).
- [Contributors on Node 20 can no longer install cleanly] → that is the intent of D2; the guides,
  the readme and the ADR say it.
- [`packages/cli/src/seed/fingerprint.ts` comment says `Dirent.parentPath` needs Node 20.12] → still
  true; simplifying that code is out of scope (Follow-ups, D).

## Migration Plan

1. Phase 1 commit: `npm audit fix`, verification. 2. Phase 2 code commit (dependency bumps, config
migration, Node 22 in `engines` and CI, hint text), pushed **before** the clean-clone checks of steps
8 and 9 so the clone holds it. 3. Documentation, ADR and report commits. Rollback: revert the PR; the
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
| D10 | Hint text «Node 22.12+» (agent's decision on audit Q1: added scope kept, floor matches `engines.node`) | **A** — this change |
| Q2 | Agent's decision: `engines.node` stays `>=22.12` (ticket AC5); Node 23 and 25 are accepted by `engines` but out of support; guides ask for an LTS line, 22.12+ or 24 (design D2) | **D** — no follow-up |
| Q3 | Agent's decision: the `process.loadEnvFile` / `util.parseEnv` / `--env-file` prohibition in `scripts/` stays, with the new reason "one .env reader and one grammar" (design D12); the comment at `wiring.spec.ts:111` and in `scripts/env.mjs` is rewritten | **D** — no follow-up |
| A1 | Spec audit run 1 corrections (phase 2 commit before the clean clone, e2e restoration, CLI filters and Stryker exclusions across projects, `fixAvailable: false` clause, `Paso 0` capture) | **A** — applied to this change in correction round 1 |
| D13 | Agent's decision: zod 4.6.7 (the security fix of phase 1) reports one `too_big` issue for an array above its maximum instead of validating every element, so the test "The issues of an event are bounded" in `tests/unit/explain/statement-schema.spec.ts` changes its fixture (20 empty statements, 40 issues) and the old fixture becomes a new test of the one-issue `limit_exceeded` case; production code unchanged (the quarantine is stricter and cheaper: no per-element issues for an oversized array) | **A** — this change (task 1.2a) |
| D14 | Agent's decision (task 4.5, the design D8 fallback): with Vitest 4 and later (seen on 5.0.5, re-checked on 4.1.12) the CLI `--exclude 'tests/integration/**'` of `frontend.yml` does not reach the `test.projects` (29 integration files failed on import without `DATABASE_URL`); the Frontend step runs `npx vitest run tests/unit tests/harness tests/a11y packages/web` (positional filters do reach the projects: 164 files, the 196 of the baseline minus the 32 integration files); the comment of the step explains it, and `docs/DEPLOYMENT.md` l.71 and `docs/project-context.md` l.1271 name the new command | **A** — this change (task 4.5a) |
| D15 | Agent's decision: the default reporter of Vitest 4.1 and later (seen on 5.0.5, re-checked on 4.1.12) hides the `console.warn` of a file whose tests are all skipped, so the "DATABASE_URL is not set" warning of `tests/integration/helpers/db.ts` is written with `fs.writeSync(2, …)` (not intercepted); the gate spec is unchanged | **A** — this change (task 4.6a) |
| D16 | Agent's decision: Vitest 4.1.12 instead of 5.0.5, because Stryker 10.0.0 kills almost no mutant under Vitest 5 (9.86 % against 97.18 % on one file); see design D16 | **A** — this change (task 3.5) |
| R3 | Move to Vitest 5 once a Stryker release supports it (check the release notes of `@stryker-mutator/vitest-runner` after 10.1.1) | **C** — checklist comment on DIS-105 |
| R2 | The comments and the error text of `tests/integration/helpers/db.ts` (`useTransactionPerTest`) still say that Vitest 1.x runs one suite's hooks in parallel | **C** — checklist comment on DIS-105 (the text of a thrown error and its tests are outside this change) |
| R1 | `fingerprint.ts` could use `readdir({ recursive })` on Node 22 | **D** — comment stays true; no behaviour gain |
