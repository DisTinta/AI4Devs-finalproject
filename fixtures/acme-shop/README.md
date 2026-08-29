# acme-shop

A small Laravel 11 / PHP 8.2 storefront domain focused on **order pricing**:
orders, order lines, discounts, taxes and shipping. It exists to be *analyzed*,
not deployed — there is no `vendor/`, no bootstrap, no running server.

## What it models

The core question the code answers is **"how is the final price of an order
computed?"**. The chain is:

```
subtotal ──▶ discount ──▶ taxable base ──▶ + tax ──▶ + shipping ──▶ total
             (loyalty +                    (on the
              coupon +                      discounted
              volume)                       base)
```

The authoritative implementation is `App\Services\PriceCalculator::compute()`.
Pricing rules are documented in [`docs/pricing.md`](docs/pricing.md).

## Layout

```
app/
  Models/        Order, OrderLine, Product, Customer, Coupon (Eloquent)
  Services/      PriceCalculator, DiscountService, TaxService, ShippingService,
                 CouponValidator, CarrierGateway
  Http/          controllers, form request, middleware
  Events/ Listeners/ Jobs/ Observers/   order lifecycle side effects
  Facades/       Pricing (over PriceCalculator)
  Providers/     container bindings + event map
  Support/       Money value object
routes/          web.php (string action), api.php (array action)
config/          app.php, shop.php (tax + shipping config)
database/        migrations, factory, seeder
tests/           Unit + Feature
```

## A note for readers

This repository is deliberately built on top of Laravel's dynamic features —
facades, container bindings, magic Eloquent attributes, string-resolved routes,
queued jobs and events. That makes its call graph hard to recover with static
analysis alone, which is exactly the point: it is the "hard" CODEMIND fixture.
The parent project's `fixtures/README.md` inventories every such site.

> This is sample/fixture code, not a production application.
