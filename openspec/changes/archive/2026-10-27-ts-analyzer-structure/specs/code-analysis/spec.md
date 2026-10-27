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
  coverage edges", "Documentation mention edges", "TypeScript code relation edges" and "TypeScript
  test coverage edges"; every edge SHALL have a non-empty `extractor`, a `resolution`, no `weight`,
  and both endpoints present in `files` or `symbols` of the same result; no two edges SHALL share
  `kind`, source and target;
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

### Requirement: Symbol extraction

The PHP analyzer SHALL parse for symbols only the files whose path ends in `.php`; every other file
SHALL appear in its `files` with no symbols. The symbols of the TypeScript analyzer are defined by
"TypeScript symbol extraction". For each parsed PHP file the analyzer SHALL emit:

- one `class` symbol per named class, named by its short name;
- one `interface` symbol per interface, named by its short name;
- one `function` symbol per named function declared outside any class, named by its short name;
- one `method` symbol per method, named `Type::method` when the enclosing type is named;
- one `route` symbol per route statement (array- or string-action form), as defined in "Array-action
  routes".

A symbol's span SHALL be the lines of its declaration, including its modifiers and attributes
(`#[...]`) and excluding any preceding doc comment. Its `signature` SHALL be the declaration's header
up to, and excluding, its body `{` or its terminating `;`, with every run of whitespace collapsed to
one space and trimmed. Closures and arrow functions SHALL NOT produce symbols. Enums and their
methods SHALL NOT produce symbols in this capability (the schema has no enum kind and no fixture
declares one).

A trait SHALL be emitted as a `class` symbol named by its short name whose `signature` starts with
`trait`, and its methods as `Trait::method`; the symbol kinds of the schema SHALL NOT be extended.
An anonymous class SHALL produce no class symbol; its methods SHALL be emitted with their bare name
(no prefix). Two symbols of one result SHALL never share file, name and start line: when a symbol
would share them with one already emitted for that file, in tree-walk order, it SHALL NOT be
emitted, and one diagnostic SHALL be added with the file's `path`, `line` equal to that start line
and `message` `duplicate symbol "<name>"; kept the first`. Symbols SHALL NOT be renamed to tell them
apart.

#### Scenario: PriceCalculator symbols have exact spans

- **GIVEN** the content of `fixtures/acme-shop/app/Services/PriceCalculator.php`
- **WHEN** it is analysed
- **THEN** its symbols are exactly, as kind, name, start line and end line:
  `class PriceCalculator` 16–44, `method PriceCalculator::__construct` 18–23,
  `method PriceCalculator::compute` 25–35 and `method PriceCalculator::taxableBase` 38–43 (the doc
  comments on lines 10–15 and 37 are outside the spans)
- **AND** the signature of `PriceCalculator::compute` is `public function compute(Order $order): Money`

#### Scenario: Symbol spans include modifiers and attributes

- **WHEN** `app/Base.php` with content `<?php\nabstract class Base {\n    abstract public function run(): void;\n}\n`
  is analysed
- **THEN** its symbols are `class Base` 2–4 with signature `abstract class Base`, and
  `method Base::run` 3–3 with signature `abstract public function run(): void`
- **WHEN** `app/Model.php` with content
  `<?php\n#[Entity]\nclass Model {\n    #[Column]\n    public function save(): void {}\n}\n` is analysed
- **THEN** its symbols are `class Model` 2–6 with signature `#[Entity] class Model`, and
  `method Model::save` 4–5 with signature `#[Column] public function save(): void`

#### Scenario: Every named class of acme-shop is listed

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** each of the 35 classes declared with a name appears as a `class` symbol in its file
- **AND** no file whose path does not end in `.php` (including `artisan`) has a symbol

#### Scenario: Interfaces and top-level functions are listed, enums are not

- **WHEN** `app/Payable.php` with content `<?php interface Payable { public function pay(): void; }`
  and `app/helpers.php` with content `<?php function helper(): int { return 1; }` are analysed
