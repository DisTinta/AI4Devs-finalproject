<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes shipping cost. Orders whose (discounted) base exceeds the free
 * shipping threshold ship for free; otherwise a flat per-country fee applies.
 * The threshold is read from config/shop.php so it can be changed without
 * touching code.
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
