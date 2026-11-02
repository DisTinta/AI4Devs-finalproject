import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_PROJECTS } from '../../packages/web/src/data/sample-projects';
import { routes } from '../../packages/web/src/router';

// Accessibility of Screen 3 in each of its states (impact-page, "Accessibility of Screen 3"; DIS-14 design
// D16). The gate of `smoke.a11y.test.tsx` scans `/p/<id>/impact` before any send; this file pins every later
// state with its own `fetch` double. axe in jsdom computes no styles, so it cannot report `color-contrast`:
// the contrast of each pair is fixed by design D15 and checked by hand in a real browser. Run by
// `npm run test:a11y`.

/** The path of Screen 3 of acme-shop. */
const SCREEN_3 = `/p/${SAMPLE_PROJECTS[0].id}/impact`;

/** The change of the walkthrough step 4. */
const CHANGE = 'cambiar los descuentos de DiscountService';

/** One component of `direct` or `indirect`. */
function component(symbol: string, file: string, hops: number, resolution: 'exact' | 'heuristic'): object {
  return { symbol, file, origin: 'graph', resolution, hops };
}

/** The Q2 report of `docs/DEMO.md` «Paso 4». */
const Q2 = {
  status: 'answered',
  direct: [
    component('DiscountApplied', 'app/Events/DiscountApplied.php', 0, 'exact'),
    component('DiscountService', 'app/Services/DiscountService.php', 0, 'exact'),
    component('RecordDiscountAudit', 'app/Listeners/RecordDiscountAudit.php', 0, 'exact'),
    component('PriceCalculator', 'app/Services/PriceCalculator.php', 1, 'exact'),
    component('app/Providers/AppServiceProvider.php', 'app/Providers/AppServiceProvider.php', 1, 'exact'),
    component('app/Providers/EventServiceProvider.php', 'app/Providers/EventServiceProvider.php', 1, 'exact'),
  ],
  indirect: [
    component('CheckoutController', 'app/Http/Controllers/CheckoutController.php', 2, 'heuristic'),
    component('OrderController', 'app/Http/Controllers/OrderController.php', 2, 'heuristic'),
    component('RecalculateTotals', 'app/Jobs/RecalculateTotals.php', 2, 'heuristic'),
    component('SendOrderConfirmation', 'app/Listeners/SendOrderConfirmation.php', 2, 'heuristic'),
  ],
  tests: [
    { symbol: 'DiscountServiceTest', file: 'tests/Unit/DiscountServiceTest.php', origin: 'graph' },
    { symbol: 'OrderPricingTest', file: 'tests/Feature/OrderPricingTest.php', origin: 'graph' },
    { symbol: 'PriceCalculatorTest', file: 'tests/Unit/PriceCalculatorTest.php', origin: 'graph' },
  ],
  docs: [{ path: 'README.md', stale: false }],
  history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 1, prs: [24, 33, 55], origin: 'git' }],
  risk: { level: 'HIGH', rationale: '10 ficheros afectados, 3 tests que cubren el cambio, 4 elementos directos sin test.' },
};

/** The ids of the rules axe found violated, for a readable failure. */
function violatedRules(results: axe.AxeResults): string[] {
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** A `fetch` double that answers every request with `status` and `body` as JSON. */
function answering(status: number, body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** A `fetch` double that never answers. */
function neverAnswering(): Promise<Response> {
  return new Promise(() => undefined);
}

/** The user of one scan. */
type User = ReturnType<typeof userEvent.setup>;

/** Writes `text` in the field «Cambio» and presses Enter. */
async function send(user: User, text: string): Promise<void> {
  await user.type(screen.getByRole('textbox', { name: 'Cambio' }), `${text}{Enter}`);
}

/**
 * Renders Screen 3 of acme-shop with `fetch` replaced by `double`, brings it to a state with `reach`, and
 * runs axe over the whole document.
 *
 * @returns The violated rules.
 */
async function scan(double: () => Promise<Response>, reach: (user: User) => Promise<unknown>): Promise<string[]> {
  vi.stubGlobal('fetch', double);
  const user = userEvent.setup();
  const { unmount } = render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [SCREEN_3] })} />);
  await screen.findByRole('heading', { level: 1, name: 'acme-shop' });
  await reach(user);
  const violations = violatedRules(await axe.run(document));
  unmount();
  return violations;
}

beforeEach(() => {
  // The document as index.html declares it.
  document.documentElement.lang = 'es';
  document.title = 'CODEMIND';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Accessibility of Screen 3', () => {
  it('Screen 3 has no axe violations in any of its states', async () => {
    // Arrange
    const staleReport = {
      ...Q2,
      indirect: [],
      docs: [{ path: 'docs/pricing.md', stale: true, staleSince: '0123456789abcdef0123456789abcdef01234567' }],
      history: [{ file: 'app/Services/ShippingService.php', coChangeRate: 0.8, prs: [], origin: 'git' }],
    };

    // Act
    const initial = await scan(neverAnswering, async () => undefined);
    const pending = await scan(neverAnswering, async (user) => {
      await send(user, CHANGE);
      await screen.findByText('Calculando impacto…', { selector: '[aria-hidden="true"]' });
    });
    const answered = await scan(answering(200, Q2), async (user) => {
      await send(user, CHANGE);
      await screen.findByRole('heading', { level: 2, name: 'Riesgo alto' });
    });
    const staleAndEmpty = await scan(answering(200, staleReport), async (user) => {
      await send(user, CHANGE);
      await screen.findByText('Sin elementos');
    });
    const invalidChange = await scan(neverAnswering, async (user) => {
      await send(user, 'hola');
      await screen.findByRole('alert');
    });
    const unknownStatus = await scan(answering(200, { status: 'unknown', reason: 'no-anchor' }), async (user) => {
      await send(user, 'mejorar el rendimiento general');
      await screen.findByRole('heading', { level: 2, name: 'Sin ancla en el grafo' });
    });
    const rateLimited = await scan(
      answering(429, { error: { code: 'RATE_LIMITED', message: 'too many requests', details: { retryAfterSeconds: 42 } } }),
      async (user) => {
        await send(user, CHANGE);
        await screen.findByRole('alert');
      },
    );
    const unavailableApi = await scan(
      () => Promise.reject(new TypeError('fetch failed')),
      async (user) => {
        await send(user, CHANGE);
        await screen.findByRole('alert');
      },
    );

    // Assert
    expect({ initial, pending, answered, staleAndEmpty, invalidChange, unknownStatus, rateLimited, unavailableApi }).toEqual({
      initial: [],
      pending: [],
      answered: [],
      staleAndEmpty: [],
      invalidChange: [],
      unknownStatus: [],
      rateLimited: [],
      unavailableApi: [],
    });
  });
});
