## ADDED Requirements

### Requirement: TypeScript calls

The TypeScript analyzer SHALL emit `calls` edges, with `resolution` `exact` and `extractor`
`ts-compiler`, from a `function` or `method` symbol to a `function` or `method` symbol of the same
result (see "TypeScript symbol extraction"). It SHALL NOT emit any `calls` edge with `resolution`
`heuristic`.

**Source.** A call site belongs to the innermost declaration around it that is a function
declaration, a method, constructor or accessor of a class, a property declaration of a class, or a
class static block. Arrow functions, function expressions and methods of object literals are not
such declarations: a call inside them belongs to the declaration around them. The source of the call
site is that declaration when it is a `function` or `method` symbol of the result; otherwise (an
accessor, a property initializer, a static block, a declaration dropped as a duplicate symbol, or no
such declaration at all, as at module level or in the initializer of a `const`) the call site SHALL
produce no edge. Decorator expressions SHALL produce no edge. Only TypeScript files parsed without a
syntax error contain call sites, and the subtrees that "TypeScript symbol extraction" does not enter
(`declare` declarations, `declare module`, `declare global`, `namespace` and `module` blocks)
contain none.

**Call sites and targets.** There are two kinds of call site:

1. A call expression (including `super(...)`, `super.m(...)` and optional calls `f?.()`) or a `new`
   expression. Its target is the declaration of the signature the TypeScript compiler resolves for it,
   import aliases followed: an inherited method resolves to the class that declares it, and a call on
   a value typed by an interface resolves to the interface's method signature. When that declaration
   is an overload signature without a body, the target is the implementation with a body of the same
   function or method. For `new X(...)` the target SHALL be a constructor declared in the body of the
   class `X` itself, and for `super(...)` a constructor declared in the body of the direct base class:
   when that class declares no constructor, there is no target, even if a class it extends declares
   one.
2. An identifier or a property access (such as `h` or `controller.create`) written directly as an
   argument of a call or `new` expression, whether or not that call has a target itself. Its target
   is the declaration the compiler resolves for the name, import aliases followed, when exactly one of
   that name's declarations is a `function` or `method` symbol of the result.

A call site SHALL produce an edge only when its target is a `function` or `method` symbol of the
result: the first declaration of its file, name and start line, not one dropped as a duplicate. A
target that is not declared in a TypeScript file of the input (a package, the standard library, a
file that is not part of the input), that is declared in a file with a syntax error (it has no
symbol), or that is not such a symbol (a class, a variable, a property or parameter of function
type, an accessor, an arrow function assigned to a `const`) SHALL produce no edge and no diagnostic.
References in any other position (assignments, `return`, object literals, array elements) SHALL
produce no edge.

A pair of symbols SHALL have at most one `calls` edge, whatever the number and kind of call sites
that link them. A symbol that calls itself SHALL have one `calls` edge to itself.

#### Scenario: The calls of task-api

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** there are exactly 37 `calls` edges, each from a symbol to a symbol, `exact`, with
  extractor `ts-compiler`, and no edge of the result is a `calls` edge with `resolution` `heuristic`
- **AND** among them are the 8 batch sites of `fixtures/README.md` that have a target in the input:
  `TaskService::create` → `newId`; `TaskService::update` → `canTransition`; `TaskService::update` →
  `TaskService::get` and `TaskService::get` → `TaskNotFoundError::constructor` (site 3);
  `InMemoryTaskRepository::list` → `applyFilters`, → `sortTasks` and → `buildPage`; `taskRoutes` →
  `TasksController::create` (a method passed as an argument); `TaskService::get` →
  `TaskRepository::findById` (an interface method signature)
- **AND** the `calls` edges whose source is in `src/services/task.service.ts` are exactly:
  `TaskService::get` → `TaskRepository::findById` and → `TaskNotFoundError::constructor`;
  `TaskService::list` → `TaskRepository::list`; `TaskService::create` → `newId` and →
  `TaskRepository::create`; `TaskService::update` → `TaskService::get`, → `canTransition`, →
  `IllegalStatusTransitionError::constructor`, → `pruneUndefined` and → `TaskRepository::update`;
  `TaskService::delete` → `TaskRepository::delete` and → `TaskNotFoundError::constructor`
- **AND** the `calls` edges whose source is in `src/repositories/in-memory-task.repository.ts` are
  exactly the three from `InMemoryTaskRepository::list`, to `applyFilters`, `sortTasks` and
  `buildPage`
- **AND** the `calls` edges whose source is in `src/routes/tasks.routes.ts` are exactly the five
  from `taskRoutes` to `TasksController::list`, `TasksController::getById`, `TasksController::create`,
  `TasksController::update` and `TasksController::remove`
- **AND** `TaskNotFoundError::constructor` and `IllegalStatusTransitionError::constructor` each have
  one `calls` edge, to `DomainError::constructor` (`super(...)`), and `applyFilters` has exactly one,
  to `matchesSearch` (a call inside the arrow function passed to `tasks.filter`)

