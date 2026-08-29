<?php

declare(strict_types=1);

namespace App\Events;

use App\Models\Order;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Fired when an order is first created. Carries the order so listeners can act
 * without another lookup.
 */
class OrderPlaced
{
    use Dispatchable;

    public function __construct(public readonly Order $order)
    {
    }
}