- **THEN** the symbols are `interface Payable`, `method Payable::pay` with signature
  `public function pay(): void`, and `function helper`
- **AND** `app/Status.php` with content
  `<?php enum Status { case A; public function label(): string { return 'a'; } }` has no symbol

#### Scenario: A trait is encoded as a class

- **GIVEN** the content of `fixtures/acme-shop/tests/CreatesApplication.php`
- **WHEN** it is analysed
- **THEN** it has a `class` symbol `CreatesApplication` whose signature is `trait CreatesApplication`,
  and a `method` symbol `CreatesApplication::createApplication`
- **AND** `diagnostics` is empty

#### Scenario: Anonymous classes yield only their methods

- **GIVEN** the content of the 5 files of `fixtures/acme-shop/database/migrations/`, each returning
  `new class extends Migration`
- **WHEN** they are analysed
- **THEN** they have no `class` symbol and exactly 10 `method` symbols, `up` and `down` in each file,
  with no prefix
- **AND** the closures passed to `Schema::create` produce no symbol

#### Scenario: Duplicate symbols are dropped with a diagnostic

- **WHEN** `app/Dup.php` with content
  `<?php $a = new class { function run($x){} }; $b = new class { function run(){} };` is analysed
- **THEN** its symbols are exactly one `method run` with start line 1 and signature
  `function run($x)` (the first in tree-walk order is the one kept)
- **AND** `diagnostics` has exactly one entry: `path` `app/Dup.php`, `line` 1, `message`
  `duplicate symbol "run"; kept the first`
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

### Requirement: Code relation edges

The PHP analyzer SHALL emit, with `resolution` `exact` and `extractor` `php-treesitter-laravel`:

- one `imports` edge from a parsed PHP file to the class, interface or trait symbol that each of its
  top-level `use` imports resolves to;
- one `extends` edge from a class symbol to the class its `extends` clause resolves to, and from an
  interface symbol to each interface its `extends` clause resolves to;
- one `implements` edge from a class symbol to each interface its `implements` clause resolves to.

An anonymous class SHALL originate no edge (it has no symbol). A file that could not be parsed SHALL
originate no edge of any kind and SHALL contribute no symbol as a target. The code relation edges of
the TypeScript analyzer are defined by "TypeScript code relation edges".

#### Scenario: Inheritance and imports of acme-shop

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** there are exactly 7 `extends` edges: from `OrderController` and from `CheckoutController`
  to the `Controller` of `app/Http/Controllers/Controller.php` (same namespace, no `use`), and from
  `CheckoutTest`, `OrderPricingTest`, `DiscountServiceTest`, `ShippingServiceTest` and
  `TaxServiceTest` to the `TestCase` of `tests/TestCase.php`; and there is no `implements` edge
- **AND** there are exactly 79 `imports` edges, among them one from the file `routes/api.php` to
  `OrderController`, and exactly 6 from the file `tests/Unit/PriceCalculatorTest.php`, to
  `PriceCalculator`, `DiscountService`, `TaxService`, `ShippingService`, `Order` and `Money`
- **AND** every one of them has `resolution` `exact` and `extractor` `php-treesitter-laravel`

#### Scenario: A file with a syntax error originates no edge

- **WHEN** `app/Broken.php` with content `<?php namespace App; use App\Ok; class Broken extends Ok { public function x( }`
  and `app/Ok.php` with content `<?php namespace App; class Ok {}` are analysed in the same call
- **THEN** no edge has `app/Broken.php`, or a symbol of it, as source
- **AND** `diagnostics` has one entry for `app/Broken.php`, and the graph validation of the wrapped
  result returns no error

### Requirement: Test coverage edges

A class `XTest` declared in a PHP file of kind `test` SHALL produce one `tested_by` edge from the
class symbol `X` to the class symbol `XTest`, with `resolution` `exact` and `extractor`
`php-treesitter-laravel`, when the file that declares `XTest` contains a class name (in a `use`
import, an `extends` or `implements` clause, a type, `new X`, `X::class` or a static call) that
resolves to the fully-qualified name of a class `X` of the input whose short name is `XTest` without
its `Test` suffix. A test class with no such reference SHALL produce no `tested_by` edge. The
`tested_by` edges of the TypeScript analyzer are defined by "TypeScript test coverage edges".

