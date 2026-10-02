## Context

See `proposal.md` → Why. Current state that shapes the approach:

- `packages/core/src/ports/AnalyzerPort.ts` is an empty interface with a `TODO`, already exported as
  a type from `ports/index.ts`. `packages/analyzers/php/src/index.ts` is `export {}`;
  `@codemind/analyzer-php` depends only on `@codemind/core` and its `tsconfig.json` has no
  `references` to core (`packages/adapters/git/tsconfig.json` has one since DIS-35: the pattern).
- `GraphFile`, `GraphSymbol`, `GraphEdge`, `KnowledgeGraph` and `validateGraph()` exist in
  `packages/core/src/knowledge/`. `SYMBOL_KINDS` has no `trait` or `enum`; `FILE_KINDS` is
  `source | test | doc | config`. Neither changes here (no migration).
- `fixtures/acme-shop/` has 53 tracked files. Its `.git` directory is gitignored and is rebuilt by the
  git integration spec, so a directory walk over the fixture MUST skip `.git`. 35 named classes,
  1 trait, 5 anonymous classes (migrations, each with a closure passed to `Schema::create`), 0
  interfaces, 0 top-level functions; `artisan` is PHP without the `.php` extension.
- Stryker mutates only `packages/core/src/**`. Vitest aliases `@codemind/core` to its sources and
  excludes `fixtures/**` from collection; tests import non-core packages by relative path
  (`tests/integration/git/simple-git-history.spec.ts`).
- npm registry, checked 2026-10-02: `web-tree-sitter` 0.27.0 (MIT); `tree-sitter-php` 0.24.2 (MIT)
  ships `tree-sitter-php.wasm` and `tree-sitter-php_only.wasm` in its tarball, plus native prebuilds
  for win32/linux/darwin (x64, arm64) behind an `install: node-gyp-build` script and an **optional**
  peer `tree-sitter`.

## Goals / Non-Goals

**Goals:**

- A contract that the TypeScript analyzer (CM-HU-18) can implement without touching core, and whose
  result DIS-85 can spread into a `KnowledgeGraph` without mapping.
- File kind and line count as pure core rules, mutation-tested, shared by every analyzer.
- A PHP analyzer with no I/O over the analysed repository and no native build step.

**Non-Goals (design level):**

- No parallel or incremental parsing: each file is parsed once, sequentially; fine for 53 files.
- No query files (`.scm`): a hand-written tree walk over a handful of node types is enough and is
  easier to test; queries can come with the edge extraction if they pay off.

## Decisions

### D1 — Contract in core, result reuses the graph types

```ts
export interface SourceFile { path: string; content: string }
export interface AnalyzerInput { files: SourceFile[] }
export interface AnalyzerDiagnostic { path: string; message: string; line?: number }
export interface AnalysisResult {
  files: GraphFile[];
  symbols: GraphSymbol[];
  edges: GraphEdge[];
  diagnostics: AnalyzerDiagnostic[];
}
export interface AnalyzerPort {
  analyze(input: AnalyzerInput): Promise<AnalysisResult>;
}
```

All five types live in `ports/AnalyzerPort.ts` (like `GitHistory` next to `GitPort`) and are exported
from `ports/index.ts`. `Promise` because the WASM runtime initialises asynchronously; a native
implementation would satisfy it too. `analyze` never rejects on bad source: parse failures are data
(`diagnostics`). It MAY reject only on an internal failure (the grammar cannot be loaded), with the
underlying error.

*Alternative:* `analyze(repoPath)` reading the disk itself. Rejected: it gives the analyzer an I/O
and path-traversal surface that belongs to CM-HU-05a (`ALLOWED_REPOS_DIR`), and makes tests depend on
the file system.

### D2 — `describeFile` in core: kind (rule D1 of the ticket) and line count

`packages/core/src/knowledge/file-kind.ts` exports:

- `fileKindOf(path): FileKind` — the canonical rule of the spec, implemented as an ordered list of
  four predicates over the `/`-split segments and the file name; first match wins. Directory-segment
  checks (`tests`, `docs`) look at every segment except the file name; `config` looks at the first
  segment only.
- `countLines(content): number` — `0` for `''`; otherwise the number of `\n`, plus one if the content
  does not end in `\n`. `\r\n` needs no special case (it contains one `\n`).
- `describeFile(path, content): GraphFile` — `{ path, kind: fileKindOf(path), loc: countLines(content) }`.

Every analyzer builds its `files` with `describeFile`, so the classification cannot drift between
languages (PH-28). The ticket's `task-api` cases (`*.test.ts`, `src/config/env.ts`) are in the unit
test from day one.

### D3 — Trait encoded as `class`, anonymous class has no symbol

Decided in the ticket (D2/D3), recorded in the spec and the ADR:

- A trait is a `class` symbol whose `signature` starts with `trait`; consumers that care can tell it
  apart by the signature until a future story adds a `trait` kind (enum + migration).
- An anonymous class has no stable name; inventing one (`<anonymous>`, `class@line`) would leak into
  citations. Its methods keep their bare name; identity stays unique through `file + name + startLine`.
- Enums are skipped with their methods (spec): no kind to encode them, no fixture to test them.

### D4 — `web-tree-sitter` + the WASM grammar shipped by `tree-sitter-php`

Dependencies of `@codemind/analyzer-php` only: `web-tree-sitter` (runtime) and `tree-sitter-php`
(used **only** for its `tree-sitter-php.wasm`; its native binding is never imported). The full PHP
grammar (`tree-sitter-php.wasm`, PHP embedded in text) is used rather than `php_only`, so content
before `<?php` parses. The WASM path is resolved with `createRequire(import.meta.url).resolve(...)`;
if the package's `exports` forbid that subpath, resolve its `package.json` and join the file name.

