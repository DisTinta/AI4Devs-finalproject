## Why

`GitPort.readHistory` (DIS-35) already delivers every commit and the files it touched, but nothing
turns that history into the `co_changed` edges the graph schema has had since DIS-21. Without them
the impact report (DIS-94) cannot show the historical coupling `[git]` that static analysis misses —
above all in PHP/Laravel, where `DiscountService.php` and `ShippingService.php` change together with
no static edge between them. This is DIS-36 (CM-HU-03.2), a slice of CM-HU-03 (DIS-25).

## What Changes

- **Pure co-change rule in core** (`packages/core/src/knowledge/co-change.ts`, new): from a list of
  file–commit links and the set of paths in the snapshot, produce one `co_changed` edge per unordered
  pair of files that change together in at least 2 commits, with
  `weight = |commits(A) ∩ commits(B)| / |commits(A) ∪ commits(B)|` (Jaccard),
  `resolution = 'heuristic'`, `extractor = 'git'`, file endpoints, `source` = the smaller path in
  byte order. Commits touching more than 100 files contribute nothing (bulk imports). Exported
  constants for the extractor name and both thresholds. Unit-tested and under Stryker.
- **Persistence through the existing `StorePort.saveGraph`**: no new port method, no migration —
  the `edge` table already holds `weight` in [0, 1] and the per-file/kind indexes.
- Tests: unit tests for the rule; one new integration block that reads `fixtures/acme-shop` and
  `fixtures/task-api`, computes the edges and saves them (DoD: exactly the two documented pairs of
  `fixtures/README.md`, with weights 1 and 0.75). The git integration spec's `beforeAll` rebuilds
  both fixtures instead of acme-shop only, so it stays the single spec that rebuilds fixtures.

Decisions validated by the author (DIS-36 «Decisiones a validar», 2026-10-01): minimum support 2
co-changes; `resolution = 'heuristic'`; one canonical edge per pair (not two directed ones);
commit-size cap 100 files.

## Non-goals

- No use of co-change in the impact report and no display threshold for `weight` (DIS-94 /
  CM-HU-16b).
- No weighting by lines added/removed: `linesAdded`/`linesRemoved` are ignored in this version.
- No rename tracking: a renamed file's history stays split between its old and new path.
- No indexing use case composing analyzer + git edges in one snapshot (DIS-85). Because `saveGraph`
  replaces all of a project's edges, that caller must put `co_changed` edges in the same snapshot as
  the analyzers' edges.
- No direction or symmetry in `neighbors` (DIS-89); consumers needing symmetry query both endpoints.
- No new port, no migration, no change to `store-postgres`, no CLI or HTTP surface.

## Privacy and logging impact

None new. The rule reads only paths and shas; it never uses `authorHash` or any author data and
introduces no per-person analysis (non-goal of DIS-25). No logging.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `git-history`: adds the requirement that the domain derives weighted `co_changed` edges from a
  read history, and that they persist through `saveGraph`. Post-review: adds the fixture builder
  guarantee that every file a manifest entry lists really changes in its commit (design D9).

## Impact

- Code: `packages/core/src/knowledge/co-change.ts` (new), `packages/core/src/knowledge/index.ts`
  (export).
- Tests: `tests/unit/knowledge/co-change.spec.ts` (new); `tests/integration/git/simple-git-history.spec.ts`
  (rebuild both fixtures; new `co-change persistence` block).
- Docs: `docs/project-context.md` (Testing: the spec rebuilds both fixtures; Gotchas: `co_changed`
  semantics — one canonical edge per pair, saved in the same snapshot), `prompts.md` if a decision
  is worth recording. Commands per `docs/project-context.md`.
- Fixtures (apply delta, design D9, approved 2026-10-01): `fixtures/build-history.mjs` makes every
  file a commit lists really change in it, so the built task-api history matches `fixtures/README.md`.
  Post-review: it exports `buildOne` and runs `main()` only as a CLI, tested by
  `tests/integration/git/build-history.spec.ts` (new).
- Dependencies: none.
