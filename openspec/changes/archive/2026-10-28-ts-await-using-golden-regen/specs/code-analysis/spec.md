## MODIFIED Requirements

### Requirement: TypeScript symbol extraction

For each TypeScript file parsed without a syntax error, the TypeScript analyzer SHALL emit:

- one `class` symbol per class declaration with a name, named by that name;
- one `interface` symbol per interface declaration, named by its name;
- one `function` symbol per function declaration with a name and a body, at any depth (the bodies
  of functions, methods, constructors, accessors, arrow functions, function expressions, class
  static blocks and class expressions included), except inside the declarations this requirement
  skips (`declare` declarations and `declare module`, `declare global`, `namespace` and `module`
  blocks), named by its name;
- one `function` symbol per **module-level `const` function**: a `const` variable statement that is
  a direct statement of the file (exported or not, without the `declare` modifier), that has exactly
  one declarator, whose name is an identifier and whose initializer is directly an arrow function or
  a function expression (`async` and generic ones included), named by that identifier; a `using` or
  `await using` statement is not a `const` statement;
- one `method` symbol per member of a class that is a method with a body, an abstract method, or a
  constructor with a body, named `X::m` (`X::constructor` for a constructor) when the class is a
  declaration with a name `X`, and by the bare member name otherwise (a class expression or an
  anonymous `export default class`);
- one `method` symbol per method signature of an interface `I`, named `I::m`.

A member is named only when its name is written as an identifier or a private identifier (`#m`,
named with its `#`); a member with a string, numeric or computed name SHALL produce no symbol. A
function, method or constructor declaration without a body that is neither abstract nor a member of
an interface (an overload signature, or an ambient declaration) SHALL produce no symbol: of an
overloaded function or method only the implementation is a symbol. A declaration with the `declare`
modifier, and every declaration inside a `declare module`, `declare global`, `namespace` or `module`
block, SHALL produce no symbol. Every other variable SHALL produce no symbol: `let`, `var`, `using`
and `await using` statements (whatever their initializer), a `const` statement with more than one declarator, a `const` declared inside a function,
a method, a block or any other statement, a destructuring `const`, and a `const` whose initializer is
anything else (a class expression, a call, a parenthesised, asserted or `satisfies` function, a
literal). Object-literal methods, `type` aliases, enums, class properties (whatever their value),
property signatures, index signatures and `get` / `set` accessors SHALL produce no symbol. The methods
of a class expression SHALL still be emitted, with their bare name; a function declaration inside the
body of a module-level `const` function SHALL still be emitted as well.

A module-level `const` function SHALL be neither the source nor the target of any `calls` edge (see
"TypeScript calls"): a call inside its body has no edge, and neither has a call of it nor a reference
to it passed as an argument.

A symbol's span SHALL go from the first line of its declaration — its decorators, `export`,
`default` and other modifiers included, any comment before it (a JSDoc included) excluded — to the
last line of the declaration, as 1-based lines; for a module-level `const` function the declaration
is the whole variable statement, from its `export` or `const` keyword to its end. Its `signature`
SHALL be the text of the declaration from that start up to, and excluding, the opening `{` of its
body (the member list of a class or an interface, the body of a function or method, the block body of
an arrow function or of a function expression), or, for an arrow function whose body is an
expression, up to and including its `=>`; or, for a declaration without a body, up to and excluding
its terminating `;` or `,` (to its end when it has none), with every run of whitespace collapsed to
one space and trimmed. The rule of "Symbol extraction" on two symbols sharing file, name and start
line (keep the first in tree-walk order, add the `duplicate symbol "<name>"; kept the first`
diagnostic, never rename) SHALL apply.

#### Scenario: The task-api errors and repository have exact spans

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** the symbols of `src/domain/errors.ts` are exactly, in this order, as kind, name, start line
  and end line: `class DomainError` 6–15, `method DomainError::constructor` 7–14,
  `class TaskNotFoundError` 17–21, `method TaskNotFoundError::constructor` 18–20,
  `class IllegalStatusTransitionError` 23–27 and `method IllegalStatusTransitionError::constructor`
  24–26 (the JSDoc on lines 1–5 is outside the spans)
- **AND** the signature of `TaskNotFoundError` is `export class TaskNotFoundError extends DomainError`
- **AND** `src/repositories/task.repository.ts` has the symbol `interface TaskRepository` 22–28 and
  the five `method` symbols `TaskRepository::findById`, `TaskRepository::list`,
  `TaskRepository::create`, `TaskRepository::update` and `TaskRepository::delete`, on lines 23 to 27
  in that order, each spanning one line; the signature of `TaskRepository::findById` is
  `findById(id: string): Promise<Task | null>`

