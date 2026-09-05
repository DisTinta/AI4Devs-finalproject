<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\DiscountApplied;
use App\Models\Order;
use App\Support\Money;

/**
 * Computes the total discount for an order. Two stacked components:
 *
 *   a) loyalty discount   — silver/gold customers get a percentage off
 *   b) coupon discount    — a valid coupon code adds its percent_off
 *
 * The combined discount is capped at MAX_DISCOUNT_PERCENT of the subtotal.
 */
class DiscountService
{
    private const LOYALTY_SILVER_PERCENT = 3.0;
    private const LOYALTY_GOLD_PERCENT = 7.0;

    private const MAX_DISCOUNT_PERCENT = 20.0;

    public function __construct(private readonly CouponValidator $coupons)
    {
    }

    public function discountFor(Order $order, Money $subtotal): Money
    {
        $percent = $this->loyaltyPercent($order);
        $percent += $this->coupons->percentFor($order->coupon_code);

        $percent = min($percent, self::MAX_DISCOUNT_PERCENT);

        $discount = $subtotal->percentage($percent);

        if ($discount->isGreaterThan(Money::zero())) {
            event(new DiscountApplied($order, $discount));
        }

        return $discount;
    }

    private function loyaltyPercent(Order $order): float
    {
        return match ($order->customer->loyalty_tier) {
            'gold' => self::LOYALTY_GOLD_PERCENT,
            'silver' => self::LOYALTY_SILVER_PERCENT,
            default => 0.0,
        };
    }
}
