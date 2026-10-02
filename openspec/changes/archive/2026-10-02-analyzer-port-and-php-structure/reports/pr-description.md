## What changes?

Replaces the empty `AnalyzerPort` stub with a real contract (`SourceFile`, `AnalyzerInput`,
`AnalyzerDiagnostic`, `AnalysisResult`), adds a language-independent `fileKindOf` /
`countLines` / `describeFile` rule in `packages/core`, and implements `@codemind/analyzer-php`
with `web-tree-sitter` over the `tree-sitter-php` WASM grammar: file classification and
class/interface/method/function symbols with exact spans and signatures, traits encoded as
`class`, anonymous classes yielding only their methods (bare names, also when nested in a named
class), and syntax errors and duplicate symbols reported as `diagnostics` instead of exceptions.
`edges` is always `[]` in this capability (DIS-49 fills it).

After an adversarial review (FAIL), this PR also fixes `fileKindOf` matching the file name as a
directory (`bin/test`, `docs`), anonymous-class methods inheriting the outer class name, functions
declared inside methods being emitted, and symbols colliding on file, name and start line (keep the
first, one diagnostic per dropped symbol; design D9). A second adversarial review (PASS WITH GAPS)
added tests that pin the D9 key to the start line and prove the kept duplicate is the first one.

## Why?

Without this slice, CODEMIND still cannot turn repository source into a knowledge graph: the
port and the PHP analyzer were empty stubs, so later explanations would have nothing real to
cite. This change opens indexing of a Laravel codebase into files and symbols with exact line
spans, while keeping the domain ignorant of PHP, so every later claim can point at concrete
code instead of guessed paths—and so DIS-49 can hang edges on a stable contract rather than
reinventing one.

## How to test it?

1. `npm ci` — confirm no native build step runs (`tree-sitter-php`'s `node-gyp-build` install
   script is skipped by the repo's `allowScripts` policy).
2. `npx vitest run tests/unit/knowledge/file-kind.spec.ts tests/unit/analyzers/php` — 30 tests
   green (16 + 14).
3. `npx vitest run` — full suite green (no `DATABASE_URL` needed for the new tests).
4. `npm run lint && npm run typecheck && npm run lint:architecture && npm run docs:coverage` —
   all green (pre-existing warnings only).
5. `npx stryker run` — `packages/core/src/knowledge/file-kind.ts` at 96.00 % mutation score
   (threshold 70 %).

## Decisions / trade-offs

- **`web-tree-sitter` (WASM) over native `tree-sitter`** — installability on Windows/CI without a
  C++ toolchain outweighs a theoretical native speed gain for this delivery's oracle (53 fixture
  files). Alternatives considered and the reversal criterion: `docs/adr/20261002-php-parser-web-tree-sitter.md`.
- **A trait is encoded as a `class` symbol** whose `signature` starts with `trait` — the schema
  has no `trait` kind, and this slice does not add one (non-goal). An anonymous class gets no
  `class` symbol at all (no stable name to cite); its methods keep their bare name. Same ADR.
- **Duplicate symbols: keep the first, report the rest** (design D9) — bare anonymous-class method
  names can collide on one line, which graph validation rejects. The first in source order is kept;
  each later one is dropped with a diagnostic (`duplicate symbol "<name>"; kept the first`).
  Inventing a disambiguating name was rejected because it would leak into citations. As a result,
  `diagnostics` covers more than parse failures, and a file may have several.

## Traceability

| Scenario in the specification | Test that covers it |
|---|---|
| The acme-shop analysis is a valid deterministic graph | `tests/unit/analyzers/php/structure.spec.ts:263` |
| The analyzer reads only the content it receives | `tests/unit/analyzers/php/structure.spec.ts:282` |
| Paths are classified by the canonical rule | `tests/unit/knowledge/file-kind.spec.ts:8` |
| The acme-shop files are classified | `tests/unit/analyzers/php/structure.spec.ts:42` |
| Line count of a file | `tests/unit/knowledge/file-kind.spec.ts:17` |
| A described file has no contentHash or redacted | `tests/unit/knowledge/file-kind.spec.ts:25` |
| PriceCalculator symbols have exact spans | `tests/unit/analyzers/php/structure.spec.ts:60` |
| Symbol spans include modifiers and attributes | `tests/unit/analyzers/php/structure.spec.ts:74` |
| Every named class of acme-shop is listed | `tests/unit/analyzers/php/structure.spec.ts:107` |
| Interfaces and top-level functions are listed, enums are not | `tests/unit/analyzers/php/structure.spec.ts:129` |
| A trait is encoded as a class | `tests/unit/analyzers/php/structure.spec.ts:154` |
| Anonymous classes yield only their methods | `tests/unit/analyzers/php/structure.spec.ts:165` |
| Duplicate symbols are dropped with a diagnostic | `tests/unit/analyzers/php/structure.spec.ts:180` |
| A syntax error does not stop the analysis | `tests/unit/analyzers/php/structure.spec.ts:245` |

Every gap left by the adversarial reviews has a destination (`design.md` → Follow-ups): explicit
debt in DIS-96 (`Deuda: analyzer-port-and-php-structure`, also a checklist comment on DIS-47), path
format validation handed off to DIS-85, and the root-file `config` asymmetry accepted (design D2).

## Origin

agent+human-review

🤖 Generated with [Claude Code](https://claude.com/claude-code)
