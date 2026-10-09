## Why

CM-HU-06 (DIS-88) promises that an evaluator runs CODEMIND in three commands, without PHP, without
cloning anything and without waiting for an indexing. DIS-91 produced the versioned seed
(`seeds/graph-dump.sql`, acme-shop only in Entrega 2), but nothing loads it yet: `npm run db:seed` is
a placeholder that prints `pending Ticket 3` and exits `0`, so `make up` ends with an empty database;
`npm run cli -- projects` prints `not implemented`; and the web's project picker (Pantalla 1, DIS-60)
has no data source, because the gate rejected a listing endpoint (PH-01). This is DIS-92
(CM-HU-06.2): load the seed idempotently without touching the user's own projects, list projects from
the CLI through `StorePort.listProjects`, generate the web's sample-project constant from the same
rows as the seed, and make `make up` print `1 project loaded` until CM-HU-18 adds `task-api` (PH-02).
It unblocks DIS-60, DIS-44 (`verify`) and DIS-26 (evaluation cache).

## What Changes

- **`npm run db:seed`** becomes real: `tsx --tsconfig packages/cli/tsconfig.run.json
  packages/cli/src/seed-load.ts`, a development script exposed as a testable
  `runSeedLoad(deps) → Promise<number>` (pattern of `runSeedBuild`). It reads only `DATABASE_URL`
  (no salt) and `seeds/graph-dump.sql`, checks the seed's format line before connecting, and in one
  transaction deletes every `is_sample = true` project (children go by `CASCADE`), executes the seed
  and commits. Success prints `1 project loaded` (`N projects loaded` otherwise) and one line per
  sample project; any failure prints one `{"error":…}` line and leaves the database unchanged.
  A user project with a sample's name blocks the load (`PROJECT_NAME_TAKEN`). The `Makefile` does not
  change: its summary is `db:seed`'s stdout.
- **Seed loading in the store adapter**: `packages/adapters/store-postgres/src/load-seed.ts`,
  `loadSeed(client, sql)`, on a caller-owned transaction; not part of `StorePort` (tooling, like
  `exportSeedRows`).
- **`npm run cli -- projects`** becomes real: `packages/cli/src/commands/projects.ts`,
  `runProjectsCommand(argv, deps)`, delegated from `packages/cli/src/index.ts` like `index`. It reads
  `StorePort.listProjects` in a transaction it always rolls back and prints one fixed-format line per
  project (name, id, language/framework, `nodeCount`, `edgeCount`, `indexedAt` or `not indexed`, and
  ` sample`). No HTTP (PH-01).
- **`npm run seed:build`** writes a second output, `packages/web/src/data/sample-projects.ts`
  (`SAMPLE_PROJECTS` with id, name, language, framework and the file, symbol, edge and commit counts
  of each sample), rendered from the same rows as the seed, written before the seed, each file
  atomically. Its stdout line does not change. A seed write that fails after the constant was written
  is reported as the new code `PARTIAL_WRITE`; `seed build failed; nothing was written` is kept only
  for `INTERNAL` failures before any write.
- **`seeds/graph-dump.sql`** regenerated (its analyzer fingerprint covers
  `packages/adapters/store-postgres/src/` and `packages/cli/src/seed/`, which this change touches;
  the rows do not change) and **`packages/web/src/data/sample-projects.ts`** created, both versioned.
- A coherence test checks the constant against the seed, so neither can be regenerated without the
  other.

## Non-goals

- Checking the seed's fingerprint against the code (`verify`, DIS-44 / CM-HU-14.1).
- Evaluation cache and golden answers, LLM evaluation mode (DIS-26 / CM-HU-13).
- `task-api` and "2 projects loaded" (CM-HU-18.3); rewriting `readme.md` §1.4 (PH-02).
- `ProjectPickerPage` and any use of the constant in the UI (DIS-60), which reuses this change's
  coherence test instead of duplicating it.
- `GET /api/projects` (rejected, PH-01); a `--json` option for `projects`.
- Separate file, symbol and commit counts in `projects`: it prints `nodeCount` (files + symbols) and
  `edgeCount` of `Project`, a recorded deviation from DIS-88's acceptance criterion (design D6);
  extending `Project`/`StorePort` is out of scope.
- Skipping the load when the same seed is already loaded; new migrations.
- Any change to `packages/core` or `packages/api`.

## Privacy and logging impact

`db:seed` executes only the versioned seed, whose rows already carry no secret, no real path and no
author in clear (DIS-91). No output of `db:seed`, `projects` or `seed:build` contains the database
URL, its credentials or an absolute path. `projects` prints project names and ids stored locally,
nothing personal. Each `db:seed` deletes, by `CASCADE`, the `claim`, `evidence`, `query_log` and
`cache_entry` rows of the sample projects (design D2): today none of these tables has a writer;
documented in `docs/project-context.md`. `/privacy-ethics-check` runs during apply.

## Capabilities

### New Capabilities

- `seed-load`: the `db:seed` contract — configuration and seed-format checks, transactional and
  idempotent load of the sample projects that preserves every non-sample project, the
  `N project(s) loaded` summary and error reporting.
- `cli-projects`: the `projects` command — read-only listing through `StorePort.listProjects`, the
  fixed line format, the empty case and error reporting.

### Modified Capabilities

- `seed-build`: the command contract gains the `PARTIAL_WRITE` code and restricts
  `seed build failed; nothing was written` to `INTERNAL` failures before any write; the
  never-broken-output guarantee covers the sample-project constant too; a new requirement defines the
  constant (shape, header, write order, byte-for-byte reproducibility).

## Impact

- Code (adapter): new `packages/adapters/store-postgres/src/load-seed.ts`, exported from the package
  index. No change to `StorePort`, existing queries or the schema.
- Code (cli): new `packages/cli/src/seed-load.ts`, `packages/cli/src/commands/projects.ts`,
  `packages/cli/src/seed/render-sample-projects.ts`; `packages/cli/src/seed-build.ts` writes the
  constant and reports `PARTIAL_WRITE`; `packages/cli/src/index.ts` delegates `projects`. Reuses
  `defaultOpenTransaction`, `toCliError`, `CliError`, `escapeLiteral` and `toTerminalSafeJson`
  without changing their behaviour. `seed-load.ts` does not reuse `CommitUncertain` (its message is
  "the project may have been saved"): a failed commit is reported with its own
  `CliError('INTERNAL', 1, 'unexpected error; the seed may have been loaded')`.
- Code (web): new generated `packages/web/src/data/sample-projects.ts` (no component uses it yet).
- Scripts: root `package.json` `db:seed`. `Makefile` unchanged.
- Data: `seeds/graph-dump.sql` regenerated (header only).
- Dependencies: none new.
- Tests: `tests/unit/cli/{seed-load,projects-command,seed-render-sample-projects}.spec.ts`, extra cases
  in `tests/unit/cli/seed-build.spec.ts`, `tests/unit/seed/sample-projects-coherence.spec.ts`,
  `tests/integration/cli/{seed-load,projects-command}.spec.ts`.
- Mutation: `packages/cli/src/**` is already mutated; `load-seed.ts` (adapter) is not, so it is
  covered by integration tests.
- Docs: `docs/project-context.md` (`db:seed` and `projects` no longer placeholders; the `CASCADE` loss
  of D2; the `make up` line differs from `readme.md` §1.4 until CM-HU-18), `prompts.md`.
- Linear: DIS-92; deviation D6 recorded on DIS-88; DIS-60 reuses the coherence test.
