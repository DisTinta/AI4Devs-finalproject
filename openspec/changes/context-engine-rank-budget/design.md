## Context

See proposal.md → Why. State this design starts from (DIS-28 reality map, checked against the code):

- `anchor` (`packages/core/src/context/anchor.ts`) runs one `findSymbols` per term, sequentially,
  with no cap on terms nor on anchor symbols. `expand` (`expand.ts`) makes one `neighbors` call with
  `direction: 'both'` and `EXPANSION_EDGE_KINDS`.
- `Neighbor` (`knowledge/graph-read.ts`) is a node plus `distance`; it has no `resolution`.
  `StoredSymbol` has `fileId` but not the file's kind; `StoredFile.kind` exists.
- `NEIGHBORS` (`adapters/store-postgres/src/queries.ts`) walks **paths**: `UNION ALL` plus a
  per-path `visited` array, no `statement_timeout`. `FIND_SYMBOLS` is an `ILIKE` with no trigram
  index.
- The database stores no file content, only `file.content_hash`. `SourceTreePort.readFiles(root)`
  reads every file at `HEAD`; there is no single-file read nor a read at a given commit.
  `git-source-tree.ts` has `spawnGit`, `OBJECT_ID`, `MAX_BLOB_BYTES = 1 048 576`.
- `redactSecrets({ path, content })` (`index/secret-scanner.ts`) keeps the number of lines.
- `Project.rootPath` is the `realpath` the indexer stored, except in the seed, whose samples carry a
  relative `fixtures/<name>`. `Project.indexedCommit` may be unset.
- `packages/core/src/index.ts` re-exports `llm/` and `context/` with `export *`; `llm/budget.ts`
  already exports `withDailyBudget`, `startOfUtcDay`, `startOfNextUtcDay`, `DailyBudgetOptions`.
- Analyzer-fingerprint inputs touched here: `packages/core/src/knowledge`,
  `packages/adapters/store-postgres/src`, `packages/adapters/git/src`
  (`packages/cli/src/seed/fingerprint.ts`, `ANALYZER_DIRECTORIES`). `packages/core/src/context` is
  not one.

## Goals / Non-Goals

**Goals:**

- Four pure functions in `packages/core/src/context/` (`estimateTokens`, `rankCandidates`,
  `fitToTokenBudget`, and the orchestrating `buildContextPack`), with no infrastructure import.
- The cost of one question bounded by construction: ≤ 16 searches, one traversal whose rows are
  linear in the nodes, one `getProject`, at most one git read per distinct file.
- Doubles faithful enough that every unit scenario runs without Postgres or git.

**Non-Goals:**

- Tuning the caps (16 terms, 32 anchors) beyond the acme-shop questions; see Risks.
- Batching git reads across files (see D5, Risks).

## Decisions

### D1 — Span text is read from git at `indexedCommit` (author decision 1; ADR)

`SourceTreePort.readFileAt(root, commit, path)` reads the file as the indexed commit stores it, so
`startLine`/`endLine` of the stored symbols match the text.

**Why** (author, Linear DIS-28, decision 1, verbatim): «La base de datos no guarda contenido, y sin
texto no hay ni tokens, ni `baselineTokens`, ni nada que pasar a DIS-39. Se añade
`SourceTreePort.readFileAt(root, commit, path)`. Al leer en el commit indexado, `startLine`/`endLine`
casan con el contenido. Descartado: guardar el contenido en la base de datos (migración y semilla más
grande) y leer el árbol de trabajo (puede no coincidir con lo indexado).»

Alternatives (rejected by the author, above): content in the database; reading the working tree. It
is the only cross-module, hard-to-revert decision of the change (port + adapter + every consumer of
span text, DIS-39 and DIS-68), so it gets an ADR through `/adr-new` with that why transcribed.

### D2 — Core redacts before counting (author decision 2)

`buildContextPack` passes each read file through `redactSecrets({ path, content })` once, then cuts
spans from the redacted content and counts tokens on it. The same redacted content gives
`baselineTokens`. Redaction keeps line count (`secret-scanner.ts`), so stored line numbers stay valid.

### D3 — Estimator `ceil(code points / 4)` (author decision 3)

`estimateTokens(text) = Math.ceil([...text].length / 4)`; `TOKEN_ESTIMATOR = 'chars-div-4'` is a
literal type carried by every `ContextPack.estimator`. Why: the model is configurable (`LLM_MODEL`,
Ollama or any OpenAI-compatible), so there is no single tokenizer family to embed, and PH-16 accepts
a character approximation; measuring the deviation is CM-HU-22.2. No dependency.