#### Scenario: The unit tests of acme-shop cover their classes

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** there are exactly 4 `tested_by` edges, `exact`: from `PriceCalculator` to
  `PriceCalculatorTest`, from `DiscountService` to `DiscountServiceTest`, from `ShippingService` to
  `ShippingServiceTest` and from `TaxService` to `TaxServiceTest`
- **AND** `CheckoutTest` and `OrderPricingTest` are the target of no `tested_by` edge

#### Scenario: A test class that does not reference its subject has no edge

- **WHEN** `app/Foo.php` with content `<?php namespace App; class Foo {}` and `tests/Unit/FooTest.php`
  with content `<?php namespace Tests\Unit; class FooTest { public function test_it(): void {} }` are
  analysed
- **THEN** there is no `tested_by` edge

## ADDED Requirements

### Requirement: TypeScript analysis input

The TypeScript analyzer SHALL satisfy "Analysis contract", with the file classification and line
count of "File classification". Its *TypeScript files* are the inputs whose path ends in `.ts` but
not in `.d.ts` and is canonical: one or more non-empty segments separated by `/`, none of them `.` or
`..`, with no `\` and no leading `/`. It SHALL parse as TypeScript only its TypeScript files. An input
with a non-canonical `.ts` path is not a TypeScript file: it is not part of the program, and on its
own it neither causes `tsconfig.json` to be read nor the compiler to be loaded. Every other input
SHALL appear in `files` with no symbols and SHALL originate no edge other than the `describes` edges
of "Documentation mention edges". A path that ends in `.ts` but not in `.d.ts` and is not canonical
SHALL add one diagnostic with that `path`, no `line` and `message`
`non-canonical path "<path>"; not parsed`.

All the TypeScript files of the input SHALL be analysed together as one program. When the input has
at least one TypeScript file, the input whose path is exactly `tsconfig.json`, when there is one,
SHALL supply the compiler options: its `compilerOptions`, read as the TypeScript compiler reads a
`tsconfig.json` (comments and trailing commas allowed), over the default options (module `esnext`,
module resolution `bundler`). Its `extends`, `references`, `files`, `include` and `exclude` SHALL be
ignored, and an option the compiler does not accept SHALL be ignored without a diagnostic. The
content of `tsconfig.json` cannot be parsed when the compiler reports any error while reading it as
a `tsconfig.json`, or when its root value is not an object. It SHALL then be ignored entirely: the
default options SHALL be used and one diagnostic SHALL be added with `path` `tsconfig.json`, a
non-empty `message` and, when the compiler gives a position, the 1-based `line` of the error; the
call SHALL NOT reject. A `compilerOptions` that is absent or not an object SHALL be read as no
options, without a diagnostic. When the input has no TypeScript file, `tsconfig.json` SHALL NOT be
read and SHALL add no diagnostic, whatever its content, and the compiler SHALL NOT be loaded.
Whatever the options, the analyzer SHALL NOT load the standard library or any declaration outside
its input: a module, type or name that is not declared in a TypeScript file of the input resolves to
nothing, and SHALL produce neither an edge nor a diagnostic.

`diagnostics` SHALL be ordered by `path` (UTF-16 code unit); the diagnostics of one path SHALL keep
the order in which they were produced: its duplicate-path diagnostics first, then its other
diagnostic (non-canonical path, unparsable `tsconfig.json` or syntax error) or its duplicate-symbol
diagnostics in tree-walk order.

#### Scenario: The task-api files are classified

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api` (the `.git` directory,
  `node_modules` and the untracked `package-lock.json` excluded)
- **WHEN** they are analysed
- **THEN** `files` has 38 entries, one per path, of which 25 are `source` (`src/**`), 6 are `test`
  (`tests/**`), 2 are `doc` (`README.md`, `docs/api.md`) and 5 are `config` (`.env.example`,
  `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`)
