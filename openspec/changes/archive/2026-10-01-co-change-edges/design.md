## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `GraphEdge` (`packages/core/src/knowledge/graph-edge.ts`) already has `kind: 'co_changed'`,
  `resolution`, `extractor` and an optional `weight` documented as «[0, 1], for weighted kinds such
  as `co_changed`». `GraphFileCommit { file, sha, linesAdded?, linesRemoved? }` is the input.
- `GitPort.readHistory` (DIS-35) returns `fileCommits` with one link per file of each non-merge
  commit, raw `/`-separated paths, `--no-renames` (a rename is a delete plus an add).
- `StorePort.saveGraph` replaces a project's edges with the snapshot's; `validateGraph` rejects an
  edge whose file is not in `files` (`InvalidGraph`) and leaves the `weight` range to the schema
  (`edge.weight double precision NULL CHECK (weight BETWEEN 0 AND 1)`, migration `0001`; indexes
  `(source_file_id, kind)` / `(target_file_id, kind)`, `0003`). No migration is needed.
- Verified on `fixtures/history/*.commits.mjs` (max 5 files per commit, no renames): with support
  ≥ 2 each fixture has exactly one pair — acme-shop `DiscountService.php`/`ShippingService.php`
  (3 shared of 3 ∪ 3 → weight 1), task-api `task.schema.ts`/`task.service.ts` (3 shared, schema in
  4 commits, service in 3 → weight 0.75).
- Stryker mutates `packages/core/src/**` (threshold `MIN_MUTATION_SCORE=70`); `docs:coverage`
  requires TSDoc on every export.
- `tests/integration/git/simple-git-history.spec.ts` is the only spec that rebuilds a fixture; today
  it rebuilds acme-shop only.

## Goals / Non-Goals

**Goals:**

- A pure, deterministic core function whose output can go straight into `KnowledgeGraph.edges`.
- Exact, mutation-resistant unit tests (threshold, denominator, cap, order).
- DoD proven against the real `git log` of both fixtures, persisted by the real store.

**Non-Goals (design level):**

- No streaming or incremental co-change: one pass over an in-memory history, recomputed per index.
- No configuration of the thresholds from outside (env, CLI): exported constants only.

## Decisions

### D1 — A pure rule in `knowledge/`, not a port or a use case

```ts
export const CO_CHANGE_EXTRACTOR = 'git';
export const MIN_CO_CHANGES = 2;
export const MAX_FILES_PER_COMMIT = 100;
export function coChangeEdges(
  fileCommits: readonly GraphFileCommit[],
  knownPaths: ReadonlySet<string>,
): GraphEdge[];
```

In `packages/core/src/knowledge/co-change.ts`, exported from `knowledge/index.ts`, next to
`author-hash.ts` and `commit-message.ts` (the same kind of pure rule). It reuses `GraphFileCommit`
and `GraphEdge`; no parallel types.

*Alternatives:* a method on `GitPort` (rejected: the formula is business logic and must be
mutation-tested in core, readme §3.2 places it in `co-change.ts`); computing it in SQL from
`file_commit` (rejected: needs a new port method and couples the rule to Postgres).

### D2 — Algorithm: one pass, counts by commit

1. Group links by `sha` into a `Set` of paths (duplicate links count once).
2. Drop every commit whose set has more than `MAX_FILES_PER_COMMIT` paths.
3. For each kept commit: increment `count[path]` for every path (known or not); sort its known
   paths in byte order and increment `pairs[a\0b]` for every `a < b`. NUL is a safe separator:
   Git paths cannot contain it.
4. For each pair with `shared >= MIN_CO_CHANGES`: `weight = shared / (count[a] + count[b] - shared)`.
5. Sort edges by `(source, target)` in byte order.

Cost O(Σ k²) over commits (k ≤ 100 → at most 4 950 pairs per commit), no I/O, no database.

*Alternative:* per-file sets of shas and pairwise intersections (O(F²·C)); rejected, slower on
repositories with many files and no clearer.

### D3 — Byte order means code-point order

Paths are compared by Unicode code point, which equals UTF-8 byte order and matches the store's
`COLLATE "C"` used by reads. A small private `compareByteOrder(a, b)` iterates code points.

*Alternative:* JavaScript `<` / default `sort()` (UTF-16 code units): differs from byte order for
characters above U+FFFF versus U+E000–U+FFFF. Rejected for consistency with the store, at negligible
cost.

### D4 — One canonical edge per pair, `heuristic`, extractor `git` (validated by the author)

