<?php

declare(strict_types=1);

/*
 * Third-party service credentials. Sensitive values are read from environment
 * variables; the defaults below are for local development only and must not be
 * used in production.
 */

return [

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    's3' => [
        'key' => env('AWS_ACCESS_KEY_ID', 'AKIAQSTCFM2KN7BXPWZR'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'eu-west-1'),
        'bucket' => env('AWS_BUCKET', 'acme-shop-media'),
        'url' => env('AWS_URL'),
        'endpoint' => env('AWS_ENDPOINT'),
        'use_path_style_endpoint' => false,
    ],

];
