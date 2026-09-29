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

## Sources of truth

Do not invent product facts from memory. Prefer these files:

- `readme.md` — product and design (canonical delivery doc)
- `prompts.md` — AI usage log (literals + human adjustments)
- `proposal-codemind/05-propuesta-v4-evidencia-local-hibrido-ollama.md` — evidence/LLM operational
  amendment (proposal `04` is historical on those points)
- This file — commands, constraints and agent gotchas

## Closed product decisions (2026-09-05)

Agents must not reopen these or invent a different hosting/vendor without an explicit author decision:

1. **Evidence is local only.** No hosted web demo. No “Option B” video. Evaluators run `make up` +
   `docs/DEMO.md` + `npm run verify` (golden/cache, no live LLM required).
2. **Hybrid LLM + Ollama.** `LLM_API_KEY` / `LLM_BASE_URL` are optional. Empty → evaluation mode
   (cache/golden only, 0 €). Set → free-form answers; default local path is Ollama (OpenAI-compatible
   base URL). A paid cloud vendor is not required.
3. **“Deployment” (Entrega 3)** means reproducible Compose + CI + `verify`, not a public PaaS/VPS.

Ollama need not be installed until the Context Engine / live-LLM work; `.env.example` already matches
the empty-key evaluation default.

## Commands

Verified against `package.json` (root and per package). If a command is not here, it does not exist
— do not invent one.

- Development environment: `npm run dev` (root) — runs `packages/api` + `packages/web` via
  `concurrently`, kills all on first failure.
- Tests (full): `npm test` or `npx vitest run` (root `vitest.config.ts`). `fixtures/**` is excluded
  and `passWithNoTests` is on, so a green run may mean **zero tests ran**.
