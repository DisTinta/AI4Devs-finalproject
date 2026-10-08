## Context

See `proposal.md` → Why. The pieces exist and are consumed as they are:

- `fixtures/build-history.mjs` exports `buildOne(name, { dir, manifest })`, which rebuilds a fixture's
  `.git` deterministically (fixed authors, dates and messages) and always restores the tracked
  sources. It prints `<name>: N commits, N authors -> <absolute .git path>` with `console.log`.
- `packages/cli/src/compose-index.ts` exports `indexWithEnvironment(options, environment)`: it trims
  and checks `ALLOWED_REPOS_DIR`, `AUTHOR_HASH_SALT` and `DATABASE_URL`, opens a transaction through
  an injectable `OpenTransaction` (`{ client, commit, rollback, release }`), runs `indexRepository`,
  then `commit()`; any error → `rollback()`; `release()` always, in `finally`. A rejected `commit()`
  becomes `CommitUncertain` (`INTERNAL`, "the project may have been saved"). It also exports
  `defaultOpenTransaction(url)` (`pg.Client`, `BEGIN`, connection failure → `DatabaseUnavailable`),
  `defaultPorts`, `toCliError`, `CliError`; `safe-json.ts` exports `toTerminalSafeJson`.
- `indexRepository` creates the project with the real absolute `rootPath` and `isSample` unset;
  `saveGraph` sets `indexed_at = clock_timestamp()`; every table's `id` defaults to
  `gen_random_uuid()` (migrations `0001`–`0003`). `edge` has no unique key and `validate-graph.ts`
  does not check edge uniqueness.
- The store adapter (`createPostgresStore({ transaction })`) wraps each write in
  `SAVEPOINT store_write`, so a caller's transaction stays usable after a failed write.
- Resolution from sources (DIS-86 D10): `packages/cli/tsconfig.run.json`, the Vitest alias and
  `tests/tsconfig.json` `paths` already cover `@codemind/adapter-store-postgres`; `stryker.config.json`
  already mutates `packages/cli/src/**` (entry point `index.ts` excluded).

The parent CM-HU-06 (DIS-88) suggested `pg_dump`; the enriched DIS-91, with the author's decisions,
replaced it with a dump rendered in Node (D2). This is an implementation choice, not a scope change.

## Goals / Non-Goals

**Goals:**

- Reuse the `index` composition root unchanged; no change in `packages/core`, `StorePort` or the
  schema.
- Every source of non-determinism (ids, clocks, real path, row order, time zone, line endings) is
  neutralised in one pure renderer, testable without a database.
- The database is never written: the only side effects are the fixture's gitignored `.git` and the
  seed file.

**Non-Goals:**

- A general export/import facility for user projects (only the sample seed).
- Loading the seed (DIS-92), checking the fingerprint (CM-HU-14.1).
- Listing fingerprint inputs through Git (D6).

## Decisions

### D1 — Entry point: `runSeedBuild(deps) → Promise<number>`, not a `codemind` subcommand

`packages/cli/src/seed-build.ts` exports `runSeedBuild(deps)` and, when run as a script, calls it with
`process.env`, `process.stdout`, `process.stderr` and sets `process.exitCode` (pattern of
`runIndexCommand`). Root script: `"seed:build": "tsx --tsconfig packages/cli/tsconfig.run.json
packages/cli/src/seed-build.ts"`.

`deps`: `env`, `stdout`, `stderr`, and optional test seams — `repoRoot` (default: three levels up
from the module, the repository root; used for the fingerprint inputs, the manifest and
`package-lock.json`), `fixturesRoot` (default `<repoRoot>/fixtures`; the allowed root),
`outputPath` (default `<repoRoot>/seeds/graph-dump.sql`), `buildHistory(fixturesRoot)`,
`openTransaction` (the base transaction, see D3) and `ports` (passed to `indexWithEnvironment`).

Alternative rejected: a `codemind seed-build` subcommand. It is a development tool that writes into
the repository; exposing it in the user CLI's help would invite running it outside a checkout.

Order of work: (1) `AUTHOR_HASH_SALT` (via `authorHashSaltFromEnv`), then `DATABASE_URL` → 
`MISSING_CONFIG`; (2) fingerprints (reads repository files; fails before touching the fixture);
(3) `buildHistory`; (4) indexing + read-back (D3); (5) render (D4, D5); (6) atomic write (D7);
(7) summary line. stdout is written only in step 7, so a failure leaves it empty.

Streams: the build prints no progress — `indexWithEnvironment` receives a no-op `onProgress`. On
success stdout is exactly the summary line and stderr is empty; on failure stdout is empty and stderr
holds exactly the error line. The summary's `<output>` is `path.relative(repoRoot, outputPath)` with
`/` separators when the output is inside `repoRoot` (the relative path neither starts with `..` nor
is absolute — on Windows another drive yields an absolute path); otherwise only
`path.basename(outputPath)`, so no output ever shows an absolute path.

