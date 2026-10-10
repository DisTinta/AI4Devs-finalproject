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
- Mutation testing: `npx stryker run` (`stryker.config.json`, targets `packages/core/src` and, since
  DIS-86, `packages/cli/src` minus its entry point `index.ts`). CI runs it when the `business` paths
  filter of `ci.yml` matches (`packages/core/**`, `packages/cli/**`, `tests/**`, Stryker and lock
  files), and guards
  it: it only runs once test files exist, otherwise it prints a warning and skips (Stryker's dry run
  fails with zero tests, and faking a test to force it green defeats the gate).
- CI docs-only skip: the `scope` job of `ci.yml` skips the whole `quality` job when a push to an open
  PR only touches `openspec/**`, `docs/**` or `*.md` (diff of that push, `before..after`) and
  `quality` was green or skipped on the previous head — e.g. the `/opsx:archive` commit. It always
  runs on PR open/reopen, on `main`, after a force-push or a non-green previous head. A skipped job
  counts as passed for required checks. Keep test-file edits (even comments, such as spec paths in
  test headers) out of the archive commit, or it runs in full.
- CI secret scan (DIS-87): the `secrets` job of `ci.yml` runs gitleaks 8.30.1 (official binary,
  pinned by SHA-256 in the workflow) on every PR and push to `main`. Own job: no `needs: scope`, no
  `if`, never skipped — a docs-only push skips `quality` but not `secrets`. No `npm ci`. It runs
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
  `tsconfig.run.json` maps `@codemind/core`, `adapter-git`, `adapter-store-postgres` and
  `analyzer-php` to their `src/`, so the CLI never runs a stale or missing `dist/` (DIS-86 design
  D10). `index` and `projects` are real: `npm run cli -- index <path> --name <name> --language php
  [--framework laravel|fastify|none] [--json]` (see the gotcha on the `index` command) and
  `npm run cli -- projects` (DIS-92: every stored project, one line each, read through
  `StorePort.listProjects` in a transaction it always rolls back; needs `DATABASE_URL`); `ask` and
  `impact` are stubs.
- Migrations: `npm run db:migrate` (apply all pending) / `npm run db:rollback` (revert the latest
  one) — `tsx packages/adapters/store-postgres/src/migrate.ts up|down`, node-pg-migrate with SQL
  files `NNNN_name.up.sql` / `NNNN_name.down.sql` in `packages/adapters/store-postgres/migrations/`
  (bookkeeping table `pgmigrations`). Three migrations exist: `0001_graph-l1` (project, file,
  symbol, edge), `0002_history-claims` (commit, file_commit, claim, evidence, query_log,
  cache_entry) and `0003_indexes-stale` (secondary and HNSW indexes, and the trigger that marks
  claims `stale` when a file's `content_hash` changes). Each `db:rollback` reverts **one** migration, the latest. Both need `DATABASE_URL` (non-zero exit without it); locally
  `postgres://codemind:codemind@localhost:5432/codemind` with the compose defaults.
- `npm run seed:build` (DIS-91) rebuilds acme-shop's history, indexes it without committing and
  rewrites `packages/web/src/data/sample-projects.ts` and then `seeds/graph-dump.sql`; needs
  `AUTHOR_HASH_SALT` (the author's development salt, from `.env`, which npm scripts do not load:
  export it) and `DATABASE_URL` of a migrated database (see Gotchas → seed). `npm run db:seed`
  (DIS-92) loads the seed: needs only `DATABASE_URL`, replaces every sample project in one
  transaction and prints `1 project loaded` plus one line per sample (see Gotchas → seed load).
  `verify` is still a **placeholder**: it prints a "pending Ticket …" message and exits 0.
- Local stack: `docker compose up -d` starts Postgres (`pgvector/pgvector:pg16`) on `5432`. On
  Windows, `make up` needs Git Bash/WSL; in native PowerShell run the `npm` scripts directly.

## Testing

- Framework: Vitest (root `vitest.config.ts`; no per-package vitest config yet).
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
  `direction`), reuses core's argument checks, sorts in byte order (`Buffer.compare`), and counts
  `findSymbols`/`neighbors` calls (before any check) so a test can assert "no search was sent".
  Writes and `sumCostSince` throw. It runs the `graph-store` read scenarios in
  `tests/unit/store/in-memory-store.spec.ts` (tests named `… (in-memory double)`). Known limit:
  case-insensitivity uses `toLowerCase`, which can differ from `ILIKE` on non-ASCII names. It lives
  in `tests/` on purpose: outside Stryker's `mutate` and core's `dist`.
- **acme-shop test subset** (`tests/support/acme-shop-graph.ts`): a real slice of
  `seeds/graph-dump.sql` (the `PriceCalculator` and `DiscountService` neighbourhoods, `CouponValidator`,
  `docs/pricing.md`). `tests/unit/context/acme-shop-graph-coherence.spec.ts` fails if any file,
  symbol or edge of it stops matching the seed; fix the subset by copying the values from the seed.
