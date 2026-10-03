## MODIFIED Requirements

### Requirement: Analysis contract

`AnalyzerPort.analyze(input)` SHALL take `{ files }`, where each file is `{ path, content }` with a
repository-relative `path` using `/` as separator, and SHALL resolve to `{ files, symbols, edges,
diagnostics }` built from the existing graph types:

- `files`: exactly one `GraphFile` per input file, with its `path`, its `kind` and its `loc`, and no
  `contentHash` or `redacted`;
- `symbols`: the `GraphSymbol`s declared in those files;
- `edges`: the `GraphEdge`s between those files and symbols defined by the requirements "Code
  relation edges", "Array-action routes", "Declared-type calls", "Test coverage edges" and
  "Documentation mention edges"; every edge SHALL have a non-empty `extractor`, a `resolution`, no
  `weight`, and both endpoints present in `files` or `symbols` of the same result; no two edges SHALL
  share `kind`, source and target;
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

## ADDED Requirements

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
edge. A call that would be a target of more than one form, or that appears more than once in the same
method, SHALL yield a single edge. A file that could not be parsed, or that declares more than one
`namespace`, SHALL originate no such edge. No `calls` edge of this requirement SHALL be `heuristic`.

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

#### Scenario: The heuristic call sites of acme-shop have no exact edge

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** no `calls` edge goes from `OrderController::show` or `CheckoutController::store` to a
  symbol of `app/Services/PriceCalculator.php` or `app/Facades/Pricing.php`
- **AND** no `calls` edge goes from `ShippingService::shippingFor` to a symbol of
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
- **THEN** `Odd::run` is the source of exactly one `calls` edge, `exact`, to `Clock::__construct`

#### Scenario: A file with a syntax error originates no call edge

- **WHEN** `app/Support/Clock.php` (as above) and `app/Broken.php` with content
  `<?php namespace App; use App\Support\Clock; class Broken { public function run(): void { new Clock(); } public function x( }`
  are analysed together
- **THEN** no edge has `app/Broken.php`, or a symbol of it, as source
- **AND** the graph validation of the wrapped result returns no error
