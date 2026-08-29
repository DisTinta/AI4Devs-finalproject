<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A customer. The loyalty tier drives the customer discount in DiscountService.
 *
 * @property string $loyalty_tier  one of: standard, silver, gold
 * @property string $country
 */
class Customer extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'email', 'loyalty_tier', 'country'];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function isLoyal(): bool
    {
        return in_array($this->loyalty_tier, ['silver', 'gold'], true);
    }
}
