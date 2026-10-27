import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnalysisResult, GraphEdge, SourceFile } from '@codemind/core';
import { createTypeScriptAnalyzer } from '../../../../packages/analyzers/typescript/src/index';
import { readFixtureFiles } from '../../../support/read-fixture-files';

// Spec: openspec/changes/ts-calls-exact/specs/code-analysis/spec.md → "TypeScript calls" (DIS-31).
// Each `it` is one scenario, named after it. `fixtures/task-api` is read-only input here, without its
// untracked files (PH-22).

const TASK_API = resolve('fixtures/task-api');

function file(path: string, content: string): SourceFile {
  return { path, content };
}

describe('typescript analyzer calls', () => {
  const analyzer = createTypeScriptAnalyzer();
  let taskApi: AnalysisResult;

  beforeAll(async () => {
    const files = readFixtureFiles(TASK_API, ['.git', 'node_modules']).filter((f) => f.path !== 'package-lock.json');
    taskApi = await analyzer.analyze({ files });
  });

  const analyse = (files: SourceFile[]): Promise<AnalysisResult> => analyzer.analyze({ files });

  const callEdges = (result: AnalysisResult): GraphEdge[] => result.edges.filter((e) => e.kind === 'calls');

  /** `source -> target` by symbol name, sorted; with `lines`, each name carries `@startLine`. */
  const pairs = (result: AnalysisResult, lines = false): string[] => {
    const name = (ref: NonNullable<GraphEdge['source']['symbol']> | undefined): string =>
      ref ? (lines ? `${ref.name}@${ref.startLine}` : ref.name) : '(file)';
    return callEdges(result)
      .map((e) => `${name(e.source.symbol)} -> ${name(e.target.symbol)}`)
      .sort();
  };

  /** `source file source name -> target name` over every `calls` edge, sorted. */
  const pairsWithFile = (result: AnalysisResult): string[] =>
    callEdges(result)
      .map((e) => `${e.source.symbol?.file} ${e.source.symbol?.name} -> ${e.target.symbol?.name}`)
      .sort();

  it('The calls of task-api', () => {
    const edges = callEdges(taskApi);
    expect(edges).toHaveLength(37);
    for (const edge of edges) {
      expect(edge.source.symbol).toBeDefined();
      expect(edge.target.symbol).toBeDefined();
      expect(edge.resolution).toBe('exact');
      expect(edge.extractor).toBe('ts-compiler');
    }
    expect(taskApi.edges.some((e) => e.kind === 'calls' && e.resolution === 'heuristic')).toBe(false);

    const service = 'src/services/task.service.ts';
    const repo = 'src/repositories/in-memory-task.repository.ts';
    const routes = 'src/routes/tasks.routes.ts';
    const errors = 'src/domain/errors.ts';
    const filters = 'src/services/task.filters.ts';
    const expected = [
      `${service} TaskService::get -> TaskRepository::findById`,
      `${service} TaskService::get -> TaskNotFoundError::constructor`,
      `${service} TaskService::list -> TaskRepository::list`,
      `${service} TaskService::create -> newId`,
      `${service} TaskService::create -> TaskRepository::create`,
      `${service} TaskService::update -> TaskService::get`,
      `${service} TaskService::update -> canTransition`,
      `${service} TaskService::update -> IllegalStatusTransitionError::constructor`,
      `${service} TaskService::update -> pruneUndefined`,
      `${service} TaskService::update -> TaskRepository::update`,
      `${service} TaskService::delete -> TaskRepository::delete`,
      `${service} TaskService::delete -> TaskNotFoundError::constructor`,
      `${repo} InMemoryTaskRepository::list -> applyFilters`,
      `${repo} InMemoryTaskRepository::list -> sortTasks`,
      `${repo} InMemoryTaskRepository::list -> buildPage`,
      `${routes} taskRoutes -> TasksController::list`,
      `${routes} taskRoutes -> TasksController::getById`,
      `${routes} taskRoutes -> TasksController::create`,
      `${routes} taskRoutes -> TasksController::update`,
      `${routes} taskRoutes -> TasksController::remove`,
      `${errors} TaskNotFoundError::constructor -> DomainError::constructor`,
      `${errors} IllegalStatusTransitionError::constructor -> DomainError::constructor`,
      `${filters} applyFilters -> matchesSearch`,
      'src/app.ts buildApp -> registerDb',
      'src/app.ts buildApp -> registerErrorHandler',
      'src/app.ts buildApp -> registerRoutes',
      'src/plugins/db.ts registerDb -> InMemoryTaskRepository::constructor',
      'src/plugins/db.ts registerDb -> TaskService::constructor',
      'src/routes/health.routes.ts healthRoutes -> HealthController::check',
      'src/routes/index.ts registerRoutes -> healthRoutes',
      'src/routes/index.ts registerRoutes -> taskRoutes',
      'src/server.ts main -> buildApp',
      'src/server.ts main -> loadEnv',
      `${filters} sortTasks -> compareBy`,
      `${filters} compareBy -> priorityRank`,
      `${filters} compareBy -> compareNullableDate`,
      'tests/helpers/build-app.ts buildTestApp -> buildApp',
    ].sort();
    expect(pairsWithFile(taskApi)).toEqual(expected);
  });

  it('What the compiler cannot resolve has no calls edge', () => {
    const edges = callEdges(taskApi);
    expect(edges.filter((e) => e.source.symbol?.file === 'src/controllers/tasks.controller.ts')).toEqual([]);
    expect(edges.filter((e) => e.source.symbol?.name === 'applyFilters').map((e) => e.target.symbol?.name)).toEqual(['matchesSearch']);
    const taskRoutesTargets = edges.filter((e) => e.source.symbol?.name === 'taskRoutes').map((e) => e.target.symbol?.name);
    expect(taskRoutesTargets).not.toContain('TasksController::constructor');
    expect(taskApi.symbols.some((s) => s.name === 'TasksController::constructor')).toBe(false);
    expect(taskRoutesTargets).not.toContain('TasksController');
    expect(taskApi.diagnostics).toEqual([]);
  });

  it('Compiler-resolved call forms', async () => {
    const result = await analyse([
      file('src/a.ts', 'export class Base { constructor(n: number) {} hello(): void {} }\nexport function helper(): void {}\n'),
      file(
        'src/b.ts',
        "import { Base, helper as h } from './a.js';\nexport class Child extends Base { constructor() { super(1); } run(): void { this.hello(); h(); h?.(); [1].forEach(h); new Base(2); } again(): void { super.hello(); } }\n",
      ),
    ]);
    expect(pairs(result)).toEqual(
      [
        'Child::constructor -> Base::constructor',
        'Child::run -> Base::hello',
        'Child::run -> helper',
        'Child::run -> Base::constructor',
        'Child::again -> Base::hello',
      ].sort(),
    );
  });

  it('An overloaded call targets the implementation', async () => {
    const result = await analyse([
      file(
        'src/o.ts',
        'function f(x: string): void;\nfunction f(x: number): void;\nfunction f(x: unknown): void {}\nfunction g(): void { f(1); }\nclass K { m(x: string): void; m(x: number): void; m(x: unknown): void {} n(): void { this.m(1); } }\n',
      ),
    ]);
    expect(pairs(result, true)).toEqual(['K::n@5 -> K::m@5', 'g@4 -> f@3']);
  });

  it('Abstract and interface methods are targets themselves', async () => {
    const result = await analyse([
      file(
        'src/s.ts',
        'export abstract class S { abstract area(): number; total(): number { return this.area(); } }\nexport interface I { m(x: string): void;\n m(x: number): void; }\nexport function use(i: I): void { i.m(1); }\nexport interface J { n(): void }\nexport interface J { n(x: number): void }\nexport function useJ(j: J): void { j.n(1); }\n',
      ),
    ]);
    expect(pairs(result, true)).toEqual(['S::total@1 -> S::area@1', 'use@4 -> I::m@3', 'useJ@7 -> J::n@6'].sort());
  });

  it("A callee typed by a function's type is not that function", async () => {
    const result = await analyse([
      file(
        'src/v.ts',
        'export function a(): void {}\nexport function b(): void {}\nexport function viaType(cb: typeof a): void { cb(); }\nexport function viaUnion(c: boolean): void { const g = c ? a : b; g(); }\nexport function viaResult(get: () => typeof a): void { get()(); }\nexport function viaLocal(): void { const fn = a; fn(); }\n',
      ),
    ]);
    expect(pairs(result)).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('A call with a type error keeps its compiler-resolved target', async () => {
    const result = await analyse([
      file(
        'src/t.ts',
        "export function one(n: number): void {}\nexport function g(): void { one('x'); one(); }\nfunction f(x: string): void;\nfunction f(x: number): void;\nfunction f(x: unknown): void {}\nexport function h(): void { f(true); }\nexport class A { m(): void {} }\nexport class B { m(): void {} }\nexport function u(x: A | B): void { x.m(); }\n",
      ),
    ]);
    expect(pairs(result, true)).toEqual(['g@2 -> one@1', 'h@6 -> f@5']);
    expect(result.diagnostics).toEqual([]);
  });

  it('Only a constructor declared in the class itself is a target', async () => {
    const result = await analyse([
      file(
        'src/c.ts',
        'export class A { constructor() {} }\nexport class B extends A {}\nexport class C extends B { constructor() { super(); } }\nexport class V { constructor(a: string); constructor(a: number); constructor(a: unknown) {} }\nexport function pick(): typeof V { return V; }\nexport function f(): void { new B(); new A(); new V(1); new (pick())(1); }\n',
      ),
    ]);
    expect(pairs(result)).toEqual(['f -> A::constructor', 'f -> V::constructor', 'f -> pick']);
  });

  it('Callbacks belong to their symbol and nested symbols keep their own calls', async () => {
    const result = await analyse([
      file(
        'src/n.ts',
        'export function leaf(): void {}\nexport function outer(): void { [1].map(() => leaf()); const g = function () { leaf(); }; const o = { m() { leaf(); } }; function inner(): void { leaf(); inner(); } }\n',
      ),
    ]);
    expect(pairs(result)).toEqual(['inner -> inner', 'inner -> leaf', 'outer -> leaf']);
  });

  it('Only references passed as arguments are calls', async () => {
    const result = await analyse([
      file('src/a.ts', 'export function helper(): void {}\n'),
      file(
        'src/r.ts',
        "import { helper } from './a.js';\nexport function r(): unknown { const k = helper; const o = { helper }; const a = [helper]; return helper; }\nexport function s(): void { setTimeout(helper); }\n",
      ),
    ]);
    expect(pairs(result)).toEqual(['s -> helper']);
  });

  it('Call sites outside a function or method symbol, and targets that are not symbols, have no edge', async () => {
    const result = await analyse([
      file('src/a.ts', 'export function helper(): any { return () => {}; }\n'),
      file(
        'src/top.ts',
        "import { helper } from './a.js';\nhelper();\nexport const x = () => helper();\nexport class P { y = helper(); static { helper(); } get z(): number { helper(); return 1; } @helper() m(): void {} }\nexport const k = (): void => {};\nexport function q(f: () => void): void { f(); k(); helper`t`; }\n",
      ),
    ]);
    expect(pairs(result)).toEqual([]);
    expect(result.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/top.ts']);
    expect(result.diagnostics).toEqual([]);
  });

  it('A file with a syntax error neither originates nor receives calls', async () => {
    const result = await analyse([
      file('src/a.ts', 'export function helper(): void {}\n'),
      file('src/broken.ts', "import { helper } from './a.js';\nexport function b(): void { helper(); }\nexport class X { run( }\n"),
      file('src/user.ts', "import { b } from './broken.js';\nexport function u(): void { b(); }\n"),
    ]);
    expect(pairs(result)).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.path).toBe('src/broken.ts');
  });

  it('A dropped duplicate declaration is neither source nor target of a call', async () => {
    const result = await analyse([
      file('src/d.ts', 'function f() { function a() {} } function g() { function a() { h(); } a(); }\nfunction h() {}\n'),
    ]);
    expect(pairs(result)).toEqual([]);
    expect(result.diagnostics).toEqual([{ path: 'src/d.ts', line: 1, message: 'duplicate symbol "a"; kept the first' }]);
  });
});