- **AND** every file's `loc` equals the line count of its content, and `diagnostics` is empty

#### Scenario: The task-api analysis is a valid deterministic graph

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed twice with the same input
- **THEN** both results are equal, and `files`, `symbols` and `edges` are in the order of "Analysis
  contract"
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: A TypeScript file is analysed from its content only

- **GIVEN** a file `src/ghost.ts` that does not exist on disk, with content `export class Ghost {}`
- **WHEN** it is analysed alone
- **THEN** the result has one file `src/ghost.ts` and one `class` symbol `Ghost`, and no error is
  raised

#### Scenario: Duplicate TypeScript input paths keep the first

- **WHEN** these four inputs are analysed in one call, in this order: `src/a.ts` with content
  `export class A {}`, `README.md` with content `# Readme`, `src/a.ts` with content
  `export class B {}` and `src/A.ts` with content `export class Upper {}`
- **THEN** `files` is exactly `README.md`, `src/A.ts` and `src/a.ts`, in that order
- **AND** `symbols` is exactly `class Upper` in `src/A.ts` and `class A` in `src/a.ts` (no `class B`)
- **AND** `diagnostics` is exactly one entry with `path` `src/a.ts`, no `line` and `message`
  `duplicate path "src/a.ts"; kept the first`

#### Scenario: Files that are not TypeScript are not parsed

- **WHEN** `src/a.tsx` with content `export class A {}`, `src/b.js` with content `export class B {}`,
  `src/c.d.ts` with content `export declare class C {}`, `src/d.mts` with content `export class D {}`
  and `src/e.ts` with content `import type { C } from './c.js';\nexport class E {}\n` are analysed
  together
- **THEN** all five are in `files`, the only symbol is `class E` in `src/e.ts`, `edges` is empty and
  `diagnostics` is empty

#### Scenario: A non-canonical TypeScript path is not parsed

- **WHEN** `./src/a.ts` with content `export class A {}`, `src\b.ts` with content `export class B {}`,
  `src/../d.ts` with content `export class D {}`, `/e.ts` with content `export class E {}`,
  `src//f.ts` with content `export class F {}` and `src/c.ts` with content `export class C {}` are
  analysed together
- **THEN** all six are in `files`, the only symbol is `class C` in `src/c.ts`
- **AND** `diagnostics` is exactly five entries with no `line`, in this order of `path`, each with
  `message` `non-canonical path "<path>"; not parsed`: `./src/a.ts`, `/e.ts`, `src/../d.ts`,
  `src//f.ts` and `src\b.ts`

#### Scenario: Compiler options come from the input tsconfig

- **WHEN** `tsconfig.json` with content `{ "compilerOptions": { "paths": { "@app/*": ["src/*"] } } }`,
  `src/y.ts` with content `export class Y {}` and `src/x.ts` with content
  `import { Y } from '@app/y.js';\nexport class X extends Y {}\n` are analysed together
- **THEN** there is an `imports` edge from the file `src/x.ts` to the file `src/y.ts` and an `extends`
  edge from `X` to `Y`, and `diagnostics` is empty

#### Scenario: An unreadable tsconfig falls back to the default options

- **WHEN** `tsconfig.json` with content `{ "compilerOptions": ` , `src/b.ts` with content
  `export class B {}` and `src/a.ts` with content
  `import { B } from './b.js';\nexport class A extends B {}\n` are analysed together
- **THEN** the call resolves; `tsconfig.json` is in `files` with kind `config`
- **AND** there is an `imports` edge from `src/a.ts` to `src/b.ts` and an `extends` edge from `A` to
  `B`
- **AND** `diagnostics` is exactly one entry, with `path` `tsconfig.json`, `line` 1 and a non-empty
  `message`

#### Scenario: A tsconfig whose root is not an object falls back to the default options

- **WHEN** `tsconfig.json` with content `null`, `src/b.ts` with content `export class B {}` and
  `src/a.ts` with content `import { B } from './b.js';\nexport class A extends B {}\n` are analysed
  together
