## Context

See proposal.md → Why. State this design starts from:

- `StorePort` (DIS-24) offers `findSymbols(projectId, name, { kinds? })` (case-insensitive literal
  substring on `symbol.name`, byte-order sort) and `neighbors(projectId, seeds, hops, kinds?)`,
  which only walks source → target. Both validate with `assertValidSymbolSearch` /
  `assertValidTraversal` (`packages/core/src/knowledge/read-arguments.ts`, `MAX_HOPS = 3`).
- `NEIGHBORS` (`packages/adapters/store-postgres/src/queries.ts`) is one `WITH RECURSIVE` statement:
  `seed` → `walk` (two `CROSS JOIN LATERAL` branches over the edge's source endpoint, `visited`
  array against cycles, `depth < $4`) → `reached` (`min(depth)`, seeds excluded) → project-filtered
  `LEFT JOIN` so an empty result still proves the project exists.
- The four partial endpoint indexes already exist (`edge_{source,target}_{symbol,file}_kind_idx`,
  migration `0003`), so walking edges backwards needs no migration.
- `StoredSymbol` carries `file` (path) but not the file id; the port has no "file id by path" read.
- Symbol names in the seed are qualified (`PriceCalculator::compute`), so a substring search on a
  class name also finds its methods.
- No `StorePort` double exists; unit tests cast partial objects with `as unknown as StorePort`.
- `packages/core/src/knowledge` and `packages/adapters/store-postgres/src` are inputs of the seed's
  analyzer fingerprint (`packages/cli/src/seed/fingerprint.ts`, `ANALYZER_DIRECTORIES`).

## Goals / Non-Goals

**Goals:**

- `anchor` and `expand` as pure functions over `StorePort` in `packages/core/src/context/`, with no
  infrastructure import (`GUARD_HTTP_IN_BUSINESS`).
- Two-way traversal in the same single statement, backwards compatible for every existing caller.
- An in-memory double faithful enough to run the read scenarios of `graph-store` in unit tests.

**Non-Goals:**

- Ranking, budget, tokenizer and `no-anchor` (DIS-28); see proposal.md → Non-goals.
- Tuning the stopword list beyond what the scenarios and the two planning questions need.
- Making the double a general-purpose store: writes stay unimplemented.

## Decisions

### D1 — Anchoring: literal term plus 5-letter prefix, by name only (author decision 1)

`questionTerms` lower-cases, applies `normalize('NFD')` and drops `\p{M}`, splits on
`/[^\p{L}\p{N}]+/u`, drops tokens with fewer than `MIN_TOKEN_LENGTH = 3` letters and the tokens in
`ANCHOR_STOPWORDS` (a frozen `ReadonlySet<string>` of Spanish and English function words, stored
already normalised: `como`, `que`, `donde`, `the`, `how`, …), deduplicates, and after each token of
at least `PREFIX_MIN_LENGTH = 6` letters inserts `token.slice(0, PREFIX_LENGTH)` with
`PREFIX_LENGTH = 5` (deduplicated too). `anchor` runs `findSymbols` for each term, in term order, and
merges by symbol id keeping first-seen order.

**Why** (author, Linear DIS-27): questions are in Spanish and identifiers in English. Simulated on
the seed, the literal substring anchors Q1 only by chance (`calcula` ⊂ `PriceCalculator`) and leaves
«¿Cómo se validan los cupones?» without an anchor; the prefix `valid` recovers `CouponValidator`. A
Spanish→English glossary was discarded because it is specific to acme-shop's domain.

Alternatives: a glossary (rejected above); stemming libraries (a dependency, and still Spanish
stems against English names); searching `signature` (the port does not, and widening
`findSymbols` is out of scope).

`anchor` does not validate `projectId` itself: an empty term list returns `[]` before any store
call (scenario "A question without terms anchors nothing and does not search"), and otherwise the
first `findSymbols` raises `ProjectNotFound`. Calls run **sequentially** (`for … of` + `await`): a
`ProjectNotFound` stops at the first term, and the scenario count of store calls stays
deterministic. At most 2 calls per distinct token (non-functional limit of the ticket).

### D2 — Expansion: one `neighbors` call, `direction: 'both'`, symbol and file seeds

`expand(store, projectId, anchors, hops)` first calls `assertValidTraversal(hops)` (so `hops` 0 and
4 fail even with an empty anchor), then returns `[]` for an empty anchor without calling the store,
otherwise calls `neighbors` once with seeds = one `{ type: 'symbol', id }` per anchor plus one
`{ type: 'file', id: fileId }` per distinct `fileId`, `EXPANSION_EDGE_KINDS = ['calls', 'tested_by',
'describes', 'co_changed']` and `'both'`. The result is returned as the port gives it (symbols and
files, port order).

