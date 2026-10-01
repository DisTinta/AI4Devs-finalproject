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
- **`@codemind/core` resolves to its sources in tests** (DIS-23, the first cross-package import).
  Vitest aliases it to `packages/core/src/index.ts` (`vitest.config.ts`, inherited by
  `vitest.stryker.config.ts`), and `tests/tsconfig.json` has the matching `paths` entry. Outside
  Vitest (`tsx` scripts), it resolves through `node_modules` to `packages/core/dist/`, so run
  `npx tsc --build` first or you run stale core code. `store-postgres` and `adapters/git` have a project reference to
  core.
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
- **Git history tests (DIS-35, DIS-36), `tests/integration/git/simple-git-history.spec.ts`.** Its
  `beforeAll` rebuilds the `.git` of both fixtures with `node fixtures/build-history.mjs`
  (deterministic: same `HEAD` every time); it is the only spec that rebuilds fixtures, so two specs
  never race on them. Other cases use throwaway repositories under the OS temp dir with synthetic
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
- **An aborted Stryker run leaves `.stryker-tmp/sandbox-*`, and Vitest collects it.** The copy
  runs its own fixture rebuild in parallel and its tests fail. Delete `.stryker-tmp/` by hand
  before running the suite.

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
     file paths, command names). Code, commits, OpenSpec artifacts, ADRs and PR technical body
     remain English.
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
  testing has real mutants since DIS-23 (`packages/core/src/knowledge/`, 86.82 % at DIS-23 merge, 90.09 % with DIS-35, 92.23 % with DIS-36; threshold
  `MIN_MUTATION_SCORE=70`).
  These are intentional scaffolding, not bugs — do not "fix" a stub by faking behaviour.
- **The infra packages are stubs, not empty.** All 9 workspaces (`core`, `analyzers/{php,typescript}`,
  `adapters/{store-postgres,llm,git}`, `api`, `cli`, `web`) have a `package.json` and a `src/index.ts`,
  but the analyzer/adapter ones are empty stubs (dependency-cruiser flags them as `no-orphans` warns).
  They resolve in `npm ls`; do not expect real behaviour from them yet. Exceptions: `store-postgres`
  implements `StorePort`: writes (`createProject`, `saveGraph`, DIS-23) and reads (`getProject`,
  `listProjects`, `findSymbols`, `neighbors`, DIS-24); `adapters/git` implements `GitPort`
  (`createSimpleGitHistory`, DIS-35).
- **`GitPort.readHistory` never lets an identity out of its structured fields** (DIS-35). Authors
  become `authorHash` (HMAC-SHA256 keyed by the trimmed `AUTHOR_HASH_SALT` of the trimmed,
  lower-cased e-mail as `.mailmap` maps it, or of the name when the e-mail is blank; rule in core,
  `knowledge/author-hash.ts`) and messages lose their seven identity trailers (`Co-authored-by`,
  `Signed-off-by`, … `knowledge/commit-message.ts`). Other free text of a message body
  (`Helped-by:`, `Cc:`, e-mails in prose) is stored as written: a declared non-goal. `prNumber`
  comes from the subject only (last `(#N)`, else `Merge pull request #N`) and only in
  0..2147483647 (`PR_NUMBER_MAX`, the range of the 32-bit `pr_number` column). The log is read in
  one `git log -z --numstat --no-renames` pass: NUL framing, so control characters in names or
  messages cannot shift fields and paths arrive raw (never C-quoted). A rename is a delete plus an
  add, so links can name paths that are no longer in the snapshot, and `saveGraph` rejects a link
  whose file is not in `files` — the caller (DIS-85) must drop them first.
- **`co_changed` edges come from a pure core rule, `coChangeEdges(fileCommits, knownPaths)`**
  (DIS-36, `knowledge/co-change.ts`). One edge per unordered pair of files sharing at least
  `MIN_CO_CHANGES` (2) commits, `weight` = shared / commits touching either (Jaccard), `resolution`
  `heuristic`, `extractor` `git`. Commits with more than `MAX_FILES_PER_COMMIT` (100) files are
  ignored entirely; line counts and author data are never used. The pair is stored **once**, from
  the path smaller in byte order to the other, and `neighbors` follows source → target only, so a
  consumer that wants the symmetric relation (DIS-94) must query both endpoints until DIS-89 adds
  reverse traversal. `knownPaths` must be the snapshot's `files` paths (paths outside it still count
  in the denominators), and because `saveGraph` replaces all edges, `co_changed` edges must be saved
  in the **same** snapshot as the analyzers' edges (DIS-85).
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
    search terms, terms containing a NUL character (Postgres rejects NUL as text), empty kind lists and `hops` outside 1..`MAX_HOPS` (3) fail with
    `InvalidStoreQuery`, also without SQL.
  - Symbol ids change on every `saveGraph`, while file ids survive while the path stays. Name a
    symbol across reindexes by its `SymbolRef` (`file`, `name`, `startLine`), which every symbol
    result carries.
  - `neighbors` is one `WITH RECURSIVE` statement over mixed nodes (symbol and file seeds and
    results). It follows edges source → target only (no direction parameter yet, see DIS-89),
    returns each node once at its minimum distance, and never returns the seeds. Consumers that
    want only symbols filter by `type`. Reached nodes are also filtered by project, so even an
    edge pointing into another project (which the writer never produces) returns nothing foreign.
  - Names and paths sort in byte order (`COLLATE "C"`), not by the database locale: `Zeta` before
    `alpha`. The local database is `en_US.utf8`, so dropping the collation changes the order.
  - `findSymbols` is a case-insensitive, literal substring match (`ILIKE` with `\`, `%`, `_`
    escaped).
- **Vitest can report success with no tests** (`passWithNoTests: true`). A green suite is not
  evidence that behaviour is covered.
- **The repo is mid-build (Entrega 2).** `db:seed`/`seed:build`/`verify` are placeholders that
  no-op. The schema has migrations `0001`–`0003`, but only the L1 graph and history
  (`project`, `file`, `symbol`, `edge`, `commit`, `file_commit`) have a writer so far, and only
  `project`, `file`, `symbol` and `edge` have a reader. The git history reader (DIS-35) produces
  `commit`/`file_commit` rows and the co-change rule (DIS-36) `co_changed` edges, but nothing calls
  them yet outside tests (indexing is DIS-85).
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