### D4 — `resolution` per node and `fileKind` per symbol; the CTE walks nodes (author decisions 4, 5)

Port: `Neighbor = GraphNode & { distance: number; resolution: EdgeResolution }`;
`StoredSymbol.fileKind: FileKind` (required, as `fileId`: every symbol has a file).

`NEIGHBORS`: `walk (node_type, node_id, depth, all_exact)` with `UNION` (not `UNION ALL`) and no
`visited`; the seed row has `all_exact = true`, each step `w.all_exact AND e.resolution = 'exact'`.
The four `LATERAL` branches add `e.resolution` to what they emit. `depth < $4` still stops it.
Because `UNION` deduplicates `(node_type, node_id, depth, all_exact)`, `walk` holds at most
2·(hops+1)·N rows, cycles included (a revisited node only re-enters at a new depth, bounded by
`hops`), so no `statement_timeout` is needed. `reached` takes `min(depth)` and
`bool_or(all_exact)` over the rows at that minimum depth, seeds excluded. The final select adds
`sf.kind` (symbol's file kind); `FIND_SYMBOLS` adds `f.kind AS file_kind`. Still one statement,
`$6` direction, project filter and order unchanged. `postgres-store.ts` maps both.

The work-bound scenario reads `EXPLAIN (ANALYZE, FORMAT JSON)` of the same statement and takes the
`Actual Rows` of the `Recursive Union` node (the rows `walk` produced). It must fail with the current
path-enumerating CTE (39·38·37 paths from one node of a 40-clique at 3 hops); task 1 sees it fail
before changing the SQL.

In-memory double: BFS over states `(node, allExact)` per depth level with the same semantics
(`resolution = exact` iff some state at the minimum depth has `allExact`), and `fileKind` from the
stored file.

Trigram index on `symbol.name`: **not added**. With the caps (D6) a question sends at most 16
`ILIKE` scans; on the samples (hundreds of symbols) each is sub-millisecond. Revisit when a project
passes ~50 000 symbols or a search exceeds 50 ms in `query_log` latency: then add `pg_trgm` and a
GIN index in a migration.

### D5 — `readFileAt` in the git adapter

`readFileAt(root, commit, path)`:

1. Validates `commit` against `OBJECT_ID` and `path` (non-empty, no leading `/`, no empty/`.`/`..`
   segment, no NUL or `\n`) → `RangeError` naming the argument, before spawning anything.
2. Applies the same root checks as `readFiles` (top-level directory of a repository); a failure is
   `SourceUnavailable('not-a-repository', path)` instead of `NotAGitRepository`.
3. One `rev-parse --verify --quiet <commit>^{commit}` checks the commit exists: exit 1 with no
   output → `missing`; any other failure propagates as git's error (verify-against-spec, below).
   Then one `git --literal-pathspecs ls-tree -z -l --full-tree <commit> -- <path>` gives mode, oid and
   size. `--literal-pathspecs` is git's top-level flag (same effect as `GIT_LITERAL_PATHSPECS=1`,
   no pathspec magic), passed in `args`: `GitSpawner` is `(root, args)` and `GIT_ENV` is shared by
   every process, so no per-call environment is needed and neither changes. `spawnReaderGit`'s
   JSDoc rule "`args` are constants of the adapter, never built from repository data" is widened to
   "constants, plus an object id validated against `OBJECT_ID` and a path validated by step 1,
   always after `--`" (still no shell, `shell: false`). No entry → `missing`; mode other than
   `100644`/`100755` (tree, `120000`, `160000`) → `missing`; an entry git cannot size (`BAD`, a
   damaged repository or partial clone) propagates git's own error, as `readFiles` does; size >
   `MAX_BLOB_BYTES` → `too-large`, content never read.
4. One `cat-file blob <oid>` (oid validated against `OBJECT_ID`) reads the bytes; strict UTF-8
   decode (the existing `decodeUtf8`) or `binary-content`; leading BOM dropped.

Every spawn goes through the existing `spawnGit` (C locale, isolated configuration and environment,
no filters, no fsmonitor, no hooks, no fetch), so the readFiles hygiene scenarios hold. Process
count is constant per call (root checks + 3), independent of file size. `SourceUnavailable` is a
`DomainError` in `knowledge/errors.ts`: `code = 'SOURCE_UNAVAILABLE'`, `reason:
'not-indexed' | 'not-a-repository' | 'missing' | 'too-large' | 'binary-content'`, `path?: string`;
its message names reason and path, never content.

