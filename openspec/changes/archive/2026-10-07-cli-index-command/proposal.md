## Why

CM-HU-05a (DIS-64) promises that a developer indexes a PHP/Laravel repository "with a single
command". The use case exists since DIS-85 (`indexRepository`, capability `repository-indexing`),
but nothing outside tests calls it: `npm run cli -- index` is still a stub that prints
`not implemented — pending Ticket 5`. This is DIS-86 (CM-HU-05a.3): the real `index` command — the
composition root that reads the environment, owns the transaction, shows progress and the report,
and turns every failure into a clear error and a reliable exit code. It also closes the five hand-off
notes left on DIS-86 by DIS-84, DIS-85 and DIS-96 (trimmed `ALLOWED_REPOS_DIR`, transaction contract,
structured audit log, path privacy in messages, escaping of `diagnostics`, residual confinement
risk).

## What Changes

- **Real `index` command** (`packages/cli/src/commands/index-repository.ts`):
  `index <path> --name <name> --language php [--framework laravel|fastify|none] [--json]`, exposed as
  a testable `runIndexCommand(argv, deps) → Promise<number>` that builds a fresh `commander`
  `Command` per call. `packages/cli/src/index.ts` delegates to it when the subcommand is `index`; the
  other subcommands stay as they are.
- **Validation before any connection**: blank `--name`, `--language` other than `php` (TypeScript
  answers `typescript: not available yet (CM-HU-18)`), `--framework` outside `PROJECT_FRAMEWORKS`,
  and every `commander` usage error exit with `2` and no text of `commander`'s own. `--help` and
  `--version` exit with `0`.
- **Composition root** (`packages/cli/src/compose-index.ts`): reads and trims `ALLOWED_REPOS_DIR`,
  `AUTHOR_HASH_SALT` and `DATABASE_URL`; a lexical pre-check with `confinePath` rejects a blank root
  or a path outside it before connecting; missing configuration fails before connecting; then it
  opens a transaction through an injectable `OpenTransaction`, composes the Git source tree, the Git
  history, the PHP analyzer and the Postgres store on that transaction, and commits on success or
  rolls back on any error, always releasing the connection.
- **Output contract**: stdout carries only the report (text, or the full `IndexReport` as one JSON
  document with `--json`) and stays empty on error; stderr carries the progress (`[n/6] <phase>`),
  the structured log and the error. Exit codes: `0` success, `1` domain, configuration or runtime
  error, `2` usage error.
- **Error mapping**: every failure becomes one `{"error":{"code","message","details"}}` line with a
  stable code (`INDEXING_DISABLED`, `FORBIDDEN_PATH`, `NOT_A_GIT_REPOSITORY`, `EMPTY_REPOSITORY`,
  `INVALID_GRAPH`, `PROJECT_NAME_TAKEN`, `MISSING_CONFIG`, `DATABASE_UNAVAILABLE`, `INTERNAL`,
  `USAGE`, `UNSUPPORTED_LANGUAGE`, `UNSUPPORTED_FRAMEWORK`). Messages are built by the CLI from the
  code and the path **as typed**; the resolved real path, the database URL and credentials never
  appear.
- **Structured log** (`packages/cli/src/logger.ts`, no new dependency): one JSON line per
  `secret_redacted` event (`source: "file"` or `"commit"`) and per failure (`level: "error"`); the
  secret value never appears.
- **Escaped rendering** (`packages/cli/src/render-report.ts`): analyzer `diagnostics` and `skipped`
  paths are untrusted strings and are printed as JSON string literals, so quotes, newlines and
  terminal escape sequences cannot forge output.
- **Mutation testing extended to `packages/cli`** (`stryker.config.json`), entry point excluded.
- **Docs**: `docs/project-context.md`, `readme.md` («Camino completo»: indexing needs neither PHP nor
  an LLM, and the path must be inside `ALLOWED_REPOS_DIR`) and `docs/DEPLOYMENT.md` (today silent
  about `ALLOWED_REPOS_DIR`): the directory must be writable only by the user running Codemind and
  hold only trusted repositories.

