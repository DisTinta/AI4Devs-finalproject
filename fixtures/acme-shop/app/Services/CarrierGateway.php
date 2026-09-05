<?php

declare(strict_types=1);

namespace App\Services;

use BadMethodCallException;

/**
 * Thin proxy to shipping carriers.
 *
 * Rate methods such as flatRateFor() are not declared; they are handled by
 * __call, which maps the method name to a config-driven carrier rate.
 *
 * @method int flatRateFor(?string $country)
 */
class CarrierGateway
{
    /** @param array<int, mixed> $arguments */
    public function __call(string $name, array $arguments): mixed
    {
        if (str_starts_with($name, 'flatRateFor')) {
            $country = $arguments[0] ?? config('shop.default_country');
            $rates = config('shop.shipping_rates', []);

            return $rates[$country] ?? config('shop.default_shipping_cents');
        }

        throw new BadMethodCallException("Unknown carrier method: {$name}");
    }
}
