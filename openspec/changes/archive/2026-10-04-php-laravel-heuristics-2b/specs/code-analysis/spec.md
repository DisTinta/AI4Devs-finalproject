## MODIFIED Requirements

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
- **AND** no `exact` `calls` edge goes from `PriceCalculator::compute` to a symbol of
  `app/Models/Order.php`
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

A call — or, for rule 6, a property read — written in the body of a method of a named class, interface
or trait of a parsed PHP file — under the same placement rules as "Declared-type calls": not inside a
closure, an arrow function, an anonymous class, or a named class, interface, trait or function declared
in that body — that yields no `exact` edge under "Declared-type calls" SHALL produce one `calls` edge
from that method symbol to a method symbol, with `resolution` `heuristic` and `extractor`
`php-treesitter-laravel`, when one of these rules applies:

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
6. **Eloquent attribute**: a *read* `$r->a`, where `a` is written as a plain name and the receiver
   `$r` has one of these forms, whose type is a *model class* `M`:
   - `$this`, when the caller's own declaration is `M`;
   - `$this->p`, where `p` is a typed property usable by form 1 of "Declared-type calls" whose type
     resolves to `M`;
   - a parameter of the caller method declared with a single named type that resolves to `M`: not
     nullable (neither `?M` nor a default value `null`), not a union or an intersection, not variadic.

   The target is `M::get{Studly(a)}Attribute` when `M` declares it; otherwise `M::a` when `M` declares
   it (a relation, or a Laravel 9+ `Attribute` accessor whose camelCase name equals `a`, i.e. single-word
   keys); otherwise there is no target (a column). A target that is the caller method itself — a getter
   `status()` that returns `$this->status` — yields no edge: Laravel returns the column before it looks
   at a method, and the edge would point at its own source. `Studly(a)` splits `a` at every `_` and
   `-`, upper-cases the first character of each non-empty part and joins them (`coupon_code` →
   `CouponCode`, `subtotal` → `Subtotal`).

   A parameter keeps its declared type in the whole body of the method, even after it is reassigned
   (`$order = $order->customer;`) or shadowed by a `catch` variable of the same name: a read after that
   MAY get a wrong `heuristic` edge. This is an accepted false positive; parameter types are never
   tracked through the body.

A **model class** is a class of the input that directly extends a name resolving to
`Illuminate\Database\Eloquent\Model`. A **read** is a property access written with `->` that is not
written to. These are writes, never reads: the left-hand side of an assignment (`=`, `=&` or a compound
assignment such as `+=` or `??=`); the operand of `++` or `--`, prefix or postfix; an argument of
`unset(...)`; a target of a destructuring assignment (`[$p->a] = …`, `list($p->a) = …`); and the target
of a `foreach` (`as $p->a`, `as $k => $p->a`). `isset($p->a)` and an indirect modification such as
`$p->a[] = …` are reads: Laravel runs the accessor or the relation in both (`__isset` reaches
`getAttribute`; an indirect modification goes through `__get`). A nullsafe access `?->` is not a read,
and `$r->a(...)` is a method call, not a read. In a chain only the link whose receiver has one of the
forms of rule 6 is a read of that rule: in `$order->subtotal->amount()` it is `$order->subtotal`, and in
`$order->customer->loyalty_tier` it is `$order->customer`. The type of a read is never inferred, so the
next link of a chain yields no edge.

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
literal. The array is read element by element, and each element entry by entry. An element whose key
is `E::class` and whose value is an array literal maps `E` to each entry of that value written
`L::class`, with `E` and every `L` resolved in the provider's file; `E` and `L` SHALL be classes of
the input. Any other entry of the value — a string, a `[L::class, 'method']` pair,
`L::class . '@method'`, a spread — adds nothing, and does not discard the valid entries of the same
element. An element whose key is not `X::class` (a string key, a spread) or whose value is not an
array literal adds nothing. The same event mapped to the same listener by more than one entry, element
or provider yields a single listener. The listener map SHALL only be used by rule 5: it
originates no edge of its own.