Why file seeds: `co_changed` joins files; from a symbol, no edge kind in the list leads to its own
file, so without file seeds `co_changed` is unreachable. The scenario "An anchor reaches the files
co-changed with its own file" is the proof: the anchor `DiscountService` reaches
`app/Services/ShippingService.php` at distance 1 only through the seed of its own file (the seed's
single `co_changed` edge, `seeds/graph-dump.sql:248`). Why `both`: `describes` goes doc → symbol
and callers point at the anchor; with `out` only, neither docs nor callers nor reverse `co_changed`
are reached (author decision 2). Why not filter to symbols (as the DIS-24 hand-off comment
suggested): the doc reached by `describes` is a file node, and it is exactly what DIS-28 must be
able to rank; filtering belongs to the ranking.

Seeding the anchor's files has a known side effect: their outgoing/incoming edges of the four kinds
are followed too (for example `describes` from `README.md` to other symbols). The scenario asserts
"contains, at least" for that reason.

### D3 — `direction` in the port: optional fifth argument, default `'out'` (author decision 2)

```ts
export type TraversalDirection = 'out' | 'in' | 'both';           // graph-read.ts
export const TRAVERSAL_DIRECTIONS: readonly TraversalDirection[];  // for validation
neighbors(projectId, seeds, hops, kinds?, direction?: TraversalDirection): Promise<Neighbor[]>;
```

`assertValidTraversal(hops, kinds?, direction?)` throws `InvalidStoreQuery('direction', …)` when
`direction !== undefined` and it is not one of the three; `StoreQueryArgument` gains `'direction'`.
Positional rather than an options object: it keeps every existing call site
(`neighbors(p, seeds, hops, kinds)`) unchanged and matches the signature the ticket fixes. DIS-89
will call `neighbors(…, 'in')`.

### D4 — The CTE: four lateral branches gated by `$6`

`EDGE_SOURCE` mirrors `EDGE_TARGET`. Inside `walk`'s `CROSS JOIN LATERAL`, the two existing
branches gain `AND $6 IN ('out', 'both')`; two new branches match `e.target_symbol_id = w.node_id`
/ `e.target_file_id = w.node_id`, emit `EDGE_SOURCE` and carry `AND $6 IN ('in', 'both')`. The
direction is a bound parameter (`$6::text`), never interpolated. `seed`, `visited`, `depth < $4`,
`reached` and the final project-filtered `LEFT JOIN` do not change, so cycles, minimum distance,
seed exclusion, the cross-project guard (edges filtered by `e.project_id = $1` on all four
branches) and the single statement hold for every direction. Each new branch uses one of the
existing `edge_target_*_kind_idx` partial indexes. `postgres-store.ts` passes `direction ?? 'out'`.

Alternative: a separate statement per direction chosen in TypeScript — rejected: it triples the
SQL to maintain and the shared tail would drift.

### D5 — `fileId` on `StoredSymbol` (author decision 4)

`StoredSymbol` gains `fileId: string` (JSDoc: same validity as `StoredFile.id`, valid while a
snapshot keeps the path). `FIND_SYMBOLS` selects `f.id AS file_id`, `NEIGHBORS` selects
`s.file_id`, and the row mappers (`toStoredSymbol`, `toNeighbor`) map it. It is a required field:
every symbol has a file, so optional would only push `undefined` checks onto callers. Adding a
required field to a read model is source-compatible for readers; the only writers of
`StoredSymbol` literals are tests, which the typecheck will list.

### D6 — The double: `tests/support/in-memory-store.ts` (author decision 3)

`createInMemoryStore({ projects: [{ project, graph }] })` returns a `StorePort` plus the assigned
ids (`projectId` per entry). It assigns hyphenated UUIDs (`randomUUID()`), resolves the
`KnowledgeGraph`'s `SymbolRef`/path endpoints to ids, and implements `getProject`, `listProjects`,
`findSymbols` and `neighbors` (`createProject`, `saveGraph`, `sumCostSince` throw
`Error('not implemented')`). It reuses `assertValidSymbolSearch` and `assertValidTraversal`, the
same well-formed-UUID rule for `ProjectNotFound`, case-insensitive literal `includes` on
`name.toLowerCase()`, a BFS with minimum distance honouring `direction`, and byte-order sorting
with `Buffer.compare` (equivalent to `COLLATE "C"`; `localeCompare` is not). It counts calls per
method (`calls.findSymbols`, `calls.neighbors`) so the context scenarios can assert "no search /
no traversal was sent".

Why `tests/support/` and not `packages/core/src/testing/` as planned: it stays outside Stryker's
`mutate` (`packages/core/src/**`) and out of core's `dist`.