`tests/support/in-memory-source-tree.ts` (new): `createInMemorySourceTree({ [root]: { [commit]: {
[path]: content } } })`, rejecting with `SourceUnavailable('missing', path)` for absent entries,
plus `failures` to inject other rejections, and call counters / recorded arguments
(`calls.readFileAt`, `reads: { root, commit, path }[]`).

### D6 — Anchoring caps (author decision 5)

`MAX_QUESTION_TERMS = 16`, `MAX_ANCHORS = 32`, exported from `anchor.ts`. `anchor` searches only
`questionTerms(question).slice(0, MAX_QUESTION_TERMS)`. While merging it counts, per symbol id, how
many terms found it; if more than `MAX_ANCHORS` were found it keeps the top 32 by count (ties:
first-found), then returns them in first-found order, so the existing anchoring scenarios and the
order `expand` and `rank` see are unchanged. Values are an assumption of this design (the ticket
names the constants, not the numbers): Q1 has 7 terms; 16 leaves room for two long questions.
Task 4.1 checks that Q1's real anchor on the seed is under 32, so the cap does not change it.

### D7 — Ranking: lexicographic key, no weights (author decision 6)

`rankCandidates(anchors, neighbors, terms): Candidate[]`, a stable sort over the concatenation
anchors-then-neighbours (input order is the last key for free) with key: `distance` ↑ (anchors 0) →
origin rank (`anchor` 0, `exact` 1, `heuristic` 2) → file kind rank (`test` 0, `source` 1, `doc`
2, `config` 3) → lexical match (0 when the normalised name, or the normalised path, contains a
term). Normalisation reuses `questionTerms`' rule (lower case, NFD, marks dropped), extracted to a
small shared helper in `anchor.ts`. `Candidate` = `{ node, distance, origin, fileKind, fileId,
path }`. Why no weighted sum (author): it would add magic weights with no data to calibrate them; the
key is deterministic and explainable. Every `explain` question counts as a behaviour question
(readme §3.2), so `test` precedes `source`.

### D8 — Budget: atomic spans, greedy with skip, containment (author decision 7)

`fitToTokenBudget(spans: CutSpan[], tokenBudget): { included, omitted }` is pure over already-cut
spans (`{ fileId, startLine, endLine, tokens, … }`). Walking in order:

- contained in an included span of the same file, or partially overlapping any included span of
  that file (even if it also contains others) → dropped (not in `omitted`). Partial overlap is an
  assumption: the analyzer's symbol spans nest, so it does not arise from real graphs; dropping
  keeps the "no overlap" invariant simple (spec-auditor, compound case);
- containing every included span of the same file it overlaps (at least one) → total' = total −
  Σ replaced + tokens; included iff total' ≤ budget, placed at the first replaced span's index,
  replaced spans removed;
- otherwise included iff total + tokens ≤ budget; else `omitted++`.

The invariant `total ≤ budget` holds after every step, so it holds at the end. `estimateTokens` of a
container may be less than the sum of its parts' estimates (ceil per part), so the check uses the
recomputed total, never a "difference" alone.

Property test (`fast-check`, author decision 9): ≥ 200 runs, `seed` fixed via
`process.env.CI ? 20261011 : undefined` in `fc.assert` options, so CI is reproducible and local runs
explore. Generators: 1–40 spans over 1–5 files, line ranges 1..200 (nested and overlapping),
tokens 0..2000, budgets 1000..32000. Properties: total ≤ budget; no two included spans of a file
overlap; `included + omitted + dropped = input`.

### D9 — `buildContextPack` flow and inputs (author decision 8)

```ts
buildContextPack(
  deps: { store: StorePort; source: SourceTreePort; workspaceRoot: string },
  input: { projectId: string; question: string; tokenBudget?: number; hops?: number },
): Promise<ContextPack>
```

1. Validate, before any store call: `isAbsolute(workspaceRoot)` (`node:path`, already used by
   `core/src/index/path-policy.ts`) → else `RangeError` naming `workspaceRoot`; `tokenBudget`
   integer in `TOKEN_BUDGET_MIN..TOKEN_BUDGET_MAX` (1000..32000, default `TOKEN_BUDGET_DEFAULT`
   8000) → else `RangeError` naming `tokenBudget`; `assertValidTraversal(hops)` (default
   `DEFAULT_CONTEXT_HOPS = 2`). The code checks them in that order; the spec does not fix it.
