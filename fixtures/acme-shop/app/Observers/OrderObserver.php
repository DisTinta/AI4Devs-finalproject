<?php

declare(strict_types=1);

namespace App\Observers;

use App\Events\OrderPlaced;
use App\Jobs\RecalculateTotals;
use App\Models\Order;

/**
 * Reacts to order lifecycle events.
 */
class OrderObserver
{
    public function created(Order $order): void
    {
        RecalculateTotals::dispatch($order);
        event(new OrderPlaced($order));
    }

    public function updated(Order $order): void
    {
        if ($order->wasChanged('status') && $order->status === 'paid') {
            RecalculateTotals::dispatch($order);
        }
    }
}