## Non-goals

- `POST /api/projects/{id}/index` and incremental indexing (DIS-9, DIS-10).
- Reindexing an existing project: a repeated `--name` ends in `PROJECT_NAME_TAKEN`.
- Indexing TypeScript (CM-HU-18): only the `not available yet` message; core's `PROJECT_LANGUAGES`
  is not changed.
- `seed:build` / `db:seed` and the `projects`, `ask`, `impact` commands (DIS-91, CM-HU-06 and later).
- Persisting audit events in the database.
- Closing in code the residual confinement risk reported by DIS-85 (the window between confining
  and reading; a `.git` file with `gitdir:` or `objects/info/alternates` pointing outside the root):
  accepted and documented (design D7).
- A per-file progress bar or ETA; handling of signals (Ctrl-C) beyond the default process exit.
- Any change to `packages/core`: the use case, its errors and `INDEX_PHASES` are consumed as they
  are.

## Privacy and logging impact

The command is the first place where index output reaches a terminal or a log. Guarantees: the
secret value never reaches stdout or stderr (events carry file/commit, line, column and rule only);
error messages never show the resolved real path (which can hold the OS user name — Low findings of
DIS-84 and DIS-85) nor the database URL or its credentials; untrusted strings from the analysed
repository are escaped before printing. Commit authors already arrive pseudonymised (DIS-35). Tests
use the fixture's planted key and synthetic literals only. `/privacy-ethics-check` runs during
apply.

## Capabilities

### New Capabilities

- `cli-indexing`: the `index` command line contract — options and validation, pre-checks before any
  database connection, transaction ownership, output streams and `--json`, exit codes and error
  mapping with path privacy, structured audit log, and escaped rendering of untrusted strings.

### Modified Capabilities

None. `repository-indexing`, `security-gateway`, `git-history`, `code-analysis` and `graph-store`
are consumed as they are; no requirement of theirs changes.

## Impact

- Code (cli): new `packages/cli/src/{commands/index-repository,compose-index,render-report,logger,version}.ts`;
  `packages/cli/src/index.ts` delegates `index` and reads its version from `version.ts`. No change
  in `packages/core` or any adapter.
- Workspace resolution (design D10): `vitest.config.ts` alias and `tests/tsconfig.json` `paths`
  gain `@codemind/adapter-git`, `@codemind/adapter-store-postgres` and `@codemind/analyzer-php` (to
  their sources); the root `cli` script runs `tsx` with a new `packages/cli/tsconfig.run.json` whose
  `paths` point every workspace package at its sources, so `npm run cli` never depends on `dist/`.
- Dependencies: `packages/cli/package.json` adds the workspace packages `@codemind/adapter-git`,
  `@codemind/adapter-store-postgres`, `@codemind/analyzer-php`, plus `pg` (already used by the store
  adapter and the root) and `@types/pg` (dev); `packages/cli/tsconfig.json` gains `references`. No
  new third-party library (D2: own logger).
- Tests: `tests/unit/cli/{index-command,render-report}.spec.ts` (fake ports and fake transaction),
  `tests/integration/cli/index-command.spec.ts` (Postgres + Git, acme-shop copy under the OS temp
  dir, savepoint-based transaction factory on the harness client).
- Mutation: `stryker.config.json` `mutate` adds `packages/cli/src/**/*.ts` minus
  `packages/cli/src/index.ts`; `disableTypeChecks` covers both packages; score ≥ 70 % on
  `packages/cli`.
- CI: the `business` paths filter of `.github/workflows/ci.yml` adds `'packages/cli/**'`, so a
  later change touching only the CLI still runs mutation testing.
- Docs: `docs/project-context.md`, `readme.md`, `docs/DEPLOYMENT.md`; TypeDoc of every export;
  `prompts.md`.
- Linear: DIS-86; inbound notes from DIS-84, DIS-85 (×3) and DIS-96 closed at archive.