#### Scenario: Every class, interface and function of task-api is listed

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** the `class`, `interface` and `function` symbols are exactly these 38, by file:
  `src/app.ts`: `interface BuildAppOptions`, `function buildApp`; `src/config/env.ts`:
  `function loadEnv`; `src/controllers/health.controller.ts`: `class HealthController`;
  `src/controllers/tasks.controller.ts`: `class TasksController`; `src/domain/errors.ts`:
  `class DomainError`, `class TaskNotFoundError`, `class IllegalStatusTransitionError`;
  `src/domain/pagination.ts`: `interface Page`, `function buildPage`; `src/domain/task-priority.ts`:
  `function isTaskPriority`, `function priorityRank`; `src/domain/task-status.ts`:
  `function isTaskStatus`, `function canTransition`, `function allowedTransitions`;
  `src/domain/task.entity.ts`: `interface Task`, `interface CreateTaskInput`,
  `interface UpdateTaskInput`; `src/plugins/db.ts`: `function registerDb`;
  `src/plugins/error-handler.ts`: `function registerErrorHandler`; `src/plugins/swagger.ts`:
  `function registerSwagger`; `src/repositories/in-memory-task.repository.ts`:
  `class InMemoryTaskRepository`; `src/repositories/task.repository.ts`: `interface TaskQuery`,
  `interface TaskRepository`; `src/routes/health.routes.ts`: `function healthRoutes`;
  `src/routes/index.ts`: `function registerRoutes`; `src/routes/tasks.routes.ts`:
  `function taskRoutes`; `src/server.ts`: `function main`; `src/services/id.ts`: `function newId`;
  `src/services/task.filters.ts`: `function applyFilters`, `function matchesSearch`,
  `function sortTasks`, `function compareBy`, `function compareNullableDate`;
  `src/services/task.service.ts`: `class TaskService`, `function pruneUndefined`;
  `tests/helpers/build-app.ts`: `function buildTestApp`, `function makeTask`
- **AND** that is 7 `class`, 7 `interface` and 24 `function` symbols; the interface
  `FastifyInstance` inside `declare module 'fastify'` of `src/types/index.ts` is not among them
- **AND** the `method` symbols are exactly these 26, by class or interface:
  `DomainError::constructor`, `TaskNotFoundError::constructor` and
  `IllegalStatusTransitionError::constructor`; `TaskRepository::findById`, `TaskRepository::list`,
  `TaskRepository::create`, `TaskRepository::update` and `TaskRepository::delete`;
  `InMemoryTaskRepository::constructor`, `InMemoryTaskRepository::findById`,
  `InMemoryTaskRepository::list`, `InMemoryTaskRepository::create`, `InMemoryTaskRepository::update`
  and `InMemoryTaskRepository::delete` (the property `tasks` is not a symbol);
  `TaskService::constructor`, `TaskService::get`, `TaskService::list`, `TaskService::create`,
  `TaskService::update` and `TaskService::delete`; `TasksController::list`,
  `TasksController::getById`, `TasksController::create`, `TasksController::update` and
  `TasksController::remove`; and `HealthController::check`

#### Scenario: task-api files without such declarations have no symbols

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** `src/types/index.ts` (whose only interface is inside `declare module 'fastify'`),
  `src/schemas/index.ts`, `src/schemas/task.schema.ts` and `src/schemas/pagination.schema.ts` (only
  re-exports, `const` and `type`) have no symbol
- **AND** `vitest.config.ts` (a TypeScript file of kind `config` with no such declaration) and every
  file whose path does not end in `.ts` have no symbol

#### Scenario: Anonymous and expression classes yield only their methods

- **WHEN** `src/a.ts` with content
  `export default class { run(): void {} }\nconst B = class { go() {} };\n` is analysed
- **THEN** its symbols are exactly `method run` 1–1 and `method go` 2–2, with no prefix and no `class`
  symbol

#### Scenario: Only the implementation of an overload is a symbol

