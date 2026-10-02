## Why

CODEMIND can persist a knowledge graph (`graph-store`) and read Git history (`git-history`), but
nothing turns source code into files and symbols: `AnalyzerPort` and `@codemind/analyzer-php` are
empty stubs. Every later explanation must cite real line ranges, and the domain must stay ignorant of
PHP. This is DIS-47 (CM-HU-04a.1), the first slice of the PHP/Laravel analyzer CM-HU-04a (DIS-37):
the port contract, a language-independent file classification in core, and a Tree-sitter parser that
lists files and symbols with exact spans. Edges come next (DIS-49), on top of this contract.

## What Changes

- **`AnalyzerPort` contract** in `packages/core/src/ports/AnalyzerPort.ts` (replaces the stub), in the
  style of `GitPort`: `analyze(input: AnalyzerInput): Promise<AnalysisResult>`, with
  `AnalyzerInput { files: SourceFile[] }`, `SourceFile { path, content }` and
  `AnalysisResult { files: GraphFile[]; symbols: GraphSymbol[]; edges: GraphEdge[]; diagnostics: AnalyzerDiagnostic[] }`.
  Reuses the `knowledge/` types; no parallel types. Exported from `ports/index.ts`.
- **`fileKindOf(path)`** in `packages/core/src/knowledge/file-kind.ts` (new): one canonical,
  language-independent rule (`test` → `doc` → `config` → `source`, first match wins) that already
  covers `task-api` so the TypeScript analyzer (CM-HU-18) does not touch core. Under Stryker.
- **PHP analyzer** in `packages/analyzers/php/src/` (`php-analyzer.ts`, `parser.ts`, `symbols.ts`;
  `index.ts` exports `createPhpAnalyzer(): AnalyzerPort`): parses `*.php` content with Tree-sitter and
  emits classes, interfaces, methods and functions with spans and signatures. Traits are encoded as
  `class` with a `signature` starting with `trait`; anonymous classes yield no class symbol, only
  their methods unprefixed. A syntax error becomes a `diagnostic`, never an exception. A symbol
  colliding with another on file, name and start line is dropped with a `diagnostic`, never renamed.
- **New dependency** `web-tree-sitter` plus the PHP grammar compiled to WASM, only in
  `@codemind/analyzer-php`. Native `tree-sitter` + `tree-sitter-php` is a documented fallback used
  only if WASM fails the acceptance scenarios.
- **Docs**: PH-22 exception in `docs/project-context.md` §Testing (fixtures are the analyzer's input;
  no test modifies them; expectations are built with factories); `docs/backend-standards.md` §1 entry
  for Tree-sitter via WASM; ADR of the dependency and the trait encoding via `/adr-new`, transcribing
  the author's rationale from the ticket.
- Tests: `tests/unit/knowledge/file-kind.spec.ts` and `tests/unit/analyzers/php/structure.spec.ts`
  (the 53 `fixtures/acme-shop` files as read-only input; edge cases with inline content).

## Non-goals

- No edges (`imports`, `extends`, `implements`, routes, `tested_by`, `describes`, `calls`): DIS-49 and
  CM-HU-04a.3. `result.edges` is always `[]`. No `route` symbols.
- No `contentHash`, no `redacted`, no disk reading, no persistence: CM-HU-05a via `StorePort`. The
  analyzer receives content, so it has no I/O surface and no path-traversal concern.
- Never executes or installs anything from the analysed repository (`artisan`, `composer`; PH-19).
- No new values in the schema enums (`SYMBOL_KINDS`, `FILE_KINDS`) and no migration.
- No TypeScript analyzer (CM-HU-18); the spike DIS-54 only validates this contract. This change is
  not closed in Linear until DIS-54 confirms the contract.
- No facades, container, `__call`, Eloquent attributes or string routes (CM-HU-04b).

## Privacy and logging impact

None on personal data: the analyzer reads source code of fictitious fixtures and never sees Git
identities. No logging: parse errors travel as `diagnostics` in the result; core never logs.

## Capabilities

### New Capabilities

- `code-analysis`: the `AnalyzerPort` contract (input, result, diagnostics, determinism), the
  language-independent file classification, and the PHP analyzer's file and symbol extraction with
  spans and signatures. DIS-49 will extend it with edges.

### Modified Capabilities

(none — `graph-schema` and `graph-store` already accept `GraphFile` and `GraphSymbol`; this change
produces them and its output must pass `validateGraph()`)

## Impact

- Code: `packages/core/src/ports/{AnalyzerPort,index}.ts`,
  `packages/core/src/knowledge/{file-kind,index}.ts` (new file + export),
  `packages/analyzers/php/src/*`, `packages/analyzers/php/{package.json,tsconfig.json}`.
- Dependencies: `web-tree-sitter` and a PHP WASM grammar (runtime, analyzer only); licence and
  existence checked before installing (base-standards). `npm ci` must stay clean on Windows without a
  C++ toolchain and in CI without native build steps.
- Architecture: `.dependency-cruiser.cjs` rules `core-no-infra`, `core-no-infra-packages`,
  `analyzers-are-siblings` must stay green.
- Tests: two new spec files; `vitest.config.ts` keeps excluding `fixtures/**`.
- Docs: `docs/project-context.md`, `docs/backend-standards.md`, new ADR under `docs/adr/`,
  `prompts.md`. Commands per `docs/project-context.md`.
