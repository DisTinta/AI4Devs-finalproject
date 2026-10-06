## Context

See `proposal.md` → Why. Current state that shapes the approach:

- Core has three modules re-exported from `packages/core/src/index.ts`: `ports/`, `knowledge/` and
  `index/` (the DIS-84 security gateway: `redactSecrets`, `confinePath`, `AuditEvent`). Core does no
  I/O; `.dependency-cruiser.cjs` rule `core-no-infra` enforces it. `node:path` and `node:crypto` are
  already used in core (`path-policy.ts`, `knowledge/author-hash.ts`).
- Ports consumed as they are: `AnalyzerPort.analyze({ files })` (first of repeated paths kept, with a
  diagnostic), `GitPort.readHistory(repoPath)` → `{ head?, commits, fileCommits }` (`head` undefined
  when there is no commit; `NotAGitRepository` for a non-root path), `StorePort.createProject` (only
  place `framework` is set; `ProjectNameTaken`) and `StorePort.saveGraph` (validates first with
  `InvalidGraph`; full snapshot; sets `indexed_commit`, `indexed_at`, `node_count`, `edge_count`;
  resolves to `SaveGraphResult { files, filesDeleted, symbols, edges, commits, fileCommits }`).
- `packages/adapters/git/src/simple-git-history.ts` already has the private helpers
  `assertRepositoryRoot(repoPath)` (real-path comparison with `git rev-parse --show-toplevel`) and
  `hasCommits(git)` (`rev-parse --verify --quiet HEAD`). `simple-git` (^4) offers
  `binaryCatFile(options)` resolving to a `Buffer`.
- `GraphFile.contentHash` and `GraphFile.redacted` exist in the model and the schema; the PHP
  analyzer fills neither.
- `StoreConnection = { pool } | { transaction }`: with `{ transaction }` every write is a `SAVEPOINT`
  and nothing is committed (the integration harness relies on it).
- Pure helpers ready to compose: `coChangeEdges(fileCommits, knownPaths)`, `sortUniqueEdges(edges)`,
  `assertValidGraph(graph)`.

## Goals / Non-Goals

**Goals:**

- One use case in core whose only collaborators are four ports and an optional callback; fully
  unit-testable with in-memory fakes.
- Nothing written unless the whole graph was built and validated; one `saveGraph` per indexing.
- One test per spec scenario, named exactly as the scenario.

**Non-Goals (design level):**

- No retry, no cancellation, no timeout inside the use case.
- No parallelism across files: phases are sequential and files are processed in input order.
- No new abstraction over the store's transaction: the caller owns it (D9).

## Decisions

### D1 — `SourceTreePort` reads the files tracked at `HEAD` through Git (author decision)

Author decision (2026-10-06), rationale as given:

> - Lo que se lee es el mismo commit que se guarda como indexedCommit = head. Si se recorre el árbol
>   de trabajo y está sucio, el grafo y su contentHash describirían un estado que ningún commit
>   tiene. Eso es incoherencia de datos, no solo una cuestión de gusto.
> - Deja fuera vendor/, node_modules/ y lo ignorado sin escribir reglas propias. Además descarta los
>   enlaces simbólicos (modo 120000) con un dato fiable, lo que refuerza el doble confinamiento de
>   DIS-84.
> - No añade dependencias, porque simple-git ya está en packages/adapters/git/package.json. Puede
>   reutilizar assertRepositoryRoot, así que el error NotAGitRepository sigue la misma regla en los
>   dos puertos.
> - No hace falta ADR.

Implementation in `packages/adapters/git/src/git-source-tree.ts`, `createGitSourceTree(): SourceTreePort`:

- The listing uses `git ls-tree -r -z --full-tree HEAD` rather than `git ls-files`: `ls-files` lists
  the **index**, which differs from `HEAD` when changes are staged; `ls-tree HEAD` gives exactly the
  committed tree with each entry's mode, type and object id. NUL framing, so paths arrive raw. Same
  Git config as the history reader (`core.quotepath=false`).
- Mode `120000` → skipped `symlink`; mode `160000` (type `commit`) → skipped `submodule`; mode
  `100644`/`100755` → blob read with `binaryCatFile(['blob', <oid>])` and decoded with
  `new TextDecoder('utf-8', { fatal: true })`; a decode error → skipped `binary-content`.
- `assertRepositoryRoot` and `hasCommits` move to a shared private module
  (`packages/adapters/git/src/repository.ts`) used by both adapters, so `NotAGitRepository` follows
  one rule. `readFiles` checks the root first, then `hasCommits` → `EmptyRepository`.
