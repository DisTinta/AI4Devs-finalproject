<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\Order;
use App\Observers\OrderObserver;
use App\Services\CarrierGateway;
use App\Services\CouponValidator;
use App\Services\DiscountService;
use App\Services\PriceCalculator;
use App\Services\ShippingService;
use App\Services\TaxService;
use Illuminate\Support\ServiceProvider;

/**
 * Container bindings.
 *
 * ANALYZER TRAP (container resolution): 'pricing' is bound to a closure that
 * builds PriceCalculator. Anything that resolves app('pricing') or the Pricing
 * facade reaches PriceCalculator only through this string key. The wiring of
 * DiscountService -> CouponValidator and ShippingService -> CarrierGateway also
 * lives here as closures, so those construction edges are not visible to a
 * syntactic pass over the call sites.
 */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(CarrierGateway::class, fn () => new CarrierGateway());
        $this->app->singleton(CouponValidator::class, fn () => new CouponValidator());
        $this->app->singleton(TaxService::class, fn () => new TaxService());

        $this->app->singleton(
            DiscountService::class,
            fn ($app) => new DiscountService($app->make(CouponValidator::class)),
        );

        $this->app->singleton(
            ShippingService::class,
            fn ($app) => new ShippingService($app->make(CarrierGateway::class)),
        );

        // String-keyed binding behind the Pricing facade.
        $this->app->singleton('pricing', fn ($app) => new PriceCalculator(
            $app->make(DiscountService::class),
            $app->make(TaxService::class),
            $app->make(ShippingService::class),
        ));
    }

    public function boot(): void
    {
        Order::observe(OrderObserver::class);
    }
}
