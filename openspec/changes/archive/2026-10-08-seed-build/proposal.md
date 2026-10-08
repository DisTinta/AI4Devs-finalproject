## Why

CM-HU-06 (DIS-88) promises that an evaluator runs CODEMIND without PHP, without cloning anything and
without waiting: the sample graphs travel as a versioned SQL seed. Today `npm run seed:build` is a
placeholder that prints `pending Ticket 3` and `seeds/graph-dump.sql` is three comment lines. This is
DIS-91 (CM-HU-06.1): the real `seed:build`, which rebuilds acme-shop's history, indexes it with the
real pipeline and writes a seed that is reproducible byte for byte (two consecutive runs leave
`git diff` empty in `seeds/`) and carries the fingerprint `verify` (CM-HU-14.1) will compare against
the current code (PH-12). Loading the seed (`db:seed`) is DIS-92 and depends on this file.

The indexing pipeline as it is cannot produce such a file: every id comes from `gen_random_uuid()`,
`indexed_at` and `created_at` come from the wall clock, `root_path` holds the machine's absolute
real path (which contains the OS user name), and `indexRepository` creates projects with
`is_sample = false`. The seed builder has to neutralise all four without changing `packages/core`.

## What Changes

- **`npm run seed:build`** becomes real: `tsx --tsconfig packages/cli/tsconfig.run.json
  packages/cli/src/seed-build.ts`, a development tool (not a `codemind` subcommand) exposed as a
  testable `runSeedBuild(deps) → Promise<number>`. It validates `AUTHOR_HASH_SALT` and
  `DATABASE_URL`, rebuilds acme-shop's history with `buildOne` from `fixtures/build-history.mjs`,
  indexes `fixtures/acme-shop` through `indexWithEnvironment` (the `index` command's composition
  root) with `fixtures/` as the allowed root, whatever `ALLOWED_REPOS_DIR` says.
- **Nothing is ever committed.** The indexing runs under the constant temporary name
  `__codemind_seed_build__` inside a transaction whose `commit()` exports the project's rows and then
  rolls back. The database is left exactly as it was, and an `acme-shop` already loaded in it does
  not block the build. No `DELETE` anywhere.
- **Row export** in the store adapter (`packages/adapters/store-postgres/src/export-seed.ts`):
  `project`, `file`, `symbol`, `edge`, `commit`, `file_commit` of one project, read on the
  transaction's client. Not part of `StorePort`: it is development tooling, not domain.
- **Deterministic dump** (`packages/cli/src/seed/`): every id replaced by a UUID v5 of its natural
  key, prefixed by the project name, under a fixed namespace; duplicate edges disambiguated by an
  occurrence index; `name = 'acme-shop'`, `is_sample = true`, `root_path = 'fixtures/acme-shop'`,
  `created_at` and `indexed_at` = the `HEAD` commit's date; canonical values (UTC ISO-8601
  timestamps with milliseconds, shortest round-trip doubles, literal `NULL`); rows in natural-key
  order; explicit-column `INSERT`s, LF line endings.
- **Fingerprint header**: `-- analyzer-fingerprint: sha256:…` (every repository file that produces
  the seed's rows: the PHP analyzer, `core/index`, `core/knowledge`, the seed renderer and its composition, the
  Git and store adapters, the history rebuilder, its manifests and the acme-shop fixture, plus the
  resolved versions of `tree-sitter-php` and `web-tree-sitter`) and
  `-- contract-fingerprint: sha256:…` (`AnalyzerPort.ts`, the `.up.sql` migrations), content-based
  and line-ending independent.
- **Atomic write**: the dump goes to a temporary file in `seeds/` and is renamed over
  `seeds/graph-dump.sql` only at the end; any failure leaves the previous file intact.
- **Errors** follow the `index` command's format and codes (`MISSING_CONFIG`,
  `DATABASE_UNAVAILABLE`, domain codes, `INTERNAL`); an `INTERNAL` of the seed build always says
  `seed build failed; nothing was written`, never "may have been saved".
