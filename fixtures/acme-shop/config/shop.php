<?php

declare(strict_types=1);

/*
 * Shop pricing configuration.
 *
 * NOTE ON DRIFT: free_shipping_threshold was raised from 50.00 to 75.00. The
 * code reads this value, but docs/pricing.md still documents the old 50.00
 * threshold. See fixtures/README.md → planted drift.
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
    'free_shipping_threshold' => 75.00,

    // Flat shipping fee in cents, by country, with a fallback.
    'default_shipping_cents' => 590,
    'shipping_rates' => [
        'ES' => 490,
        'PT' => 590,
        'FR' => 690,
        'DE' => 690,
    ],
];