- **THEN** the call resolves, there is an `imports` edge from `src/a.ts` to `src/b.ts` and an
  `extends` edge from `A` to `B`
- **AND** `diagnostics` is exactly one entry, with `path` `tsconfig.json`, `line` 1 and a non-empty
  `message`

#### Scenario: The tsconfig never selects files or loads declarations

- **WHEN** `tsconfig.json` with content
  `{ "extends": "./base.json", "files": [], "include": ["src/**/*.ts"], "exclude": ["tests"], "references": [{ "path": "./other" }], "compilerOptions": { "lib": ["ES2022"], "types": ["node"], "noLib": false, "notAnOption": true, }, }`,
  `src/foo.ts` with content `export class Foo extends Error {}` and `tests/foo.test.ts` with content
  `import { Foo } from '../src/foo.js';\nexport class FooCheck {}\n` are analysed together
- **THEN** `tests/foo.test.ts` has the symbol `class FooCheck`, there is an `imports` edge from
  `tests/foo.test.ts` to `src/foo.ts` and a `tested_by` edge from `src/foo.ts` to
  `tests/foo.test.ts`, and there is no `extends` edge (`Error` is not declared in the input)
- **AND** `diagnostics` is empty (the unknown option, `extends`, `references`, `files`, `include`,
  `exclude` and the trailing commas add none)

#### Scenario: Names outside the input resolve to nothing

- **WHEN** `src/a.ts` with content
  `import { z } from 'zod';\nimport { randomUUID } from 'node:crypto';\nimport { Gone } from './gone.js';\nexport class A extends Error implements Gone {}\n`
  is analysed alone
- **THEN** it has the symbol `class A`, `edges` is empty and `diagnostics` is empty

#### Scenario: A failed compiler load does not poison later calls

- **GIVEN** a TypeScript analyzer whose first attempt to load the TypeScript compiler fails, and
  whose later attempts succeed
- **WHEN** `src/ghost.ts` with content `export class Ghost {}` is analysed with it, and then analysed
  again with the same analyzer
- **THEN** the first call rejects
- **AND** the second call resolves with one `class` symbol `Ghost` in `src/ghost.ts`, and the compiler
  was loaded twice
- **AND** an input with no TypeScript file (`README.md` with content `# Readme`, `tsconfig.json` with
  content `{ "compilerOptions": ` and `./src/a.ts` with content `export class A {}`) resolves without
  loading the compiler, and its `diagnostics` is exactly one entry: `path` `./src/a.ts`, no `line`,
  `message` `non-canonical path "./src/a.ts"; not parsed`

### Requirement: TypeScript symbol extraction

For each TypeScript file parsed without a syntax error, the TypeScript analyzer SHALL emit:

- one `class` symbol per class declaration with a name, named by that name;
- one `interface` symbol per interface declaration, named by its name;
- one `function` symbol per function declaration with a name and a body, at any depth (the bodies
  of functions, methods, constructors, accessors, arrow functions, function expressions, class
  static blocks and class expressions included), except inside the declarations this requirement
  skips (`declare` declarations and `declare module`, `declare global`, `namespace` and `module`
  blocks), named by its name;
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
block, SHALL produce no symbol. Variables (`const`, `let`, `var`) and the class expressions, function
expressions and arrow functions assigned to them, object-literal methods, `type` aliases, enums,
class properties (whatever their value), property signatures, index signatures and `get` / `set`
accessors SHALL produce no symbol. The methods of a class expression SHALL still be emitted, with
their bare name.

A symbol's span SHALL go from the first line of its declaration — its decorators, `export`,
`default` and other modifiers included, any comment before it (a JSDoc included) excluded — to the
last line of the declaration, as 1-based lines. Its `signature` SHALL be the text of the declaration
from that start up to, and excluding, the opening `{` of its body (the member list of a class or an
interface, the body of a function or method), or, for a declaration without a body, up to and
excluding its terminating `;` or `,` (to its end when it has none), with every run of whitespace collapsed
to one space and trimmed. The rule of "Symbol extraction" on two symbols sharing file, name and start
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
  `export const a = () => 1;\nexport type T = { run(): void };\nexport enum E { A }\nexport class C {\n  handler = () => 1;\n  get v(): number { return 1; }\n  ['x']() {}\n}\nconst o = { m() {} };\ndeclare global { interface Window { x: number } }\nexport namespace N { export function g() {} }\ndeclare function h(): void;\nexport function outer(): void { function inner(): void {} }\n`
  is analysed