Known limit: `toLowerCase` and `ILIKE` can disagree on non-ASCII names; the acme-shop PHP names are
ASCII. Documented in the double's header comment.

### D7 — Test graph: a real acme-shop subset with a coherence test

`tests/support/acme-shop-graph.ts` builds a `KnowledgeGraph` with the `sample-graph.ts` helpers:
the files, symbols and edges of the expansion scenario (the anchor's neighbourhood at 2 hops for the
four kinds, including `README.md`, `docs/pricing.md`, `PriceCalculatorTest`, `OrderPricingTest`,
the three services, the four heuristic callers), `CouponValidator` for the prefix scenario, and, for the co-change scenario, the class
`DiscountService` with its file `app/Services/DiscountService.php`, file
`app/Services/ShippingService.php` and the seed's one `co_changed` edge between them
(`seeds/graph-dump.sql:248`). `tests/unit/context/acme-shop-graph-coherence.spec.ts` (pattern of
`sample-projects-coherence.spec.ts`) parses `seeds/graph-dump.sql` and checks every file path,
symbol (path, name, start line, kind) and edge (endpoints, kind, resolution) of the subset exists
in the seed, so the subset cannot drift from the real index. It is an extra test, not a scenario.

### D8 — Tests and their mapping

| Spec | Test file | Runs against |
|---|---|---|
| `context-engine` → Question terms, Lexical anchoring | `tests/unit/context/anchor.spec.ts` | double + acme-shop subset |
| `context-engine` → Graph expansion of the anchor | `tests/unit/context/expand.spec.ts` | double + acme-shop subset |
| `graph-store` (MODIFIED and new scenarios) | `tests/integration/store/graph-read.spec.ts` | Postgres |
| read scenarios of `graph-store` + the three `direction` scenarios | `tests/unit/store/in-memory-store.spec.ts` | double |

Each `#### Scenario:` maps to exactly one test whose name is exactly the scenario title
(`it('<title>', …)`). The double's suite covers the same behaviours (the ticket asks the double to
pass them) but names each test `<title> (in-memory double)`, so the exact-title check still finds
one test per scenario — the Postgres one for `graph-store`, the unit one for `context-engine` — and
the double's coverage is listed separately in the verification report.

Layer order (`.claude/sdd-harness.env` `LAYER_ORDER`): test → port (`StorePort.ts`,
`graph-read.ts`, `read-arguments.ts`, `errors.ts`) → domain (`core/src/context/`) → adapter
(`queries.ts`, `postgres-store.ts`). No Zod schema and no route.

### D9 — Seed regeneration closes the series

`graph-read.ts`, `read-arguments.ts`, `errors.ts`, `queries.ts` and `postgres-store.ts` are
analyzer fingerprint inputs; `packages/core/src/context` and `tests/` are not, and no migration is
added (contract fingerprint unchanged). The last commit runs `npm run seed:build`; its diff MUST
change only the `analyzer-fingerprint` header of `seeds/graph-dump.sql`, with every row and
`packages/web/src/data/sample-projects.ts` identical. Anything else is a stop-and-ask.
`AUTHOR_HASH_SALT` is given by the author in the session at that step only.

### D10 — No ADR

The direction parameter extends an existing port without changing its default, and the double is
test code; both are cheap to revert and confined to one module each.

## Risks / Trade-offs

- [The 4-branch CTE changes the plan of the existing `out` traversal] → the `$6` guards are
  constant per statement; the existing integration scenarios (all `out`) stay unchanged and must
  stay green, and "The traversal is one statement" runs for the three directions.
- [`both` at 3 hops from hub nodes (`README.md` describes 15 symbols) can return most of a small
  project] → expected for the candidate set; DIS-28 ranks and cuts it by budget. `hops` stays
  capped at 3.
- [The double diverges from Postgres] → the double runs the same scenario names as the
  integration suite; the non-ASCII case-folding gap is documented (D6). A shared contract suite is a
  declared non-goal.
- [Prefixes add noise (`final` and `preci` hit more symbols)] → accepted: anchoring favours recall,
  DIS-28 ranks; scenarios assert "includes".
- [Stopword list is small and hand-made] → it is an exported constant, unit-tested through the
  scenarios; extending it is a one-line change.
- [The test subset drifts from the seed after a reindex] → the coherence test (D7) fails.

## Migration Plan

No database migration. Deploy is the code change plus the regenerated seed header. Rollback is a
revert of the PR; `direction` defaults to `'out'`, so callers written before the change are
unaffected either way.

## Follow-ups

(Filled during Pre-merge Review: one A/B/C/D destination per finding.)
