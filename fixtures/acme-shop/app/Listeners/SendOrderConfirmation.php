<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\OrderPlaced;
use App\Facades\Pricing;
use Illuminate\Support\Facades\Log;

/**
 * Sends the order confirmation. Uses the Pricing facade to render the final
 * total — another facade call site for the analyzer to resolve heuristically.
 */
class SendOrderConfirmation
{
    public function handle(OrderPlaced $event): void
    {
        $total = Pricing::compute($event->order);

        Log::info('order.confirmation', [
            'order_id' => $event->order->id,
            'total' => $total->amount(),
        ]);
    }
}
