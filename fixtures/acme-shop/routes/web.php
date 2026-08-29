<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * Web routes.
 *
 * ANALYZER TRAP (string-resolved route action): the checkout route below uses
 * the legacy 'Controller@method' STRING form instead of the [Class, 'method']
 * array form. A static analyzer cannot resolve 'CheckoutController@store' to the
 * concrete method without applying a Laravel-specific naming heuristic and
 * guessing the App\Http\Controllers namespace.
 */

Route::get('/', fn () => view('welcome'));

// String action — deliberately the old form.
Route::post('/checkout', 'App\Http\Controllers\CheckoutController@store')
    ->middleware('cart.not_empty')
    ->name('checkout.store');
