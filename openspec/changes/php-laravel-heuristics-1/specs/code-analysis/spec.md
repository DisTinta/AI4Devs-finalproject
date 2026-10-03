## ADDED Requirements

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
   `X::__callStatic`.

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

A method that `F`, `T` or `X` only inherits — `__call`, `__callStatic` or `getFacadeAccessor` included —
SHALL NOT count as declared. A facade class whose parent is not directly `Facade`, an interface or a
trait SHALL never be `F`, `T`, `X` or `C`. `self::m(...)`, `static::m(...)`, `parent::m(...)` and any
call excluded by "Declared-type calls" (local variables, parameters, nullable, union or intersection
types, `?->`, variable class or method names, functions) SHALL produce no edge under this requirement.
The `getFacadeAccessor` and the `register` bindings of a class declared inside a method body, a
closure, an arrow function or an anonymous class SHALL NOT be read, as for the calls of
"Declared-type calls". Keys, class and method names SHALL be compared case-sensitively. A file that could not be parsed, or
that declares more than one `namespace`, SHALL contribute no call, facade or binding to this
requirement.

A `heuristic` edge SHALL NOT be emitted when the result has an `exact` edge with the same `kind`,
source and target; calls of the same method that resolve to the same target SHALL yield a single edge.

#### Scenario: The Laravel call sites of acme-shop are heuristic calls

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** there are `calls` edges, `heuristic`, extractor `php-treesitter-laravel`: from
  `OrderController::show`, `CheckoutController::store`, `SendOrderConfirmation::handle`,
  `RecalculateTotals::handle` and `OrderPricingTest::test_final_price_applies_discount_before_tax` to
  `PriceCalculator::compute`, and from `ShippingService::shippingFor` to `CarrierGateway::__call`
- **AND** the result has exactly 6 `calls` edges with `resolution` `heuristic`
- **AND** no `calls` edge has a symbol of `app/Facades/Pricing.php` as target (its `imports` edges stay)
- **AND** neither `OrderController::index` nor `AppServiceProvider::register` is the source of a
  `calls` edge
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

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

- **WHEN** `app/Services/Rates.php`, `app/Facades/RatesFacade.php` and `app/Client.php` (as above) and
  `app/Providers/RatesProvider.php` with content
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

## MODIFIED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per input file, with its `path`, its `kind` and its `loc`, and no
  `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: the `GraphEdge`s between those files and symbols defined by the requirements "Code
  relation edges", "Array-action routes", "Declared-type calls", "Laravel heuristic calls", "Test
  coverage edges" and "Documentation mention edges"; every edge SHALL have a non-empty `extractor`, a
  `resolution`, no `weight`, and both endpoints present in `files` or `symbols` of the same result; no
  two edges SHALL share `kind`, source and target;
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
- **AND** no `calls` edge goes from `OrderObserver::created` to `RecalculateTotals::handle`, from
  `PriceCalculator::compute` to a symbol of `app/Models/Order.php`, or from
  `DiscountService::discountFor` to a symbol under `app/Listeners/`
- **AND** `AppServiceProvider::register`, whose instantiations are all inside arrow functions, and
  `routes/web.php` originate no `calls` edge

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