- **Workspace packages resolve to their sources in tests** (DIS-23 for `@codemind/core`, the first
  cross-package import; DIS-86 added `@codemind/adapter-git`, `@codemind/adapter-store-postgres` and
  `@codemind/analyzer-php`, which the CLI imports by name; DIS-17 added `@codemind/adapter-llm`, which
  its tests import by name). Vitest aliases each to its
  `packages/*/src/index.ts` (`vitest.config.ts`, inherited by `vitest.stryker.config.ts`), and
  `tests/tsconfig.json` has the matching `paths` entries. `npm run cli` does the same through
  `packages/cli/tsconfig.run.json`. Any other `tsx` script resolves them through `node_modules` to
  `packages/*/dist/`, so run `npx tsc --build` first or you run stale code. `store-postgres`,
  `adapters/git`, `adapters/llm` and `analyzers/php` have a project reference to core; `packages/cli` references all
  four.
- `tests/support/` holds helpers shared by unit and integration tests, such as `sample-graph.ts`,
  a synthetic `KnowledgeGraph` builder.
- **Hook order: Vitest 1.6 runs all hooks of one suite in parallel.** This is
  `sequence.hooks = 'parallel'`, the default here, and it applies to `beforeAll`, `beforeEach` and
  `afterEach` alike. A parent suite's hooks do run before a nested suite's.
  - Set up data in the test body, or in a `beforeEach` of a **nested** `describe`, which runs
    after the harness has opened the transaction.
  - A `beforeEach` next to `useTransactionPerTest()` calls `db()` too early. It fails with
    "db() is only available while a harness test is running…".
  - A `beforeAll` there races the shared migration.
  - Clean up in the test body, never in an `afterEach` that uses `db()`. The rollback removes the
    rows anyway.
- **Factory overrides set to `undefined` are ignored:** the default applies.
- **No concurrent tests under the harness.** `it.concurrent`, `describe.concurrent` and
  `sequence.concurrent` are not supported. The second test to start fails with
  "useTransactionPerTest() does not support concurrent tests…".
- The older store specs keep their own style, not migrated:
  - lifecycle tests use a throwaway database each;
  - constraint tests run in `withRollback` with per-test unique values.

  Four files migrate the shared DB, always through `migrateSharedDatabase()`:
  `graph-schema-constraints.spec.ts`, `history-claims-constraints.spec.ts`,
  `indexes-stale.spec.ts` and `helpers/harness.spec.ts`. No test rolls it back.
- Test data comes from `fixtures/` (`acme-shop`, `task-api`, `history`, `build-history.mjs`) and
  `seeds/graph-dump.sql`. `fixtures/**` is excluded from Vitest collection.
- **PH-22 — fixtures are an analyzer's input, never test-writable (DIS-47).** `createPhpAnalyzer()`
  (`packages/analyzers/php`) does no I/O over the analysed repository: it only reads the `SourceFile[]`
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
  the real fixtures' `.git` by hand, run `node fixtures/build-history.mjs`; no test does it. Other
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
     file paths, command names). Code, commits, OpenSpec artifacts and ADRs remain English. Pull
     requests (title and description) are Spanish too — see the PR exception in
     `base-standards.md` §2.
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
- `ALLOWED_REPOS_DIR` empty = indexing disabled (fixtures-only mode). Indexing only runs inside that
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
  but the analyzer/adapter ones are empty stubs (dependency-cruiser flags them as `no-orphans` warns).
  They resolve in `npm ls`; do not expect real behaviour from them yet. Exceptions: `store-postgres`
  implements `StorePort`: writes (`createProject`, `saveGraph`, DIS-23) and reads (`getProject`,
  `listProjects`, `findSymbols`, `neighbors`, DIS-24); `adapters/git` implements `GitPort`
  (`createSimpleGitHistory`, DIS-35) and `SourceTreePort` (`createGitSourceTree`, DIS-85);
  `adapters/llm` implements `LlmPort` (`llmConfigFromEnv`, `createOpenAiCompatibleLlm`, DIS-17;
  `createEvaluationLlm` and the selector `createLlm`, DIS-18), and `store-postgres` also implements
  `sumCostSince` (DIS-18).
