<?php

declare(strict_types=1);

namespace App\Observers;

use App\Events\OrderPlaced;
use App\Jobs\RecalculateTotals;
use App\Models\Order;

/**
 * Reacts to order lifecycle events.
 *
 * ANALYZER TRAPS:
 *  - dispatch of a Job: RecalculateTotals::dispatch($order) queues work; the
 *    edge to RecalculateTotals::handle is indirect (through the queue).
 *  - event dispatch: event(new OrderPlaced($order)) reaches SendOrderConfirmation
 *    only via the EventServiceProvider map.
 *
 * Observers themselves are also registered dynamically (Order::observe in
 * AppServiceProvider::boot), so even this class is wired heuristically.
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
