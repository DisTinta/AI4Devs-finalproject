<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Events\DiscountApplied;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderLine;
use App\Services\CouponValidator;
use App\Services\DiscountService;
use App\Support\Money;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Event;
use Mockery;
use Tests\TestCase;

/**
 * Covers the volume-bonus and cap rules of DiscountService.
 */
class DiscountServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function orderWith(string $tier, int $lineCount, ?string $coupon = null): Order
    {
        $order = new Order(['coupon_code' => $coupon, 'shipping_country' => 'ES']);
        $order->setRelation('customer', new Customer(['loyalty_tier' => $tier]));

        $lines = new Collection();
        for ($i = 0; $i < $lineCount; $i++) {
            $lines->push(new OrderLine(['quantity' => 1, 'unit_price_cents' => 100]));
        }
        $order->setRelation('lines', $lines);

        return $order;
    }

    public function test_volume_bonus_applies_above_five_lines(): void
    {
        Event::fake();
        $coupons = Mockery::mock(CouponValidator::class);
        $coupons->shouldReceive('percentFor')->andReturn(0.0);

        $service = new DiscountService($coupons);
        // standard customer, 6 lines => 0 loyalty + 0 coupon + 5% volume = 5%
        $discount = $service->discountFor($this->orderWith('standard', 6), Money::fromCents(10000));

        $this->assertSame(500, $discount->cents);
        Event::assertDispatched(DiscountApplied::class);
    }

    public function test_no_volume_bonus_at_or_below_five_lines(): void
    {
        Event::fake();
        $coupons = Mockery::mock(CouponValidator::class);
        $coupons->shouldReceive('percentFor')->andReturn(0.0);

        $service = new DiscountService($coupons);
        $discount = $service->discountFor($this->orderWith('standard', 5), Money::fromCents(10000));

        $this->assertSame(0, $discount->cents);
    }

    public function test_total_discount_is_capped_at_thirty_percent(): void
    {
        Event::fake();
        $coupons = Mockery::mock(CouponValidator::class);
        $coupons->shouldReceive('percentFor')->andReturn(25.0);

        $service = new DiscountService($coupons);
        // gold (10) + coupon (25) + volume (5) = 40% -> capped to 30%
        $discount = $service->discountFor($this->orderWith('gold', 6, 'BIG25'), Money::fromCents(10000));

        $this->assertSame(3000, $discount->cents);
    }
}
