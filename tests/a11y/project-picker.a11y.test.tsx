import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { routes } from '../../packages/web/src/router';

// Accessibility of Screen 1 in both API states and of the app's error screen (project-picker,
// "Accessibility of Screen 1 and of the error screen"; DIS-60 design D13). The gate of
// `smoke.a11y.test.tsx` scans `/` with whatever the real `fetch` does; this file pins each state with a
// `fetch` double, and reaches the error screen, which no URL leads to. Run by `npm run test:a11y`.

/** The ids of the rules axe found violated, for a readable failure. */
function violatedRules(results: axe.AxeResults): string[] {
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** Renders the given route table in a memory router at `path`. */
function renderAt(table: RouteObject[], path: string): ReturnType<typeof render> {
  return render(<RouterProvider router={createMemoryRouter(table, { initialEntries: [path] })} />);
}

/** A route element that throws while it renders. */
function Boom(): never {
  throw new Error('boom');
}

/** The web client's routes with one more test-only child, under the same root, whose element throws. */
function routesWithBoom(): RouteObject[] {
  const [root, ...others] = routes;
  if (root.index === true) {
    throw new Error('the root route of the web client is expected to hold the screens as children');
  }
  return [{ ...root, children: [...(root.children ?? []), { path: '/test-only-boom', element: <Boom /> }] }, ...others];
}

let consoleError: MockInstance | undefined;

beforeEach(() => {
  // The document as index.html declares it.
  document.documentElement.lang = 'es';
  document.title = 'CODEMIND';
});

afterEach(() => {
  consoleError?.mockRestore();
  consoleError = undefined;
  vi.unstubAllGlobals();
});

describe('Accessibility of Screen 1 and of the error screen', () => {
  it('Screen 1 has no axe violations with the API available or unavailable', async () => {
    // Arrange
    const available = vi.fn(() => Promise.resolve(new Response('{"status":"ok"}', { status: 200 })));
    const unavailable = vi.fn(() => Promise.reject(new TypeError('fetch failed')));

    // Act
    vi.stubGlobal('fetch', available);
    const first = renderAt(routes, '/');
    // Two cards (DIS-32): the badge is shown once per sample project.
    await screen.findAllByText('listo');
    const withApiAvailable = violatedRules(await axe.run(document));
    first.unmount();

    vi.stubGlobal('fetch', unavailable);
    renderAt(routes, '/');
    await screen.findByRole('alert');
    const withApiUnavailable = violatedRules(await axe.run(document));

    // Assert
    expect({ withApiAvailable, withApiUnavailable }).toEqual({ withApiAvailable: [], withApiUnavailable: [] });
  });

  it('The error screen has no axe violations', async () => {
    // Arrange: React and React Router log the caught render error; this test only (design D21).
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    renderAt(routesWithBoom(), '/test-only-boom');
    await screen.findByRole('heading', { level: 1, name: 'Algo ha fallado' });
    const violations = violatedRules(await axe.run(document));

    // Assert
    expect(violations).toEqual([]);
  });
});
