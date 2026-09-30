## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/core/src/ports/GitPort.ts` is an empty interface; `packages/adapters/git/src/index.ts`
  is `export {}`. `@codemind/adapter-git` depends only on `@codemind/core` and its `tsconfig.json`
  has **no** `references` to core (store-postgres has one: the pattern to copy).
- `GraphCommit` / `GraphFileCommit` (DIS-23) already describe what the store accepts. `validateGraph`
  requires every `fileCommits[].file` to be a path of `graph.files`, and every link's `sha` to be a
  commit of the graph.
- `commit` / `file_commit` tables exist (`0002`); `saveGraph` upserts both and never deletes them.
  No migration and no store change are needed.
- `fixtures/acme-shop/.git` is gitignored and rebuilt by `node fixtures/build-history.mjs acme-shop`
  (verified: 32 commits, author = committer, same fixed date for both, names with non-ASCII letters
  — `Lucía Fernández`, `Marta Ibáñez` — e-mails `@acme.test`, 17 `(#NN)` subjects, 0 merges, 0
  renames, 0 binaries). The fixture directory sits **inside** the Codemind repository: if its `.git`
  is missing, `git` silently resolves to the parent repository.
- Stryker mutates `packages/core/src/**` and ignores `tests/integration/**`: rules that must be
  mutation-tested need unit tests over core.
- Vitest aliases `@codemind/core` to its sources; tests import adapters by relative path
  (`graph-write.spec.ts` does so for the store).
- CI (`.github/workflows/ci.yml`) runs on Ubuntu with `git` available; it has no step that rebuilds
  the fixtures.

## Goals / Non-Goals

**Goals:**

- A `GitPort` whose output can be handed to `saveGraph` unchanged (after the caller adds `files`).
- Pseudonymisation and parsing rules as pure core functions, mutation-tested.
- One `git` process for the whole log, deterministic output, correct on Windows and Linux.

**Non-Goals (design level):**

- No streaming or pagination of the log: repositories in scope (fixtures, the author's validation
  repository) fit in memory. Revisit if a large repository is indexed.
- No caching of history between calls; incremental history is DIS-10's concern.

## Decisions

### D1 — Contract in core, output reuses the graph types

```ts
export interface GitHistory {
  head?: string;
  commits: GraphCommit[];
  fileCommits: GraphFileCommit[];
}
export interface GitPort {
  readHistory(repoPath: string): Promise<GitHistory>;
}
```

`GitHistory` lives in `ports/GitPort.ts` next to the port (it is the port's result type, like
`SaveGraphResult` for the store). Reusing `GraphCommit` / `GraphFileCommit` means DIS-85 spreads the
history into a `KnowledgeGraph` without mapping.

*Alternative:* a separate `RawCommit` with name/e-mail and a core use case that hashes. Rejected: it
would make personal data cross the port and travel through the domain, which is exactly what readme
§2.5 forbids; the adapter is the only place that ever sees an identity.

### D2 — Pure rules in core: `author-hash.ts`, `commit-message.ts`

- `pseudonymiseAuthor(identity: { name: string; email: string }, salt: string): string` —
  `HMAC-SHA256(key = salt, data = normalise(email) || normalise(name))`, hex. `normalise` = trim +
  `toLowerCase()`. Uses `node:crypto` (`createHmac`), which is deterministic and I/O-free; core
  already compiles with `types: ["node"]` and `core-no-infra` forbids only adapters and transport.
- `extractPrNumber(message: string): number | undefined` — subject = text before the first `\n`;
  last match of `/\(#(\d+)\)/g`, else `/^Merge pull request #(\d+)\b/`; `Number.parseInt`, only if
  `Number.isSafeInteger`.
- `stripIdentityTrailers(message: string): string` — drop lines matching
  `/^\s*(co-authored-by|signed-off-by|reviewed-by|acked-by|reported-by|tested-by|suggested-by):/i`,
  then trim trailing whitespace/blank lines. Lines are split on `\n` with a trailing `\r` tolerated.
  `Tested-by` and `Suggested-by` are a privacy expansion beyond the ticket's five trailers: same
  `Name <e-mail>` form, same risk. Every one of the seven names is in the spec's MUST and has its own
  unit case (tasks 4.1).
- The e-mail counts as empty when it is `''` or whitespace-only after trimming; then the normalised
  name is hashed (spec scenario "An empty e-mail falls back to the normalised name").

*Why HMAC, not `sha256(salt + email)`:* HMAC is the standard keyed construction and is not open to
length-extension or ambiguous concatenation; the cost is the same.

*Why e-mail first:* the e-mail is the stable identity in Git; names vary in spelling for one person.
A name-only hash is the fallback for commits with an empty e-mail.