- **THEN** its symbols are exactly, in this order: `class C` 4–8, `function inner` 13–13 and
  `function outer` 13–13 (the enclosing `outer` and the `inner` it contains have the same span, so
  they are ordered by name)
- **AND** `diagnostics` is empty

#### Scenario: Duplicate TypeScript symbols are dropped with a diagnostic

- **WHEN** `src/dup.ts` with content
  `export const a = class { run(x: number) {} }; export const b = class { run() {} };` is analysed
- **THEN** its symbols are exactly one `method run` with start line 1 and signature `run(x: number)`
- **AND** `diagnostics` is exactly one entry: `path` `src/dup.ts`, `line` 1, `message`
  `duplicate symbol "run"; kept the first`

### Requirement: TypeScript syntax errors

A TypeScript file that the TypeScript parser reports a syntax error for SHALL still appear in `files`
with its `kind` and `loc`, SHALL have no symbols, SHALL originate no edge of any kind and SHALL add
exactly one diagnostic with its `path`, a non-empty `message` and the 1-based `line` of its first
syntax error. It MAY still be the target of an `imports` edge from another file. The analysis SHALL
NOT reject because of it, and the other files of the same call SHALL keep their symbols and edges.
Type errors (an unknown name, a module that does not resolve, a wrong type) SHALL NOT produce a
diagnostic.

#### Scenario: A TypeScript syntax error does not stop the analysis

- **WHEN** `src/broken.ts` with content
  `import { Ok } from './ok.js'; export class Broken extends Ok { run( }`, `src/ok.ts` with content
  `export class Ok {}` and `src/user.ts` with content
  `import { Broken } from './broken.js';\nexport class User {}\n` are analysed together
- **THEN** the analysis resolves; `src/broken.ts` is in `files` with kind `source` and `loc` 1, has no
  symbol and is the source of no edge
- **AND** `diagnostics` is exactly one entry, for `src/broken.ts`, with `line` 1 and a non-empty
  `message`
- **AND** `src/ok.ts` has its `class Ok`, `src/user.ts` its `class User`, and there is an `imports`
  edge from `src/user.ts` to `src/broken.ts`
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: Type errors are not diagnostics

- **WHEN** `src/dep.ts` with content `export class Dep {}` and `src/t.ts` with content
  `import { Dep } from './dep.js';\nimport { Missing } from './missing.js';\nexport function f(): number { return 'x'; }\nexport class T extends Missing {}\n`
  are analysed together
- **THEN** `diagnostics` is empty, the symbols of `src/t.ts` are `function f` and `class T`, and
  there is an `imports` edge from `src/t.ts` to `src/dep.ts` (the edges that resolve are still
  emitted)

### Requirement: TypeScript code relation edges

The TypeScript analyzer SHALL emit, with `resolution` `exact` and `extractor` `ts-compiler`:

- one `imports` edge from a TypeScript file to another TypeScript file of the input for each
  top-level `import … from`, side-effect `import '…'`, `export … from` or `export * from` statement of
  the first file, `import type` and `export type` included, whose module specifier resolves, with the
  compiler options of "TypeScript analysis input", to the second file; a pair of files SHALL have at
  most one such edge, whatever the number of statements that link them, and a file SHALL NOT import
  itself;
- one `extends` edge from a class symbol to the class or interface its `extends` clause names, and
  from an interface symbol to each class or interface its `extends` clause names;
- one `implements` edge from a class symbol to each class or interface its `implements` clause names.

