<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Coupon;
use Illuminate\Support\Carbon;

/**
 * Validates a coupon code and returns the percentage it grants, or 0 when the
 * code is missing, unknown, inactive or expired.
 */
class CouponValidator
{
    public function percentFor(?string $code): float
    {
        if ($code === null || $code === '') {
            return 0.0;
        }

        $coupon = Coupon::query()->find($code);

        if (! $coupon instanceof Coupon || ! $coupon->active) {
            return 0.0;
        }

        if ($coupon->expires_at !== null && $coupon->expires_at->isPast()) {
            return 0.0;
        }

        return $coupon->percent_off;
    }

    public function isRedeemable(?string $code): bool
    {
        return $this->percentFor($code) > 0.0;
    }
}
