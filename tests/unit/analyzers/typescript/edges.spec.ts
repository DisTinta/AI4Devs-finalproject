import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisResult, EdgeKind, GraphEdge, SourceFile, SymbolRef } from '@codemind/core';
import { createTypeScriptAnalyzer } from '../../../../packages/analyzers/typescript/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/changes/ts-analyzer-structure/specs/code-analysis/spec.md → "TypeScript code
// relation edges" and "TypeScript test coverage edges". Each `it` is one scenario, named after it.
// `fixtures/task-api` is read-only input here, without its untracked files (PH-22, design D8).

const TASK_API = resolve('fixtures/task-api');
const EXTRACTOR = 'ts-compiler';

function file(path: string, content: string): SourceFile {
  return { path, content };
}

describe('typescript analyzer edges', () => {
  const analyzer = createTypeScriptAnalyzer();
  let taskApi: AnalysisResult;

  beforeAll(async () => {
    const files = readFixtureFiles(TASK_API, ['.git', 'node_modules']).filter((f) => f.path !== 'package-lock.json');
    taskApi = await analyzer.analyze({ files });
  });

  const analyse = (files: SourceFile[]): Promise<AnalysisResult> => analyzer.analyze({ files });

  const ref = (result: AnalysisResult, path: string, name: string): SymbolRef => {
    const symbol = result.symbols.find((s) => s.file === path && s.name === name);
    if (!symbol) throw new Error(`symbol not found: ${path} ${name}`);
    return { file: symbol.file, name: symbol.name, startLine: symbol.startLine };
  };

  const fileEdge = (kind: EdgeKind, source: string, target: string): GraphEdge => ({
    source: { file: source },
    target: { file: target },
    kind,
    resolution: 'exact',
    extractor: EXTRACTOR,
  });

  const symbolEdge = (result: AnalysisResult, kind: EdgeKind, source: [string, string], target: [string, string]): GraphEdge => ({
    source: { symbol: ref(result, ...source) },
    target: { symbol: ref(result, ...target) },
    kind,
    resolution: 'exact',
    extractor: EXTRACTOR,
  });

  const ofKind = (result: AnalysisResult, kind: EdgeKind): GraphEdge[] => result.edges.filter((e) => e.kind === kind);

  describe('code relation edges', () => {
    it('The structural edges of task-api', () => {
      const errors = 'src/domain/errors.ts';
      expect(ofKind(taskApi, 'extends')).toEqual([
        symbolEdge(taskApi, 'extends', [errors, 'IllegalStatusTransitionError'], [errors, 'DomainError']),
        symbolEdge(taskApi, 'extends', [errors, 'TaskNotFoundError'], [errors, 'DomainError']),
      ]);
      expect(ofKind(taskApi, 'implements')).toEqual([
        symbolEdge(
          taskApi,
          'implements',
          ['src/repositories/in-memory-task.repository.ts', 'InMemoryTaskRepository'],
          ['src/repositories/task.repository.ts', 'TaskRepository'],
        ),
      ]);

      const imports = ofKind(taskApi, 'imports');
      expect(imports).toHaveLength(54);
      for (const edge of imports) {
        expect(edge.source.file).toBeDefined();
        expect(edge.target.file).toBeDefined();
      }
      expect(imports).toContainEqual(fileEdge('imports', 'src/schemas/index.ts', 'src/schemas/task.schema.ts'));
      expect(imports).toContainEqual(fileEdge('imports', 'src/types/index.ts', 'src/repositories/task.repository.ts'));
      expect(
        imports.filter((e) => e.source.file === 'src/repositories/in-memory-task.repository.ts' && e.target.file === 'src/domain/pagination.ts'),
      ).toHaveLength(1);
      const packages = ['fastify', 'zod', 'vitest', 'node:crypto'];
      for (const edge of imports) expect(packages.some((p) => (edge.target.file ?? '').includes(p))).toBe(false);

      for (const edge of taskApi.edges.filter((e) => e.kind !== 'describes')) {
        expect(edge.resolution).toBe('exact');
        expect(edge.extractor).toBe(EXTRACTOR);
      }
      const describes = ofKind(taskApi, 'describes');
      expect(describes).toHaveLength(2);
      expect(describes.map((e) => `${e.source.file} ${e.target.symbol?.name}`).sort()).toEqual([
        'README.md TaskRepository',
        'README.md TaskService',
      ]);
      for (const edge of describes) {
        expect(edge.resolution).toBe('heuristic');
        expect(edge.extractor).toBe('doc-mention');
      }
    });

    it('Inheritance follows aliases and namespace imports', async () => {
      const result = await analyse([
        file('src/base.ts', 'export class Base {}\nexport interface Named {}\nexport interface Aged {}\n'),
        file(
          'src/kid.ts',
          "import { Base as B } from './base.js';\nimport * as m from './base.js';\nimport type { Named } from './base.js';\nexport class Kid extends B implements Named, m.Aged {}\nexport interface Both extends Named, m.Aged {}\nexport const Anon = class extends B {};\n",
        ),
      ]);
      const kid = 'src/kid.ts';
      const base = 'src/base.ts';
      expect(result.edges).toEqual([
        symbolEdge(result, 'extends', [kid, 'Both'], [base, 'Aged']),
        symbolEdge(result, 'extends', [kid, 'Both'], [base, 'Named']),
        symbolEdge(result, 'extends', [kid, 'Kid'], [base, 'Base']),
        symbolEdge(result, 'implements', [kid, 'Kid'], [base, 'Aged']),
        symbolEdge(result, 'implements', [kid, 'Kid'], [base, 'Named']),
        fileEdge('imports', kid, base),
      ]);
    });

    it('A merged declaration is not an inheritance target', async () => {
      const result = await analyse([
        file('src/i.ts', 'export interface Shape {}\nexport interface Shape { area(): number }\nexport class Sq implements Shape { area(): number { return 1; } }\n'),
      ]);
      expect(result.symbols.filter((s) => s.kind === 'interface').map((s) => `${s.name} ${s.startLine}`)).toEqual(['Shape 1', 'Shape 2']);
      expect(result.edges).toEqual([]);
    });

    it('Every import form is one file edge', async () => {
      const result = await analyse([
        file('src/side.ts', 'export {};'),
        file('src/t.ts', 'export type T = 1;'),
        file('src/v.ts', 'export const v = 1;'),
        file(
          'src/a.ts',
          "import './side.js';\nimport type { T } from './t.js';\nexport * from './t.js';\nexport { v } from './v.js';\nimport { w } from './missing.js';\nimport z from 'zod';\nimport { v as again } from './v.js';\n",
        ),
      ]);
      expect(result.edges).toEqual([
        fileEdge('imports', 'src/a.ts', 'src/side.ts'),
        fileEdge('imports', 'src/a.ts', 'src/t.ts'),
        fileEdge('imports', 'src/a.ts', 'src/v.ts'),
      ]);
      expect(result.diagnostics).toEqual([]);
    });

    it('Self-imports and CommonJS forms produce no edge', async () => {
      const result = await analyse([
        file('src/b.ts', 'export class B {}'),
        file('src/s.ts', "import './s.js';\nconst r = require('./b');\nconst d = import('./b.js');\nimport b = require('./b');\nexport class S {}\n"),
      ]);
      expect(result.edges).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });

    it('Type arguments are followed, other heritage expressions are not', async () => {
      const result = await analyse([
        file(
          'src/h.ts',
          'export class Base<T> {}\nexport function mixin<T>(b: T): T { return b; }\nexport class K extends Base<string> {}\nexport class M extends mixin(Base) {}\n',
        ),
      ]);
      expect(result.edges).toEqual([symbolEdge(result, 'extends', ['src/h.ts', 'K'], ['src/h.ts', 'Base'])]);
    });

    // The edge parts of the tsconfig, "Names outside the input", syntax-error and type-error scenarios
    // are assertions of the `it` of the same name in structure.spec.ts (design Follow-ups A14).
  });

  describe('test coverage edges', () => {
    it('The unit tests of task-api cover their files', () => {
      expect(ofKind(taskApi, 'tested_by')).toEqual([
        fileEdge('tested_by', 'src/domain/task-status.ts', 'tests/unit/task-status.test.ts'),
        fileEdge('tested_by', 'src/services/task.filters.ts', 'tests/unit/task.filters.test.ts'),
        fileEdge('tested_by', 'src/services/task.service.ts', 'tests/unit/task.service.test.ts'),
      ]);
      const targets = ofKind(taskApi, 'tested_by').map((e) => e.target.file);
      expect(targets).not.toContain('tests/integration/tasks.routes.test.ts');
      expect(targets).not.toContain('tests/integration/validation.test.ts');
    });

    it('A test file that does not import its subject has no edge', async () => {
      const result = await analyse([
        file('src/foo.ts', 'export class Foo {}'),
        file('tests/unit/foo.test.ts', "import { it } from 'vitest';\nit('works', () => {});\n"),
      ]);
      expect(ofKind(result, 'tested_by')).toEqual([]);
    });

    it('The base name and the import pick the subject', async () => {
      const result = await analyse([
        file('src/a/foo.ts', 'export class FooA {}'),
        file('src/b/foo.ts', 'export class FooB {}'),
        file(
          'tests/foo.spec.ts',
          "import { FooA } from '../src/a/foo.js';\nimport { FooB } from '../src/b/foo.js';\nimport { Bar } from '../src/bar.js';\n",
        ),
        file('src/bar.ts', 'export class Bar {}'),
      ]);
      expect(ofKind(result, 'tested_by')).toEqual([
        fileEdge('tested_by', 'src/a/foo.ts', 'tests/foo.spec.ts'),
        fileEdge('tested_by', 'src/b/foo.ts', 'tests/foo.spec.ts'),
      ]);
    });

    it('A subject with a syntax error has no tested_by edge', async () => {
      const result = await analyse([
        file('src/foo.ts', 'export class Foo { run( }'),
        file('tests/foo.test.ts', "import { Foo } from '../src/foo.js';\n"),
      ]);
      expect(result.edges).toEqual([fileEdge('imports', 'tests/foo.test.ts', 'src/foo.ts')]);
      expect(result.diagnostics).toEqual([{ path: 'src/foo.ts', line: 1, message: expect.stringMatching(/\S/) }]);
    });
  });
});
