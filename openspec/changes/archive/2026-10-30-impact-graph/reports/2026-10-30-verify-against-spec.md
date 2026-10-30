# Verify against spec: impact-graph (DIS-89)

- Date: 2026-10-30
- Change: impact-graph, PR #90, against `openspec/changes/impact-graph/specs/impact/spec.md`
- Mode: inline (`ai-specs/skills/verify-against-spec/SKILL.md` → Inline mode), autonomous run
- Code read: `packages/core/src/impact/*.ts`, `packages/core/src/context/lexical-match.ts`,
  `packages/core/src/context/rank.ts`, `packages/core/src/context/index.ts`,
  `packages/core/src/index.ts`; tests `tests/unit/impact/*`, `tests/integration/impact/acme-shop.spec.ts`

## 1. Requirements implemented correctly

| Requirement | Code | Proof |
|---|---|---|
| Impact request validation: strict object, `projectId` string, `change` 5..500 code points, not blank, no U+0000, `maxHops` int 1..3 default 2, `InvalidImpactRequest(field)` without the value, before any read | `packages/core/src/impact/impact-request.ts:42-50` (schema), `:66-71` (field of the first issue, `request` otherwise), `:25-34` (message is only the field); `impact.ts:28` parses before `anchor` | `tests/unit/impact/impact-request.spec.ts:32`, `:45`, `:61`, `:76`, `:90`, `:102`; `tests/unit/impact/impact.spec.ts:81` |
| Anchoring the change: `anchor()` unchanged, `test` symbols dropped, empty → `unknown`/`no-anchor` with no traversal, `ProjectNotFound` when there is a term | `packages/core/src/impact/impact.ts:29-30` | `tests/unit/impact/impact.spec.ts:34`, `:46`, `:61`, `:70` |
| Reverse traversal: kinds `calls`, `imports`, `extends`, `implements`, direction `in`, 1..`maxHops`, seeds the anchor symbols and their files | `packages/core/src/impact/reverse-walk.ts:15`, `:34-43` | `tests/unit/impact/impact.spec.ts:95`, `:107`, `:162`; `tests/unit/impact/components.spec.ts:74` |
| Report by component: component = name up to `::` or the path of a file without symbol components; anchor components at 0 `exact`; nodes of anchor files dropped; minimum distance, `exact` when one node at that distance is; `test` components only in `tests`; `direct` 0..1, `indirect` 2..`maxHops`; entry shapes | `packages/core/src/impact/relevance.ts:11-14`, `:50-101`, `:148-189`; `impact-report.ts:7-39` | `tests/unit/impact/impact.spec.ts:122`; `components.spec.ts:211`, `:239`, `:258`, `:279` |
| Tests covering the change: walk test components plus one `tested_by` step from anchor symbols and files, reached nodes outside test and anchor files, files of direct components, classes of direct method components (same name, same file) | `packages/core/src/impact/reverse-walk.ts:71-124`; `relevance.ts:166-175` | `tests/unit/impact/impact.spec.ts:149`, `:203`; `components.spec.ts:16`, `:49`, `:63`, `:74`, `:96`, `:122`, `:158`, `:188` |
| Relevance order: `hops`, `exact` first, lexical match over all terms, byte order of `symbol` then `file`; tests by test distance (min of walk distance and seed distance + 1) | `packages/core/src/impact/relevance.ts:117-136`, `:176-187`; `reverse-walk.ts:110-122`; `context/lexical-match.ts:12-17`; `impact.ts:36` passes the whole `questionTerms(change)` | `tests/unit/impact/relevance.spec.ts:31`, `:44`, `:58`, `:75`, `:93`, `:117` |
| Impact over the indexed acme-shop seed | the same code over `createPostgresStore` | `tests/integration/impact/acme-shop.spec.ts:34`, `:60`; manual run in `2026-10-30-show-spec-working.md` |
| Limit of the lexical anchor | `impact.ts:29` (no expansion) | `tests/unit/impact/impact.spec.ts:227` |

## 2. Requirements missing or partial

- **Partial, fixed in this step.** "Tests covering the change": "When the project has none, that
  component adds no class to the step." A direct method component whose class part is blank (a symbol
  named `::run`) made `findTests` send `findSymbols(projectId, '')`, which the store rejects with
  `InvalidStoreQuery` (`packages/core/src/knowledge/read-arguments.ts:19`): the call failed instead
  of answering without a class. No symbol can be named blank, so the project "has none". Fixed at
  `packages/core/src/impact/reverse-walk.ts:101`, red first with
  `tests/unit/impact/components.spec.ts:63` (task 12.6.1, design Follow-ups V1). The analyzers never
  write such a name today, so no real graph hit it.

No other requirement is missing.

## 3. Unspecified behaviour

