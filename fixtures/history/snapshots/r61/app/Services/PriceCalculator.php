<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes the final price of an order.
 *
 * @param Order $order The order to price.
 * @return Money       The total amount due in minor currency units.
 */
class PriceCalculator
{
    public function __construct(
        private readonly DiscountService $discounts,
        private readonly TaxService $taxes,
        private readonly ShippingService $shipping,
    ) {
    }

    public function compute(Order $order): Money
    {
        $subtotal = $order->subtotal;                       // magic accessor
        $tax = $this->taxes->taxFor($order, $subtotal);
        $discount = $this->discounts->discountFor($order, $subtotal);
        $shipping = $this->shipping->shippingFor($order, $subtotal);

        return $subtotal->subtract($discount)->add($tax)->add($shipping);
    }

    /** Exposed for the impact demo: the pre-discount subtotal. */
    public function taxableBase(Order $order): Money
    {
        return $order->subtotal;
    }
}
