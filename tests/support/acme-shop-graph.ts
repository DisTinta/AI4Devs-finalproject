import type { GraphEdge, GraphFile, KnowledgeGraph, NewProject } from '@codemind/core';
import { edge, file, ref, symbol } from './sample-graph';

// A real subset of the acme-shop graph, copied from seeds/graph-dump.sql (DIS-27 design D7), for the
// Context Engine unit tests over the in-memory store double. It holds:
// - the one-hop neighbourhood (kinds calls, tested_by, describes, co_changed, both directions) of
//   the anchor of «¿Cómo se calcula el precio final de un pedido?» (`PriceCalculator`,
//   `PriceCalculator::compute`) and of their file;
// - the class `DiscountService`, its file, `app/Services/ShippingService.php` and the seed's only
//   `co_changed` edge between them (seeds/graph-dump.sql:248), with the rest of `DiscountService`'s
//   one-hop neighbourhood;
// - `CouponValidator`, anchored by «¿Cómo se validan los cupones?» through the prefix `valid`;
// - `docs/pricing.md`, a doc with no edge.
// Every file, symbol and edge here must exist in the seed with the same values:
// tests/unit/context/acme-shop-graph-coherence.spec.ts checks it. Commits are left out.

/** The acme-shop project, as the seed creates it. */
export const ACME_SHOP_PROJECT: NewProject = {
  name: 'acme-shop',
  rootPath: 'fixtures/acme-shop',
  language: 'php',
  framework: 'laravel',
  isSample: true,
};

const FILES: GraphFile[] = [
  file('README.md', { kind: 'doc', loc: 43 }),
  file('app/Http/Controllers/CheckoutController.php', { kind: 'source', loc: 34 }),
  file('app/Http/Controllers/OrderController.php', { kind: 'source', loc: 39 }),
  file('app/Jobs/RecalculateTotals.php', { kind: 'source', loc: 39 }),
  file('app/Listeners/SendOrderConfirmation.php', { kind: 'source', loc: 26 }),
  file('app/Models/Order.php', { kind: 'source', loc: 57 }),
  file('app/Services/CouponValidator.php', { kind: 'source', loc: 39 }),
  file('app/Services/DiscountService.php', { kind: 'source', loc: 66 }),
  file('app/Services/PriceCalculator.php', { kind: 'source', loc: 44 }),
  file('app/Services/ShippingService.php', { kind: 'source', loc: 35 }),
  file('app/Services/TaxService.php', { kind: 'source', loc: 28 }),
  file('docs/pricing.md', { kind: 'doc', loc: 41 }),
  file('tests/Feature/OrderPricingTest.php', { kind: 'test', loc: 52 }),
  file('tests/Unit/DiscountServiceTest.php', { kind: 'test', loc: 82 }),
  file('tests/Unit/PriceCalculatorTest.php', { kind: 'test', loc: 57 }),
];

const sCheckoutControllerStore = symbol('app/Http/Controllers/CheckoutController.php', 'CheckoutController::store', 19, { kind: 'method', endLine: 33, signature: 'public function store(StoreOrderRequest $request): JsonResponse' });
const sOrderControllerShow = symbol('app/Http/Controllers/OrderController.php', 'OrderController::show', 16, { kind: 'method', endLine: 26, signature: 'public function show(Order $order): JsonResponse' });
const sRecalculateTotalsHandle = symbol('app/Jobs/RecalculateTotals.php', 'RecalculateTotals::handle', 30, { kind: 'method', endLine: 38, signature: 'public function handle(): void' });
const sSendOrderConfirmationHandle = symbol('app/Listeners/SendOrderConfirmation.php', 'SendOrderConfirmation::handle', 17, { kind: 'method', endLine: 25, signature: 'public function handle(OrderPlaced $event): void' });
const sOrderGetSubtotalAttribute = symbol('app/Models/Order.php', 'Order::getSubtotalAttribute', 45, { kind: 'method', endLine: 51, signature: 'public function getSubtotalAttribute(): Money' });
const sCouponValidator = symbol('app/Services/CouponValidator.php', 'CouponValidator', 14, { kind: 'class', endLine: 39, signature: 'class CouponValidator' });
const sDiscountService = symbol('app/Services/DiscountService.php', 'DiscountService', 21, { kind: 'class', endLine: 66, signature: 'class DiscountService' });
const sDiscountServiceDiscountFor = symbol('app/Services/DiscountService.php', 'DiscountService::discountFor', 34, { kind: 'method', endLine: 49, signature: 'public function discountFor(Order $order, Money $subtotal): Money' });
const sPriceCalculator = symbol('app/Services/PriceCalculator.php', 'PriceCalculator', 16, { kind: 'class', endLine: 44, signature: 'class PriceCalculator' });
const sPriceCalculatorCompute = symbol('app/Services/PriceCalculator.php', 'PriceCalculator::compute', 25, { kind: 'method', endLine: 35, signature: 'public function compute(Order $order): Money' });
const sShippingServiceShippingFor = symbol('app/Services/ShippingService.php', 'ShippingService::shippingFor', 22, { kind: 'method', endLine: 34, signature: 'public function shippingFor(Order $order, Money $base): Money' });
const sTaxServiceTaxFor = symbol('app/Services/TaxService.php', 'TaxService::taxFor', 20, { kind: 'method', endLine: 27, signature: 'public function taxFor(Order $order, Money $base): Money' });
const sOrderPricingTestTestFinalPriceAppliesDiscountBeforeTax = symbol('tests/Feature/OrderPricingTest.php', 'OrderPricingTest::test_final_price_applies_discount_before_tax', 31, { kind: 'method', endLine: 51, signature: 'public function test_final_price_applies_discount_before_tax(): void' });
const sDiscountServiceTest = symbol('tests/Unit/DiscountServiceTest.php', 'DiscountServiceTest', 22, { kind: 'class', endLine: 82, signature: 'class DiscountServiceTest extends TestCase' });
const sPriceCalculatorTest = symbol('tests/Unit/PriceCalculatorTest.php', 'PriceCalculatorTest', 21, { kind: 'class', endLine: 57, signature: 'class PriceCalculatorTest extends TestCase' });

