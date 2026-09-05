<?php

declare(strict_types=1);

/*
 * Application configuration.
 */

return [
    'name' => env('APP_NAME', 'acme-shop'),
    'env' => env('APP_ENV', 'production'),
    'debug' => (bool) env('APP_DEBUG', false),
    'url' => env('APP_URL', 'http://localhost'),
    'timezone' => 'UTC',
    'locale' => 'en',

    'key' => env('APP_KEY', 'base64:dGVzdGtleWZvcmxvY2FsZGV2ZW9ubHlkb25vdHVzZWluZXByb2Q='),
    'cipher' => 'AES-256-CBC',

    'providers' => [
        App\Providers\AppServiceProvider::class,
        App\Providers\EventServiceProvider::class,
    ],
];
