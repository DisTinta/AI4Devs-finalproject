# The project's Node baseline is 22.12, in `engines`, in CI and in every guide

## Status
Accepted. Supersedes the Node line of
[`20260928-node-pg-migrate-sql-migrations.md`](./20260928-node-pg-migrate-sql-migrations.md)
("Node ≥ 20.11; CI uses Node 20"); the rest of that record stands.

## Context and problem
*Agent's text, written in an autonomous run (DIS-105, 2026-10-27).*

`npm audit` reported 20 advisories on `final-project-CRN` (5 low, 6 moderate, 6 high, 3 critical).
Most of the dev-tool ones (`vite`, `vitest`, `esbuild`, Stryker's dependencies) have their fix only in
a new major: `vite` 8.3.4 needs Node `^20.19 || >=22.12`, `@stryker-mutator/core` 10.0.0 needs Node 22
or later, and `vitest` 4.1.12 is the line that Stryker 10 can mutate (Vitest 5.0.5 also needs Node
`^22.12 || ^24 || >=26`, but Stryker 10.0.0 kills no mutant under it; DIS-105 design D16). The project declared
`engines.node` `>=20.11` and CI ran on Node 20, a line that has had no upstream security patches since
April 2026. A clean install had to reach `npm audit --audit-level=high` with exit `0` (ticket DIS-105),
and that was not possible on Node 20 without staying on majors that are themselves unfixed.

## Options considered
* **Stay on Node 20** with Vite 7 and Stryker 9.6.1: they still run on Node 20, but the
  project keeps an unpatched runtime and postpones the same migration.
* **Node 22.12 or later** with Vitest 4.1, Vite 8 and Stryker 10, with `engines.node` `>=22.12`.
* **Node 24 only:** the newest LTS, but it forces every contributor to a line that most
  machines do not have yet, for no tool that requires it.

## Decision
We choose **Node 22.12 as the baseline** because:
* It is the lower bound of Vite 8's range on Node 22 and the first Node 22 with `require(esm)` enabled
  by default; every tool of the chain (Vitest 4.1, Vite 8, plugin-react 6, Stryker 10) accepts it.
* It is an LTS line still under upstream support, as is 24; the guides say "Node 22.12 or later, an
  LTS line (22 or 24)" and every CI `setup-node` step requests `'22'`. A test
  (`tests/unit/ci/node-baseline.spec.ts`) keeps `engines.node` and the workflows aligned.
* It matches the ticket's acceptance criterion and costs contributors one runtime upgrade, instead of
  a second migration later.

## Consequences
* `engines.node` is `>=22.12`. That range also accepts Node 23 and 25, odd releases already out of
  support; npm only warns on an engines mismatch (the repository has no
  `engine-strict`), so a tighter range would block nobody and diverge from the guides. Accepted.
* Contributors on Node 20 can no longer install cleanly: the readme, `docs/DEMO.md`, `docs/DEPLOYMENT.md`
  and the hint of Screen 1 («Node 22.12+») say so.
* `scripts/env.mjs` stays the only `.env` reader of the start-up tooling, even though Node 22.12 ships
  `process.loadEnvFile`: it implements the grammar of the `local-startup` spec, honours
  `CODEMIND_SKIP_DOTENV` and warns once per process, and Node's parser accepts a different grammar.
* The first mutation run in CI after the lockfile change is a full one (the incremental cache key
  includes the lockfile).
* No `npm audit` gate is added to CI: it would turn unrelated PRs red the day an upstream advisory is
  published. That is a separate decision for the author.
