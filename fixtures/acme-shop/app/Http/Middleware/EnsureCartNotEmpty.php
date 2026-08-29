<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rejects a checkout whose payload carries no line items before it reaches the
 * controller.
 */
class EnsureCartNotEmpty
{
    public function handle(Request $request, Closure $next): Response
    {
        $lines = $request->input('lines', []);

        if (! is_array($lines) || count($lines) === 0) {
            return response()->json([
                'error' => ['code' => 'EMPTY_CART', 'message' => 'Cart has no items'],
            ], 422);
        }

        return $next($request);
    }
}