- `realPath(path)` = `fs.promises.realpath`; `ENOENT`/`ENOTDIR` → `NotAGitRepository(path)` (nothing
  to index there either); other errors propagate. The adapter does not know which path is the root:
  the use case maps that rejection to `IndexingDisabled` when it comes from `realPath(allowedRoot)`
  (D4), and lets it through unchanged when it comes from `realPath` of the repository.
- Exported from `packages/adapters/git/src/index.ts`. No new dependency.

Alternative rejected: walking the working tree with `fs` (dirty state, own ignore rules, symlinks to
detect by `lstat`, needs an ADR).

### D2 — Commit messages pass through the scanner (ticket decision)

Each `commit.message` that is defined goes through `redactSecrets({ path: commit.sha, content: message })`.
The resulting events are mapped to `CommitRedactionEvent { commit, line, column, rule }` in
`report.commitEvents`, so `SecretRedactedEvent.file` keeps meaning "a file path". The redacted
message replaces the original in the saved commit.

### D3 — Module layout and public API

```ts
// packages/core/src/ports/SourceTreePort.ts
export interface SourceTree { files: SourceFile[]; skipped: SkippedEntry[] }
export interface SourceTreePort {
  realPath(path: string): Promise<string>;
  readFiles(root: string): Promise<SourceTree>;
}

// packages/core/src/index/index-report.ts
export const INDEX_PHASES = ['confine', 'read', 'redact', 'analyze', 'history', 'save'] as const;
export type IndexPhase = (typeof INDEX_PHASES)[number];
export type SkipReason = 'duplicate-path' | 'invalid-path' | 'binary-content' | 'symlink' | 'submodule';
export interface SkippedEntry { path: string; reason: SkipReason }
export interface CommitRedactionEvent { commit: string; line: number; column: number; rule: SecretRule }
export interface IndexReport {
  projectId: string; indexedCommit: string;
  framework: ProjectFramework; frameworkSource: 'detected' | 'explicit';
  files: number; filesDeleted: number; symbols: number; commits: number; fileCommits: number;
  edges: { total: number; exact: number; heuristic: number };
  events: AuditEvent[]; commitEvents: CommitRedactionEvent[];
  diagnostics: AnalyzerDiagnostic[]; skipped: SkippedEntry[];
}

// packages/core/src/index/framework-detect.ts
export function detectFramework(files: readonly SourceFile[]): ProjectFramework;

// packages/core/src/index/source-path.ts
export function selectIndexableFiles(files: readonly SourceFile[]): { files: SourceFile[]; skipped: SkippedEntry[] };

// packages/core/src/index/index-repository.ts
export interface IndexDependencies {
  sourceTree: SourceTreePort; analyzer: AnalyzerPort; git: GitPort; store: StorePort;
  onProgress?: (phase: IndexPhase) => void;
}
export interface IndexInput {
  repoPath: string; allowedRoot: string | undefined; name: string;
  language: ProjectLanguage; framework?: ProjectFramework;
}
export function indexRepository(deps: IndexDependencies, input: IndexInput): Promise<IndexReport>;

// packages/core/src/knowledge/errors.ts
export class EmptyRepository extends DomainError { readonly code = 'EMPTY_REPOSITORY'; readonly repoPath: string }
```

The JSDoc of `indexRepository` lists its `@throws`: `IndexingDisabled` (blank root, or a root that
does not exist), `ForbiddenPathError` (always carrying `input.repoPath`, D4), `NotAGitRepository`,
`EmptyRepository`, `InvalidGraph`, `ProjectNameTaken`.

**Layer guard (found in apply, author decision 2026-10-06).** `detectFramework` holds the domain value
`fastify` (the framework name, as in `PROJECT_FRAMEWORKS`, and the dependency key looked up in
`package.json`). The post-edit hook's `GUARD_HTTP_IN_BUSINESS` (`.claude/sdd-harness.env`) grepped the
bare word `fastify` in `packages/core` and blocked the file. The guard now matches transport imports
only: `from`, `require(` or `import(` of `fastify` / `@fastify/…`, `FastifyRequest`, `FastifyReply`,
`node:http` and infrastructure package paths. Separate commit `chore(DIS-85): match transport imports
in the core layer guard`; dependency-cruiser `core-no-transport` stays the CI rule and stays green.

`SkipReason` and `SkippedEntry` live in `index-report.ts` and the port imports them (ports already
import from `knowledge/`; `index/` → `ports/` and `ports/` → `index/` types only, no runtime cycle).
If dependency-cruiser flags the cycle, `SkippedEntry`/`SkipReason` move to
`ports/SourceTreePort.ts` and `index-report.ts` re-exports them; the public names do not change.

