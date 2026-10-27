import type { FileKind, GraphEdge, SymbolRef } from '@codemind/core';
import type * as TS from 'typescript';
import { VIRTUAL_ROOT, type InMemoryProgram, type TypeScriptModule } from './program.js';
import { isSkippedDeclaration } from './symbols.js';

/** `extractor` of every edge this analyzer emits itself (the `describes` edges keep `doc-mention`). */
export const TS_COMPILER_EXTRACTOR = 'ts-compiler';

/** One TypeScript file parsed without a syntax error. */
export interface ParsedFile {
  path: string;
  sourceFile: TS.SourceFile;
}

/** Declaration node → the symbol emitted for it (only symbols kept after duplicates; DIS-31, design D2). */
export type SymbolOf = ReadonlyMap<TS.Node, SymbolRef>;

/** Path prefix of the files of the in-memory program. */
const ROOT_PREFIX = `${VIRTUAL_ROOT}/`;

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** `<base>` of a `<base>.test.ts` / `<base>.spec.ts` file name, else `undefined`. */
function testBase(path: string): string | undefined {
  const match = /^(.+)\.(?:test|spec)\.ts$/.exec(baseName(path));
  return match?.[1];
}

/**
 * The code relation and test coverage edges of the TypeScript files of one call (DIS-30, design D5):
 * file → file `imports`, class / interface → class / interface `extends` and `implements`, and file →
 * file `tested_by`. Only files parsed without a syntax error originate an edge; every edge is `exact`.
 *
 * @param ts The compiler namespace.
 * @param built The program of the call and the host that serves it.
 * @param parsed The TypeScript files without a syntax error, in path order.
 * @param inputPaths Every TypeScript file of the program, syntax errors included.
 * @param symbolOf Declaration node → emitted symbol, after duplicates were dropped (DIS-31, design D2:
 *   a declaration dropped as a duplicate is no edge endpoint, review R1 of DIS-30).
 * @param kindOf The `kind` of every input file by path.
 */
export function buildTypeScriptEdges(
  ts: TypeScriptModule,
  built: InMemoryProgram,
  parsed: ParsedFile[],
  inputPaths: ReadonlySet<string>,
  symbolOf: SymbolOf,
  kindOf: ReadonlyMap<string, FileKind>,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const edge = (kind: GraphEdge['kind'], source: GraphEdge['source'], target: GraphEdge['target']): void => {
    edges.push({ source, target, kind, resolution: 'exact', extractor: TS_COMPILER_EXTRACTOR });
  };

  // imports: one file → file edge per pair, never a self-edge.
  const imported = new Map<string, Set<string>>();
  for (const { path, sourceFile } of parsed) {
    const targets = new Set<string>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const resolved = ts.resolveModuleName(specifier.text, `${ROOT_PREFIX}${path}`, built.options, built.host).resolvedModule;
      if (!resolved?.resolvedFileName.startsWith(ROOT_PREFIX)) continue;
      const target = resolved.resolvedFileName.slice(ROOT_PREFIX.length);
      if (target !== path && inputPaths.has(target)) targets.add(target);
    }
    imported.set(path, targets);
    for (const target of targets) edge('imports', { file: path }, { file: target });
  }

  // extends / implements: the checker resolves each heritage name, aliases followed.
  let checker: TS.TypeChecker | undefined;
  const targetOf = (expression: TS.Expression): SymbolRef | undefined => {
    if (!ts.isIdentifier(expression) && !ts.isPropertyAccessExpression(expression)) return undefined;
    checker ??= built.program.getTypeChecker();
    let found = checker.getSymbolAtLocation(expression);
    while (found && found.flags & ts.SymbolFlags.Alias) found = checker.getAliasedSymbol(found);
    const declarations = found?.declarations;
    const declaration = declarations?.length === 1 ? declarations[0] : undefined;
    if (!declaration || !(ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration))) return undefined;
    return symbolOf.get(declaration);
  };
  for (const { sourceFile } of parsed) {
    const walk = (node: TS.Node): void => {
      if (isSkippedDeclaration(ts, node)) return;
      if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
        const source = symbolOf.get(node);
        if (source) {
          for (const clause of node.heritageClauses ?? []) {
            const kind = clause.token === ts.SyntaxKind.ImplementsKeyword ? 'implements' : 'extends';
            for (const type of clause.types) {
              const target = targetOf(type.expression);
              if (target) edge(kind, { symbol: source }, { symbol: target });
            }
          }
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
  }

  // tested_by: a test file and the file of the same base name that it imports.
  const parsedPaths = new Set(parsed.map((file) => file.path));
  for (const [testPath, targets] of imported) {
    const base = testBase(testPath);
    if (base === undefined || kindOf.get(testPath) !== 'test') continue;
    for (const subject of targets) {
      if (kindOf.get(subject) === 'test' || !parsedPaths.has(subject) || baseName(subject) !== `${base}.ts`) continue;
      edge('tested_by', { file: subject }, { file: testPath });
    }
  }

  return edges;
}
