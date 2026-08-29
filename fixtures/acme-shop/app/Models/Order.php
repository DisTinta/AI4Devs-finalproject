<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An order.
 *
 * ANALYZER TRAP (Eloquent magic attributes): properties like $order->customer,
 * $order->lines and $order->subtotal are never declared. They are resolved at
 * runtime by Eloquent's __get over relationships and accessors. A static
 * analyzer sees no property and no return type here — any edge into these is
 * heuristic at best.
 *
 * @property-read \Illuminate\Database\Eloquent\Collection<int, OrderLine> $lines
 * @property-read Customer $customer
 */
class Order extends Model
{
    use HasFactory;

    protected $fillable = ['customer_id', 'status', 'coupon_code', 'shipping_country'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(OrderLine::class);
    }

    public function coupon(): BelongsTo
    {
        // Resolved by string column, not by id — the coupon_code magic attribute.
        return $this->belongsTo(Coupon::class, 'coupon_code', 'code');
    }

    /**
     * Accessor exposed as $order->subtotal. Sums the order lines. Because this is
     * a magic accessor, callers reference a property the analyzer cannot see.
     */
    public function getSubtotalAttribute(): Money
    {
        return $this->lines->reduce(
            fn (Money $carry, OrderLine $line) => $carry->add($line->lineTotal()),
            Money::zero(),
        );
    }

    public function lineCount(): int
    {
        return $this->lines->count();
    }
}
