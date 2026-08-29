<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A sellable product. Price is stored in minor units.
 *
 * @property int $price_cents
 * @property bool $taxable
 */
class Product extends Model
{
    use HasFactory;

    protected $fillable = ['sku', 'name', 'price_cents', 'taxable'];

    protected $casts = [
        'price_cents' => 'integer',
        'taxable' => 'boolean',
    ];

    public function price(): Money
    {
        return Money::fromCents($this->price_cents);
    }
}
