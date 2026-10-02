## What changes?

Replaces the empty `AnalyzerPort` stub with a real contract (`SourceFile`, `AnalyzerInput`,
`AnalyzerDiagnostic`, `AnalysisResult`), adds a language-independent `fileKindOf` /
`countLines` / `describeFile` rule in `packages/core`, and implements `@codemind/analyzer-php`
with `web-tree-sitter` over the `tree-sitter-php` WASM grammar: file classification and
class/interface/method/function symbols with exact spans and signatures, traits encoded as
`class`, anonymous classes yielding only their methods, and syntax errors reported as
`diagnostics` instead of exceptions. `edges` is always `[]` in this capability (DIS-49 fills it).

## Why?

<!-- filled in by the human: the business rationale is not yours to generate -->

## How to test it?

1. `npm ci` — confirm no native build step runs (`tree-sitter-php`'s `node-gyp-build` install
   script is skipped by the repo's `allowScripts` policy).
2. `npx vitest run tests/unit/knowledge/file-kind.spec.ts tests/unit/analyzers/php` — 23 tests
   green.
3. `npx vitest run` — full suite green (no `DATABASE_URL` needed for the new tests).
4. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage` —
   all green.
5. `npx stryker run` — `packages/core/src/knowledge/file-kind.ts` at 95.89 % mutation score
   (threshold 70 %).

## Decisions / trade-offs

- **`web-tree-sitter` (WASM) over native `tree-sitter`** — installability on Windows/CI without a
  C++ toolchain outweighs a theoretical native speed gain for this delivery's oracle (53 fixture
  files). Alternatives considered and the reversal criterion: `docs/adr/20261002-php-parser-web-tree-sitter.md`.
- **A trait is encoded as a `class` symbol** whose `signature` starts with `trait` — the schema
  has no `trait` kind, and this slice does not add one (non-goal). An anonymous class gets no
  `class` symbol at all (no stable name to cite); its methods keep their bare name. Same ADR.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:167` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:186` |
| Paths are classified by the canonical rule | `tests/unit/knowledge/file-kind.spec.ts:8` |
| The acme-shop files are classified | `tests/unit/analyzers/php/structure.spec.ts:42` |
| Line count of a file | `tests/unit/knowledge/file-kind.spec.ts:17` |
| A described file has no contentHash or redacted | `tests/unit/knowledge/file-kind.spec.ts:25` |
| PriceCalculator symbols have exact spans | `tests/unit/analyzers/php/structure.spec.ts:60` |
| Every named class of acme-shop is listed | `tests/unit/analyzers/php/structure.spec.ts:74` |
| Interfaces and top-level functions are listed, enums are not | `tests/unit/analyzers/php/structure.spec.ts:96` |
| A trait is encoded as a class | `tests/unit/analyzers/php/structure.spec.ts:121` |
| Anonymous classes yield only their methods | `tests/unit/analyzers/php/structure.spec.ts:132` |
| A syntax error does not stop the analysis | `tests/unit/analyzers/php/structure.spec.ts:149` |

## Origin

agent+human-review
