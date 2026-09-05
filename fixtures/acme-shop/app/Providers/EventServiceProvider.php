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
