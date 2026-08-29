<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Order;
use App\Support\Money;

/**
 * Computes VAT on an amount. The rate is looked up by shipping country from
 * config/shop.php, falling back to the default rate.
 *
 * Note: this service is handed the ALREADY-DISCOUNTED amount by
 * PriceCalculator. It does not know about discounts and must not — it only
 * applies a rate to whatever base it receives.
 */
class TaxService
{
    public function taxFor(Order $order, Money $base): Money
    {
        $rates = config('shop.tax_rates', []);
        $country = $order->shipping_country ?? config('shop.default_country');
        $rate = $rates[$country] ?? config('shop.default_tax_rate');

        return $base->percentage((float) $rate);
    }
}