2. `anchor(...)`; empty → `empty` / `no-anchor` (no `neighbors`, no `getProject`, no `readFileAt`).
3. `expand(...)`, then `getProject(projectId)` (`ProjectNotFound` if it vanished);
   `indexedCommit` unset → `SourceUnavailable('not-indexed')`, no read.
4. Repository root: `isAbsolute(rootPath) ? rootPath : join(workspaceRoot, rootPath)`. Never
   `process.cwd()` (with npm workspaces the API runs with cwd `packages/api`, where
   `fixtures/acme-shop` would resolve wrongly). `confinePath`/`ALLOWED_REPOS_DIR` is a different
   mechanism and is not used here.
5. `rankCandidates`, then for each candidate in order read its file once (a `Map<path, redacted
   content>` memo), redact, cut the span (file candidate: line 1 to last line, no symbol) and
   estimate; then `fitToTokenBudget`.
6. `included` empty → `empty` / `over-budget`; else `ok` with `tokens = Σ`, `baselineTokens = Σ
   estimateTokens(redacted file)` over distinct files of included spans.

Lines: `content.split('\n')`, a final empty element (trailing line feed) dropped, at least one line;
span text = `lines.slice(start − 1, end).join('\n')`, carriage returns kept as stored. Every file of
every candidate is read (the greedy walk visits all candidates to fill the budget); the bound is one
read per distinct file. The anchor symbols' own files are expansion seeds, so they never reappear as
file candidates.

Names avoid `llm/budget.ts`: `fitToTokenBudget`, `TOKEN_BUDGET_*`, `DEFAULT_CONTEXT_HOPS`,
`ContextPack`, `ContextSpan`, `ContextOrigin`, `TOKEN_ESTIMATOR`, `estimateTokens`, `rankCandidates`.

### D10 — Tests and their mapping

| Spec | Test file | Runs against |
|---|---|---|
| `context-engine` → Lexical anchoring (two new scenarios) | `tests/unit/context/anchor.spec.ts` | double |
| `context-engine` → Candidate ranking | `tests/unit/context/rank.spec.ts` | double + acme-shop subset |
| `context-engine` → Token estimate | `tests/unit/context/tokenizer.spec.ts` | pure |
| `context-engine` → Token budget (budget scenarios) | `tests/unit/context/budget.spec.ts`; "A file node gives a whole-file span" and "A whole file replaces…" in `tests/unit/context/context-pack.spec.ts` | pure; doubles |
| `context-engine` → Context pack, except the two Q1 integration scenarios | `tests/unit/context/context-pack.spec.ts` | store + source doubles |
| "The pack of the price question…", "Every anchor symbol…" | `tests/integration/context/context-pack.spec.ts` | Postgres with acme-shop indexed + real git (`buildOne`), `workspaceRoot` from `import.meta.url` |
| `graph-store` new and changed scenarios | `tests/integration/store/graph-read.spec.ts` | Postgres |
| same, `(in-memory double)` | `tests/unit/store/in-memory-store.spec.ts` | double |
| `repository-indexing` → Reading one file at a commit | `tests/integration/git/git-source-tree.spec.ts` | throwaway repos |

One test per scenario, named exactly as its title; double copies end in `(in-memory double)` (as in
DIS-27). The acme-shop subset (`tests/support/acme-shop-graph.ts`) gains what ranking needs (the
1-hop neighbourhood is already there) with its coherence test extended; file kinds must match the
seed. If the ranking scenario's expected order disagrees with the subset, stop and ask the author:
the order is the author's oracle.

Layer order (`LAYER_ORDER`): test → port (`graph-read.ts`, `StorePort.ts`, `SourceTreePort.ts`,
`errors.ts`) → domain (`context/`) → adapter (`queries.ts`, `postgres-store.ts`,
`git-source-tree.ts`). No Zod schema, no route.

### D11 — `fast-check` devDependency (author decision 9)

Root `devDependencies`, exact version pinned by the lockfile; test-only, never in a package's
runtime dependencies nor in `dist`. Passes `/privacy-ethics-check` (new AI-suggested dependency):
MIT, no install scripts, no network at runtime.

### D12 — Seed regeneration closes the series

As DIS-27 D9: the last commit runs `npm run seed:build`; the diff MUST change only the
`analyzer-fingerprint` header of `seeds/graph-dump.sql` (no migration, so `contract-fingerprint` and
every row identical; `packages/web/src/data/sample-projects.ts` unchanged). Anything else is a
stop-and-ask. `AUTHOR_HASH_SALT` is given by the author in the session at that step only.

