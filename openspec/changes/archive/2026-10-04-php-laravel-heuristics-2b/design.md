## Context

See proposal.md (Why) and the delta spec for the rules. Current state after DIS-97:

- `collectCalls` (`calls.ts`) records `member_call_expression`, `scoped_call_expression`,
  `object_creation_expression` and the `event(new E)` `function_call_expression`. A
  `member_access_expression` (a property read) is never a fact, and a `CallFact` has **no line**: only
  the caller symbol. Receiver types come from `typedPropertiesOf` (declared and promoted properties);
  method parameters are never read.
- `buildPhpEdges` (`edges.ts`) runs `resolveCalls` once, then `buildCallEdges` (`exact`), and feeds
  `appendUnshadowed` with route string edges, `buildHeuristicCallEdges` (facade → `resolveFacadeCall`,
  else `resolveJobDispatch ?? resolveMagicCall`) and `buildEventEdges` (`resolveEventDispatch`). Each
  resolver already returns `undefined` / `[]` when a recognised pattern has no target (design D6 of
  php-laravel-heuristics-2a): these are the seams of the report.
- `buildRouteEdges` returns `{ exact, heuristic }`; a route without edge leaves no trace.
- `createPhpAnalyzer(): AnalyzerPort`; `analyze` returns `{ files, symbols, edges, diagnostics }`.
  Only tests under `tests/unit/analyzers/php` call it; no other package imports the PHP analyzer.
- `directlyExtends(facts, type, line, FQN)` (`laravel/container.ts`) is the base-class check used by
  facades and event providers.
- Probe of acme-shop with the current code (2026-10-04, scratch script in the session scratchpad, not
  in the repo): 47 `exact` + 11
  `heuristic` `calls`, and **no** `calls` edge targets a symbol under `app/Models/`. The fixture's
  property reads were listed by hand: only the six of the delta's acme-shop scenario reach a declared
  accessor or relation; every other read is a column (`$this->unit_price_cents`, `$coupon->active`,
  `$event->order->id` …), a local or untyped receiver, or sits in an arrow function.
- `packages/core` must not change (criterion of CM-HU-04b; author decision D1 on DIS-63).

Grammar, checked on 2026-10-04 with the project's parser (task 1.1, scratch script deleted), matches
D1: `$p->a` is `member_access_expression` (`object: variable_name`, `name: name`); `$this->p->a` nests a
`member_access_expression` as `object`; `?->` is `nullsafe_member_access_expression`; `$p->$a` has
`name: variable_name` and `$p->{"a"}` has `name: encapsed_string` (neither is a `name`). `=`, `+=` /
`??=` and `=&` are `assignment_expression`, `augmented_assignment_expression` and
`reference_assignment_expression`, each with a `left` field. Parameters: `simple_parameter` with
`type` (`named_type`, `optional_type` for `?T`, `union_type`), `name` (`variable_name`) and
`default_value` (a `null` node for `= null`); `Post ...$v` is a `variadic_parameter`; a promoted one is
`property_promotion_parameter`. `$this` is a `variable_name` whose text is `$this`.

## Goals / Non-Goals

**Goals:**

- Rule 6 (Eloquent attributes) and the unresolved report as in the delta spec, reusing the call walk,
  name resolution, method index, `directlyExtends` and `appendUnshadowed`.
- The report built in the same pass as the heuristic edges, from the resolvers' own answers, so an
  entry can never disagree with the edges.

**Non-Goals:**

- Typed parameters for anything other than rule 6 reads (D5 of the author).
- Any change to `packages/core`, the schema, `AnalyzerPort` or `AnalysisResult`.

## Decisions

### D1 — Reads as a new call form `attribute`, collected in the same walk

`calls.ts` gains the form `'attribute'`: `{ form: 'attribute', rawClass, method: a }`, where `rawClass`
is the raw type name of the receiver, or `''` when the receiver is `$this` (own declaration, resolved
like `this`/`self` in `resolveCalls`). `targetOf` recognises a `member_access_expression` whose `name`
field is a `name` node, whose `object` is:

- `$this` → `rawClass: ''`;
- `$this->p` (a `member_access_expression` on `$this`) with `p` in `typedPropertiesOf` → its type;
- a `variable_name` that is a parameter of the enclosing method in the new parameter map → its type;

and which is not the `left` field of an `assignment_expression`, `augmented_assignment_expression` or
`reference_assignment_expression`. `?->` is a different node (`nullsafe_member_access_expression`), so
it never matches. The walk already visits every node, so in `$order->subtotal->amount()` the inner
access is visited as the `object` of the outer call, and the outer link never matches (its object is
neither `$this`, `$this->p` nor a variable).