### D2 — Dump rendered in Node from the rows read back, not `pg_dump`

`pg_dump` (a) cannot see rows that are never committed (D3), (b) writes the server and client version
in its header (bytes differ across machines), (c) emits rows in heap order and (d) needs
`docker compose exec` or client binaries on Windows. Reading the rows with SQL in the store adapter
and rendering them in a pure function solves all four and makes the format testable without
Postgres.

`packages/adapters/store-postgres/src/export-seed.ts` exports
`exportSeedRows(client: ClientBase, projectName: string): Promise<SeedRows>` (re-exported from the
package index). It finds the project by name (`commit()` does not receive the `IndexReport`, so the
id is unknown there) and returns plain rows of `project`, `file`, `symbol` (with its file's path),
`edge`, `commit` (with `committed_at` as `Date`) and `file_commit`, with the database ids as read.
No ordering is promised: the renderer sorts (D5). A missing project → error (becomes `INTERNAL`).
It is not part of `StorePort`: development tooling, not domain; SQL stays in the adapter
(`GUARD_DB_IN_HTTP` and the layer rule).

### D3 — A transaction that never commits, wrapped around the base `OpenTransaction`

`packages/cli/src/seed/seed-transaction.ts` exports
`createSeedTransaction(base: OpenTransaction, read: (client) => Promise<T>)` →
`{ openTransaction, rows(): T }`:

- `openTransaction()` opens `base` and returns `{ client, commit, rollback, release }` where
  `commit()` = `rows = await read(inner.client)`, then `await inner.rollback()` — never
  `inner.commit()`; `rollback()` = `inner.rollback()`; `release()` = `inner.release()`.
- `rows()` throws if `commit()` did not complete.

The base is `defaultOpenTransaction(DATABASE_URL)` in production (its `DATABASE_UNAVAILABLE` mapping
comes for free; its `release()` closes the client) and a savepoint factory over the harness client in
integration tests (as in `tests/integration/cli/index-command.spec.ts`).

`indexWithEnvironment` is called with `{ path: 'acme-shop', name: '__codemind_seed_build__',
language: 'php' }`, `env: { ...env, ALLOWED_REPOS_DIR: fixturesRoot }`, a no-op `onProgress`, the
wrapped `openTransaction` and the `ports` seam. Its contract then gives: indexing error → `rollback()` +
`release()`; read-back error inside `commit()` → `CommitUncertain` after `rollback()` + `release()`.

**Error mapping** (`seed-build.ts`): `CommitUncertain` and any error `toCliError` maps to `INTERNAL`
are reported as `INTERNAL` with `seed build failed; nothing was written` — "may have been saved" is
never true here, since nothing is ever committed. Every other code (`MISSING_CONFIG`,
`DATABASE_UNAVAILABLE`, `PROJECT_NAME_TAKEN`, `INVALID_GRAPH`, `NOT_A_GIT_REPOSITORY`,
`EMPTY_REPOSITORY`, `FORBIDDEN_PATH`) keeps `toCliError`'s message, with `acme-shop` as the typed path
and `__codemind_seed_build__` as the typed name. Errors after the indexing (render, fingerprint, write)
are `INTERNAL` with the same message. The line is written with `toTerminalSafeJson`.

**D3a — Temporary name (author decision, DIS-91 D5).** Indexing under the constant
`'__codemind_seed_build__'` and writing `name = 'acme-shop'` means an `acme-shop` already loaded by
`db:seed` does not collide, and no `DELETE` is needed. Alternative rejected: deleting the existing
`acme-shop` inside the rolled-back transaction (a `DELETE` on user-visible data, even if reverted,
and it locks the row for the build's duration).

### D4 — Deterministic ids: UUID v5 over prefixed natural keys (author decision, DIS-91)

`packages/cli/src/seed/deterministic-ids.ts`:

- `SEED_ID_NAMESPACE = 'c604f694-731a-4acd-b7f3-9c090f2a1fb3'` (generated once for this change;
  changing it changes every id and therefore needs `codemind-seed-format` bumped).
- `uuidV5(namespace, name)`: RFC 4122 §4.3 with SHA-1 from `node:crypto` (no dependency); checked
  against the published vector `uuid5(NAMESPACE_DNS, 'python.org')` =
  `886313e1-3b8a-5372-9b90-0c9aee199e5d`.
- `KEY_SEPARATOR = '\u0000'`. NUL cannot occur in any component: Postgres rejects NUL in `text`, and
  the other components are integers or enum labels. Documented in the JSDoc.
- Keys, each starting with the seed's project name (`acme-shop`, never the temporary name), so
  `task-api` (DIS-32) cannot collide: project `[name]`; file `[name, path]`; symbol
  `[name, path, kind, start_line, symbolName]`; commit `[name, sha]`; edge `[name, kind, resolution,
  extractor, ...endpoint(source), ...endpoint(target)]` with endpoint `['file', path]` or
  `['symbol', path, kind, start_line, symbolName]`. Integers as decimal strings.
- Duplicate edges (same full key): sorted by `weight` (`null` first, then numeric) and then by the
  order of appearance, and suffixed `#0`, `#1`, … (the suffix joined with the separator). Two edges
  that tie on weight are identical in every rendered column, so whichever gets `#0` the output bytes
  are the same — which is why the order of appearance cannot leak into the file.
- Every reference is remapped through an old-id → new-id map built per table; an unknown reference
  → error (`INTERNAL`): it would mean the export read an inconsistent snapshot.

### D5 — Canonical rendering (author decision, DIS-91) and ordering

`packages/cli/src/seed/render-dump.ts` exports `renderSeedDump(rows, fingerprints, projectName)`
→ `string`, pure:

- Header: `-- codemind-seed-format: 1`, `-- analyzer-fingerprint: sha256:…`,
  `-- contract-fingerprint: sha256:…`, then one fixed comment line saying the file is generated by
  `npm run seed:build`. No date, host or version.
- Project row: `name` = `projectName`, `is_sample = true`, `root_path = 'fixtures/acme-shop'`
  (`fixtures/<projectName>`), `created_at` and `indexed_at` = `committed_at` of the commit whose sha
  is `indexed_commit` (missing → `INTERNAL`), `node_count` = files + symbols and `edge_count` = edges
  **counted from the rendered rows**, so the counters always match the file.
- Values: `Date` → `'<toISOString()>'` (UTC, milliseconds; independent of `TZ` and of the session,
  since `pg` parses `timestamptz` with its offset); number → `String(n)` (shortest round trip;
  a non-finite number → error); `null` → `NULL`; boolean → `true`/`false`; text → `'…'` with `'`
  doubled, or `E'…'` when it contains a character in U+0000–U+001F (except LF) or U+007F, with `\`
  doubled, `'` doubled and each such character as `\uXXXX`. Enum labels are text.
- Columns written (no `embedding`): project `id, name, root_path, language, framework, is_sample,
  indexed_commit, node_count, edge_count, indexed_at, created_at`; file `id, project_id, path, kind,
  loc, content_hash, redacted`; symbol `id, file_id, name, kind, start_line, end_line, signature`;
  edge `id, project_id, source_symbol_id, source_file_id, target_symbol_id, target_file_id, kind,
  resolution, extractor, weight`; commit `id, project_id, sha, message, author_hash, committed_at,
  pr_number`; file_commit `file_id, commit_id, lines_added, lines_removed`.
- One `INSERT INTO <table> (<columns>) VALUES (<values>);` per row; a blank line between tables;
  tables in FK order (project, file, symbol, edge, commit, file_commit).
- Ordering: files by path; symbols by (path, start_line numeric, kind, name); commits by sha;
  file_commit by (path, sha); edges by their full key string. Strings compared by code unit (`<`),
  never `localeCompare`.
- LF only, trailing LF, UTF-8 without BOM.

### D6 — Fingerprints by content (author decision, DIS-91 D4)

`packages/cli/src/seed/fingerprint.ts`:

- `fingerprint(inputs: { path: string; content: string }[])` → `sha256:<hex>`: sort by path (code
  unit), normalise `\r\n` → `\n` in the content, hash `path + '\0' + content + '\0'` for each.
  Synthetic dependency inputs have path `deps:<name>@<version>` and empty content.
- `collectFingerprintInputs(repoRoot)` → `{ analyzer, contract }`: recursive listing of
  `packages/analyzers/php/src/`, `packages/core/src/index/`, `packages/core/src/knowledge/`, plus
  `deps:tree-sitter-php@…` and `deps:web-tree-sitter@…` from `package-lock.json`
  (`packages["node_modules/<name>"].version`; missing → error); contract =
  `packages/core/src/ports/AnalyzerPort.ts` + `packages/adapters/store-postgres/migrations/*.up.sql`.
  Paths repository-relative with `/`.
- Justification (author): everything that shapes the rows; invalidating too much is `verify`'s safe
  failure (CM-HU-14.1).

The listing reads the working tree, not `git ls-files`: simpler and with no Git dependency. An
untracked file under those directories changes the fingerprint (Risks).

### D7 — Atomic write

The renderer's output is written to `<dir>/.<basename>.<pid>.tmp` in the output's directory, then
`renameSync`d over the output (same volume, so the rename replaces the file atomically on POSIX and
Windows). Any failure before or during the write unlinks the temporary file; the previous seed is
never opened for writing.

### D8 — `buildOne` gets an optional `log`

`buildOne(name, cfg, { log = console.log } = {})`: existing callers (tests, the CLI usage of the
script) are unchanged. `seed-build.ts`'s default `buildHistory` imports
`<repoRoot>/fixtures/build-history.mjs` dynamically (`pathToFileURL`) and calls
`buildOne('acme-shop', { dir: <fixturesRoot>/acme-shop, manifest:
<repoRoot>/fixtures/history/acme-shop.commits.mjs }, { log: () => {} })`, so stdout never shows the
fixture's absolute path. Alternative rejected: capturing `console.log` (global side effect).

### D9 — Tests

- Unit (`tests/unit/cli/`): `seed-deterministic-ids.spec.ts` (vector, prefix, duplicates),
  `seed-render-dump.spec.ts` (canonical values, shuffled input), `seed-fingerprint.spec.ts` (pure
  function + `collectFingerprintInputs` over a temporary tree), `seed-build.spec.ts` (fake
  `buildHistory`, fake base transaction recording calls, fake ports; missing configuration, failed
  indexing, failed read-back, temp file cleanup).
- Integration (`tests/integration/cli/seed-build.spec.ts`): acme-shop copied without `.git` under the
  OS temp dir as `fixturesRoot` (never `fixtures/`, PH-22), the real `buildHistory` on that copy,
  output to a temporary file, real `repoRoot`. Harness savepoint base for the content,
  reproducibility, time-zone and existing-`acme-shop` scenarios; the default base on `DATABASE_URL`
  for "The database is unchanged after a build" (a separate connection sees only committed state);
  `postgres://u:s3cret@127.0.0.1:1/db` for the unreachable database.
- Time zone: the test sets `process.env.TZ` (Node resets its time-zone cache on assignment), first
  asserts that `new Date(0).getTimezoneOffset()` changed (so the test cannot pass vacuously), and runs
  `SET TIME ZONE 'America/Bogota'` on the harness client for the second run; restored afterwards.
  Found during apply: Node resets the cache only on the **main thread**, and Vitest 1.6 runs test
  files in worker threads, where the assignment has no effect (the guard assertion failed with `-60`).
  `vitest.config.ts` → `poolMatchGlobs` runs `tests/integration/cli/seed-build.spec.ts` alone in the
  `forks` pool (a child process whose main thread honours the assignment); every other file keeps
  the default pool.

### D10 — No ADR

The decisions are local to a development tool and its file format, and reversible by regenerating
the seed. The format version line (`codemind-seed-format: 1`) is the compatibility handle for DIS-92
and CM-HU-14.1.

## Risks / Trade-offs

- [The empty `git diff` needs the author's `AUTHOR_HASH_SALT`] → documented in
  `docs/project-context.md` (DIS-91 D6, PH-11); the salt is never written to the seed or the
  fingerprint.
- [A user project named `__codemind_seed_build__` makes the build fail with `PROJECT_NAME_TAKEN`] →
  accepted: the name is reserved by convention and the error is explicit.
- [Two concurrent uncommitted indexings with the same temporary name: the second waits on the unique
  index] → only the seed-build spec file uses the name, and its tests run sequentially.
- [An untracked file under a fingerprint directory changes the fingerprint] → the failure is a false
  "stale" in `verify`, the safe direction; rerunning `seed:build` on a clean tree fixes it.
- [Changing the analyzer without rerunning `seed:build`] → that is exactly what the fingerprint lets
  CM-HU-14.1 detect; not checked in this change.
- [A server parsing `\u` escapes in `E''` literals needs `UTF8` encoding for code points above
  U+007F] → only U+0000–U+001F and U+007F are escaped, valid in every server encoding.
- [`process.env.TZ` assignment not honoured on some platform] → the test's first assertion fails
  loudly instead of passing vacuously.
- [The real run writes `fixtures/acme-shop/.git`] → gitignored and the documented flow of
  `fixtures/README.md`; `buildOne` always restores the tracked sources.

## Migration Plan

No schema change. Merge order: this change regenerates `seeds/graph-dump.sql`; DIS-92 then loads it.
Rollback: revert the commit; the placeholder seed and script come back.

## Follow-ups

- **Inbound note from DIS-98** (`unresolved` is outside `AnalyzerPort`; serialise only `files`,
  `symbols`, `edges`, `diagnostics`): not applicable — the seed is read back from the database, whose
  schema has no place for it. Answer in its thread at archive.
