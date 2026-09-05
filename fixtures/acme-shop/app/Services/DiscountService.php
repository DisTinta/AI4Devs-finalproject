<?php

declare(strict_types=1);

namespace App\Services;

use App\Events\DiscountApplied;
use App\Models\Order;
use App\Support\Money;

/**
 * Computes the total discount for an order. Three stacked components:
 *
 *   a) loyalty discount   — silver/gold customers get a percentage off
 *   b) coupon discount    — a valid coupon code adds its percent_off
 *   c) volume discount    — orders with more than VOLUME_LINE_THRESHOLD lines
 *                           earn an additional VOLUME_BONUS_PERCENT off
 *
 * The combined discount is capped at MAX_DISCOUNT_PERCENT of the subtotal.
 */
class DiscountService
{
    private const LOYALTY_SILVER_PERCENT = 5.0;
    private const LOYALTY_GOLD_PERCENT = 10.0;

    private const VOLUME_LINE_THRESHOLD = 5;
    private const VOLUME_BONUS_PERCENT = 5.0;
    private const MAX_DISCOUNT_PERCENT = 30.0;

    public function __construct(private readonly CouponValidator $coupons)
    {
    }

    public function discountFor(Order $order, Money $subtotal): Money
    {
        $percent = $this->loyaltyPercent($order);
        $percent += $this->coupons->percentFor($order->coupon_code);
        $percent += $this->volumeBonus($order);

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

    private function volumeBonus(Order $order): float
    {
        return $order->lineCount() > self::VOLUME_LINE_THRESHOLD
            ? self::VOLUME_BONUS_PERCENT
            : 0.0;
    }
}