- **WHEN** `src/f.ts` with content
  `export function f(a: string): void;\nexport function f(a: number): void;\nexport function f(a: unknown): void {}\nexport abstract class Shape {\n  abstract area(): number;\n  scale(k: string): void;\n  scale(k: number): void;\n  scale(k: unknown): void {}\n}\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `function f` 3–3 with signature
  `export function f(a: unknown): void`, `class Shape` 4–9 with signature
  `export abstract class Shape`, `method Shape::area` 5–5 with signature `abstract area(): number`,
  and `method Shape::scale` 8–8 with signature `scale(k: unknown): void`

#### Scenario: TypeScript spans include decorators and modifiers, not JSDoc

- **WHEN** `src/m.ts` with content
  `/** Doc. */\n@Entity()\nexport class Model {\n  /** Save. */\n  @Column()\n  public async save(): Promise<void> {}\n  constructor(private readonly id: string) {}\n}\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `class Model` 2–8 with signature
  `@Entity() export class Model`, `method Model::save` 5–6 with signature
  `@Column() public async save(): Promise<void>`, and `method Model::constructor` 7–7 with signature
  `constructor(private readonly id: string)`

#### Scenario: Private members and comma-separated signatures are named exactly

- **WHEN** `src/p.ts` with content
  `export class P {\n  #run(): void {}\n}\nexport interface I { a(): void, b(): void }\n` is analysed
- **THEN** its symbols are exactly, in this order: `class P` 1–3, `method P::#run` 2–2 with signature
  `#run(): void`, `interface I` 4–4, `method I::a` 4–4 with signature `a(): void` and `method I::b`
  4–4 with signature `b(): void`

#### Scenario: Variables, types, accessors and ambient declarations are not symbols

- **WHEN** `src/n.ts` with content
  `export let a = () => 1;\nexport type T = { run(): void };\nexport enum E { A }\nexport class C {\n  handler = () => 1;\n  get v(): number { return 1; }\n  ['x']() {}\n}\nconst o = { m() {} };\ndeclare global { interface Window { x: number } }\nexport namespace N { export function g() {} }\ndeclare function h(): void;\nexport function outer(): void { function inner(): void {} }\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `class C` 4–8, `function inner` 13–13 and
  `function outer` 13–13 (the enclosing `outer` and the `inner` it contains have the same span, so
  they are ordered by name)
- **AND** `diagnostics` is empty

#### Scenario: Module-level const functions are function symbols

- **WHEN** `src/k.ts` with content
  `/** Adds one. */\nexport const f = (a: number): number => a + 1;\nconst g = async () => {\n  function inner(): void {}\n  return 1;\n};\nexport const h = function (x: string) {\n  return x;\n};\nconst t = <T,>(x: T): T => x;\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `function f` 2–2 with signature
  `export const f = (a: number): number =>`, `function g` 3–6 with signature
  `const g = async () =>`, `function inner` 4–4, `function h` 7–9 with signature
  `export const h = function (x: string)`, and `function t` 10–10 with signature
  `const t = <T,>(x: T): T =>` (the JSDoc on line 1 is outside the span of `f`)
- **AND** `diagnostics` is empty

#### Scenario: Other variable forms are not function symbols

- **WHEN** `src/v.ts` with content
  `let a = () => 1;\nvar b = () => 1;\nconst c = () => 1, d = () => 2;\nconst { e } = { e: () => 1 };\nconst z = 3;\nconst w = (() => 1);\nconst y = (() => 1) as () => number;\ndeclare const q: () => void;\nconst K = class { run() {} };\nexport function outer(): void { const inside = () => 1; }\nif (z) { const blocked = () => 1; }\nawait using f = async () => 1;\nusing g = () => 1;\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `method run` 9–9 and `function outer` 10–10
  (neither the `await using` statement of line 12 nor the `using` statement of line 13 is a symbol)
- **AND** `diagnostics` is empty

#### Scenario: Const functions are no endpoint of calls edges

- **WHEN** `src/c.ts` with content
  `export function target(): void {}\nexport const f = (): void => { target(); };\nexport function caller(): void { f(); [1].forEach(f); }\n`
  is analysed
- **THEN** its symbols are exactly `function target` 1–1, `function f` 2–2 and `function caller` 3–3
- **AND** no edge has `f` as its source or its target, and there is no `calls` edge at all

#### Scenario: Duplicate TypeScript symbols are dropped with a diagnostic

- **WHEN** `src/dup.ts` with content
  `export const a = class { run(x: number) {} }; export const b = class { run() {} };` is analysed
- **THEN** its symbols are exactly one `method run` with start line 1 and signature `run(x: number)`
- **AND** `diagnostics` is exactly one entry: `path` `src/dup.ts`, `line` 1, `message`
  `duplicate symbol "run"; kept the first`

