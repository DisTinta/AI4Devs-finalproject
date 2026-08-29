<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes shipping cost. Orders whose (discounted) base exceeds the free
 * shipping threshold ship for free; otherwise a flat fee applies.
 *
 * The free-shipping threshold is read from config/shop.php. It was RAISED from
 * 50.00 to 75.00 (see git history / PR referenced in fixtures/README.md) but
 * docs/pricing.md was never updated — part of the documentation drift, in
 * addition to the tax-ordering divergence.
 *
 * ANALYZER TRAP (__call via CarrierGateway): the actual per-carrier rate is
 * fetched through a magic __call proxy, so the edge to the concrete rate method
 * is not statically resolvable.
 */
class ShippingService
{
    public function __construct(private readonly CarrierGateway $carrier)
    {
    }

    public function shippingFor(Order $order, Money $base): Money
    {
        $threshold = Money::fromFloat((float) config('shop.free_shipping_threshold'));

        if ($base->isGreaterThan($threshold)) {
            return Money::zero();
        }

        // Dynamic method: CarrierGateway has no flatRateFor() declared.
        $cents = $this->carrier->flatRateFor($order->shipping_country);

        return Money::fromCents((int) $cents);
    }
}
