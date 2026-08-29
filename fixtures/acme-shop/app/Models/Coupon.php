<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A discount coupon. `percent_off` is applied to the order subtotal by
 * DiscountService when the coupon is valid.
 *
 * @property float $percent_off
 * @property string $code
 * @property bool $active
 */
class Coupon extends Model
{
    protected $primaryKey = 'code';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['code', 'percent_off', 'active', 'expires_at'];

    protected $casts = [
        'percent_off' => 'float',
        'active' => 'boolean',
        'expires_at' => 'datetime',
    ];
}