const EDGES: GraphEdge[] = [
  edge({ symbol: ref(sPriceCalculatorCompute) }, { symbol: ref(sDiscountServiceDiscountFor) }, { kind: 'calls', resolution: 'exact', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sPriceCalculatorCompute) }, { symbol: ref(sShippingServiceShippingFor) }, { kind: 'calls', resolution: 'exact', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sPriceCalculatorCompute) }, { symbol: ref(sTaxServiceTaxFor) }, { kind: 'calls', resolution: 'exact', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sCheckoutControllerStore) }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sOrderControllerShow) }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sRecalculateTotalsHandle) }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sSendOrderConfirmationHandle) }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sPriceCalculatorCompute) }, { symbol: ref(sOrderGetSubtotalAttribute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sOrderPricingTestTestFinalPriceAppliesDiscountBeforeTax) }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'calls', resolution: 'heuristic', extractor: 'php-treesitter-laravel' }),
  edge({ file: 'app/Services/DiscountService.php' }, { file: 'app/Services/ShippingService.php' }, { kind: 'co_changed', resolution: 'heuristic', extractor: 'git', weight: 1 }),
  edge({ file: 'README.md' }, { symbol: ref(sCouponValidator) }, { kind: 'describes', resolution: 'heuristic', extractor: 'doc-mention' }),
  edge({ file: 'README.md' }, { symbol: ref(sDiscountService) }, { kind: 'describes', resolution: 'heuristic', extractor: 'doc-mention' }),
  edge({ file: 'README.md' }, { symbol: ref(sPriceCalculator) }, { kind: 'describes', resolution: 'heuristic', extractor: 'doc-mention' }),
  edge({ file: 'README.md' }, { symbol: ref(sPriceCalculatorCompute) }, { kind: 'describes', resolution: 'heuristic', extractor: 'doc-mention' }),
  edge({ symbol: ref(sDiscountService) }, { symbol: ref(sDiscountServiceTest) }, { kind: 'tested_by', resolution: 'exact', extractor: 'php-treesitter-laravel' }),
  edge({ symbol: ref(sPriceCalculator) }, { symbol: ref(sPriceCalculatorTest) }, { kind: 'tested_by', resolution: 'exact', extractor: 'php-treesitter-laravel' }),
];

/** The acme-shop subset as a graph; each call builds a fresh copy. */
export function acmeShopGraph(): KnowledgeGraph {
  return {
    files: FILES.map((f) => ({ ...f })),
    symbols: [
      sCheckoutControllerStore,
      sOrderControllerShow,
      sRecalculateTotalsHandle,
      sSendOrderConfirmationHandle,
      sOrderGetSubtotalAttribute,
      sCouponValidator,
      sDiscountService,
      sDiscountServiceDiscountFor,
      sPriceCalculator,
      sPriceCalculatorCompute,
      sShippingServiceShippingFor,
      sTaxServiceTaxFor,
      sOrderPricingTestTestFinalPriceAppliesDiscountBeforeTax,
      sDiscountServiceTest,
      sPriceCalculatorTest,
    ].map((s) => ({ ...s })),
    edges: EDGES.map((e) => ({ ...e })),
    commits: [],
    fileCommits: [],
  };
}