### D4 — Phases and progress (author decision: the six phases of the ticket)

Author decision (2026-10-06), rationale as given:

> - detectFramework es una función pura y barata, y se salta cuando llega input.framework. Una fase
>   propia daría al CLI un paso instantáneo y opcional. También rompería la regla de «cada fase una
>   vez, en orden», o la volvería condicional, y eso complica E1.
> - Añadir una fase más adelante no rompe nada. Quitarla sí rompe el contrato con DIS-86.

Mapping (spec, requirement "Indexing order and no partial write"): detection belongs to `redact`;
`history` includes the empty check, the message redaction, the link filter and the co-change edges;
`save` includes `assertValidGraph`, `createProject` and `saveGraph`. `onProgress(phase)` is called
**when the phase starts**, so a rejection inside `confine` is preceded by exactly one `confine`
call: the spy can then tell which phase failed. A throwing callback propagates (the caller's bug,
not swallowed).

Error mapping inside `confine` (spec, same requirement):

1. `confinePath(input.repoPath, input.allowedRoot)` — lexical; its `IndexingDisabled` and
   `ForbiddenPathError` already name what was requested, so they propagate as they are.
2. `realPath(allowedRoot)` is awaited first, in its own `try`/`catch`: a `NotAGitRepository` from it
   is rethrown as `new IndexingDisabled()` (a configured root that cannot be used = indexing
   disabled). Any other error propagates.
3. `realPath(lexicalRepo)` — its `NotAGitRepository` propagates unchanged.
4. `confinePath(realRepo, realRoot)` in a `try`/`catch`: a `ForbiddenPathError` is rethrown as
   `new ForbiddenPathError(input.repoPath)`, so neither `requestedPath` nor the message ever holds the
   resolved real path (the target of a symbolic link). Capture-and-rethrow was chosen over a separate
   boolean check so the acceptance rule stays in one function (`confinePath`, DIS-84).

### D5 — `EmptyRepository` is checked twice (author decision)

`readFiles` throws it (the author's recommendation: `ls-tree HEAD` has nothing to read, and the port
must not decide silently). The use case also throws it when `readHistory` returns no `head`, because
the two reads are separate port calls and a fake or a racing repository can disagree. JSDoc states
"no commit", not "no files".

### D6 — Input hygiene order

Rules and their order are in the spec. Two points beyond the ticket's wording, recorded as
assumptions: a path with an empty, `.` or `..` segment is `invalid-path` (Git never produces one, and
it would let a path name another file once joined); an entry dropped as `invalid-path` does not claim
its path for the duplicate rule. NUL detection is on the decoded string (`content.includes('\0')`),
since Postgres rejects NUL in text.

### D7 — `contentHash`

`createHash('sha256').update(redactedContent, 'utf8').digest('hex')` from `node:crypto`, over the
**redacted** content, so the hash never fingerprints a secret and a re-index of the same commit gives
the same hash. Matched to each `GraphFile` by `path` (the analyzer returns one `GraphFile` per distinct
input path).

### D8 — Edges and links

`knownPaths` = the paths of `analysis.files`. `coChangeEdges` receives the history's **unfiltered**
`fileCommits` (dropped paths still count in the Jaccard denominators, DIS-36 note); the saved graph
receives only the links whose `file` is in `knownPaths`. Edges = `sortUniqueEdges([...analysis.edges, ...coChange])`.
`co_changed` never collides with an analyzer kind, so no `exact`/`heuristic` precedence is needed.

### D9 — The caller owns the transaction

The use case never calls `BEGIN`/`COMMIT`. For `createProject` + `saveGraph` to be atomic, the
composition root opens a transaction and passes `createPostgresStore({ transaction: client })`, then
commits or rolls back on the result. The integration test does exactly that with the harness's
`db()`. With `{ pool }` they are two transactions; validating before `createProject` (spec) narrows
the window but cannot close it. The contract goes to DIS-86 as a Spanish Linear comment.

### D10 — Report counts and order

`files`, `filesDeleted`, `symbols`, `commits`, `fileCommits` come from `SaveGraphResult`;
`edges.exact`/`edges.heuristic` are counted over the saved graph's edges by `resolution`, and
`edges.total` is its length. `events` sorted by file path in UTF-8 byte order, stable within a file.
Byte order is code point order, compared with `codePointAt`; plain `<` (UTF-16 code units, what
`compareEdges` uses) differs from it above U+FFFF, so it is not reused here (found in apply). `commitEvents` follow the history's order (newest first).
`skipped` sorted by path, then reason (byte order).

