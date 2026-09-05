<?php

declare(strict_types=1);

namespace App\Facades;

use App\Support\Money;
use Illuminate\Support\Facades\Facade;

/**
 * Facade over PriceCalculator. Callers write Pricing::compute($order); the
 * call resolves through Facade::__callStatic to the 'pricing' binding
 * registered in AppServiceProvider.
 *
 * @method static Money compute(\App\Models\Order $order)
 * @method static Money taxableBase(\App\Models\Order $order)
 *
 * @see \App\Services\PriceCalculator
 */
class Pricing extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return 'pricing';
    }
}
