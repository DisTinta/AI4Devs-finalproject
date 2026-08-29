<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Exercises the checkout endpoint end to end: validation, order creation (which
 * fires the OrderObserver), and the total in the response.
 */
class CheckoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_creates_order_and_returns_total(): void
    {
        $customer = Customer::factory()->create(['loyalty_tier' => 'standard', 'country' => 'ES']);
        $product = Product::factory()->create(['price_cents' => 2000]);

        $response = $this->postJson('/checkout', [
            'customer_id' => $customer->id,
            'shipping_country' => 'ES',
            'lines' => [
                ['product_id' => $product->id, 'quantity' => 1, 'unit_price_cents' => 2000],
            ],
        ]);

        $response->assertCreated();
        $this->assertArrayHasKey('total', $response->json());
    }

    public function test_checkout_rejects_empty_cart(): void
    {
        $customer = Customer::factory()->create();

        $response = $this->postJson('/checkout', [
            'customer_id' => $customer->id,
            'shipping_country' => 'ES',
            'lines' => [],
        ]);

        $response->assertStatus(422);
    }
}
