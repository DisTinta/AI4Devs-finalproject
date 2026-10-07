## Context

See proposal.md — Why. State of the code this design builds on:

- `packages/cli/src/index.ts` is one global `commander` program (v12.1) whose `index <path>` action
  prints a stub; it calls `program.parse(process.argv)` at import time. `packages/cli` depends only
  on `@codemind/core` and `commander`, and has no tests.
- `indexRepository(deps, input)` (`packages/core/src/index/index-repository.ts`) composes
  `sourceTree`, `analyzer`, `git`, `store` and an optional `onProgress(phase)`; it opens no
  transaction and logs nothing. Its errors are `DomainError`s with a stable `code`:
  `IndexingDisabled`, `ForbiddenPathError` (names the path as requested), `NotAGitRepository` and
  `EmptyRepository` (their messages hold the **real absolute path**), `InvalidGraph` (`violations`),
  `ProjectNameTaken`.
- `createPostgresStore({ transaction: client })` runs each write inside a `SAVEPOINT` of the caller's
  transaction and never commits. `createGitSourceTree()`, `createSimpleGitHistory({ authorHashSalt })`
  and `authorHashSaltFromEnv(env)` (throws a plain `Error` on a blank salt) come from
  `@codemind/adapter-git`; `createPhpAnalyzer()` from `@codemind/analyzer-php`.
- The integration harness (`tests/integration/helpers/db.ts`) gives each test one client inside a
  transaction and fails the test if the code under test commits or ends it; a `SAVEPOINT` is allowed.
- `migrate.ts` is the existing precedent for a CLI entry point: trimmed `DATABASE_URL`, exit `1` on a
  runtime error, `2` on misuse.
- Stryker mutates only `packages/core/src/**/*.ts` and runs `vitest.stryker.config.ts`, which
  excludes `tests/integration/**`: only unit tests kill mutants. In CI it runs only when the
  `business` paths filter of `.github/workflows/ci.yml` matches (`packages/core/**`, `tests/**`,
  Stryker and lock files).
- Workspace packages resolve by name to `dist/index.js` (`"main"`). Tests never load `dist/`: the
  Vitest alias (`vitest.config.ts`) and `paths` of `tests/tsconfig.json` map `@codemind/core` to its
  sources (DIS-23 design D6), and nothing else. `packages/cli` is the first package to import
  `@codemind/adapter-git`, `@codemind/adapter-store-postgres` and `@codemind/analyzer-php` by name.
  The root `cli` script runs `tsx packages/cli/src/index.ts` with no `paths`, so today it would load
  those packages from `dist/`.

## Goals / Non-Goals

**Goals:**

- A command whose whole behaviour (parsing, checks, transaction handling, output, error mapping) is
  reachable from unit tests with fake ports and a fake transaction, so mutation testing on
  `packages/cli` is meaningful.
- One place that maps errors to codes, exits and messages, so path privacy is enforced once.

**Non-Goals:**

- Changing `packages/core` or any adapter (proposal — Non-goals).
- A generic logging or error framework for the other subcommands: `projects`, `ask` and `impact`
  keep their stubs and the global program.

## Decisions

### D1 — A fresh `Command` per call, delegated from the entry point

`runIndexCommand(argv, deps) → Promise<number>` builds `new Command('index')` on every call and parses
the arguments after `index` with `{ from: 'user' }`. It never touches `process`; it returns the exit
code. `packages/cli/src/index.ts` checks `process.argv[2] === 'index'` before `program.parse` and, in
that case, awaits `runIndexCommand(process.argv.slice(2), { env: process.env, stdout:
process.stdout, stderr: process.stderr })` and sets `process.exitCode` (not `process.exit`, so the
streams flush). The global program keeps an `index` entry only so `codemind --help` lists it; its
action is unreachable.

`commander` is configured with `exitOverride()` and `configureOutput({ writeOut, writeErr,
outputError: () => {} })`: `writeOut`/`writeErr` go to the injected streams (help and version go to
stdout), and the no-op `outputError` is what stops `commander` from printing its own error text
(redirecting `writeErr` alone would still print it, only to the injected stream). The thrown
`CommanderError` is then mapped: `commander.helpDisplayed` and `commander.version` → `0`; any other
code → `USAGE` (exit `2`) with `commander`'s message as the reason.

The fresh `Command` calls `.version(CLI_VERSION)` with the same version as the global program. Both
read it from one constant, `packages/cli/src/version.ts` (`CLI_VERSION`, today `'0.0.1'`), which
replaces the literal in `index.ts`; a unit extra case asserts it equals `version` in
`packages/cli/package.json`, so the two cannot drift. (Importing `package.json` directly is not used:
`rootDir: src` keeps it out of the compilation.)