## Risks / Trade-offs

- [One-to-three git processes per distinct candidate file; a 2-hop neighbourhood of a hub may touch
  dozens of files] → bounded by the caps and `hops ≤ 3`; measured in the manual step. Batching
  (`readFilesAt` over one `cat-file --batch`) is a later optimisation behind the same port.
- [The caps (16/32) cut recall on a large project] → exported constants; the anchor keeps the
  symbols that match most terms; tuning needs CM-HU-22 data.
- [The estimator deviates from the provider's tokenizer, more for code than prose] → declared on
  every pack (`estimator`), measured in CM-HU-22.2; the budget is a ceiling, not an exact quota.
- [A file changed since indexing makes `readFileAt` disagree with the graph] → impossible by
  construction: it reads `indexedCommit`. A rewritten history removing that commit gives `missing`.
- [A hosted demo without the samples' `.git` cannot build packs] → `SourceUnavailable`; a declared
  non-goal (deployment).
- [The node-wise CTE changes the plan of every existing traversal] → all existing `graph-read`
  scenarios stay unchanged and must stay green; "The traversal is one statement" still holds.
- [Symbol line ranges outside the file (corrupt index)] → `slice` yields the lines that exist;
  cannot happen when reading at the indexed commit.

## Migration Plan

No database migration. Deploy = code + regenerated seed header. Rollback = revert the PR: the new
port method and fields are additive; the only behavioural change to existing callers is the bounded
traversal, which returns the same nodes and distances.

## Follow-ups

Destinations per `docs/project-context.md` → Tracking deferred findings (A fixed in this change,
B successor ticket, C debt, D accepted with reason).

### verify-against-spec (2026-10-11, `reports/2026-10-11-verify-against-spec.md`)

| Finding | Destination | Resolution |
|---|---|---|
| 2.1 / 3.1 `readFileAt` reports some git failures as `missing` (`BAD` entry; failed `cat-file -e` probe) | A | `rev-parse --verify --quiet` decides "unknown commit" (exit 1, no output); any other failure and a `BAD` entry propagate git's error. Two tests seen failing first (D5) |
| 2.2 Placement of a replacing span untested | A | «A whole file replaces the symbol spans it contains» gains a candidate ranked after the method; appending now fails it (mutation checked) |
| 2.3 No test for "no log" | D | `context/` has no logger nor `console` (grep guard in the step-14 report); logging belongs to DIS-39's entry points, as in DIS-27 |
| 2.3 64-character ids, `.` and NUL in paths, process count by file size untested | A | Extra cases in `git-source-tree.spec.ts` |
| 2.3 Caller's git environment variables untested for `readFileAt` | D | Same launcher and fixed `GIT_ENV` as `readFiles`, whose hygiene scenario covers it |
| 2.3 `hops` default, non-UUID project at pack level, CRLF kept untested | A | Extra cases in `context-pack.spec.ts` |
| 3.2 An annotated tag id is accepted as a commit (peeled) | D | `indexedCommit` is always a commit id written by the indexer; peeling a tag cannot read anything the tag's commit does not hold |
| 3.3 Empty file = one line not in the spec | A | Spec bullet added (Context pack) |
| 3.4 Symbol lines past the end of the file are cut short | D | Cannot happen when reading the indexed commit (Risks); `slice` never invents lines |
| 3.5 Validation order fixed in code, open in the spec | D | Each invalid argument fails before any store call, which is what the spec guarantees; D9 now states the code's order |
| 3.6 `no-anchor` → `omitted: 0` not in the spec | A | Spec bullet updated |
| 3.7 Public API beyond the spec | D | Constants and helpers named in D6–D9; DIS-39 needs the budget bounds and defaults for its Zod schema |
| Weak: «An anchor that does not fit…» never checks the pack `status` | A | Extra pack-level case: `ok`, the neighbour, `omitted` 1 |
| Weak: «A long question…» only asserts `≤ 16` | A | The test now records the searched terms: exactly the first 16, in order |
| Weak: «Unreadable source…» checks one substring | A | Exact message asserted; the real adapter's messages are checked in `git-source-tree.spec.ts` |
| Weak: «A method inside an included class…» on made-up spans | D | The `PriceCalculator.php` part is the integration scenario «The pack of the price question holds the calculator class once» |