- A subset of tests: `npx vitest run <pattern>` — prefer this over the full suite.
- Type check: `npm run typecheck` (root) — `tsc --build` over project references + a separate
  `--noEmit` pass on `packages/web` + `tsc -p tests/tsconfig.json` for the root `tests/` folder
  (Vitest-style `ESNext`/`Bundler` resolution; under Node16 the tests would be CommonJS and fail
  with TS1479 when importing ESM packages).
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
- Migrations: `npm run db:migrate` (apply all pending) / `npm run db:rollback` (revert the latest
  one) — `tsx packages/adapters/store-postgres/src/migrate.ts up|down`, node-pg-migrate with SQL
  files `NNNN_name.up.sql` / `NNNN_name.down.sql` in `packages/adapters/store-postgres/migrations/`
  (bookkeeping table `pgmigrations`). Three migrations exist: `0001_graph-l1` (project, file,
  symbol, edge), `0002_history-claims` (commit, file_commit, claim, evidence, query_log,
  cache_entry) and `0003_indexes-stale` (secondary and HNSW indexes, and the trigger that marks
  claims `stale` when a file's `content_hash` changes). Each `db:rollback` reverts **one** migration, the latest. Both need `DATABASE_URL` (non-zero exit without it); locally
  `postgres://codemind:codemind@localhost:5432/codemind` with the compose defaults.
- Seed / verify are **placeholders**: `npm run db:seed`, `seed:build`, `verify` print a
  "pending Ticket …" message and exit 0. They do nothing yet.
- Local stack: `docker compose up -d` starts Postgres (`pgvector/pgvector:pg16`) on `5432`. On
  Windows, `make up` needs Git Bash/WSL; in native PowerShell run the `npm` scripts directly.

## Testing

- Framework: Vitest (root `vitest.config.ts`; no per-package vitest config yet).
- Test locations: `tests/{unit,integration,e2e,a11y}` and co-located package sources. The first real
  suite is `tests/integration/store/` (schema migrations and constraints, against real Postgres).
- DB integration tests need `DATABASE_URL`. Unset locally → they are **skipped with a warning**
  (so a green run may have skipped them); unset in CI (`CI` set) → they fail. Isolation is minimal
  until DIS-22: lifecycle tests use a throwaway database each; constraint tests run in
  `BEGIN`/`ROLLBACK` with per-test unique values. Only three files
  (`graph-schema-constraints.spec.ts`, `history-claims-constraints.spec.ts`, `indexes-stale.spec.ts`)
  migrate the shared DB,
  always through `migrateSharedDatabase()` in `support.ts`; no test rolls it back.
- Test data comes from `fixtures/` (`acme-shop`, `task-api`, `history`, `build-history.mjs`) and
  `seeds/graph-dump.sql`. `fixtures/**` is excluded from Vitest collection.

## Branch and ticket conventions

- Ticket id: **Linear** team `Distinta-AI4Devs`, key **`DIS`** → ids are `DIS-n` (e.g. `DIS-123`).
  Matches `[A-Z][A-Z0-9]+-[0-9]+` (`base-standards.md` §2); use as the commit scope. Not `COD`.
  Projects: `CODEMIND — Entrega 2` / `CODEMIND — Entrega 3`, milestones M1–M9. Hierarchy: parent =
  user story `CM-HU-*`, sub-issue = one work slice `CM-HU-*.k`; map in
  `docs/ai-sessions/03-planificacion-historias-de-usuario.md` §6. Linear is the live backlog;
  older "Ticket N" notes are not ticket ids.
- **OpenSpec (`/opsx:propose`) is fed from the sub-issue (`DIS-n`)**, never from the parent user story.
- Branch naming for a change: `feature/DIS-n-slug` (merge into delivery branch
  `feature/entrega-2-CRN`). Ultimate base branch: `main`.
- **Linear status via MCP** (agents, per sub-issue `DIS-n`):
  1. Starting work → set status to **In Progress**.
  2. Verification succeeds → set **In Review** or **Done**, and leave a comment linking the
     OpenSpec change.
  3. **Language of Linear text (project exception to `base-standards.md` §2 “tickets in
     English”):** every comment, status note, and human-facing update written **into Linear**
     MUST be **Spanish only** — one language per comment, no Spanglish, no mixing English and
     Spanish in the same sentence. Identifiers may stay as-is (`DIS-11`, `schema-graph-l1`,
     file paths, command names). Code, commits, OpenSpec artifacts, ADRs and PR technical body
     remain English.

## Operational constraints

- Never commit `.env` or any secret. Copy `.env.example` → `.env` for local values. Do not put real
  LLM keys in the repo.
- LLM behaviour follows **Closed product decisions** above (optional credentials, evaluation mode).
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

## prompts.md — synchronous AI log

Mandatory whenever an agent closes a milestone or a relevant AI-assisted decision:

1. **When:** in the **same** work session — not deferred to “later” or end of project.
2. **What:** only the **most significant** prompts (initial creation, course correction, relevant
   feature addition). Max **3 per template section**, as `prompts.md` already states.
3. **Format** (match existing entries):
   - Heading `### Prompt N — …`
   - Prompt **literal** in a code block (as sent)
   - Optional: `**Por qué funcionó.**` when useful
   - `**Ajuste humano.**` with what was changed or rejected from the model output
4. **Forbidden:** reconstructing prompts after the fact and presenting them as a transcript.
5. Sections marked *(pendiente)* (e.g. §7 Pull Requests): fill **only** when that work actually
   exists.
6. Product decisions made without a literal prompt (e.g. human criterion talk): record them in
   `prompts.md` §8 as a lesson/human decision — do not invent a prompt block.

## Gotchas

What the model does NOT know by default about this project: non-obvious behaviour, known traps,
services that must be started first, quirks of the local environment.

- **Some CI gates run against stubs, on purpose.** `lint`, `lint:architecture` and `typecheck` are
  real and must pass, and so is CI's `db:migrate` → `db:rollback` → `db:migrate` step. Mutation
  testing now runs (test files exist) but `packages/core` has no mutants yet, so the score is `n/a`.
  These are intentional scaffolding, not bugs — do not "fix" a stub by faking behaviour.
- **The infra packages are stubs, not empty.** All 9 workspaces (`core`, `analyzers/{php,typescript}`,
  `adapters/{store-postgres,llm,git}`, `api`, `cli`, `web`) have a `package.json` and a `src/index.ts`,
  but the analyzer/adapter ones are empty stubs (dependency-cruiser flags them as `no-orphans` warns).
  They resolve in `npm ls`; do not expect real behaviour from them yet.
- **Vitest can report success with no tests** (`passWithNoTests: true`). A green suite is not
  evidence that behaviour is covered.
- **The repo is mid-build (Entrega 2).** `db:seed`/`seed:build`/`verify` are placeholders that
  no-op, and the schema only has the L1 graph tables (`project`, `file`, `symbol`, `edge`).
  `db:migrate` / `db:rollback` are real and need `DATABASE_URL`: `make up` gets it from `.env`,
  because the Makefile includes and exports `.env`. Plain `npm run db:*` does not read `.env`.
  Do not assume a working end-to-end flow exists.
- **Migration runner edge cases (known behaviour, DIS-11).** `db:rollback` with nothing applied
  prints `No migrations to run!` and exits 0 (no-op, symmetric with `db:migrate` when up to date).
  A whitespace-only `DATABASE_URL` is treated as unset (same error, exit 1). Rollback never drops
  the `vector` extension (shared with later migrations). Concurrent runs do **not** wait:
  node-pg-migrate's default advisory lock mode is `'fail'`, so a second run started while another
  holds the lock throws "Another migration is already running" (verified in DIS-12). Tests that
  migrate the shared DB in parallel use `migrateSharedDatabase()`, which retries only on that error.
- **DB integration specs are kept out of jobs that have no Postgres.** With `CI` set and no
  `DATABASE_URL`, `tests/integration/store/support.ts` throws on import (by design). The Frontend
  workflow therefore runs `npx vitest run --exclude 'tests/integration/**'`, and Stryker uses
  `vitest.stryker.config.ts`, which excludes the same folder. New integration suites go under
  `tests/integration/` so they stay excluded. Locally, an aborted Stryker run leaves
  `.stryker-tmp/` behind (gitignored). A later `npx vitest run` then collects the tests in that
  sandbox, so delete the folder by hand.
- **What `snapshotSchema` (`tests/integration/store/schema-snapshot.ts`) compares.** Columns,
  constraints, enums, extensions, indexes (`pg_indexes.indexdef`, including primary-key and unique
  ones), user triggers and functions. It does **not** capture sequences or views. It excludes the
  functions an extension owns (`pg_depend.deptype = 'e'`): pgvector installs 118 of them in
  `public`. A new migration that adds a sequence or a view must extend the helper before a
  reversibility test can see it. The partial-index predicate of the index contract test is
  normalised (outer parentheses and `::type` casts stripped).
- **OpenSpec native skills are not under `ai-specs/`.** After `openspec init`, `/opsx:*` skills live
  in `.claude/skills/openspec-*` and `.cursor/skills/openspec-*`. Do not delete them on sync; they
  coexist with kit skills.
- **The post-edit hook does not type-check file by file.** `CMD_STATIC_FILE` is empty in
  `.claude/sdd-harness.env`: a bare `tsc --noEmit <file>` ignores `tsconfig.base.json` (falls back
  to commonjs / node10 resolution, no `skipLibCheck`) and fails on every test that imports `vitest`.
  The type gate is `npm run typecheck` (also in CI). A finer per-file check is a later chore.
