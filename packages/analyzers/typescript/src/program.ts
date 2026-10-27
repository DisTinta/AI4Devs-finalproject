import type { AnalyzerDiagnostic, SourceFile } from '@codemind/core';
import type * as TS from 'typescript';

/** The `typescript` compiler namespace, as returned by {@link loadTypeScript}. */
export type TypeScriptModule = typeof TS;

/** Virtual directory under which every TypeScript input is served to the compiler (design D2). */
export const VIRTUAL_ROOT = '/repo';

/**
 * Loads the TypeScript compiler (design D3). Kept apart from the analyzer so that a test can make the
 * first load fail; the analyzer calls the function imported from this module, so a mock applies.
 */
export async function loadTypeScript(): Promise<TypeScriptModule> {
  const loaded = (await import('typescript')) as unknown as { default?: TypeScriptModule } & TypeScriptModule;
  return loaded.default ?? loaded;
}

/**
 * Whether `path` has a TypeScript file name: it ends in `.ts` but not in `.d.ts`. A TypeScript file of
 * the spec "TypeScript analysis input" also needs a canonical path ({@link isCanonicalPath}).
 */
export function isTypeScriptName(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.d.ts');
}

/**
 * Whether `path` is canonical: one or more non-empty segments separated by `/`, none of them `.` or
 * `..`, with no `\` and no leading `/`.
 */
export function isCanonicalPath(path: string): boolean {
  if (path.includes('\\')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lineAt = (content: string, position: number): number => content.slice(0, position).split('\n').length;

/**
 * The compiler options of one call (design D2): the defaults, then the `compilerOptions` of the input
 * `tsconfig.json`, then the options that keep the standard library and `@types` out. `extends`,
 * `references`, `files`, `include` and `exclude` are never read. A `tsconfig.json` the compiler cannot
 * read, or whose root is not an object, is ignored entirely with one diagnostic.
 */
export function readCompilerOptions(
  ts: TypeScriptModule,
  tsconfig: SourceFile | undefined,
  diagnostics: AnalyzerDiagnostic[],
): TS.CompilerOptions {
  let fromInput: TS.CompilerOptions = {};
  if (tsconfig) {
    const parsed = ts.parseConfigFileTextToJson('tsconfig.json', tsconfig.content);
    if (parsed.error || !isPlainObject(parsed.config)) {
      const error = parsed.error;
      diagnostics.push({
        path: tsconfig.path,
        message: error ? ts.flattenDiagnosticMessageText(error.messageText, ' ') : 'tsconfig.json root must be an object',
        ...(error?.start === undefined ? {} : { line: lineAt(tsconfig.content, error.start) }),
      });
    } else {
      const compilerOptions: unknown = parsed.config.compilerOptions;
      if (isPlainObject(compilerOptions)) {
        fromInput = ts.convertCompilerOptionsFromJson(compilerOptions, VIRTUAL_ROOT).options;
      }
    }
  }
  return {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    ...fromInput,
    noEmit: true,
    noLib: true,
    types: [],
    allowJs: false,
    noResolve: false,
  };
}

/** One in-memory program over the TypeScript files of a call, with the host that serves it. */
export interface InMemoryProgram {
  program: TS.Program;
  host: TS.CompilerHost;
  options: TS.CompilerOptions;
}

/**
 * Builds one program over `files` served as `/repo/<path>` by an in-memory host: nothing is read from
 * the disk, the standard library does not exist and `tsconfig.json` is never served (design D2).
 */
export function createInMemoryProgram(ts: TypeScriptModule, files: SourceFile[], options: TS.CompilerOptions): InMemoryProgram {
  const contents = new Map<string, string>();
  const directories = new Set<string>([VIRTUAL_ROOT, '/']);
  for (const file of files) {
    const full = `${VIRTUAL_ROOT}/${file.path}`;
    contents.set(full, file.content);
    for (let slash = full.lastIndexOf('/'); slash > 0; slash = full.lastIndexOf('/', slash - 1)) {
      directories.add(full.slice(0, slash));
    }
  }
  const sourceFiles = new Map<string, TS.SourceFile>();
  const host: TS.CompilerHost = {
    fileExists: (fileName) => contents.has(fileName),
    readFile: (fileName) => contents.get(fileName),
    directoryExists: (directory) => directories.has(directory),
    getDirectories: () => [],
    getSourceFile: (fileName, languageVersionOrOptions) => {
      const cached = sourceFiles.get(fileName);
      if (cached) return cached;
      const content = contents.get(fileName);
      if (content === undefined) return undefined;
      const created = ts.createSourceFile(fileName, content, languageVersionOrOptions, true);
      sourceFiles.set(fileName, created);
      return created;
    },
    getDefaultLibFileName: () => `${VIRTUAL_ROOT}/__no_standard_library__.d.ts`,
    writeFile: () => undefined,
    getCurrentDirectory: () => VIRTUAL_ROOT,
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram({
    rootNames: files.map((file) => `${VIRTUAL_ROOT}/${file.path}`),
    options,
    host,
  });
  return { program, host, options };
}

/** The diagnostic of the first syntax error of `sourceFile` (1-based line), or `undefined` when it has none. */
export function syntaxDiagnostic(
  ts: TypeScriptModule,
  program: TS.Program,
  sourceFile: TS.SourceFile,
  path: string,
): AnalyzerDiagnostic | undefined {
  const first = program.getSyntacticDiagnostics(sourceFile)[0];
  if (!first) return undefined;
  const line = first.start === undefined ? 1 : sourceFile.getLineAndCharacterOfPosition(first.start).line + 1;
  return { path, message: ts.flattenDiagnosticMessageText(first.messageText, ' '), line };
}
