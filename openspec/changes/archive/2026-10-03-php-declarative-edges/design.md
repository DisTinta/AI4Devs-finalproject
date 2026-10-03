## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `createPhpAnalyzer()` (`packages/analyzers/php/src/php-analyzer.ts`) parses each `.php` file once,
  runs `extractSymbols` on the tree, filters duplicates with `keepFirst`, and deletes the tree
  (`tree.delete()`) before the next file. It returns `edges: []`.
- `extractSymbols` (`symbols.ts`) names classes, interfaces and traits by their **short** name and
  never records the namespace. `SymbolRef` (`file`, `name`, `startLine`) is the only identity an edge
  endpoint can carry.
- `validateGraph` rejects an edge whose endpoint is not in the graph, so an edge can only point at a
  file or symbol of the same `AnalysisResult`.
- `co-change.ts` is the precedent for a pure, language-independent edge rule in core with an exported
  extractor constant; Stryker mutates `packages/core/src/**` only.
- DIS-30 (TypeScript analyzer) must leave `git diff -- packages/core` empty, so anything every
  analyzer must do identically (edge order, `describes`) has to land in core **now**.
- Fixture facts the scenarios rely on (counted on 2026-10-02 over the 53 tracked files): 79 top-level
  `use` imports resolve to project classes; 7 `extends` between project classes; no project
  interface; `README.md` names 14 classes/traits and `PriceCalculator::compute` inside code;
  `docs/pricing.md` has no code span at all.

## Goals / Non-Goals

**Goals:**

- One name-resolution routine shared by `imports`, `extends`, `implements`, routes and `tested_by`,
  so the "full name, never short name" rule is enforced in one place.
- Edges are computed after all files are parsed (a target can live in any file of the input).
- Edge order and `describes` live in core, mutation-tested, reusable by DIS-30.

**Non-Goals (design level):**

- No Tree-sitter query files (`.scm`): the walk inspects a handful of node types, as in DIS-47 (D5).
- No case-insensitive class-name matching (PHP's own rule): exact names avoid ambiguity; the
  limitation is recorded in Risks.

## Decisions

### D1 — Two phases: per-file facts, then cross-file resolution

Trees are deleted per file (memory), so phase 1 extracts plain-data **facts** from each parsed file
while its tree is alive, next to `extractSymbols`:

```ts
interface PhpFileFacts {
  path: string;
  namespaces: number;              // count of namespace declarations; > 1 → no name-based edges
  namespace: string;               // '' for global
  imports: Map<string, string>;    // alias → fully-qualified name (top-level class imports only)
  types: Array<{ symbol: SymbolRef; extends: string[]; implements: string[]; kind: 'class' | 'interface' }>;
  references: string[];            // raw class names written in the file (for tested_by)
  routes: RouteFact[];             // array-action routes found at top level
}
```

Phase 2 (`edges.ts`) builds a `Map<fqn, SymbolRef[]>` from the **kept** symbols (after `keepFirst`)
and resolves every fact. Files with a syntax error produce no facts (their tree is not walked), which
is how "originates no edge" holds. Alternative rejected: resolving during the walk — impossible, the
target may be in a file not parsed yet.

### D2 — `names.ts`: one resolver, PHP's rules, no guessing

`resolveClassName(raw, facts) → string` implements the spec's three cases (fully-qualified, alias
prefix, namespace-relative). `resolveTarget(fqn, table) → SymbolRef | undefined` returns a target only
when the table holds exactly one symbol for that name. Imports are read from top-level
`namespace_use_declaration` nodes only (including `namespace_use_group`); `use function` / `use const`
are skipped by their keyword; `use` inside a class body is a different node (`use_declaration`) and
is never read. The FQN of a declared type is `namespace\shortName`, recorded per type in the facts.
A file with more than one `namespace_definition` keeps its symbols but its facts are discarded.

### D3 — Routes: `routes.ts`, top-level statements only

