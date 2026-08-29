<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Order;
use App\Services\DiscountService;
use App\Services\PriceCalculator;
use App\Services\ShippingService;
use App\Services\TaxService;
use App\Support\Money;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Pins down THE reference behaviour: the discount is applied to the subtotal
 * BEFORE tax, and tax is computed on the discounted base. The assertion that
 * taxFor() receives (subtotal - discount) is what encodes the ordering.
 */
class PriceCalculatorTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_discount_is_applied_before_tax(): void
    {
        $subtotal = Money::fromCents(10000);   // €100.00
        $discount = Money::fromCents(1000);    // €10.00
        $discountedBase = Money::fromCents(9000);

        $order = Mockery::mock(Order::class);
        $order->subtotal = $subtotal;

        $discounts = Mockery::mock(DiscountService::class);
        $discounts->shouldReceive('discountFor')->once()->andReturn($discount);

        $taxes = Mockery::mock(TaxService::class);
        // The heart of the test: tax is asked about the DISCOUNTED base, not the subtotal.
        $taxes->shouldReceive('taxFor')
            ->once()
            ->with($order, Mockery::on(fn (Money $m) => $m->cents === $discountedBase->cents))
            ->andReturn(Money::fromCents(1890)); // 21% of 9000

        $shipping = Mockery::mock(ShippingService::class);
        $shipping->shouldReceive('shippingFor')->once()->andReturn(Money::zero());

        $calculator = new PriceCalculator($discounts, $taxes, $shipping);
        $total = $calculator->compute($order);

        // 9000 + 1890 + 0
        $this->assertSame(10890, $total->cents);
    }
}
