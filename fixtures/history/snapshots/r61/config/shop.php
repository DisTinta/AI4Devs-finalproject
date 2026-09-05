<?php

declare(strict_types=1);

/*
 * Shop pricing configuration.
 */

return [
    'default_country' => 'ES',
    'default_tax_rate' => 21.0,

    // VAT rate by destination country (percent).
    'tax_rates' => [
        'ES' => 21.0,
        'PT' => 23.0,
        'FR' => 20.0,
        'DE' => 19.0,
    ],

    // Orders above this (discounted) amount ship free.
    'free_shipping_threshold' => 50.00,

    // Flat shipping fee in cents, by country, with a fallback.
    'default_shipping_cents' => 590,
    'shipping_rates' => [
        'ES' => 490,
        'PT' => 590,
        'FR' => 690,
        'DE' => 690,
    ],
];