For each direct child `expression_statement` of the program: unwrap `member_call_expression`
objects down to a `scoped_call_expression` whose scope is the name `Route` (and, if the file imports
an alias `Route`, it must map to `Illuminate\Support\Facades\Route`) and whose method is one of the
six verbs. Arguments must be a non-interpolated string and an array of exactly two elements:
`X::class` (`class_constant_access_expression`) and a non-interpolated string. Accepted statements
produce a `route` symbol (span and signature of the statement, `;` excluded) emitted with the other
symbols — so it passes through `keepFirst` and `bySymbolOrder` unchanged — and a `RouteFact` with
the raw `X` and method name. Phase 2 emits `calls` only when `X` resolves to a class whose file has a
method symbol named `ShortName::m`. Nested statements (closures, groups) are never visited, which is
what keeps prefixed URIs from being emitted wrong.

### D4 — `tested_by` from references

`references` collects the class names written in the file: `use` targets, `extends`/`implements`
names, `named_type`s, `object_creation_expression` classes, and the scope of
`class_constant_access_expression` / `scoped_call_expression`. For each class `XTest` declared in a
file whose `fileKindOf` is `test`, phase 2 resolves the references and emits `X → XTest` when one
resolves to a class whose short name is `X`. Both endpoints are class symbols (decision 4 of
DIS-49: `exact`).

### D5 — `describes` in core: `knowledge/doc-mentions.ts`

```ts
export const DOC_MENTION_EXTRACTOR = 'doc-mention';
export function docMentionEdges(files: SourceFile[], symbols: GraphSymbol[]): GraphEdge[];
```

