## Context

See `proposal.md` → Why. What exists and is reused as it is:

- `seeds/graph-dump.sql` (DIS-91, format 1): header comments (`-- codemind-seed-format: 1`, two
  fingerprints, a "do not edit" line), then explicit-column `INSERT`s in FK order — 1 `project`
  (`id, name, root_path, language, framework, is_sample, …`, acme-shop,
  `a794456d-6d1b-5b55-a360-13fec83dc7bc`), 53 `file`, 121 `symbol`, 170 `edge`, 32 `commit`,
  59 `file_commit`. No `DELETE`, `ON CONFLICT`, transaction or `SET`. `symbol` rows reference their
  `file_id`, not the project; every other table carries `project_id`.
- Schema: `project_name_key UNIQUE (name)`; every child table hangs from `project` with
  `ON DELETE CASCADE` (`file`, `symbol`, `edge`, `commit`, `file_commit`, `claim`, `evidence`,
  `query_log`, `cache_entry`).
- `packages/cli/src/compose-index.ts`: `OpenTransaction` (`{ client, commit, rollback, release }`),
  `defaultOpenTransaction(url)` (connection failure → `DatabaseUnavailable`, no URL), `CliError`,
  `CommitUncertain`, `toCliError`; `safe-json.ts` → `toTerminalSafeJson`; `seed-build.ts` →
  `runSeedBuild`, `displayPath(repoRoot, path)`, private `writeAtomically(path, content)`
  (`.<name>.<pid>.tmp` + rename; removes the temporary on failure).
- `StorePort.listProjects()` (name ascending) and `createPostgresStore({ transaction })`;
  `Project` has `nodeCount`/`edgeCount` but no file, symbol or commit counts.
- `packages/cli/src/index.ts` delegates `index` to `runIndexCommand(argv, deps)` (fresh `commander`
  per call, injected streams, returns the exit code) before the global `program`, where `projects`
  is a stub.
- Test harness: `useTransactionPerTest` forbids `COMMIT`/`ROLLBACK` on `db()`; commands under test
  get a savepoint `OpenTransaction` over `db()` (`tests/integration/cli/index-command.spec.ts`).
- The seed's analyzer fingerprint covers all of `packages/adapters/store-postgres/src/`,
  `packages/cli/src/seed/`, `packages/cli/src/seed-build.ts` and `packages/cli/src/compose-index.ts`.

DIS-88's acceptance criterion for `projects` (files, symbols, edges, commits) disagrees with DIS-92's
title (read through `StorePort.listProjects`); the author resolved it in D6 and recorded the
deviation on DIS-88.

## Goals / Non-Goals

**Goals:**

- No change in `packages/core`, `packages/api`, `StorePort` or the schema.
- `db:seed`, `projects` and `seed:build` share one error format and never show a URL or an absolute
  path.
- Every database effect of `db:seed` happens in one transaction the caller owns, so tests run it on
  the harness savepoint and nothing is committed to the shared test database.

**Non-Goals:**

- A general import facility (only the versioned sample seed is loaded).
- A UI for the constant (DIS-60).

## Decisions

D1–D6 were accepted by the author on DIS-92; D7–D9 refine them for implementation.

### D1 — Load in the store adapter, entry point in the CLI

`packages/adapters/store-postgres/src/load-seed.ts` exports
`loadSeed(client: ClientBase, seed: { sql: string; projectNames: string[] }): Promise<LoadedSample[]>`
with `LoadedSample = { name, language, framework?, nodeCount, edgeCount }`. On the caller's client
and transaction, without `BEGIN`/`COMMIT` of its own:

1. `DELETE FROM project WHERE is_sample = true` (children go by `CASCADE`, D2).
2. `SELECT name FROM project WHERE name = ANY($1)` with `projectNames`; any row is a non-sample
   project holding a sample's name → throw `ProjectNameTaken(name)` (from `@codemind/core`) before
   executing anything else. Checking first, instead of catching `23505` from the `INSERT`, is needed
   because the message and `details.name` need the name before executing, and the server's `detail`
   (where a `23505` carries it) is translated with the server's locale. A `23505` from a race between
   this `SELECT` and the `INSERT` (another session creating that name meanwhile) is not mapped: it
   ends as `INTERNAL` `seed load failed; the database is unchanged`, which is true because the
   transaction is rolled back.
