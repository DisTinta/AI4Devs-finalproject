## Why

`AnalyzerPort` (DIS-47) turns PHP content into files and symbols, but `edges` is always `[]`. The
graph cannot yet answer what imports, extends or implements a class, which route reaches a
controller action, which test covers a class, or which document talks about it. Impact analysis
(CM-HU-16a/16b) and evidence retrieval need those relations. This is DIS-49 (CM-HU-04a.2), the
second slice of the PHP/Laravel analyzer CM-HU-04a (DIS-37): the edges the code declares, plus the
`tested_by` and `describes` conventions. Body calls come next (DIS-52, CM-HU-04a.3).

## What Changes

- **Name resolution per PHP file** (namespace + `use` imports, aliases, group imports, qualified and
  fully-qualified names) to the fully-qualified name of a class, interface or trait declared in the
  same input. A name that does not resolve to exactly one symbol of the input yields no edge: no
  phantom nodes for vendor classes, never a guess by short name.
- **Code edges**, `resolution: 'exact'`, `extractor: 'php-treesitter-laravel'`:
  - `imports`: file → class/interface/trait symbol, one per top-level `use` that resolves;
  - `extends`: class → class, interface → interface;
  - `implements`: class → interface.
- **Array-action routes**: a new `route` symbol (kind already in `SYMBOL_KINDS`) per top-level
  `Route::<verb>('<uri>', [X::class, '<method>'])` statement, named `<VERB> <uri>` (e.g.
  `GET /orders/{order}`), and a `calls` `exact` edge from the route to the method `X::<method>` when
  it is in the input. This is site 11 of `fixtures/README.md`; DIS-52 keeps it only as a regression.
- **`tested_by`**, `exact`: class `X` → test class `XTest`, when `XTest` is declared in a `test` file
  that references `X` by a name resolving to `X`'s fully-qualified name.
- **`describes`**, `heuristic`: doc file → symbol, when a `doc` file names the symbol inside an
  inline code span or a fenced code block, as a whole, case-sensitive identifier (`Class` or
  `Class::method`); a name with more than one candidate symbol yields no edge. The rule is pure and
  language-independent, in `packages/core/src/knowledge/doc-mentions.ts`, so the TypeScript analyzer
  (DIS-30) reuses it without touching core.
- **Deterministic edge order** in `AnalysisResult.edges`, no duplicate edges, and every edge
  endpoint present in `files`/`symbols` (the result keeps passing `validateGraph`).
- `AnalyzerPort` signature unchanged; only the `edges` JSDoc changes.

## Non-goals

- Calls inside method bodies (DIS-52).
- String routes `Controller@method`, closures, `Route::resource`, route groups and prefixes,
  invokable controllers, routes not at the top level of a file (CM-HU-04b).
- Trait use inside a class (`use T;`): there is no edge kind for it. `use function` / `use const`.
- Files declaring more than one namespace: no name-based edge from them (accepted limitation).
- An action inherited from a parent controller (only methods declared in `X` are targets).
- `describes` by prose, semantic similarity, embeddings or path; doc staleness (CM-HU-16b).
  `docs/pricing.md` names no symbol in code, so it gets no `describes` edge: the AC of DIS-94 that
  assumes one is corrected there (signed decision, destination B). Fixtures are not modified.
- Persistence (DIS-85), TypeScript analyzer (DIS-30). No schema enum changes, no migration, no new
  dependency. Never executes or installs anything from the analysed repository (PH-19).

## Privacy and logging impact

None: fictitious fixture source and docs only, no identities, no logging. Doc content is untrusted
text: it is tokenised, never evaluated, and no regular expression is built from its content or from
symbol names.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-analysis`: the analysis contract now emits edges (ordering, uniqueness, extractors); symbol
  extraction adds `route` symbols; the acme-shop classification scenario no longer says
  `routes/api.php` has no symbols; new requirements for PHP name resolution, code edges, array-action
  routes, `tested_by` and `describes`.

## Impact

- Code: `packages/core/src/ports/AnalyzerPort.ts` (JSDoc), `packages/core/src/knowledge/doc-mentions.ts`
  and `edge-order.ts` (new) + `knowledge/index.ts` exports; `packages/analyzers/php/src/` — `edges.ts`, `routes.ts`,
  `names.ts` (new), `php-analyzer.ts` (composition and edge order).
- Tests: `tests/unit/analyzers/php/edges.spec.ts`, `tests/unit/knowledge/doc-mentions.spec.ts` (new);
  `tests/unit/analyzers/php/structure.spec.ts` updated only where the MODIFIED scenarios change;
  `readFixtureFiles` moved to `tests/support/read-fixture-files.ts`. Fixtures are read-only (PH-22).
- Mutation: `doc-mentions.ts` and `edge-order.ts` fall under Stryker (`packages/core/src`), threshold 70.
- Architecture: `core-no-infra`, `analyzers-are-siblings` stay green.
- Docs: `docs/project-context.md` gotcha (edges emitted, resolution rules, `pricing.md`), TypeDoc of
  new exports, `prompts.md`. Linear: DIS-52 and DIS-94 already carry the hand-off comments.