*Alternatives:* reuse the global `program` with `exitOverride` — rejected: it is parsed at import
time, keeps state between calls and cannot be unit-tested with injected streams. `.choices()` for
`--language`/`--framework` — rejected: it would produce a `commander` error (`USAGE`) instead of the
required `UNSUPPORTED_LANGUAGE` / `UNSUPPORTED_FRAMEWORK` with `details.allowed`; values are validated
by hand after parsing.

### D2 — Own JSON-lines logger, no dependency

`packages/cli/src/logger.ts` exports a tiny logger over a writable (`info(fields)`, `error(fields)`)
that writes `JSON.stringify({ level, ...fields }) + '\n'`. ~20 lines, no third-party package.

*Alternative:* `pino` (already bundled by Fastify in `packages/api`) — rejected: a new dependency of
`packages/cli` that must be justified, for four event shapes.

### D3 — Order of checks and where each failure is detected

1. Parse (`USAGE`) → blank `--name` (`USAGE`) → `--language` (`UNSUPPORTED_LANGUAGE`) → `--framework`
   (`UNSUPPORTED_FRAMEWORK`). Exit `2`.
2. `ALLOWED_REPOS_DIR` trimmed, then `confinePath(path, root)` from core (pure, lexical): its
   `IndexingDisabled` / `ForbiddenPathError` are reported as is. Exit `1`, no connection.
3. `authorHashSaltFromEnv(env)` — its plain `Error` is mapped to `MISSING_CONFIG` with
   `details.variable = 'AUTHOR_HASH_SALT'`; then `DATABASE_URL` trimmed → `MISSING_CONFIG` with
   `details.variable = 'DATABASE_URL'`. Exit `1`, no connection.
4. `openTransaction()` → `indexRepository(...)` with the **trimmed** root as `allowedRoot` → commit →
   render the report. Core repeats the confinement on real paths, so a root that is not blank but
   does not exist, or a symbolic link escaping the root, surface here, after the transaction is open.

The report is written to stdout **only after `commit` resolves**: an error at any point leaves stdout
empty, with or without `--json`, without buffering.

### D4 — `OpenTransaction` and its two implementations

```ts
type OpenTransaction = () => Promise<{
  client: ClientBase;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
}>;
```

- **Default** (`compose-index.ts`): `new pg.Client({ connectionString, connectionTimeoutMillis })` →
  `connect()` → `BEGIN`. `commit` = `COMMIT`, `rollback` = `ROLLBACK`, `release` = `end()`. Any
  rejection of `connect()` (or of the `BEGIN` right after it) becomes a CLI-local
  `DatabaseUnavailable` error, mapped to `DATABASE_UNAVAILABLE`; the `pg` error and its message (which
  can name host and port) are dropped. A connection timeout (10 s) keeps a black-holed host from
  hanging the command.
- **Integration tests** (`tests/integration/cli/` helper): over the harness client `db()`:
  `SAVEPOINT cli_index` on open; `commit` = `RELEASE SAVEPOINT cli_index`; `rollback` = `ROLLBACK TO
  SAVEPOINT cli_index`; `release` does nothing (the harness owns and closes the client). A unique
  violation does **not** abort the harness transaction: `createPostgresStore({ transaction })`
  already wraps each write in `SAVEPOINT store_write` and rolls back to it on failure
  (`packages/adapters/store-postgres/src/postgres-store.ts`, `StoreConnection`). The outer
  `cli_index` savepoint is still needed because (1) the harness forbids `COMMIT`/`ROLLBACK` on
  `db()` by code under test (`tests/integration/helpers/db.ts`, `useTransactionPerTest`), so the
  command's commit/rollback must map to something legal there; and (2) `rollback` must undo the
  earlier writes of a failed indexing — for example a `createProject` that succeeded followed by a
  `saveGraph` that failed — which the per-write `store_write` savepoints do not undo.

The flow is `tx = await openTransaction(); try { report = await indexRepository(...); await
tx.commit(); } catch { await tx.rollback() (its own failure is swallowed so the first error wins);
rethrow } finally { await tx.release() }`.

### D5 — A test seam for the ports

