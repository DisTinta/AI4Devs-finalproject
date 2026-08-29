<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\DiscountApplied;
use Illuminate\Support\Facades\Log;

/**
 * Records every applied discount for later auditing. Kept side-effect only so
 * it never influences the price it observes.
 */
class RecordDiscountAudit
{
    public function handle(DiscountApplied $event): void
    {
        Log::info('discount.applied', [
            'order_id' => $event->order->id,
            'amount' => $event->amount->amount(),
        ]);
    }
}
