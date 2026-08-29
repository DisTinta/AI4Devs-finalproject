<?php

declare(strict_types=1);

namespace App\Facades;

use App\Support\Money;
use Illuminate\Support\Facades\Facade;

/**
 * Facade over PriceCalculator.
 *
 * ANALYZER TRAP (facade): callers write Pricing::compute($order). The call
 * resolves through Facade::__callStatic to the 'pricing' binding registered in
 * AppServiceProvider. There is no static link from Pricing::compute to
 * PriceCalculator::compute — the analyzer can only reach it heuristically, via
 * the getFacadeAccessor string and the container binding.
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
