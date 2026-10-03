## Context

See `proposal.md` → Why. Current state that shapes the approach (DIS-49 merged, PR #14):

- `createPhpAnalyzer()` (`packages/analyzers/php/src/php-analyzer.ts`) parses each file once and, in
  `analyzeOne`, extracts symbols, `PhpFileFacts` (`collectFacts`, `names.ts`) and route facts
  (`collectRoutes`, `routes.ts`) **while the tree is alive**, then calls `tree.delete()`. A file with
  a syntax error contributes no facts. Edges are built afterwards, across all files, in
  `buildPhpEdges` (`edges.ts`) and sorted by `sortUniqueEdges` (core).
- `resolveClassName(raw, facts)` and `resolveTarget(fqn, table)` already implement "PHP name
  resolution" (unique FQN or nothing). `buildFqnTable` maps FQN → `SymbolRef[]` from the kept symbols.
- `buildRouteEdges` finds the target method with `symbols.find(s => s.kind === 'method' && s.file ===
  … && s.name === 'X::m')` inside its loop.
- `extractSymbols` (`symbols.ts`) names methods `Type::method` (bare inside an anonymous class) and
  emits no symbol for closures or arrow functions.
- Grammar (`tree-sitter-php` `node-types.json`, checked 2026-10-03): `member_call_expression`
  (`object`, `name`), `member_access_expression` (`object`, `name`), `scoped_call_expression`
  (`scope`, `name`; `scope` is `relative_scope` for `self`/`parent`/`static`, `name` /
  `qualified_name` / `relative_name` for a class name), `object_creation_expression` (no fields),
  `property_declaration` (`type`) with `property_element` children (`name`),
  `property_promotion_parameter` (`type`, `name`), `optional_type`, `union_type`,
  `intersection_type`, `anonymous_function`, `arrow_function`, `nullsafe_member_call_expression`.
- Stryker mutates `packages/core/src/**` only; nothing in this change lands in core except a JSDoc.

## Goals / Non-Goals

**Goals:**

- One extra fact collector and one extra edge builder, following the DIS-49 two-phase pattern
  (per-file facts while the tree is alive, cross-file resolution afterwards).
- Reuse `resolveClassName` / `resolveTarget` for every class name; no second resolver.
- Target lookup in O(1) per call (method index), shared with route edges.

**Non-Goals (design level):**

- No type inference: no data flow over parameters, locals, return types or PHPDoc.
- No inheritance walk: only methods declared in the type itself are targets.
- No Tree-sitter query files (`.scm`), as in DIS-47/DIS-49.

## Decisions

### D1 — `calls.ts`: per-file call facts, collected in `analyzeOne`

`collectCalls(path, root, facts)` returns plain data, so it survives `tree.delete()`:

```ts
type CallForm = 'property' | 'static' | 'new' | 'own';

interface CallFact {
  /** Caller method symbol name (`Type::m`) and its 1-based start line. */
  caller: { name: string; startLine: number };
  /** Short name of the caller's type (for `own` and for property lookup). */
  callerType: string;
  form: CallForm;
  /** Raw class name as written (`static`/`new`), the property's raw declared type (`property`), '' for `own`. */
  rawClass: string;
  /** Target method short name (`__construct` for `new`). */
  method: string;
}
```

Walk, mirroring `extractSymbols`' `Enclosing`:

- Entering a named `class_declaration` / `interface_declaration` / `trait_declaration` sets the
  current type and builds its **typed property map** `propertyName → rawType` from direct
  `property_declaration` members and from `property_promotion_parameter`s of its `__construct`. A type
  is usable only when the `type` field is a single `named_type` (not `optional_type`, `union_type`,
  `intersection_type`, `primitive_type`); otherwise the property is absent from the map.
- Entering a `method_declaration` of a named type sets the current caller (`Type::m`, start line).
- Entering `anonymous_function`, `arrow_function` or `anonymous_class` **stops** the walk of that
  subtree (no facts from it; spec: no edge from closures, arrow functions or anonymous classes).
- Inside a caller:
  - `member_call_expression` whose `object` is `member_access_expression($this, name p)` and `name`
    is a `name` → `property` fact if `p` is in the typed property map (raw type kept), else nothing;
  - `member_call_expression` whose `object` is `variable_name` `$this` → `own` fact;
  - `scoped_call_expression` with `scope` `relative_scope` `self` → `own`; other `relative_scope`
    (`parent`, `static`) → nothing; `scope` `name`/`qualified_name`/`relative_name` → `static`;
  - `object_creation_expression` whose class child is `name`/`qualified_name`/`relative_name` →
    `new` with method `__construct`; whose class child is `self` (as written: `relative_scope` or a
    `name` with text `self`, confirmed in task 1.1) → `own` with method `__construct`; `static` (or
    `parent`) → nothing (late binding, like `static::m()`).
  - The walk continues into arguments, so nested calls (`$this->a->f($this->b->g())`) each give a fact.
- `nullsafe_member_call_expression`, dynamic names (`$this->$m()`, `$cls::m()`, `new $cls`) and
  `function_call_expression` produce nothing.

Facts are discarded by the caller (as for `PhpFileFacts`) when the file has more than one namespace.
Alternative rejected: extending `collectFacts` in `names.ts` — it would mix name-resolution facts with
body-level facts in one walk; `routes.ts` already set the precedent of a separate collector.

### D2 — `buildCallEdges` in `edges.ts`

For each fact of a file with `namespaces <= 1`:

- `own`: target type = the caller's own type symbol (its file is the caller's file);
- `static` / `new`: `resolveTarget(resolveClassName(rawClass, fileFacts), fqnTable)`;
- `property`: same resolution on the property's raw type.

