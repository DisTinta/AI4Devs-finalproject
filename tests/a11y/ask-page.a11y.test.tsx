import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_PROJECTS } from '../../packages/web/src/data/sample-projects';
import { routes } from '../../packages/web/src/router';

// Accessibility of Screen 2 in each of its states (ask-page, "Accessibility of Screen 2"; DIS-65 design
// D18, D20, D25). The gate of `smoke.a11y.test.tsx` scans `/p/<id>` before any question; this file pins
// every later state with its own `fetch` double. Run by `npm run test:a11y`.

/** The path of Screen 2 of acme-shop. */
const SCREEN_2 = `/p/${SAMPLE_PROJECTS[0].id}`;

/** The first suggested question of acme-shop. */
const Q1 = '¿Cómo se calcula el precio final de un pedido?';

/** The answered question of "An answered question shows the answer, its statements and its evidence". */
const ANSWERED = {
  answer: 'El precio final se calcula en `PriceCalculator::compute()`.',
  statements: [
    { text: '`compute()` aplica el descuento antes del impuesto.', type: 'FACT', verification: 'entailed', evidenceIds: ['ev-1'] },
    { text: 'El envío se suma al final.', type: 'INFERENCE', verification: 'cited', evidenceIds: ['ev-1', 'ev-2'] },
  ],
  evidence: [
    {
      id: 'ev-1',
      file: 'app/Services/PriceCalculator.php',
      startLine: 16,
      endLine: 44,
      excerpt: 'class PriceCalculator\n{\n    public function compute(Order $order): float\n}',
    },
    {
      id: 'ev-2',
      file: 'app/Services/ShippingService.php',
      startLine: 12,
      endLine: 12,
      excerpt: '        return $order->shippingCost();',
    },
  ],
  confidence: 0.71,
  usage: {
    inputTokens: 4000,
    outputTokens: 812,
    baselineTokens: 41200,
    baselineEstimator: 'chars-div-4',
    savingsPct: 88,
    costUsd: 0.014,
    latencyMs: 2100,
    cacheHit: false,
    generation: { inputTokens: 3000, outputTokens: 600, costUsd: 0.01 },
    verification: { calls: 2, cacheHits: 0, inputTokens: 1000, outputTokens: 212, costUsd: 0.004, latencyMs: 700 },
  },
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

/**
 * Renders Screen 2 of acme-shop with `fetch` replaced by `double`, brings it to a state with `reach`, and
 * runs axe over the whole document.
 *
 * @returns The violated rules.
 */
async function scan(
  double: () => Promise<Response>,
  reach: (user: ReturnType<typeof userEvent.setup>) => Promise<unknown>,
): Promise<string[]> {
  vi.stubGlobal('fetch', double);
  const user = userEvent.setup();
  const { unmount } = render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [SCREEN_2] })} />);
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

describe('Accessibility of Screen 2', () => {
  it('Screen 2 has no axe violations in any of its states', async () => {
    // Arrange
    const pressQ1 = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
      await user.click(screen.getByRole('button', { name: Q1 }));
    };

    // Act
    const pending = await scan(neverAnswering, async (user) => {
      await pressQ1(user);
      await screen.findByRole('status');
    });
    const answeredWithEvidence = await scan(answering(200, ANSWERED), async (user) => {
      await pressQ1(user);
      await user.click(await screen.findByRole('button', { name: 'ev-1 · app/Services/PriceCalculator.php:16-44' }));
      await screen.findByText(/class PriceCalculator/);
    });
    const invalidQuestion = await scan(neverAnswering, async (user) => {
      await user.type(screen.getByRole('textbox', { name: 'Pregunta' }), 'hola{Enter}');
      await screen.findByRole('alert');
    });
    const unknownStatus = await scan(
      answering(200, { answer: 'UNKNOWN', reason: 'no-anchor', statements: [], evidence: [] }),
      async (user) => {
        await pressQ1(user);
        await screen.findByText('Sin respuesta verificada (motivo: no-anchor).');
      },
    );
    const errorAlert = await scan(
      answering(429, { error: { code: 'BUDGET_EXHAUSTED', message: 'the daily LLM budget is exhausted', details: {} } }),
      async (user) => {
        await pressQ1(user);
        await screen.findByRole('alert');
      },
    );

    // Assert
    expect({ pending, answeredWithEvidence, invalidQuestion, unknownStatus, errorAlert }).toEqual({
      pending: [],
      answeredWithEvidence: [],
      invalidQuestion: [],
      unknownStatus: [],
      errorAlert: [],
    });
  });
});
