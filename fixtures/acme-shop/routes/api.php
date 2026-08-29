<?php

declare(strict_types=1);

use App\Http\Controllers\OrderController;
use Illuminate\Support\Facades\Route;

/*
 * API routes. These use the modern array form, which IS statically resolvable —
 * the contrast with the string action in web.php is intentional so the fixture
 * exercises both exact and heuristic route edges.
 */

Route::get('/orders', [OrderController::class, 'index'])->name('orders.index');
Route::get('/orders/{order}', [OrderController::class, 'show'])->name('orders.show');