### D11 — Tests

- Unit (`tests/unit/index/`, no I/O): `framework-detect.spec.ts`, `index-repository.spec.ts` with
  hand-written in-memory fakes recording calls in one shared log (to assert order across ports).
  Synthetic secrets built by concatenation (DIS-84 D8).
- `tests/integration/git/git-source-tree.spec.ts`: throwaway repositories under the OS temp dir with
  synthetic identities (`git -c user.name=… -c user.email=…`). Symlink and submodule entries are
  created with `git update-index --add --cacheinfo 120000,<blob>,lib/link.php` and
  `160000,<sha>,vendor/sub`, so no file-system symlink and no network are needed (works on Windows
  without privileges). The `realPath` scenario uses a directory symlink of type `'junction'` on
  Windows and `'dir'` elsewhere.
- `tests/integration/index/acme-shop.spec.ts`: `beforeAll` copies the fixture without `.git` under
  the OS temp dir and runs `buildOne` (template `simple-git-history.spec.ts`; never in `fixtures/`);
  `describeWithDatabase` + `useTransactionPerTest`, store built on `db()`; the project data set up in
  the test body (Vitest hook order gotcha). Oracles: `git rev-parse HEAD`, `git rev-list --count HEAD`
  on the copy; `/AKIA[A-Z0-9]{16}/` over `symbol.signature` and `commit.message`.

Scenario → test file: "Source tree contract" scenarios → `git-source-tree.spec.ts`; "The framework is
detected from the root manifest" → `framework-detect.spec.ts`; "acme-shop is indexed completely" and
"The planted secret of acme-shop never reaches the database" → `acme-shop.spec.ts`; every other
scenario → `index-repository.spec.ts`.

### D12 — No ADR

The decisions stay inside one use case and one adapter and are cheap to revert; D1 follows the
ticket's recommendation (the author confirmed no ADR is needed).

## Risks / Trade-offs

- [`{ pool }` store gives two transactions] → validation before `createProject`; D9 contract to DIS-86.
- [One `git cat-file` process per blob] → fine for fixtures (tens of files); batching with
  `cat-file --batch` belongs with the streaming debt (DIS-35 note, non-goal here).
- [`TextDecoder` drops a leading UTF-8 BOM] → line numbers unchanged; `contentHash` is over the
  decoded content, consistently across re-indexes.
- [Only root manifests are read] → a monorepo whose framework is declared in a sub-package gets
  `none`; `--framework` (DIS-86) overrides it.
- [A manifest whose redacted value breaks JSON] → the marker sits inside the quoted string, so JSON
  stays valid; if not, detection gives `none` without throwing.
- [Case-variant paths `app/a.php` / `app/A.php`] → distinct for Git, the analyzer and the
  `(project_id, path)` key; kept as two files.
- [`readHistory` loads the whole log in memory] → DIS-35 debt, unchanged.
- [The acme-shop oracle `/AKIA[A-Z0-9]{16}/` over `symbol.signature` does not exercise the analyzer
  path: the planted key lives in a config array that yields no symbol, so an analyzer fed unredacted
  content would still pass it (seen in apply, mutation (2) of task 4.10)] → the guarantee is covered by
  the unit scenario "The analyzer only receives redacted content" (author decision 2026-10-06).
- [The narrower layer guard misses a transport reference that is not an import, e.g. a string
  `'fastify'` passed to a dynamic loader] → the hook is an early warning only; dependency-cruiser
  (`core-no-transport`) checks the real import graph in CI.

## Migration Plan

No migration, no data change. Rollback = revert the commits; nothing calls the use case until
DIS-86.

## Follow-ups

- **B → DIS-86:** Spanish comment with the composition contract (open the transaction, pass
  `createPostgresStore({ transaction: client })`, commit or roll back on the result, read
  `ALLOWED_REPOS_DIR` and `AUTHOR_HASH_SALT` at the composition root, consume `onProgress`, validate
  `--language` against `PROJECT_LANGUAGES` and `--framework` against `PROJECT_FRAMEWORKS`, map
  `EMPTY_REPOSITORY` to an exit code; an `ALLOWED_REPOS_DIR` that does not exist arrives as
  `IndexingDisabled`, the same as an empty one; `ForbiddenPathError` names the path as typed, never
  the resolved real path).
- **Inbound notes into DIS-85** (archive ritual): DIS-12, DIS-23 (×2), DIS-35 (×2), DIS-36, DIS-47,
  DIS-84, DIS-96 (×2) — each closed by a requirement of this change or reassigned.
