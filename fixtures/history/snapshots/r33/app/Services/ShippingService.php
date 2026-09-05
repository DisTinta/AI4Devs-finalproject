<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes shipping cost. Orders over a fixed threshold ship for free;
 * otherwise a flat fee applies.
 */
class ShippingService
{
    public function __construct(private readonly CarrierGateway $carrier)
    {
    }

    public function shippingFor(Order $order, Money $base): Money
    {
        if ($base->isGreaterThan(Money::fromFloat(50.0))) {
            return Money::zero();
        }

        $cents = $this->carrier->flatRateFor(null);

        return Money::fromCents((int) $cents);
    }
}
