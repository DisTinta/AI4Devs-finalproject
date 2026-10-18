import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { routes } from '../router';

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

afterEach(() => {
  consoleError?.mockRestore();
  consoleError = undefined;
});

describe('App error screen', () => {
  it('A route that fails to render shows the app\'s error screen', async () => {
    // Arrange: React and React Router log the caught render error; this test only (design D21).
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Act
    render(
      <RouterProvider router={createMemoryRouter(routesWithBoom(), { initialEntries: ['/test-only-boom'] })} />,
    );
    const heading = await screen.findByRole('heading', { level: 1 });

    // Assert
    expect(within(screen.getByRole('banner')).getByText('CODEMIND')).toBeDefined();
    expect(heading.textContent).toBe('Algo ha fallado');
    expect(screen.getByRole('main').contains(heading)).toBe(true);
    expect(
      screen.getByText('La pantalla no se ha podido mostrar. Recarga la página o vuelve a la selección de proyecto.'),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Volver a la selección de proyecto' }).getAttribute('href')).toBe('/');
    expect(screen.queryByText(/boom/)).toBeNull();
  });
});
