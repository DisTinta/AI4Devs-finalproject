<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;

/**
 * Immutable money value object stored as integer minor units (cents) to avoid
 * floating-point drift in pricing. Every arithmetic method returns a new
 * instance. Currency mixing is rejected.
 */
final class Money
{
    private function __construct(
        public readonly int $cents,
        public readonly string $currency = 'EUR',
    ) {
    }

    public static function fromCents(int $cents, string $currency = 'EUR'): self
    {
        return new self($cents, $currency);
    }

    public static function fromFloat(float $amount, string $currency = 'EUR'): self
    {
        return new self((int) round($amount * 100), $currency);
    }

    public static function zero(string $currency = 'EUR'): self
    {
        return new self(0, $currency);
    }

    public function add(Money $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->cents + $other->cents, $this->currency);
    }

    public function subtract(Money $other): self
    {
        $this->assertSameCurrency($other);

        return new self(max(0, $this->cents - $other->cents), $this->currency);
    }

    /** Percentage of this amount, rounded half-up to the nearest cent. */
    public function percentage(float $percent): self
    {
        return new self((int) round($this->cents * $percent / 100), $this->currency);
    }

    public function isGreaterThan(Money $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->cents > $other->cents;
    }

    public function amount(): float
    {
        return $this->cents / 100;
    }

    private function assertSameCurrency(Money $other): void
    {
        if ($other->currency !== $this->currency) {
            throw new InvalidArgumentException('Cannot operate on mixed currencies');
        }
    }
}
