## Why

CM-HU-05a (DIS-64) indexes a PHP/Laravel repository end to end. Every piece it needs already exists
in isolation — the PHP analyzer (DIS-47/49/52/61/97/98), the Git history reader and co-change rule
(DIS-35/36), the transactional store (DIS-23/24) and the security gateway (DIS-84) — but nothing
composes them: `docs/project-context.md` still says "nothing calls them yet (indexing is DIS-85)".
This is DIS-85 (CM-HU-05a.2): one use case in core that reads a confined repository, redacts
secrets, analyses it, reads its history, detects its framework and saves the complete graph with an
index report, so the CLI (DIS-86) and later the API (CM-HU-05b) only compose ports and show the
report. Ten hand-off notes from earlier tickets (DIS-12, 23, 35, 36, 47, 84, 96) land here and are
closed by this change.

## What Changes

- **Use case `indexRepository(deps, input)`** in `packages/core/src/index/`, with injected ports
  `sourceTree`, `analyzer`, `git`, `store` and an optional `onProgress` callback. Fixed order, no
  write until the graph is complete and valid: double confinement (lexical, then on real paths) →
  read files at `HEAD` → path and content hygiene → secret redaction → framework detection →
  analysis (filling `contentHash` and `redacted`) → history (commit messages redacted, orphan
  `fileCommits` dropped, `co_changed` edges) → `assertValidGraph` → `createProject` → one
  `saveGraph`. Returns an `IndexReport`. The use case opens no transaction and logs nothing.
- **New port `SourceTreePort`** (`realPath`, `readFiles`) and its adapter `createGitSourceTree()` in
  `packages/adapters/git`: reads the files tracked at `HEAD` (not the working tree), skips symbolic
  links, submodules and non-UTF-8 content (reported, not silent), rejects a non-root path with
  `NotAGitRepository` and a repository with no commit with `EmptyRepository`.
- **Framework detection by manifest** (`detectFramework`, pure, PH-24): `laravel/framework` in
  `composer.json` → `laravel`; `fastify` in `package.json` → `fastify`; otherwise `none`, never
  throwing. An explicit `input.framework` wins over detection.
- **Input hygiene before the analyzer** (`source-path.ts`): invalid path format, exact duplicate
  paths (first kept) and content with a NUL byte are dropped and reported in `report.skipped`.
- **Commit messages pass through the secret scanner** (decision D2 of the ticket); their events go
  to a separate `report.commitEvents`, so `SecretRedactedEvent.file` stays a file path.
- **Index report and progress types** (`index-report.ts`): `IndexReport`, `IndexPhase` (six phases:
  `confine`, `read`, `redact`, `analyze`, `history`, `save`), `SkipReason`, `CommitRedactionEvent`.
- **New domain error `EmptyRepository`** (`EMPTY_REPOSITORY`): the repository has no commit (not "no
  files").

## Non-goals

- The CLI command, presenting progress, exit codes, reading `ALLOWED_REPOS_DIR` / `AUTHOR_HASH_SALT`
  from the environment, opening/committing the transaction, and rejecting an unsupported
  `--language` (DIS-86; `input.language` arrives typed as `ProjectLanguage`).
- Reindexing an existing project or incremental indexing: a repeated `name` ends in
  `ProjectNameTaken` with nothing written (CM-HU-05b.1 / 05b.2). `POST /index` (CM-HU-05b).
- Embeddings of `file` / `symbol` (CM-HU-19). The TypeScript analyzer (CM-HU-18): the use case is
  language-agnostic but only tested with PHP.
- Persisting audit events (`StorePort.saveAuditEvents`, PH-09) or logging them from core.
- `gitleaks` (DIS-87 / CM-HU-05a.4).
- A per-file size limit, streaming the Git log or the file contents (DIS-35 debt, acceptable with
  fixtures).
- Escaping quotes in analyzer `diagnostics` messages (DIS-96 debt): only paths are filtered here.
- Executing or installing anything from the analysed repository (PH-19): only Git objects are read.
- No migration, no API route, no new dependency (`simple-git` is already in `packages/adapters/git`).

## Privacy and logging impact

Repository content is untrusted input that may hold credentials. Guarantees: every file is redacted
before the analyzer sees it, so `symbol.signature` never holds a secret; every commit message is
redacted before `saveGraph`; `content_hash` is computed over the **redacted** content; events never
carry the value; core writes nothing to any log (the report is data, the transport decides). Commit
authors already arrive pseudonymised (`authorHash`, DIS-35). Test secrets are the fixture's planted
key and synthetic literals built by concatenation. `/privacy-ethics-check` runs during apply.

## Capabilities

### New Capabilities

- `repository-indexing`: the index use case (order, confinement, hygiene, redaction of files and
  commit messages, framework detection, single snapshot write, report and progress) and the
  `SourceTreePort` contract with its Git adapter.

### Modified Capabilities

- `git-history` (added 2026-10-07, after `/adversarial-review`): two ADDED requirements. A broken
  `HEAD` propagates git's error instead of reading as an empty history; and reading the history
  executes nothing from the repository and does not let the repository's own configuration change
  the result (the reader used to run a repository's `gpg.program` through `log.showSignature`).

`code-analysis`, `graph-store` and `security-gateway` are consumed as they are; no requirement of
theirs changes. The `compareEdges` tie-break only enforces the existing `code-analysis` rule "An
exact edge takes precedence over a heuristic one" whatever the input order (tasks 11.6, 13.1).

## Impact

- Code (core): new `packages/core/src/index/{index-repository,framework-detect,index-report,source-path}.ts`,
  new `packages/core/src/ports/SourceTreePort.ts`, `EmptyRepository` in
  `packages/core/src/knowledge/errors.ts`; barrels updated. `node:crypto` for SHA-256 (precedent
  `knowledge/author-hash.ts`); `core-no-infra` stays green.
- Code (adapter): new `packages/adapters/git/src/git-source-tree.ts`, exported from its `index.ts`;
  reuses the repository-root check of `simple-git-history.ts`.
- Tests: `tests/unit/index/{framework-detect,index-repository}.spec.ts` (in-memory fake ports),
  `tests/integration/git/git-source-tree.spec.ts`, `tests/integration/index/acme-shop.spec.ts`
  (Postgres + Git, copy of the fixture under the OS temp dir, never built in `fixtures/`).
- Mutation: new code in `packages/core/src/index/` counts towards Stryker (`MIN_MUTATION_SCORE=70`).
- Docs: `docs/project-context.md` gotchas that say DIS-85 is pending, plus the use-case order and
  `SourceTreePort`; TypeDoc of every export; `prompts.md`.
- Linear: Spanish comment on DIS-86 with the composition contract; inbound notes of DIS-85 closed at
  archive.
