<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Facades\Pricing;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * End-to-end pricing over a real (seeded) order. This is the coverage behind the
 * demo answer to "how is the final price of an order computed?": subtotal ->
 * discount -> tax on discounted base -> shipping.
 *
 * Worked example (gold customer, ES, no coupon, 2 lines):
 *   subtotal        = 1500*2 + 3200*1        = 6200
 *   discount (10%)  = 620                     -> loyalty gold, no volume bonus
 *   taxable         = 5580
 *   tax (21% ES)    = 1172
 *   shipping        = 490 (55.80 < 75.00 free threshold)
 *   total           = 5580 + 1172 + 490      = 7242  (€72.42)
 */
class OrderPricingTest extends TestCase
{
    use RefreshDatabase;

    public function test_final_price_applies_discount_before_tax(): void
    {
        config(['shop.free_shipping_threshold' => 75.00, 'shop.shipping_rates' => ['ES' => 490]]);

        $customer = Customer::factory()->create(['loyalty_tier' => 'gold', 'country' => 'ES']);
        $widget = Product::factory()->create(['price_cents' => 1500]);
        $gadget = Product::factory()->create(['price_cents' => 3200]);

        $order = Order::factory()->create([
            'customer_id' => $customer->id,
            'shipping_country' => 'ES',
        ]);
        $order->lines()->create(['product_id' => $widget->id, 'quantity' => 2, 'unit_price_cents' => 1500]);
        $order->lines()->create(['product_id' => $gadget->id, 'quantity' => 1, 'unit_price_cents' => 3200]);
        $order->refresh();

        $total = Pricing::compute($order);

        $this->assertSame(7242, $total->cents);
        $this->assertEqualsWithDelta(72.42, $total->amount(), 0.001);
    }
}