*Write targets (author decision 2026-10-04, D9):* besides an assignment's `left`, the operand of
`++`/`--`, an argument of `unset(...)`, a destructuring target (`[$p->a] = …`, `list($p->a) = …`) and a
`foreach` target are writes and give no edge, consistently with `+=`. `isset($p->a)` and `$p->a[] = …`
stay reads, because Laravel runs the accessor or the relation in both. A single `isWriteTarget(node)`
covers these nodes. Parser check (task 12.4, scratch script deleted): `$p->a++` / `--$p->a` → parent
`update_expression`; `unset($p->a)` → parent `unset_statement`; `[$p->a] = …`, `list($p->a) = …`,
`['k' => $p->a] = …` and nested `[[$p->a]] = …` → parent `list_literal` (keys sit directly in it too, so
an access followed by a `=>` sibling is a key, read, not a target); `foreach ($xs as $p->a)` → a direct
child of `foreach_statement` other than its first named child (the iterable, a read); `as $k => $p->a`
and `as $p->a => $v` → inside a `pair` whose parent is `foreach_statement` (both foreach targets).
`isset($p->a)` is an `argument` of a `function_call_expression`, and `$p->a[] = 1` sits under the
`subscript_expression` that is the `left` of the assignment: neither is a target.

*Self target (D9):* a read whose target is the caller method itself (a getter `status()` returning
`$this->status`) gives no edge. Laravel returns the column first, and the edge would be a self-loop.

*Parameter scope (D9):* a parameter keeps its declared type in the whole method body. A reassignment or
a `catch` variable of the same name is not tracked: an accepted false positive, stated in the spec.

The **parameter map** (`parameterTypesOf(method)`) holds, per method, each `simple_parameter` or
`property_promotion_parameter` whose `type` is a single `named_type` (via `namedTypeOf`), that is not
variadic (`variadic_parameter` is another node type) and whose default value is not `null`. It is
passed to `walkBody` next to the property map; a property and a parameter never collide, because one
is reached through `$this->` and the other through a variable.

`buildCallEdges` and `buildHeuristicCallEdges` skip `attribute` (a read has no exact meaning and is not
a call); `buildAttributeEdges` (in `edges.ts`, beside `buildEventEdges`, for the same reason: it takes
the module-private `ResolvedCall`) resolves them through `resolveEloquentAttribute` in the new
`laravel/eloquent.ts`.

*Alternative rejected:* a separate `collectReads` walk — it would duplicate the placement rules
(closures, arrow functions, nested declarations, anonymous classes), which are the subtle part, and
the property map.

### D2 — `laravel/eloquent.ts`

- `ELOQUENT_MODEL_FQN = 'Illuminate\\Database\\Eloquent\\Model'`.
- `studly(a)`: split on `_` and `-`, drop empty parts, upper-case each part's first character, join.
- `resolveEloquentAttribute(attribute, isModel, declaredMethod)`: `undefined` unless `isModel`; else
  `declaredMethod('get' + studly(a) + 'Attribute') ?? declaredMethod(a)`.
- In `buildAttributeEdges`, `isModel` is `targetKind === 'class'` and `directlyExtends` of the target
  type's own fact against `ELOQUENT_MODEL_FQN` (through the facts of the target's file), so a parent's
  `Model` never counts.
- The fallback `M::a` matches a Laravel 9+ `Attribute` accessor only when its camelCase name equals `a`
  (single-word keys); Laravel looks those up with `Str::camel($key)`. Spec wording fixed in D9.
- `studly` upper-cases with `toUpperCase`, which is multibyte. Checked on 2026-10-04 against
  `Str::studly` (laravel/framework 12.x, `Str.php`): `ucfirst` → `upper` → `mb_strtoupper(…, 'UTF-8')`, so
  non-ASCII names behave as in Laravel. Not a defect.

### D3 — `CallFact.line`

`CallFact` gains `line`: the 1-based start row of the call node (for `attribute`, of the access node).
Needed only by the report; edges ignore it. Multi-line calls report their first line, as routes do.

### D4 — The report is collected beside the edges, from the resolvers

`buildPhpEdges` returns `{ edges, unresolved }` instead of `GraphEdge[]`. Each site is recorded where
its resolver says "no target":

- **facade**: in `buildHeuristicCallEdges`, a `static` call on a facade class whose
  `resolveFacadeCall` returns `undefined` → `facade-unresolved` (a facade never falls back to
  `__callStatic`, so there is no other route to an edge).
- **job**: a `static` call on a class that is not a facade, `method` in the dispatch set, `uses`
  resolving to `Dispatchable`, and both `resolveJobDispatch` and `resolveMagicCall` returning
  `undefined` → `job-no-handle`. The "recognised" test is factored out of `resolveJobDispatch`
  (`isJobDispatch(method, type, facts)`) so both use the same condition.
