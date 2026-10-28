import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { compareEdges, validateGraph } from '@codemind/core';
import type { AnalysisResult, EdgeEndpoint, KnowledgeGraph, SourceFile } from '@codemind/core';
import { createTypeScriptAnalyzer } from '../../../../packages/analyzers/typescript/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/changes/ts-analyzer-structure/specs/code-analysis/spec.md → "TypeScript analysis
// input", "TypeScript symbol extraction", "TypeScript syntax errors" and "TypeScript code relation
// edges" (the tsconfig scenarios). Each `it` is one scenario, named after it. `fixtures/task-api` is
// read-only input here (PH-22); its untracked `node_modules/` and `package-lock.json` are left out
// so the same 38 files are read locally and in CI (design D8).

const TASK_API = resolve('fixtures/task-api');

function file(path: string, content: string): SourceFile {
  return { path, content };
}

function graphOf(result: AnalysisResult): KnowledgeGraph {
  return { files: result.files, symbols: result.symbols, edges: result.edges, commits: [], fileCommits: [] };
}

function taskApiInput(): SourceFile[] {
  return readFixtureFiles(TASK_API, ['.git', 'node_modules']).filter((f) => f.path !== 'package-lock.json');
}

const label = (s: { kind: string; name: string }): string => `${s.kind} ${s.name}`;

const endpoint = (e: EdgeEndpoint): string => e.file ?? `${e.symbol.file}#${e.symbol.name}`;
/** `kind source -> target`, files by path and symbols as `path#name`, in edge order. */
const edgeKeys = (result: AnalysisResult): string[] => result.edges.map((e) => `${e.kind} ${endpoint(e.source)} -> ${endpoint(e.target)}`);

