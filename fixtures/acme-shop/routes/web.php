<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

/*
 * Web routes.
 */

Route::get('/', fn () => view('welcome'));

Route::post('/checkout', 'App\Http\Controllers\CheckoutController@store')
    ->middleware('cart.not_empty')
    ->name('checkout.store');
