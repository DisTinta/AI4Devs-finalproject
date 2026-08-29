<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes the final price of an order.
 *
 * ORDER OF OPERATIONS (this is the reference demo question):
 *   1. subtotal   = sum of line totals
 *   2. discount   = DiscountService, applied to the subtotal
 *   3. taxable    = subtotal - discount        <-- discount is applied BEFORE tax
 *   4. tax        = TaxService, on the discounted amount
 *   5. shipping   = ShippingService, on the discounted amount
 *   6. total      = discounted + tax + shipping
 *
 * The discount-before-tax ordering is deliberate and is covered by
 * PriceCalculatorTest. It is NOT reflected in docs/pricing.md, which still
 * describes tax being computed on the gross subtotal — that divergence is the
 * planted documentation drift (see fixtures/README.md).
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