It keeps only files whose `fileKindOf(path)` is `doc`, splits each into fenced blocks (closed pairs of
lines starting with three backticks) and, outside them, inline spans (odd segments of a line split on
`` ` ``). Code text is scanned once with one constant, linear pattern
(`[A-Za-z_][A-Za-z0-9_]*`, plus `A::b` pairs), and every token is looked up in a `Map<name, symbols>`
built once from non-`route` symbols; only names with exactly one symbol yield an edge. Nothing is
built from document content or symbol names into a regular expression. `resolution` `heuristic`;
extractor `doc-mention` (not the PHP one: the rule is the same for every analyzer, so DIS-30 emits the
same extractor). Alternative rejected: running `describes` in the ingestion use case (DIS-85) over
both analyzers — the sub-issue asks for it here, and a project has a single analyzer today.
`SourceFile` is imported from `ports/AnalyzerPort.ts` (a type-only import inside core).

### D6 — Edge order and uniqueness in core: `knowledge/edge-order.ts`

`compareEdges(a, b)` implements the spec order (kind, then source, then target; an endpoint by path,
file before symbols, then name, then start line; UTF-16 comparison, no `localeCompare`), and
`sortUniqueEdges(edges)` sorts and drops later duplicates of (kind, source, target). The PHP analyzer
calls it once on `phpEdges ∪ docMentionEdges`. In core so the TypeScript analyzer orders edges the
same way without touching core.

### D7 — Extractor constant and composition

`PHP_EXTRACTOR = 'php-treesitter-laravel'` lives in the analyzer (the name the parent HU fixed).
`php-analyzer.ts` becomes: describe files → parse each `.php` (symbols + facts) → sort symbols →
`buildPhpEdges(facts, symbols)` → `docMentionEdges(input.files, symbols)` → `sortUniqueEdges`.
`AnalyzerPort.ts` only changes the JSDoc of `edges` (now: "every relation the analyzer resolves,
ordered by `compareEdges`").

### D8 — Tests

- `tests/unit/analyzers/php/edges.spec.ts`: one `it` per scenario of "PHP name resolution",
  "Code relation edges", "Array-action routes", "Test coverage edges" and "The acme-shop README
  describes the symbols it names in code", named after the scenario.
- `tests/unit/knowledge/doc-mentions.spec.ts`: "Prose and ambiguous names produce no describes edge"
  plus extra cases for mutation (unclosed fence, double backticks, `::` pairs, route names).
- `tests/unit/knowledge/edge-order.spec.ts`: unit cases for `compareEdges`/`sortUniqueEdges`
  (mutation coverage; not a spec scenario).
- `tests/unit/analyzers/php/structure.spec.ts`: only the two MODIFIED scenarios change ("The
  acme-shop analysis is a valid deterministic graph", "The acme-shop files are classified").
- `readFixtureFiles` moves to `tests/support/read-fixture-files.ts`; both analyzer specs import it.
- Fixtures stay read-only (PH-22); every edge case is inline content.

### D9 — No ADR

Nothing here is costly to revert or crosses an architectural boundary beyond the pattern
`co-change.ts` already set (a pure edge rule in core). The `describes` policy is recorded in the spec
and in the signed decisions comment on DIS-49.

### Grammar check (task 3.2, 2026-10-03)

Parsed throwaway inline samples with the loaded grammar (`tree-sitter-php/php/src/node-types.json`
and the live tree) to confirm every node/field name D2–D4 assume. All of them exist exactly as
named: `namespace_definition`, `namespace_use_declaration` (single clause: child `namespace_use_clause`
holding a `name`/`qualified_name` plus an optional `alias` field; group form: a `namespace_name`
prefix child plus a `namespace_use_group` child of `namespace_use_clause`s with bare names),
`base_clause`, `class_interface_clause`, `scoped_call_expression` (fields `scope`, `name`,
`arguments`), `member_call_expression` (fields `object`, `name`, `arguments`),
`class_constant_access_expression` (no named fields: the scope and the constant name are its first
two named children, positionally), `array_creation_expression`, `named_type`,
`object_creation_expression`, and `use_declaration` (trait use inside a class body), a distinct node
type from `namespace_use_declaration` as D2 assumes. Two implementation nuances, not contradictions:

- `use function foo;` / `use const BAR;` carry the keyword in the declaration's (or clause's) `type`
  field, an **anonymous** node — absent from `namedChildren`, so detecting it requires
  `childForFieldName('type')`, not a text scan.
- A double-quoted string with no interpolation (`"m"`) still parses as `encapsed_string`, exactly
  like an interpolated one (`"/o/$id"`); the two differ only in their children — a lone
  `string_content` versus one plus a `variable_name` (or other interpolation node). "Non-interpolated
  string" (routes.ts) must therefore accept both the `string` and `encapsed_string` node types, and
  for `encapsed_string` require exactly one `string_content` child and nothing else.

No design change follows from this: D2–D4 already describe behaviour, not node shapes.

## Risks / Trade-offs

- [Tree-sitter-php node names differ from the ones assumed in D2–D4] → the first task of each slice
  prints the tree of a tiny inline sample (throwaway, not committed) and adjusts; scenarios assert
  behaviour, not node names.
- [Case-sensitive names miss `use app\models\order;`] → accepted (no fixture writes PHP names in
  other case); recorded in `docs/project-context.md`.
- [`describes` ties the README scenario to its exact text] → the fixture is read-only (PH-22); if it
  is ever regenerated, the scenario's list is the oracle to update in the same change.
- [`docs/pricing.md` gets no `describes`, and the demo Q2/Q5 expect a stale-doc signal] → signed
  decision: DIS-94 re-anchors its AC (comment already posted); not fixed here.
- [Short names in docs collide across namespaces] → ambiguous names produce no edge, by design.
- [Performance] → one pass per file plus map lookups; O(files + symbols + tokens).

## Migration Plan

None: no schema, no data, no dependency. Rollback is reverting the change; `edges` returns to `[]`.

## Follow-ups

- DIS-52 keeps site 11 (`routes/api.php` → `OrderController::show`) only as a regression assertion
  (comment posted on DIS-52).
- DIS-94 re-anchors its `describes` AC on `README.md` (comment posted on DIS-94).
- DIS-30 reuses `docMentionEdges` and `sortUniqueEdges` from core.
