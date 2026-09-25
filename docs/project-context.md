---
description: What this project is, the real commands, and the things an agent cannot infer from the code.
alwaysApply: true
---

# Project Context — Codemind

> This is the ONE file you write by hand. Everything else in `docs/` is doctrine that the kit
> replaces on update; this file is yours and survives updates.
>
> **Size rule: under 200 lines.** If it grows, split it per subdirectory. Prune test for every line:
> "would removing this cause an error?" If not, remove it.
>
> Write it in English (see `base-standards.md` §2).

## What this is

Codemind indexes a PHP/Laravel or TypeScript repository and builds a knowledge graph from four
sources (code, Git history, tests, docs) to answer "how does this part work" and "what breaks if I
change it", with verified citations. It is a TypeScript npm-workspaces monorepo: a hexagonal `core`,
per-language analyzers, infrastructure adapters (Postgres+pgvector, LLM, Git), a Fastify API, a
Commander CLI and a React+Vite web.

## Commands

Verified against `package.json` (root and per package). If a command is not here, it does not exist
— do not invent one.

- Development environment: `npm run dev` (root) — runs `packages/api` + `packages/web` via
  `concurrently`, kills all on first failure.
- Tests (full): `npm test` or `npx vitest run` (root `vitest.config.ts`). `fixtures/**` is excluded
  and `passWithNoTests` is on, so a green run may mean **zero tests ran**.
- A subset of tests: `npx vitest run <pattern>` — prefer this over the full suite.
- Type check: `npm run typecheck` (root) — `tsc --build` over project references + a separate
  `--noEmit` pass on `packages/web`.
- Architecture rule: `npm run lint:architecture` (root) — dependency-cruiser over `packages` using
  `.dependency-cruiser.cjs` (the single config; CI runs the same file).
- Lint: `npm run lint` (root) — ESLint flat config (`eslint.config.mjs`), `@eslint/js` +
  `typescript-eslint` recommended. Empty port interfaces are downgraded to warnings; `.cjs`, `dist`,
  `.claude`, `.cursor`, `fixtures` are ignored.
- Mutation testing: `npx stryker run` (`stryker.config.json`, targets `packages/core/src`). CI guards
  it: it only runs once test files exist, otherwise it prints a warning and skips (Stryker's dry run
  fails with zero tests, and faking a test to force it green defeats the gate).
- Docs coverage: `npm run docs:coverage` (or `npx typedoc --validation.notDocumented --logLevel Warn`)
  — TypeDoc over the backend packages via root `typedoc.json`. HTML lands in `docs/api/` (gitignored).
  `CMD_DOCS_COVERAGE` in `.claude/sdd-harness.env` points here. `packages/web` is out of scope (React
  UI, not the API surface). As the public surface grows, undocumented exports fail this gate.
- CLI: `npm run cli` (root) — `tsx packages/cli/src/index.ts`.
- Migrations / rollback / seed / verify are **placeholders**: `npm run db:migrate`, `db:rollback`,
  `db:seed`, `seed:build`, `verify` print a "pending Ticket …" message and exit 0. They do nothing yet.
- Local stack: `docker compose up -d` starts Postgres (`pgvector/pgvector:pg16`) on `5432`. On
  Windows, `make up` needs Git Bash/WSL; in native PowerShell run the `npm` scripts directly.

## Testing

- Framework: Vitest (root `vitest.config.ts`; no per-package vitest config yet).
- Test locations: `tests/{unit,integration,e2e,a11y}` (currently only `.gitkeep` +
  `tests/a11y/smoke.example.tsx`) and co-located package sources. Real suites are not written yet.
- No test-database isolation exists yet. CI and `.env.example` point `DATABASE_URL` at the same
  Postgres; the isolation strategy is not implemented (Ticket 3).
- Test data comes from `fixtures/` (`acme-shop`, `task-api`, `history`, `build-history.mjs`) and
  `seeds/graph-dump.sql`. `fixtures/**` is excluded from Vitest collection.

## Branch and ticket conventions

- Branch naming: `feature/<slug>` (current: `feature/entrega-2-CRN`).
- Ticket id: work will be tracked in **Linear** (not yet configured). Until Linear is live, "Ticket N"
  references in code/docs are internal notes, **not** valid ticket ids per `base-standards.md` §2
  (`[A-Z][A-Z0-9]+-[0-9]+`); treat commits as no-ticket (scope = capability/layer). Once Linear is
  set up, record its key prefix here and use the ticket id as the commit scope.
- Base branch: `main`.

## Operational constraints

- Never commit `.env` or any secret. Copy `.env.example` → `.env` for local values.
- LLM config is optional: empty `LLM_API_KEY` + `LLM_BASE_URL` = evaluation mode (cache/golden only,
  no model calls, 0 €). Ollama is the reference local provider; no paid vendor is assumed.
- `ALLOWED_REPOS_DIR` empty = indexing disabled (fixtures-only mode). Indexing only runs inside that
  root.
- Specs and changes live under `openspec/` (initialized; `openspec/config.yaml` injects kit
  doctrine). Create or edit them only through the OpenSpec flow (`/opsx:*` or kit prompts/skills).
  Do not rewrite `openspec/specs/` during apply except a deliberate sync/archive.
- Do not add dependencies without justifying them in the pull request.
- Do not force-push. Ever.
- Do not edit migrations already applied on the base branch: create a new one.
- Respect the hexagonal boundary: `packages/core` must not import infrastructure. This is enforced by
  dependency-cruiser in CI, not just convention.

## Gotchas

What the model does NOT know by default about this project: non-obvious behaviour, known traps,
services that must be started first, quirks of the local environment.

- **Some CI gates run against stubs, on purpose.** `lint`, `lint:architecture` and `typecheck` are
  real and must pass. `db:migrate`/`db:rollback` are stubs that exit 0 (CI's apply/rollback/apply
  sequence is a no-op until Ticket 3). Mutation testing skips itself until the first test exists.
  These are intentional scaffolding, not bugs — do not "fix" a stub by faking behaviour.
- **The infra packages are stubs, not empty.** All 9 workspaces (`core`, `analyzers/{php,typescript}`,
  `adapters/{store-postgres,llm,git}`, `api`, `cli`, `web`) have a `package.json` and a `src/index.ts`,
  but the analyzer/adapter ones are empty stubs (dependency-cruiser flags them as `no-orphans` warns).
  They resolve in `npm ls`; do not expect real behaviour from them yet.
- **Vitest can report success with no tests** (`passWithNoTests: true`). A green suite is not
  evidence that behaviour is covered.
- **The repo is mid-build (Entrega 2).** `db:migrate`/`db:seed`/`seed:build`/`verify` are
  placeholders; `make up` runs them but they no-op. Do not assume a working end-to-end flow exists.
- **OpenSpec native skills are not under `ai-specs/`.** After `openspec init`, `/opsx:*` skills live
  in `.claude/skills/openspec-*` and `.cursor/skills/openspec-*`. Do not delete them on sync; they
  coexist with kit skills.
