# PHP parsing: `web-tree-sitter` (WASM) over native `tree-sitter`, and trait → `class` encoding

## Status
Accepted

## Context and problem
CODEMIND indexes PHP without a PHP interpreter (planning gate, question 3). The PHP analyzer lives in
`packages/analyzers/php` behind `AnalyzerPort` and must not drag installation friction into the rest
of the monorepo. The author develops on Windows; CI must install with `npm ci` with no special steps.
`AnalyzerPort.analyze` also needs an encoding for PHP constructs the knowledge-graph schema has no
kind for: a trait has no `trait` entry in `SYMBOL_KINDS`, and an anonymous class has no stable name a
citation could use. Decided by the author while planning DIS-47 (CM-HU-04a.1).

## Options considered

### Parser dependency
* `web-tree-sitter` (WASM) + the PHP grammar compiled to WASM (`tree-sitter-php`'s `.wasm` build).
* Native `tree-sitter` + `tree-sitter-php` bindings (`node-gyp-build`, prebuilt or compiled).
* `tree-sitter-wasms` (Unlicense, a bundle of grammars whose ABI must still match `web-tree-sitter`).
* A PHP interpreter, or regex-based extraction.

### Trait and anonymous-class encoding
* Encode a trait as a `class` symbol whose `signature` starts with `trait` (no schema change).
* Add a `trait` value to `SYMBOL_KINDS` (a migration, and a new case everywhere the schema is read).
* Invent a synthetic name for an anonymous class (e.g. `<anonymous>`, `class@line`).
* Give an anonymous class's methods a synthetic prefix instead of their bare name.

## Decision
We choose **`web-tree-sitter` (WASM) with the PHP grammar shipped by `tree-sitter-php`**, and **a
trait encoded as a `class` symbol, an anonymous class encoded as no symbol at all** (its methods keep
their bare name), because:

* **Installability of the critical path.** The CM-HU-04a planning already flags Tree-sitter's native
  bindings as the main risk on Windows/CI (`node-gyp` / MSVC). Choosing native first would turn a
  known risk into a blocker for the analyzer's very first story.
* **The contract is already asynchronous.** `analyze(...): Promise<...>` accommodates WASM's async
  initialisation without changing the port's shape or forcing a fake-sync native path.
* **The performance cost does not justify the risk.** This delivery's oracle is
  `fixtures/acme-shop` (53 files). Native vs. WASM is not the bottleneck against repository I/O,
  persistence or the LLM; the delivery fails if it does not install, not if it parses 20 ms slower.
* **Hexagonal isolation.** The dependency stays inside `@codemind/analyzer-php` only; `core` does not
  know the parsing engine. If native parsing is needed later, only the adapter changes, never
  `AnalyzerPort` or `file-kind`.
* **Explicit reversal criterion.** If WASM cannot parse what the acceptance scenarios require
  (traits, anonymous classes from migrations, `PriceCalculator`'s spans, diagnostics for broken
  syntax), the concrete failure is documented here and WASM is replaced by native. No dual stack "just
  in case".
* **A trait has no stable schema kind.** `SYMBOL_KINDS` is `class | interface | method | function |
  route`; adding `trait` is a migration this slice's scope explicitly excludes. A trait's own
  declaration header already starts with the word `trait`, so encoding it as `class` with that
  verbatim `signature` is lossless: nothing is hidden, and a reader or a later migration can always
  tell a trait apart from a real class by its `signature`.
* **An anonymous class has no name a citation could trust.** Inventing one (`<anonymous>`,
  `class@line`) would leak a fabricated identifier into citations that are supposed to be verifiable.
  Its methods keep their bare name; identity stays unique through `file + name + startLine`, the same
  triple every other symbol uses.

### Alternatives considered and rejected
* Native `tree-sitter` + `tree-sitter-php`: matches the prose of CM-HU-04a's acceptance criteria more
  literally and has a theoretically better runtime, but worse Windows/CI ergonomics. Rejected as the
  default; kept as the documented fallback only if WASM fails the parsing acceptance scenarios.
* `tree-sitter-wasms`: more surface for a single language (a bundle of every grammar) and still tied
  to the same `web-tree-sitter` ABI risk as the chosen option, with none of its benefit.
* A PHP interpreter: rejected by the non-goal "no PHP interpreter on `PATH` to index" (planning gate).
* Regex extraction: rejected — it cannot give reliable spans or an AST for traits, anonymous classes
  and interfaces that the acceptance scenarios require.
* A `trait` schema kind, or a synthetic anonymous-class name: rejected for the reasons above —
  respectively, an out-of-scope migration, and a fabricated identifier in a citation.

## Concrete findings (DIS-47 task 1, recorded for the reversal criterion)
* `npm view` confirmed both `web-tree-sitter` (0.27.0) and `tree-sitter-php` (0.24.2) exist on the
  registry and are MIT; `npm pack --dry-run` confirmed the `tree-sitter-php` tarball contains
  `tree-sitter-php.wasm`.
* `npm ci` from a clean `node_modules` installed cleanly on Windows: `tree-sitter-php`'s
  `node-gyp-build` install script (its native binding) was skipped by the repository's install-scripts
  policy, so no native compilation ran — the WASM path never touches it.
* A smoke parse (`Parser.init()` + `Language.load()` on `tree-sitter-php.wasm`, then parsing
  `fixtures/acme-shop/app/Services/PriceCalculator.php`) succeeded: `rootNode.type` was `program`,
  `rootNode.hasError` was `false`. No ABI mismatch between this `web-tree-sitter` version and the
  grammar; the native fallback was not needed.
* The full acceptance suite (E1–E5, `tests/unit/analyzers/php/structure.spec.ts`) passed against the
  real fixture and inline edge cases, confirming criterion 3 of the dependency's acceptance (`npm ci`
  clean, CI with no native build step, E1–E5 green).

## Consequences
* `@codemind/analyzer-php` depends on `web-tree-sitter` and `tree-sitter-php` (WASM grammar only);
  `web-tree-sitter` is the only module of the package that imports it (`parser.ts`).
* `docs/backend-standards.md` §1 records "Tree-sitter via WASM … only inside
  `packages/analyzers/php`, behind `AnalyzerPort`", the same pattern as `simple-git` for the Git
  adapter.
* A trait symbol's `kind` is `class`, distinguishable only by its `signature` starting with `trait`;
  any future reader (including a later TypeScript analyzer, CM-HU-18) must know this convention until
  a dedicated HU adds a schema `trait` kind, if one is ever needed.
* An anonymous class contributes no `class` symbol to the graph — only its methods, unprefixed. A
  consumer that wants "every class of the project" must additionally special-case traits (by
  `signature`) and accept that anonymous classes are invisible as classes, only as loose methods.
* Accepted risk, explicitly bounded: if a future PHP version or grammar update breaks this
  `web-tree-sitter` / `tree-sitter-php.wasm` pairing, the fallback is native `tree-sitter` +
  `tree-sitter-php`, behind the same `parser.ts` module — no other file changes.