- **The LLM adapter never puts endpoint or runtime text into an error** (DIS-17,
  `packages/adapters/llm/src/`). Every failure is `LlmUnavailable` (core, `packages/core/src/llm/`)
  with a closed `reason` (`http-status`, `invalid-response`, `network`, `timeout`, `not-configured`,
  `dimension-mismatch`; `evaluation-mode` since DIS-18) and only numbers, plus `systemCode` for `network` when the error's or its
  cause's `code` matches `^E[A-Z]+$` or `^UND_ERR_[A-Z_]+$` (undici's `UND_ERR_HEADERS_TIMEOUT` /
  `UND_ERR_BODY_TIMEOUT` are `timeout` instead); a detail that does not apply is an absent property.
  `LLM_TIMEOUT_MS` is capped at 300000: undici's default header/body timeouts behind Node's `fetch`
  end any request at 300 s anyway. No `cause`,
  no response body, so a key echoed by a server cannot leak. Failures are classified by error name
  both on `fetch` and on the body read: a stalled body is `timeout`, a body cut mid-way is `network`.
  `usage` (or one of its fields) absent or `null` counts as `0`; a present field that is not a
  non-negative integer is `invalid-response`; only `choices[0]` is validated. `embed()` rejects any vector whose length is not `EMBEDDING_DIMENSIONS` (1536, the
  `vector(1536)` columns): Ollama's `nomic-embed-text` (768) always fails with `dimension-mismatch`
  until DIS-46 picks the model and migrates the columns. `llmConfigFromEnv(env)` is the only reader
  of the `LLM_*` variables and `DAILY_BUDGET_USD`; no composition root calls it yet (DIS-29 /
  CM-HU-12). Tests fake `fetch` (`tests/unit/llm/`); the adapter is outside Stryker's `mutate`.
- **Evaluation mode and the daily ceiling** (DIS-18). `createLlm(config)` builds
  `createEvaluationLlm` (mode `evaluation`, never touches `fetch`, every call fails with
  `LlmUnavailable` reason `evaluation-mode`; `not-configured` still means live without
  `LLM_EMBED_MODEL`) or the live client; it never applies the ceiling. The composition root wraps the
  live model with core's `withDailyBudget(llm, { store, dailyBudgetUsd })` only when
  `cfg.dailyBudgetUsd` is set: before every `complete`/`embed` it reads `StorePort.sumCostSince(start
  of the UTC day)` and throws `BudgetExhausted` when `spent >= ceiling` (stateless, so a restart
  cannot reset it). The ceiling **cannot trigger until DIS-74 writes `query_log.cost_usd`** (with
  core's `costUsd`); until then the spend reads `0`. `withDailyBudget` throws `RangeError` for a
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
    file-id validity; use it to seed a traversal from the symbol's file.
  - `neighbors` is one `WITH RECURSIVE` statement over mixed nodes (symbol and file seeds and
    results). Its optional fifth argument `direction` (DIS-27) is `'out'` by default (source →
    target), `'in'` (target → source) or `'both'` (either way at each step); the statement has four
    `LATERAL` branches switched by `$6`, never interpolated. It returns each node once at its minimum
    distance, and never returns the seeds. Consumers that
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
  files (the doc reached by `describes` is a file); ranking, budget and `no-anchor` are DIS-28. The
  question is never logged.
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
  (`USAGE`, `UNSUPPORTED_LANGUAGE` — only `php`, `typescript` says "not available yet (CM-HU-18)" —,
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
  `seed:build` and committing the seed.** Before regenerating, `git status --porcelain fixtures` and
  `git clean -ndX fixtures/acme-shop` must both print nothing: ignored files under the fixture
  (`vendor/`, `.env`, logs) change the fingerprint but not the rows. The empty `git diff` holds only with the same salt
  (PH-11): another salt changes every `author_hash`. In Git Bash, `TZ=… npm …` is rewritten for
  Windows programs; Vitest 1.6 worker threads ignore `process.env.TZ`, so
  `tests/integration/cli/seed-build.spec.ts` runs in the `forks` pool (`poolMatchGlobs`).
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
  (design D2; no writer exists yet, DIS-26 will reload its cache inside `db:seed`). Its summary is
  the `make up` text: `1 project loaded` and `  acme-shop  php/laravel  174 nodes · 170 edges`,
  **which differs from the illustrative `2 projects loaded` block of `readme.md` §1.4 until
  CM-HU-18** (PH-02). After a local `make up`, the database holds a committed acme-shop with the seed's
  deterministic ids: integration tests that need no acme-shop, or that compare against seed ids, clear
  the projects they depend on inside their harness transaction first.
- **Vitest can report success with no tests** (`passWithNoTests: true`). A green suite is not
  evidence that behaviour is covered.
- **The repo is mid-build (Entrega 2).** `verify` is a placeholder that no-ops; `seed:build`
  (DIS-91) and `db:seed` (DIS-92) are real. The schema has migrations `0001`–`0003`, but only the L1 graph and history
  (`project`, `file`, `symbol`, `edge`, `commit`, `file_commit`) have a writer so far, and only
  `project`, `file`, `symbol` and `edge` have a reader. The git history reader (DIS-35) produces
  `commit`/`file_commit` rows and the co-change rule (DIS-36) `co_changed` edges; `indexRepository`
  (DIS-85) composes them, and the CLI `index` command (DIS-86) is its only caller outside tests.
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
  `DATABASE_URL`, `tests/integration/helpers/db.ts` throws on import, and so does
  `store/support.ts` through it (by design). The Frontend
  workflow therefore runs `npx vitest run --exclude 'tests/integration/**'`, and Stryker uses
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
  the mock and restore its delegating default in a `beforeEach` (Vitest 1.6 `mockClear` keeps queued
  `…Once` values; `mockReset` drops the default implementation).
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