A name of an `extends` or `implements` clause — an identifier or a qualified name such as `m.Aged`,
with or without type arguments — SHALL be resolved as the TypeScript compiler resolves it, following
import aliases, and SHALL be a target only when it resolves to exactly one declaration and that
declaration is a `class` or `interface` symbol of the same result; a name declared more than once
(merged interfaces, a class merged with an interface), a name outside the input and any other
expression (a call, a mixin) SHALL produce no edge. A class expression and an anonymous class SHALL
originate no `extends` or `implements` edge (they have no symbol). A class or interface declaration
dropped as a duplicate symbol (see "TypeScript symbol extraction") has no symbol either: it SHALL
originate no edge and SHALL be the target of none, and its edges SHALL NOT be given to the symbol
that was kept. Module specifiers that do not
resolve to a TypeScript file of the input (packages, `node:` modules, missing files, `.d.ts` files)
SHALL produce no edge; `require()`, dynamic `import()` and `import x = require()` SHALL produce none.

#### Scenario: The structural edges of task-api

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** there are exactly 2 `extends` edges, from `TaskNotFoundError` and from
  `IllegalStatusTransitionError` to `DomainError` (`DomainError extends Error` produces none), and
  exactly 1 `implements` edge, from `InMemoryTaskRepository` to `TaskRepository`
- **AND** there are exactly 54 `imports` edges, all from a file to a file, among them one from
  `src/schemas/index.ts` to `src/schemas/task.schema.ts` (an `export *`), one from
  `src/types/index.ts` to `src/repositories/task.repository.ts` (an `import type`) and a single one
  from `src/repositories/in-memory-task.repository.ts` to `src/domain/pagination.ts`; no edge targets
  a package (`fastify`, `zod`, `vitest`, `node:crypto`)
- **AND** every one of them has `resolution` `exact` and `extractor` `ts-compiler`
- **AND** the `describes` edges are exactly two, from `README.md` to `TaskRepository` and to
  `TaskService`, with `resolution` `heuristic` and `extractor` `doc-mention`

#### Scenario: Inheritance follows aliases and namespace imports

- **WHEN** `src/base.ts` with content
  `export class Base {}\nexport interface Named {}\nexport interface Aged {}\n` and `src/kid.ts` with
  content
  `import { Base as B } from './base.js';\nimport * as m from './base.js';\nimport type { Named } from './base.js';\nexport class Kid extends B implements Named, m.Aged {}\nexport interface Both extends Named, m.Aged {}\nexport const Anon = class extends B {};\n`
  are analysed together
- **THEN** the edges are exactly: one `imports` edge from `src/kid.ts` to `src/base.ts`; `extends`
  edges from `Kid` to `Base`, from `Both` to `Named` and from `Both` to `Aged`; and `implements` edges
  from `Kid` to `Named` and from `Kid` to `Aged`

#### Scenario: A merged declaration is not an inheritance target

- **WHEN** `src/i.ts` with content
  `export interface Shape {}\nexport interface Shape { area(): number }\nexport class Sq implements Shape { area(): number { return 1; } }\n`
  is analysed
- **THEN** it has two `interface Shape` symbols (lines 1 and 2) and `edges` is empty

#### Scenario: Every import form is one file edge

- **WHEN** `src/side.ts` with content `export {};`, `src/t.ts` with content `export type T = 1;`,
  `src/v.ts` with content `export const v = 1;` and `src/a.ts` with content
  `import './side.js';\nimport type { T } from './t.js';\nexport * from './t.js';\nexport { v } from './v.js';\nimport { w } from './missing.js';\nimport z from 'zod';\nimport { v as again } from './v.js';\n`
  are analysed together
- **THEN** the edges are exactly three `imports` edges, from `src/a.ts` to `src/side.ts`, to
  `src/t.ts` and to `src/v.ts`, and `diagnostics` is empty

#### Scenario: Self-imports and CommonJS forms produce no edge

- **WHEN** `src/b.ts` with content `export class B {}` and `src/s.ts` with content
  `import './s.js';\nconst r = require('./b');\nconst d = import('./b.js');\nimport b = require('./b');\nexport class S {}\n`
  are analysed together