*Alternative:* keep the rules inside the adapter. Rejected: Stryker would not cover them, and they
are the privacy guarantee of the feature.

### D3 — `NotAGitRepository` in `knowledge/errors.ts`

`class NotAGitRepository extends DomainError { code = 'NOT_A_GIT_REPOSITORY'; constructor(readonly
repoPath: string) }`, message `Not a Git repository: <path>`. Same pattern as `ProjectNotFound`.

### D4 — Adapter: one `git log` pass through `simple-git`

`createSimpleGitHistory({ authorHashSalt }): GitPort` in `packages/adapters/git/src/simple-git-history.ts`:

1. **Salt check first** — blank salt throws (see D5) inside the factory, before any `git` runs.
2. **Repository-root check** — if `repoPath` does not exist or is not a directory → `NotAGitRepository`
   naming it (checked with `fs.realpath` + `fs.stat` before constructing `simpleGit`, which itself
   throws on a missing directory). Then `git rev-parse --show-toplevel` must succeed and its real
   path must equal the real path of `repoPath`; otherwise → `NotAGitRepository`. This rejects
   `fixtures/acme-shop` when its own `.git` is missing, instead of reading the Codemind history.
   *Revised during apply:* the first version used `checkIsRepo(CheckRepoActions.IS_REPO_ROOT)`, but
   simple-git implements it as "`rev-parse --git-dir` is `.git`", which also rejects the root of a
   linked worktree (its git dir is `<main>/.git/worktrees/<name>`), although the spec requires any
   top-level directory to be accepted. Comparing real paths also absorbs Windows `/` vs `\` and 8.3
   short names.
3. **Empty repository** — `git rev-parse --verify --quiet HEAD` failing → return the empty history.
4. **Log** — a single `git.raw([...])`:
   `-c core.quotepath=false -c i18n.logOutputEncoding=UTF-8 log HEAD --no-renames --numstat
   --no-color --format=<RS>%H<US>%aN<US>%aE<US>%cI<US>%B<US>` where `<RS>` = `%x1e` and `<US>` = `%x1f`
   (control characters never appear in names, e-mails or messages). `%aN`/`%aE` honour `.mailmap`.
   Default order is newest first; merge commits appear with no numstat (no links), as `git log` does.
5. **Parse** — split records on `\x1e`; per record: fields split on `\x1f`; numstat lines
   `added\tremoved\tpath`; `-\t-\tpath` → binary, no counts. Hash the identity immediately and keep
   only the hash; message → `stripIdentityTrailers`; `prNumber` → `extractPrNumber` on the raw
   message (subject is kept by stripping anyway).
6. `head` = sha of the first record.

*Why `simple-git` over `child_process` directly:* chosen in readme §2.2; it handles process spawning,
`baseDir` and error wrapping. It is only used for `raw`, so replacing it later is
cheap.

*Why one pass, not `git log` + `git show --numstat` per commit:* N processes for N commits is the
dominant cost; one pass is O(1) processes.

*Alternative:* `git.log()` with `--stat` parsing by simple-git. Rejected: its `diff` summary does
not expose per-file added/removed for binaries reliably and adds a parser we do not control.

### D5 — Salt configuration: parameter in, env reader separate

`authorHashSaltFromEnv(env: Record<string, string | undefined>): string` in
`packages/adapters/git/src/config.ts` returns the trimmed value or throws
`Error('AUTHOR_HASH_SALT is required to pseudonymise commit authors; set it in .env (see .env.example)')`.
The factory `createSimpleGitHistory({ authorHashSalt })` receives the salt as a parameter, never reads
the environment, and throws the same message on a blank salt before any `git` runs; the spec's
"Salt is mandatory" requirement names both checks. Reading `process.env` is left to
the composition root (CLI, DIS-85), per backend-standards "validate required environment variables
at boot". The salt is not a domain concept, so this is a plain `Error`, not a `DomainError`.

### D6 — Tests

- **Unit** (`tests/unit/knowledge/author-hash.spec.ts`, `commit-message.spec.ts`): cover every
  scenario of the `Author pseudonymisation` (normalisation), `Message sanitisation` and
  `Pull request number` requirements at the function level, plus boundaries for Stryker (empty
  e-mail fallback, `\r\n`, several `(#N)`, non-matching `Merge pull request` in the body).
- **Integration** (`tests/integration/git/simple-git-history.spec.ts`):
  - `beforeAll` rebuilds acme-shop once with `node fixtures/build-history.mjs acme-shop` (spawned
    like `runCommand` in `tests/integration/store/support.ts`); only this spec rebuilds a fixture,
    so no two specs race on it.
  - Temporary repositories under `os.tmpdir()` (`mkdtemp`), created with
    `git -c user.name=… -c user.email=… -c commit.gpgsign=false`, removed in `afterAll`.
  - The persistence scenario runs under `describeWithDatabase` + `useTransactionPerTest` with
    `createPostgresStore`, like `graph-write.spec.ts`; the other scenarios need no database.
  - Author names/e-mails to search for are read from the rebuilt fixture with
    `git log --format=%aN%n%aE`, not hard-coded, so the check follows the fixture.
- Build wiring: add `references: [{ "path": "../../core" }]` to `packages/adapters/git/tsconfig.json`.

### D7 — No ADR

The only cross-module decision (hash in core, adapter owns identities) is local to this capability
and cheap to revert; `simple-git` was already decided in readme §2.2. The rationale lives here and in
the `git-history` spec.

## Risks / Trade-offs

- [Non-ASCII names or paths garbled on Windows] → force `i18n.logOutputEncoding=UTF-8` and
  `core.quotepath=false`; the acme-shop fixture's accented names are the regression test.
- [A missing fixture `.git` makes `git` read the parent repository] → top-level check by real path (D4.2)
  plus the `A subdirectory of a repository is rejected` scenario.
- [Salt changes invalidate every stored `author_hash`] → accepted: pseudonyms are only compared
  within one indexing; documented in `.env.example`. Seeds carry precomputed hashes (PH-11).
- [Low-entropy e-mails are guessable by brute force if the salt leaks] → salt never logged nor
  committed; HMAC keeps hashes unlinkable without it.
- [Trailer list is not exhaustive] → the listed trailers are the ones Git and GitHub emit; an
  unknown trailer with an identity would survive. Accepted for this slice; the list is one constant.
- [Whole log held in memory] → fine for the repositories in scope; see Non-Goals.
- [Rename history lost with `--no-renames`] → a rename shows as a delete + add; links to the old
  path are dropped by DIS-85 when they are not in the snapshot. Co-change for renamed files is
  weaker; accepted.
- [`simple-git` version drift] → pin a caret range of the current major; only `raw` is
  used (the constructor's `baseDir`/`config` options aside).
- [A linked worktree's root rejected as "not a repository"] → found during apply with
  `IS_REPO_ROOT`; fixed by the real-path top-level check (D4.2), with a boundary test
  "accepts the top-level directory of a linked worktree".

## Migration Plan

No schema or data migration. Deploy = merge; rollback = revert the commit. Operators must add
`AUTHOR_HASH_SALT` to `.env` before DIS-85 wires the adapter; until then nothing calls it.

## Post-verify delta (verify-against-spec, 2026-09-30)

`/verify-against-spec` found three places where the code and this design disagreed with the spec's
wording. The spec was changed to match the code (no production change):

- **The salt is trimmed** (D5): the HMAC key is the trimmed value, in the helper and in the adapter,
  so a stray space in `.env` cannot silently change every hash.
- **Indented identity trailers are removed** (D2, `^\s*`): an indented `signed-off-by:` line still
  carries a name and an e-mail.
- **Trailing whitespace is always trimmed** (D2, `trimEnd()`), not only after a removal. Git already
  strips trailing blank lines from messages, so this changes nothing observable in practice.

Three clauses that were MUST without a scenario got one, each with its test: *Reading does not
modify the repository*, *A merge commit is listed without file links*, *The returned history holds
no name or e-mail* (in memory, without a database). The spec now has 20 scenarios.

Documented here, deliberately without a scenario:

- **"No Git process before a salt failure"** is guaranteed by construction: the factory validates the
  salt synchronously and throws before any `GitPort` exists, and the helper runs no process at all.
  Counting spawned processes would need a module mock of `simple-git`, a heavier test than the rule.
- **"The error does not contain the salt value"** can only be checked with a blank salt, because a
  non-blank salt never raises that error. The message is a constant (`MISSING_SALT_MESSAGE`), which is
  the real guarantee.
- **Unsafe PR numbers are dropped** (D2): a `(#N)` whose value is not a safe integer gives no
  `prNumber` rather than an inexact one.
- **Renames** are read as a delete plus an add (`--no-renames`, proposal non-goal; see Risks).
- **Repository root**: the root of a linked worktree is accepted (boundary test), and a symbolic link
  to a repository root is accepted too, because both sides are compared as real paths (D4.2).
- **Public exports**: `IDENTITY_TRAILERS`, `AuthorIdentity`, `pseudonymiseAuthor`, `extractPrNumber`
  and `stripIdentityTrailers` are part of `@codemind/core`'s public API, for DIS-36/DIS-85 and tests.
- **Log separators**: a commit message containing the control characters `\x1e` or `\x1f` would break
  the record split. Git messages practically never contain them; accepted, not handled.
