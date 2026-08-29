<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Order;
use App\Support\Money;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Fired by DiscountService whenever a non-zero discount is applied to an order.
 * RecordDiscountAudit listens for it (see EventServiceProvider).
 */
class DiscountApplied
{
    use Dispatchable;

    public function __construct(
        public readonly Order $order,
        public readonly Money $amount,
    ) {
    }
}
