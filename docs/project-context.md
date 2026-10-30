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

1. **Evidence is local only.** No hosted web demo. No “Option B” video. Evaluators run `npm run up`
   (the same command in PowerShell and Bash; `make up` is its Git Bash/WSL shortcut) + `docs/DEMO.md` +
   `npm run verify` (golden/cache, no live LLM required).
2. **Hybrid LLM + Ollama.** `LLM_API_KEY` / `LLM_BASE_URL` are optional, and `LLM_BASE_URL` decides
   the mode (DIS-17): both empty → evaluation mode (cache/golden only, 0 €); URL set → free-form
   answers, with the key optional (Ollama runs with `LLM_API_KEY` empty). A key without a URL fails
   at boot. Default local path is Ollama (OpenAI-compatible base URL). A paid cloud vendor is not
   required.
3. **“Deployment” (Entrega 3)** means reproducible Compose + CI + `verify`, not a public PaaS/VPS.

Ollama need not be installed until the Context Engine / live-LLM work; `.env.example` already matches
the empty-key evaluation default.

## Commands

Verified against `package.json` (root and per package). If a command is not here, it does not exist
— do not invent one.

- Start and stop (DIS-102): `npm run up` (`node scripts/up.mjs`) loads the root `.env` and runs
  `docker compose up -d --wait`, `npm install`, `npm run db:migrate`, `npm run db:seed`,
  `node fixtures/build-history.mjs acme-shop` (DIS-103: the fixture's `.git`, which live answers read
  and a clean clone lacks; rebuilt every time, ~11 s), `node fixtures/build-history.mjs task-api` (DIS-32,
  design Follow-ups P7, the author's decision of 2026-10-28: the same for task-api) and `npm run dev` in order from the repository
  root, printing `[up] <command>` before each step; a
  failing step stops it with `[up] "<command>" failed with exit code <n>` and that code, Ctrl+C ends it
  with `[up] stopped (Ctrl+C)` and exit `130`, and without `npm_execpath` (not started by npm) it
  prints `[up] run it with npm run up` and exits `1`. It spawns npm as `process.execPath` +
  `npm_execpath`, never `npm` by name through a shell. The history steps run
  `process.execPath --import ./scripts/defer-ctrl-c.mjs fixtures/build-history.mjs <fixture>`: the
  preload (no imports) only registers a no-op SIGINT listener, so Ctrl+C never ends Node before the
  builder's `finally` restores the fixture's tracked files. The builder itself is not edited because
  it is a seed fingerprint input (any byte change fails `npm run verify` until `seed:build` and
  `cache:build` run again). `npm run down` is `docker compose down` (the
  volume stays). The `Makefile` only delegates: `make up` = `npm run up`, `make down` =
  `npm run down`, plus `logs` and `ps`; it neither includes `.env` nor exports variables.
  `docker-compose.yml` publishes Postgres on `${POSTGRES_PORT:-5432}`; `POSTGRES_PORT` and the port of
  `DATABASE_URL` change together.
- Demo helpers (DIS-102): `npm run demo:ask -- <projectId> "<question>"` (`scripts/demo-ask.mjs`)
  loads `.env`, posts the question to `http://127.0.0.1:<PORT>/api/projects/<id>/ask` (`PORT` read as
  the API reads it, default `3000`) and prints `HTTP <status>` plus a summary (`answer`/`reason`/
  `message` of an `UNKNOWN`, counts and `usage` of an answer, the body otherwise); exit `0` for 2xx,
  `1` otherwise or when the API is not reachable, `2` for a usage error or a bad `PORT`.
  `npm run demo:excerpt -- <project> <path>:<start>-<end>` (`scripts/demo-excerpt.mjs`) prints those
  lines of `fixtures/<project>/<path>`, refusing paths that leave the project (links included);
  exit `1` for an unknown project, an outside path, a missing file or a range past the end, `2` for a
  usage error. Neither replaces the CLI: they exist so `docs/DEMO.md` runs the same in PowerShell and
  Bash.
- Leftover dev processes: `node scripts/dev-processes.mjs list|stop [--since <ISO date>]` lists or ends
  the `node`/`esbuild` processes whose command line names the repository, the session scratchpad
  (`<tmp>/claude/<repo path with : \ / as ->`) or `scripts/load-env.mjs` (the API runs with relative
  paths); never itself or its ancestors; `stop` kills each tree from its topmost selected process
  (`taskkill /T` on Windows); exit `2` for a usage error. Autonomous steps end with `stop`
  (`docs/AUTONOMOUS-RUN.md` §6). It also ends dev servers the author started in this checkout.
- `.env` loading (DIS-102): `scripts/env.mjs` parses the root `.env` (a hand-written subset of the
  dotenv grammar: comments, blank lines, matched quotes, no expansion, the last assignment wins) and
  fills only the variables the environment lacks (a variable set in the shell, even empty, wins). The
  root scripts `cli`, `verify`, `db:migrate`, `db:rollback`, `db:seed`, `cache:build` and
  `seed:build` preload it with `tsx --import=./scripts/load-env.mjs …` (one token: with a space, tsx
  4.23.13 forwards the following `--tsconfig` to Node and fails), the API's `dev` with
  `--import ../../scripts/load-env.mjs`, and `up` / `demo:ask` load it themselves. The quality scripts
  (`test`, `test:a11y`, `test:mutation*`, `lint`, `lint:architecture`, `typecheck`, `docs:coverage`)
  never load it, and product code (`packages/*/src`) never imports it. `scripts/` imports only Node
  built-ins, so `npm run up` works before `npm install`; no `process.loadEnvFile` / `--env-file`
  (`engines.node` is `>=22.12`, DIS-105: Node 22.12 does have those APIs, but `scripts/env.mjs` stays
  the one `.env` reader, with one grammar, the `CODEMIND_SKIP_DOTENV` switch and one warning per process). An unreadable `.env` prints one `warning: .env not read (<code>)`;
  no key or value is ever printed.
- Development environment: `npm run dev` (root) — runs `packages/api` + `packages/web` via
  `concurrently`, kills all on first failure. The API's `dev` (DIS-76, DIS-45, DIS-102) is `node --watch
  --import ../../scripts/load-env.mjs --import ./dev-register.mjs src/server.ts`: `packages/api/dev-register.mjs` registers tsx with
  `packages/api/tsconfig.run.json`, which maps `@codemind/core` and the three adapters to their
  `src/` (as the CLI's), so it never runs a stale `dist/`. Not `tsx watch`: it reads its stdin and
  passes the same pipe to the API, and under `concurrently` (whose children get an open stdin pipe)
  the API never started on Windows (`tests/integration/api/dev-script.spec.ts`). It needs
  `DATABASE_URL`, which its `dev` reads from the root `.env` (a variable already set wins); without it the API prints one
  `INVALID_CONFIG` line and `node --watch` keeps waiting for a file change (the web stays up). To see
  the exit code, run it without watch: `npx tsx --tsconfig packages/api/tsconfig.run.json packages/api/src/server.ts`.
  It listens on `127.0.0.1:3000`; OpenAPI at `http://localhost:3000/docs` (`/docs/json`).
- Web client (DIS-58): `npm -w packages/web run dev` (Vite on `5173`) and `npm run build -w
  packages/web` (`tsc --noEmit` + `vite build` into `packages/web/dist`, gitignored); `npm -w
  packages/web run preview` serves the build. Both Vite servers forward `/api` and `/health` to
  `http://127.0.0.1:3000` (`apiProxy` in `packages/web/vite.config.ts`): the page calls relative URLs
  and the API has no CORS. Changing the API's `PORT` means changing that table. To see the proxy with
  the API stopped, start the API and the web as two processes (the root `npm run dev` kills Vite when
  the API exits); a stopped API answers through the proxy as an empty `500`, which the client reports
  as `ApiUnavailableError`.
- Web screens (DIS-60): `packages/web/src/router.tsx` exports `routes`, one pathless root route whose
  `errorElement` is the app's error screen (`pages/RouteErrorPage.tsx`, «Algo ha fallado», never the
  error's message) and whose children are `/` → Screen 1 (`pages/ProjectPickerPage.tsx`), `/p/:projectId`
  → Screen 2 (`pages/AskPage.tsx`, DIS-65) and `*` → not found. Screen 1 paints one card per project of
  `SAMPLE_PROJECTS` (`packages/web/src/data/sample-projects.ts`) with no request, and checks the API with
  `getHealth` in an effect (`pages/useApiHealth.ts`), not in a React Router loader, so the `Request`
  workaround of `tests/support/jsdom-setup.ts` still holds. «comprobando…» while the first check runs,
  «listo» when it answers, and an alert with «Reintentar» when it does not (no automatic retry). In
  development `StrictMode` sends `/health` twice (the first is aborted).
- Screen 2 (DIS-65): the route renders `<AskPage key={projectId} …/>`, so another project remounts the
  page. `PageFrame` takes an optional `banner`; Screen 2 passes `ProjectBar` (back link «←», the project
  name as `h1`, «PHP / Laravel · 170 aristas»; only the id for a project outside `SAMPLE_PROJECTS`) instead
  of the CODEMIND header. No request on mount: `pages/useAsk.ts` calls `ask()` only when a question is
  sent (one at a time, no time limit, aborted on unmount), with the body `{ question }` only. The box
  checks 5–500 code points after trimming (`components/answer-display.ts`) before sending. The suggested
  questions are `SUGGESTED_QUESTIONS` (`packages/web/src/data/suggested-questions.ts`), written by hand
  and guarded by `tests/unit/seed/suggested-questions-coherence.spec.ts`: they must be the golden
  questions of `seeds/cache/<project>.json`, in order, so in evaluation mode each one is answered from
  the cache. Regenerating the golden answers with other questions means updating that constant. The
  answer renders back-quoted fragments as `code` and everything else as text (no Markdown, no
  `dangerouslySetInnerHTML`).
- Screen 2 states (DIS-66): after the evidence, `components/UsagePanel.tsx` (a region named by a visually
  hidden `h2` «Uso»: confidence, input + output tokens, cost, latency, the savings and cache badges and
  the line «<baseline> tokens sin selección de contexto → <input tokens> con CODEMIND»). An `UNKNOWN`
  shows `components/UnknownState.tsx` (one sentence per reason, «Motivo: <reason>», muted) or, for
  `llm-required`, `components/LlmRequiredNotice.tsx` (accent; how to set `LLM_*`, the API's message as
  text); every failure shows `components/AskErrorNotice.tsx` (`role="alert"`, warning colours, chosen by
  the API's error code: budget with its UTC reset time, rate limit with its wait, the known codes, the
  code line, or «La API de CODEMIND no responde.»). The figures and the notice lines are pure functions in
  `components/usage-display.ts` and `components/notice-display.ts` (no `Intl`; `notice-display.ts`
  owns the `AskFailure` type). `AskPage` renders one persistent, visually hidden `role="status"`
  region whose text follows the state (empty, «Buscando evidencia…», «Respuesta recibida.», «Sin respuesta
  verificada.», «Hace falta un modelo de lenguaje.», empty after an alert); the visible pending text is
  `aria-hidden`. A repeated invalid send re-mounts the box's alert (keyed by a send counter) so it is
  announced again. No state adds a tab stop or moves the focus.
- Accessibility gate: `npm run test:a11y` (root) = `vitest run tests/a11y` — axe over the real routes
  (see Testing).
- Tests (full): `npm test` or `npx vitest run` (root `vitest.config.ts`). `fixtures/**` is excluded
  and `passWithNoTests` is on, so a green run may mean **zero tests ran**.
- A subset of tests: `npx vitest run <pattern>` — prefer this over the full suite.
- Type check: `npm run typecheck` (root) — `tsc --build` over project references + a separate
  `--noEmit` pass on `packages/web` + `tsc -p tests/tsconfig.json` for the root `tests/` folder
  (Vitest-style `ESNext`/`Bundler` resolution; under Node16 the tests would be CommonJS and fail
  with TS1479 when importing ESM packages) + `tsc -p tests/a11y/tsconfig.json` (the `.tsx` gate,
  with the web's compiler options).
- Architecture rule: `npm run lint:architecture` (root) — dependency-cruiser over `packages` using
  `.dependency-cruiser.cjs` (the single config; CI runs the same file). Since DIS-58 the rule
  `web-no-backend` forbids `packages/web` from importing `packages/{api,core,adapters,analyzers,cli}`
  or a `@codemind/` package.
- Lint: `npm run lint` (root) — ESLint flat config (`eslint.config.mjs`), `@eslint/js` +
  `typescript-eslint` recommended. Empty port interfaces are downgraded to warnings; `.cjs`, `dist`,
  `.claude`, `.cursor`, `fixtures` are ignored.
- Mutation testing: `npm run test:mutation` (`stryker run`; `stryker.config.json`, targets
  `packages/core/src`, since DIS-86 `packages/cli/src` minus its entry point `index.ts`, and since
  DIS-76 `packages/api/src` minus its process shells `server.ts` and `start.ts`, covered only by
  `tests/integration/api/server.spec.ts`). A
  mutation score under 80 fails the run (`thresholds`: break 80, low 80, high 90; Stryker requires
  break ≤ low ≤ high). It is
  incremental (`"incremental": true`): the first run is full (~14 min in CI), later runs only re-test
  mutants whose code or covering tests changed and reuse the rest from
  `reports/stryker-incremental.json` (gitignored, one per checkout). `npm run test:mutation:full`
  (`--force`) re-tests everything and rewrites that file: use it after changing dependencies or the
  Vitest/Stryker config, which incremental mode does not detect. In CI it is its own `mutation` job,
  parallel to `quality` and without Postgres; it runs when its `business` paths filter matches
  (`packages/core/**`, `packages/cli/**`, `packages/api/**`, `tests/**`, Stryker/Vitest config, `package*.json`,
  `ci.yml`) and restores the report from the Actions cache (this branch, else the PR base branch;
  the key hashes the lock file and the Stryker/Vitest configs). A PR runs `test:mutation`; a push to
  a base branch runs `test:mutation:full` and saves the report the next PRs start from. It is
  guarded: it only runs once test files exist, otherwise it prints a warning and skips (Stryker's
  dry run fails with zero tests, and faking a test to force it green defeats the gate).
- CI triggers: every PR, plus pushes to `main`, `feature/entrega-*` and `final-project-*` (the
  delivery branches PRs merge into). A new push to a PR cancels the run of its previous head
  (`concurrency`); pushes to a base branch always finish.
- CI docs-only skip: the `scope` job of `ci.yml` skips the `quality`, `mutation` and `verify` jobs
  when a push to an open PR only touches `openspec/**`, `docs/**` or `*.md` (diff of that push,
  `before..after`) and all three were green or skipped on the previous head — e.g. the `/opsx:archive` commit. They always
  run on PR open/reopen, on a push to a base branch, after a force-push or a non-green (or
  cancelled) previous head. A skipped job counts as passed for required checks. Keep test-file edits
  (even comments, such as spec paths in test headers) out of the archive commit, or it runs in full.
- CI `verify` job (DIS-44, PH-23): `needs: scope`, same `if` as `quality`, its own
  `pgvector/pgvector:pg16` service with database `verify`; runs `npm ci` → `db:migrate` → `db:seed` →
  `npm run verify` with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/verify` and no
  `LLM_*`. The seed never reaches `quality`'s `test` database, which stays unseeded. A stale seed or
  golden fingerprint turns this job (only this one) red: see Gotchas → `verify`.
- CI secret scan (DIS-87): the `secrets` job of `ci.yml` runs gitleaks 8.30.1 (official binary,
  pinned by SHA-256 in the workflow) on every CI run (see CI triggers). Own job: no `needs: scope`, no
  `if`, never skipped — a docs-only push skips `quality` and `mutation` but not `secrets`. No `npm ci`. It runs
  `gitleaks dir .` and `gitleaks git` over the event range (`base..head` on a PR, `before..sha` on a
  push; tree only when `before` is all zeros or unreachable), both `--redact` and both with
  `--config .gitleaks.toml` (a missing file fails the job). Known synthetic findings are allowed by
  exact value in `.gitleaks.toml`; one historical finding is fingerprinted by commit in
  `.gitleaksignore`. How to regenerate both is in `fixtures/README.md` → "CI secret scan". Locally:
  `gitleaks dir . --config .gitleaks.toml --redact` (gitleaks 8.30.1).
- Docs coverage: `npm run docs:coverage` (or `npx typedoc --validation.notDocumented --logLevel Warn`)
  — TypeDoc over the backend packages via root `typedoc.json`. HTML lands in `docs/api/` (gitignored).
  `CMD_DOCS_COVERAGE` in `.claude/sdd-harness.env` points here. `packages/web` is out of scope (React
  UI, not the API surface). As the public surface grows, undocumented exports fail this gate.
- CLI: `npm run cli` (root) — `tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts`.
  `tsconfig.run.json` maps `@codemind/core`, `adapter-git`, `adapter-llm`, `adapter-store-postgres`
  and `analyzer-php` to their `src/`, so the CLI never runs a stale or missing `dist/` (DIS-86 design
  D10). `index`, `projects` and `ask` are real: `npm run cli -- index <path> --name <name> --language php
  [--framework laravel|fastify|none] [--json]` (see the gotcha on the `index` command) and
  `npm run cli -- projects` (DIS-92: every stored project, one line each, read through
  `StorePort.listProjects` in a transaction it always rolls back; needs `DATABASE_URL`) and
  `npm run cli -- ask <project> "<question>"` (DIS-40, see the gotcha on the `ask` command);
  `impact` is a stub.
- Migrations: `npm run db:migrate` (apply all pending) / `npm run db:rollback` (revert the latest
  one) — `tsx packages/adapters/store-postgres/src/migrate.ts up|down`, node-pg-migrate with SQL
  files `NNNN_name.up.sql` / `NNNN_name.down.sql` in `packages/adapters/store-postgres/migrations/`
  (bookkeeping table `pgmigrations`). Four migrations exist: `0001_graph-l1` (project, file,
  symbol, edge), `0002_history-claims` (commit, file_commit, claim, evidence, query_log,
  cache_entry), `0003_indexes-stale` (secondary and HNSW indexes, and the trigger that marks
  claims `stale` when a file's `content_hash` changes) and `0004_query-log-verification` (DIS-74:
  the five nullable `verify_*` columns of `query_log`). Each `db:rollback` reverts **one** migration, the latest. Both need `DATABASE_URL` (non-zero exit without it); locally
  `postgres://codemind:codemind@localhost:5432/codemind` with the compose defaults.
- `npm run seed:build` (DIS-91; two samples since DIS-32) rebuilds the history of acme-shop and
  task-api, indexes each one in its own never-committed transaction (acme-shop as `php`, task-api as
  `typescript`), prints one summary line per project and rewrites
  `packages/web/src/data/sample-projects.ts` and then `seeds/graph-dump.sql`; an error names the
  failing project as the typed path (`"task-api" is not the root of a git repository`); needs
  `AUTHOR_HASH_SALT` (the author's development salt, read from `.env` by the script's preload) and
  `DATABASE_URL` of a migrated database (see Gotchas → seed). `npm run db:seed`
  (DIS-92) loads the seed: needs only `DATABASE_URL`, replaces every sample project in one
  transaction and prints `2 projects loaded` plus one line per sample (see Gotchas → seed load).
  Since DIS-26 it also loads every `seeds/cache/*.json` golden file into the answer cache of the
  sample projects. `npm run cache:build [-- --project <name> [<id>...]]` (DIS-26; per project since
  DIS-32) regenerates those golden answers (`seeds/cache/acme-shop.json`: Q1, Q3 and Q4, and
  `seeds/cache/task-api.json`: Q1, Q2 and Q3, of `fixtures/README.md`) with a **live** model: ids need
  `--project`, a bare id or `--project=<name>` is `USAGE`, each project's file is written right after
  its last question and a later failure keeps it (`INTERNAL` names the files written); needs
  `DATABASE_URL` of a migrated database and `LLM_BASE_URL`/`LLM_MODEL` (reference: local Ollama
  `qwen2.5-coder` on CPU, about an hour for both projects; see Gotchas → golden answers); `CACHE_BUILD_TIMEOUT_MS`
  (1..3 600 000, default 1 200 000) is its per-request limit, `LLM_TIMEOUT_MS` is not used. Run it
  after `seed:build`, never in CI.
- `npm run verify` (DIS-44, `packages/cli/src/verify.ts`) is the no-model smoke check of the readme
  (§1.4, §2.4, §6): needs only `DATABASE_URL` of a database where `db:seed` loaded the seed and the
  golden answers; never reads `LLM_*`, `DAILY_BUDGET_USD` nor `CACHE_BUILD_TIMEOUT_MS`; arguments are
  ignored. Before connecting, in order: `DATABASE_URL` (`MISSING_CONFIG`); the seed and every
  `seeds/cache/*.json`, read as `db:seed` reads them (`INVALID_SEED`); the seed header fingerprints
  against the code (`FINGERPRINT_MISMATCH` `{reason:"seed"}`, "run npm run seed:build, then npm run
  cache:build"); each golden file's `seed.*` and `answerFingerprint` (`FINGERPRINT_MISMATCH`
  `{reason:"golden", file}`, "run npm run cache:build"); one golden file with entries per seed project
  (`GOLDEN_MISSING` `{project}`). Then one transaction, **always rolled back** (no `hit_count`,
  `query_log` or `claim` change): each golden project must be the stored sample with the seed's id and
  indexed commit (`SEED_NOT_LOADED` `{project}`, "run npm run db:seed"), and each golden question is
  asked through `explain` with the cache on and `createEvaluationLlm` (no request ever reaches a
  model). `DATABASE_UNAVAILABLE` only when opening the transaction fails (a `DATABASE_URL` the driver
  cannot parse included); anything later, or any other unexpected failure before, is `INTERNAL`
  (`verify failed; the database is unchanged`); a failed rollback or release does not change the
  outcome. stdout: one `✓|✗ <project> <id>
  <question>` line per entry, under each `✗` one 4-space-indented line per difference
  (`statements[0].type: expected "FACT", got "INFERENCE"`, `evidence: expected 2 items, got 1`,
  `usage.cacheHit: expected true, got false`, or `expected an answer from the golden cache, got
  UNKNOWN (<reason>)`, followed by `: run npm run db:seed` for `llm-required`), then one
  `<project>: <m>/<n> golden answers match` line per golden file. Only structure is compared
  (`packages/cli/src/cache/compare-golden.ts`): never text, ids, `usage` other than `cacheHit`,
  `confidence` or `priorClaims`. Exit `0` only when every entry matches; a mismatch is stdout only, a
  failure is one JSON line on stderr. About 3 s locally.
- Local stack: `docker compose up -d` starts Postgres (`pgvector/pgvector:pg16`) on `POSTGRES_PORT`
  (`5432` by default). `npm run up` starts the whole system in any shell, native PowerShell included;
  `make up` (GNU Make) needs Git Bash/WSL on Windows.

## Testing

- Framework: Vitest (root `vitest.config.ts`; no per-package vitest config yet).
- **The suite never reads `.env` (DIS-102 design D12).** `vitest.config.ts` sets
  `test.env: { CODEMIND_SKIP_DOTENV: '1' }` (inherited by `vitest.stryker.config.ts`), so every
  test and every process a test spawns (`npm run db:rollback` in `migrations.spec.ts`) leaves its
  environment as the test set it: with a developer `.env`, a preloaded `db:rollback` would otherwise
  roll back the developer's database. `loadEnvFile` reads the switch from the environment it loads
  into, so the unit tests of `scripts/` load into plain objects. Integration tests therefore take
  their `DATABASE_URL` from the command line (`docs/TESTING.md`). The `scripts/` tests live in
  `tests/unit/scripts/` (typed through sibling `.d.mts` files) and the guides' structure tests in
  `tests/unit/docs/guides.spec.ts`; `scripts/` is outside Stryker's scope.
- **Web tests (DIS-58).** Next to the code: `packages/web/src/**/*.test.ts(x)`. Only
  `packages/web/**/*.test.tsx` and `tests/a11y/**` run in **jsdom** (the `dom` project of `test.projects` in `vitest.config.ts`, DIS-105; each project has `extends: true`); every
  other test, the web's `.test.ts` files included (API client, theme), stays in Node — under jsdom the
  global `AbortSignal` is jsdom's while `fetch` stays Node's, and Node's `fetch` rejects it.
  `tests/harness/**` is the `harness` project (DIS-111). On Windows only it has `maxWorkers: 2` and
  `sequence.groupOrder: 1`, so the kit's hook tests run after every other project with two workers
  (the full suite takes about 25 min instead of 9): under the full suite's parallel load a few of them
  went past their timeouts (they pass alone and on CI; DIS-9 E28), and running them one by one would
  take about 48 min. On Linux (CI) they run alongside the rest, as before: running them last made the
  `quality` job exceed its 10-minute limit. The setup
  file `tests/support/jsdom-setup.ts` (guarded by `'document' in globalThis`) unmounts after every
  jsdom test (RTL's auto-cleanup needs Vitest `globals`, off here) and replaces `Request` with a
  subclass that drops `init.signal`, because React Router builds `new Request(url, { signal })` on
  navigation with Node's `Request` and jsdom's `AbortController`. That workaround is safe only while
  the app has no loader or action: **the ticket that adds one must revisit it**. `.tsx` tests compile
  with `esbuild.jsx: 'automatic'`. Use RTL accessible queries and `user-event`; mock the network with
  `vi.stubGlobal('fetch', …)`. A test that renders `/` should stub `fetch` (Screen 1 calls `GET /health` on
  mount; Node's real `fetch` rejects under jsdom, so the page would show the API-unavailable alert); the
  pre-DIS-60 tests that render `/` without a stub still pass, since none asserts the alert's absence.
  `tests/unit/web/` holds the Vite proxy table test and the type-level
  contract test `api-contract.spec.ts` (`expectTypeOf` of the client types against the API's Zod
  types, by relative path; it fails `npm run typecheck`, not Vitest). Stryker excludes
  `packages/web/**`, `tests/a11y/**` and `tests/unit/web/**` (`vitest.stryker.config.ts`): it mutates
  no web file. Of `packages/adapters`, it mutates only `packages/adapters/llm/src/long-fetch.ts`
  (DIS-103), which the CI `mutation` job's `business` path filter also lists.
- Test locations: `tests/{unit,integration,e2e,a11y}` and co-located package sources. The first real
  suite is `tests/integration/store/` (schema migrations and constraints, against real Postgres).
- DB integration tests need `DATABASE_URL`. If it is unset:
  - locally, they are **skipped with a warning**, so a green run may have skipped them;
  - in CI (`CI` set), they fail.

  The only gate is in `tests/integration/helpers/db.ts`, and `store/support.ts` re-exports it.
- **Integration harness (DIS-22), `tests/integration/helpers/`.** New DB specs use it.
  - Inside a `describeWithDatabase`, call `const db = useTransactionPerTest()`. It migrates the
    shared DB once and gives each test its own transaction, reverted when the test ends.
  - `db()` is that test's `pg` client.
  - `factories.ts` has `createProject` / `createFile` / `createSymbol` / `createEdge`:
    - keys are snake_case columns;
    - defaults are synthetic and unique per call, so they never assume an empty DB;
    - an edge endpoint is `{ symbol_id }` or `{ file_id }`.
  - The first spec using it is `helpers/harness.spec.ts`.
- **Code under test must not `COMMIT` or `ROLLBACK` on `db()`.** The harness then fails the test
  with "Harness transaction was committed or ended early".
  - A `SAVEPOINT` is fine, and so is a statement that fails (an aborted transaction).
  - The store (DIS-23) cooperates through its connection mode: in tests build it with
    `createPostgresStore({ transaction: db() })`. Every write then runs in `SAVEPOINT store_write`
    and a failed write rolls back to it, so the test can keep querying `db()`. Reads (DIS-24) send
    one plain statement, with no savepoint. In production it is
    `createPostgresStore({ pool })`, which opens and commits its own transaction per write. A test
    that needs a real commit (`graph-write-pool.spec.ts`) uses a unique project name and deletes the
    project in `finally`; the schema cascades the rest.
- **In-memory `StorePort` double for unit tests** (DIS-27, `tests/support/in-memory-store.ts`).
  `createInMemoryStore({ projects: [{ project, graph }] })` returns `{ store, projectIds, fileIds,
  calls }`. It implements the reads (`getProject`, `listProjects`, `findSymbols`, `neighbors` with
  `direction`, `resolution` and `fileKind` with the Postgres semantics, DIS-28), reuses core's
  argument checks, sorts in byte order (`Buffer.compare`), and counts `findSymbols`/`neighbors`/
  `getProject` calls (before any check) so a test can assert "no search was sent".
  Since DIS-39 it also implements `saveClaims` and `findClaimsOverlapping` (same validation as the
  adapter, through core's `assertValidClaimItems` / `assertValidClaimSpans`), counted in `calls`;
  `createInMemoryStore({ projects, failClaimWrite: { claim, evidence } })` makes `saveClaims` reject
  with `ClaimWriteFailed` at that evidence before storing anything; `seedClaim({ claim, evidence,
  createdAt })` stores a claim without the ownership check (a claim may cite another project's file);
  `storedClaims()` lists them. Write instants are a counter after the latest seeded `createdAt`,
  never `Date.now()`. Since DIS-42 it implements `refreshClaim` (same checks and conditional write as the
  adapter, `calls.refreshClaim`), with the options `failClaimRefresh(claimId)` (a value other than
  `undefined` is thrown) and `beforeRefreshCheck(claimId)` (a callback run just before the condition is
  checked, to move the indexed commit or change the claim), and keeps a last-written instant per claim:
  `claimUpdatedAt(claimId)` is its `createdAt` until a refresh rewrites it, then a later stamp. Since DIS-74 `saveQueryLog` checks like the adapter (id form, then
  `assertValidQueryLogEntry`, then the project), keeps the rows (`queryLog()`, counted in
  `calls.saveQueryLog`) and throws what `failQueryLogWrite()` returns when it is not `undefined`.
  Since DIS-21 it keeps the answer cache: `findCacheEntry` / `saveCacheEntry` / `touchCacheEntry` /
  `invalidateCache` check like the adapter (id form, then `assertValidCacheKey` /
  `assertValidCacheResponse` / `assertValidEntryId` / `assertValidHitInstant`, then the project),
  store and return a JSON round trip of each response (as `jsonb`), count in `calls.*`, and throw
  what `failCacheCall: { find?, save?, touch?, invalidate? }` returns; `cacheEntries(projectId?)`
  reads the entries and `seedCacheEntry({ projectId, key, response, hitCount?, createdAt? })` stores
  one unchecked (an invalid response included). `doubles()` of `tests/support/explain-doubles.ts`
  forwards `failCacheCall` and records `findCacheEntry`, `touchCacheEntry` and `saveCacheEntry` in
  `order`; stored responses for tests come from the factories of `tests/support/cached-answer.ts`.
  Graph writes and `sumCostSince` throw. It runs the `graph-store` read scenarios in
  `tests/unit/store/in-memory-store.spec.ts` (tests named `… (in-memory double)`). Known limit:
  case-insensitivity uses `toLowerCase`, which can differ from `ILIKE` on non-ASCII names. It lives
  in `tests/` on purpose: outside Stryker's `mutate` and core's `dist`.
- **In-memory `SourceTreePort` double** (DIS-28, `tests/support/in-memory-source-tree.ts`).
  `createInMemorySourceTree(contents, failures?)` answers `readFileAt` from `{ root: { commit: {
  path: content } } }`, rejects an absent entry with `SourceUnavailable('missing', path)`, injects
  any other rejection per path, and records `calls.readFileAt` and every `{ root, commit, path }`
  read. Since DIS-39 it answers `readFilesAt` too (first failing path in order rejects the batch),
  recorded in `calls.readFilesAt` and `batchReads`; the pack now reads only through it, so "no file
  was read" means both counters are 0. `readFiles`/`realPath` throw. Context pack unit tests pair it
  with the store double. `tests/support/scripted-llm.ts` is the `LlmPort` double of the explain tests:
  it reads the evidence ids and spans from the prompt and builds the output from them. Since DIS-41 the
  `question` and each evidence `text` it sees are wrapped in `<<<UNTRUSTED_DATA <id>>>>` markers, and a
  cut span ends at its kept last line: match spans by path and lines, never by text. Since DIS-42 the
  `PromptView` a script receives has `kind: 'answer' | 'refresh'`: a refresh prompt (its user message
  holds `claim`, not `question`) is parsed with the stored statement unwrapped as `claim` and its
  `claimFlags`, so one script answers both prompts.
  `tests/support/explain-doubles.ts` holds the doubles both explain unit specs share (since DIS-42 it
  records `refreshClaim` in `order` and forwards `failClaimRefresh` and `beforeRefreshCheck`). The stale
  claim refresh is tested in `tests/unit/explain/stale-refresh.spec.ts`, `refresh-prompt.spec.ts`,
  `tests/integration/store/claims-refresh.spec.ts` and `tests/integration/explain/stale-refresh.spec.ts`.
  Since DIS-68 `createInMemorySourceTree(contents, failures?, options?)` takes `options.after:
  { when, contents, failures? }`: every read made while `when()` holds answers from those instead.
  `doubles()` wires it as `verificationContents` / `verificationFailures` with
  `when: () => order.includes('complete')`, so only the reads after the model call (the verification
  read) see them, whatever `packOf` read before; a given `verificationContents` must hold every file
  the verification reads (an absent one is `file-missing`). `doubles()` also returns `batchReads` and
  `reads`: an answered explain makes two batched reads (the pack's, then the verification's).
- **Property tests use `fast-check`** (root devDependency since DIS-28,
  `tests/unit/context/budget.spec.ts`): `numRuns ≥ 200`, and `seed` fixed only when `CI` is set
  (`{ ...(process.env.CI ? { seed: 20261011 } : {}) }`), so CI replays and local runs explore.
- **acme-shop test subset** (`tests/support/acme-shop-graph.ts`): a real slice of
  `seeds/graph-dump.sql` (the `PriceCalculator` and `DiscountService` neighbourhoods, `CouponValidator`,
  `docs/pricing.md`). `tests/unit/context/acme-shop-graph-coherence.spec.ts` fails if any file,
  symbol or edge of it stops matching the seed; fix the subset by copying the values from the seed.
- **Workspace packages resolve to their sources in tests** (DIS-23 for `@codemind/core`, the first
  cross-package import; DIS-86 added `@codemind/adapter-git`, `@codemind/adapter-store-postgres` and
  `@codemind/analyzer-php`, which the CLI imports by name; DIS-17 added `@codemind/adapter-llm`, which
  its tests import by name and, since DIS-40, the CLI too). Vitest aliases each to its
  `packages/*/src/index.ts` (`vitest.config.ts`, inherited by `vitest.stryker.config.ts`), and
  `tests/tsconfig.json` has the matching `paths` entries. `npm run cli` does the same through
  `packages/cli/tsconfig.run.json`. Any other `tsx` script resolves them through `node_modules` to
  `packages/*/dist/`, so run `npx tsc --build` first or you run stale code. `store-postgres`,
  `adapters/git`, `adapters/llm`, `analyzers/php` and `analyzers/typescript` have a project reference to core; `packages/cli` references all
  five (core and the four adapters/analyzers).
- `tests/support/` holds helpers shared by unit and integration tests, such as `sample-graph.ts`,
  a synthetic `KnowledgeGraph` builder.
- **Golden answers tests (DIS-26).** `tests/support/golden-file.ts` has `goldenFile(overrides?)` and
  `goldenEntry(id, overrides?)`: fresh valid golden values with `cachedAnswer()` responses and
  synthetic fingerprints. Unit: `tests/unit/cache/golden-file.spec.ts`, `answer-fingerprint.spec.ts`,
  `write-atomically.spec.ts`, `tests/unit/cli/long-fetch.spec.ts` (a local `node:http` server on
  port 0), `tests/unit/cli/cache-build.spec.ts` (doubles for every seam of `CacheBuildDeps`, among
  them `headCommit` and `load`: no database, no git), `tests/unit/seed/golden-questions.spec.ts`
  (the constant against the README table) and `golden-coherence.spec.ts` (the versioned file).
  Integration: `tests/integration/cli/cache-build.spec.ts` copies `fixtures/acme-shop` to a temporary
  workspace, rebuilds its history once in `beforeAll`, passes a no-op `buildHistory`, a savepoint
  `openTransaction` on the harness client, `createScriptedLlm` in live mode and `seedFingerprints`
  returning the seed header's pair (CI never depends on the seed being fresh); its database snapshots
  cover only the rows the build can reach (sample projects and any project named acme-shop), because
  other integration files commit projects of their own in parallel. The golden scenarios of
  `tests/integration/cli/seed-load.spec.ts` pass a temporary `cacheDir`; its "Loading again" scenario
  compares the sample projects' cache entries without their id (`reloadSnapshot`), because each load
  re-inserts them. Two scenarios still read every project and race those commits
  (`projects-command.spec.ts` and seed-load's "A failed golden save leaves the database unchanged"):
  `docs/TESTING.md` → Carreras conocidas; `npm test -- --no-file-parallelism` avoids them (DIS-45). Never run
  DB integration tests while a real `cache:build` runs: its transaction
  holds the sample project's rows for minutes and tests that delete projects wait on it; so do a
  `db:seed` and any `ask` on acme-shop (CLI or API), whose `query_log` insert checks the locked
  project row.
- **`verify` tests (DIS-44).** Unit: `tests/unit/cache/compare-golden.spec.ts` (the structural
  comparison over `cachedAnswer()` responses), `tests/unit/cache/seed-header.spec.ts`,
  `tests/unit/cli/verify.spec.ts` (doubles for every seam
  of `VerifyDeps`, `listProjects` included; temporary seed and cache directories; no database) and
  `tests/unit/ci/verify-job.spec.ts` (parses `ci.yml` with `yaml`, a root devDependency). Integration:
  `tests/integration/cli/verify.spec.ts` loads the versioned seed and golden answers with `loadSeed`
  and `saveCacheEntry` inside the harness transaction, passes a savepoint `openTransaction` that
  records `commit`, counts requests on a local `node:http` server, and deletes only the project named
  `acme-shop` for its "no project" case. Every test injects `seedFingerprints` and `answerFingerprint`
  with the files' own values: freshness of the versioned files is the `verify` CI job's alone, so a
  PR touching a fingerprint input turns one job red, not the suite.
- **Hook order: Vitest 4 runs the hooks of one suite in series.** This is `sequence.hooks = 'stack'`,
  the default since Vitest 2 (DIS-105 D5; Vitest 1.6 ran them in parallel): the hooks of one suite run
  one after another in declaration order (`afterEach` in reverse), and a parent suite's hooks run
  before a nested suite's.
  - A `beforeEach` declared after `useTransactionPerTest()` runs inside the transaction the harness
    opened, so it can call `db()`; one declared before it still runs too early and fails with
    "db() is only available while a harness test is running…". Declare it after the harness call.
  - A `beforeAll` next to the harness runs in declaration order too, so it sees the migrated database
    only if it is declared after the harness call. The nested `describe` stays the safe place. The
    comments of `tests/integration/helpers/db.ts` still describe the Vitest 1.x parallel order
    (DIS-105 Follow-ups, R2).
  - Clean up in the test body, never in an `afterEach` that uses `db()`. The rollback removes the
    rows anyway.
- **Factory overrides set to `undefined` are ignored:** the default applies.
- **No concurrent tests under the harness.** `it.concurrent`, `describe.concurrent` and
  `sequence.concurrent` are not supported. The second test to start fails with
  "useTransactionPerTest() does not support concurrent tests…".
- The older store specs keep their own style, not migrated:
  - lifecycle tests use a throwaway database each;
  - constraint tests run in `withRollback` with per-test unique values.

  These files migrate the shared DB, always through `migrateSharedDatabase()` (directly or through
  `useTransactionPerTest()`): `graph-schema-constraints.spec.ts`, `graph-write-pool.spec.ts`,
  `history-claims-constraints.spec.ts`, `indexes-stale.spec.ts`, `helpers/harness.spec.ts` and,
  since DIS-76, `store/open-store.spec.ts` and `api/server.spec.ts`, since DIS-78 `api/ask.spec.ts`
  and since DIS-21 `store/cache-entry.spec.ts` (through `useTransactionPerTest()`; its concurrency
  and pool scenarios commit a uniquely named project and delete it in `finally`). No test rolls it back.
- **API `inject` specs live in `tests/unit/api/`** (DIS-76), not under `tests/integration/`: they
  need no database and must run under Stryker, whose Vitest config excludes `tests/integration/**`.
  `tests/unit/api/support.ts` builds the app with `buildApp` and the doubles of `tests/support/`,
  registers the test routes `POST /api/test-only`, `GET /api/test-query` and `GET /api/test-throw`
  (result or thrown error chosen per test, handler runs counted) before `ready()`, and wraps any
  port in a counting `Proxy`; it never imports `tests/integration/helpers/db.ts`. They import the
  API sources by relative path, as the CLI tests do (no Vitest alias for `@codemind/api`). The
  process and database scenarios (`startApi`, `server.ts`) are in `tests/integration/api/`. Since
  DIS-78, `tests/unit/api/ask.spec.ts` drives `POST /ask` over the in-memory acme-shop subset (its
  scenarios' "a use case that…" is the `explain` seam of `buildApp`), `route-errors.spec.ts` builds its own app for
  a per-route error table, and `tests/integration/api/ask.spec.ts` runs `/ask` over the seed in
  Postgres (template of `tests/integration/cli/ask-command.spec.ts`).
  Since DIS-9, `tests/unit/index/reindex-project.spec.ts` (core use case over fakes),
  `tests/unit/api/reindex.spec.ts` (`/index` over doubles with a recording log) and
  `tests/integration/api/reindex.spec.ts` (over the seed, the harness transaction as the unit of
  work); `store/open-store.spec.ts` also covers the transaction runner and deletes what it commits.
  Since DIS-10, `tests/unit/index/incremental-plan.spec.ts` (the pure plan) and
  `tests/integration/index/incremental-reindex.spec.ts` (the changed file and its dependents, and the
  fast path, over Postgres with a copy of acme-shop whose history is built once).
- Test data comes from `fixtures/` (`acme-shop`, `task-api`, `history`, `build-history.mjs`) and
  `seeds/graph-dump.sql`. `fixtures/**` is excluded from Vitest collection.
- **PH-22 — fixtures are an analyzer's input, never test-writable (DIS-47, DIS-30).** `createPhpAnalyzer()`
  (`packages/analyzers/php`) and `createTypeScriptAnalyzer()` (`packages/analyzers/typescript`) do no I/O over the analysed repository: it only reads the `SourceFile[]`
  content it is given. `tests/unit/analyzers/php/structure.spec.ts` walks `fixtures/acme-shop` with
  `node:fs` read-only to build that input; no test modifies the fixture. Edge-case expectations (a
  syntax error, a non-existent path) are built with inline content, not by editing the fixture. A
  directory walk over a fixture must skip its rebuilt `.git` (gitignored, regenerated by
  `build-history.mjs`), the same gotcha the git-history reader already has.
- **Git history tests (DIS-35, DIS-36), `tests/integration/git/simple-git-history.spec.ts`.** Its
  `beforeAll` copies both fixtures (without `.git`) under the OS temp dir and builds their history
  there with the builder's `buildOne` and the real manifests (deterministic: same `HEAD` every time).
  It must never build in `fixtures/` itself (DIS-61): while it commits, the builder rewrites tracked
  files with older snapshots, and the analyzer specs that read `fixtures/acme-shop` from disk in
  parallel (Vitest runs files concurrently) then see e.g. a `DiscountService.php` without
  `volumeBonus` and fail at random — seen in CI only, where the DB-backed files also run. To refresh
  the real fixtures' `.git` by hand, run `node fixtures/build-history.mjs`; no test does it. Since
  DIS-103 `npm run up` rebuilds the `.git` of `acme-shop` and `task-api` on every start (its steps
  `node fixtures/build-history.mjs <fixture>`, ~11 s each): never run the suite in the same checkout while
  that step runs, for the same reason. Other
  cases use throwaway repositories under the OS temp dir with synthetic
  identities (`git -c user.name=… -c user.email=…`). They need `git` on `PATH`. Only the two
  persistence blocks (`git history persistence`, `co-change persistence`) need Postgres
  (`describeWithDatabase`); the rest run without it. Salt-helper unit tests live in
  `tests/unit/git/`; the co-change rule's in `tests/unit/knowledge/co-change.spec.ts`.
- **`build-history.mjs` guarantees every file a commit lists really changes in it** (DIS-36). A
  re-touch that would leave the content as the previous commit left it gets the `hist:rN` marker;
  a final touch that changes nothing (or a `.json` re-touch) fails the build. Without this, Git
  silently drops the link and the co-change ground truth of `fixtures/README.md` breaks. The
  script exports `buildOne` (it runs `main()` only as a CLI), and
  `tests/integration/git/build-history.spec.ts` tests it on throwaway fixtures under the OS temp dir.
- **An aborted Stryker run leaves `.stryker-tmp/sandbox-*`.** Since DIS-84 `vitest.config.ts`
  excludes `.stryker-tmp/**` (before that, Vitest collected the copy, which rebuilt fixtures in
  parallel and failed; a sandbox also links `fixtures/task-api/node_modules`, so thousands of
  third-party specs ran). The folder is still worth deleting by hand to free disk space.

## Branch and ticket conventions

- Ticket id: **Linear** team `Distinta-AI4Devs`, key **`DIS`** → ids are `DIS-n` (e.g. `DIS-123`).
  Matches `[A-Z][A-Z0-9]+-[0-9]+` (`base-standards.md` §2); use as the commit scope. Not `COD`.
  Projects: `CODEMIND — Entrega 2` / `CODEMIND — Entrega 3`, milestones M1–M9. Hierarchy: parent =
  user story `CM-HU-*`, sub-issue = one work slice `CM-HU-*.k`; map in
  `docs/ai-sessions/03-planificacion-historias-de-usuario.md` §6. Linear is the live backlog;
  older "Ticket N" notes are not ticket ids.
- **OpenSpec is fed from the sub-issue, after reading the parent.**
  1. `/opsx:propose` (and apply) take the **sub-issue** (`DIS-n` / `CM-HU-*.k`) as the unit of
     work: change name, DoD, non-goals of the slice, and PR/Linear status. Never propose from the
     parent user story alone — that would expand the change to the whole HU.
  2. **Before** creating or applying a change, the agent MUST load via Linear MCP: the sub-issue
     **and** its parent (`parentId` / relations). The parent holds the HU framing the agent needs
     so it does not invent scope: Enhanced user story, acceptance criteria, technical context,
     Reality map and HU-level non-goals.
  3. Use the parent to frame and constrain; use the sub-issue to bound. If parent and sub disagree,
     stop and ask — do not silently widen the sub to match the parent, and do not drop a parent AC
     that the sub's DoD clearly inherits.
- Branch naming for a change: `feature/DIS-n-slug`. **Base branch: `final-project-CRN`**
  (author's rule, 2026-10-20): every new branch is created from it and every PR targets it
  (`gh pr create --base final-project-CRN`). It was cut from `feature/entrega-2-CRN` once Entrega 2
  closed (PR #60); `feature/entrega-2-CRN` takes no new work. `main` is not touched.
- **Linear status via MCP** (agents, per sub-issue `DIS-n`):
  1. Starting work → set status to **In Progress**.
  2. Verification succeeds → set **In Review** or **Done**, and leave a comment linking the
     OpenSpec change.
  3. **Language of Linear text (project exception to `base-standards.md` §2 “tickets in
     English”):** every comment, status note, and human-facing update written **into Linear**
     MUST be **Spanish only** — one language per comment, no Spanglish, no mixing English and
     Spanish in the same sentence. Identifiers may stay as-is (`DIS-11`, `schema-graph-l1`,
     file paths, command names). Code, commits, OpenSpec artifacts and ADRs remain English. Pull
     requests (title and description) are Spanish too — see the PR exception in
     `base-standards.md` §2.
  4. Language exception, evaluator guides (DIS-102, author decision 2026-10-19): `docs/DEMO.md`,
     `docs/CONFIDENCE.md`, `docs/DEPLOYMENT.md` and `docs/TESTING.md` are written in Spanish, like
     `readme.md`; commands, pasted output, identifiers, error codes and paths stay verbatim. Every
     other document follows `base-standards.md` §2.
- **Tracking deferred findings** (after `/adversarial-review`, `/verify-against-spec`, or any
  author decision to leave a gap open). A finding that is **not** fixed in the current change
  MUST leave the change with an owner and a place that stays queryable. A note only in an
  archived `design.md`, or only on a ticket that is about to close, is not enough.

  Every deferred Minor/Major (and every accepted product risk that still needs a follow-up)
  is classified as exactly one of:

  | Destination | When | Where it lives |
  |---|---|---|
  | **A. Fix now** | Product invariant, or a hole this change introduces | `/opsx:update` + delta in the same change |
  | **B. Successor ticket** | A later sub-issue already owns it (e.g. DIS-24, DIS-10) | Spanish Linear comment on that ticket **and** a Follow-ups line in `design.md` with the id |
  | **C. Explicit debt** | No near-term owner on the roadmap | Prefer **one** Linear issue `Deuda: <change-id>` (checklist). Lighter option, author-approved: **one** Spanish checklist comment on the current ticket (readable after Done) **and** the same list in `design.md` Follow-ups. Never one issue per minor. |
  | **D. Accepted forever** | Conscious, permanent risk | Spec / non-goals and `design.md` only; **no** Linear issue |

  Without a destination, the change is not ready to archive.

  **Archive ritual** (three checks):
  1. **Inbound:** notes from earlier changes *into* this ticket — close them or reassign.
  2. **Outbound:** every review gap has A/B/C/D with a Linear link or an explicit “accepted”.
  3. **PR / Linear In Review:** short table of remaining gaps and links in the Spanish status
     comment.

  **Do not:** open one Linear issue per stylistic or process minor (e.g. “RED was not observed”,
  “spec not yet committed”); leave the gap **only** on the closing ticket’s comment without
  `design.md` Follow-ups; invent retrospective issues for the whole OpenSpec archive. The rule
  applies from adoption forward; older archives are cleaned when that ticket is touched again.

  Agents enforce the classification via the `adversarial-review` skill; humans confirm Linear
  creates/comments before the agent opens issues.

## Operational constraints

- Never commit `.env` or any secret. Copy `.env.example` → `.env` for local values. Do not put real
  LLM keys in the repo.
- `AUTHOR_HASH_SALT` (DIS-35) keys the pseudonymisation of commit authors. It is required: the git
  adapter refuses to start without it (no unsalted fallback). Never commit a value; changing it
  changes every `author_hash`. Only the composition root reads it, with
  `authorHashSaltFromEnv(process.env)`; `createSimpleGitHistory({ authorHashSalt })` takes it as a
  parameter.
- LLM behaviour follows **Closed product decisions** above (optional credentials, evaluation mode).
- `ALLOWED_REPOS_DIR` empty = indexing disabled (fixtures-only mode); the API reads it too since DIS-9
  (with `AUTHOR_HASH_SALT`, for `POST /api/projects/{projectId}/index`). Indexing only runs inside that
  root. It must be a directory **only the user running Codemind can write to**, holding only trusted
  repositories: whoever can write inside it can swap a directory of a repository path for a link
  between the confinement check and git's read, or point git at objects outside the root with a
  `.git` file (`gitdir:`) or `objects/info/alternates`. This residual risk is accepted, not closed
  in code (DIS-85 follow-ups, DIS-86 design D7); see `docs/DEPLOYMENT.md`.
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

- **The web's test setup carries two workarounds, and Tailwind scans every file** (DIS-58).
  `tests/support/jsdom-setup.ts` unmounts after each jsdom test and drops `init.signal` from
  `Request` so React Router can navigate under jsdom; a loader or action would then lose its abort
  signal in tests, so the ticket that adds one revisits it. The web's `.test.ts` files must stay in
  Node (a `.test.tsx` runs in jsdom, where Node's `fetch` rejects jsdom's `AbortSignal`). Tailwind 4
  generates a utility for any class-like string in any source file, tests included, so `index.css`
  excludes `*.test.ts(x)` with `@source not`; a new non-UI folder with class names needs the same.
- **Screen 2 writes its pending text twice, and axe in jsdom cannot see colours** (DIS-66). The
  persistent `sr-only` status region repeats «Buscando evidencia…» next to the visible, `aria-hidden`
  copy, so `getByText` on that text finds two elements (target the visible one with
  `selector: '[aria-hidden="true"]'`, or the region with `getByRole('status')`). Never key or remount
  the status `p`: screen readers announce a change of text in an element that already exists, and
  "The status region announces every outcome" pins it as the same element. A colour break never fails
  `test:a11y` (axe reports `color-contrast` as incomplete without layout); colours are guarded by
  `theme.test.ts` and the browser pass.
- **Some CI gates run against stubs, on purpose.** `lint`, `lint:architecture` and `typecheck` are
  real and must pass, and so is CI's `db:migrate` → `db:rollback` → `db:migrate` step. Mutation
  testing has real mutants since DIS-23 (`packages/core/src/knowledge/`, 86.82 % at DIS-23 merge, 90.09 % with DIS-35, 92.23 % with DIS-36; `packages/core/src/index/` since DIS-84, 95.11 % for all of core; 96.48 % for `index/` with DIS-85; threshold
  `MIN_MUTATION_SCORE=70`).
  These are intentional scaffolding, not bugs — do not "fix" a stub by faking behaviour.
- **`.gitleaks.toml` allows synthetic findings by exact value, not by line** (DIS-87). Moving the
  planted fixture secrets, the session-log key in `docs/ai-sessions/` or the example PEM blocks in
  `openspec/specs/security-gateway/spec.md` (and its archived copy) changes nothing; editing the
  matched text does (for a PEM block, anything between `BEGIN` and `END`, which in those specs spans
  whole scenarios) and turns the `secrets` job red until the entry is regenerated per
  `fixtures/README.md` → "CI secret scan", after checking the finding is synthetic with an
  unredacted local run. Two traps found on DIS-87: a `path:rule:line` fingerprint hides *any* secret
  on that line, and gitleaks 8.30.1 turns allowlist `paths` into a whole-file skip, so the entries
  are value-only. Read gitleaks JSON as UTF-8 on Windows, or non-ASCII text no longer matches.
- **The infra packages are stubs, not empty.** All 9 workspaces (`core`, `analyzers/{php,typescript}`,
  `adapters/{store-postgres,llm,git}`, `api`, `cli`, `web`) have a `package.json` and a `src/index.ts`,
  but the analyzer/adapter ones are empty stubs (dependency-cruiser flags them as `no-orphans` warns);
  since DIS-30 `analyzers/typescript` is no longer one (see "The TypeScript analyzer" below).
  They resolve in `npm ls`; do not expect real behaviour from them yet. Exceptions: `store-postgres`
  implements `StorePort`: writes (`createProject`, `saveGraph`, DIS-23) and reads (`getProject`,
  `listProjects`, `findSymbols`, `neighbors`, DIS-24); `adapters/git` implements `GitPort`
  (`createSimpleGitHistory`, DIS-35) and `SourceTreePort` (`createGitSourceTree`, DIS-85; `readFileAt`,
  DIS-28);
  `adapters/llm` implements `LlmPort` (`llmConfigFromEnv`, `createOpenAiCompatibleLlm`, DIS-17;
  `createEvaluationLlm` and the selector `createLlm`, DIS-18), and `store-postgres` also implements
  `sumCostSince` (DIS-18).
- **The LLM adapter never puts endpoint or runtime text into an error** (DIS-17,
  `packages/adapters/llm/src/`). Every failure is `LlmUnavailable` (core, `packages/core/src/llm/`)
  with a closed `reason` (`http-status`, `invalid-response`, `network`, `timeout`, `not-configured`,
  `dimension-mismatch`; `evaluation-mode` since DIS-18) and only numbers, plus `systemCode` for `network` when the error's or its
  cause's `code` matches `^E[A-Z]+$` or `^UND_ERR_[A-Z_]+$` (undici's `UND_ERR_HEADERS_TIMEOUT` /
  `UND_ERR_BODY_TIMEOUT` are `timeout` instead); a detail that does not apply is an absent property.
  `LLM_TIMEOUT_MS` accepts 1 to 3600000 (DIS-103; the range of `CACHE_BUILD_TIMEOUT_MS`): without an
  injected `fetch` the client sends with `longFetch` (`packages/adapters/llm/src/long-fetch.ts`,
  `node:http` / `node:https`), so undici's 300 s header/body timeouts behind Node's `fetch` never
  apply. No `cause`,
  no response body, so a key echoed by a server cannot leak. Failures are classified by error name
  both on `fetch` and on the body read: a stalled body is `timeout`, a body cut mid-way is `network`.
  `usage` (or one of its fields) absent or `null` counts as `0`; a present field that is not a
  non-negative integer is `invalid-response`; only `choices[0]` is validated. `embed()` rejects any vector whose length is not `EMBEDDING_DIMENSIONS` (1536, the
  `vector(1536)` columns): Ollama's `nomic-embed-text` (768) always fails with `dimension-mismatch`
  until DIS-46 picks the model and migrates the columns. `llmConfigFromEnv(env)` is the only reader
  of the `LLM_*` variables and `DAILY_BUDGET_USD`; the CLI's `ask` (DIS-40) and the API's
  `composeFromEnv` (DIS-76) call it, before any connection. Tests fake `fetch` (`tests/unit/llm/`), and
  `tests/unit/llm/default-transport.spec.ts` drives the default transport against a local `node:http`
  server with the global `fetch` stubbed; of the adapter, only `long-fetch.ts` is in Stryker's `mutate`.
- **Evaluation mode and the daily ceiling** (DIS-18). `createLlm(config)` builds
  `createEvaluationLlm` (mode `evaluation`, never touches `fetch`, every call fails with
  `LlmUnavailable` reason `evaluation-mode`; `not-configured` still means live without
  `LLM_EMBED_MODEL`) or the live client; it never applies the ceiling. The composition root wraps the
  live model with core's `withDailyBudget(llm, { store, dailyBudgetUsd })` only when
  `cfg.dailyBudgetUsd` is set: before every `complete`/`embed` it reads `StorePort.sumCostSince(start
  of the UTC day)` and throws `BudgetExhausted` when `spent >= ceiling` (stateless, so a restart
  cannot reset it). Since DIS-74 every `explain` writes its `query_log.cost_usd` (with core's
  `costUsd`), verification included, so the ceiling sees `explain`'s whole spend. The spend of an `ask`
  in flight is seen only when its row is written: each `ask` in flight can overshoot by one `answer`
  call plus `MAX_VERIFY_CALLS_PER_ANSWER` (20) `verify` calls, so N concurrent runs by N times that. Re-seeding (`db:seed`, `make up`) deletes the
  sample projects' `query_log` rows by cascade and so resets that day's recorded spend for them. `withDailyBudget` throws `RangeError` for a
  ceiling that is not a positive finite number, and a `sumCostSince` failure rejects unchanged without
  calling the model (fail closed). With a ceiling, `llmConfigFromEnv` requires an
  exact-name entry in `COST_TABLE` for `LLM_MODEL`, `LLM_MODEL_VERIFY` (when set) and
  `LLM_EMBED_MODEL` (when set): `llama3.2:3b` is not `llama3.2`. `COST_TABLE` ships only the
  `.env.example` Ollama models at 0; a paid entry needs its official pricing URL and the date checked.
- **`GitPort.readHistory` never lets an identity out of its structured fields** (DIS-35). Authors
  become `authorHash` (HMAC-SHA256 keyed by the trimmed `AUTHOR_HASH_SALT` of the trimmed,
  lower-cased e-mail as `.mailmap` maps it, or of the name when the e-mail is blank; rule in core,
  `knowledge/author-hash.ts`) and messages lose their seven identity trailers (`Co-authored-by`,
  `Signed-off-by`, … `knowledge/commit-message.ts`). Other free text of a message body
  (`Helped-by:`, `Cc:`, e-mails in prose) is stored as written: a declared non-goal. `prNumber`
  comes from the subject only (last `(#N)`, else `Merge pull request #N`) and only in
  0..2147483647 (`PR_NUMBER_MAX`, the range of the 32-bit `pr_number` column). The log is read in
  one `git log -z --numstat --no-renames` pass: NUL framing, so control characters in names or
  messages cannot shift fields and paths arrive raw (never C-quoted). It is **streamed** (DIS-100):
  `LogParser` (`parse-log.ts`) splits on NUL as bytes as chunks arrive and keeps only the current
  incomplete value, so the raw output is never held whole (the parsed `GitHistory` still is);
  `parseLog` is the one-chunk wrapper. A numstat path that is not valid UTF-8 drops its link (no
  indexed file can have it); its commit stays. A rename is a delete plus an
  add, so links can name paths that are no longer in the snapshot, and `saveGraph` rejects a link
  whose file is not in `files` — `indexRepository` (DIS-85) drops them first.
- **`co_changed` edges come from a pure core rule, `coChangeEdges(fileCommits, knownPaths)`**
  (DIS-36, `knowledge/co-change.ts`). One edge per unordered pair of files sharing at least
  `MIN_CO_CHANGES` (2) commits, `weight` = shared / commits touching either (Jaccard), `resolution`
  `heuristic`, `extractor` `git`. Commits with more than `MAX_FILES_PER_COMMIT` (100) files are
  ignored entirely; line counts and author data are never used. The pair is stored **once**, from
  the path smaller in byte order to the other, so a consumer that wants the symmetric relation
  (DIS-94) traverses with `neighbors(…, 'both')` (or `'in'`), added by DIS-27. `knownPaths` must be the snapshot's `files` paths (paths outside it still count
  in the denominators), and because `saveGraph` replaces all edges, `co_changed` edges must be saved
  in the **same** snapshot as the analyzers' edges; `indexRepository` (DIS-85) does both.
- **`repoPath` must be a repository's top-level directory.** The fixtures sit inside the Codemind
  repository, so without their own `.git` plain `git` would silently read Codemind's history. The
  adapter compares `git rev-parse --show-toplevel` with `repoPath` by real path and throws
  `NotAGitRepository` otherwise. Do not replace this with simple-git's
  `checkIsRepo(IS_REPO_ROOT)`: it tests "`--git-dir` is `.git`" and rejects linked worktrees.
- **`saveGraph` takes a full snapshot of the project.** Files are upserted in place by
  `(project_id, path)` and keep their ids, so `file_commit`, `evidence` and the stale trigger keep
  working. Files missing from the snapshot are deleted; right before, in the same transaction,
  the `current` claims with evidence citing them become `stale` (the trigger fires only on UPDATE,
  and the delete cascades the evidence). Symbols and edges are replaced wholesale.
  Commits and `file_commit` rows are only ever added to: on upsert, an optional value the snapshot
  omits keeps the stored one (`COALESCE`), while a file's `kind`, `loc`, `content_hash` and
  `redacted` always follow the snapshot. It validates the graph in core first (`InvalidGraph`,
  before `ProjectNotFound`) and never changes `project.framework`, which is fixed at
  `createProject`.
- **Graph reads are per project and hold ids only until the next reindex** (DIS-24).
  - Every read filters by `project_id` first. An unknown project, or an id that is not a
    hyphenated UUID, fails with `ProjectNotFound`, and the malformed id fails without SQL. Blank
    search terms, terms containing a NUL character (Postgres rejects NUL as text), empty kind lists, `hops` outside 1..`MAX_HOPS` (3) and a
    `direction` other than `out`/`in`/`both` (DIS-27) fail with `InvalidStoreQuery`, also without SQL; so does an invalid `since` of `sumCostSince` (DIS-18), the
    one global read (no project id): the sum of `query_log.cost_usd` from `since` across every
    project, `NULL` ignored, `0` without rows.
  - Symbol ids change on every `saveGraph`, while file ids survive while the path stays. Name a
    symbol across reindexes by its `SymbolRef` (`file`, `name`, `startLine`), which every symbol
    result carries. Every symbol result also carries `fileId` (DIS-27), the id of its file, with the
    file-id validity; use it to seed a traversal from the symbol's file. And `fileKind` (DIS-28), the
    stored `kind` of its file (never recomputed with `fileKindOf`).
  - `neighbors` is one `WITH RECURSIVE` statement over mixed nodes (symbol and file seeds and
    results). Its optional fifth argument `direction` (DIS-27) is `'out'` by default (source →
    target), `'in'` (target → source) or `'both'` (either way at each step); the statement has four
    `LATERAL` branches switched by `$6`, never interpolated. It returns each node once at its minimum
    distance, and never returns the seeds. Each result carries `resolution` (DIS-28): `exact` when
    some minimum-distance path follows only `exact` edges, else `heuristic`. The walk deduplicates
    by `(node, depth, all_exact)` with `UNION` (no per-path `visited` array), so it produces at most
    2·(hops+1)·N rows: a 40-file `co_changed` clique at 3 hops went from 56 356 rows to ≤ 320, and no
    `statement_timeout` is needed. No trigram index on `symbol.name`: revisit when a project passes
    ~50 000 symbols or a search exceeds 50 ms (DIS-28 design D4). Consumers that
    want only symbols filter by `type`. Reached nodes are also filtered by project, so even an
    edge pointing into another project (which the writer never produces) returns nothing foreign.
  - Names and paths sort in byte order (`COLLATE "C"`), not by the database locale: `Zeta` before
    `alpha`. The local database is `en_US.utf8`, so dropping the collation changes the order.
  - `findSymbols` is a case-insensitive, literal substring match (`ILIKE` with `\`, `%`, `_`
    escaped).
- **The Context Engine is pure core over `StorePort`** (DIS-27, `packages/core/src/context/`).
  `anchor(store, projectId, question)` searches symbol names (`findSymbols`, never signatures) with
  `questionTerms(question)`: lower case, diacritics removed, split on non-letters/digits, tokens under
  3 characters and `ANCHOR_STOPWORDS` (Spanish + English) dropped, plus the 5-letter prefix of every
  token of 6+ characters, so `validan` reaches `CouponValidator`. A question without terms returns
  `[]` without any search (so without checking the project). `expand(store, projectId, anchors, hops)`
  checks `hops` first, returns `[]` for an empty anchor, and otherwise sends **one** `neighbors` call:
  seeds = the anchor symbols plus each of their files once (the only way to reach `co_changed`),
  kinds `calls`/`tested_by`/`describes`/`co_changed`, direction `'both'`. It returns symbols **and**
  files (the doc reached by `describes` is a file). The question is never logged.
  Since DIS-28 `anchor` searches at most `MAX_QUESTION_TERMS` (16) terms and keeps at most
  `MAX_ANCHORS` (32) symbols (those matching most terms, returned in first-found order).
  `buildContextPack({ store, source, workspaceRoot }, { projectId, question, tokenBudget = 8000,
  hops = 2, anchors? })` turns anchor + expansion into the pack DIS-39 prompts with (given `anchors`
  skip the symbol search; each must carry a well-formed `fileId`, else `RangeError` naming `anchors`):
  - `rankCandidates`: lexicographic key, no weights — distance, origin (`anchor` < `exact` <
    `heuristic`), file kind (`test` < `source` < `doc` < `config`), lexical match of name/path,
    input order.
  - Span text is read with **one** `SourceTreePort.readFilesAt(root, project.indexedCommit, paths)`
    over the distinct paths of every candidate in rank order (ADR
    `docs/adr/20261011-span-text-read-from-git-at-indexed-commit.md`; batched since DIS-39): the
    database holds no content. The git adapter answers it with at most six processes (two repository
    checks, the commit check, one `ls-tree -r -z` of the whole tree without sizes, one
    `cat-file --batch-check` over the requested objects, one `cat-file --batch`): Q1 on acme-shop went
    from 145 processes and 10.8 s to 6 and 0.58 s (`openspec/changes/explain-use-case/reports/`); no
    cap on the files a pack reads (author decision). Each file is redacted with `redactSecrets` before
    any span is cut or token counted. A symbol gives its lines; a file node a whole-file span (no `symbol`).
  - `fitToTokenBudget`: atomic spans, greedy with skip; spans of one file never overlap (a
    contained or cutting-across candidate is dropped, not counted in `omitted`; a containing one
    replaces what it contains). `estimateTokens` = `ceil(code points / 4)`, declared on every pack
    as `estimator: 'chars-div-4'`.
  - Results: `ok` with `tokens` ≤ `tokenBudget` and `baselineTokens` (whole redacted files, each
    once), or `empty` with `no-anchor` (no traversal, no project read, no git read) or
    `over-budget`. `tokenBudget` outside 1000..32000 and a relative `workspaceRoot` are `RangeError`
    before any store call; a project without `indexedCommit` is `SourceUnavailable('not-indexed')`.
  - **`workspaceRoot`, never `process.cwd()`**: the seed's `rootPath` is relative
    (`fixtures/<name>`) and `npm -w packages/api run dev` runs with cwd `packages/api`, so a
    relative root is joined to the injected absolute `workspaceRoot` (the CLI computes it from
    `import.meta.url`; the API's `composeFromEnv` too since DIS-76: three levels up from
    `packages/api/src/`). An absolute `rootPath` is used as is.
- **Claims, typing and the model-output quarantine are pure core** (DIS-38). Zod is a dependency of
  `@codemind/core` since then (same `^4.6.5` as `adapters/llm`).
  - `packages/core/src/knowledge/{claim,evidence}.ts`: `claimSchema` / `evidenceSchema` /
    `provenanceSchema` with the types inferred from them. They mirror `0002_history-claims`: an `L2`
    `FACT` neither type-checks nor validates, `L2` needs a provenance (`model`, `promptHash`,
    `inputSpans`, `createdAt`), `confidence` is `null` or in [0, 1] (`explain` writes a computed value
    since DIS-72; claims written before keep `NULL`). `CLAIM_*` and
    `EVIDENCE_VERIFICATIONS` equal the SQL enums (a test reads the migration). Line numbers are capped at
    `SPAN_LINE_MAX` (2 147 483 647, the Postgres `integer`). `knowledge/` is a
    seed fingerprint input, so touching these files means `npm run seed:build`. Since DIS-39
    `claimSchema` has three variants: `L1` (provenance without `statementType`), `L2` `INFERENCE`
    (`statementProvenanceSchema`, `statementType` `FACT`/`INFERENCE` required) and `L2` `UNKNOWN`
    (no `statementType`); the database does not check it (ADR
    `docs/adr/20261013-fact-statements-stored-as-l2-inference.md`). Every text field rejects U+0000
    (`textWithoutNul`, also used by the quarantine).
  - `packages/core/src/explain/typing-rules.ts`: `typeStatement(chain)` is `FACT` only when every cited
    span's `origin` is `anchor`/`exact` (fail closed: an unknown origin is `INFERENCE`; an empty
    chain throws `RangeError`). It reads the origin as the Context Engine gave it (a
    replacing span carries the best origin) and never sees a `layer`; a `FACT` statement is stored as
    an `L2` `INFERENCE` claim with `provenance.statementType: 'FACT'` (DIS-39, ADR above).
  - `packages/core/src/explain/statement-schema.ts`: `parseModelOutput(text, knownEvidenceIds)` —
    size (`MAX_MODEL_OUTPUT_BYTES`, UTF-8) → JSON (the whole output, or the body of exactly one
    Markdown code fence ` ``` ` / ` ```json ` enclosing it, with only JSON whitespace around it and LF
    or CRLF line breaks, DIS-72 design C9; text outside the fence, a BOM or a non-breaking space is
    still `invalid_json`; size and event use the raw text) → strict schema (no `type` field; limits in
    `explain/limits.ts`, character lengths in **code points**, as Zod 4.6.5 measures them) → repeated
    ids → unknown ids. Any failure discards the whole output with a `SchemaViolationEvent`.
  - Gotcha: **every object schema is `z.strictObject()`**; Zod 4's `z.object()` strips unknown keys
    silently, which would let `"type":"FACT"` vanish instead of discarding the output.
  - Gotcha: closed sets inside exported core schemas use `z.literal(ARRAY)`, not `z.enum(ARRAY)`:
    TypeDoc expands the enum's object type into undocumented properties and `docs:coverage` warns.
  - Gotcha: `SchemaViolationEvent` is **not** part of `AuditEvent` (`index/audit-event.ts`), whose
    `sortEvents` reads `file`. It carries subcode, byte size, SHA-256 and `{ path, code }` per issue —
    never a Zod `message`, `keys` or value; at most `MAX_EVENT_ISSUES` (20) issues plus `issueCount`. Core returns it; the transport logs it (DIS-39).
- **`explain` is the one-pass use case over the Context Engine** (DIS-39,
  `packages/core/src/explain/explain.ts`). `explain({ store, source, llm, workspaceRoot, now,
  verificationCache, costTable? }, { projectId, question, tokenBudget?, hops?, useCache? })`, in this order: Zod request check
  (`InvalidExplainRequest`, `field` only, never the value; question 1..`MAX_QUESTION_CHARS` = 1 000
  code points, not blank, no U+0000 since DIS-74) → `anchor` once → `no-anchor` → answer cache lookup (DIS-21, unless `useCache: false`) → `llm-required` in
  evaluation mode (pack not built) → pack with the given anchor → `over-budget` →
  `sanitizeForPrompt` (DIS-41) → `findClaimsOverlapping` (before the model) → one
  `complete({ purpose: 'answer' })` → quarantine (`invalid-model-output`) → `no-evidence` when there
  is no statement → type → syntactic check → output policy (`broken-evidence` when nothing is
  left) → semantic check (`verify` calls) → entailment policy → `saveClaims`. Answer:
  `kind: 'unknown'` with `reason` (`UNKNOWN_REASONS`), or `kind: 'answered'` with `persisted`,
  `usage` (DIS-74: totals, `generation`, `verification`, `baselineTokens`, `savingsPct`, `latencyMs`,
  `cacheHit`, `true` only for a hit of the answer cache) and `confidence` (DIS-72; `UNKNOWN` has neither).
  `ClaimWriteFailed` from `saveClaims` → `persisted: false`, the prompt ids `E1…En` and one
  `{ type: 'claims_not_persisted', code: 'store-write-failed' }`; any other error propagates.
  The `LlmUnavailable` / `BudgetExhausted` of the `answer` call propagate; a cached question is
  served before any model call, so it answers with the ceiling spent, while a miss (or
  `useCache: false`) still propagates them (DIS-21 D11). Those of a `verify` call do not: they leave
  the citations `cited` (DIS-70).
  - Gotcha (DIS-42, `core/explain/stale-refresh.ts`, `refresh-prompt.ts`): after the claim write (stored
    or not) an `answered` answer refreshes its due stale prior claims through `refreshStaleClaims`: at
    most `MAX_STALE_REFRESHES` (3) stale `L2` `INFERENCE` claims with an object and a
    `provenance.statementType`, newest first, one at a time. Each gets one more `answer` call with its
    own prompt (`buildRefreshPrompt`: the stored object as untrusted data under the id `claim`, its
    `claimFlags`, and the pack's sanitised spans that overlap its evidence under `E1…En`;
    `prompt.ts` and `sanitize.ts` are untouched, so the answer fingerprint does not change), the
    quarantine, the typing and `verifyAnswer` at the pack's commit and root, then
    `StorePort.refreshClaim`. Not refreshed → the claim is shown `stale` and one
    `{ type: 'stale_claim_not_refreshed', claimId, code }` event follows `claims_not_persisted`
    (`STALE_CLAIM_NOT_REFRESHED_CODES`: `no-evidence`, `invalid-model-output`, `broken-evidence`,
    `llm-unavailable`, `budget-exhausted`, `superseded`, `store-write-failed`; only a UUID and a code, never
    text). `LlmUnavailable` / `BudgetExhausted` of a refresh's `answer` call stop the rest; any other error
    propagates after the row. The refresh's calls count in the usage and the row (`sumVerificationUsage`
    adds its checks to the answer's; `CallState.verifySumMs` is the latency a rejection row reports). `UNKNOWN`
    answers, cache hits and evaluation mode refresh nothing, and a cached answer keeps the prior claims
    it was saved with (design R12).
  - Gotcha (DIS-21, `core/cache/`, `knowledge/cache-entry.ts`): the answer cache key is
    `normalizeQuestion` (NFKD, no combining marks, `toLowerCase`, `\p{P}`/`\p{S}` → space, spaces
    collapsed, trimmed), deliberately not the anchor's search terms. After `no-anchor` and before
    `llm-required`, unless `useCache: false`, `findCacheEntry` runs once; an entry whose response
    passes `parseStoredResponse` (strict Zod; a failure is a miss, never an error) is recorded with
    `touchCacheEntry(…, startedAt)` and answered by `answerFromCache` (`events: []`, zero tokens and
    cost, stored baseline, `cacheHit: true`) in both modes: no pack, no prior claims, no model, no
    claim; its row has the cache flag and zero counters. A failure of the lookup or the hit record
    propagates with no row. A cacheable answer (`isCacheable`: persisted with every statement
    `current`, or `UNKNOWN` `no-evidence`) is saved (`saveCacheEntry`, replacing the key's entry,
    whatever `useCache` is) after `saveClaims` and the second clock read, before the row:
    `CacheWriteFailed` / `ProjectNotFound` → `{ type: 'answer_not_cached', code }` before
    `query_not_logged`; any other error is thrown after the row was sent. A hit is never saved again.
    `cache_entry` has no unique key: the Postgres store keeps one entry per (project, key) with
    `pg_advisory_xact_lock` + delete + insert, and a lookup takes the newest of duplicates.
    `invalidateCache(projectId)` has no caller yet (DIS-9, PH-07).
  - Gotcha: `ExplainEvent` (`SchemaViolationEvent | ClaimsNotPersistedEvent | SanitizationEvent |
    EvidenceBrokenEvent | EntailmentUnverifiedEvent | AnswerLanguageMismatchEvent |
    StaleClaimNotRefreshedEvent | AnswerNotCachedEvent | QueryNotLoggedEvent`) is **not** part of `AuditEvent`. Core never logs; the transport does.
  - Gotcha (DIS-104, `core/explain/question-language.ts`, `prompt.ts`): `detectLanguage(text)` is a pure
    rule with two closed word lists (`es`, `en`, or `null` with fewer than two signals or no strict
    majority; backtick pairs ignored, code-like tokens skipped, `¿`/`¡` and accented words count as
    Spanish). A question it decides is `es` gets `EXPLAIN_SYSTEM_PROMPT_ES` (the generic message with an
    explicit Spanish instruction and a Spanish last line); English and undecided questions keep
    `EXPLAIN_SYSTEM_PROMPT` byte for byte, so their prompt hash does not move. `ExplainPrompt` carries
    `questionLanguage`. When the question is `es` and the live `answer` text (not the statements) reads
    `en`, an answered answer gets `{ type: 'answer_language_mismatch', expected: 'es' }` (codes only, `info`
    level in the transports, after `entailment_unverified` and before `claims_not_persisted`); never on
    a cache hit or an `UNKNOWN`. The answer is returned unchanged and stays cacheable, so a later hit
    serves it with `events: []`.
  - Gotcha (DIS-74, `core/explain/usage.ts`, `usage-meter.ts`): `explain` wraps the model it was given
    in `meterLlm` (outside `withDailyBudget`, so a call the ceiling blocks never counts) and writes **one
    `query_log` row per call** through `StorePort.saveQueryLog`, after the claim write and on its own:
    on every return (`UNKNOWN` included; zero counters without a model call; `baseline_tokens` `NULL`
    without a pack) and on every rejection after a resolved call (the spend so far, then the original
    error, whatever happened to the row). No row when it fails before any call resolved. A row write
    that fails with `QueryLogWriteFailed`, `ProjectNotFound` (a `no-anchor` question with no search
    terms never checks the project) or `InvalidStoreQuery` (`invalid-entry`: the model reported more
    tokens, or the call cost more, than the row's columns hold; the LLM adapter does not cap them) still
    returns the answer, with `{ type: 'query_not_logged', code }` last in its events; any other write
    error propagates, a failure to get a connection included (claims already stored, spend not
    recorded: accepted, adversarial review F2). Explain reads `now` twice when it writes a
    row (start, which is also every claim's provenance instant, and just before the row); in live mode
    the semantic check reads it twice more in between. `verify_calls` counts only resolved verifier
    calls (cache hits never; a failed call's time is still in `verify_latency_ms`). The semantic check
    makes at most `MAX_VERIFY_CALLS_PER_ANSWER` (20, `explain/limits.ts`) calls; uncached pairs past it
    stay `cited` with reason `call-limit`, so the last statements lose `FACT`. `costTable` defaults to
    `COST_TABLE`. The in-memory store double keeps the rows (`queryLog()`) and takes
    `failQueryLogWrite`.
  - Gotcha (DIS-68, `core/verify/`): after typing, `explain` verifies the cited spans by re-reading
    git at `pack.commit` from `pack.root` (one more batched read per answer, each cited path once;
    uncited pack spans are not read), never at the project's current indexed commit. The expected
    text comes from `context/span-text.ts` (`redactedLines`, `spanText`), the same rule the pack
    cuts with: change it there only. A cut span maps to `cut: 'lines'` (one trailing `\r` dropped) or
    `'line-cut'` (first `MAX_EVIDENCE_TEXT_CHARS` code points), told apart by
    `TRUNCATION_LINE_CUT_MARK`; a cut span also passes its `originalEndLine`, checked against the file too. A broken citation is neither stored nor shown (ADR 20261014); it
    leaves an `evidence_broken` event (`EVIDENCE_BROKEN_REASONS` lives in `explain-event.ts`), which
    `ask` writes at level `error`; no statement left → `UNKNOWN (broken-evidence)`. New `evidence`
    rows are `entailed` or `cited` (DIS-70); `broken` is never written. `verify/` may import no I/O
    built-in (`verify-no-io`) nor `explain/index.js` (cycle).
  - Gotcha (DIS-70, `core/verify/semantic.ts`): after the output policy, every kept (statement,
    citation) pair is checked by `verifyEntailment`: one `complete({ purpose: 'verify' })` per
    distinct pair the cache does not hold, in sequence (never `Promise.all`), with only the wrapped
    statement and excerpt (`verify-prompt.ts`, sharing `explain/untrusted-text.ts` with the explain
    prompt). Fail closed: an output that is not exactly `{"entails": boolean}` (≤
    `MAX_VERIFY_OUTPUT_BYTES`), an `LlmUnavailable` or a `BudgetExhausted` leaves the pair `cited`
    with an `entailment_unverified` event (`ENTAILMENT_UNVERIFIED_REASONS` lives in
    `explain-event.ts`, `ask` writes it at `info`); after the first unavailable/budget failure the
    other uncached pairs are not attempted. Any other failure propagates. `FACT` needs the typing
    rule's `FACT` **and** every citation `entailed` (`applyEntailment` in `verify/policy.ts`;
    `typing-rules.ts` is unchanged). The cache key is the SHA-256 of the request's messages (the
    model is not in it); `createInMemoryVerificationCache()` is an LRU of `MAX_VERIFICATION_CACHE_ENTRIES`
    booleans, and `ask` creates **one per run** (one per process), so it only saves pairs repeated in
    one answer; the API (DIS-78) keeps one per app, shared by its requests. `usage.verification`
    counts only `verify` calls; DIS-74 adds the generation and the totals around it.
  - Gotcha (DIS-72, `core/knowledge/confidence.ts`): `confidence(statements, { contradiction })` is
    pure, order-independent and has its own input types (`ConfidenceCitation`: file id, lines,
    `fileKind`, `origin` as a string, verdict), so `knowledge/` imports nothing from `explain/` or
    `context/`; `explain/claim-items.ts` maps a `VerifiedStatement` with `toConfidenceStatement`.
    Each claim stores the confidence of its statement alone and the answer carries the one of all its
    statements; both pass `contradiction: false` until DIS-71. An empty set or a statement without
    citation throws `RangeError`. `CONFIDENCE_WEIGHTS` / `EVIDENCE_SATURATION` are mirrored in the
    table of `docs/CONFIDENCE.md` and `tests/unit/knowledge/confidence-doc.spec.ts` fails when they
    differ: changing a weight means the code, the document (with the author's reason), the test run
    and `npm run seed:build` (`knowledge/` is a fingerprint input). Tests compute expected values from
    the exported constants, never hard-coded weights.
  - Gotcha (DIS-72, local Ollama): serve it with `OLLAMA_CONTEXT_LENGTH=16384`. Its default context
    cuts `explain`'s 5–7k-token prompt to about 2 000 tokens (`truncating input prompt` in its log),
    the system prompt is lost and every answer is `invalid-model-output`. On CPU one answer takes
    3.5–9 min: set `LLM_TIMEOUT_MS=1200000` (DIS-103 removed the 300 s cap; `docs/DEMO.md` →
    `Probar con un modelo real`). `cache:build` (DIS-26) passes its own `timeoutMs` to `createLlm`. On this project's Windows machine
    (GeForce GTX 970, 4 GB) Ollama's CUDA and Vulkan backends used to crash, so it ran on pure CPU.
    Since the NVIDIA driver update (582.66, CUDA 13.0) with Ollama 0.40.11 the GPU works: stop the
    tray app and every `ollama.exe` / `llama-server`, then run `OLLAMA_CONTEXT_LENGTH=16384 ollama
    serve` (its log shows `inference compute … library=CUDA compute=5.2`, through the `cuda_v12`
    library; the `cuda_v13` one skips the card, `cc=520`, which is expected). `qwen2.5-coder` does not
    fit in 4 GB: 9 of 29 layers go to the GPU (`offloaded 9/29 layers`, about 2.4 GB of VRAM). Measured
    on 2026-10-28 with the same 1 340-token prompt: prompt evaluation 48.5 tokens/s on the GPU against
    19.5 on pure CPU, generation about 5.5 tokens/s on both, so a `cache:build` answer, dominated by
    its prompt, takes roughly 2.5 times less. If the GPU crashes again, fall back to pure CPU with
    `CUDA_VISIBLE_DEVICES=-1 GGML_VK_VISIBLE_DEVICES=-1 OLLAMA_VULKAN=0 OLLAMA_LLM_LIBRARY=cpu
    OLLAMA_CONTEXT_LENGTH=16384 ollama serve` (its log must show `library=cpu`). Either way, run
    `DATABASE_URL=… LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_MODEL=qwen2.5-coder npm run
    cache:build` in the background, logging to a file; stop `ollama.exe` and any orphan
    `llama-server` afterwards.
    `llama3.2` does not produce strict JSON (`invalid-model-output`).
  - Gotcha (DIS-70, test doubles): `tests/support/scripted-llm.ts` routes `purpose: 'verify'` to
    `options.verify`, whose default entails every pair, so a test that does not set it gets
    `entailed`; in the shared `order` an `answer` call pushes `complete` and a `verify` call `verify`.
    Filter `requests` by `purpose` when counting model calls. `doubles()` gives `deps` a fresh
    verification cache unless `verificationCache` is passed.
  - Gotcha (DIS-41, `explain/sanitize.ts`): after `sanitizeForPrompt` the sanitised spans are the
    only spans. A span over `MAX_EVIDENCE_TEXT_CHARS` (8 000 code points) is cut, so the prompt's
    `endLine`, the claim's input spans, the evidence's last line and the excerpt are those of the kept
    part, and may be shorter than the pack span. The user message wraps the question and every
    evidence `text` in `<<<UNTRUSTED_DATA <id>>>>` markers, which `scripted-llm` scripts see; marker
    sequences inside (and in each evidence `path`, also matched against the patterns), and any forged
    `[TRUNCATED:`, are neutralised (U+200B) in the prompt only. `INSTRUCTION_PATTERNS` (the closed
    code set) lives in `explain-event.ts`; the regexes and `MARKER_SEQUENCE_SOURCE` in
    `sanitize.ts`. Sanitisation events come first in `events` of every answer that reached the
    prompt; `tests/unit/cli/*ask*` and the integration "stderr is empty" checks hold only because
    acme-shop matches no pattern and has no span over the limit.
  - Claim columns: subject = symbol of the first cited span (its path otherwise), predicate
    `CLAIM_PREDICATE_EXPLAINS` (`explains`), object = statement text; the question is never stored.
  - `StorePort.saveClaims(projectId, items)` writes one answer atomically (`atomically` with a
    `mapWriteError`: every database failure once the write started becomes `ClaimWriteFailed`, no
    cause, no database text; a connect failure propagates). `findClaimsOverlapping(projectId, spans)`
    returns at most `MAX_PRIOR_CLAIMS` (20), newest first, project-scoped, inclusive overlap; prior
    claims show a stale `FACT` as `INFERENCE` with `warning: 'stale-evidence'`. `explain` passes the
    pack's `commit` as `readAtCommit`: when a re-index moved the project's indexed commit during the
    answer, the claims are written `stale` and the answer's statements are shown stale too.
  - `StorePort.refreshClaim(projectId, claimId, item, readAtCommit)` (DIS-42, `store-postgres/src/claims.ts`
    `rewriteClaim`) rewrites one stale claim in its own row inside the same `atomically` wrapper:
    `CHECK_CLAIM_FILES` (project `FOR SHARE`, file ownership, indexed commit), then
    `LOCK_CLAIM_FOR_REFRESH` (`FOR UPDATE`); only a claim of the project that is `stale`, read at the indexed
    commit, is updated (`UPDATE_REFRESHED_CLAIM`: `status = 'current'`, `updated_at = clock_timestamp()`,
    `created_at` untouched), its evidence deleted (`DELETE_CLAIM_EVIDENCE`) and the item's inserted with new
    ids. It resolves `{ refreshed: true, evidenceIds }` or `{ refreshed: false }`; invalid arguments are
    `ProjectNotFound` / `InvalidStoreQuery('claimId' | 'claims')` before any statement, any database failure
    after the write started is `ClaimWriteFailed`. No migration. See ADR `20261029-stale-claims-refreshed-in-place`.
  - Gotcha: claims are written with `created_at = clock_timestamp()`, not the column default
    `now()` (the transaction start), so "newest first" holds for claims written in one transaction.
- **`indexRepository` writes nothing until the whole graph is valid** (DIS-85,
  `packages/core/src/index/index-repository.ts`). Phases, each reported once to the optional
  `onProgress` when it starts: `confine` (`confinePath` lexically, then `realPath` of root and repo
  and `confinePath` again; a root that does not exist → `IndexingDisabled`; an escape through a link
  → `ForbiddenPathError` naming the path **as requested**, never the real one), `read`
  (`SourceTreePort.readFiles`, then `selectIndexableFiles`: invalid paths, exact duplicates and NUL
  content are dropped and reported; a path is invalid when it holds a C0, DEL or C1 control, a
  bidirectional formatting character — U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069 — or
  U+2028/U+2029, `FORBIDDEN_PATH_CHARACTER`, DIS-100; zero-width characters are allowed), `redact` (every file, before the analyzer; framework detection
  from root manifests unless given), `analyze` (`contentHash` = SHA-256 of the **redacted** content),
  `history` (no `head` → `EmptyRepository`; commit messages redacted into `commitEvents`; orphan
  links dropped; `co_changed` edges from the unfiltered links), `save` (`validateGraph` plus a
  violation for each path the analyzer returned but was not given, or was given but did not return,
  as one `InvalidGraph`; then
  `createProject`, then one `saveGraph`). It opens no transaction: the composition root (DIS-86)
  passes `createPostgresStore({ transaction: client })` and commits or rolls back; with `{ pool }`
  project and graph are two transactions. Core logs nothing; `IndexReport` is the only output.
  `createGitSourceTree()` reads the **committed** tree with `git ls-tree -r -z -l --full-tree HEAD`
  (`ls-files` would read the index), read as bytes, and every kept blob through **one**
  `git cat-file --batch` process (DIS-100; it was one process per blob, ~6 s for acme-shop, now
  ~1.5 s per indexing; `acme-shop.spec.ts` timeout 20 s). Skip reasons, first that applies:
  `non-utf8-path` (path bytes not UTF-8, decoded strictly; reported with U+FFFD for display, never
  merged into a `duplicate-path`), `symlink` (`120000`), `submodule` (`160000`), `too-large`
  (stored size over `MAX_BLOB_BYTES` = 1 MiB, from `ls-tree -l`, never loaded), `binary-content`
  (non-UTF-8 blob); a leading BOM is dropped. Gotcha: for a **missing object** (corrupt repository,
  partial clone) `ls-tree -l` prints the size `BAD` and `cat-file --batch` answers `<oid> missing`,
  both with exit 0; the reader then runs one `git cat-file blob <oid>` to reject with git's own
  `fatal:` error — for any missing entry, even one that would only be skipped. Every git call of `adapters/git` goes through `readerGit` (simple-git: the
  repository checks) or `spawnReaderGit` (`repository.ts`, `node:child_process` without a shell: the
  reads that need stdin or a byte stream; `GIT_CONFIG` as `-c` pairs, `GIT_ENV` as the environment;
  tests wrap it through the internal `gitSourceTreeWith(spawnGit)` / `simpleGitHistoryWith(options,
  spawnGit)`, which the package does not export, so no caller can bypass the pinned config) with
  `GIT_CONFIG`, which disables the repository's
  fsmonitor, hooks, global attributes file and `log.showSignature` (it ran `gpg.program`); simple-git
  only accepts the first two with `allowUnsafeFsMonitor` / `allowUnsafeHooksPath`. Filters and
  textconv have no off switch: never add a work-tree command (`status`, work-tree `diff`) to a
  reader. Every git process gets `GIT_ENV`: a closed list of variables (PATH, home, temp) plus
  `LC_ALL=C`/`LANGUAGE=C`, so messages are English everywhere; simple-git refuses a full
  `process.env` that holds `EDITOR`. `LOG_ARGUMENTS` pins with flags what the repository's config
  could change (`--root`, `--no-renames`, `--no-ext-diff`, `--no-textconv`, `--no-relative`).
  `hasCommits` is false only for an unborn branch, orphan branches included (`symbolic-ref` names
  it); `assertRepositoryRoot` maps only git's "not a git repository" and "must be run in a work
  tree" (`.git` dir, bare repo) to `NotAGitRepository`, plus a missing path. A broken ref, git
  missing, a refused ownership, `EACCES` or any other failure propagates unchanged. `GIT_ENV` also
  sets `GIT_NO_LAZY_FETCH=1` (a partial clone's fetch ran the promisor's upload program; simple-git
  needs `allowEnvironment`), and `GIT_CONFIG` empties `mailmap.file`/`mailmap.blob` and sets
  `core.useReplaceRefs=false`. Git ≥ 2.45.1 (or the 2024-05 maintenance releases 2.43.4 / 2.44.1) is
  a prerequisite: older git ignores `GIT_NO_LAZY_FETCH` or `attr.tree` (readme 1.4). `GIT_CONFIG`
  pins `attr.tree=HEAD`; `GIT_ENV` adds `GIT_ATTR_NOSYSTEM=1`; `LOG_ARGUMENTS` ends with `--` (a
  work-tree file named `HEAD`). `hasCommits` probes `HEAD^{commit}`; the root check also requires
  `<dir>/.git` to be the repository's git dir or a `.git` file (beats a hostile `core.worktree`). `LOG_ARGUMENTS` also pins
  `--diff-algorithm=myers` and `-O/dev/null` (Git for Windows maps it; the NUL device fails). The acme-shop secret test
  checks every snapshot row (`row_to_json`) and the real analyzer's recorded input: the planted key
  yields no row, so only the recorded input catches an unredacted analyzer. The post-edit layer guard
  (`GUARD_HTTP_IN_BUSINESS`) matches transport imports, not the word `fastify`, which is a domain
  value in core.
- **The CLI `index` command owns the transaction and the output contract** (DIS-86,
  `packages/cli/src/commands/index-repository.ts`, `compose-index.ts`). `runIndexCommand(argv, deps)`
  builds a fresh `commander` command per call (`exitOverride`, output to the injected streams,
  `outputError` a no-op so `commander` never prints its own error text) and returns the exit code:
  `0` success, help or version; `1` domain, configuration or runtime error; `2` usage
  (`USAGE`, `UNSUPPORTED_LANGUAGE` — `php` and `typescript` are supported since DIS-32, each with its
  analyzer chosen by `defaultPorts(salt, language)`; `details.allowed` is `["php","typescript"]` —,
  `UNSUPPORTED_FRAMEWORK`). `index.ts` delegates to it when `argv[2] === 'index'`. Order: arguments,
  then trimmed `ALLOWED_REPOS_DIR` + lexical `confinePath`, then `AUTHOR_HASH_SALT` and
  `DATABASE_URL` (`MISSING_CONFIG`, `details.variable`), all before connecting; then one transaction
  (`OpenTransaction`: default `pg.Client` with a 10 s connection timeout + `BEGIN`, a failed connect
  or `BEGIN` → `DATABASE_UNAVAILABLE` without the URL), commit on success, rollback on any error
  (a failing rollback never hides the first error), release always. stdout carries only the report
  (text, or one JSON document with `--json`), written after the commit, so it stays empty on any
  error; stderr carries `[n/6] <phase>`, one JSON line per `secret_redacted` event (`source` `file`
  or `commit`, never the value; written only after the commit) and, on failure, `{"error":{code,message,details}}` plus
  `{"level":"error","event":"index_failed",code,exit}`. `toCliError` builds every message from the
  code and the path or name **as typed** and never reuses a domain or unknown error's message
  (`NotAGitRepository`/`EmptyRepository` hold the real absolute path); anything that is not a mapped
  domain error is `INTERNAL` (`unexpected error; nothing was saved`, or `…; the project may have been
  saved` when the `COMMIT` or anything after it fails: `CommitUncertain`). Every output goes through
  `toTerminalSafeJson` (`safe-json.ts`: JSON plus DEL, C1, the bidi formatting characters and
  U+2028/U+2029 escaped as `\uXXXX` — `TERMINAL_UNSAFE`, which `JSON.stringify` leaves raw; core
  rejects such paths, but a rejected path is still printed in `skipped`, DIS-100): the text report
  (`escapeLiteral`), `--json`, the log and the error line.
  Tests: `deps.ports` (sourceTree, git, analyzer, `store(client)`) and `deps.openTransaction` are
  test seams; unit tests use fakes (Stryker only runs unit tests), integration tests use the real
  adapters with a `SAVEPOINT cli_index` factory on the harness client — needed because the harness
  forbids `COMMIT`/`ROLLBACK` on `db()` and a rollback must undo a `createProject` that preceded a
  failed `saveGraph` (the store's own per-write `store_write` savepoints do not). Workspace packages
  the CLI imports by name resolve to `src/` in three places that must stay in sync: the Vitest alias,
  `tests/tsconfig.json` `paths` and `packages/cli/tsconfig.run.json`; a missing entry silently falls
  back to `dist/` through `"main"`. Trap: deleting `packages/*/dist` but not the build info makes a
  plain `tsc --build` report "up to date" and emit nothing; restore with `npx tsc --build --force`.
- **The seed build never commits and must be byte-for-byte reproducible** (DIS-91,
  `packages/cli/src/seed-build.ts`, `packages/cli/src/seed/`, `exportSeedRows` in
  `packages/adapters/store-postgres/src/export-seed.ts`; a dev script, not a `codemind` subcommand).
  `runSeedBuild` checks `AUTHOR_HASH_SALT` then `DATABASE_URL` (`MISSING_CONFIG`), computes the
  fingerprints, runs `buildOne('acme-shop', …, { log: () => {} })` (the optional `log` keeps the
  absolute `.git` path out of the output), then `indexWithEnvironment` with `fixtures/` as the allowed
  root (the environment's `ALLOWED_REPOS_DIR` is ignored), the temporary project name
  `__codemind_seed_build__`, a no-op `onProgress` and `createSeedTransaction(defaultOpenTransaction(url),
  read)`: its `commit()` reads the rows back on the same client and then **rolls back** — no `COMMIT`,
  no `DELETE`, an existing `acme-shop` is never touched. Any `INTERNAL` (including `CommitUncertain`)
  prints `seed build failed; nothing was written`. Output contract: success → stdout exactly
  `acme-shop: N files, N symbols, N edges, N commits -> <output>` (relative to the repo root, or the
  file name only when outside it) and empty stderr; failure → empty stdout and exactly one
  `{"error":…}` line. The file is written to `.<name>.<pid>.tmp` and renamed, so a failure never
  touches the previous seed. Format (`render-dump.ts`): header `codemind-seed-format: 1` +
  `analyzer-fingerprint` (every repository file that produces the rows — not `AUTHOR_HASH_SALT` nor
  the `git` binary version —: every file of
  `packages/analyzers/php/src`, `packages/core/src/index`, `packages/core/src/knowledge`,
  `packages/cli/src/seed`, `packages/adapters/git/src`, `packages/adapters/store-postgres/src`,
  `fixtures/history`, `fixtures/acme-shop` — any `.git` entry skipped —, the files
  `packages/cli/src/seed-build.ts`, `packages/cli/src/compose-index.ts`, `fixtures/build-history.mjs`,
  plus `deps:tree-sitter-php@…`/`deps:web-tree-sitter@…` from `package-lock.json`) +
  `contract-fingerprint` (`AnalyzerPort.ts` + `migrations/*.up.sql`), both
  SHA-256 over LF-normalised content in path order; ids are UUID v5 under `SEED_ID_NAMESPACE` of
  NUL-separated natural keys prefixed by the project name (edge keys carry `#n`, twins ranked by
  weight); `is_sample = true`, `root_path = 'fixtures/acme-shop'`, dates = the `HEAD` commit's; ISO
  UTC timestamps, `String(n)` doubles, `E'…'` with `\uXXXX` for controls other than LF (a raw `\r`
  would fight `eol=lf`); no free text right before a hash or sha (gitleaks' `generic-api-key` counts
  the comma as an assignment), so `commit` writes `author_hash` before `message`. **Changing anything under the fingerprint inputs means rerunning
  `seed:build` and committing the seed.** Since DIS-32 (design D5) the analyzer fingerprint hashes, under
  `fixtures/acme-shop` and `fixtures/task-api`, only the files tracked by git (`git ls-files -z` at the
  repository root), so untracked or ignored files (`node_modules/`, `vendor/`, `.env`, logs, `dist/`)
  never change it and the old precondition `git clean -ndX fixtures/acme-shop` is gone; `seed:build`,
  `cache:build` and `verify` therefore need a git clone, not a ZIP (a failing `git ls-files` is their
  `INTERNAL`). `fixtures/task-api/package-lock.json` is tracked, so it is a fingerprint input: a local
  `npm install` inside `fixtures/task-api` that rewrites it changes the analyzer fingerprint. The
  fingerprint also covers `packages/analyzers/typescript/src` and `deps:typescript@…`. The empty `git diff` holds only with the same salt
  (PH-11): another salt changes every `author_hash`. In Git Bash, `TZ=… npm …` is rewritten for
  Windows programs; worker threads ignore `process.env.TZ`, so
  `tests/integration/cli/seed-build.spec.ts` runs in the `forks` pool, through the `seed-build`
  project of `test.projects` (DIS-105; it replaced `poolMatchGlobs`, removed in Vitest 4).
  Since DIS-92 the build also writes the web's sample-project constant
  `packages/web/src/data/sample-projects.ts` (`SAMPLE_PROJECTS`: id, name, language, framework and
  the file, symbol, edge and commit counts), **before** the seed, each with `writeAtomically`; a seed
  write that fails after the constant is `PARTIAL_WRITE` (rerun `seed:build`), and
  `seed build failed; nothing was written` covers only failures before any write. Every test that
  runs a successful build MUST pass a temporary `sampleProjectsPath` (and `outputPath`): the default
  is the versioned file in the checkout. `tests/unit/seed/sample-projects-coherence.spec.ts` fails
  when the constant and the seed disagree. **Regenerating the seed and the constant is the last
  commit before a PR, repeated after any later change (review rounds included) under
  `packages/adapters/store-postgres/src/`, `packages/cli/src/seed/`, `packages/cli/src/seed-build.ts`
  or `packages/cli/src/compose-index.ts`.**
- **Seed load (`db:seed`, DIS-92, `packages/cli/src/seed-load.ts` + `loadSeed` in
  `packages/adapters/store-postgres/src/load-seed.ts`; a dev script, not a `codemind` subcommand).**
  It checks `DATABASE_URL` and the seed before connecting: `INVALID_SEED` with `details.reason`
  `missing`, `empty`, `format` (no `-- codemind-seed-format: 1` in the leading `--` block, or an
  unreadable statement), `no-project`, or `not-sample` (**every** `INSERT INTO project` must set
  `is_sample = true`: a non-sample project loaded by the seed would survive the next `db:seed` and
  collide with its own name). `db:seed` executes the whole text, so the seed reader is the only filter:
  it accepts only `--` comments, blank lines and `INSERT`s into `project`, `file`, `symbol`, `edge`,
  `commit`, `file_commit`, each child row belonging to a project or file of the seed (else `format`).
  `projects` and the `db:seed` summary print a name, language or framework holding a control or
  bidi/separator character as its escaped JSON literal (`terminalSafeText` in
  `packages/cli/src/safe-json.ts`). Header and statements are read ignoring trailing spaces and CR, so a
  CRLF checkout loads. Then, in one transaction: deletes every
  `is_sample = true` project, fails with `PROJECT_NAME_TAKEN` if a non-sample project holds a seed
  project's name (checked with a `SELECT`, not from the server's localised `23505` detail), executes
  the seed and commits. Non-sample projects are never touched. **Each `db:seed` / `make up` deletes by
  `CASCADE` the `query_log`, `claim`, `evidence` and `cache_entry` rows of the sample projects**
  (design D2). Since DIS-39 `explain` writes `claim`/`evidence`, so every `db:seed` / `make up`
  deletes the claims `explain` stored for a sample project (acme-shop). Since DIS-26 `db:seed` also
  reads every `*.json` directly in `seeds/cache/` (name order; a missing or empty directory means
  none; subdirectories and other files are ignored) **before connecting**, checks each with
  `checkGoldenFile` (shape, file named `<project>.json` after a seed project, `questionNormalized` =
  `normalizeQuestion(question)`, unique ids and keys, every `response` a stored answered response)
  and fails with `INVALID_SEED` reason `cache` and `details.file` (message
  `<file> is not a loadable codemind golden file`, never a reason detail); then, after `loadSeed` and
  in the same transaction, saves each entry with the store's `saveCacheEntry` (new id, `hit_count` 0),
  so a failed save rolls the whole load back (`INTERNAL`). Golden fingerprints are not checked there
  (`verify`, DIS-44). stdout does not change. Its summary is
  the `make up` text: `2 projects loaded`, `  acme-shop  php/laravel  174 nodes · 170 edges` and
  `  task-api  typescript/fastify  102 nodes · 100 edges` (quoted in `readme.md` §1.4 since DIS-101;
  `task-api` joined with DIS-32, CM-HU-18.3). After a local `make up`, the database holds committed
  acme-shop and task-api samples with the seed's
  deterministic ids: integration tests that need no acme-shop, or that compare against seed ids, clear
  the projects they depend on inside their harness transaction first.
- **Golden answers (`cache:build`, DIS-26, `packages/cli/src/cache-build.ts` +
  `packages/cli/src/cache/`; a dev script, not a `codemind` subcommand).** Order, each step only after
  the previous one: the arguments `[--project <name>] [<id>...]` (`USAGE`, exit 1, `details.allowed`;
  every golden question must anchor a symbol of its project, DIS-32 SA10: a question whose first 16
  `questionTerms` match no symbol name answers `UNKNOWN` `no-anchor` before the cache is read and could
  never be golden, which is why task-api's Q1 and Q2 name `taskRoutes` and `buildPage`;
  `tests/unit/seed/golden-questions.spec.ts` checks it against the versioned seed), `DATABASE_URL`, the model
  configuration as `ask` reads it (evaluation mode → `MISSING_CONFIG` `LLM_BASE_URL`),
  `CACHE_BUILD_TIMEOUT_MS` (`INVALID_CONFIG`); the seed, read and checked as `db:seed` does, whose
  header fingerprints must equal the ones `seed:build` would write now (else `GOLDEN_STALE` reason
  `seed`: run `seed:build` first); with ids, the existing golden file (`GOLDEN_STALE` `missing`,
  `invalid`, `fingerprint` or `model`); then `buildOne('acme-shop')` and `git rev-parse HEAD` against
  the seed's `indexed_commit` (`GOLDEN_STALE` `seed`). Each golden question gets up to 3 attempts, each
  in its own transaction that runs `loadSeed`, `explain` (`useCache: false`, a fresh verification
  cache, no daily ceiling) and is **always rolled back**: the author's database never changes, the
  answers cite the seed's deterministic file ids and `priorClaims` is empty. `invalid-model-output`,
  `broken-evidence`, `no-evidence`, a non-cacheable answer (`not-cacheable`) and `LlmUnavailable`
  `timeout`/`network` are retried; `no-anchor`, `over-budget` and `unsafe-content` (the response
  JSON holds `AKIA[A-Z0-9]{16}`, an absolute repo/workspace root, `DATABASE_URL`, `LLM_BASE_URL` or
  `LLM_API_KEY`, raw or JSON-escaped) fail at once as `GOLDEN_NOT_CACHEABLE` `{ id, reason }`; any other
  model failure is `LLM_UNAVAILABLE` at once. stdout gets one line per attempt
  (`Q1: answered in <s> s (attempt n/3)` / `Q1: attempt n/3 not cacheable (<reason>)`) and, on success,
  `acme-shop: <n> golden answers -> seeds/cache/acme-shop.json`; stderr one JSON error line on failure.
  The file is written only when every requested question succeeded: `mkdirSync` of its directory,
  then `writeAtomically` (`packages/cli/src/cache/write-atomically.ts`, a copy of `seed-build.ts`'s,
  which is a seed fingerprint input and is only imported from). Requests go through `longFetch`
  (`packages/adapters/llm/src/long-fetch.ts` since DIS-103, re-exported by
  `packages/cli/src/cache/long-fetch.ts`; `node:http` with the caller's `signal` as the only limit),
  because Node's `fetch` ends any request at 300 s. **Format** (`golden-file.ts`): `format: 1`,
  `project`, `seed` (the seed header's two fingerprints), `answerFingerprint`, `generatedWith`
  (`model`, `verifyModel`), `entries` (`id`, `question`, `questionNormalized`, `response`,
  `reviews` — `{by, date}` per review: DIS-34 added `agent:claude-opus-5-5` to every entry; the
  golden answers are now reviewed by an independent agent panel (DIS-33, then DIS-107 after the
  analyzer fix regenerated them, then DIS-9 after the index pipeline extraction and DIS-10 after the incremental indexing regenerated them,
  then the DIS-10 r2 round after task-api `Q1` alone was regenerated, then the DIS-42 round after
  the stale claim refresh regenerated them, then the DIS-42 r2 round after task-api `Q2` and
  acme-shop `Q1` alone were regenerated, then the DIS-42 r3 round, the last DIS-42 round, after
  acme-shop `Q1` alone was regenerated once more:
  blind input, criterion first, signatures `agent:<model>`, report in `docs/golden-review/`, each
  round's files suffixed with its ticket, the current DIS-42 r3 round's `-dis-42-r3`); an `incorrect` one stays unsigned and
  goes to a successor ticket or, when the author keeps it in the same ticket, to a further round of
  that ticket (DIS-10 r2; DIS-42 r2 and r3); a regenerated entry comes back with empty `reviews` and needs a new
  panel); no generation time; canonical render = 2-space JSON in that key
  order, LF, final newline. **`answerFingerprint`** (`answer-fingerprint.ts`) = the seed's
  `fingerprint()` over `ANSWER_FINGERPRINT_FILES` (explain prompt and its language rule
  `question-language.ts` (DIS-104), untrusted-text, sanitize, limits,
  statement schema, typing rules; verify prompt and policy; confidence weights; normalize and
  response-cache); `context/` is out on purpose (DIS-26 D11). **Touching a seed fingerprint input stales
  the seed and, through `seed.*`, the golden file: regenerate in the order `seed:build` →
  `cache:build`.** Touching an answer fingerprint input stales only the golden file. The golden ids of
  claims and evidence are random UUIDs of the generating transaction (never looked up).
  `tests/unit/seed/golden-coherence.spec.ts` fails when the versioned golden file stops matching the
  seed's file rows, the golden questions or the canonical render.
- **`verify` and the fingerprint policy (DIS-44, D2;
  [ADR](./adr/20261017-stale-fingerprint-fails-verify.md)).** A stale seed or golden fingerprint
  fails `npm run verify`, locally and in the CI `verify` job, before any question. A PR that touches
  a seed fingerprint input (store adapter, `core/index`, `core/knowledge`, PHP analyzer, git adapter,
  fixtures, `packages/cli/src/seed/`, `seed-build.ts`, `compose-index.ts`) or an answer fingerprint
  input (`ANSWER_FINGERPRINT_FILES`) must run `npm run seed:build` then `npm run cache:build` locally
  (the salt and a live model are not in CI) and commit both files; regenerated entries need a new
  review. `verify.ts` and `packages/cli/src/cache/{compare-golden,seed-header}.ts` are not inputs.
  A `✗ … got UNKNOWN (llm-required): run npm run db:seed` line means the golden answer is not in the
  cache. The fingerprint ties the files to the code, never the database to the files: after pulling a
  regenerated seed or golden file, run `npm run db:seed` before `verify`, or a database seeded before
  shows field-level `✗` lines without the `db:seed` hint (the project check only compares name,
  sample flag, id and indexed commit). CI always seeds a fresh database. While `verify` runs (about
  3 s), the golden `cache_entry` rows are locked by its transaction (each hit updates `hit_count`
  before the rollback): an `ask` of a golden question on the same database waits for it, and a lock
  held elsewhere on those rows makes `verify` wait (no statement timeout is set).
- **The CLI `ask` command** (DIS-40, `packages/cli/src/commands/ask.ts`): `ask <project> <question>`,
  the transport of `explain`. Check order, all before any connection: the arguments (`USAGE`, exit
  `2`, fixed messages that never quote an argument; a question starting with `-` goes after `--`),
  the question as `explain` checks it (`INVALID_EXPLAIN_REQUEST`, exit `2`), `DATABASE_URL`
  (`MISSING_CONFIG`) and `llmConfigFromEnv` (`LLM_CONFIG_INVALID`, naming the variable only).
  Then a `pg.Pool` of its own (`application_name: 'codemind-ask'`, no transaction held while the
  model answers; each claim write commits on its own connection), probed with one `connect()`
  (`DATABASE_UNAVAILABLE`), always ended before it returns. `<project>` is the **name**, matched
  exactly (no trim, no case folding) through `listProjects`; an id is not accepted
  (`PROJECT_NOT_FOUND`). A live `LLM_*` with `DAILY_BUDGET_USD` is wrapped in `withDailyBudget`
  (which also gates every `verify` call). Each run passes `explain` a new in-memory verification
  cache (DIS-70); it never prints a statement's verification nor the answer's `usage`.
  stdout holds only the answer (statements `[FACT]`/`[INFERENCE]`, `[stale]`, cited spans, excerpts
  cut to 5 lines, prior claims, `note: claims not saved` last when not stored) or
  `UNKNOWN (<reason>)`; every untrusted text is escaped line by line. stderr holds the answer's
  events as JSON lines (`evidence_broken` at `error`, every other one, `entailment_unverified`
  included, at `info`) and, on failure, one `{"error":{…}}` line; the question never reaches it.
  Exit `0` for an answer or an `UNKNOWN`, `1` configuration, connection, domain or `INTERNAL`
  (`unexpected error`), `2` usage. **Since DIS-21, `ask` in evaluation mode (no `LLM_BASE_URL` nor
  `LLM_API_KEY`) prints the stored answer of a question that has an answer cache entry, exactly as any
  answer (no flag, nothing tells it apart), and `UNKNOWN (llm-required)` otherwise; the golden entries
  of the sample questions arrive with DIS-26, so until then only questions answered live are cached.**
- **The API base** (DIS-76, `packages/api/src/`). `buildApp(deps, options)` builds Fastify 5 without
  listening or reading `env` and returns it **not ready**, so tests (and the business routes of
  DIS-78 / DIS-9) add routes before `ready()`; routes declare Zod schemas only (own compilers in
  `plugins/zod-compiler.ts`, no type provider): request schemas with `z.strictObject`, response
  schemas with `z.object` (undeclared fields dropped). A non-Zod schema fails at `ready()`.
  Every error goes through `plugins/error-handler.ts`: a domain code is looked up first in the
  route's own table (`config: { domainErrors }`, DIS-78), then in the global `DOMAIN_ERRORS` (only
  `BUDGET_EXHAUSTED` → `429`); an unmapped one is `500 INTERNAL`. A code that only means something
  on one route (`PROJECT_NOT_FOUND` → `404` where a `projectId` is received) goes in that route's
  table, never in the global one. `POST /api/projects/{projectId}/ask` (DIS-78, `routes/ask.ts`)
  resolves the project with `getProject` before `explain`, keeps **one verification cache per app**
  (created at registration, not per request), writes the answer's events to `request.log` and
  returns only the public shape (`toPublicAnswer`: ids `ev-n`, `path` → `file`). Since DIS-21 it
  forwards `useCache` only when sent; a cached question answers `200` (`usage.cacheHit: true`) even
  with the daily budget spent, and evaluation mode answers from the cache when an entry exists. `AppOptions.explain`
  replaces the use case: a test seam only, as `AskCommandDeps.explain` in the CLI.
  **`POST /api/projects/{projectId}/index`** (DIS-9, `routes/reindex.ts`, `schemas/reindex.ts`) is the
  third product route: it **re-indexes a project that already exists** from its stored `root_path`,
  language and framework (it never receives a path, a language or a framework; body
  `z.strictObject({ incremental? })`; since DIS-10 `incremental` defaults to `true` (an incremental
  reindex) and `false` forces the full one; a request with no body is `{}`, through a `preValidation`
  hook), runs `reindexProject` (`packages/core/src/index/reindex-project.ts`, which shares
  `confineRepository` and `buildSnapshot` with `indexRepository`; since DIS-10 it also reads the index
  state with `StorePort.readIndexState` and plans with `planIncremental` in
  `packages/core/src/index/incremental-plan.ts`: files whose redacted-content hash changed plus their
  direct dependents are queued, and an unchanged repository at the stored `HEAD` takes a fast path that
  only invalidates the cache; the answer carries `mode`, `filesQueued` and `filesSkipped`; the analyzer
  still receives every file) to completion inside the
  request and answers `202` with the counters (a recorded deviation from backend-standards §6). The
  graph save and `invalidateCache` run in **one transaction** through `OpenedStore.transaction`, the
  transaction runner of the pooled store (`open-store.ts`: connect, `BEGIN`, a store bound to the
  client, `COMMIT`/`ROLLBACK`, release); core sees it as a plain `inTransaction` function. It has its
  own domain error table `REINDEX_DOMAIN_ERRORS` (fixed messages, details `{}`: `INDEXING_DISABLED`
  and `FORBIDDEN_PATH` `403`, `PROJECT_NOT_FOUND` `404`, `NOT_A_GIT_REPOSITORY`/`EMPTY_REPOSITORY`
  `503`; an invalid graph is `500 INTERNAL`), logs `reindex completed` with counters only and
  publishes `requestBody.required: false` in `/docs` (a `transformObject` in `plugins/openapi.ts`).
  `AppDeps.indexing?` (`IndexingDeps`) is composed only when **both** `ALLOWED_REPOS_DIR` and
  `AUTHOR_HASH_SALT` are set (the API reads them, optional, never failing start-up; give an absolute
  `ALLOWED_REPOS_DIR`, a relative one resolves against the process cwd `packages/api`); absent means
  `INDEXING_DISABLED`. `AppOptions.reindex` replaces the use case: a test seam only. The API now
  depends on `@codemind/analyzer-php` and `@codemind/analyzer-typescript`. Reindexing a sample project
  changes its seed fingerprint until `npm run db:seed` restores it.
  `composition.ts` is the API's only reader of `env` (`apiConfigFromEnv` → `INVALID_CONFIG`, then
  `llmConfigFromEnv`, then the store). **No `pg` in `packages/api`** (`api-no-sql`): the store
  comes from `openPostgresStore(url, { applicationName: 'codemind-api' })` of
  `@codemind/adapter-store-postgres` (probe connection, `DatabaseUnavailable` without the driver's
  text; the URL's own `application_name` wins). The CLI keeps its own `defaultOpenStore` (deferred,
  DIS-76 Follow-up C). `startApi` closes the store on `app.close()` and on a listen failure;
  `server.ts` is the only process shell. The rate limit is in memory, per socket IP
  (`trustProxy` off), and only applies to routes registered after it in `buildApp`.
- **Vitest can report success with no tests** (`passWithNoTests: true`). A green suite is not
  evidence that behaviour is covered.
- **The repo is mid-build (Entrega 2).** `verify` (DIS-44), `seed:build` (DIS-91) and `db:seed`
  (DIS-92) are real. The schema has migrations `0001`–`0003`, but only the L1 graph and history
  (`project`, `file`, `symbol`, `edge`, `commit`, `file_commit`) and, since DIS-39, `claim` and
  `evidence` (through `StorePort.saveClaims`, called only by `explain`) and, since DIS-21, `cache_entry`
  (through `saveCacheEntry` and `touchCacheEntry`, called only by `explain`) have a writer so far, and only
  `project`, `file`, `symbol`, `edge` and `claim`/`evidence` (`findClaimsOverlapping`) and `cache_entry` (`findCacheEntry`) have a reader. The git history reader (DIS-35) produces
  `commit`/`file_commit` rows and the co-change rule (DIS-36) `co_changed` edges; `indexRepository`
  (DIS-85) composes them, and the CLI `index` command (DIS-86) is its only caller outside tests.
  `db:migrate` / `db:rollback` are real and need `DATABASE_URL`: `npm run db:*` reads it from the
  root `.env` (a variable set in the shell wins), and `npm run up` loads `.env` before every step.
  Do not assume a working end-to-end flow exists.
- **Migration runner edge cases (known behaviour, DIS-11).** `db:rollback` with nothing applied
  prints `No migrations to run!` and exits 0 (no-op, symmetric with `db:migrate` when up to date).
  A whitespace-only `DATABASE_URL` is treated as unset (same error, exit 1). Rollback never drops
  the `vector` extension (shared with later migrations). Concurrent runs do **not** wait:
  node-pg-migrate's default advisory lock mode is `'fail'`, so a second run started while another
  holds the lock throws "Another migration is already running" (verified in DIS-12). Tests that
  migrate the shared DB in parallel use `migrateSharedDatabase()`, which retries only on that error.
- **DB integration specs are kept out of jobs that have no Postgres.** With `CI` set and no
  `DATABASE_URL`, `tests/integration/helpers/db.ts` throws on import, and so does
  `store/support.ts` through it (by design). The Frontend
  workflow therefore runs `npx vitest run tests/unit tests/harness tests/a11y packages/web` (since
  Vitest 4 the CLI `--exclude` does not reach the `test.projects`, DIS-105 D14), and Stryker uses
  `vitest.stryker.config.ts`, which excludes the same folder. New integration suites go under
  `tests/integration/` so they stay excluded. Locally, an aborted Stryker run leaves
  `.stryker-tmp/` behind (gitignored); since DIS-84 `vitest.config.ts` excludes it, so the suite no
  longer collects that sandbox (see the Stryker gotcha under Testing).
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
- **`KIT_PROTECT_SPECS` is a local patch to the kit's hooks.** `KIT_PROTECT_SPECS` in
  `.claude/sdd-harness.env` switches the confirmations of `protect-specs-and-tests.sh` (rewriting
  existing OpenSpec artifacts, existing tests, versioned migrations, kit doctrine): `"1"` asks, `"0"`
  stops asking. It is edited by hand and applies on the next tool call; never turn the hook off by
  removing it from `.claude/settings.json`. The `.env` deny, the `..` deny and the confirmation on
  `sdd-harness.env` stay on whatever its value; `block-dangerous-bash.sh` denies shell writes to
  `sdd-harness.env` (also reads with a `>` redirect, e.g. `2>/dev/null`); with `"0"`,
  `session-context.sh` warns at session start. Commit it only as `"1"`. A kit update replaces
  `lib.sh`, `protect-specs-and-tests.sh`, `block-dangerous-bash.sh` and `session-context.sh`:
  re-apply the patch afterwards (commit `chore(harness): add KIT_PROTECT_SPECS switch…`).
- **The spec audit gate is a local patch to the kit too.** `base-standards.md` §7.1 makes the
  `spec-auditor` review mandatory between propose and apply, and `.claude/hooks/spec-audit-gate.sh`
  (PreToolUse `Edit|Write`) enforces it: an edit under `PATH_SOURCE` (`packages/`) or `PATH_TESTS`
  (`tests/`) is denied while the branch's active change has no
  `openspec/changes/<change>/reports/*spec-audit*.md`. The branch's change is the active one whose
  name closes the branch name (`feature/DIS-38-claims-and-typing` → `claims-and-typing`), or the only
  active one; with several active changes and no match it lets the edit pass. `openspec/`, `docs/`
  and the rest stay free, so the report and the artifact fixes can always be written. Its switch
  `KIT_SPEC_AUDIT_GATE` in `sdd-harness.env` behaves like `KIT_PROTECT_SPECS` (by hand, warning at
  session start with `"0"`, commit only as `"1"`). A kit update replaces `lib.sh`,
  `session-context.sh`, `settings.json`, `base-standards.md`, `openspec-implement`, the `spec-auditor`
  agent (ticket check, open decisions, verdict, Linear tools, `opus`) and the Cursor rule
  `20-openspec.mdc`: re-apply the patch afterwards (commit `chore(harness): gate the apply on a
  spec-auditor review…`).
- **The autonomous-run switch is a local patch to the kit too** (DIS-106, ADR
  `docs/adr/20261020-kit-autonomous-mode.md`, guide `docs/AUTONOMOUS-RUN.md`). `KIT_AUTONOMOUS_RUN`
  in `.claude/sdd-harness.env` is edited by hand and committed only as `"0"`; with `"1"`
  `session-context.sh` warns at session start. Two modes, decided in `lib.sh`: *unattended* (the
  switch `"1"`, or a Cursor background agent) — no hook asks, each `ask` becomes an automatic check or
  a deny with the alternative, a missing `jq` denies, the spec-audit gate requires `APPROVED`; and
  *autonomous run* (the switch `"1"` only) — the agent may merge through `autonomous-merge-gate.sh`
  into `AUTONOMOUS_MERGE_BASE`, edits and shell writes to `.claude/`, `.cursor/` and the autonomous
  profile are denied, and this doctrine is relaxed: `docs/base-standards.md` §3 rules 2 (the
  `spec-auditor` `APPROVED` replaces the human plan gate), 3 (tests written without supervision),
  4 (only tests named in `tasks.md` or created on the branch change), 8 (the agent writes the "why"
  and marks it) and 9 (the agent merges through the gate), §7.1 step 3 (a `CHANGES REQUIRED` audit
  opens up to `AUTONOMOUS_AUDIT_ROUNDS` correction rounds, default 5, where the agent takes the
  author's decisions; ADR `docs/adr/20261026-autonomous-audit-correction-rounds.md`), and the
  "agent never merges" item of `docs/openspec-tasks-mandatory-steps.md`. A background agent with the switch `"0"` gets none of the
  relaxations. Always on: the shell guard parses commands (`shell-words.mjs`, one Node process per
  line), install detection sees flags before the package (`npm i -D x` asks), removing the kit
  contract is a write, a lone `rm` in the session scratchpad gets no decision, `.env.example` is
  readable, secret reads are checked for `Grep`/`Glob` too, `KIT_SECRET_ALLOWLIST`, and the hooks in
  Cursor (`.cursor/hooks.json`, `invoke.cjs --client cursor`). In an autonomous run the guard also
  denies kit paths in any spelling (junctions, UNC, case), `gh`/`git` aliases, kit paths in interpreter
  text, any non-read-only command naming a kit path (including `sed`), and lines too costly to check. Denials of a run go to the
  untracked `.claude/autonomous-denials.log`. `doctor.sh --autonomous` / `doctor.ps1 -Autonomous` is
  the preflight; it reads the base protection, so the active gh account must have admin access
  (`DisTinta`). A kit update replaces `lib.sh`, every hook under `.claude/hooks/` (new:
  `autonomous-merge-gate.sh`, `log-permission-denied.sh`, `vet-package.mjs`, `shell-words.mjs`, `paths.mjs` — the path and secret classifier the read and edit hooks call once per invocation),
  `invoke.cjs`, `settings.json`, `sdd-harness.env`, both doctors, `.cursor/hooks.json`, the Cursor rules
  `00-core.mdc` and `20-openspec.mdc`, the skills `verify-against-spec`, `adversarial-review` and
  `kit-health`, and `ai-specs/templates/autonomous/`: re-apply the patch afterwards (the DIS-106
  commits). `ci.yml` (hooks in the `runtime` filter), `vitest.stryker.config.ts` (harness excluded) and
  `.gitignore` are project files.
- **The hooks have a test suite, `tests/harness/`** (DIS-106). Each spec runs the real hook script
  through `invoke.cjs` in a temporary project (`mkdtemp` prefix `harness-`) with
  `tests/harness/support/run-hook.ts`; `gh`, `claude` and `docker` are `PATH` shims
  (`support/stubs.ts`), and the npm registry is a local HTTP server. The switches of the copied
  `sdd-harness.env` are pinned to their shipped defaults before each test's overrides, so a local hand
  edit does not leak into the fixtures. It runs in `npx vitest run` and in CI (`quality`, Ubuntu), and
  is excluded from Stryker. On Windows, Defender can block files that the git fixtures write
  (`open("b.php")` fails with "Invalid argument"): exclude `%TEMP%\harness-*` and `%TEMP%\codemind-*`.
  The PowerShell doctor has no runner in the suite.
- **The PHP analyzer now emits edges** (DIS-49): `imports` (file → class/interface/trait, one per
  top-level `use`), `extends`, `implements`, a route's `calls` (array-action routes
  `Route::<verb>('<uri>', [X::class, '<m>'])`, a new `route` symbol named `<VERB> <uri>`; string
  actions `'C@m'` were added as `heuristic` by DIS-97, see below), `tested_by`
  (class `X` → test class `XTest` that references it) — all `resolution: 'exact'`, `extractor:
  'php-treesitter-laravel'` — and `describes` (doc file → symbol, `resolution: 'heuristic'`,
  `extractor: 'doc-mention'`, matched only inside backticks/fenced code blocks, never in prose).
  Names resolve by **fully-qualified name only**, case-sensitive, from the file's own `namespace` and
  top-level `use` imports (never by short name): a name with no unique match in the input — a vendor
  class, an ambiguous short name held by two symbols — yields no edge, never a guessed one. A file
  declaring more than one `namespace` originates no name-based edge at all (its facts are discarded).
  `docs/pricing.md` therefore gets no `describes` edge (it never names a symbol inside code, only in
  prose headings): DIS-94's acceptance criteria assuming one is corrected there, not here (signed
  decision, fixtures unchanged). `compareEdges`/`sortUniqueEdges` (`packages/core/src/knowledge/edge-order.ts`)
  and `docMentionEdges`/`DOC_MENTION_EXTRACTOR` (`packages/core/src/knowledge/doc-mentions.ts`) are
  pure, language-independent rules in core, reused as-is by the TypeScript analyzer (DIS-30) with no
  changes to `packages/core`.
  The type gate is `npm run typecheck` (also in CI). A finer per-file check is a later chore.
- **The TypeScript analyzer** (DIS-30, `packages/analyzers/typescript`, `createTypeScriptAnalyzer()`).
  It parses every canonical `.ts` input (not `.d.ts`) with the `typescript` compiler API as one
  in-memory program, with no standard library, no `@types` and no disk access. It emits `class`,
  `interface`, `function` (any depth) and `method` symbols (`X::m`, `X::constructor`, `I::m`); since
  DIS-32 (design D1) a module-level `const` with one declarator whose initializer is directly an arrow
  or a function expression is a `function` symbol too (the whole statement is its span, `export`
  included, JSDoc excluded; no `calls` edge has it as endpoint, `let` / `var`, nested and destructured
  forms are not symbols; since DIS-107 `using` and `await using` declarations are excluded too, the
  rule being a `const` list, not any block-scoped one); other variables, types, enums, accessors and `declare` blocks are not symbols.
  `bySymbolOrder`, `keepFirst` and `uniqueInputs` live in `packages/core/src/index/analyzer-helpers.ts`
  and both analyzers import them from `@codemind/core` (the author's core exception of 2026-10-28;
  `byPath` stays duplicated). `index --language typescript` uses this analyzer. Edges, all `exact` with extractor
  `ts-compiler`: file → file `imports` (every import / export-from form, one per pair), class / interface
  `extends` and `implements` resolved by the `TypeChecker` (aliases followed, merged declarations never a
  target) and file → file `tested_by` (`<base>.test.ts` / `<base>.spec.ts` importing `<base>.ts`); `describes`
  edges come from core. Since DIS-31 (`calls.ts`) it also emits symbol → symbol `calls` (`exact`,
  `ts-compiler`, never `heuristic`) for the signature the compiler resolves with `getResolvedSignature`: an
  overload signature maps to the implementation with a body, abstract and interface method signatures are
  targets themselves, `new X()` / `super()` target only a constructor declared in `X` / the direct base,
  and an identifier or property access passed directly as an argument is a call to its one function or
  method declaration (how handlers are registered). A callee that only has a function *type* (a parameter,
  a local `const fn = a`, a union receiver) gives no edge. Callbacks (arrow functions, function
  expressions, object-literal methods) belong to the enclosing symbol, unlike PHP closures. It does not
  emit calls from module level, accessors, property initializers or static blocks, nor to receivers typed by
  a package or the standard library. Gotcha: sites 7 and 10 of the task-api batch (`fixtures/README.md`)
  have no edge by design (`fastify` and `Array.prototype.includes` are outside the input), so the
  "10 sites `exact`" of the DoD is 8 `exact` edges plus 2 sites without an edge (design Follow-ups E2, SA1).
  The compiler options come from the `compilerOptions` of the input `tsconfig.json` (`extends`, `references`, `files`, `include`, `exclude` ignored; unreadable →
  defaults plus one diagnostic). Not wired into the CLI until DIS-32. Gotcha (design D8): tests walk
  `fixtures/task-api` without `node_modules/` and `package-lock.json`, which exist only where someone ran
  `npm install` in the fixture.
- **The Table 2 reference lives in `fixtures/annotations/`** (DIS-80): 50 call sites per sample project
  in format 1 (`*.callsites.json`), annotated by two independent agents of different models and
  frozen by `tests/unit/docs/annotation-freeze.spec.ts` against the hashes of
  `docs/measurements/annotation-agreement.md`. Regenerate only with
  `node scripts/annotation-agreement.mjs merge`, which changes the hashes and fails that test; never
  edit those files.
- **Calls inside method bodies are `exact` only when the receiver type is declared** (DIS-52). The
  PHP analyzer emits `calls` (`exact`, `php-treesitter-laravel`) from a method `Type::m` for
  `$this->p->m()` (property `p` of the same type, promoted or declared, with a single named type — not
  nullable/union/intersection), `X::m()`, `new X()` → `X::__construct`, and `$this->m()` / `self::m()`
  / `new self()` on the own type. The target must be **declared in that type itself**: no inherited
  methods and no `__call`/`__callStatic` fallback for `exact`. A trait is never a target, and `new`
  targets a class only. Calls inside closures/arrow functions/anonymous classes (e.g. the bindings in
  `AppServiceProvider::register`) or inside a named class/function declared in a method body, static
  properties, typed parameters, locals, `parent::`, `static::`, `new static`, `?->` give no edge.
- **Facades and `__call` are `heuristic` `calls`, never `exact`** (DIS-61). When no `exact` target
  exists: `F::m()` on a class that *directly* extends `Illuminate\Support\Facades\Facade` resolves its
  own `getFacadeAccessor()` key (`'pricing'` or `X::class`) through a **binding table** built only
  from `$this->app->bind|singleton|scoped(KEY, CONCRETE)` in `register()` of a class directly
  extending `Illuminate\Support\ServiceProvider` (CONCRETE: `X::class`, or a closure/arrow function
  returning `new X(...)`); exactly one concrete class declaring `m` → `heuristic` edge to it. No
  binding, an ambiguous key, `app()->bind`/`App::bind`/`boot()`/`$bindings`, or an accessor `X::class`
  with no binding (never an implicit binding) → no edge. `$this->p->m()` / `$this->m()` on a class
  declaring `__call` → `T::__call`; `X::m()` on a non-facade class declaring `__callStatic` →
  `X::__callStatic` (inherited magic methods do not count). The binding closures still originate no
  edge (signed non-goal: the table is a lookup only). A `heuristic` edge is dropped when an `exact` one
  has the same kind/source/target — filtered explicitly in `buildPhpEdges`; since DIS-85
  `compareEdges` also ranks `exact` first on an equal key, so `sortUniqueEdges` keeps the exact one. Site 7 of the batch lands on `CarrierGateway::__call`, as `flatRateFor` has no
  symbol.
- **String routes, job dispatch and event dispatch are `heuristic` too** (DIS-97). A
  `Route::<verb>('<uri>', '<C>@<m>')` statement gets a `route` symbol like an array action; `<C>` is
  looked up **verbatim** as a fully-qualified name (no `use`, no `RouteServiceProvider` prefix), so
  only a class of the input declaring `<m>` gets the `heuristic` edge; a literal with an escape
  sequence (`'A\\B@m'`), interpolation, no or two `@`, an empty part or a leading `\` is no route at
  all. Array actions stay `exact`. Every route symbol spans its **whole statement**, chained calls
  included (`routes/web.php` `POST /checkout` is 13–15). `X::dispatch|dispatchSync|dispatchIf|dispatchUnless|dispatchAfterResponse()`
  → `X::handle` when `X` uses `Illuminate\Foundation\Bus\Dispatchable` **in its own body** (a parent's
  trait does not count) and declares `handle`; it wins over `__callStatic`. `event(new E(...))` /
  `\event(...)` → `L::handle` for each listener in the non-static `$listen` array of a class *directly*
  extending `Illuminate\Foundation\Support\Providers\EventServiceProvider`, read **per entry**: each
  `L::class` of an `E::class => [...]` value counts, while strings, method pairs and spreads are skipped
  without discarding the rest; `boot()` listeners and auto-discovery give nothing. The Laravel
  collectors (bindings, facade accessors, `$listen`) never read a class declared in a method **or
  top-level function** body (`LARAVEL_WALK_STOP`), and a multi-namespace routes file keeps its route
  symbols but no route edge. acme-shop yields
  47 `exact` `calls` (2 of them routes) + 11 `heuristic` (sites 6–10 and 12, plus five other callers)
  before DIS-98.
- **Eloquent attribute reads are `heuristic` `calls`; the PHP analyzer reports unresolved Laravel
  sites** (DIS-98). A read `$r->a` (not an assignment target, not `?->`, not `$r->a()`, `a` a plain
  name) whose receiver is `$this` in a model, `$this->p` with a typed property, or a **method
  parameter** with a single named type (not `?T`, not `= null`, not variadic) of a class *directly*
  extending `Illuminate\Database\Eloquent\Model` → that model's own `get{Studly(a)}Attribute`, else its
  own method `a`; columns give nothing, and so does a target equal to the caller (a getter `status()`
  returning `$this->status`). `++`/`--`, `unset`, destructuring and `foreach` targets are writes (no
  edge); `isset($p->a)` and `$p->a[] = …` are reads. A parameter keeps its declared type through the whole
  body (reassignment or `catch` shadowing is an accepted false positive). Parameters are used **only
  for reads**: `$order->lineCount()` is still no edge. In a chain only the typed link counts (`$order->customer->loyalty_tier` →
  `Order::customer`); the type of a read is never inferred. acme-shop yields 47 `exact` + **17**
  `heuristic` `calls` (site 4 → `Order::getSubtotalAttribute`, plus five more reads). `createPhpAnalyzer()`
  returns a `PhpAnalyzer` whose result is `PhpAnalysisResult` = `AnalysisResult` + `unresolved`
  (`{ path, line, source, reason }`, reasons `facade-unresolved`, `event-no-listener`,
  `job-no-handle`, `route-action-missing`; sorted, deduplicated): recognised Laravel patterns with no
  edge only — not columns, types outside the input, undeclared methods, closures or multi-namespace
  files. Inside those patterns an only-inherited `m` (facade) or `handle` (job) is listed: the analyzer
  does not follow inheritance. It lives in the PHP adapter, **not** in `AnalyzerPort` (author decision D1 on DIS-63). acme-shop
  reports `[]`.
- **Repeated input paths keep the first; a failed grammar load is retried; analyzers cannot import
  I/O modules** (DIS-96). When several inputs share a `path` (compared exactly: no normalisation, so
  `app/a.php` and `app/A.php` are distinct), the PHP analyzer analyses only the first in input order and
  discards the rest **before** parsing and indexing, each with a diagnostic
  `duplicate path "<path>"; kept the first` (no `line`), for any kind of file; the `AnalyzerPort`
  JSDoc states it. `indexRepository` (DIS-85) drops duplicates before the analyzer anyway. A rejected grammar load is
  forgotten, so the next `analyze` on the same instance loads it again. The dependency-cruiser rule
  `analyzers-no-io` forbids `packages/analyzers/**` from importing `fs`, `net`, `tls`, `dgram`, `dns`,
  `http`, `https`, `http2`, `child_process`, `worker_threads`, `cluster`, `vm`, `wasi`, `inspector`
  and `sqlite` (with or without `node:`); the only gaps are global `fetch` and `createRequire(...)`,
  which are not imports: only code review guards them (the Ghost scenario only proves the given path
  is not read). Symbols on one line are ordered by `endLine` descending, then `name` (not by
  containment: a later-ending sibling comes first). `tests/unit/analyzers/php/parser-load.spec.ts` is the first `vi.mock` of the repository: reset
  the mock and restore its delegating default in a `beforeEach` (Vitest 3 and later: `mockClear` only clears the
  call history; `mockReset` drops queued `…Once` values and restores the implementation the mock was
  created with, here the real loader, DIS-105 D12).
- **The security gateway is pure core: `redactSecrets` returns events, `confinePath` is lexical**
  (DIS-84, `packages/core/src/index/`). Rules, highest priority first: `private-key`, `jwt`,
  `aws-access-key-id`, `generic-high-entropy` (secret-like key, quoted value of ≥ 20 characters,
  Shannon entropy ≥ 3.5; only the value is replaced). A span claimed by a higher rule is never
  reported again by a lower one (`fixtures/task-api/src/config/env.ts` matches both AWS and generic:
  one `aws-access-key-id` event). Content is split on `\n`; every rule but `private-key` matches
  within one line; a trailing `\r` is kept, also on lines that become empty. Only the span becomes
  `[REDACTED: possible secret]`, the line count never changes, and `column` is 1-based in UTF-16
  units of the original line. `private-key` forms are checked c (closing on the header line), a
  (closing **directly after** the PEM body run: base64, `Name: value`, one empty line after such a
  header), b (otherwise: the block ends with the body run or the header; the first non-body line and
  a later `END` are left alone). **Known limitation, accepted (DIS-84):** the PEM body test is loose.
  A single-word line (`texto`, `end`, `else`, `fi`) is valid base64, and a YAML/HTTP-style line
  `nombre: valor` passes as a `Name: value` header. So after a header with no closing, such lines are
  emptied. It over-redacts and never leaks. After every `private-key` block the header search resumes on
  its last five characters (`SHARED_DASHES`), because a header may begin on the trailing dashes of the
  previous closing; those dashes stay in the earlier span and the event keeps the header's first-dash
  column (design D3). The span runs from the header's first dash to the block end; text
  before and after it on the end lines is kept, inner lines become empty. The AWS `\b` does not match
  after `_` (`X_AKIA…` is not redacted). `generic-high-entropy` is matched by maximal identifier run
  plus a sticky tail, not by the literal spec regex, which is quadratic on repeated keywords. The
  work around the regexes must stay linear too (design D3). Intervals per line are the only record
  of a claim. They are appended or merged, never inserted with `splice` or sorted. Overlap tests use
  a forward-only pointer. Each header line indexes its closings once, by label. One walk rebuilds each
  line and emits the events already in order. The first version took 76 s on a 1 MB line of JWTs.
  Headers with distinct labels and alternating JWT/AWS lines also went quadratic until the second
  review. The scenario "Redaction time grows linearly on adversarial lines"
  guards this. It has eleven timed cases in `tests/unit/index/secret-scanner.linear.spec.ts` (2 s each,
  inputs of at most ~5 MB) and two `n`/`4n` scaling checks in `secret-scanner.scaling.spec.ts` (fastest
  of five alternating runs per size, ratio below 8, times always printed; design D15).
  `vitest.stryker.config.ts` excludes both files, because instrumented code blows a wall-clock budget
  (design D14). A mutant that only
  slows the scanner therefore survives Stryker, and only `npx vitest run` catches it. Events
  never carry the value; core never logs them. `confinePath(requested, allowedRoot)` accepts iff
  `path.relative(root, resolved)` is `''`, or is not `..`, does not start with `..` + separator and
  is not absolute: `/repos/..x` is a valid child, `/repos-evil` is not. A blank root throws
  `IndexingDisabled` first. `ALLOWED_REPOS_DIR` is read only at the composition root (DIS-86), and
  `indexRepository` (DIS-85) repeats the check on the real paths before reading.
  `readFixtureFiles(root, ignoredDirs = ['.git'])` skips entries by name (Stryker's sandbox links
  `fixtures/task-api/node_modules` instead of copying it); the secret oracle test passes
  `['.git', 'node_modules']` because that folder exists locally but not in CI.
