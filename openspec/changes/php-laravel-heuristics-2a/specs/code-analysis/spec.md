## MODIFIED Requirements

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
- **AND** `config/app.php` appears in `files` and produces no symbols (valid PHP with no class,
  interface or function declaration and no route)
- **AND** `routes/web.php` appears in `files` and its only symbol is the `route` `POST /checkout` of
  its string action (its closure route produces none), and the only symbols of `routes/api.php` are
  its two `route` symbols

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

### Requirement: Array-action routes

Despite its name, this requirement covers both route action forms: array actions and string actions
(`'Controller@method'`). The name is kept so that the delta merges into the existing requirement.

A top-level statement of a parsed PHP file of the form `Route::<verb>('<uri>', <action>)`, optionally
followed by any chained method calls (e.g. `->name(…)`, `->middleware(…)`), where `<verb>` is one of
`get`, `post`, `put`, `patch`, `delete` or `options`, `<uri>` is a string literal without
interpolation, `Route` is either not imported or imported as `Illuminate\Support\Facades\Route`, and
`<action>` has one of these two forms:

1. **Array action**: `[X::class, '<m>']`, where `<m>` is a string literal without interpolation;
2. **String action**: `'<C>@<m>'`, a *plain string literal* — single- or double-quoted, with no
   escape sequence and no interpolation — whose content holds exactly one `@`, with a non-empty
   `<C>` before it that does not start with `\` and a non-empty `<m>` after it;

SHALL produce one `route` symbol:

- `name`: `<VERB> <uri>`, the verb in upper case and the URI exactly as written (e.g.
  `GET /orders/{order}`);
- span: every line of the statement, from its first line to its last, chained calls included;
- `signature`: the statement's text without its terminating `;`, every run of whitespace collapsed to
  one space and trimmed.

For an array action, when `X` resolves (see "PHP name resolution") to a class of the input that
declares a method `<m>`, the analyzer SHALL emit one `calls` edge from the route symbol to the method
symbol `X::<m>`, with `resolution` `exact` and `extractor` `php-treesitter-laravel`.

For a string action, `<C>` SHALL be taken as a fully-qualified class name exactly as written: it is
never resolved through the file's `use` imports and never prefixed with a namespace. When `<C>` is the
fully-qualified name of exactly one class of the input that declares a method `<m>`, the analyzer
SHALL emit one `calls` edge from the route symbol to the method symbol `<C>::<m>`, with `resolution`
`heuristic` and `extractor` `php-treesitter-laravel`: the class is named by a string, following
Laravel's `Controller@method` convention, not by a class reference.

Otherwise the route symbol SHALL be emitted with no edge. A string action with an escape sequence,
with interpolation, without `@`, with more than one `@`, with an empty part or with a leading `\`,
closures, other verbs or `Route` methods, and route statements nested in a closure or a group SHALL
produce no `route` symbol.

#### Scenario: The API routes of acme-shop point at their controller actions

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `routes/api.php` has exactly two symbols, `route` `GET /orders` with span 12–12 and
  `route` `GET /orders/{order}` with span 13–13
- **AND** there is a `calls` edge, `exact`, from `GET /orders` to `OrderController::index` and from
  `GET /orders/{order}` to `OrderController::show`, both in `app/Http/Controllers/OrderController.php`

#### Scenario: The string route of acme-shop is a heuristic call

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `routes/web.php` has exactly one symbol, `route` `POST /checkout` with span 13–15 and
  signature
  `Route::post('/checkout', 'App\Http\Controllers\CheckoutController@store') ->middleware('cart.not_empty') ->name('checkout.store')`
- **AND** `POST /checkout` is the source of exactly one edge: a `calls` edge, `heuristic`, extractor
  `php-treesitter-laravel`, to `CheckoutController::store` in
  `app/Http/Controllers/CheckoutController.php`
- **AND** the closure route `Route::get('/', …)` of `routes/web.php` produces no symbol

#### Scenario: A route to an action outside the input has no edge

- **WHEN** `routes/api.php` with content
  `<?php use App\Http\Ghost; Route::post('/ghost', [Ghost::class, 'run'])->name('ghost');` is analysed
  alone
- **THEN** it has one `route` symbol `POST /ghost` whose signature is
  `Route::post('/ghost', [Ghost::class, 'run'])->name('ghost')`, and `edges` is empty

#### Scenario: A multi-line array-action route spans its whole statement

- **WHEN** `routes/api.php` with content
  `<?php\nuse App\Http\Ghost;\nRoute::post('/ghost', [Ghost::class, 'run'])\n    ->name('ghost');\n`
  (`\n` being a line break) is analysed alone
- **THEN** its only symbol is the `route` `POST /ghost` with span 3–4

#### Scenario: Malformed string actions produce no route

- **WHEN** `routes/web.php` with content
  `<?php\nRoute::get('/a', 'App\Ghost@run');\nRoute::get('/b', 'NoAt');\nRoute::get('/c', "App\X@{$m}");\nRoute::get('/d', '\App\Ghost@run');\nRoute::get('/e', 'App\\Ghost@run');\nRoute::get('/f', 'App\Ghost@run@x');\nRoute::get('/g', '@run');\nRoute::get('/h', 'App\Ghost@');\n`
  (`\n` being a line break; every other backslash is written as is in the PHP source) is analysed
  alone
- **THEN** its only symbol is the `route` `GET /a` with span 2–2, and `edges` is empty (`App\Ghost` is
  not a class of the input)
- **AND** none of `GET /b` to `GET /h` is a symbol: no `@`, interpolation, leading `\`, escape
  sequence, two `@`, empty class part and empty method part respectively

### Requirement: Declared-type calls

A call written in the body of a method of a named class, interface or trait of a parsed PHP file —
and not inside a closure, an arrow function, an anonymous class, or a named class, interface, trait
or function declared in that body — SHALL produce one `calls` edge from that method symbol
(`Type::method`) to a method symbol, with `resolution` `exact` and `extractor`
`php-treesitter-laravel`, when it has one of these forms:

1. **Typed property**: `$this->p->m(...)`, where `p` is a non-static property declared in the
   caller's own type, either as a property declaration or as a promoted constructor parameter, with a
   single named type (not nullable, not a union, not an intersection) that resolves (see "PHP name
   resolution") to a class or interface `X` of the input; the target is `X::m`.
2. **Explicit static call**: `X::m(...)` where `X` is a class name that resolves to a class or
   interface `X` of the input; the target is `X::m`.
3. **Instantiation**: `new X(...)` where `X` is a class name that resolves to a class `X` of the
   input; the target is `X::__construct`. `new self(...)` targets `__construct` of the caller's own
   type.
4. **Own type**: `$this->m(...)` or `self::m(...)`; the target is `m` of the caller's own type.

The target SHALL be emitted only when the method is declared in the body of that type itself; a
method that type inherits, or that it handles through `__call` or `__callStatic`, SHALL NOT be a
target. A trait SHALL never be the target type, in any form (its methods run as part of the class
that uses it); an instantiation (`new X(...)`, `new self(...)`) SHALL target a class only, never an
interface or a trait. Any other call — on a parameter, a local variable, an untyped, nullable, union
or intersection-typed property, a static property, a property not declared in the caller's type,
`parent::`, `static::`,
`?->`, `new static`, a variable class or method name, or a function — SHALL produce no
edge. An own-type call (`$this->m(...)`, `self::m(...)`, `new self(...)`) SHALL target only a method
declared in the body of the very declaration that contains the caller, never one of another type of
the same name declared elsewhere in the file. Class and method names SHALL be compared
case-sensitively, although PHP treats them case-insensitively: a call written with a different case
than the declaration MAY yield no edge (a false negative), never a wrong one. A call that would be a
target of more than one form, or that appears more than once in the same
method, SHALL yield a single edge. A file that could not be parsed, or that declares more than one
`namespace`, SHALL originate no such edge. No `calls` edge of this requirement SHALL be `heuristic`;
calls this requirement leaves without an edge MAY get a `heuristic` one under "Laravel heuristic
calls".

#### Scenario: The constructor-injected services of acme-shop are exact calls

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** there are `calls` edges, `exact`, extractor `php-treesitter-laravel`: from
  `PriceCalculator::compute` to `DiscountService::discountFor`, `TaxService::taxFor` and
  `ShippingService::shippingFor`; from `PriceCalculator::taxableBase` to
  `DiscountService::discountFor`; and from `DiscountService::discountFor` to
  `CouponValidator::percentFor`, `Money::zero`, `DiscountApplied::__construct`,
  `DiscountService::loyaltyPercent` and `DiscountService::volumeBonus`
- **AND** the two `calls` edges of `routes/api.php` are still present: from `GET /orders` to
  `OrderController::index` and from `GET /orders/{order}` to `OrderController::show`
- **AND** the result has exactly 47 `calls` edges with `resolution` `exact`: those 2 from
  `routes/api.php` and 45 from method bodies

#### Scenario: The heuristic call sites of acme-shop have no exact edge

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** no `exact` `calls` edge goes from `OrderController::show` or `CheckoutController::store` to
  a symbol of `app/Services/PriceCalculator.php` or `app/Facades/Pricing.php`
- **AND** no `exact` `calls` edge goes from `ShippingService::shippingFor` to a symbol of
  `app/Services/CarrierGateway.php`, `CarrierGateway::__call` included
- **AND** no `exact` `calls` edge goes from `OrderObserver::created` or `OrderObserver::updated` to
  `RecalculateTotals::handle`, or from `OrderObserver::created` or `DiscountService::discountFor` to a
  symbol under `app/Listeners/`
- **AND** no `calls` edge goes from `PriceCalculator::compute` to a symbol of `app/Models/Order.php`
- **AND** `AppServiceProvider::register`, whose instantiations are all inside arrow functions,
  originates no `calls` edge, and no symbol of `routes/web.php` is the source of an `exact` edge

#### Scenario: Instantiation, static and own-type calls

- **WHEN** `app/Support/Clock.php` with content
  `<?php namespace App\Support; class Clock { public function __construct() {} public static function now(): int { return 0; } }`
  and `app/Job.php` with content
  `<?php namespace App; use App\Support\Clock; class Job { private Clock $clock; public function __construct() {} public function run(): void { new Clock(); Clock::now(); Clock::now(); $this->clock->now(); $this->tick(); self::tick(); new self(); new static(); } private function tick(): void {} }`
  are analysed together
- **THEN** `Job::run` is the source of exactly four `calls` edges, all `exact`: to
  `Clock::__construct`, to `Clock::now`, to `Job::tick` and to `Job::__construct`
- **AND** `new static()` contributes no edge

#### Scenario: A call through an interface-typed property targets the interface method

- **WHEN** `app/Contracts/Rates.php` with content
  `<?php namespace App\Contracts; interface Rates { public function rateFor(string $c): int; }` and
  `app/Quote.php` with content
  `<?php namespace App; use App\Contracts\Rates; class Quote { public function __construct(private readonly Rates $rates) {} public function total(): int { return $this->rates->rateFor('ES'); } }`
  are analysed together
- **THEN** the result has exactly one `calls` edge, `exact`, from `Quote::total` to `Rates::rateFor`

#### Scenario: Receivers without a usable declared type produce no edge

- **WHEN** `app/Support/Clock.php` (as above), `app/Support/Plain.php` with content
  `<?php namespace App\Support; class Plain {}` and `app/Bad.php` with content
  `<?php namespace App; use App\Support\{Clock, Plain}; class Bad { private ?Clock $a; private Clock|int $b; private $c; public function run(Clock $p): void { $this->a->now(); $this->b->now(); $this->c->now(); $this->clock->now(); $p->now(); $this->missing(); Log::info('x'); Clock::missing(); new Plain(); $f = fn () => new Clock(); } }`
  are analysed together
- **THEN** `Bad::run` is the source of no `calls` edge

#### Scenario: Calls inside a type or function declared in a method body produce no edge

- **WHEN** `app/Support/Clock.php` (as above) and `app/Outer.php` with content
  `<?php namespace App; use App\Support\Clock; class Outer { public function run(): void { class Inner { public function g(): void { $this->tick(); Clock::now(); new Clock(); } } function helper(): int { return Clock::now(); } } public function tick(): void {} }`
  are analysed together
- **THEN** the result has a method symbol `Inner::g`, and no `calls` edge at all: neither
  `Outer::run` nor `Inner::g` is the source of one, in particular no edge from `Outer::run` to
  `Outer::tick`

#### Scenario: Traits are never targets and only classes are instantiated

- **WHEN** `app/Support/Clock.php` (as above), `app/Concerns/Stamps.php` with content
  `<?php namespace App\Concerns; trait Stamps { public function __construct() {} public static function make(): void {} public function stamp(): void {} }`,
  `app/Contracts/Made.php` with content
  `<?php namespace App\Contracts; interface Made { public function __construct(); public static function build(): void; }`,
  `app/Uses.php` with content
  `<?php namespace App; use App\Concerns\Stamps; use App\Contracts\Made; class Uses { private Stamps $s; public function run(): void { Stamps::make(); new Stamps(); $this->s->stamp(); new Made(); Made::build(); } }`
  and `app/Concerns/Ticks.php` with content
  `<?php namespace App\Concerns; use App\Support\Clock; trait Ticks { public function tick(): void { Clock::now(); $this->tock(); self::tock(); new self(); } public function tock(): void {} }`
  are analysed together
- **THEN** `Uses::run` is the source of exactly one `calls` edge, `exact`, to `Made::build`
- **AND** `Ticks::tick` is the source of exactly one `calls` edge, `exact`, to `Clock::now`

#### Scenario: Static, intersection-typed, local, variable and magic receivers produce no edge

- **WHEN** `app/Support/Clock.php` (as above), `app/Support/Magic.php` with content
  `<?php namespace App\Support; class Magic { public static function __callStatic(string $n, array $a): mixed { return null; } }`
  and `app/Odd.php` with content
  `<?php namespace App; use App\Support\{Clock, Magic}; function helper(): void {} class Odd { private static Clock $s; private Clock&\Countable $i; public function run(string $cls, string $m): void { $this->s->now(); $this->i->now(); Magic::anything(); $cls::now(); new $cls(); $this->$m(); helper(); $local = new Clock(); $local->now(); } }`
  are analysed together
- **THEN** `Odd::run` is the source of exactly one `exact` `calls` edge, to `Clock::__construct`
- **AND** of exactly one `heuristic` `calls` edge, to `Magic::__callStatic` (see "Laravel heuristic
  calls"), and of no other `calls` edge

#### Scenario: A file with a syntax error originates no call edge

- **WHEN** `app/Support/Clock.php` (as above) and `app/Broken.php` with content
  `<?php namespace App; use App\Support\Clock; class Broken { public function run(): void { new Clock(); } public function x( }`
  are analysed together
- **THEN** no edge has `app/Broken.php`, or a symbol of it, as source
- **AND** the graph validation of the wrapped result returns no error

### Requirement: Laravel heuristic calls

A call written in the body of a method of a named class, interface or trait of a parsed PHP file —
under the same placement rules as "Declared-type calls": not inside a closure, an arrow function, an
anonymous class, or a named class, interface, trait or function declared in that body — that yields no
`exact` edge under "Declared-type calls" SHALL produce one `calls` edge from that method symbol to a
method symbol, with `resolution` `heuristic` and `extractor` `php-treesitter-laravel`, when one of these
rules applies:

1. **Facade**: `F::m(...)`, where `F` resolves (see "PHP name resolution") to a class of the input that
   directly extends a name resolving to `Illuminate\Support\Facades\Facade` (a *facade class*), `F` does
   not declare `m`, and `F` declares a method `getFacadeAccessor` whose body is a single `return` of a
   plain string literal (defined below) or of `X::class`. That value is the *key* (`X::class` resolved to its fully-qualified
   name in `F`'s file). When the binding table has exactly one concrete class `C` for the key, and `C`
   declares `m`, the target is `C::m`.
2. **`__call`**: `$this->p->m(...)`, where `p` is a typed property usable by form 1 of "Declared-type
   calls" whose type resolves to a class `T` of the input, or `$this->m(...)`, where `T` is the
   caller's own declaration; `T` does not declare `m` and declares `__call`. The target is `T::__call`.
3. **`__callStatic`**: `X::m(...)` with an explicit class name, where `X` resolves to a class of the
   input that is not a facade class, does not declare `m` and declares `__callStatic`. The target is
   `X::__callStatic`. Rule 4 takes precedence over this rule.
4. **Job dispatch**: `X::m(...)` with an explicit class name, where `m` is `dispatch`,
   `dispatchSync`, `dispatchIf`, `dispatchUnless` or `dispatchAfterResponse`, and `X` resolves to a
   class of the input that is not a facade class, that uses in its own body (`use T;`, alone or in a
   list) a trait whose name resolves in `X`'s file to `Illuminate\Foundation\Bus\Dispatchable`, that
   does not declare `m`, and that declares `handle`. The target is `X::handle`.
5. **Event dispatch**: a call to the function written `event` or `\event` whose first argument is
   positional and is `new E(...)`, where `E` is a class name that resolves to a class of the input.
   For each listener class `L` that the listener map gives for `E`, when `L` declares `handle`, the
   target is `L::handle`: one edge per such listener.

The **binding table** maps a key to concrete classes. It is built from every call
`$this->app->bind(KEY, CONCRETE)`, `$this->app->singleton(KEY, CONCRETE)` or
`$this->app->scoped(KEY, CONCRETE)` written in the method `register` of a class of the input that
directly extends a name resolving to `Illuminate\Support\ServiceProvider` — anywhere in that body,
inside `if`, loops or other statements included, but not inside a closure, an arrow function, an
anonymous class, or a class or function declared in it. The call SHALL have exactly two positional
arguments: a call with a named argument, or with fewer or more arguments, adds nothing. `KEY` SHALL be
a plain string literal or `X::class` (resolved to its fully-qualified name in the provider's file),
where a *plain string literal* is a single- or double-quoted string with non-empty content and no
escape sequence or interpolation; any other string adds nothing. `CONCRETE` SHALL be
`X::class`, an arrow function whose body is `new X(...)`, or an anonymous function whose body is a
single `return new X(...)`; `X` SHALL resolve to a class of the input. Any other form adds nothing to
the table: such bindings are false negatives, never a guessed edge. A key with two or more distinct
concrete classes is ambiguous and SHALL resolve to no
target. A key with no entry SHALL resolve to no target: a key written as `X::class` is never an
implicit binding to `X`. The table SHALL only be used to resolve facades: the calls and instantiations
inside a binding's closure or arrow function SHALL originate no edge.

The **listener map** maps an event class to listener classes. It is built from the non-static
property `$listen` declared in the body of a class of the input that directly extends a name resolving
to `Illuminate\Foundation\Support\Providers\EventServiceProvider`, when its default value is an array
literal. Each element of that array of the form `E::class => [L1::class, L2::class, …]` (a key
`X::class` and a value that is an array literal) maps `E` to each `Li`, with `E` and every `Li`
resolved in the provider's file; `E` and `Li` SHALL be classes of the input. Any other element —
a string key or value, a `[L::class, 'method']` pair, `L::class . '@method'`, a spread — and any
element of another form add nothing. The same event mapped to the same listener by more than one
element or provider yields a single listener. The listener map SHALL only be used by rule 5: it
originates no edge of its own.

A method that `F`, `T` or `X` only inherits — `__call`, `__callStatic`, `getFacadeAccessor`,
`dispatch` or `handle` included — SHALL NOT count as declared, and a `Dispatchable` trait used only by
a parent class SHALL NOT count as used by `X`. A facade class whose parent is not directly `Facade`, an
event provider whose parent is not directly `EventServiceProvider`, an interface or a trait SHALL never
be `F`, `T`, `X`, `C`, `E` or `L`. `self::m(...)`, `static::m(...)`, `parent::m(...)` and any call
excluded by "Declared-type calls" (local variables, parameters, nullable, union or intersection types,
`?->`, variable class or method names, functions other than `event` under rule 5) SHALL produce no edge
under this requirement; so SHALL `event(...)` whose first argument is not `new E(...)` with a class
name (a variable, a string, `new $cls`, `new self`, `new static`) or is a named argument. The
`getFacadeAccessor`, the `register` bindings and the `$listen` property of a class declared inside a
method body (of a class, interface, trait or enum), a closure, an arrow function or an anonymous class
SHALL NOT be read, as for the calls of "Declared-type calls"; nor those of a class dropped as a
duplicate symbol (see Symbol extraction). A `getFacadeAccessor` or a closure body that holds anything
besides its single `return` — a comment included — and a string key with a leading `\` add nothing:
accepted false negatives, never a guessed edge. Keys, class and method names SHALL be compared
case-sensitively. A file that could not be parsed, or that declares more than one `namespace`, SHALL
contribute no call, facade, binding or listener to this requirement.

A `heuristic` edge SHALL NOT be emitted when the result has an `exact` edge with the same `kind`,
source and target; calls of the same method that resolve to the same target SHALL yield a single edge.

#### Scenario: The Laravel call sites of acme-shop are heuristic calls

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** there are `calls` edges, `heuristic`, extractor `php-treesitter-laravel`: from
  `OrderController::show`, `CheckoutController::store`, `SendOrderConfirmation::handle`,
  `RecalculateTotals::handle` and `OrderPricingTest::test_final_price_applies_discount_before_tax` to
  `PriceCalculator::compute`, and from `ShippingService::shippingFor` to `CarrierGateway::__call`
- **AND** from `OrderObserver::created` and `OrderObserver::updated` to `RecalculateTotals::handle`
  (job dispatch), from `DiscountService::discountFor` to `RecordDiscountAudit::handle` and from
  `OrderObserver::created` to `SendOrderConfirmation::handle` (event dispatch)
- **AND** the result has exactly 11 `calls` edges with `resolution` `heuristic`: those 10 and the one
  from `POST /checkout` to `CheckoutController::store` (see "Array-action routes")
- **AND** no `calls` edge has a symbol of `app/Facades/Pricing.php` as target (its `imports` edges stay)
- **AND** neither `OrderController::index` nor `AppServiceProvider::register` is the source of a
  `calls` edge, and `EventServiceProvider` is the source of none
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: Jobs and events reach their handlers

- **WHEN** `app/Events/Paid.php` with content `<?php namespace App\Events; class Paid {}`,
  `app/Events/Refunded.php` with content `<?php namespace App\Events; class Refunded {}`,
  `app/Listeners/Notify.php` with content
  `<?php namespace App\Listeners; class Notify { public function handle(): void {} }`,
  `app/Providers/EventProvider.php` with content
  `<?php namespace App\Providers; use App\Events\Paid; use App\Listeners\Notify; use Illuminate\Foundation\Support\Providers\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; }`,
  `app/Jobs/Sync.php` with content
  `<?php namespace App\Jobs; use Illuminate\Foundation\Bus\Dispatchable; class Sync { use Dispatchable; }`,
  `app/Jobs/Work.php` with content
  `<?php namespace App\Jobs; use Illuminate\Foundation\Bus\Dispatchable; class Work { use Dispatchable; public function handle(): void {} }`,
  `app/Facades/Ghost.php` with content
  `<?php namespace App\Facades; use Illuminate\Support\Facades\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }`
  and `app/Emitter.php` with content
  `<?php namespace App; use App\Events\{Paid, Refunded}; use App\Facades\Ghost; use App\Jobs\{Sync, Work}; class Emitter { public function run(): void { event(new Paid()); event(new Refunded()); event(new \App\Events\Missing()); Sync::dispatch(); Work::dispatchSync(); Ghost::quote(); } }`
  are analysed together
- **THEN** `Emitter::run` is the source of exactly two `calls` edges, both `heuristic`: to
  `Notify::handle` and to `Work::handle`

#### Scenario: Only Dispatchable jobs and EventServiceProvider listeners are followed

- **WHEN** `app/Events/Paid.php` (as above), `app/Listeners/Audit.php` with content
  `<?php namespace App\Listeners; class Audit { public function handle(): void {} }`,
  `app/Providers/OtherProvider.php` with content
  `<?php namespace App\Providers; use App\Events\Paid; use App\Listeners\Audit; use Illuminate\Support\ServiceProvider; class OtherProvider extends ServiceProvider { protected $listen = [Paid::class => [Audit::class]]; }`,
  `app/Jobs/Base.php` with content
  `<?php namespace App\Jobs; use Illuminate\Foundation\Bus\Dispatchable; class Base { use Dispatchable; }`,
  `app/Jobs/Child.php` with content
  `<?php namespace App\Jobs; class Child extends Base { public function handle(): void {} }`,
  `app/Jobs/Bare.php` with content
  `<?php namespace App\Jobs; class Bare { public function handle(): void {} }` and `app/Caller.php`
  with content
  `<?php namespace App; use App\Events\Paid; use App\Jobs\{Child, Bare}; class Caller { public function run($e): void { event(new Paid()); event($e); event('paid'); Child::dispatch(); Bare::dispatch(); $f = fn () => event(new Paid()); } }`
  are analysed together
- **THEN** `Caller::run` is the source of no `calls` edge

#### Scenario: A facade without a binding or outside the input has no edge

- **WHEN** `app/Services/Rates.php` with content
  `<?php namespace App\Services; class Rates { public function quote(): int { return 1; } }`,
  `app/Facades/RatesFacade.php` with content
  `<?php namespace App\Facades; use Illuminate\Support\Facades\Facade; class RatesFacade extends Facade { protected static function getFacadeAccessor(): string { return 'rates'; } }`,
  `app/Facades/Ghost.php` with content
  `<?php namespace App\Facades; use Illuminate\Support\Facades\Facade; class Ghost extends Facade { protected static function getFacadeAccessor(): string { return 'ghost'; } }`,
  `app/Providers/RatesProvider.php` with content
  `<?php namespace App\Providers; use App\Services\Rates; use Illuminate\Support\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } }`
  and `app/Client.php` with content
  `<?php namespace App; use App\Facades\{RatesFacade, Ghost}; use Illuminate\Support\Facades\Log; class Client { public function run(): void { RatesFacade::quote(); RatesFacade::missing(); Ghost::quote(); Log::info('x'); } }`
  are analysed together
- **THEN** `Client::run` is the source of exactly one `calls` edge, `heuristic`, to `Rates::quote`

#### Scenario: A closure binding resolves a facade and originates no edge

- **WHEN** `app/Facades/RatesFacade.php` and `app/Client.php` (as above), `app/Services/Rates.php` with
  content
  `<?php namespace App\Services; class Rates { public function __construct() {} public function quote(): int { return 1; } }`
  and `app/Providers/RatesProvider.php` with content
  `<?php namespace App\Providers; use App\Services\Rates; use Illuminate\Support\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->singleton('rates', fn ($app) => new Rates()); } }`
  are analysed together
- **THEN** `Client::run` is the source of exactly one `calls` edge, `heuristic`, to `Rates::quote`
- **AND** `RatesProvider::register` is the source of no `calls` edge

#### Scenario: An ambiguous binding key resolves no facade

- **WHEN** the five files of "A facade without a binding or outside the input has no edge",
  `app/Services/OtherRates.php` with content
  `<?php namespace App\Services; class OtherRates { public function quote(): int { return 2; } }` and
  `app/Providers/OtherProvider.php` with content
  `<?php namespace App\Providers; use App\Services\OtherRates; use Illuminate\Support\ServiceProvider; class OtherProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', OtherRates::class); } }`
  are analysed together