3. `client.query(seed.sql)` — simple query protocol, several statements (the seed holds only
   `INSERT`s with literals and comments).
4. `SELECT name, language, framework, node_count, edge_count FROM project WHERE is_sample ORDER BY
   name COLLATE "C"` → `LoadedSample[]`.

Exported from the package index. Not part of `StorePort`: it is development tooling, like
`exportSeedRows`; the domain never loads seeds.

`packages/cli/src/seed-load.ts` exports `runSeedLoad(deps) → Promise<number>` with
`deps = { env, stdout, stderr, repoRoot?, seedPath?, openTransaction? }` (defaults: the repository
root as in `seed-build.ts`, `<repoRoot>/seeds/graph-dump.sql`, `defaultOpenTransaction(url)`), and
runs itself when it is the entry module (pattern of `seed-build.ts`). Order:

1. `DATABASE_URL` trimmed → `MISSING_CONFIG` (`details.variable`).
2. Read the seed file: missing → `INVALID_SEED` `details.reason = "missing"`; empty → `"empty"`;
   its leading `--` comment lines without exactly `-- codemind-seed-format: 1` → `"format"`. Message
   `<seed> is not a loadable codemind seed (<reason>)`, `<seed>` by `displayPath`.
3. `projectNames` from the seed with `seedProjects(sql)` (D7): a statement it cannot read →
   `INVALID_SEED` `"format"`; no `INSERT INTO project` → `INVALID_SEED` `"no-project"`. Still before
   connecting, so a success always loads at least one project.
4. Open the transaction, `loadSeed`, `commit`, release; print the summary only after the commit.
   Any error before the commit → `rollback`, `release`. A rejected `commit` is reported with its own
   `CliError('INTERNAL', 1, 'unexpected error; the seed may have been loaded')`; `seed-load.ts` does
   not reuse `CommitUncertain`, whose message says "the project may have been saved".
5. Error mapping: `CliError` as is; `DatabaseUnavailable` → `DATABASE_UNAVAILABLE`;
   `ProjectNameTaken` → `PROJECT_NAME_TAKEN`, `a project named "<name>" already exists and is not a
   sample` with the name escaped by `escapeLiteral` (as `index` does; it renders the name as a JSON
   string literal, quotes included), `details.name`; anything else →
   `INTERNAL`, `seed load failed; the database is unchanged`. Printed as one `toTerminalSafeJson`
   line.

Root script: `"db:seed": "tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/seed-load.ts"`.

Side effect: `load-seed.ts` and `packages/cli/src/seed/` (D7) are analyzer-fingerprint inputs, so the
seed's header changes; `seeds/graph-dump.sql` is regenerated and committed in this change (rows
unchanged). This is repeated after any later change under those paths, including review rounds:
regenerating the seed and the constant is the last commit before the PR. Preconditions of every
regeneration: `git status --porcelain fixtures` and `git clean -ndX fixtures/acme-shop` print nothing,
and the author's salt from `.env` is used.

Alternative rejected: SQL in the CLI. The project keeps SQL inside the store adapter (`export-seed.ts`
precedent, `api-no-sql` spirit).

### D2 — Idempotency: delete every sample and reload, in one transaction

Each `db:seed` deletes all `is_sample = true` projects, also samples no longer in the seed, and reloads
the seed with the same deterministic ids. Consequence: by `CASCADE`, each `db:seed` / `make up`
deletes the `claim`, `evidence`, `query_log` and `cache_entry` rows of the sample projects. Today no
code writes them; DIS-26 will load the evaluation cache inside `db:seed` itself. Documented in
`docs/project-context.md`.

Alternative rejected: skip the load when the same fingerprint is already loaded — it needs the
fingerprint stored in the database (a migration) and still has to handle a stale load.

### D3 — `seed:build` generates the constant; write order and `PARTIAL_WRITE`

