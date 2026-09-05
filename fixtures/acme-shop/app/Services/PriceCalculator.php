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
        $discount = $this->discounts->discountFor($order, $subtotal);
        $taxable = $subtotal->subtract($discount);

        $tax = $this->taxes->taxFor($order, $taxable);
        $shipping = $this->shipping->shippingFor($order, $taxable);

        return $taxable->add($tax)->add($shipping);
    }

    /** Exposed for the impact demo: the discounted amount before tax and shipping. */
    public function taxableBase(Order $order): Money
    {
        $subtotal = $order->subtotal;

        return $subtotal->subtract($this->discounts->discountFor($order, $subtotal));
    }
}
