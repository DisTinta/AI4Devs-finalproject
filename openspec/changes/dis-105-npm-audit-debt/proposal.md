## Why

`npm install` on a clean clone prints `20 vulnerabilities (5 low, 6 moderate, 6 high, 3 critical)` (the
ticket counted 18; `zod` <4.6.6 and `markdown-it` <14.3.3 were published after it). `docs/DEMO.md` →
`Paso 0` shows that line to whoever evaluates the project, and `zod` is a runtime dependency of core,
api, cli and the LLM adapter. The fixes for Vitest, Vite and Stryker need versions that no longer run
on Node 20, which lost upstream support in April 2026. DIS-105 (no parent issue) was left for
Entrega 3 on purpose, so the Entrega 2 demo would not change right before delivery.

## What Changes

Delivered in one pull request with two phases, each in its own commit and verified on its own.

- **Phase 1, no major bumps:** `npm audit fix` without `--force` (lockfile, and ranges inside the same
  major if npm decides so). Closes `brace-expansion`, `fast-uri`, `shell-quote`, `source-map-js`,
  `markdown-it` and `zod` (4.6.6, inside `^4.6.5`).
- **Phase 2, major bumps and Node 22:**
  - root devDependencies: `vitest` `^5.0.5`, `@stryker-mutator/core` and
    `@stryker-mutator/vitest-runner` `^10.0.0`, `@types/node` `^22.20.5`, and `vite` `^8.3.4`
    declared in the root (Vitest 5 peer, one copy);
  - `packages/web`: `vite` `^8.3.4`, `@vitejs/plugin-react` `^6.1.2` (4.x does not accept Vite 8);
  - `vitest.config.ts`: `poolMatchGlobs` and `environmentMatchGlobs` (removed in Vitest 4) replaced by
    `test.projects`, keeping today's environments per file; `vitest.stryker.config.ts` keeps excluding
    exactly today's paths; `stryker.config.json` reviewed against the Stryker 9 and 10 migration notes,
    thresholds unchanged;
  - **BREAKING (contributors):** `engines.node` becomes `>=22.12`; CI uses Node 22 in every job;
  - the web's indexing hint says «Node 22.12+» instead of «Node 20+», the same floor as
    `engines.node` (design D10, decided by the agent).
- Documentation: `docs/DEMO.md` (Node requirement and a fresh capture of the `Paso 0` install output),
  `docs/DEPLOYMENT.md`, `docs/backend-standards.md`, `docs/project-context.md` (engines line and the
  hook-order note: Vitest 2 and later run hooks in series), `readme.md`, the comment of
  `scripts/env.mjs`, and a new ADR `docs/adr/20261026-node-22-baseline.md`.

### Non-goals

- Upgrading ESLint, `typescript-eslint`, TypeScript, React, Fastify or anything `npm audit` does not
  flag. `npm warn deprecated` lines (for example `eslint@9.39.5`) are recorded as debt (design D7).
- Changing the mutation threshold, Stryker's `mutate` or the test exclusion lists.
- Approving or changing npm `install-scripts`; only their warning is captured again in `DEMO.md`.
- Rewriting tests to use new Vitest 5 APIs: only the tests the migration breaks are touched.
- Adding an `npm audit` gate to CI (design D9).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `local-startup`: requirement "Which commands load .env" pins `engines.node` to `>=22.12` instead of
  `>=20.11`; new requirements "CI runs on the supported Node baseline" (every `setup-node` step of the
  CI workflows uses Node 22) and "A clean install reports no high or critical advisory" (checked on a
  clean clone, not in CI).
- `project-picker`: requirement "Indexing a repository of one's own is a hint, not a control" says
  «Node 22.12+» instead of «Node 20+».

`engines.node` stays `>=22.12`, as the ticket's acceptance criterion 5 says; it also admits Node 23
and 25, which are out of support and which Vitest 5 does not list (design D2).

`web-foundation` → "Component test environment" does not change: the same files run in jsdom, and
the migration must keep it that way (its existing scenarios are part of the verification).

## Impact

- **Dependencies:** root and `packages/web` `package.json`, `package-lock.json`. Every new package
  version passes the package checks of the autonomous run (exact name, at least 7 days old,
  repository, downloads, install scripts, `npm audit --audit-level=high`).
- **Test tooling:** `vitest.config.ts`, `vitest.stryker.config.ts`, `stryker.config.json`, possibly
  `tests/support/jsdom-setup.ts`; `packages/web/vite.config.ts` only if Vite 8 or plugin-react 6
  require it.
- **CI:** `.github/workflows/ci.yml` (`quality`, `verify`, `mutation`) and
  `.github/workflows/frontend.yml` move to Node 22. The Stryker incremental cache key includes the
  lockfile, so the first mutation run of the PR is a full one (40-minute job limit).
- **Existing tests that change:** `tests/unit/scripts/wiring.spec.ts` (engines assertion and the
  comment above it at l.111), `packages/web/src/pages/ProjectPickerPage.test.tsx` (hint text) and
  `tests/unit/analyzers/php/parser-load.spec.ts` (the comment on Vitest 1.6 mock semantics; its code
  only if it fails under Vitest 5).
- **Product code:** only the hint text in `packages/web/src/pages/ProjectPickerPage.tsx`. No API,
  CLI or database behaviour changes. No personal data, auth or logging is touched.
- Commands as listed in `docs/project-context.md` and `.claude/sdd-harness.env`.
