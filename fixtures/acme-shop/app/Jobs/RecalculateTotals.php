<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Facades\Pricing;
use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

/**
 * Recomputes and caches an order total off the request path.
 *
 * ANALYZER TRAP: this job is queued via RecalculateTotals::dispatch() in
 * OrderObserver. The edge from the dispatch call to handle() runs through the
 * queue, so it is not a direct call the analyzer can mark exact. handle() also
 * goes through the Pricing facade.
 */
class RecalculateTotals implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;

    public function __construct(private readonly Order $order)
    {
    }

    public function handle(): void
    {
        $total = Pricing::compute($this->order);

        Log::info('order.totals.recalculated', [
            'order_id' => $this->order->id,
            'total' => $total->amount(),
        ]);
    }
}
