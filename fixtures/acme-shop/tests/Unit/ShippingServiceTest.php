<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Order;
use App\Services\CarrierGateway;
use App\Services\ShippingService;
use App\Support\Money;
use Tests\TestCase;

/**
 * Shipping is free above the configured threshold, otherwise a flat per-country
 * rate fetched through the CarrierGateway proxy.
 */
class ShippingServiceTest extends TestCase
{
    public function test_free_above_threshold(): void
    {
        config(['shop.free_shipping_threshold' => 75.00]);
        $order = new Order(['shipping_country' => 'ES']);

        $cost = (new ShippingService(new CarrierGateway()))->shippingFor($order, Money::fromFloat(80.00));

        $this->assertSame(0, $cost->cents);
    }

    public function test_flat_rate_below_threshold(): void
    {
        config([
            'shop.free_shipping_threshold' => 75.00,
            'shop.shipping_rates' => ['ES' => 490],
            'shop.default_shipping_cents' => 590,
        ]);
        $order = new Order(['shipping_country' => 'ES']);

        $cost = (new ShippingService(new CarrierGateway()))->shippingFor($order, Money::fromFloat(40.00));

        $this->assertSame(490, $cost->cents);
    }
}
