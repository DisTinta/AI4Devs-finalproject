## Why

Codemind promises to index a TypeScript repository with the same core as the PHP one and to prove it
with an empty `git diff -- packages/core` (Linear DIS-20, CM-HU-18). Today
`@codemind/analyzer-typescript` is a stub (`export {}`), so `fixtures/task-api` produces no files,
symbols or edges. This change (Linear DIS-30, CM-HU-18.1) builds the structural half of that analyzer:
files, symbols with exact spans, and the edges the code declares. Calls (DIS-31) and the seed and
golden answers of task-api (DIS-32) build on it.

## What Changes

- `createTypeScriptAnalyzer()` in `packages/analyzers/typescript`, an `AnalyzerPort` that, for the
  content it receives and nothing else:
  - classifies every input file and counts its lines with the existing domain rule;
  - builds one in-memory TypeScript program from the `.ts` inputs (no `.d.ts`), reading the compiler
    options of the input's root `tsconfig.json` (never the disk, never its `extends`);
  - emits `class`, `interface`, `function` and `method` symbols (constructors as `Class::constructor`,
    interface method signatures as `Interface::method`) with the span of the declaration, modifiers
    and decorators included, JSDoc excluded, and the declaration header as signature;
  - emits `imports` edges file → file (relative and `paths` imports, `import type`, `export … from`,
    side-effect imports), `extends` and `implements` edges between class and interface symbols of the
    input, and `tested_by` edges file → file (a `<name>.test.ts` / `<name>.spec.ts` that imports
    `<name>.ts`), all `exact` with extractor `ts-compiler`, plus the shared `describes` edges;
  - reports a file with a syntax error as a diagnostic without stopping the call, and never reports
    type errors.
- `typescript` (`^5.5.0`, the root's range) becomes a runtime dependency of the analyzer package.
- No change to `packages/core`, to the PHP analyzer, to the CLI composition (DIS-32 wires
  `--language typescript`) or to the fixtures.

Out of scope (non-goals of DIS-30): `calls` edges, `new X()` and `super()` (DIS-31); wiring the
analyzer into the CLI, seed and golden answers of task-api (DIS-32); `.tsx`, `.js`, `.mts`, `.cts`
and `.d.ts` files, JSX, `require()`, dynamic `import()` and `import x = require()`; symbols for
`const`, `type`, `enum`, arrow functions, accessors and declarations inside `declare module`,
`declare global` or `namespace` blocks; type-error diagnostics; running or installing anything of
the analysed repository.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `code-analysis`: "Analysis contract" lists the TypeScript edge requirements; "Symbol extraction"
  scopes its `.php` rule to the PHP analyzer; new requirements for the TypeScript analyzer's input
  and compiler options, symbols, syntax errors, code relation edges and test coverage edges.

## Impact

- Code: `packages/analyzers/typescript/src/` (new `ts-analyzer.ts`, `program.ts`, `symbols.ts`,
  `edges.ts`; `index.ts` rewritten), its `package.json` (dependency) and `tsconfig.json` (project
  reference to core).
- Tests: new `tests/unit/analyzers/typescript/structure.spec.ts`, `edges.spec.ts` and
  `compiler-load.spec.ts`; no existing test changes.
- Dependencies: `typescript` already in the root `devDependencies`; `npm install` updates
  `package-lock.json`, followed by `npm audit --audit-level=high`.
- Docs: `docs/project-context.md` (what the TypeScript analyzer emits and its fixture-walk gotcha),
  TSDoc of the new exports.
- Privacy and security: no personal data; the analyzer does no I/O, opens no network connection and
  executes nothing of the analysed repository (`docs/project-context.md`, PH-19 and PH-22).