`runIndexCommand`'s `deps` is `{ env, stdout, stderr, openTransaction?, ports? }`. The optional
`ports(authorHashSalt) → { sourceTree, git, analyzer, store(client) }` defaults to the real adapters
(`store` defaults to `client => createPostgresStore({ transaction: client })`). Unit tests pass
in-memory fake ports (the pattern of `tests/unit/index/index-repository.spec.ts`), a fake store that
ignores `client`, and a recording fake transaction. Integration tests use the default ports with the
savepoint transaction factory (D4).

*Alternative:* `vi.mock` of the adapter modules — rejected: couples tests to module paths and hides
the composition contract that the seam makes explicit.

### D6 — Error mapping in one function

The mapping lives in `compose-index.ts` as `toCliError(error, { path, name }) → { code, exit,
message, details }`, the only place that builds messages (usage errors from D1 go through it too). It switches on `error instanceof DomainError ? error.code : …` and never reads
`error.message` of a domain or unknown error (the real-path leak of `NotAGitRepository` and
`EmptyRepository`, and arbitrary text of unknown errors). `INVALID_GRAPH` carries
`details.violations` (repository-relative paths, emitted inside the JSON line, hence escaped). Path
and name are interpolated with `JSON.stringify`. The table is the one in the spec.

### D7 — Residual confinement risk: accepted and documented

DIS-85 reported two Low findings: (a) the window between confining the real path and git reading it
(a directory of the path swapped for a link); (b) git reading objects outside `allowedRoot` through a
`.git` *file* with `gitdir:` or through `objects/info/alternates`. Both require the attacker to
**write inside `ALLOWED_REPOS_DIR`**. Whoever can write there can already plant any repository
content to be indexed, so the extra reach is reading (never executing — PH-19, and the Git reader
neutralises repository configuration) objects of another repository the Codemind user can read.
Closing them in code means confining `git rev-parse --absolute-git-dir` and every alternate in
`packages/adapters/git`, or reading through an open directory descriptor, which Node and `git` do not
support portably. Decision: no code change; `docs/DEPLOYMENT.md` and `docs/project-context.md` state
that `ALLOWED_REPOS_DIR` must be writable only by the user running Codemind and must hold only
trusted repositories. Revisit if indexing ever accepts repositories from untrusted uploaders
(CM-HU-05b exposes `POST /index` over already-confined paths, so it inherits the same requirement).

### D8 — Escaping untrusted strings

`render-report.ts` prints each diagnostic message and skipped path with `escapeLiteral(s)` =
`JSON.stringify(s)` followed by replacing `[\u007f-\u009f]` with `\uXXXX`. `JSON.stringify` escapes
quotes, backslash and C0 controls (`\u0000`–`\u001f`, so ESC and newlines) but leaves DEL and C1
controls raw, and `\u009b` is a one-byte CSI on terminals that honour C1. Log and error lines are
whole JSON objects, so they get the same JSON escaping; they never carry diagnostics.

### D9 — Mutation testing and dependencies

- `stryker.config.json`: `mutate` adds `packages/cli/src/**/*.ts` and `!packages/cli/src/index.ts`
  (entry point: only `process` wiring, covered by the manual demo); `disableTypeChecks` becomes
  `{packages/core,packages/cli}/src/**/*.ts`. `vitest.stryker.config.ts` already excludes
  `tests/integration/**`, so `packages/cli` mutants are killed only by `tests/unit/cli/**` (D5).
  Score ≥ 70 % on `packages/cli`, recorded in the PR.
- `.github/workflows/ci.yml`: the `business` paths filter adds `'packages/cli/**'`, so a future
  change that touches only the CLI still runs the mutation step (today it would be skipped: the
  filter only lists `packages/core/**`). The `runtime` filter already covers `packages/**`.
- `packages/cli/package.json` adds `@codemind/adapter-git`, `@codemind/adapter-store-postgres`,
  `@codemind/analyzer-php` (workspace), `pg` (same range as `packages/adapters/store-postgres`) and
  `@types/pg` (dev); `packages/cli/tsconfig.json` gains `references` to those three packages and
  `packages/core`, like `packages/adapters/store-postgres/tsconfig.json`. `.dependency-cruiser.cjs`
  needs no change: `core-no-infra` restricts `packages/core`, not the CLI.

### D10 — Resolving the workspace packages from sources

**Tests.** `vitest.config.ts` `resolve.alias` and `tests/tsconfig.json` `paths` add
`@codemind/adapter-git`, `@codemind/adapter-store-postgres` and `@codemind/analyzer-php`, each to its
`packages/*/src/index.ts`, next to `@codemind/core`. Tests keep never loading `dist/` (DIS-23 D6),
and `vitest.stryker.config.ts` inherits the alias through `mergeConfig`.