- **THEN** `Client::run` is the source of no `calls` edge

#### Scenario: __call and __callStatic of the receiving class

- **WHEN** `app/Support/Magic.php` with content
  `<?php namespace App\Support; class Magic { public function __call(string $n, array $a): mixed { return null; } public static function __callStatic(string $n, array $a): mixed { return null; } public function known(): void {} public function relay(): void { $this->rate(); } }`,
  `app/Support/Plain.php` with content `<?php namespace App\Support; class Plain {}`,
  `app/Support/Child.php` with content `<?php namespace App\Support; class Child extends Magic {}` and
  `app/User.php` with content
  `<?php namespace App; use App\Support\{Magic, Plain, Child}; class User { public function __construct(private Magic $m, private Plain $p, private Child $c) {} public function run(): void { Magic::anything(); $this->m->rate(); $this->m->known(); $this->p->rate(); $this->c->rate(); Plain::anything(); } }`
  are analysed together
- **THEN** `User::run` is the source of exactly three `calls` edges: to `Magic::__callStatic`,
  `heuristic`; to `Magic::__call`, `heuristic`; and to `Magic::known`, `exact`
- **AND** `Magic::relay` is the source of exactly one `calls` edge, `heuristic`, to `Magic::__call`

#### Scenario: An exact edge takes precedence over a heuristic one

- **WHEN** `app/Services/Rates.php`, `app/Facades/RatesFacade.php` and
  `app/Providers/RatesProvider.php` of "A facade without a binding or outside the input has no edge"
  and `app/Both.php` with content
  `<?php namespace App; use App\Facades\RatesFacade; use App\Services\Rates; class Both { public function __construct(private Rates $r) {} public function run(): void { $this->r->quote(); RatesFacade::quote(); } }`
  are analysed together
- **THEN** `Both::run` is the source of exactly one `calls` edge, `exact`, to `Rates::quote`

#### Scenario: A provider with a syntax error contributes no binding

- **WHEN** the five files of "A facade without a binding or outside the input has no edge" are
  analysed together, with `app/Providers/RatesProvider.php` changed to
  `<?php namespace App\Providers; use App\Services\Rates; use Illuminate\Support\ServiceProvider; class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } public function x( }`
- **THEN** `Client::run` is the source of no `calls` edge
