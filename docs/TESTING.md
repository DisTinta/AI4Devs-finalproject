# Testing

Tests are part of the definition of done of every ticket (`readme.md` §2.6). This page lists the
levels that exist today, how to run each one locally and which CI job runs it. The details agents
need (the integration harness, the mutation set-up, the gotchas) are in `docs/project-context.md` →
Testing; CI is described in `docs/DEPLOYMENT.md`.

## Levels

| Level | Command | Where | CI job |
|---|---|---|---|
| Architecture | `npm run lint:architecture` | `.dependency-cruiser.cjs`: `core` imports no adapter, analyzer nor `api` | `CI` → `quality` |
| Unit | `npx vitest run tests/unit` | `tests/unit/` (doubles in `tests/support/`) | `CI` → `quality`; `Frontend` |
| Integration | `npm test` with `DATABASE_URL` (below) | `tests/integration/`, harness in `tests/integration/helpers/db.ts` | `CI` → `quality`, on its own `test` database |
| Mutation | `npm run test:mutation` | `stryker.config.json`: mutates `packages/core`, `packages/cli` and `packages/api` sources against the unit specs (`vitest.stryker.config.ts`) | `CI` → `mutation`, fails under a score of 80 |
| Smoke | `npm run verify` | `packages/cli/src/verify.ts`, golden answers in `seeds/cache/` | `CI` → `verify`, on its own `verify` database |
| Static | `npm run lint`, `npm run typecheck` | ESLint and `tsc` over the workspaces and `tests/` | `CI` → `quality`; `Frontend` |
| Documentation | `npm run docs:coverage` | TypeDoc fails on an undocumented export | Local only |
| Secrets | `gitleaks dir . --config .gitleaks.toml` (gitleaks installed) | `.gitleaks.toml`, `.gitleaksignore` | `CI` → `secrets` |
| Accessibility | `npm run test:a11y`: **not defined yet** | `tests/a11y/smoke.example.tsx` is a template, not run | `Frontend` prints a warning; arrives with the web scaffold (DIS-58) |
| End to end | **Not available yet**: Playwright arrives with CM-HU-21 (DIS-75) | `tests/e2e/` is empty | None yet |

## The whole suite

`npm test` runs `vitest run`, unit and integration together. The integration specs need PostgreSQL:
without `DATABASE_URL` they are skipped with a warning locally (`WARNING: DATABASE_URL is not set —
skipping database integration tests…`), and in CI they fail instead of skipping. Point them at a
**database of their own**, never the one `make up` seeded: the harness migrates it and runs each test
in a transaction it rolls back, and some specs assume it holds no seed.

```bash
docker compose exec postgres createdb -U codemind codemind_test
export DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind_test
npm test
```

The last lines of a run (2026-10-17, commit `b9026be`, Windows 11, Node v24.11.1):

```text
 Test Files  137 passed (137)
      Tests  1599 passed (1599)
   Start at  18:23:11
   Duration  132.94s (transform 15.08s, setup 27ms, collect 160.77s, tests 625.11s, environment 75ms, prepare 53.01s)
```

Durations change with the machine. A test file alone runs with `npx vitest run <pattern>`.

**A known race.** `tests/integration/cli/ask-command.spec.ts` (“answers through the default pool…”)
commits a project outside the harness transaction for a moment, and Vitest runs integration files in
parallel. If `tests/integration/cli/projects-command.spec.ts` lists the projects in that moment, it
sees one more (`ask-pool-…`) and fails. It happened once in the three local runs of 2026-10-17; the
rerun passed. Rerun before suspecting a change.

## Smoke check

`npm run verify` needs the seeded database instead (on the database of `docs/DEMO.md`):

```bash
export DATABASE_URL=postgresql://codemind:codemind@localhost:5432/codemind
npm run verify; echo "exit: $?"
```

```text

> codemind@0.0.1 verify
> tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/verify.ts

✓ acme-shop Q1 ¿Cómo se calcula el precio final de un pedido?
✓ acme-shop Q3 ¿Cómo se validan los cupones?
✓ acme-shop Q4 ¿Qué hace OrderObserver al crear un pedido?
acme-shop: 3/3 golden answers match
exit: 0
```

What each failure code means and how to fix it is in `docs/DEPLOYMENT.md` → Verifying an
installation.

## Mutation testing

`npm run test:mutation` runs Stryker incrementally: only mutants whose code or covering tests changed
run again, the rest reuse `reports/stryker-incremental.json`. `npm run test:mutation:full` runs every
mutant. The break threshold is a score of 80 (`thresholds.break`); coverage is not a gate. A single
file runs with `npx stryker run --mutate <path>`. Integration specs are not part of it: they need a
database or spawn processes.
