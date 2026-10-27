import type { AnalyzerDiagnostic, AnalyzerInput, AnalyzerPort, GraphEdge, GraphSymbol } from '@codemind/core';
import { describeFile, docMentionEdges, sortUniqueEdges } from '@codemind/core';
import { buildTypeScriptEdges, type ParsedFile } from './edges.js';
import {
  createInMemoryProgram,
  isCanonicalPath,
  isTypeScriptName,
  loadTypeScript,
  readCompilerOptions,
  syntaxDiagnostic,
  VIRTUAL_ROOT,
  type TypeScriptModule,
} from './program.js';
import { byPath, bySymbolOrder, keepFirst, uniqueInputs } from './shared.js';
import { extractSymbols } from './symbols.js';

/**
 * Creates the TypeScript `AnalyzerPort` (DIS-30): all the TypeScript files of a call are one program
 * over an in-memory host, with the `typescript` compiler loaded on the first call that needs it and
 * forgotten if that load fails (design D2, D3, D6). Nothing is read from the disk.
 */
export function createTypeScriptAnalyzer(): AnalyzerPort {
  let compilerPromise: Promise<TypeScriptModule> | undefined;
  // A rejected load is forgotten, so the next call loads the compiler again (it never poisons the instance).
  const getCompiler = (): Promise<TypeScriptModule> =>
    (compilerPromise ??= loadTypeScript().catch((error: unknown) => {
      compilerPromise = undefined;
      throw error;
    }));

  return {
    async analyze(input: AnalyzerInput) {
      const diagnostics: AnalyzerDiagnostic[] = [];
      const inputs = uniqueInputs(input.files, diagnostics);
      const files = inputs.map((file) => describeFile(file.path, file.content)).sort(byPath);
      const symbols: GraphSymbol[] = [];
      const edges: GraphEdge[] = [];

      const tsInputs = inputs.filter((file) => isTypeScriptName(file.path));
      const tsFiles = tsInputs.filter((file) => isCanonicalPath(file.path)).sort(byPath);
      for (const file of tsInputs) {
        if (!isCanonicalPath(file.path)) {
          diagnostics.push({ path: file.path, message: `non-canonical path "${file.path}"; not parsed` });
        }
      }

      if (tsFiles.length > 0) {
        const ts = await getCompiler();
        const options = readCompilerOptions(
          ts,
          inputs.find((file) => file.path === 'tsconfig.json'),
          diagnostics,
        );
        const built = createInMemoryProgram(ts, tsFiles, options);
        const parsed: ParsedFile[] = [];
        for (const file of tsFiles) {
          const sourceFile = built.program.getSourceFile(`${VIRTUAL_ROOT}/${file.path}`);
          if (!sourceFile) continue;
          const broken = syntaxDiagnostic(ts, built.program, sourceFile, file.path);
          if (broken) {
            diagnostics.push(broken);
            continue;
          }
          parsed.push({ path: file.path, sourceFile });
          symbols.push(...keepFirst(file.path, extractSymbols(ts, file.path, sourceFile), diagnostics));
        }
        symbols.sort(bySymbolOrder);
        const kindOf = new Map(files.map((described) => [described.path, described.kind]));
        edges.push(...buildTypeScriptEdges(ts, built, parsed, new Set(tsFiles.map((file) => file.path)), symbols, kindOf));
      }

      diagnostics.sort(byPath);
      return { files, symbols, edges: sortUniqueEdges([...edges, ...docMentionEdges(inputs, symbols)]), diagnostics };
    },
  };
}
