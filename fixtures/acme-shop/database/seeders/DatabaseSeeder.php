<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Customer::query()->create([
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.test',
            'loyalty_tier' => 'gold',
            'country' => 'ES',
        ]);

        Product::query()->insert([
            ['sku' => 'SKU-001', 'name' => 'Widget', 'price_cents' => 1500, 'taxable' => true],
            ['sku' => 'SKU-002', 'name' => 'Gadget', 'price_cents' => 3200, 'taxable' => true],
            ['sku' => 'SKU-003', 'name' => 'Gizmo', 'price_cents' => 800, 'taxable' => true],
        ]);

        Coupon::query()->create([
            'code' => 'WELCOME10',
            'percent_off' => 10.0,
            'active' => true,
            'expires_at' => null,
        ]);
    }
}
