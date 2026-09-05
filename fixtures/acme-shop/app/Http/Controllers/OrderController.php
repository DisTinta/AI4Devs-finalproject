<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Facades\Pricing;
use App\Models\Order;
use Illuminate\Http\JsonResponse;

/**
 * Read endpoints for orders. Uses the Pricing facade to render totals.
 */
class OrderController extends Controller
{
    public function show(Order $order): JsonResponse
    {
        $total = Pricing::compute($order);

        return response()->json([
            'id' => $order->id,
            'status' => $order->status,
            'subtotal' => $order->subtotal->amount(),
            'total' => $total->amount(),
        ]);
    }

    public function index(): JsonResponse
    {
        $orders = Order::query()->latest()->limit(20)->get();

        return response()->json([
            'orders' => $orders->map(fn (Order $order) => [
                'id' => $order->id,
                'total' => Pricing::compute($order)->amount(),
            ]),
        ]);
    }
}