- **THEN** `edges` is empty and `diagnostics` is empty

#### Scenario: Type arguments are followed, other heritage expressions are not

- **WHEN** `src/h.ts` with content
  `export class Base<T> {}\nexport function mixin<T>(b: T): T { return b; }\nexport class K extends Base<string> {}\nexport class M extends mixin(Base) {}\n`
  is analysed
- **THEN** the edges are exactly one `extends` edge, from `K` to `Base`

#### Scenario: A dropped duplicate declaration is neither source nor target of an edge

- **WHEN** `src/b.ts` with content `export class B {}` and `src/a.ts` with content
  `import { B } from './b.js';\nfunction f() { class A {} } function g() { class A extends B {} }\nfunction h() { class C {} } function k() { class C {} class D extends C {} }\n`
  are analysed together
- **THEN** the edges are exactly one `imports` edge, from `src/a.ts` to `src/b.ts` (the `A` of `g`,
  dropped as a duplicate, originates no `extends` edge, and `D` extends the `C` of `k`, also dropped,
  so it has none)
- **AND** `diagnostics` is exactly two entries for `src/a.ts`: `line` 2 with `message`
  `duplicate symbol "A"; kept the first`, and `line` 3 with `message`
  `duplicate symbol "C"; kept the first`

### Requirement: TypeScript test coverage edges

The TypeScript analyzer SHALL emit one `tested_by` edge from a file `S` to a file `T`, with
`resolution` `exact` and `extractor` `ts-compiler`, when `T` is a TypeScript file of kind `test` whose
file name is `<base>.test.ts` or `<base>.spec.ts`, `S` is a TypeScript file of a kind other than
`test`, parsed without a syntax error, whose file name is `<base>.ts` (in any directory), and the
result has an `imports` edge from `T` to `S`. A test file that imports no such file SHALL produce no
`tested_by` edge.

#### Scenario: The unit tests of task-api cover their files

- **GIVEN** the content of the 38 tracked files of `fixtures/task-api`
- **WHEN** they are analysed
- **THEN** there are exactly 3 `tested_by` edges, `exact`, extractor `ts-compiler`, from a file to a
  file: from `src/domain/task-status.ts` to `tests/unit/task-status.test.ts`, from
  `src/services/task.filters.ts` to `tests/unit/task.filters.test.ts` and from
  `src/services/task.service.ts` to `tests/unit/task.service.test.ts`
- **AND** `tests/integration/tasks.routes.test.ts` and `tests/integration/validation.test.ts` are the
  target of none

#### Scenario: A test file that does not import its subject has no edge

- **WHEN** `src/foo.ts` with content `export class Foo {}` and `tests/unit/foo.test.ts` with content
  `import { it } from 'vitest';\nit('works', () => {});\n` are analysed together
- **THEN** there is no `tested_by` edge

#### Scenario: The base name and the import pick the subject

- **WHEN** `src/a/foo.ts` with content `export class FooA {}`, `src/b/foo.ts` with content
  `export class FooB {}` and `tests/foo.spec.ts` with content
  `import { FooA } from '../src/a/foo.js';\nimport { FooB } from '../src/b/foo.js';\nimport { Bar } from '../src/bar.js';\n`,
  and `src/bar.ts` with content `export class Bar {}` are analysed together
- **THEN** the `tested_by` edges are exactly two: from `src/a/foo.ts` and from `src/b/foo.ts` to
  `tests/foo.spec.ts` (`src/bar.ts` is imported but its name does not match)

#### Scenario: A subject with a syntax error has no tested_by edge

- **WHEN** `src/foo.ts` with content `export class Foo { run( }` and `tests/foo.test.ts` with content
  `import { Foo } from '../src/foo.js';\n` are analysed together
- **THEN** there is an `imports` edge from `tests/foo.test.ts` to `src/foo.ts` and no `tested_by` edge
- **AND** `diagnostics` is exactly one entry, for `src/foo.ts`, with `line` 1 and a non-empty
  `message`
