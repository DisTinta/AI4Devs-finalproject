<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Order;
use App\Services\TaxService;
use App\Support\Money;
use Tests\TestCase;

/**
 * Tax is a flat rate over whatever base it is handed. The rate is resolved by
 * shipping country from config, with a default fallback.
 */
class TaxServiceTest extends TestCase
{
    public function test_uses_country_rate_when_available(): void
    {
        config(['shop.tax_rates' => ['PT' => 23.0], 'shop.default_tax_rate' => 21.0]);
        $order = new Order(['shipping_country' => 'PT']);

        $tax = (new TaxService())->taxFor($order, Money::fromCents(10000));

        $this->assertSame(2300, $tax->cents);
    }

    public function test_falls_back_to_default_rate_for_unknown_country(): void
    {
        config(['shop.tax_rates' => [], 'shop.default_tax_rate' => 21.0, 'shop.default_country' => 'ES']);
        $order = new Order(['shipping_country' => 'XX']);

        $tax = (new TaxService())->taxFor($order, Money::fromCents(10000));

        $this->assertSame(2100, $tax->cents);
    }
}
