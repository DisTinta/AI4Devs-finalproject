// @codemind/analyzer-typescript — TypeScript compiler API (DIS-30)

/**
 * The TypeScript `AnalyzerPort` factory (DIS-30, design D6): files, symbols, `imports` / `extends` /
 * `implements` / `tested_by` edges and doc-mention edges over an in-memory program, no I/O.
 */
export { createTypeScriptAnalyzer } from './ts-analyzer.js';

/** `extractor` of the `imports`, `extends`, `implements` and `tested_by` edges (design D5). */
export { TS_COMPILER_EXTRACTOR } from './edges.js';
