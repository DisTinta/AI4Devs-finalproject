<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Facades\Pricing;
use App\Http\Requests\StoreOrderRequest;
use App\Models\Order;
use Illuminate\Http\JsonResponse;

/**
 * Creates an order from a validated checkout request. Creating the order fires
 * the OrderObserver (job + event), and the response total comes from the
 * Pricing facade.
 */
class CheckoutController extends Controller
{
    public function store(StoreOrderRequest $request): JsonResponse
    {
        $order = Order::create($request->validated());

        foreach ($request->lines() as $line) {
            $order->lines()->create($line);
        }

        $order->refresh();

        return response()->json([
            'id' => $order->id,
            'total' => Pricing::compute($order)->amount(),
        ], 201);
    }
}