Co-change is symmetric; storing it once (`source` = smaller path) halves rows and avoids two edges
that must always agree. `neighbors` follows source → target only, so a consumer that needs the
symmetric relation (DIS-94) queries both endpoints; DIS-89 adds reverse traversal. Documented in the
function's TSDoc and in `docs/project-context.md` → Gotchas. `resolution = 'heuristic'`: the coupling
is statistical, not resolved from code. `MIN_CO_CHANGES = 2`: with 1, every bootstrap commit links
all its files with weight up to 1 (10 spurious pairs from acme-shop's first commit alone).

*Alternative:* two directed edges per pair (rejected by the author, 2026-10-01).

### D5 — Unknown paths count in denominators, never as endpoints

`knownPaths` is the caller's snapshot (the paths it will put in `files`), so every edge passes
`validateGraph`. A path outside it (old side of a rename, deleted file) still counts in
`commits(F)` of the files it changed with: the union reflects every commit that touched the known
file. Mega-commits (> 100 files) are removed before counting, so they affect neither numerator nor
denominator.

### D6 — Integration test in the existing git spec

A new `describeWithDatabase('co-change persistence')` block in
`tests/integration/git/simple-git-history.spec.ts`, following `git history persistence`
(`useTransactionPerTest`, `createPostgresStore({ transaction: db() })`, `file()` from
`tests/support/sample-graph.ts`). Its `beforeAll` runs `node fixtures/build-history.mjs` with no
argument (both fixtures) and a longer timeout, so the spec stays the only one rebuilding fixtures.
`knownPaths` = distinct paths of `fileCommits` = the paths of `files` (both fixtures have no renames
or deletions, verified). The test reads back with `SELECT` on `edge` joined to `file` for paths.

### D7 — Unit tests and mutants

`tests/unit/knowledge/co-change.spec.ts`, one test per scenario of the delta spec, named after it,
with hand-built `fileCommit()` links. The scenarios kill the expected mutants: `>= 2` → `> 2` /
`>= 1` (support scenarios), `+` / `-` in the union (weights 0.75, 2/3, 0.5), `>` → `>=` on the cap
(101 vs 100 files), sort direction and comparator (order scenario with `Z.ts`/`m.ts`/`z.ts`).
Surviving mutants that reflect spec rules get a test; others are recorded in the step 8 report.

### D8 — No ADR

The decision is local to one core module, cheap to revert, and already recorded in the ticket and
this design.

## Risks / Trade-offs

- [DIS-85 saves analyzer edges and `co_changed` edges in separate `saveGraph` calls, and the second
  wipes the first] → Requirement *Co-change edges persist with the snapshot* states it; TSDoc and
  `docs/project-context.md` Gotchas repeat it.
- [The 100-file cap hides real coupling in large refactors] → Exported constant, revisitable; the
  impact report (DIS-94) decides thresholds on top.
- [Renames split a file's history between paths] → Declared non-goal; the old path still counts in
  denominators, so weights are conservative, not inflated.
- [Floating-point weights such as 2/3] → Computed as one division; tests compare with the same
  expression; Postgres `double precision` stores it unchanged.
- [Rebuilding both fixtures lengthens the spec's `beforeAll`] → Timeout raised; the rebuild is
  deterministic and already runs in CI for acme-shop.

## Migration Plan

None: no schema change. Rollback is reverting the commit.

## Apply delta — fixture builder (2026-10-01, approved by the author)

Scope expansion found at task 2.2: the real `git log` of `fixtures/task-api` linked
`task.schema.ts` and `task.service.ts` in one commit (#40), not the three `fixtures/README.md`
documents (#15, #31, #40). Cause: `fixtures/build-history.mjs` wrote a file's content even when it
equalled what the previous commit left, so Git recorded no change and dropped the link — #15
re-wrote the schema with the same `r31` snapshot as #6, and #31's service `before`
(`snapshots/r40/…`) is byte-identical to `snapshots/r31/…`. The context check at propose time read
`commits.mjs`, not the built history, so it missed this.

### D9 — Every listed file really changes in its commit

The builder tracks what each commit left per path. A non-final write that would leave a file
unchanged gets the throwaway `hist:rN` marker; a final touch that changes nothing, or a file whose
marker is empty (`.json`), fails the build with an error naming the fixture, commit and path, instead
of silently dropping the link.

*Alternatives:* edit `task-api.commits.mjs` or the snapshots (rejected: patches the symptom, alters
the documented semantic diffs of #31/#40, and the same gap could reappear); accept the real history
and drop the task-api pair from the DoD (rejected by the author).

Verified: acme-shop rebuilds to the same `HEAD` sha (`4f028db`, byte-identical history); task-api
gains exactly the two missing links (#15 → `task.schema.ts`, #31 → `task.service.ts`) and every file
of every `commits.mjs` entry now appears in its real commit, in both fixtures. No existing git test
changed.

**Testing D9 (post-review, 2026-10-01).** The adversarial review found the guarantee unspecified and
its error paths untested. The builder now exports `buildOne(name, { dir, manifest })`, runs `main()`
only when executed as a CLI, and resolves `manifest` relative to `fixtures/` or as an absolute path
(imported through a file URL). `tests/integration/git/build-history.spec.ts` builds throwaway
fixtures under the OS temp dir (needs `git`, no database) for the three scenarios of *Fixture
histories record every listed file*. The refactor must not change behaviour: both fixtures rebuild
to the same `HEAD`.

## Follow-ups (adversarial-review, 2026-10-01)

Accepted debt, recorded once here and in one Spanish checklist comment on DIS-36; no separate issues.

- [ ] **The `authorHash` half of «Author hash and line counts do not affect co-change» cannot fail.**
  `coChangeEdges` never receives commits, so the guarantee holds by construction; the test only
  catches a future signature change that reads them. Annotation only.
- [ ] **The pair key (`a` + NUL + `b`) is not validated.** A path containing NUL would split into the
  wrong endpoints. Git never emits such a path; a guard or a structured key belongs to a later
  change.
- [ ] **The git spec's `beforeAll` rebuilds both fixtures for all its tests.** A task-api rebuild
  failure also fails the DIS-35 tests that only need acme-shop. Non-blocking; split the rebuild per
  block if it bites.

**Process notes for the archive.** The spec, design, tasks and code landed in one commit (`e8c0405`),
so history cannot show the spec was not edited after the code; the spec edits of this change were
made before apply (two added scenarios) and in this post-review delta, both recorded here. Five
scenarios (tasks 1.3, 1.4) were green on their first run; their ability to fail rests on Stryker and
the forced failures of the step 8 report.
