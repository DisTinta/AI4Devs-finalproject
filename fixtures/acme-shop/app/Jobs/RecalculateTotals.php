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
 * Dispatched by OrderObserver; runs asynchronously through the queue worker.
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