`packages/cli/src/seed/render-sample-projects.ts` exports
`renderSampleProjects(rows: SeedRows, projectName: string): string` (pure): the project id is
`seedId(projectKey(projectName))`, the same derivation as `render-dump.ts`; counts are
`rows.files.length`, `rows.symbols.length`, `rows.edges.length`, `rows.commits.length` (the rows are
one project's); layout exactly as in the spec, objects ordered by name, `framework` `null` when
absent, strings with `'` and `\` escaped. Entrega 2 has one sample project; the function takes the
rows of one project and returns the whole file, and CM-HU-18.3 will extend it to several.

`runSeedBuild` gains the seam `sampleProjectsPath?` (default
`<repoRoot>/packages/web/src/data/sample-projects.ts`). After rendering both texts:

1. `writeAtomically(sampleProjectsPath, constant)`; a failure → `INTERNAL`, `seed build failed;
   nothing was written` (the temporary is removed, the target untouched).
2. `writeAtomically(outputPath, seed)`; a failure → `CliError('PARTIAL_WRITE', 1, 'seed build failed
   after writing <constant>; <seed> was not written — run npm run seed:build again',
   { written: ['<constant>'] })`, both paths by `displayPath`.
3. The stdout line, unchanged.

The constant goes first so that the seed, which is what `db:seed` loads, is the last file to change:
a failed build never changes what gets loaded. The only half state is "new constant, old seed", which
the `PARTIAL_WRITE` message tells how to fix and the coherence test catches if it is committed.

Test seams: failures are provoked by pointing a path into a directory that does not exist (the
pattern already used by `seed-build.spec.ts`), so no writer injection is needed. **Every existing
`seed-build` test that runs a successful build must pass a temporary `sampleProjectsPath`**, or it
would overwrite the versioned constant (the integration tests use the real `repoRoot`).

Alternatives rejected: a separate script that parses the versioned SQL (two generators to keep in
step); a hand-written constant with only a coherence test (not "generated", as DIS-92 asks).

### D4 — `projects` reads in a transaction it always rolls back

`packages/cli/src/commands/projects.ts` exports `runProjectsCommand(argv, deps)` with
`deps = { env, stdout, stderr, openTransaction? }`, delegated from `packages/cli/src/index.ts` when
`process.argv[2] === 'projects'` (like `index`); the global `program` keeps a `projects` entry only
for `--help`. Fresh `commander` command per call with `exitOverride`, silenced output and
`allowExcessArguments(false)`, so `projects extra` or an unknown option such as `--json` → `USAGE`,
exit `2`, one error line. `--help` prints the help to stdout and exits `0` before the environment is
read or a connection opened.

Reading: `openTransaction ?? defaultOpenTransaction(url)`, `createPostgresStore({ transaction:
tx.client }).listProjects()`, then always `rollback` and `release`. Reusing the transaction factory
gives `DATABASE_UNAVAILABLE` without the URL and the harness savepoint in tests; a separate `Pool`
would need its own error mapping. Formatting is a pure exported `formatProjectLine(project)`
(template of the spec; `indexedAt?.toISOString() ?? 'not indexed'`; `framework ?? '-'`).
Unexpected errors → `INTERNAL`, `unexpected error; nothing was changed`.

### D5 — `make up` text is `db:seed`'s stdout

The `Makefile` already runs `npm run db:seed`; nothing else prints the summary. `readme.md` §1.4
keeps its illustrative `2 projects loaded` block (PH-02); `docs/project-context.md` states that the
real line differs until CM-HU-18.

### D6 — `projects` prints `nodeCount` and `edgeCount`, not separate counts

`Project` exposes `nodeCount` (files + symbols) and `edgeCount`; DIS-92 requires reading through
`StorePort.listProjects` and extending `Project`/`StorePort` is out of scope. The four separate
counts exist only in the web constant. Deviation from DIS-88's criterion recorded there.

### D7 — One seed parser for the CLI and the coherence test

`packages/cli/src/seed/parse-seed.ts` exports `seedProjects(sql)` →
`{ id, name, language, framework, fileCount, symbolCount, edgeCount, commitCount }[]`, reading only
the canonical format 1 written by `render-dump.ts`: one statement per line, explicit column lists,
literal values (`'…'` with `''`, `E'…'`, `NULL`, numbers, booleans). Columns are located by the
statement's own column list, not by position; `symbol` rows are attributed through their `file_id`.
`db:seed` uses its names (D1 step 3); the coherence test compares it with `SAMPLE_PROJECTS`. A
statement it cannot read throws (`INVALID_SEED` `"format"` in `db:seed`). It is not an SQL parser:
it only accepts what the renderer writes, which its unit tests pin with `renderSeedDump` output.

### D8 — Coherence and lint/type checks of the constant

`tests/unit/seed/sample-projects-coherence.spec.ts` imports
`packages/web/src/data/sample-projects.ts` (plain TS, no JSX; covered by `tests/tsconfig.json`) and
reads `seeds/graph-dump.sql` through `seedProjects`. The lint/type scenario lints the versioned file
with ESLint's Node API (`lintFiles`, repository config, asserting it is not ignored and has no
messages) and type-checks it with the TypeScript compiler API using the options of
`packages/web/tsconfig.json`; `npm run lint` and `npm run typecheck` cover it again as gates.

### D9 — No ADR

Every decision is local to the seed tooling and cheap to revert; DIS-91 recorded the seed format.

## Risks / Trade-offs

- [A test overwrites the versioned constant] → D3 rule: every successful-build test passes a
  temporary `sampleProjectsPath`; task 11 checks `git status --porcelain packages/web seeds` is empty
  after the suites.
- [`seed-load` integration waits on another test's uncommitted `acme-shop`] (`seed-build.spec.ts`
  creates one inside its harness transaction; `seed-load.spec.ts` and `projects-command.spec.ts`
  delete and reload samples inside theirs) → row locks only make one transaction wait for another's
  rollback. Task 4.5 runs the three files together, twice, against a populated local database; if
  waits or deadlocks appear, the three are serialised with `poolMatchGlobs` / `fileParallelism` and
  the outcome is recorded here. **Outcome (task 4.5, 2026-10-09):** two runs of the three files
  together against a database holding a committed acme-shop sample and a committed own project: 14/14
  green both times, no lock wait or deadlock, the committed rows untouched; no serialisation needed.
  The run exposed that two DIS-91 tests ("Two consecutive builds produce identical files", "An
  existing acme-shop project does not block the build") assumed no committed acme-shop: they failed
  even alone once `make up` had loaded the seed. Fixed in this change (each now clears the projects
  it depends on inside its harness transaction, reverted at the end; assertions unchanged).
- [Stale seed header after review fixes] → D1: regeneration is the last commit, repeated after any
  change to a fingerprint input.
- [Each `db:seed` drops sample-project claims, logs and cache] → D2, documented; DIS-26 reloads its
  cache inside `db:seed`.
- [`seedProjects` drifts from `render-dump.ts`] → its tests parse the renderer's own output.
- [`load-seed.ts` is outside Stryker's `mutate`] → covered by the integration scenarios; mutation
  score is measured on the new CLI files.

## Migration Plan

None: no schema change. After merge, `make up` loads acme-shop; rollback is reverting the change
(the database keeps whatever was loaded; `db:seed` of a later version replaces the samples).

## Follow-ups

Found during apply (the pre-merge review adds its own findings below):

- **A — fixed in this change.** Two DIS-91 integration tests ("Two consecutive builds produce identical
  files", "An existing acme-shop project does not block the build") failed once `make up` had committed the
  seed. Each now clears the projects it depends on inside its harness transaction (task 4.5; Risks).
- **A — fixed in this change.** `escapeLiteral` quotes names as JSON string literals, so the
  `PROJECT_NAME_TAKEN` message of `db:seed` is `a project named "acme-shop" already exists and is not a
  sample`; spec and design D1 updated with the author's choice during apply.
- **B — DIS-60.** `npm run lint:architecture` reports `no-orphans` (warning) for
  `packages/web/src/data/sample-projects.ts` until `ProjectPickerPage` imports it. Spanish comment on DIS-60.
- **To classify with the author at the pre-merge review.** Under heavy load, one full `npx vitest run`
  failed two Git integration tests outside this diff (`build-history.spec.ts` › "A re-touch that cannot be
  marked fails the build", `git-source-tree.spec.ts` › "A broken HEAD propagates git's error"); both pass
  alone and in the next full run (step 11 report). Pre-existing, timing-dependent; no owner yet.
