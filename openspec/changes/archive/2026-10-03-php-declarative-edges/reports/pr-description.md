## What changes?

Fills `AnalysisResult.edges` for the PHP analyzer, until now always `[]`. It resolves class names by
fully-qualified name (namespace + top-level `use` imports, aliases, group imports — never by short
name) and emits `imports`, `extends` and `implements` (`names.ts`, `edges.ts`); a new `route` symbol
and a `calls` edge for array-action routes (`Route::<verb>('<uri>', [X::class, 'm'])`, `routes.ts`);
`tested_by` from a test class's own references to its subject; and `describes` (doc file → symbol,
matched only inside backticks or fenced code blocks, never prose) via two new pure, language-independent
rules in core (`compareEdges`/`sortUniqueEdges`, `docMentionEdges`/`DOC_MENTION_EXTRACTOR`) that the
TypeScript analyzer (DIS-30) can reuse untouched. `AnalyzerPort`'s signature is unchanged; only its
`edges` JSDoc is updated.

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `npx vitest run tests/unit/knowledge/edge-order.spec.ts tests/unit/knowledge/doc-mentions.spec.ts tests/unit/analyzers/php` — 59 tests green.
2. `npx vitest run` — full suite green, 176 passed, 99 skipped (no `DATABASE_URL` needed for the new tests).
3. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage` — all green (pre-existing warnings only).
4. `npx stryker run` — `doc-mentions.ts` 96.77 %, `edge-order.ts` 94.64 % (threshold 70 %); 93.89 % overall for `packages/core/src`, no regression.
5. `npx vitest run --exclude 'tests/integration/**'` (no `DATABASE_URL`) — 150 passed, including the new spec files.

## Decisions / trade-offs

- **Names resolve by fully-qualified name only, never by short name** (spec "PHP name resolution") —
  a name with no unique match in the input (a vendor class, an ambiguous short name held by two
  symbols) yields no edge rather than a guessed one. A file declaring more than one `namespace` has
  its facts discarded entirely: it originates no name-based edge (design D2).
- **`docs/pricing.md` gets no `describes` edge** — it never names a symbol inside code, only in prose
  headings ("Order of operations", "Pricing rules"). DIS-94's acceptance criteria assuming one is
  corrected there, not here (signed decision, design D9; fixtures unchanged, PH-22).
- **`compareEdges`/`sortUniqueEdges` and `docMentionEdges` live in core**, not in the PHP analyzer,
  so DIS-30's TypeScript analyzer orders edges the same way and emits the same `describes` rule
  without touching `packages/core` (design D5, D6).
- **No ADR** (design D9) — nothing here is costly to revert or crosses an architectural boundary
  beyond the pattern `co-change.ts` already set (a pure edge rule in core).

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:247` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:270` |
| Paths are classified by the canonical rule | `tests/unit/knowledge/file-kind.spec.ts:8` |
| The acme-shop files are classified | `tests/unit/analyzers/php/structure.spec.ts:24` |
| Line count of a file | `tests/unit/knowledge/file-kind.spec.ts:17` |
| A described file has no contentHash or redacted | `tests/unit/knowledge/file-kind.spec.ts:25` |
| PriceCalculator symbols have exact spans | `tests/unit/analyzers/php/structure.spec.ts:44` |
| Symbol spans include modifiers and attributes | `tests/unit/analyzers/php/structure.spec.ts:58` |
| Every named class of acme-shop is listed | `tests/unit/analyzers/php/structure.spec.ts:91` |
| Interfaces and top-level functions are listed, enums are not | `tests/unit/analyzers/php/structure.spec.ts:113` |
| A trait is encoded as a class | `tests/unit/analyzers/php/structure.spec.ts:138` |
| Anonymous classes yield only their methods | `tests/unit/analyzers/php/structure.spec.ts:149` |
| Duplicate symbols are dropped with a diagnostic | `tests/unit/analyzers/php/structure.spec.ts:164` |
| Names resolve by fully-qualified name, never by short name | `tests/unit/analyzers/php/edges.spec.ts:87` |
| Aliases, group imports and ambiguous names | `tests/unit/analyzers/php/edges.spec.ts:108` |
| Inheritance and imports of acme-shop | `tests/unit/analyzers/php/edges.spec.ts:47` |
| A file with a syntax error originates no edge | `tests/unit/analyzers/php/edges.spec.ts:191` |
| The API routes of acme-shop point at their controller actions | `tests/unit/analyzers/php/edges.spec.ts:208` |
| A route to an action outside the input has no edge | `tests/unit/analyzers/php/edges.spec.ts:239` |
| The unit tests of acme-shop cover their classes | `tests/unit/analyzers/php/edges.spec.ts:286` |
| A test class that does not reference its subject has no edge | `tests/unit/analyzers/php/edges.spec.ts:307` |
| The acme-shop README describes the symbols it names in code | `tests/unit/analyzers/php/edges.spec.ts:320` |
| Prose and ambiguous names produce no describes edge | `tests/unit/knowledge/doc-mentions.spec.ts:22` |

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