describe('typescript analyzer structure', () => {
  const analyzer = createTypeScriptAnalyzer();
  let taskApi: AnalysisResult;

  beforeAll(async () => {
    taskApi = await analyzer.analyze({ files: taskApiInput() });
  });

  describe('analysis input', () => {
    it('The task-api files are classified', () => {
      expect(taskApi.files).toHaveLength(38);
      const byKind = new Map<string, number>();
      for (const f of taskApi.files) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
      expect(Object.fromEntries(byKind)).toEqual({ source: 25, test: 6, doc: 2, config: 5 });
      for (const f of taskApi.files) {
        const content = readFileSync(join(TASK_API, f.path), 'utf8');
        const expectedLoc = content === '' ? 0 : (content.endsWith('\n') ? content.slice(0, -1) : content).split('\n').length;
        expect(f.loc, f.path).toBe(expectedLoc);
      }
      expect(taskApi.diagnostics).toEqual([]);
    });

    it('The task-api analysis is a valid deterministic graph', async () => {
      const again = await analyzer.analyze({ files: taskApiInput() });
      expect(again).toEqual(taskApi);
      const paths = taskApi.files.map((f) => f.path);
      expect(paths).toEqual([...paths].sort());
      // Review finding W1: the order of `symbols` and `edges` is part of the scenario too.
      const code = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
      const symbolOrder = [...taskApi.symbols].sort(
        (a, b) => code(a.file, b.file) || a.startLine - b.startLine || b.endLine - a.endLine || code(a.name, b.name),
      );
      expect(taskApi.symbols).toEqual(symbolOrder);
      expect(taskApi.edges.length).toBeGreaterThan(0);
      expect(taskApi.edges).toEqual([...taskApi.edges].sort(compareEdges));
      expect(validateGraph(graphOf(taskApi))).toEqual([]);
    });

    it('A TypeScript file is analysed from its content only', async () => {
      const result = await analyzer.analyze({ files: [file('src/ghost.ts', 'export class Ghost {}')] });
      expect(result.files.map((f) => f.path)).toEqual(['src/ghost.ts']);
      expect(result.symbols.map(label)).toEqual(['class Ghost']);
    });

    it('Duplicate TypeScript input paths keep the first', async () => {
      const result = await analyzer.analyze({
        files: [
          file('src/a.ts', 'export class A {}'),
          file('README.md', '# Readme'),
          file('src/a.ts', 'export class B {}'),
          file('src/A.ts', 'export class Upper {}'),
        ],
      });
      expect(result.files.map((f) => f.path)).toEqual(['README.md', 'src/A.ts', 'src/a.ts']);
      expect(result.symbols.map((s) => `${label(s)} ${s.file}`)).toEqual(['class Upper src/A.ts', 'class A src/a.ts']);
      expect(result.diagnostics).toEqual([{ path: 'src/a.ts', message: 'duplicate path "src/a.ts"; kept the first' }]);
    });

    it('Files that are not TypeScript are not parsed', async () => {
      const result = await analyzer.analyze({
        files: [
          file('src/a.tsx', 'export class A {}'),
          file('src/b.js', 'export class B {}'),
          file('src/c.d.ts', 'export declare class C {}'),
          file('src/d.mts', 'export class D {}'),
          file('src/e.ts', "import type { C } from './c.js';\nexport class E {}\n"),
        ],
      });
      expect(result.files).toHaveLength(5);
      expect(result.symbols.map((s) => `${label(s)} ${s.file}`)).toEqual(['class E src/e.ts']);
      expect(result.edges).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });

    it('A non-canonical TypeScript path is not parsed', async () => {
      const result = await analyzer.analyze({
        files: [
          file('./src/a.ts', 'export class A {}'),
          file('src\\b.ts', 'export class B {}'),
          file('src/../d.ts', 'export class D {}'),
          file('/e.ts', 'export class E {}'),
          file('src//f.ts', 'export class F {}'),
          file('src/c.ts', 'export class C {}'),
        ],
      });
      expect(result.files).toHaveLength(6);
      expect(result.symbols.map((s) => `${label(s)} ${s.file}`)).toEqual(['class C src/c.ts']);
      expect(result.diagnostics).toEqual(
        ['./src/a.ts', '/e.ts', 'src/../d.ts', 'src//f.ts', 'src\\b.ts'].map((path) => ({
          path,
          message: `non-canonical path "${path}"; not parsed`,
        })),
      );
    });

    it('Compiler options come from the input tsconfig', async () => {
      const result = await analyzer.analyze({
        files: [
          file('tsconfig.json', '{ "compilerOptions": { "paths": { "@app/*": ["src/*"] } } }'),
          file('src/y.ts', 'export class Y {}'),
          file('src/x.ts', "import { Y } from '@app/y.js';\nexport class X extends Y {}\n"),
        ],
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.symbols.map((s) => `${label(s)} ${s.file}`)).toEqual(['class X src/x.ts', 'class Y src/y.ts']);
      expect(edgeKeys(result)).toEqual(['extends src/x.ts#X -> src/y.ts#Y', 'imports src/x.ts -> src/y.ts']);
    });

    it('An unreadable tsconfig falls back to the default options', async () => {
      const result = await analyzer.analyze({
        files: [
          file('tsconfig.json', '{ "compilerOptions": '),
          file('src/b.ts', 'export class B {}'),
          file('src/a.ts', "import { B } from './b.js';\nexport class A extends B {}\n"),
        ],
      });
      expect(result.files.find((f) => f.path === 'tsconfig.json')?.kind).toBe('config');
      expect(result.symbols.map(label)).toEqual(['class A', 'class B']);
      expect(edgeKeys(result)).toEqual(['extends src/a.ts#A -> src/b.ts#B', 'imports src/a.ts -> src/b.ts']);
      expect(result.diagnostics).toEqual([{ path: 'tsconfig.json', line: 1, message: expect.stringMatching(/\S/) }]);
    });

    it('A tsconfig whose root is not an object falls back to the default options', async () => {
      const result = await analyzer.analyze({
        files: [
          file('tsconfig.json', 'null'),
          file('src/b.ts', 'export class B {}'),
          file('src/a.ts', "import { B } from './b.js';\nexport class A extends B {}\n"),
        ],
      });
      expect(result.symbols.map(label)).toEqual(['class A', 'class B']);
      expect(edgeKeys(result)).toEqual(['extends src/a.ts#A -> src/b.ts#B', 'imports src/a.ts -> src/b.ts']);
      expect(result.diagnostics).toEqual([{ path: 'tsconfig.json', line: 1, message: expect.stringMatching(/\S/) }]);
    });

    it('The tsconfig never selects files or loads declarations', async () => {
      const tsconfig =
        '{ "extends": "./base.json", "files": [], "include": ["src/**/*.ts"], "exclude": ["tests"], "references": [{ "path": "./other" }], "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noLib": false, "notAnOption": true, }, }';
      const result = await analyzer.analyze({
        files: [
          file('tsconfig.json', tsconfig),
          file('src/foo.ts', 'export class Foo extends Error {}'),
          file('tests/foo.test.ts', "import { Foo } from '../src/foo.js';\nexport class FooCheck {}\n"),
        ],
      });
      expect(result.symbols.filter((s) => s.file === 'tests/foo.test.ts').map(label)).toEqual(['class FooCheck']);
      expect(edgeKeys(result)).toEqual(['imports tests/foo.test.ts -> src/foo.ts', 'tested_by src/foo.ts -> tests/foo.test.ts']);
      expect(result.diagnostics).toEqual([]);
    });

    it('Names outside the input resolve to nothing', async () => {
      const result = await analyzer.analyze({
        files: [
          file(
            'src/a.ts',
            "import { z } from 'zod';\nimport { randomUUID } from 'node:crypto';\nimport { Gone } from './gone.js';\nexport class A extends Error implements Gone {}\n",
          ),
        ],
      });
      expect(result.symbols.map(label)).toEqual(['class A']);
      expect(result.edges).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe('symbol extraction', () => {
    const span = (s: { kind: string; name: string; startLine: number; endLine: number }): string =>
      `${s.kind} ${s.name} ${s.startLine}-${s.endLine}`;
    const only = async (path: string, content: string) => (await analyzer.analyze({ files: [file(path, content)] })).symbols;

    it('The task-api errors and repository have exact spans', () => {
      const errors = taskApi.symbols.filter((s) => s.file === 'src/domain/errors.ts');
      expect(errors.map(span)).toEqual([
        'class DomainError 6-15',
        'method DomainError::constructor 7-14',
        'class TaskNotFoundError 17-21',
        'method TaskNotFoundError::constructor 18-20',
        'class IllegalStatusTransitionError 23-27',
        'method IllegalStatusTransitionError::constructor 24-26',
      ]);
      expect(errors.find((s) => s.name === 'TaskNotFoundError')?.signature).toBe('export class TaskNotFoundError extends DomainError');

      const repository = taskApi.symbols.filter((s) => s.file === 'src/repositories/task.repository.ts' && s.name.startsWith('TaskRepository'));
      expect(repository.map(span)).toEqual([
        'interface TaskRepository 22-28',
        'method TaskRepository::findById 23-23',
        'method TaskRepository::list 24-24',
        'method TaskRepository::create 25-25',
        'method TaskRepository::update 26-26',
        'method TaskRepository::delete 27-27',
      ]);
      expect(repository[1]?.signature).toBe('findById(id: string): Promise<Task | null>');
    });

    it('Every class, interface and function of task-api is listed', () => {
      const byFile = new Map<string, string[]>();
      for (const s of taskApi.symbols) {
        if (s.kind === 'method') continue;
        byFile.set(s.file, [...(byFile.get(s.file) ?? []), label(s)]);
      }
      expect(Object.fromEntries(byFile)).toEqual({
        'src/app.ts': ['interface BuildAppOptions', 'function buildApp'],
        'src/config/env.ts': ['function loadEnv'],
        'src/controllers/health.controller.ts': ['class HealthController'],
        'src/controllers/tasks.controller.ts': ['class TasksController'],
        'src/domain/errors.ts': ['class DomainError', 'class TaskNotFoundError', 'class IllegalStatusTransitionError'],
        'src/domain/pagination.ts': ['interface Page', 'function buildPage'],
        'src/domain/task-priority.ts': ['function isTaskPriority', 'function priorityRank'],
        'src/domain/task-status.ts': ['function isTaskStatus', 'function canTransition', 'function allowedTransitions'],
        'src/domain/task.entity.ts': ['interface Task', 'interface CreateTaskInput', 'interface UpdateTaskInput'],
        'src/plugins/db.ts': ['function registerDb'],
        'src/plugins/error-handler.ts': ['function registerErrorHandler'],
        'src/plugins/swagger.ts': ['function registerSwagger'],
        'src/repositories/in-memory-task.repository.ts': ['class InMemoryTaskRepository'],
        'src/repositories/task.repository.ts': ['interface TaskQuery', 'interface TaskRepository'],
        'src/routes/health.routes.ts': ['function healthRoutes'],
        'src/routes/index.ts': ['function registerRoutes'],
        'src/routes/tasks.routes.ts': ['function taskRoutes'],
        'src/server.ts': ['function main'],
        'src/services/id.ts': ['function newId'],
        'src/services/task.filters.ts': [
          'function applyFilters',
          'function matchesSearch',
          'function sortTasks',
          'function compareBy',
          'function compareNullableDate',
        ],
        'src/services/task.service.ts': ['class TaskService', 'function pruneUndefined'],
        'tests/helpers/build-app.ts': ['function buildTestApp', 'function makeTask'],
      });
      const count = (kind: string): number => taskApi.symbols.filter((s) => s.kind === kind).length;
      expect([count('class'), count('interface'), count('function')]).toEqual([7, 7, 24]);
      expect(taskApi.symbols.some((s) => s.name === 'FastifyInstance')).toBe(false);

      expect(
        taskApi.symbols
          .filter((s) => s.kind === 'method')
          .map((s) => s.name)
          .sort(),
      ).toEqual(
        [
          'DomainError::constructor',
          'TaskNotFoundError::constructor',
          'IllegalStatusTransitionError::constructor',
          'TaskRepository::findById',
          'TaskRepository::list',
          'TaskRepository::create',
          'TaskRepository::update',
          'TaskRepository::delete',
          'InMemoryTaskRepository::constructor',
          'InMemoryTaskRepository::findById',
          'InMemoryTaskRepository::list',
          'InMemoryTaskRepository::create',
          'InMemoryTaskRepository::update',
          'InMemoryTaskRepository::delete',
          'TaskService::constructor',
          'TaskService::get',
          'TaskService::list',
          'TaskService::create',
          'TaskService::update',
          'TaskService::delete',
          'TasksController::list',
          'TasksController::getById',
          'TasksController::create',
          'TasksController::update',
          'TasksController::remove',
          'HealthController::check',
        ].sort(),
      );
    });

    it('task-api files without such declarations have no symbols', () => {
      for (const path of ['src/types/index.ts', 'src/schemas/index.ts', 'src/schemas/task.schema.ts', 'src/schemas/pagination.schema.ts', 'vitest.config.ts']) {
        expect(taskApi.files.find((f) => f.path === path), path).toBeDefined();
        expect(taskApi.symbols.some((s) => s.file === path), path).toBe(false);
      }
      for (const f of taskApi.files) {
        if (f.path.endsWith('.ts')) continue;
        expect(taskApi.symbols.some((s) => s.file === f.path), f.path).toBe(false);
      }
    });

    it('Anonymous and expression classes yield only their methods', async () => {
      const symbols = await only('src/a.ts', 'export default class { run(): void {} }\nconst B = class { go() {} };\n');
      expect(symbols.map(span)).toEqual(['method run 1-1', 'method go 2-2']);
    });

    it('Only the implementation of an overload is a symbol', async () => {
      const symbols = await only(
        'src/f.ts',
        'export function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: unknown): void {}\nexport abstract class Shape {\n  abstract area(): number;\n  scale(k: string): void;\n  scale(k: number): void;\n  scale(k: unknown): void {}\n}\n',
      );
      expect(symbols.map((s) => `${span(s)} ${s.signature}`)).toEqual([
        'function f 3-3 export function f(a: unknown): void',
        'class Shape 4-9 export abstract class Shape',
        'method Shape::area 5-5 abstract area(): number',
        'method Shape::scale 8-8 scale(k: unknown): void',
      ]);
    });

    it('TypeScript spans include decorators and modifiers, not JSDoc', async () => {
      const symbols = await only(
        'src/m.ts',
        '/** Doc. */\n@Entity()\nexport class Model {\n  /** Save. */\n  @Column()\n  public async save(): Promise<void> {}\n  constructor(private readonly id: string) {}\n}\n',
      );
      expect(symbols.map((s) => `${span(s)} ${s.signature}`)).toEqual([
        'class Model 2-8 @Entity() export class Model',
        'method Model::save 5-6 @Column() public async save(): Promise<void>',
        'method Model::constructor 7-7 constructor(private readonly id: string)',
      ]);
    });

    it('Private members and comma-separated signatures are named exactly', async () => {
      const symbols = await only('src/p.ts', 'export class P {\n  #run(): void {}\n}\nexport interface I { a(): void, b(): void }\n');
      expect(symbols.map((s) => `${span(s)}${s.kind === 'method' ? ` ${s.signature}` : ''}`)).toEqual([
        'class P 1-3',
        'method P::#run 2-2 #run(): void',
        'interface I 4-4',
        'method I::a 4-4 a(): void',
        'method I::b 4-4 b(): void',
      ]);
    });

    // DIS-32, design D1: spec code-analysis → "Module-level const functions are function symbols".
    it('Module-level const functions are function symbols', async () => {
      const symbols = await only(
        'src/k.ts',
        '/** Adds one. */\nexport const f = (a: number): number => a + 1;\nconst g = async () => {\n  function inner(): void {}\n  return 1;\n};\nexport const h = function (x: string) {\n  return x;\n};\nconst t = <T,>(x: T): T => x;\n',
      );
      expect(symbols.map((s) => `${span(s)} ${s.signature}`)).toEqual([
        'function f 2-2 export const f = (a: number): number =>',
        'function g 3-6 const g = async () =>',
        'function inner 4-4 function inner(): void',
        'function h 7-9 export const h = function (x: string)',
        'function t 10-10 const t = <T,>(x: T): T =>',
      ]);
      const result = await analyzer.analyze({ files: [file('src/k.ts', '/** Adds one. */\nexport const f = (a: number): number => a + 1;\n')] });
      expect(result.diagnostics).toEqual([]);
    });

    // DIS-32, design D1, and DIS-107, design D1/D2: spec code-analysis → "Other variable forms are not
    // function symbols" (delta of DIS-107: `await using` and `using` declarations are no function symbols).
    it('Other variable forms are not function symbols', async () => {
      const result = await analyzer.analyze({
        files: [
          file(
            'src/v.ts',
            'let a = () => 1;\nvar b = () => 1;\nconst c = () => 1, d = () => 2;\nconst { e } = { e: () => 1 };\nconst z = 3;\nconst w = (() => 1);\nconst y = (() => 1) as () => number;\ndeclare const q: () => void;\nconst K = class { run() {} };\nexport function outer(): void { const inside = () => 1; }\nif (z) { const blocked = () => 1; }\nawait using f = async () => 1;\nusing g = () => 1;\n',
          ),
        ],
      });
      expect(result.symbols.map(span)).toEqual(['method run 9-9', 'function outer 10-10']);
      expect(result.diagnostics).toEqual([]);
    });

    // DIS-32, design D1: spec code-analysis → "Const functions are no endpoint of calls edges".
    it('Const functions are no endpoint of calls edges', async () => {
      const result = await analyzer.analyze({
        files: [file('src/c.ts', 'export function target(): void {}\nexport const f = (): void => { target(); };\nexport function caller(): void { f(); [1].forEach(f); }\n')],
      });
      expect(result.symbols.map(span)).toEqual(['function target 1-1', 'function f 2-2', 'function caller 3-3']);
      expect(result.edges.filter((e) => e.kind === 'calls')).toEqual([]);
      const involvesF = result.edges.filter((e) =>
        [e.source, e.target].some((end) => end.symbol !== undefined && end.symbol.name === 'f'),
      );
      expect(involvesF).toEqual([]);
    });

    it('Variables, types, accessors and ambient declarations are not symbols', async () => {
      const result = await analyzer.analyze({
        files: [
          file(
            'src/n.ts',
            "export let a = () => 1;\nexport type T = { run(): void };\nexport enum E { A }\nexport class C {\n  handler = () => 1;\n  get v(): number { return 1; }\n  ['x']() {}\n}\nconst o = { m() {} };\ndeclare global { interface Window { x: number } }\nexport namespace N { export function g() {} }\ndeclare function h(): void;\nexport function outer(): void { function inner(): void {} }\n",
          ),
        ],
      });
      expect(result.symbols.map(span)).toEqual(['class C 4-8', 'function inner 13-13', 'function outer 13-13']);
      expect(result.diagnostics).toEqual([]);
    });

    it('Duplicate TypeScript symbols are dropped with a diagnostic', async () => {
      const result = await analyzer.analyze({
        files: [file('src/dup.ts', 'export const a = class { run(x: number) {} }; export const b = class { run() {} };')],
      });
      expect(result.symbols.map((s) => `${label(s)} ${s.startLine} ${s.signature}`)).toEqual(['method run 1 run(x: number)']);
      expect(result.diagnostics).toEqual([{ path: 'src/dup.ts', line: 1, message: 'duplicate symbol "run"; kept the first' }]);
    });
  });

  describe('syntax errors', () => {
    it('A TypeScript syntax error does not stop the analysis', async () => {
      const result = await analyzer.analyze({
        files: [
          file('src/broken.ts', "import { Ok } from './ok.js'; export class Broken extends Ok { run( }"),
          file('src/ok.ts', 'export class Ok {}'),
          file('src/user.ts', "import { Broken } from './broken.js';\nexport class User {}\n"),
        ],
      });
      expect(result.files.find((f) => f.path === 'src/broken.ts')).toMatchObject({ kind: 'source', loc: 1 });
      expect(result.symbols.map((s) => `${label(s)} ${s.file}`)).toEqual(['class Ok src/ok.ts', 'class User src/user.ts']);
      expect(result.diagnostics).toEqual([{ path: 'src/broken.ts', line: 1, message: expect.stringMatching(/\S/) }]);
      expect(edgeKeys(result)).toEqual(['imports src/user.ts -> src/broken.ts']);
      expect(validateGraph(graphOf(result))).toEqual([]);
    });

    it('Type errors are not diagnostics', async () => {
      const result = await analyzer.analyze({
        files: [
          file('src/dep.ts', 'export class Dep {}'),
          file(
            'src/t.ts',
            "import { Dep } from './dep.js';\nimport { Missing } from './missing.js';\nexport function f(): number { return 'x'; }\nexport class T extends Missing {}\n",
          ),
        ],
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.symbols.filter((s) => s.file === 'src/t.ts').map(label)).toEqual(['function f', 'class T']);
      expect(edgeKeys(result)).toEqual(['imports src/t.ts -> src/dep.ts']);
    });
  });
});
