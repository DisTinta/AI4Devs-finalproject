<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single line of an order: a product, a quantity and the unit price captured
 * at the time of purchase (so later price changes do not rewrite history).
 *
 * @property int $quantity
 * @property int $unit_price_cents
 */
class OrderLine extends Model
{
    protected $fillable = ['order_id', 'product_id', 'quantity', 'unit_price_cents'];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price_cents' => 'integer',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function lineTotal(): Money
    {
        return Money::fromCents($this->unit_price_cents * $this->quantity);
    }
}