#### Scenario: What the compiler cannot resolve has no calls edge

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** no `calls` edge has its source in `src/controllers/tasks.controller.ts` (batch site 7: the
  receiver `request.server` is typed by `fastify`, which is not in the input)
- **AND** the only `calls` edge from `applyFilters` targets `matchesSearch` (batch site 10:
  `task.tags.includes` resolves to the standard library, which is not in the input)
- **AND** `taskRoutes` has no `calls` edge to a `TasksController::constructor` (none is declared,
  and no such symbol exists) nor to the class `TasksController`
- **AND** `diagnostics` is empty (an unresolved call is not a diagnostic)

#### Scenario: Compiler-resolved call forms

- **WHEN** `src/a.ts` with content
  `export class Base { constructor(n: number) {} hello(): void {} }\nexport function helper(): void {}\n`
  and `src/b.ts` with content
  `import { Base, helper as h } from './a.js';\nexport class Child extends Base { constructor() { super(1); } run(): void { this.hello(); h(); [1].forEach(h); new Base(2); } }\n`
  are analysed together
- **THEN** the `calls` edges are exactly: `Child::constructor` → `Base::constructor`;
  `Child::run` → `Base::hello` (inherited method), → `helper` (one edge for the aliased call and the
  reference passed to `forEach`) and → `Base::constructor`

#### Scenario: An overloaded call targets the implementation

- **WHEN** `src/o.ts` with content
  `function f(x: string): void;\nfunction f(x: number): void;\nfunction f(x: unknown): void {}\nfunction g(): void { f(1); }\nclass K { m(x: string): void; m(x: number): void; m(x: unknown): void {} n(): void { this.m(1); } }\n`
  is analysed
- **THEN** the `calls` edges are exactly `g` → `f` (the symbol on line 3) and `K::n` → `K::m`

#### Scenario: Only a constructor declared in the class itself is a target

- **WHEN** `src/c.ts` with content
  `export class A { constructor() {} }\nexport class B extends A {}\nexport class C extends B { constructor() { super(); } }\nexport function f(): void { new B(); new A(); }\n`
  is analysed
- **THEN** the `calls` edges are exactly one, `f` → `A::constructor` (`new B()` and the `super()` of
  `C`, whose direct base `B` declares no constructor, have none)

#### Scenario: Callbacks belong to their symbol and nested symbols keep their own calls

- **WHEN** `src/n.ts` with content
  `export function leaf(): void {}\nexport function outer(): void { [1].map(() => leaf()); const g = function () { leaf(); }; function inner(): void { leaf(); inner(); } }\n`
  is analysed
- **THEN** the `calls` edges are exactly: `outer` → `leaf` (one edge for the calls in the arrow
  function and the function expression), `inner` → `leaf` and `inner` → `inner` (a recursive call);
  `outer` has no edge to `inner`

#### Scenario: Only references passed as arguments are calls

- **WHEN** `src/a.ts` with content `export function helper(): void {}\n` and `src/r.ts` with content
  `import { helper } from './a.js';\nexport function r(): unknown { const k = helper; const o = { helper }; return helper; }\nexport function s(): void { setTimeout(helper); }\n`
  are analysed together
- **THEN** the `calls` edges are exactly one, `s` → `helper` (`setTimeout` itself resolves to
  nothing); `r` has none

#### Scenario: Call sites outside a function or method symbol have no edge

- **WHEN** `src/a.ts` with content `export function helper(): any { return () => {}; }\n` and
  `src/top.ts` with content
  `import { helper } from './a.js';\nhelper();\nexport const x = () => helper();\nexport class P { y = helper(); get z(): number { helper(); return 1; } @helper() m(): void {} }\n`
  are analysed together
- **THEN** there is no `calls` edge (module level, `const` initializer, property initializer,
  accessor and decorator)
- **AND** the analysis resolves and `diagnostics` is empty

#### Scenario: A file with a syntax error neither originates nor receives calls

- **WHEN** `src/a.ts` with content `export function helper(): void {}\n`, `src/broken.ts` with content
  `import { helper } from './a.js';\nexport function b(): void { helper(); }\nexport class X { run( }\n`
  and `src/user.ts` with content
  `import { b } from './broken.js';\nexport function u(): void { b(); }\n` are analysed together
- **THEN** the analysis resolves, there is no `calls` edge, and `diagnostics` is exactly one entry,
  for `src/broken.ts`

#### Scenario: A dropped duplicate declaration is neither source nor target of a call

- **WHEN** `src/d.ts` with content
  `function f() { function a() {} } function g() { function a() { h(); } a(); }\nfunction h() {}\n`
  is analysed
- **THEN** there is no `calls` edge (the `a` of `g`, dropped as a duplicate, is neither the target of
  `a()` nor the source of `h()`, and its call is not given to `g`)
- **AND** `diagnostics` is exactly one entry for `src/d.ts`, `line` 1, `message`
  `duplicate symbol "a"; kept the first`