- **`fixtures/build-history.mjs`**: `buildOne` gains an optional `log` option (default
  `console.log`, so current callers do not change), so the seed build does not print the fixture's
  absolute path.
- **`seeds/graph-dump.sql`** regenerated and versioned with acme-shop's graph.

## Non-goals

- `db:seed`, idempotent loading, preserving non-sample projects, `cli projects`,
  `packages/web/src/data/sample-projects.ts` and the `make up` summary (DIS-92).
- `task-api` in the seed (DIS-32 / CM-HU-18.3): Entrega 2 seeds only acme-shop (PH-02).
- Evaluation cache and golden answers (CM-HU-13); checking the fingerprint in `verify` (CM-HU-14.1).
- Embeddings in the seed (CM-HU-19): every `embedding` stays `NULL` and is not written.
- Running `seed:build` in CI; the fingerprint is what detects a stale seed (PH-12).
- Portability of the dump across major Postgres versions.
- Any change to `packages/core`, to `StorePort` or to the schema (no `seed_meta` table, no migration).
- A byte-identical dump across different `AUTHOR_HASH_SALT` values: `author_hash` depends on the
  salt (PH-11); the empty `git diff` holds with the author's development salt.

## Privacy and logging impact

The seed is versioned and published with the delivery, so it is the first artefact that carries
indexed data out of a database. Guarantees: secrets are already redacted by the indexing gateway
before they are stored; the real `root_path` is never written (replaced by `fixtures/acme-shop`);
commit authors appear only as `author_hash` (the salt is not in the seed nor in the fingerprint);
neither stdout nor stderr shows the database URL, its credentials or the fixture's absolute path.
The fixture's authors are fictitious. `/privacy-ethics-check` runs during apply.

## Capabilities

### New Capabilities

- `seed-build`: the `seed:build` contract — configuration checks, history rebuild and indexing of
  the sample repository without committing to the database, the seed file's format (header,
  fingerprints, deterministic ids, canonical values, ordering, sample attributes), byte-for-byte
  reproducibility, atomic write and error reporting.

### Modified Capabilities

None. `cli-indexing`, `repository-indexing`, `git-history`, `code-analysis`, `graph-store` and
`graph-schema` are consumed as they are; no requirement of theirs changes.

## Impact

- Code (cli): new `packages/cli/src/seed-build.ts` and `packages/cli/src/seed/{render-dump,
  fingerprint,deterministic-ids,seed-transaction}.ts`; reuses `indexWithEnvironment`,
  `defaultOpenTransaction`, `defaultPorts`, `toCliError` and `toTerminalSafeJson` from
  `compose-index.ts` / `safe-json.ts` without changing their behaviour.
- Code (adapter): new `packages/adapters/store-postgres/src/export-seed.ts`, exported from the
  package index. No change to `StorePort` or to existing queries.
- Fixtures tooling: `fixtures/build-history.mjs` → optional `log` option of `buildOne`.
- Scripts: root `package.json` `seed:build`. `db:seed` stays a placeholder (DIS-92).
- Data: `seeds/graph-dump.sql` regenerated.
- Dependencies: none new (`node:crypto` for SHA-1/SHA-256; `pg` already in `packages/cli`).
- Tests: `tests/unit/cli/seed-*.spec.ts` (pure functions, transaction wrapper, command with fakes),
  `tests/integration/cli/seed-build.spec.ts` (Postgres + Git, acme-shop copy under the OS temp dir,
  output to a temp file).
- Mutation: `packages/cli/src/**` is already in `stryker.config.json`; score ≥ 70 % on the new files.
- Docs: `docs/project-context.md`, `fixtures/README.md`, `prompts.md`.
- Linear: DIS-91; inbound note from DIS-98 (`unresolved` field) closed at archive as not applicable.