`tree-sitter-php`'s `install` script (`node-gyp-build`) finds a prebuild for win32-x64 and linux-x64
and compiles nothing; the optional peer `tree-sitter` is not installed. Task 1 checks the ticket's
three acceptance criteria for the dependency: `npm ci` clean on Windows without a C++ toolchain, CI
without native build steps, and a smoke parse; scenarios E1–E5 close criterion 3.

*Alternatives:* native `tree-sitter` + `tree-sitter-php` (fallback only if WASM fails E1–E5, with the
concrete failure recorded in the ADR; no dual stack); `tree-sitter-wasms` (Unlicense, a bundle of
grammars whose ABI must match `web-tree-sitter`; more surface for one language); a PHP interpreter
(PH-19) or regexes (no reliable spans). Rationale: the author's ADR D4 text in DIS-47, transcribed
verbatim by `/adr-new`.

### D5 — Analyzer structure inside `packages/analyzers/php/src/`

- `parser.ts` — `loadPhpParser(): Promise<PhpParser>`: `Parser.init()` and `Language.load(wasm)`
  once; returns a small wrapper `parse(content) → Tree`. Only file that imports `web-tree-sitter`.
- `symbols.ts` — `extractSymbols(path, root): GraphSymbol[]`: recursive walk with the enclosing type
  name as context. Node types: `class_declaration`, `interface_declaration`, `trait_declaration`
  (→ `class`), `enum_declaration` (skipped with its subtree), `anonymous_class` (no symbol, methods
  bare), `method_declaration`, `function_definition` outside a type (→ `function`);
  `anonymous_function` / `arrow_function` produce nothing (their bodies are still walked, so a class
  inside a closure is found). Span = node rows + 1; doc comments are sibling `comment` nodes, so they
  are outside the span by construction, and `attribute_list` is a child, so it is inside. Signature
  = source from the node start to the start of its `body` field (or the node end minus a trailing
  `;`), whitespace collapsed. Exact node and field names are confirmed against the grammar's
  `node-types.json` in task 4.1.
- `php-analyzer.ts` — `createPhpAnalyzer(): AnalyzerPort`: memoises the `loadPhpParser()` promise
  per instance; for each input file `describeFile`; only `.php` paths are parsed; `rootNode.hasError`
  → one diagnostic (`line` = first `ERROR` or missing node row + 1, `message` naming it), no symbols;
  every tree is `delete()`d after use; final sort (D6). `edges: []`.
- `index.ts` — re-exports `createPhpAnalyzer`.

No module of this package imports another analyzer (`analyzers-are-siblings`).

### D6 — Determinism by explicit sort

`files` sorted by `path`; `symbols` by `file`, `startLine`, `endLine` descending (enclosing first
when two symbols start on one line, e.g. `interface Payable { public function pay(): void; }`), then
`name`. Comparison with `<`/`>` on strings (UTF-16 code units), never `localeCompare`. Input order
therefore never leaks into the output.

### D7 — Tests and the PH-22 exception

- `tests/unit/knowledge/file-kind.spec.ts` — scenarios "Paths are classified by the canonical rule"
  and "Line count of a file", plus boundary cases (`__tests__`, `*.spec.*`, `.github/x.yml`,
  `src/docs.ts` is `source`, `vite.config.ts` is `config`). Stryker ≥ 70 % on `file-kind.ts`.
- `tests/unit/analyzers/php/structure.spec.ts` — reads `fixtures/acme-shop` with `node:fs`
  (recursive walk, `.git` skipped, paths relative with `/`), imports the analyzer by relative path,
  never writes to the fixture. Inline contents for E4/E5 built in the test. One test per scenario,
  named exactly after it. The parser load is shared through one analyzer in `beforeAll`.
- PH-22 line in `docs/project-context.md` §Testing: fixtures are the analyzer's input, no test
  modifies them, expectations are built with factories (backend-standards §7 still holds for
  everything else).

### D8 — ADR

One ADR via `/adr-new` (`docs/adr/2026XXXX-php-parser-web-tree-sitter.md`): choice of WASM over
native, the revert criterion, and the trait → `class` encoding. Context, decision, why, alternatives
and consequences are transcribed from the "ADR D4 — razonamiento de la autora" section of DIS-47
(wording may be adjusted, content not), in English per base-standards.

## Risks / Trade-offs

- [The PHP WASM grammar's ABI does not match `web-tree-sitter` 0.27] → task 1.2 smoke-parses
  `PriceCalculator.php` right after install; if it fails, pin `web-tree-sitter` to the version
  `tree-sitter-php` 0.24 was generated with, then the native fallback (ADR).
- [`node-gyp-build` finds no prebuild on some platform and tries to compile] → win32-x64 and
  linux-x64 prebuilds exist; record in the ADR that another platform may need a toolchain or
  `--ignore-scripts` (the binding is unused).
- [Tree-sitter recovers from errors, so a broken file could still yield partial symbols] → any
  `hasError` discards all symbols of that file (spec), at the cost of losing valid symbols of a file
  with one typo.
- [~30 MB unpacked for `tree-sitter-php`, mostly unused prebuilds] → accepted; dev-machine and CI
  cache cost only. Revisit if image size matters (CM-HU deployment).
- [WASM memory leaks if trees are not deleted] → `tree.delete()` in a `finally` per file.
- [Fixture `.git` or stray untracked files change the walk] → walk skips `.git`; the E1 test asserts
  53 entries, so an extra file fails loudly.

## Migration Plan

None: no schema change, no data. Rollback = revert the commits; nothing persists analyzer output yet.

## Open Questions

- Exact message text of syntax diagnostics (`Syntax error near …`) — not asserted by the spec beyond
  non-empty; settle during implementation.