- **event**: in `buildEventEdges`, an `event` call whose `targetKind` is `class` and for which
  `resolveEventDispatch` returns `[]` → `event-no-listener`. An `E` outside the input never reaches
  here (`resolveCalls` drops it), which is what the spec asks.
- **route**: in `buildRouteEdges`, a route fact that passes the duplicate and namespace checks and
  yields no edge → `route-action-missing`, with the route symbol as `source` and the fact's `line`.

A resolver's answer is final even if `appendUnshadowed` later drops the `heuristic` edge because an
`exact` one has the same identity: there is then an edge, and no entry is recorded (the entry is
recorded only when the resolver itself found nothing). A declared method short-circuits before any
of this (`declared(targetType, call.method)`), so a call with an `exact` edge is never a site.

`laravel/unresolved.ts` holds `UnresolvedReason`, `UnresolvedSite`, `PhpAnalysisResult` and
`sortUniqueUnresolved(sites)` (order path → line → `source.name` → reason by UTF-16 code unit;
duplicates by those four plus `source.file`/`startLine`). The extra tie-breakers `source.file` and
`source.startLine` after `reason` are defensive and unreachable (same path, line and name imply the same
symbol); accepted, the spec does not name them (D9).

*Inherited methods (author decision 2026-10-04, D9):* within the four patterns, a method the target only
inherits never resolves (only a method declared in the type's own body counts), so the site is listed:
`facade-unresolved` when `C` only inherits `m`, `job-no-handle` when `X` only inherits `handle` (unless
`__callStatic` gives an edge). Laravel reaches them through inheritance; the analyzer does not, and that
is the incompleteness the report measures.

*Ambiguous fully-qualified names (D9):* a class name declared twice in the input resolves to no target.
A route naming it has no edge, so it is listed (`route-action-missing`: a route symbol without an edge).
A facade, job or event naming it is dropped by `resolveCalls` like a type outside the input, so it has
no entry. Both follow the definitions; accepted.

*Alternative rejected:* deriving the report afterwards from the edges ("every recognised site without
an edge") — it would re-run the recognition logic of every rule outside the resolvers and could drift
from them.

### D5 — `PhpAnalysisResult` outside the port

`createPhpAnalyzer()` returns `PhpAnalyzer`, an interface extending `AnalyzerPort` whose `analyze`
resolves to `PhpAnalysisResult = AnalysisResult & { unresolved: UnresolvedSite[] }`. It is still
assignable to `AnalyzerPort` (structural typing; a method's return type is covariant), so any caller
holding the port is unaffected. `index.ts` exports `PhpAnalyzer`, `PhpAnalysisResult`, `UnresolvedSite`
and `UnresolvedReason` as types. `UnresolvedSite.source` is core's `SymbolRef` (a type import; core
does not change).

*Author decision 2026-10-04 (D9):* "Analysis contract" is **not** modified. It says the result SHALL
resolve to the four fields and does not forbid others. DIS-98 and the proposal say it does not change,
D1 on DIS-63 keeps the report out of the common contract, and amending it would change every analyzer for
a PHP-only need. The ADDED "PHP unresolved report" states instead that the result satisfies "Analysis
contract" with `unresolved` as an extra field, and names the four type exports. A type-level check
enforced by `npm run typecheck` assigns `createPhpAnalyzer()` to an `AnalyzerPort` variable.

### D6 — Multi-namespace files and duplicates: no entry

A route in a file with more than one `namespace` keeps its symbol but originates no edge ("Array-action
routes"); the report treats it like every other edge of such a file and lists nothing, as for calls
(which `resolveCalls` already drops). A route fact dropped as a duplicate is skipped before the check.
Author-visible assumption, recorded in the spec ("files … that declare more than one `namespace` …
contribute no entry").

### D7 — Tests

- `tests/unit/analyzers/php/laravel/eloquent.spec.ts` (new, template `heuristic-calls.spec.ts`):
  "Eloquent reads reach accessors and relations, never columns or writes", plus extra cases (not
  scenarios): `$this->p` typed-property receiver; a model reached only through a parent of `Model`
  (no edge); `getXAttribute` preferred over `x`; `$r->a += 1`, `$r->a ??= x`, `$r->$a`, `$r->{'a'}`;
  `Post $p = null` and `Post ...$ps`; reads inside arrow functions; a read whose target also has an
  `exact` edge from the same caller.
- `tests/unit/analyzers/php/laravel/unresolved.spec.ts` (new): the three scenarios of "PHP unresolved
  report", plus extra cases: an ambiguous key, a facade with no accessor, a bound class without `m`
  (`facade-unresolved`); a listener without `handle` (`event-no-listener`); a `Dispatchable` class with
  `__callStatic` and no `handle` (no entry); a multi-line call reports its first line; an array route to
  an undeclared method (`route-action-missing`); a multi-namespace routes file (no entry).
- MODIFIED scenarios updated in place, each when its test first turns RED: `calls.spec.ts`
  "The heuristic call sites of acme-shop have no exact edge" (site 4 clause → "no `exact`") and
  `laravel/heuristic-calls.spec.ts` "The Laravel call sites of acme-shop are heuristic calls" (11 → 17,
  six new edges, the `app/Models/` clause). No other assertion changes. The unchanged scenarios copied
  into the MODIFIED requirements keep their tests as they are.
- The AC3 inputs are used verbatim (single-line PHP files; `routes/web.php` with real line breaks), so
  the expected `line` values hold (author note on DIS-98, 2026-10-03). If a `line` differs in RED, the
  input is checked against the scenario, never the expectation.

### D8 — No ADR

Local to `packages/analyzers/php`, cheap to revert, recorded in the spec and here. The decision to
keep the report out of the port is the author's D1 on DIS-63, already recorded in Linear.

### D9 — Fixes after `/verify-against-spec` and `/adversarial-review` (author decisions 2026-10-04, tasks §12)

Both reviews: all scenarios green, no Blocker or Major; PASS WITH GAPS. Destination of each finding (A
fixed in this change, D accepted and recorded). The author ruled out a new debt issue: what was not
foreseen is resolved in DIS-98 and in this spec.

1. **Inherited methods vs the general "only inherited" exclusion (spec contradiction)** → **A**, spec:
   the reason definitions win (D4); extra cases for an inherited `m` and an inherited `handle`.
2. **Reads not covered by the definition** (`++`/`--`, `unset`, destructuring, `foreach`, `isset`,
   `$p->a[] =`) → **A**, spec + scenario "Writes never read an Eloquent attribute; isset and indirect
   modification do" + code (D1); forced failure "accept `++` as a read".
3. **Exports only in the design; "Analysis contract" tension** → **A**, spec text of "PHP unresolved
   report" only, "Analysis contract" untouched (D5); typecheck assertion.
4. **Weak tests** (`=` and `?->` hidden by dedup; the acme-shop write is on a local; `source.name`
   ordering; string-route `route-action-missing` branches) → **A**, extra cases and forced failures
   (k)–(n); the acme-shop clause now says why that write yields nothing.
5. **Self-loop `status()` → `status`** → **A**, spec (rule 6) + code (D1).
6. **Promoted `private Post $p = null`** → **D**: PHP rejects it ("Using null default on non-nullable
   property", constructor promotion RFC, checked 2026-10-04), so form 1 has no defect to fix.
7. **Parameter reassigned or shadowed by `catch`** → **D**: accepted false positive, stated in the spec
   (rule 6) and in DIS-98 «Fuera de alcance».
8. **Ambiguous fully-qualified names in the report** → **D**, D4.
9. **Non-ASCII `studly`** → **D**: it matches the multibyte `Str::ucfirst` of Laravel (D2).
10. **Extra sort tie-breakers** → **D**, D4.
11. **Wording of the fallback `M::a`** (Laravel 9+ accessors are looked up in camelCase) → **A**, spec
    text only.

## Follow-ups

None: every finding of D9 is fixed in this change (A) or accepted and recorded (D).

## Risks / Trade-offs

- [A parameter reassigned in the method body (`$order = $other;`) or shadowed by `catch` keeps its
  declared type] → a read after that may get a wrong `heuristic` edge. Accepted false positive, now
  stated in the spec (D9).
- [Laravel 9+ `Attribute` accessors are matched by the literal name only] → `couponCode(): Attribute`
  for `$r->coupon_code` is missed (false negative). Non-goal; acme-shop has none.
- [Inherited accessors and relations are not followed] → a model whose relation lives in a parent
  model or a trait gets no edge: false negative, consistent with "declared in that type itself".
- [`Studly` differs from Laravel for exotic names (digits, non-ASCII)] → at worst a missed accessor, never
  a wrong one, since the target must be declared.
- [The report depends on `CallFact.line`] → a wrong line is caught by the AC3 scenario, whose lines are
  fixed by the single-line inputs.
- [acme-shop counts (17 / 47 / `[]`) depend on every model directly extending `Model`] → pinned by the
  acme-shop scenarios.
- [Mutation gate covers `packages/core/src/**` only] → forced failures in tasks stand in for mutation
  on the analyzer.