## MODIFIED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per distinct input path, with its `path`, its `kind` and its `loc`,
  and no `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: the `GraphEdge`s between those files and symbols defined by the requirements "Code
  relation edges", "Array-action routes", "Declared-type calls", "Laravel heuristic calls", "Test
  coverage edges", "Documentation mention edges", "TypeScript code relation edges", "TypeScript
  test coverage edges" and "TypeScript calls"; every edge SHALL have a non-empty `extractor`, a
  `resolution`, no `weight`, and both endpoints present in `files` or `symbols` of the same result;
  no two edges SHALL share `kind`, source and target;
- `diagnostics`: one `{ path, message, line? }` per file that could not be parsed, one per symbol
  dropped as a duplicate (see Symbol extraction), one per input discarded as a duplicate path, and
  one per input an analyzer does not parse because of the form of its path (see "TypeScript analysis
  input"); a file MAY have more than one.

Two inputs share a path when their `path` strings are equal code unit by code unit; paths SHALL NOT
be normalised (case, `./`, separators and whitespace are significant). When several inputs share a
path, only the first of them in input order SHALL be analysed. Every later one SHALL be discarded
before any parsing or indexing: it SHALL contribute no `GraphFile`, no symbol, no edge and no other
diagnostic, and it SHALL add exactly one diagnostic with that `path`, no `line`, and `message`
`duplicate path "<path>"; kept the first`. This applies to every input, whatever its kind. Apart
from inputs discarded as duplicate paths, the order of the inputs SHALL NOT affect the result.

The result SHALL be accepted by the graph validation of `graph-store` once wrapped in a graph with no
commits and no file–commit links. The result SHALL be deterministic: the same input SHALL produce an
equal result. `files` SHALL be ordered by `path`, and `symbols` by file `path`, then `startLine`, then
`endLine` descending (so an enclosing symbol precedes the symbols it contains), then `name`. `edges`
SHALL be ordered by `kind`,
then source endpoint, then target endpoint, where an endpoint is ordered by its file `path`, then a
file endpoint before the symbol endpoints of that path, then symbol `name`, then `startLine`. Kinds,
paths and names SHALL be compared by UTF-16 code unit, not by locale.

The analyzer SHALL use only the content it receives: it SHALL NOT read the analysed repository's
files, open a network connection, or execute or install anything from the analysed repository.
Loading its own parser (for the TypeScript analyzer, its compiler) is the only file it MAY read.
When its parser cannot be loaded, the call that needed it SHALL reject; the analyzer SHALL NOT keep
that failure, so a later call on the same analyzer SHALL try to load the parser again.

#### Scenario: The acme-shop analysis is a valid deterministic graph

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop` (the `.git` directory
  excluded)
- **WHEN** they are analysed twice with the same input
- **THEN** both results are equal, `files` is ordered by `path`, `symbols` by `path` then
  `startLine`, and `edges` is non-empty and in the order defined above, with no two edges sharing
  `kind`, source and target
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: The analyzer reads only the content it receives

- **GIVEN** a file `app/Ghost.php` that does not exist on disk, whose content declares
  `class Ghost`
- **WHEN** it is analysed
- **THEN** the result has one file `app/Ghost.php` and one `class` symbol `Ghost`, and no error is
  raised

#### Scenario: Duplicate input paths keep the first

- **WHEN** these six inputs are analysed in one call, in this order: `app/A.php` with content
  `<?php class A {}`, `README.md` with content `# Readme`, `app/A.php` with content `<?php class A {}`,
  `app/A.php` with content `<?php class B {}`, `README.md` with content `# Other`, and `app/a.php` with
  content `<?php class Lower {}`
- **THEN** `files` is exactly `README.md`, `app/A.php` and `app/a.php`, in that order, each with
  `loc` 1
- **AND** `symbols` is exactly `class A` in `app/A.php` and `class Lower` in `app/a.php` (no
  `class B`)
- **AND** `diagnostics` has exactly three entries, none with a `line`: two with `path` `app/A.php` and
  `message` `duplicate path "app/A.php"; kept the first`, and one with `path` `README.md` and `message`
  `duplicate path "README.md"; kept the first` (no `duplicate symbol` diagnostic)
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: A failed parser load does not poison later calls

- **GIVEN** an analyzer whose first attempt to load its parser fails, and whose later attempts succeed
- **WHEN** `app/Ghost.php` with content `<?php class Ghost {}` is analysed with it, and then analysed
  again with the same analyzer
- **THEN** the first call rejects
- **AND** the second call resolves with one `class` symbol `Ghost` in `app/Ghost.php`, and the parser
  was loaded twice

#### Scenario: Symbols that start on one line are ordered by span, then name

- **WHEN** `app/tie.php` with content
  `<?php function z() { function a() {}\n}\nfunction b() {} function a2() {}\n\nfunction c() {} function d() {\n}\n`
  is analysed
- **THEN** its symbols are exactly, in this order, as kind, name, start line and end line:
  `function z` 1–2, `function a` 1–1, `function a2` 3–3, `function b` 3–3, `function d` 5–6,
  `function c` 5–5 (on line 1 the enclosing `z` precedes `a` despite its name; on line 3, with equal
  spans, `a2` precedes `b`, against their declaration order; on line 5 the sibling `d` precedes `c`
  because it ends later, although neither contains the other: the order is by `endLine`, not by
  containment)
