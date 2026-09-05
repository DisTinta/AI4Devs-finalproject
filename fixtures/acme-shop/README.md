# acme-shop

A small Laravel 11 / PHP 8.2 storefront domain focused on **order pricing**:
orders, order lines, discounts, taxes and shipping. There is no `vendor/`, no
running server — this codebase is meant to be read and explored, not deployed.

## What it models

The core question the code answers is **"how is the final price of an order
computed?"**. The authoritative implementation is
`App\Services\PriceCalculator::compute()`. Pricing rules are documented in
[`docs/pricing.md`](docs/pricing.md).

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
routes/          web.php, api.php
config/          app.php, services.php, shop.php (tax + shipping config)
database/        migrations, factory, seeder
tests/           Unit + Feature
```

## Running tests

This project ships without `vendor/`. Install dependencies with:

```bash
composer install
./vendor/bin/phpunit
```

Note: `tests/CreatesApplication.php` references `bootstrap/app.php`, which is
not included in this tree. The unit arithmetic in `tests/Unit/` can be verified
without a full Laravel bootstrap; the Feature suite requires it.
