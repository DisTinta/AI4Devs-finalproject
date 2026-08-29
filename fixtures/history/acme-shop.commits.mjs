// Deterministic commit history for the acme-shop fixture.
//
// Replayed by ../build-history.mjs. Dates span 2024-01 .. 2024-05. Three
// fictitious authors (the system pseudonymises them anyway, readme §2.5).
// Several messages carry a "(#NN)" so pr_number has something to parse.
//
// PLANTED SIGNALS (see fixtures/README.md):
//  - Co-change pair: DiscountService.php <-> ShippingService.php change together
//    in three commits (r11, r16, r30) with no static edge between them.
//  - Drift by date: docs/pricing.md is last touched on 2024-02-19; the code it
//    describes (PriceCalculator.php + config/shop.php) is changed LATER, on
//    2024-05-02, and the doc is never updated.

const MARTA = 'Marta Ibáñez <marta.ibanez@acme.test>';
const DIEGO = 'Diego Serrano <diego.serrano@acme.test>';
const LUCIA = 'Lucía Fernández <lucia.fernandez@acme.test>';

export default [
  { date: '2024-01-08T09:14:00', author: MARTA, message: 'chore: bootstrap Laravel project skeleton',
    files: ['composer.json', '.gitignore', '.env.example', 'artisan', 'phpunit.xml'] },
  { date: '2024-01-09T11:02:00', author: MARTA, message: 'chore: application and shop configuration',
    files: ['config/app.php', 'config/shop.php'] },
  { date: '2024-01-11T16:40:00', author: DIEGO, message: 'feat: money value object in minor units',
    files: ['app/Support/Money.php'] },
  { date: '2024-01-15T10:22:00', author: MARTA, message: 'feat: customer and product models (#12)',
    files: ['app/Models/Customer.php', 'app/Models/Product.php'] },
  { date: '2024-01-18T14:35:00', author: DIEGO, message: 'feat: order and order-line models (#15)',
    files: ['app/Models/Order.php', 'app/Models/OrderLine.php'] },
  { date: '2024-01-22T09:50:00', author: LUCIA, message: 'feat: coupon model with string primary key',
    files: ['app/Models/Coupon.php'] },
  { date: '2024-01-25T12:10:00', author: MARTA, message: 'feat: migrations for core tables (#18)',
    files: [
      'database/migrations/2024_01_10_000001_create_customers_table.php',
      'database/migrations/2024_01_10_000002_create_products_table.php',
      'database/migrations/2024_01_10_000003_create_coupons_table.php',
      'database/migrations/2024_01_10_000004_create_orders_table.php',
      'database/migrations/2024_01_10_000005_create_order_lines_table.php',
    ] },
  { date: '2024-01-29T15:05:00', author: DIEGO, message: 'feat: order factory and database seeder',
    files: ['database/factories/OrderFactory.php', 'database/seeders/DatabaseSeeder.php'] },
  { date: '2024-02-01T10:30:00', author: LUCIA, message: 'feat: VAT tax service by country (#21)',
    files: ['app/Services/TaxService.php'] },
  { date: '2024-02-05T13:18:00', author: DIEGO, message: 'feat: coupon validator',
    files: ['app/Services/CouponValidator.php'] },
  { date: '2024-02-08T11:44:00', author: LUCIA, message: 'feat: discount and shipping services (#24)',
    files: ['app/Services/DiscountService.php', 'app/Services/ShippingService.php'] },
  { date: '2024-02-12T16:02:00', author: DIEGO, message: 'feat: carrier gateway proxy for shipping rates',
    files: ['app/Services/CarrierGateway.php'] },
  { date: '2024-02-15T09:38:00', author: MARTA, message: 'feat: price calculator composing the chain (#27)',
    files: ['app/Services/PriceCalculator.php'] },
  { date: '2024-02-19T14:20:00', author: LUCIA, message: 'docs: document pricing rules for the finance team',
    files: ['docs/pricing.md'] },
  { date: '2024-02-22T10:11:00', author: MARTA, message: 'feat: pricing facade and container bindings (#30)',
    files: ['app/Facades/Pricing.php', 'app/Providers/AppServiceProvider.php'] },
  { date: '2024-02-26T15:47:00', author: DIEGO, message: 'refactor: tune loyalty tiers and shipping fees (#33)',
    files: ['app/Services/DiscountService.php', 'app/Services/ShippingService.php'] },
  { date: '2024-02-29T12:26:00', author: LUCIA, message: 'feat: order placed and discount applied events',
    files: ['app/Events/OrderPlaced.php', 'app/Events/DiscountApplied.php'] },
  { date: '2024-03-04T09:05:00', author: DIEGO, message: 'feat: order confirmation and discount audit listeners (#36)',
    files: ['app/Listeners/SendOrderConfirmation.php', 'app/Listeners/RecordDiscountAudit.php'] },
  { date: '2024-03-07T13:52:00', author: LUCIA, message: 'feat: event service provider listener map',
    files: ['app/Providers/EventServiceProvider.php'] },
  { date: '2024-03-11T10:40:00', author: MARTA, message: 'feat: queued job to recalculate order totals (#39)',
    files: ['app/Jobs/RecalculateTotals.php'] },
  { date: '2024-03-14T16:15:00', author: DIEGO, message: 'feat: order observer dispatching job and event',
    files: ['app/Observers/OrderObserver.php'] },
  { date: '2024-03-18T11:30:00', author: MARTA, message: 'feat: base controller and order read endpoints (#42)',
    files: ['app/Http/Controllers/Controller.php', 'app/Http/Controllers/OrderController.php'] },
  { date: '2024-03-21T14:08:00', author: LUCIA, message: 'feat: checkout request validation',
    files: ['app/Http/Requests/StoreOrderRequest.php'] },
  { date: '2024-03-25T09:22:00', author: DIEGO, message: 'feat: checkout controller and empty-cart guard (#45)',
    files: ['app/Http/Controllers/CheckoutController.php', 'app/Http/Middleware/EnsureCartNotEmpty.php'] },
  { date: '2024-03-28T15:33:00', author: MARTA, message: 'feat: web and api routes',
    files: ['routes/web.php', 'routes/api.php'] },
  { date: '2024-04-02T10:55:00', author: LUCIA, message: 'test: unit tests for tax and shipping (#48)',
    files: ['tests/Unit/TaxServiceTest.php', 'tests/Unit/ShippingServiceTest.php'] },
  { date: '2024-04-05T13:41:00', author: DIEGO, message: 'test: discount volume bonus and cap',
    files: ['tests/Unit/DiscountServiceTest.php'] },
  { date: '2024-04-09T11:19:00', author: MARTA, message: 'test: price ordering plus test scaffolding (#51)',
    files: ['tests/CreatesApplication.php', 'tests/TestCase.php', 'tests/Unit/PriceCalculatorTest.php'] },
  { date: '2024-04-12T16:27:00', author: LUCIA, message: 'test: feature tests for pricing and checkout (#53)',
    files: ['tests/Feature/OrderPricingTest.php', 'tests/Feature/CheckoutTest.php'] },
  { date: '2024-04-16T10:03:00', author: DIEGO, message: 'refactor: extend shipping zones and discount stacking (#55)',
    files: ['app/Services/DiscountService.php', 'app/Services/ShippingService.php'] },
  { date: '2024-05-02T14:49:00', author: MARTA, message: 'fix: apply discount before tax and raise free-shipping threshold to 75 (#61)',
    files: ['app/Services/PriceCalculator.php', 'config/shop.php'] },
  { date: '2024-05-06T09:31:00', author: LUCIA, message: 'docs: project readme',
    files: ['README.md'] },
];
