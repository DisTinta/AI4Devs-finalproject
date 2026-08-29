<?php

declare(strict_types=1);

namespace App\Providers;

use App\Events\DiscountApplied;
use App\Events\OrderPlaced;
use App\Listeners\SendOrderConfirmation;
use App\Listeners\RecordDiscountAudit;
use Illuminate\Foundation\Support\Providers\EventServiceProvider as ServiceProvider;

/**
 * Event -> listener map.
 *
 * ANALYZER TRAP (event dispatch): the edges from OrderPlaced to
 * SendOrderConfirmation and from DiscountApplied to RecordDiscountAudit exist
 * ONLY as entries in this array. The code that fires the events (event(new ...))
 * never names the listener, so a static analyzer must read this map to connect
 * them — a heuristic, framework-specific step.
 *
 * @var array<class-string, array<int, class-string>>
 */
class EventServiceProvider extends ServiceProvider
{
    protected $listen = [
        OrderPlaced::class => [
            SendOrderConfirmation::class,
        ],
        DiscountApplied::class => [
            RecordDiscountAudit::class,
        ],
    ];
}