Then the target method is `methodIndex.get(\`${targetType.file}\0${targetType.name}::${method}\`)`.
No method → no edge (this is what keeps `Pricing::compute`, `CarrierGateway::flatRateFor` and
`RecalculateTotals::dispatch` out: none is declared in that type, and `__call`/`__callStatic` are
never substituted). `new self(...)` arrives as an `own` fact with method `__construct`, so it targets
the caller type's `__construct` only when that type declares one; `new static(...)` never reaches the
builder (D1). Source = the caller method's `SymbolRef`
looked up in the same index (so a caller dropped by `keepFirst` as a duplicate yields no edge).

Edge: `{ kind: 'calls', resolution: 'exact', extractor: PHP_EXTRACTOR }`. Duplicates (same call
twice, `$this->m()` and `self::m()` to the same target) are removed by the existing
`sortUniqueEdges`; no dedup in the builder.

### D3 — Shared method index

`indexMethods(symbols) → Map<'file\0Type::m', SymbolRef>` built once in `buildPhpEdges` and passed to
both `buildRouteEdges` (replacing its `symbols.find`) and `buildCallEdges`. Behaviour of route edges
is unchanged (their tests are the regression).

### D4 — Interface targets

A property typed with an interface resolves to the interface symbol and targets the method declared
in the interface (`kind: 'method'`, same `Type::m` naming by `extractSymbols`). This matches the
"typed, interface method" `exact` convention of the task-api batch (site 9) and needs no extra code.

### D5 — Test placement

New `tests/unit/analyzers/php/calls.spec.ts` (one `it` per scenario, named after it), same shape as
`edges.spec.ts`. The existing route test in `edges.spec.ts` asserts that `calls` holds exactly two
edges; it is narrowed to `calls` edges whose source file is `routes/api.php`, keeping both expected
edges and the exact equality.

### D6 — No ADR

Additive, analyzer-local, cheap to revert; the classification rule is in the spec. No ADR.

## Risks / Trade-offs

- **"Exact" assumes no override.** `$this->discounts->discountFor()` is dispatched at run time to a
  subclass if one is injected; the edge points at the declared type. Same trade-off as the task-api
  baseline; acceptable for a static analyzer, recorded here.
- **False negatives by design**: inherited methods, typed parameters, locals and closures produce no
  edge. Impact analysis may miss callers; DIS-61/DIS-63 add heuristic coverage later.
- **`own` calls into a trait** method used by the class are not resolved (the method is declared in
  the trait, not in the class) — consistent with "declared in the type itself".
- **Signed decision (audit, 2026-10-03)**: `new self(...)` produces a `calls` `exact` edge to
  `__construct` of the caller's own type when that type declares it in its own body (analogous to
  `self::m()`); `new static(...)` produces no edge (late binding, consistent with `static::m()` being
  out of scope). In acme-shop this adds edges from `Money`'s factory and arithmetic methods to
  `Money::__construct`; the acme-shop scenario lists required edges (containment, not an exact
  count), so it is not changed unless implementation shows it must assert them.
- Grammar detail risk (e.g. how `object_creation_expression` wraps its class name, or a
  `relative_scope` text) is checked first in tasks with inline samples; differences are recorded here.
  - **Checked 2026-10-03 (task 1.1)**: `new self()` / `new static()` / `new parent()` give an
    `object_creation_expression` whose class child is a plain `name` with text `self` / `static` /
    `parent` (not `relative_scope`); `self::m()` / `parent::m()` / `static::m()` give
    `scoped_call_expression` with `scope` = `relative_scope` (text `self` / `parent` / `static`).
    `$this` is a `variable_name` wrapping `name` `this`. A fully-qualified property type
    (`\App\X`) is a `named_type` wrapping a `qualified_name` whose text keeps the leading `\`.
    `int $n` is `primitive_type`, never `named_type`. `?->` is `nullsafe_member_call_expression`.
    Everything else matches D1.