A method that `F`, `T`, `X` or `M` only inherits — `__call`, `__callStatic`, `getFacadeAccessor`,
`dispatch`, `handle`, an accessor or a relation included — SHALL NOT count as declared, and a
`Dispatchable` trait used only by a parent class SHALL NOT count as used by `X`. A facade class whose
parent is not directly `Facade`, an event provider whose parent is not directly `EventServiceProvider`,
a model class whose parent is not directly `Model`, an interface or a trait SHALL never be `F`, `T`,
`X`, `C`, `E`, `L` or `M`. `self::m(...)`, `static::m(...)`, `parent::m(...)` and any call excluded by
"Declared-type calls" (local variables, parameters, nullable, union or intersection types, `?->`,
variable class or method names, functions other than `event` under rule 5) SHALL produce no edge under
this requirement; so SHALL `event(...)` whose first argument is not `new E(...)` with a class name (a
variable, a string, `new $cls`, `new self`, `new static`) or is a named argument. Parameters are used by
rule 6 only, and only for reads: a method call on a parameter (`$order->lineCount()`) SHALL still
produce no edge. A read whose receiver is a local variable, a static property, `$this->p` with an
untyped, nullable, union or intersection property, or any other expression, and a read with a variable
or computed name (`$r->$a`, `$r->{'a'}`), SHALL produce no edge. The
`getFacadeAccessor`, the `register` bindings and the `$listen` property of a class declared inside a
method body (of a class, interface, trait or enum), a top-level function body, a closure, an arrow
function or an anonymous class SHALL NOT be read, as for the calls of "Declared-type calls"; nor those of a class dropped as a
duplicate symbol (see Symbol extraction). This nesting rule applies to registrations only: the
classes rules 4, 5 and 6 resolve as targets (`X`, `E`, `L` and `M`) count wherever they are declared,
nested classes included, as for the targets of "Declared-type calls". A comment anywhere inside a `$listen`
element or inside the arguments of `event(...)` changes nothing. A `getFacadeAccessor` or a closure
body that holds anything besides its single `return` — a comment included — and a string key with a
leading `\` add nothing:
accepted false negatives, never a guessed edge. Keys, class and method names SHALL be compared
case-sensitively. A file that could not be parsed, or that declares more than one `namespace`, SHALL
contribute no call, read, facade, binding or listener to this requirement.

A `heuristic` edge SHALL NOT be emitted when the result has an `exact` edge with the same `kind`,
source and target; calls and reads of the same method that resolve to the same target SHALL yield a
single edge.

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
- **AND** from `PriceCalculator::compute` (site 4, a parameter, `PriceCalculator.php:27`),
  `PriceCalculator::taxableBase` (a parameter, `:40`) and `OrderController::show` (a parameter, in a
  chain, `OrderController.php:23`) to `Order::getSubtotalAttribute`; from `DiscountService::loyaltyPercent`
  (a parameter, in a chain, `DiscountService.php:53`) to `Order::customer`; and from
  `Order::getSubtotalAttribute` (`Order.php:47`) and `Order::lineCount` (`Order.php:55`), both through
  `$this`, to `Order::lines` (Eloquent attributes)
- **AND** the result has exactly 17 `calls` edges with `resolution` `heuristic`: those 16 and the one
  from `POST /checkout` to `CheckoutController::store` (see "Array-action routes"), and still exactly
  47 with `resolution` `exact`
- **AND** those 6 Eloquent edges are the only `calls` edges whose target is a symbol under
  `app/Models/`: the column reads (`$order->coupon_code` in `DiscountService.php:37`, `id`, `status`,
  `shipping_country` in `TaxService.php:23` and `ShippingService.php:31`, `loyalty_tier`,
  `unit_price_cents`, `quantity`, `price_cents`) yield none, and neither does `$order->subtotal = …` in
  `tests/Unit/PriceCalculatorTest.php:36` (a write on a local variable, so no receiver of rule 6; the
  write rule itself is shown by "Eloquent reads reach accessors and relations, never columns or writes"
  and "Writes never read an Eloquent attribute; isset and indirect modification do")
- **AND** no `calls` edge has a symbol of `app/Facades/Pricing.php` as target (its `imports` edges stay)
- **AND** neither `OrderController::index` nor `AppServiceProvider::register` is the source of a
  `calls` edge, and `EventServiceProvider` is the source of none
- **AND** wrapping the result in a graph with `commits: []` and `fileCommits: []` makes the graph
  validation return no error

#### Scenario: Eloquent reads reach accessors and relations, never columns or writes

- **WHEN** `app/Models/Post.php` with content
  `<?php namespace App\Models; use Illuminate\Database\Eloquent\Model; class Post extends Model { public function author() {} public function getTitleUpperAttribute() {} }`,
  `app/Plain.php` with content `<?php namespace App; class Plain { public function author() {} }` and
  `app/Reader.php` with content
  `<?php namespace App; use App\Models\Post; class Reader { public function run(Post $p, Plain $q, ?Post $n): void { $p->title_upper; $p->author->name; $p->body; $p->author = 1; $q->author; $n->author; $p?->author; $p->author(); } }`
  are analysed together
- **THEN** `Reader::run` is the source of exactly two `calls` edges, both `heuristic`: to
  `Post::getTitleUpperAttribute` and to `Post::author`
- **AND** the column `body`, the second link `->name`, the write, the non-model `Plain`, the nullable
  `?Post`, the nullsafe `?->` and the method call `$p->author()` on a parameter add none

#### Scenario: Writes never read an Eloquent attribute; isset and indirect modification do

- **WHEN** `app/Models/Box.php` with content
  `<?php namespace App\Models; use Illuminate\Database\Eloquent\Model; class Box extends Model { public function inc() {} public function dec() {} public function preinc() {} public function predec() {} public function gone() {} public function pair() {} public function listed() {} public function each() {} public function keyed() {} public function checked() {} public function pushed() {} }`
  and `app/Packer.php` with content
  `<?php namespace App; use App\Models\Box; class Packer { public function run(Box $b, array $xs): void { $b->inc++; $b->dec--; ++$b->preinc; --$b->predec; unset($b->gone); [$b->pair] = $xs; list($b->listed) = $xs; foreach ($xs as $b->each) {} foreach ($xs as $k => $b->keyed) {} isset($b->checked); $b->pushed[] = 1; } }`
  are analysed together
- **THEN** `Packer::run` is the source of exactly two `calls` edges, both `heuristic`: to `Box::checked`
  and to `Box::pushed`
- **AND** none of the nine writes (`++` and `--` in both positions, `unset`, the two destructuring
  targets and the two `foreach` targets) adds an edge, each having its own target

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

#### Scenario: A $listen element is read entry by entry

- **WHEN** `app/Events/Paid.php` (as above), `app/Listeners/Notify.php` (as above),
  `app/Listeners/Audit.php` with content
  `<?php namespace App\Listeners; class Audit { public function handle(): void {} }`,
  `app/Providers/EventProvider.php` with content
  `<?php namespace App\Providers; use App\Events\Paid; use App\Listeners\{Notify, Audit}; use Illuminate\Foundation\Support\Providers\EventServiceProvider; class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => /* listeners */ [Notify::class, 'App\Listeners\Audit', [Audit::class, 'handle']]]; }`
  and `app/Emitter.php` with content
  `<?php namespace App; use App\Events\Paid; class Emitter { public function run(): void { event(new Paid()); } }`
  are analysed together
- **THEN** `Emitter::run` is the source of exactly one `calls` edge, `heuristic`, to `Notify::handle`:
  the string and the pair add nothing, the comment changes nothing, and neither drops `Notify`

#### Scenario: Laravel registrations of a class declared in a function body are never read

- **WHEN** `app/Services/Rates.php`, `app/Facades/RatesFacade.php` and `app/Events/Paid.php` (as above),
  `app/Listeners/Notify.php` (as above), `app/Providers/RatesProvider.php` with content
  `<?php namespace App\Providers; use App\Services\Rates; use Illuminate\Support\ServiceProvider; function boot(): void { class RatesProvider extends ServiceProvider { public function register(): void { $this->app->bind('rates', Rates::class); } } }`,
  `app/Providers/EventProvider.php` with content
  `<?php namespace App\Providers; use App\Events\Paid; use App\Listeners\Notify; use Illuminate\Foundation\Support\Providers\EventServiceProvider; function boot(): void { class EventProvider extends EventServiceProvider { protected $listen = [Paid::class => [Notify::class]]; } }`
  and `app/Client.php` with content
  `<?php namespace App; use App\Events\Paid; use App\Facades\RatesFacade; class Client { public function run(): void { RatesFacade::quote(); event(new Paid()); } }`
  are analysed together
- **THEN** the result has the class symbols `RatesProvider` and `EventProvider`, and `Client::run` is
  the source of no `calls` edge

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


## ADDED Requirements

### Requirement: PHP unresolved report

The result of the PHP analyzer SHALL carry, besides the fields of "Analysis contract", a field
`unresolved`: the list of Laravel call sites and route statements that the analyzer recognises but for
which it emits no edge. It is specific to the PHP analyzer and SHALL NOT be part of the analysis
contract shared by every analyzer. The PHP analyzer's result SHALL satisfy "Analysis contract", with
`unresolved` as an additional field: a consumer that uses the analyzer through `AnalyzerPort` sees only
the four common fields, and `unresolved` SHALL NOT change `files`, `symbols`, `edges` or `diagnostics`.
The package `@codemind/analyzer-php` SHALL export, as types, `PhpAnalyzer` (an `AnalyzerPort` whose
`analyze` resolves to a `PhpAnalysisResult`), `PhpAnalysisResult` (`AnalysisResult` plus
`unresolved: UnresolvedSite[]`), `UnresolvedSite` and `UnresolvedReason`, and `createPhpAnalyzer()`
SHALL return a `PhpAnalyzer`. Each entry SHALL be `{ path, line, source, reason }`, where `path` is
the file of the site, `line` the 1-based line where the call starts (for a route, the first line of its
statement), `source` the caller method symbol (for a route, the `route` symbol), and `reason` one of:

- `facade-unresolved`: a call `F::m(...)` where `F` is a facade class that does not declare `m` (rule 1
  of "Laravel heuristic calls") and rule 1 gives no target: `F` has no usable `getFacadeAccessor`, the
  key has no binding, the key is ambiguous, or the bound class `C` does not declare `m` in its own body
  (a method `C` only inherits does not count, so such a call is listed);
- `event-no-listener`: a call `event(new E(...))` of rule 5 where `E` is a class of the input and rule 5
  gives no target: the listener map gives `E` no listener, or none of its listeners declares `handle`;
- `job-no-handle`: a call `X::m(...)` that meets every condition of rule 4 except that `X` does not
  declare `handle` in its own body (a `handle` `X` only inherits does not count, so such a call is
  listed), and to which no other rule gives an edge (`X` does not declare `__callStatic`);
- `route-action-missing`: a `route` symbol, of either action form, that originates no `calls` edge —
  its class is not a class of the input, or does not declare the method.

Only the sites that "Laravel heuristic calls" and "Array-action routes" would consider SHALL be
listed: calls placed where those requirements read none (closures, arrow functions, anonymous classes,
nested declarations), files that could not be parsed or that declare more than one `namespace`, and
duplicate symbols contribute no entry. Eloquent column reads, calls and events naming a type outside
the input (`Log::info(...)`, `event(new Ghost())` with `Ghost` outside the input), calls outside the
four patterns above to a method a class only inherits (`$this->belongsTo(...)`, a parent's method
called on a class that is not a facade), and undeclared methods of a class that declares no `__call` /
`__callStatic` SHALL NOT be listed: they are not recognised Laravel patterns without a target. Within
the four patterns, an inherited method never resolves: Laravel would reach it through inheritance, the
analyzer does not follow it, and the site is listed under its reason. A site with any `calls` edge, `exact`
or `heuristic`, SHALL NOT be listed.

`unresolved` SHALL be ordered by `path`, then `line`, then the `name` of `source`, then `reason`,
compared by UTF-16 code unit, and SHALL hold no two entries with the same `path`, `line`, `source` and
`reason`. The report SHALL NOT change `files`, `symbols`, `edges` or `diagnostics`, and the same input
SHALL produce an equal report.

#### Scenario: Unresolved Laravel sites are reported

- **WHEN** the eight files of "Jobs and events reach their handlers" (`app/Events/Paid.php`,
  `app/Events/Refunded.php`, `app/Listeners/Notify.php`, `app/Providers/EventProvider.php`,
  `app/Jobs/Sync.php`, `app/Jobs/Work.php`, `app/Facades/Ghost.php` and `app/Emitter.php`, each on a
  single line) and `routes/web.php` with content
  `<?php\nRoute::get('/a', 'App\Ghost@run');\nRoute::get('/b', 'NoAt');\nRoute::get('/c', "App\X@{$m}");\nRoute::get('/d', '\App\Ghost@run');\n`
  (`\n` being a line break; every other backslash is written as is in the PHP source) are analysed
  together
- **THEN** `unresolved` is exactly, in this order:
  1. `{ path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'event-no-listener' }`
     (`event(new Refunded())`);
  2. `{ path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'facade-unresolved' }`
     (`Ghost::quote()`, key `'ghost'` without binding);
  3. `{ path: 'app/Emitter.php', line: 1, source: Emitter::run, reason: 'job-no-handle' }`
     (`Sync::dispatch()`);
  4. `{ path: 'routes/web.php', line: 2, source: GET /a, reason: 'route-action-missing' }`
- **AND** `event(new \App\Events\Missing())` (outside the input), `event(new Paid())` and
  `Work::dispatchSync()` (resolved), and `/b`, `/c` and `/d` (no route symbol) have no entry

#### Scenario: acme-shop has no unresolved site

- **GIVEN** the content of the 53 tracked files of `fixtures/acme-shop`
- **WHEN** they are analysed
- **THEN** `unresolved` is empty: the five `Pricing::compute` facade calls placed in method bodies, the
  two `event(...)` and the two `dispatch` calls and the three route symbols all have an edge, the
  `Pricing::compute` inside an arrow function in `OrderController.php:35` is not a site, and
  `Log::info` names a type outside the input

#### Scenario: The unresolved report is deterministic and without duplicates

- **WHEN** the files of "Unresolved Laravel sites are reported", with `app/Emitter.php` changed to
  `<?php namespace App; use App\Facades\Ghost; use App\Jobs\Sync; class Emitter { public function run(): void { Ghost::quote(); Sync::dispatch(); Ghost::quote(); Ghost::other(); } }`,
  are analysed twice with the same input
- **THEN** both `unresolved` lists are equal
- **AND** each is exactly, in this order: `{ path: 'app/Emitter.php', line: 1, source: Emitter::run,
  reason: 'facade-unresolved' }` once (for the three `Ghost` calls), `{ path: 'app/Emitter.php',
  line: 1, source: Emitter::run, reason: 'job-no-handle' }` and
  `{ path: 'routes/web.php', line: 2, source: GET /a, reason: 'route-action-missing' }`