- `packages/core/src/context/index.ts:5` re-exports `containsAnyTerm` from the core package's public
  surface. The proposal names "an exported `containsAnyTerm`" in `context/lexical-match.ts` and one
  export line in `packages/core/src/index.ts` (for `impact/`), but not a new public export of the
  `context` barrel. Every module of `context/` is re-exported by that barrel (`anchor`, `rank`,
  `tokenizer`…), so the line follows the module's existing convention, and the helper is pure and
  side-effect free. **Decision: keep it and record it** (design Follow-ups V2, destination D): removing
  it would make `lexical-match.ts` the only `context/` module outside the barrel.
- `packages/core/src/impact/index.ts` exports `IMPACT_REQUEST_FIELDS`, `impactRequestSchema`,
  `parseImpactRequest`, `MIN_CHANGE_CHARS`, `MAX_CHANGE_CHARS`, `DEFAULT_IMPACT_HOPS`, the report
  types and `impact`. Design P1/D6 name them; it mirrors `explain/`. Specified, not a finding.
- `ImpactEntry.file`, and `hops` on `direct` entries: required by the spec ("Report by component",
  last bullet). Specified.
- No logging, no extra field in the report, no write to the store.

Checks requested by the skill:

- Dependencies not in the manifest: none; `zod` is already a core dependency, no new import outside
  the workspace.
- Authorisation required by the spec and not performed: the spec requires none at this layer; project
  scoping is the `StorePort` contract (requirement "Reverse traversal of dependants").
- Response fields the spec does not mention: none (`symbol`, `file`, `origin`, `resolution`, `hops`
  for dependants; `symbol`, `file`, `origin` for tests; `status`/`reason` for `unknown`).
- Tests weaker than their scenario: the two Q2 scenarios say "no entry of `direct` or `indirect`
  belongs to a `test` file"; their tests checked `file.startsWith('tests/')`, a path proxy. On the
  acme-shop fixture every `test` file is under `tests/`, so it held, but it was weaker than the
  scenario. **Fixed in this step** (task 12.6.2): `tests/unit/impact/impact.spec.ts` now reads the
  `test` files from `acmeShopGraph()` and `tests/integration/impact/acme-shop.spec.ts` reads them
  from the `file` table of the loaded seed. The scenario "Q2 is reproduced over the seed" does not
  ask for `resolution` on `DiscountService`, and its test does not assert it either; the subset
  test does. No other scenario test is weaker than its scenario.

## Scenario → test → state

| Scenario | Test | State |
|---|---|---|
| An out-of-range hop count is rejected before any read | `tests/unit/impact/impact-request.spec.ts:32` | green |
| An invalid change is rejected before any read | `tests/unit/impact/impact-request.spec.ts:45` | green |
| The hop count defaults to two | `tests/unit/impact/impact.spec.ts:81` | green |
| A change that anchors nothing answers no-anchor | `tests/unit/impact/impact.spec.ts:34` | green |
| A change that anchors only tests answers no-anchor | `tests/unit/impact/impact.spec.ts:46` | green |
| Impact in an unknown project fails | `tests/unit/impact/impact.spec.ts:61` | green |
| Only dependants within the hop limit are reported | `tests/unit/impact/impact.spec.ts:95` | green |
| Callees, documents and co-changed files are not dependants | `tests/unit/impact/impact.spec.ts:107` | green |
| Q2 is reproduced over the acme-shop subset | `tests/unit/impact/impact.spec.ts:122` | green |
| A component appears once at its minimum distance | `tests/unit/impact/components.spec.ts:211` | green |
| A reached file without symbols is reported by its path | `tests/unit/impact/components.spec.ts:239` | green |
| The anchor's own file is not a dependant | `tests/unit/impact/components.spec.ts:258` | green |
| Tests come from the walk and from the classes of direct components | `tests/unit/impact/impact.spec.ts:149` | green |
| A reached node's own tests are found | `tests/unit/impact/components.spec.ts:16` | green |
| Importers and tests written file to file are found | `tests/unit/impact/components.spec.ts:74` | green |
| The tests of a direct component's file are found | `tests/unit/impact/components.spec.ts:96` | green |
| Exact dependants come before heuristic ones at the same distance | `tests/unit/impact/relevance.spec.ts:31` | green |
| The order does not follow the names | `tests/unit/impact/relevance.spec.ts:44` | green |
| Tests are ordered by the distance of what they cover | `tests/unit/impact/relevance.spec.ts:117` | green |
| Q2 is reproduced over the seed | `tests/integration/impact/acme-shop.spec.ts:34` | green (on `codemind_it`) |
| A dependant three hops away needs three hops | `tests/integration/impact/acme-shop.spec.ts:60` | green (on `codemind_it`) |
| The literal Q2 text does not anchor the discount service | `tests/unit/impact/impact.spec.ts:227` | green |

22 scenarios, 22 tests, all green (`npx vitest run tests/unit/impact tests/integration/impact`: 5
files, 38 tests, none skipped).

## Verdict

Conforms after the two fixes of this step (12.6.1 code, 12.6.2 test strength). Block 3 holds one
unspecified export, kept and recorded (V2).