**`npm run cli`.** Option (b): the root script becomes
`tsx --tsconfig packages/cli/tsconfig.run.json packages/cli/src/index.ts`, where the new
`packages/cli/tsconfig.run.json` extends `./tsconfig.json` and adds `paths` for `@codemind/core` and
the three packages, to their `src/index.ts`. It is not referenced by the root `tsconfig.json`, so
`tsc --build` ignores it. Why (b) over (a) `tsc --build packages/cli && node
packages/cli/dist/index.js`:

- (a) has a stale-output trap, checked on this repository (TypeScript 5.9.3): after deleting
  `packages/core/dist` with its `tsconfig.tsbuildinfo` left in place, `tsc --build --dry --verbose
  packages/core` reports the project "up to date" and would emit nothing, so `node dist/…` fails.
  Making (a) safe needs `--force` (a full rebuild on every run) or cleaning build info too.
- (a) writes compiler diagnostics to stdout on a build error, breaking the "stdout only carries the
  report" contract; (b) has no build step.
- (b) resolves every workspace package, including the transitive `@codemind/core` imported by the
  adapters, from sources, the same rule as the tests. Checked with a probe under the OS temp dir:
  with the four `dist/` of core, adapter-git, adapter-store-postgres and analyzer-php moved away,
  `tsx --tsconfig <paths to src>` loaded all of them and `createPhpAnalyzer().analyze(...)` parsed a
  PHP file.
- web-tree-sitter assets: `packages/analyzers/php/src/parser.ts` finds `tree-sitter-php.wasm` with
  `createRequire(import.meta.url)` + `require.resolve('tree-sitter-php/package.json')`, and
  `web-tree-sitter` locates its own `web-tree-sitter.wasm`; both live in the root `node_modules`, so
  the lookup works from `src/` (option b, the probe above) and from `dist/` (checked by importing
  `packages/analyzers/php/dist/index.js` from a working directory outside the repository).

`bin` keeps pointing at `dist/index.js` for a built install; `npm run typecheck` (`tsc --build`)
still compiles `packages/cli` with its new `references`, so that path stays type-correct.

**Verification with `dist/` removed** (tasks 5.6 and 10): delete `packages/*/dist` and
`packages/*/*/dist` before `npm run cli -- index …`. Afterwards restore them with
`npx tsc --build --force` — a plain `tsc --build` would report "up to date" because of the build
info (above) and leave them missing.

No ADR: every decision is local to `packages/cli` (and its test and run wiring) and cheap to revert;
D7 is recorded here and in the deployment docs.

## Risks / Trade-offs

- [The `ports` seam is test-only surface on an exported function] → it is optional, documented as a
  seam, and defaults to the real adapters; the integration tests exercise the defaults.
- [A `COMMIT` that fails after a successful indexing] → mapped like any error (rollback attempted,
  exit `1`, empty stdout); the report is never printed for an uncommitted snapshot.
- [Progress lines already written before an error] → acceptable: stderr is the diagnostic channel;
  the contract only requires stdout to be empty.
- [`INTERNAL` hides the original message, which makes field debugging harder] → privacy wins; the
  `index_failed` log line carries the code, and the developer can reproduce with the tests. Revisit
  with a `--verbose` flag if needed (not in scope).
- [`process.argv[2] === 'index'` misses global options before the subcommand, e.g.
  `codemind --foo index`] → the global program has no options besides help/version; such a call
  falls to the global program, which prints its usage error.
- [The source mapping of the workspace packages now lives in three places — Vitest alias,
  `tests/tsconfig.json` and `packages/cli/tsconfig.run.json` — and can drift] → each entry is
  exercised: unit tests import the CLI (alias), `npm run typecheck` checks `tests/` (paths), and
  tasks 5.6 / 10 run `npm run cli` with `dist/` removed (`tsconfig.run.json`). A missing entry falls
  back to the package's `dist/` through `"main"`, which can be stale; with `dist/` removed that
  fallback fails with "module not found", which is why 5.6 and 10 delete it first.
- [Indexing acme-shop takes ~6 s per run and C4(a) runs it twice] → integration timeouts of 60 s per
  test, as in `tests/integration/index/acme-shop.spec.ts`.

## Migration Plan

No data migration. Deploy = merge; rollback = revert the commit (the stub comes back, nothing is
stored differently). Operators must set `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL`
(documented in `.env.example`, `readme.md`, `docs/DEPLOYMENT.md`).
