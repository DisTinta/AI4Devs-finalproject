## MODIFIED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per input file, with its `path`, its `kind` and its `loc`, and no
  `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: the `GraphEdge`s between those files and symbols defined by the requirements "Code
  relation edges", "Array-action routes", "Test coverage edges" and "Documentation mention edges";
  every edge SHALL have a non-empty `extractor`, a `resolution`, no `weight`, and both endpoints
  present in `files` or `symbols` of the same result; no two edges SHALL share `kind`, source and
  target;
- `diagnostics`: one `{ path, message, line? }` per file that could not be parsed, and one per symbol
  dropped as a duplicate (see Symbol extraction); a file MAY have more than one.

The result SHALL be accepted by the graph validation of `graph-store` once wrapped in a graph with no
commits and no file–commit links. The result SHALL be deterministic: the same input SHALL produce an
equal result. `files` SHALL be ordered by `path`, and `symbols` by file `path`, then `startLine`, then
the enclosing symbol before the symbols it contains, then `name`. `edges` SHALL be ordered by `kind`,
then source endpoint, then target endpoint, where an endpoint is ordered by its file `path`, then a
file endpoint before the symbol endpoints of that path, then symbol `name`, then `startLine`. Kinds,
paths and names SHALL be compared by UTF-16 code unit, not by locale.

The analyzer SHALL use only the content it receives: it SHALL NOT read the analysed repository's
files, open a network connection, or execute or install anything from the analysed repository.
Loading its own parser is the only file it MAY read.

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

### Requirement: File classification

Every path SHALL be classified into exactly one kind by a single language-independent rule, with
`/` as separator and the first matching kind winning:

1. `test` when any directory segment is `tests`, `test` or `__tests__`, or the file name matches
   `*.test.*`, `*.spec.*` or `*Test.php`;
2. `doc` when any directory segment is `docs`, or the extension is `.md`;
3. `config` when the first segment is `config`, or the extension is `json`, `xml`, `yml`, `yaml`,
   `toml` or `ini`, or the file name starts with `.`, or matches `*.config.*`;
4. `source` otherwise.

The rule SHALL live in the domain, independent of any analyzer, so every analyzer classifies files
and counts lines identically. A file's `loc` SHALL be its number of lines: `0` for empty content, otherwise the number
of `\n`-separated lines, a final line terminator not counting as an extra line (`\r\n` counts as one
terminator).

#### Scenario: Paths are classified by the canonical rule

- **WHEN** paths are classified
- **THEN** `tests/Unit/TaxServiceTest.php` is `test`, `tests/unit/task.service.test.ts` is `test`,
  `docs/api.md` is `doc`, `tsconfig.json` is `config`, `src/config/env.ts` is `source` (its `config`
  segment is not the first) and `app/Services/TaxService.php` is `source`

#### Scenario: The acme-shop files are classified

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `files` has 53 entries, one per path, of which 8 are `test` (`tests/**`), 2 are `doc`
  (`README.md`, `docs/pricing.md`), 7 are `config` (`config/app.php`, `config/services.php`,
  `config/shop.php`, `composer.json`, `phpunit.xml`, `.env.example`, `.gitignore`) and 36 are
  `source` (including `artisan`)
- **AND** every file's `loc` equals the line count of its content
- **AND** `routes/web.php` and `config/app.php` appear in `files` and produce no symbols (valid PHP
  with no class, interface or function declaration and no array-action route), and the only symbols
  of `routes/api.php` are its two `route` symbols

#### Scenario: Line count of a file

- **WHEN** the line count of the contents `''`, `'a'`, `'a\n'`, `'a\nb\n'` and `'a\r\nb'` is computed
  by the domain rule
- **THEN** it is `0`, `1`, `1`, `2` and `2`

#### Scenario: A described file has no contentHash or redacted

- **WHEN** a file's path and content are described by the domain rule
- **THEN** the resulting `GraphFile` has `path`, `kind` and `loc`, and no `contentHash` or `redacted`
  field

### Requirement: Symbol extraction

Only files whose path ends in `.php` SHALL be parsed for symbols; every other file SHALL appear in
`files` with no symbols. For each parsed file the analyzer SHALL emit:

- one `class` symbol per named class, named by its short name;
- one `interface` symbol per interface, named by its short name;
- one `function` symbol per named function declared outside any class, named by its short name;
- one `method` symbol per method, named `Type::method` when the enclosing type is named;
- one `route` symbol per array-action route, as defined in "Array-action routes".

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

## ADDED Requirements

### Requirement: PHP name resolution

Every class, interface and trait symbol of a parsed PHP file SHALL have a fully-qualified name: the
file's `namespace` (none for the global namespace) joined with `\` to its short name. A class name
written in a parsed PHP file SHALL be resolved to a fully-qualified name as PHP resolves class names:

- a fully-qualified name (`\A\B`) is itself without the leading `\`;
- an unqualified or qualified name whose first segment matches the alias of a top-level `use` import
  of that file (the last segment of the imported name, or the name after `as`; including group
  imports `use A\{B, C as D}`) is the imported name followed by the remaining segments;
- any other name is the file's namespace joined with the name.

`use function` and `use const` imports, and `use` inside a class body (trait use), SHALL NOT take
part in resolution. A resolved name SHALL be a target only when exactly one class, interface or trait
symbol of the same result has that fully-qualified name; otherwise no edge SHALL be emitted for it.
Names SHALL be compared case-sensitively. A file that declares more than one `namespace` SHALL
originate no edge that depends on name resolution.

#### Scenario: Names resolve by fully-qualified name, never by short name

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `PriceCalculatorTest` in `tests/Unit/PriceCalculatorTest.php` (which imports
  `PHPUnit\Framework\TestCase`) is the source of no `extends` edge, in particular none to the
  `TestCase` of `tests/TestCase.php`
- **AND** no edge targets a class outside the input: the imports of `Illuminate\…`, `Mockery` and
  `PHPUnit\…`, and `Controller extends BaseController` (an alias of a vendor class), produce no edge
- **AND** `use HasFactory;` in `app/Models/Order.php` and `use CreatesApplication;` in
  `tests/TestCase.php` (trait use inside a class body) produce no `imports` edge

#### Scenario: Aliases, group imports and ambiguous names

- **WHEN** `app/Contracts/Prices.php` with content
  `<?php namespace App\Contracts; interface Prices {} interface Taxes {}`, `app/A.php` with content
  `<?php namespace App; use App\Contracts\{Prices as P, Taxes}; class A implements P, Taxes {}`,
  `app/One/Dup.php` with content `<?php namespace App\One; class Dup {}`, `app/Two/Dup.php` with
  content `<?php namespace App\One; class Dup {}` and `app/B.php` with content
  `<?php namespace App; class B extends \App\One\Dup {}` are analysed
- **THEN** there are `implements` edges from `A` to `Prices` and from `A` to `Taxes`
- **AND** there is no `extends` edge from `B`, because `App\One\Dup` names two symbols

### Requirement: Code relation edges

The analyzer SHALL emit, with `resolution` `exact` and `extractor` `php-treesitter-laravel`:

- one `imports` edge from a parsed PHP file to the class, interface or trait symbol that each of its
  top-level `use` imports resolves to;
- one `extends` edge from a class symbol to the class its `extends` clause resolves to, and from an
  interface symbol to each interface its `extends` clause resolves to;
- one `implements` edge from a class symbol to each interface its `implements` clause resolves to.

An anonymous class SHALL originate no edge (it has no symbol). A file that could not be parsed SHALL
originate no edge of any kind and SHALL contribute no symbol as a target.

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

### Requirement: Array-action routes

A top-level statement of a parsed PHP file of the form `Route::<verb>('<uri>', [X::class, '<m>'])`,
optionally followed by chained method calls (`->name(…)`, `->middleware(…)`), where `<verb>` is one of
`get`, `post`, `put`, `patch`, `delete` or `options`, `<uri>` and `<m>` are string literals without
interpolation, and `Route` is either not imported or imported as `Illuminate\Support\Facades\Route`,
SHALL produce one `route` symbol:

- `name`: `<VERB> <uri>`, the verb in upper case and the URI exactly as written (e.g.
  `GET /orders/{order}`);
- span: the lines of the statement;
- `signature`: the statement's text without its terminating `;`, every run of whitespace collapsed to
  one space and trimmed.

When `X` resolves (see "PHP name resolution") to a class of the input that declares a method `<m>`,
the analyzer SHALL emit one `calls` edge from the route symbol to the method symbol `X::<m>`, with
`resolution` `exact` and `extractor` `php-treesitter-laravel`; otherwise the route symbol SHALL be
emitted with no edge. String actions (`'Controller@method'`), closures, other verbs or `Route`
methods, and route statements nested in a closure or a group SHALL produce no `route` symbol.

#### Scenario: The API routes of acme-shop point at their controller actions

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `routes/api.php` has exactly two symbols, `route` `GET /orders` with span 12–12 and
  `route` `GET /orders/{order}` with span 13–13
- **AND** there is a `calls` edge, `exact`, from `GET /orders` to `OrderController::index` and from
  `GET /orders/{order}` to `OrderController::show`, both in `app/Http/Controllers/OrderController.php`
- **AND** `routes/web.php`, with a closure route and the string action
  `'App\Http\Controllers\CheckoutController@store'`, has no `route` symbol and originates no edge

#### Scenario: A route to an action outside the input has no edge

- **WHEN** `routes/api.php` with content
  `<?php use App\Http\Ghost; Route::post('/ghost', [Ghost::class, 'run'])->name('ghost');` is analysed
  alone
- **THEN** it has one `route` symbol `POST /ghost` whose signature is
  `Route::post('/ghost', [Ghost::class, 'run'])->name('ghost')`, and `edges` is empty

### Requirement: Test coverage edges

A class `XTest` declared in a file of kind `test` SHALL produce one `tested_by` edge from the class
symbol `X` to the class symbol `XTest`, with `resolution` `exact` and `extractor`
`php-treesitter-laravel`, when the file that declares `XTest` contains a class name (in a `use`
import, an `extends` or `implements` clause, a type, `new X`, `X::class` or a static call) that
resolves to the fully-qualified name of a class `X` of the input whose short name is `XTest` without
its `Test` suffix. A test class with no such reference SHALL produce no `tested_by` edge.

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

### Requirement: Documentation mention edges

A file of kind `doc` SHALL produce one `describes` edge from the file to a symbol, with `resolution`
`heuristic`, when the symbol's `name` appears in the file inside an inline code span (text between a
pair of backticks on one line) or a fenced code block (lines between two lines starting with three
backticks), as a whole identifier (a maximal run of ASCII letters, digits and `_` not starting with a
digit) or as two such identifiers joined by `::`. The comparison SHALL be case-sensitive. A name
held by more than one symbol of the result SHALL produce no edge; `route` symbols SHALL never match.
Text outside code spans and fenced blocks SHALL NOT produce edges. The rule SHALL live in the domain,
independent of any analyzer, and the `extractor` of every `describes` edge SHALL be `doc-mention`,
the same for every analyzer.

#### Scenario: The acme-shop README describes the symbols it names in code

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** the `describes` edges from `README.md` go exactly to `Order`, `OrderLine`, `Product`,
  `Customer`, `Coupon`, `PriceCalculator`, `DiscountService`, `TaxService`, `ShippingService`,
  `CouponValidator`, `CarrierGateway`, `Pricing`, `Money`, `CreatesApplication` and
  `PriceCalculator::compute`, all with `resolution` `heuristic` and `extractor` `doc-mention`
- **AND** `docs/pricing.md`, which names no symbol inside code, originates no edge (its prose
  "Order of operations" and "Pricing rules" does not count)

#### Scenario: Prose and ambiguous names produce no describes edge

- **WHEN** the domain rule is applied to a doc `docs/a.md` with content
  "Order of operations: see `Order` and `Line` and `Total::sum`." and to the symbols `class Order`
  (`app/Order.php`), `class Line` in `app/A/Line.php` and `class Line` in `app/B/Line.php`, and
  `method Total::sum` (`app/Total.php`)
- **THEN** it returns exactly two `describes` edges from `docs/a.md`: to `Order` and to `Total::sum`
