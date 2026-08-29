<?php

declare(strict_types=1);

/*
 * Application configuration.
 *
 * fixture-secret: the APP_KEY default below is a PLANTED, obviously-fake secret.
 * In a real Laravel app this is read from env(APP_KEY) and never hardcoded. It
 * is here so the harness secret scanner (gitleaks / HU1) has exactly one thing
 * to detect and redact in this repository. It is not a real key and must never
 * be used. See fixtures/README.md → "Planted secret".
 */

return [
    'name' => env('APP_NAME', 'acme-shop'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => 'UTC',
    'locale' => 'en',

    // pragma: allowlist secret (fixture) — NOT a real key.
    'key' => env('APP_KEY', 'base64:FAKEfixtureKEYdo0not0use2H8xQ2eZvKYlo2C0abcdEFGhij=='),
    'cipher' => 'AES-256-CBC',

    'providers' => [
        App\Providers\AppServiceProvider::class,
        App\Providers\EventServiceProvider::class,
    ],
];
